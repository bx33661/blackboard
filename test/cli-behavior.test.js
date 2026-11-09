import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { ensure, addNode, addActivity, removeNode, patchNode, paths, replay } from '../lib/store.js';

const CLI = fileURLToPath(new URL('../bin/pinwhy.js', import.meta.url));

function fixture(t, initialized = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-cli-behavior-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cwd = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  if (initialized) ensure(cwd);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PINWHY_')));
  return { cwd, home, run(args, input, extraEnv = {}) {
    const bound = args[0] === 'release' ? args : [args[0], '--cwd', cwd, ...args.slice(1)];
    return spawnSync(process.execPath, [CLI, ...bound], {
      cwd, env: { ...env, HOME: home, USERPROFILE: home, ...extraEnv }, input, encoding: 'utf8', timeout: 10000,
    });
  } };
}
function failure(result, code) {
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stdout, '');
  const error = JSON.parse(result.stderr);
  assert.equal(error.schema, 'pinwhy.error.v1');
  if (code) assert.equal(error.code, code);
  return error;
}
function success(result) {
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('invalid command shapes and static write input leave a missing board untouched', (t) => {
  const { cwd, home, run } = fixture(t, false);
  for (const args of [
    ['done'], ['show', 'n1', 'n2'], ['ls', 'ignored'], ['link', 'n1', 'n2', 'n3'],
    ['checkpoint', '--request-id', 'summary-required'], ['edit', 'n1'],
    ['node', 'add', '', 'Title'], ['edit', ''], ['link', '', 'n1'],
    ['fact', 'X', '--label', 'orphan'], ['fact', 'x'.repeat(501), '--no-truncate'],
    ['edit', 'n1', '--detail', 'x'.repeat(20001), '--no-truncate'],
    ['batch', '--request-id', 'bad'], ['batch', '--request-id', 'bad-enum'],
    ['service', 'stop', '--port', '4333'], ['release', 'ls', '--force'],
  ]) {
    const input = args.includes('bad-enum') ? '{"op":"node","type":"note","title":"X","status":"invalid"}\n' : '{bad json}\n';
    failure(run([...args, '--json'], input));
    assert.deepEqual(fs.readdirSync(cwd), [], args.join(' '));
    assert.deepEqual(fs.readdirSync(home), [], args.join(' '));
  }
});

test('cursor reads do not initialize, and valid writes retain automatic initialization', (t) => {
  const { cwd, run } = fixture(t, false);
  failure(run(['cursor', '--json']), 'board_missing');
  assert.deepEqual(fs.readdirSync(cwd), []);
  const created = success(run(['fact', 'Explicit record', '--json']));
  assert.equal(replay(cwd).nodes[created.node.id].title, 'Explicit record');
});

test('options before a subcommand and literal flag-shaped text preserve the recorded input', (t) => {
  const { run } = fixture(t);
  const result = success(run(['node', '--json', '--tag=--help', '--detail=--json', '--', 'add', '--custom', '--help']));
  assert.deepEqual([result.node.type, result.node.title, result.node.detail, result.node.tags], ['--custom', '--help', '--json', ['--help']]);
  assert.equal(success(run(['fact', 'Multiple', 'title', 'words', '--json'])).node.title, 'Multiple title words');
});

test('JSON failures remain one structured error in normal and debug modes', (t) => {
  const { run } = fixture(t, false);
  for (const debug of ['', '1']) {
    const error = failure(run(['fact', 'X', '--to', 'missing', '--json'], undefined, { PINWHY_DEBUG: debug }), 'not_found');
    if (debug) assert.match(error.stack, /Error/);
  }
});

test('promote accepts a node kind together with a relation kind', (t) => {
  const { cwd, run } = fixture(t);
  const goal = addNode({ type: 'goal', title: 'Synthetic goal' }, cwd).node;
  const activity = addActivity({ tool: 'Read', summary: 'Synthetic observation' }, cwd);
  const result = success(run(['promote', activity.id, '--kind', 'observation', '--to', goal.id, '--rel', 'supports', '--json']));
  assert.equal(result.node.type, 'observation');
  assert.deepEqual(result.edges.map(({ from, to, kind }) => ({ from, to, kind })), [{ from: result.node.id, to: goal.id, kind: 'supports' }]);
});

test('list field filters intersect before limiting and retain creation order', (t) => {
  const { cwd, run } = fixture(t);
  const old = addNode({ type: 'finding', title: 'Older', status: 'blocked', severity: 'high', confidence: 'reproduced', tags: ['auth', 'tenant'] }, cwd).node;
  addNode({ type: 'finding', title: 'Wrong tag', status: 'blocked', severity: 'high', confidence: 'reproduced', tags: ['auth'] }, cwd);
  const latest = addNode({ type: 'finding', title: 'Latest match', status: 'blocked', severity: 'high', confidence: 'reproduced', tags: ['auth', 'tenant'] }, cwd).node;
  addNode({ type: 'finding', title: 'Wrong status', status: 'done', severity: 'high', confidence: 'reproduced', tags: ['auth', 'tenant'] }, cwd);
  patchNode(old.id, { title: 'Older but recently edited' }, cwd);
  const filters = ['--type', 'finding', '--status', 'blocked', '--sev', 'high', '--confidence', 'reproduced', '--tag', 'auth', '--tag', 'tenant'];
  assert.deepEqual(success(run(['ls', ...filters, '--limit', '1', '--json'])).map((n) => n.id), [latest.id]);
  assert.deepEqual(success(run(['list', ...filters, '--all', '--json'])).map((n) => n.id), [old.id, latest.id]);
  assert.deepEqual(success(run(['ls', '--open', '--status', 'blocked', '--json'])), []);
});

test('show exposes recorded dimensions and provenance without changing the board', (t) => {
  const { cwd, run } = fixture(t);
  const node = addNode({ type: 'finding', title: 'Synthetic finding', status: 'blocked', severity: 'high', confidence: 'reproduced', at: 'src/example.ts:42', author: 'agent:research' }, cwd).node;
  const before = fs.readFileSync(paths(cwd).events);
  const result = run(['show', node.id]);
  assert.equal(result.status, 0, result.stderr);
  for (const value of ['blocked', 'high', 'reproduced', 'src/example.ts:42', 'agent:research', new Date(node.ts).toISOString()]) assert.ok(result.stdout.includes(value), value);
  assert.deepEqual(fs.readFileSync(paths(cwd).events), before);
});

test('edit clears explicit fields, replays them, and preserves receipt-first retries', (t) => {
  const { cwd, run } = fixture(t);
  const node = addNode({ title: 'Keep title', detail: 'Remove detail', tags: ['auth'], status: 'active', severity: 'high', confidence: 'reproduced', author: 'agent:writer' }, cwd).node;
  const args = ['edit', node.id, ...['detail', 'tags', 'status', 'severity', 'confidence'].flatMap((field) => ['--clear', field]), '--request-id', 'clear-once', '--json'];
  const first = success(run(args));
  assert.deepEqual([first.title, first.detail, first.tags, first.status, first.severity, first.confidence, first.author], ['Keep title', '', [], null, null, null, 'agent:writer']);
  fs.unlinkSync(paths(cwd).state);
  const restored = replay(cwd).nodes[node.id];
  assert.deepEqual([restored.detail, restored.tags, restored.status, restored.severity, restored.confidence], ['', [], null, null, null]);
  removeNode(node.id, {}, cwd);
  const before = fs.readFileSync(paths(cwd).events);
  assert.deepEqual(success(run(args)), first);
  assert.deepEqual(fs.readFileSync(paths(cwd).events), before);
});

test('clear conflicts and unsupported fields reject without appending', (t) => {
  const { cwd, run } = fixture(t);
  const node = addNode({ title: 'Keep', detail: 'Keep detail' }, cwd).node;
  const before = fs.readFileSync(paths(cwd).events);
  for (const args of [
    ['--clear', 'detail', '--detail', 'replacement'], ['--clear', 'severity', '--sev', 'high'],
    ['--clear', 'tags', '--tag', 'auth'], ['--clear', 'title'], ['--clear', 'id'],
  ]) failure(run(['edit', node.id, ...args, '--json']));
  assert.deepEqual(fs.readFileSync(paths(cwd).events), before);
});
