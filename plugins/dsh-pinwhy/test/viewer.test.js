import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { CliBridge } from '../src/bridge.js';
import { normalizeConfig } from '../src/config.js';
import { ViewerSessions, mountViewer } from '../src/viewer.js';
import { board, temporary } from './helpers.js';

const cli = process.env.PINWHY_TEST_CLI;
const exec = promisify(execFile);
const owner = { principal: { kind: 'owner' }, signal: new AbortController().signal };
const rpc = (path, method, payload) => new Request(`http://host.invalid${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'client-request', rpcId: 'viewer-test', method, payload }),
});
const invoke = async (route, method, payload) => (await (await route.fetch(rpc(route.path, method, payload))).json()).result;

/** Exact Fetch registration is per path; tests keep each route by the path it owns. */
function routeTable(ctx) {
  const routes = new Map();
  ctx.connection ??= {};
  ctx.connection.fetch = { register(value) { routes.set(value.path, value); return () => {}; } };
  return routes;
}

test('viewer API rejects invalid envelopes and arbitrary paths before starting a runtime', async () => {
  const effects = [];
  const ctx = {
    sessions: { get: () => undefined },
    effect: factory => { effects.push(factory()); },
    inject: () => {}, on: () => () => {}, get: () => undefined,
  };
  const routes = routeTable(ctx);
  mountViewer(ctx, () => normalizeConfig(), { runtime() { throw new Error('must not probe'); } });
  const open = routes.get('/api/pinwhy/viewer.open');
  const malformed = await open.fetch(new Request('http://host.invalid/api/pinwhy/viewer.open', { method: 'POST', body: '{}' }));
  assert.equal(malformed.status, 400);
  const invalid = await invoke(open, 'pinwhy/viewer.open', { sessionId: 's', cwd: '/elsewhere' });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'INVALID_ARGUMENT');
  const missing = await invoke(open, 'pinwhy/viewer.open', { sessionId: 'missing' });
  assert.equal(missing.error.code, 'SESSION_REQUIRED');
  for (const dispose of effects.reverse()) await dispose?.();
});

test('embedded viewer loads existing memory, streams external writes, isolates sessions and disposes listeners', { skip: !cli }, async t => {
  const root = await temporary(t);
  const project = `${root}/project`, other = `${root}/other`;
  await fs.mkdir(project); await fs.mkdir(other);
  const run = (dir, args) => exec(process.execPath, [cli, ...args, `--cwd=${dir}`, '--json'], { env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) } }).then(r => JSON.parse(r.stdout));
  for (const dir of [project, other]) await run(dir, ['init', '--here']);
  const node = (await run(project, ['node', 'add', 'fact', 'Existing memory', '--no-init'])).node;
  const before = await fs.readFile(`${project}/.pinwhy/config.json`);
  const config = normalizeConfig({ runtimeCli: cli, projects: [{ workspace: project }, { workspace: other }] });
  const bridge = new CliBridge(config);
  const sessions = new Map([['one', { id: 'one', header: { cwd: project } }], ['two', { id: 'two', header: { cwd: other } }]]);
  const viewers = new ViewerSessions(() => config, bridge, id => sessions.get(id));
  t.after(async () => { await viewers.dispose(); await bridge.dispose(); });
  const [first, duplicate] = await Promise.all([viewers.open('one', owner.signal), viewers.open('one', owner.signal)]);
  assert.equal(first.url, duplicate.url);
  const second = await viewers.open('two', owner.signal);
  assert.notEqual(first.url, second.url);
  const graph = await fetch(`${first.url}api/graph`).then(r => r.json());
  assert.equal(graph.nodes[node.id].title, 'Existing memory');
  assert.notEqual(graph.meta.writable, true);
  assert.equal(Object.keys((await fetch(`${second.url}api/graph`).then(r => r.json())).nodes).length, 0);
  assert.equal((await fetch(`${first.url}api/nodes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 403);
  const streamAbort = new AbortController();
  const stream = await fetch(`${first.url}events`, { signal: streamAbort.signal });
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  const changed = await run(project, ['node', 'add', 'observation', 'External CLI write', '--no-init']);
  let content = '';
  const deadline = setTimeout(() => streamAbort.abort(), 5000);
  try {
    while (!content.includes(changed.node.id)) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      content += decoder.decode(chunk.value, { stream: true });
    }
  } finally { clearTimeout(deadline); streamAbort.abort(); }
  assert.deepEqual(await fs.readFile(`${project}/.pinwhy/config.json`), before);
  await viewers.closeSession('one');
  await assert.rejects(fetch(`${first.url}api/graph`));
  assert.equal((await fetch(`${second.url}api/graph`)).status, 200);
  await viewers.dispose();
  await assert.rejects(fetch(`${second.url}api/graph`));
});

