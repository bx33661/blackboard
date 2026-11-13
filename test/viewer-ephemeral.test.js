import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addNode, ensure, paths } from '../lib/store.js';
import { rememberViewerPort } from '../lib/service.js';
import { normalizeBasePath, startServer } from '../lib/server.js';

// The embedded viewer a host owns: one read-only process on an OS-chosen port,
// announced as one `pinwhy.viewer.v1` line and mounted under a token prefix.
const CLI = fileURLToPath(new URL('../bin/pinwhy.js', import.meta.url));
const PUBLIC_ASSETS = fileURLToPath(new URL('../public/assets', import.meta.url));
const PREFIX = '/pinwhy-viewer/synthetic-token/';

function fixture(t) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  ensure(dir);
  addNode({ type: 'note', title: 'Synthetic viewer record' }, dir);
  return dir;
}

/** Every file and directory below `dir`, so a viewer that writes anything is visible. */
function snapshot(dir, base = dir, entries = {}) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const relative = path.relative(base, full).split(path.sep).join('/');
    if (entry.isDirectory()) {
      entries[`${relative}/`] = '';
      snapshot(full, base, entries);
    } else entries[relative] = fs.readFileSync(full, 'utf8');
  }
  return entries;
}

function environment() {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith('PINWHY_')) delete env[key];
  return env;
}

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args, '--json'], { env: environment(), encoding: 'utf8', input: '', timeout: 20000 });
}

function spawnServe(args, cwd, stdin = 'pipe') {
  return spawn(process.execPath, [CLI, ...args, '--cwd', cwd], { env: environment(), stdio: [stdin, 'pipe', 'pipe'] });
}

function stderrOf(child) {
  let text = '';
  child.stderr.on('data', (chunk) => { text += chunk; });
  return () => text;
}

/** The one JSON ready line; stderr is quoted because a failed start explains itself there. */
function readyLine(child, stderr) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => reject(new Error(`no ready line; stderr: ${stderr()}`)), 15000);
    const onData = (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      clearTimeout(timer);
      child.stdout.off('data', onData);
      const line = buffer.slice(0, newline);
      try { resolve({ line, value: JSON.parse(line) }); }
      catch { reject(new Error(`ready line is not JSON: ${line}`)); }
    };
    child.stdout.on('data', onData);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`viewer exited ${code ?? signal} before it was ready; stderr: ${stderr()}`));
    });
  });
}

function exited(child, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('viewer stayed alive after its parent stdin closed')), timeoutMs);
    child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
}