test('Web viewer proxy requires Host authentication, remains read-only and honors project revocation', { skip: !cli }, async t => {
  const root = await temporary(t), project = `${root}/project`;
  await fs.mkdir(project);
  await exec(process.execPath, [cli, 'init', '--here', `--cwd=${project}`, '--json']);
  let config = normalizeConfig({ runtimeCli: cli, projects: [{ workspace: project }], autoDiscover: false });
  const bridge = new CliBridge(() => config), effects = [];
  let route;
  const webServer = { register(value) { route = value; return () => {}; } };
  const ctx = {
    connection: {
      admit: req => req.headers.cookie === 'fixture-owner' ? { peer: owner } : { rejection: 401 },
    },
    sessions: { get: id => id === 'one' ? { id, header: { cwd: project } } : undefined },
    effect: factory => { effects.push(factory()); },
    inject: (_deps, apply) => apply({ webServer, effect: factory => { effects.push(factory()); } }),
    on: () => () => {}, get: name => name === 'webServer' ? webServer : undefined,
  };
  const routes = routeTable(ctx);
  mountViewer(ctx, () => config, bridge);
  const server = http.createServer((req, res) => route.handler(req, res));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    for (const dispose of effects.reverse()) await dispose?.();
    await bridge.dispose(); server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  const result = await invoke(routes.get('/api/pinwhy/viewer.open'), 'pinwhy/viewer.open', { sessionId: 'one' });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.ok(result.value.url.startsWith('/pinwhy-viewer/'));
  const base = new URL(result.value.url, `http://127.0.0.1:${server.address().port}`);
  assert.equal(base.searchParams.get('agent'), 'dsh:one');
  assert.equal(base.searchParams.get('view'), 'logic');
  assert.equal(base.searchParams.get('embed'), '1');
  const endpoint = suffix => new URL(suffix, base);
  assert.equal((await fetch(endpoint('api/graph'))).status, 401);
  const headers = { cookie: 'fixture-owner' };
  const response = await fetch(endpoint('api/graph'), { headers });
  assert.equal(response.status, 200);
  assert.notEqual((await response.json()).meta.writable, true);
  assert.equal((await fetch(endpoint('api/nodes'), { method: 'POST', headers })).status, 405);
  config = normalizeConfig({ runtimeCli: cli, projects: [], autoDiscover: false });
  assert.equal((await fetch(endpoint('api/graph'), { headers })).status, 403);
});

test('node.read resolves the Session board and returns only its canonical CLI record', async t => {
  const root = await temporary(t), project = await board(root);
  const events = `${project}/.pinwhy/events.jsonl`;
  const before = await fs.readFile(events), effects = [], calls = [];
  const config = normalizeConfig({ projects: [{ workspace: project }], autoDiscover: false });
  const ctx = {
    sessions: { get: id => id === 'one' ? { id: 'one', header: { cwd: project } } : undefined },
    effect: factory => { effects.push(factory()); },
    inject: () => {}, on: () => () => {}, get: () => undefined,
  };
  const routes = routeTable(ctx);
  const bridge = {
    async run(scope, argv, signal, beforeSpawn, snapshot) {
      calls.push({ scope, argv, signal, beforeSpawn, snapshot });
      return { boardRoot: scope.boardRoot, agentId: scope.agentId,
        data: { schema: 'pinwhy.show.v2', node: { id: 'n1', type: 'fact', title: 'Canonical memory' }, parents: [], children: [] } };
    },
  };
  mountViewer(ctx, () => config, bridge);
  const result = await invoke(routes.get('/api/pinwhy/node.read'), 'pinwhy/node.read', { sessionId: 'one', nodeId: 'n1' });
  assert.deepEqual(result, { ok: true, value: {
    boardRoot: project, agentId: 'dsh:one', node: { id: 'n1', type: 'fact', title: 'Canonical memory' },
  } });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].argv, ['show', `--cwd=${project}`, '--json', '--', 'n1']);
  assert.equal(calls[0].scope.boardRoot, project);
  assert.equal(calls[0].snapshot, config);
  assert.equal(calls[0].beforeSpawn, undefined);
  assert.deepEqual(await fs.readFile(events), before);
  for (const dispose of effects.reverse()) await dispose?.();
  const disposed = await invoke(routes.get('/api/pinwhy/node.read'), 'pinwhy/node.read', { sessionId: 'one', nodeId: 'n1' });
  assert.equal(disposed.error.code, 'DISPOSED');
});

test('node.read accepts only an exact Session and opaque node identity, never a path', async () => {
  const effects = [];
  let calls = 0;
  const ctx = {
    sessions: { get: () => undefined },
    effect: factory => { effects.push(factory()); },
    inject: () => {}, on: () => () => {}, get: () => undefined,
  };
  const routes = routeTable(ctx);
  mountViewer(ctx, () => normalizeConfig(), { async run() { calls += 1; throw new Error('must not read'); } });
  const route = routes.get('/api/pinwhy/node.read');
  const rejected = [
    null, [], {},
    { sessionId: 'one' },
    { sessionId: 'one', nodeId: 'n1', cwd: '/tmp' },
    { sessionId: 'one', nodeId: 'n1', boardRoot: '/tmp' },
    { sessionId: 'one', nodeId: 'n1', path: '/etc/passwd' },
    { sessionId: 'one', nodeId: '/etc/passwd' },
    { sessionId: 'one', nodeId: '../escape' },
    { sessionId: 'one', nodeId: 'nested/node' },
    { sessionId: 'one', nodeId: 'nested\\node' },
    { sessionId: 'one', nodeId: ' n1' },
    { sessionId: 'one', nodeId: 42 },
    { sessionId: ' ', nodeId: 'n1' },
  ];
  for (const payload of rejected) {
    const result = await invoke(route, 'pinwhy/node.read', payload);
    assert.equal(result.ok, false, JSON.stringify(payload));
    assert.equal(result.error.code, 'INVALID_ARGUMENT', JSON.stringify(payload));
  }
  assert.equal(calls, 0, 'validation must happen before the CLI bridge');
  const wrongMethod = await route.fetch(new Request('http://host.invalid/api/pinwhy/node.read', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId: 'x', method: 'pinwhy/viewer.open', payload: { sessionId: 'one', nodeId: 'n1' } }),
  }));
  assert.equal(wrongMethod.status, 400);
  const malformed = await route.fetch(new Request('http://host.invalid/api/pinwhy/node.read', { method: 'POST', body: '{}' }));
  assert.equal(malformed.status, 400);
  const missing = await invoke(route, 'pinwhy/node.read', { sessionId: 'missing', nodeId: 'n1' });
  assert.equal(missing.error.code, 'SESSION_REQUIRED');
  assert.equal(calls, 0);
  for (const dispose of effects.reverse()) await dispose?.();
});

test('node.read returns one canonical CLI record and leaves events and configuration untouched', { skip: !cli }, async t => {
  const root = await temporary(t), project = `${root}/project`;
  await fs.mkdir(project);
  const run = args => exec(process.execPath, [cli, ...args, `--cwd=${project}`, '--json'], {
    env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  }).then(result => JSON.parse(result.stdout));
  await run(['init', '--here']);
  const node = (await run(['node', 'add', 'fact', 'Canonical memory', '--no-init'])).node;
  const boardRoot = await fs.realpath(project);
  const events = `${boardRoot}/.pinwhy/events.jsonl`, configFile = `${boardRoot}/.pinwhy/config.json`;
  const beforeEvents = await fs.readFile(events), beforeConfig = await fs.readFile(configFile);
  const config = normalizeConfig({ runtimeCli: cli, projects: [{ workspace: project }], autoDiscover: false });
  const bridge = new CliBridge(() => config), effects = [];
  const ctx = {
    sessions: { get: id => id === 'one' ? { id: 'one', header: { cwd: project } } : undefined },
    effect: factory => { effects.push(factory()); },
    inject: () => {}, on: () => () => {}, get: () => undefined,
  };
  const routes = routeTable(ctx);
  mountViewer(ctx, () => config, bridge);
  t.after(async () => {
    for (const dispose of effects.reverse()) await dispose?.();
    await bridge.dispose();
  });
  const read = payload => invoke(routes.get('/api/pinwhy/node.read'), 'pinwhy/node.read', payload);
  const result = await read({ sessionId: 'one', nodeId: node.id });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.value.boardRoot, boardRoot);
  assert.equal(result.value.agentId, 'dsh:one');
  assert.equal(result.value.node.id, node.id);
  assert.equal(result.value.node.title, 'Canonical memory');
  assert.equal(result.value.node.type, 'fact');
  assert.deepEqual(await fs.readFile(events), beforeEvents);
  assert.deepEqual(await fs.readFile(configFile), beforeConfig);
  const extra = await read({ sessionId: 'one', nodeId: node.id, path: '/etc/passwd' });
  assert.equal(extra.error.code, 'INVALID_ARGUMENT');
  const missing = await read({ sessionId: 'one', nodeId: 'n999' });
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'CLI_FAILED');
  assert.match(missing.error.message, /no such node/);
  assert.deepEqual(await fs.readFile(events), beforeEvents);
  assert.deepEqual(await fs.readFile(configFile), beforeConfig);
});