async function json(url, init) {
  const response = await fetch(url, init);
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('a base path is one normalized literal prefix, never a routed or escaped path', (t) => {
  fixture(t);
  assert.equal(normalizeBasePath(undefined), '');
  assert.equal(normalizeBasePath(''), '');
  assert.equal(normalizeBasePath('/'), '');
  assert.equal(normalizeBasePath(PREFIX), PREFIX);
  assert.equal(normalizeBasePath('pinwhy-viewer/synthetic-token'), PREFIX);
  assert.equal(normalizeBasePath('/pinwhy-viewer/synthetic-token'), PREFIX);
  for (const value of [
    '/pinwhy-viewer/../escape/', '/pinwhy-viewer/./token/', '/pinwhy-viewer//token/',
    '/pinwhy-viewer/token/?query=1', '/pinwhy-viewer/token/#fragment',
    '/pinwhy-viewer/token/%2e%2e/', '/pinwhy-viewer/token\\escape/',
    '/pinwhy-viewer/token with space/', `/${'a'.repeat(600)}/`,
  ]) {
    assert.throws(() => normalizeBasePath(value), { code: 'invalid_value' }, value);
  }
  assert.throws(() => normalizeBasePath(7), { code: 'invalid_value' });
});


test('page, assets, API and SSE answer only below the prefix', async (t) => {
  const cwd = fixture(t);
  const server = await startServer({ cwd, port: 0, readOnly: true, ephemeral: true, basePath: PREFIX });
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const base = `${origin}${PREFIX}`;

  const status = await json(`${base}api/status`);
  assert.equal(status.status, 200);
  assert.equal(status.body.cwd, cwd);
  assert.equal(status.body.readOnly, true);
  assert.equal(status.body.pid, process.pid);

  const graph = await json(`${base}api/graph`);
  assert.equal(graph.status, 200);
  assert.equal(graph.body.schema, 'pinwhy.graph.v2');
  assert.equal(graph.body.meta.writable, undefined, 'an ephemeral projection is never writable');
  assert.deepEqual(Object.values(graph.body.nodes).map((node) => node.title), ['Synthetic viewer record']);

  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type') || '', /^text\/html/);
  assert.match(await page.text(), /<div id="root">/);

  const asset = fs.readdirSync(PUBLIC_ASSETS).find((name) => name.endsWith('.js'));
  assert.ok(asset, 'the built viewer ships at least one script asset');
  const script = await fetch(`${base}assets/${asset}`);
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type') || '', /^text\/javascript/);

  // The event stream keeps the same prefix; its first snapshot arrives immediately.
  const controller = new AbortController();
  const stream = await fetch(`${base}events`, { signal: controller.signal });
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type') || '', /^text\/event-stream/);
  const reader = stream.body.getReader();
  let frame = '';
  let expiry;
  const timedOut = new Promise((_, reject) => {
    expiry = setTimeout(() => reject(new Error('no graph event arrived on the prefixed stream')), 10000);
  });
  try {
    await Promise.race([timedOut, (async () => {
      while (!frame.includes('"schema":"pinwhy.graph.v2"')) {
        const { value, done } = await reader.read();
        if (done) return;
        frame += Buffer.from(value).toString('utf8');
      }
    })().catch(() => {})]);
  } finally {
    clearTimeout(expiry);
    controller.abort();
  }
  assert.match(frame, /event: graph\ndata: \{"schema":"pinwhy\.graph\.v2"/);

  // Anything outside the literal mount is not this viewer, including dot segments the URL parser removes.
  for (const outside of [`${origin}/`, `${origin}/api/status`, `${origin}/api/graph`, `${origin}/events`,
    `${origin}/pinwhy-viewer/other-token/api/status`, `${origin}${PREFIX}../api/status`]) {
    const response = await fetch(outside);
    assert.equal(response.status, 404, outside);
    assert.deepEqual(await response.json(), { error: 'not_found' });
  }
  assert.equal((await fetch(`${origin}${PREFIX}%2e%2e/api/status`, { redirect: 'manual' })).status, 404,
    'percent-encoded traversal stays inside the prefix and misses every route');

  // A bare mount point is the same page; only the trailing slash makes relative assets resolve.
  const redirect = await fetch(`${origin}${PREFIX.slice(0, -1)}`, { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), PREFIX);

  const write = await json(`${base}api/nodes`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'note', title: 'must not be written' }),
  });
  assert.equal(write.status, 403);
  assert.equal(write.body.error, 'read_only');
  const after = await json(`${base}api/graph`);
  assert.equal(Object.keys(after.body.nodes).length, 1, 'the refused write appended nothing');
});

test('serve --ephemeral announces its actual port and prefix without touching the project, then dies with stdin', async (t) => {
  const cwd = fixture(t);
  const before = snapshot(cwd);
  const child = spawnServe(['serve', '--ephemeral', '--read-only', '--json', '--port', '0', `--base-path=${PREFIX}`], cwd);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const stderr = stderrOf(child);
  const { value } = await readyLine(child, stderr);

  assert.equal(value.schema, 'pinwhy.viewer.v1');
  assert.equal(value.readOnly, true);
  assert.equal(value.cwd, cwd);
  const url = new URL(value.url);
  assert.equal(url.protocol, 'http:');
  assert.equal(url.hostname, '127.0.0.1');
  assert.ok(Number(url.port) > 0, 'the ready line names the actual port');
  assert.equal(url.pathname, PREFIX);
  assert.equal(url.search, '');
  assert.equal(url.hash, '');

  // The declared contract and the running viewer name the same schema.
  const declared = run(['capabilities']);
  assert.equal(declared.status, 0, declared.stderr);
  const capabilities = JSON.parse(declared.stdout);
  assert.equal(capabilities.features.ephemeralViewer, true);
  assert.deepEqual(capabilities.outputs.serve, { shape: 'object', schema: value.schema });

  const graph = await json(new URL('api/graph', value.url));
  assert.equal(graph.status, 200);
  assert.deepEqual(Object.values(graph.body.nodes).map((node) => node.title), ['Synthetic viewer record']);

  // No configuration write: the same files hold the same bytes, and no port was remembered.
  assert.deepEqual(snapshot(cwd), before);
  assert.equal(JSON.parse(fs.readFileSync(paths(cwd).config, 'utf8')).viewerPort, undefined);

  const exit = exited(child);
  child.stdin.end();
  assert.deepEqual(await exit, { code: 0, signal: null }, `stderr: ${stderr()}`);
  assert.deepEqual(snapshot(cwd), before, 'shutting down wrote nothing either');
});

test('an embedded viewer ignores the recorded project port and never records its own', async (t) => {
  const cwd = fixture(t);
  rememberViewerPort(cwd, 4333);
  const before = snapshot(cwd);
  const child = spawnServe(['serve', '--ephemeral', '--read-only', '--json', '--base-path', PREFIX], cwd);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const { value } = await readyLine(child, stderrOf(child));

  const url = new URL(value.url);
  assert.equal(url.pathname, PREFIX);
  assert.notEqual(Number(url.port), 4333, 'the project configuration does not choose an embedded port');
  assert.equal(JSON.parse(fs.readFileSync(paths(cwd).config, 'utf8')).viewerPort, 4333);

  const exit = exited(child);
  child.stdin.end();
  assert.equal((await exit).code, 0);
  assert.deepEqual(snapshot(cwd), before, 'the embedded port was never written');
});

test('a parent crash closes stdin and the embedded viewer exits instead of staying behind', async (t) => {
  const cwd = fixture(t);
  const child = spawnServe(['serve', '--ephemeral', '--read-only', '--json', '--port', '0', `--base-path=${PREFIX}`], cwd);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const { value } = await readyLine(child, stderrOf(child));
  assert.equal((await fetch(new URL('api/status', value.url))).status, 200);

  const exit = exited(child, 5000);
  child.stdin.on('error', () => {});
  child.stdin.destroy();
  assert.equal((await exit).code, 0);
});

test('normal serve keeps running without a parent pipe and still records its port', async (t) => {
  const cwd = fixture(t);
  const log = fs.readFileSync(paths(cwd).events, 'utf8');
  const child = spawnServe(['serve', '--json', '--port', '0'], cwd, 'ignore');
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  const { value } = await readyLine(child, stderrOf(child));

  assert.equal(value.schema, 'pinwhy.viewer.v1');
  assert.equal(value.readOnly, false);
  assert.equal(value.cwd, cwd);
  const url = new URL(value.url);
  assert.equal(url.pathname, '/');
  const config = JSON.parse(fs.readFileSync(paths(cwd).config, 'utf8'));
  assert.equal(config.viewerPort, Number(url.port), 'a normal viewer still remembers the port it chose');
  assert.equal((await fetch(new URL('api/status', value.url))).status, 200);
  assert.equal(fs.readFileSync(paths(cwd).events, 'utf8'), log, 'serving reads the log without appending');

  const exit = exited(child);
  child.kill('SIGTERM');
  assert.equal((await exit).code, 0);
});

test('--ephemeral requires --read-only, --base-path requires --ephemeral, and a missing board is never created', (t) => {
  const cwd = fixture(t);
  const before = snapshot(cwd);
  const writable = run(['serve', '--ephemeral', '--port', '0', '--cwd', cwd]);
  assert.equal(writable.status, 1);
  assert.equal(JSON.parse(writable.stderr).code, 'invalid_usage');
  assert.equal(writable.stdout, '');
  assert.deepEqual(snapshot(cwd), before);

  const standalone = run(['serve', '--read-only', '--port', '0', '--base-path', PREFIX, '--cwd', cwd]);
  assert.equal(standalone.status, 1);
  assert.equal(JSON.parse(standalone.stderr).code, 'invalid_usage');
  assert.equal(standalone.stdout, '');
  assert.deepEqual(snapshot(cwd), before);

  const empty = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-empty-')));
  t.after(() => fs.rmSync(empty, { recursive: true, force: true }));
  const missing = run(['serve', '--ephemeral', '--read-only', '--port', '0', '--cwd', empty]);
  assert.equal(missing.status, 1);
  assert.equal(JSON.parse(missing.stderr).code, 'board_missing');
  assert.deepEqual(fs.readdirSync(empty), [], 'an embedded viewer never initializes a board');
});

test('an unusable --base-path fails before serving and before any write', (t) => {
  const cwd = fixture(t);
  const before = snapshot(cwd);
  for (const basePath of ['/pinwhy-viewer/../escape/', '/pinwhy-viewer/token/?query=1',
    '/pinwhy-viewer/token/#fragment', '/pinwhy-viewer/token\\escape/', '/pinwhy-viewer/token/%2e%2e/']) {
    const result = run(['serve', '--ephemeral', '--read-only', '--port', '0', '--base-path', basePath, '--cwd', cwd]);
    assert.equal(result.status, 1, basePath);
    assert.equal(result.stdout, '', basePath);
    const error = JSON.parse(result.stderr);
    assert.equal(error.schema, 'pinwhy.error.v1', basePath);
    assert.equal(error.code, 'invalid_value', basePath);
    assert.match(error.message, /--base-path/, basePath);
    assert.deepEqual(snapshot(cwd), before, basePath);
  }
});
