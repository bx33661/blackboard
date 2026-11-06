// --as-of is a read of the log cut right after one checkpoint event. Every
// --json output must equal the same command run on a board whose events.jsonl
// was cut at that line, including the skipped-line counts, and nothing may be written.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { startServer } from '../lib/server.js';

const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'blackboard.js');
const T = Date.UTC(2026, 0, 1);
const ev = (n, body) => JSON.stringify({ eventVersion: 1, eventId: `event_ASOF_${n}`, ...body });
const node = (n, id, type, title, extra = {}) => ev(n, { op: 'node', node: { id, type, title, ts: T + n * 1000, author: 'agent:primary', ...extra } });
const checkpoint = (n, id, summary) => ev(n, { op: 'checkpoint', checkpoint: { id, agentId: 'agent:primary', at: T + n * 1000, sessionId: 'session_ASOF', summary, trigger: 'manual' } });

// Line numbers (1-based) of the checkpoints the cases cut at.
const LINES = [
  JSON.stringify({ op: 'meta', set: { title: 'As-of fixture' } }),
  node(2, 'g1', 'goal', 'Map the export path'),
  node(3, 'h1', 'hypothesis', 'Export skips redaction', { status: 'open', confidence: 'suspected' }),
  ev(4, { op: 'edge', edge: { id: 'h1->g1:supports', from: 'h1', to: 'g1', kind: 'supports', ts: T + 4000, author: 'agent:primary' } }),
  '{broken line',
  ev(6, { op: 'cursor', cursor: { id: 'cursor_ASOF_6', agentId: 'agent:primary', from: null, to: 'h1', at: T + 6000, reason: 'start' } }),
  checkpoint(7, 'cp1', 'Hypothesis recorded.'),
  JSON.stringify({ eventVersion: 99, eventId: 'event_ASOF_8', op: 'node', node: { id: 'z9', type: 'note', title: 'From a newer kernel' } }),
  ev(9, { op: 'patch', id: 'h1', set: { status: 'refuted', updated: T + 9000, updatedBy: 'agent:primary' } }),
  node(10, 'f1', 'fact', 'Redaction runs before export'),
  'still not json',
  checkpoint(12, 'cp2', 'Hypothesis refuted.'),
  '{"half": ',
  ev(14, { op: 'remove', kind: 'node', id: 'f1', by: 'agent:primary' }),
  ev(15, { op: 'reset', by: 'agent:primary' }),
  node(16, 'g1', 'goal', 'Second pass after reset'),
  checkpoint(17, 'cp1', 'Second pass started.'),
  node(18, 'n1', 'note', 'Written after the reused checkpoint'),
];
const CP2_LINE = 12;
const CP1_LAST_LINE = 17;

function board(t, lines) {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-as-of-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, '.blackboard'));
  fs.writeFileSync(path.join(dir, '.blackboard', 'events.jsonl'), `${lines.join('\n')}\n`);
  return dir;
}

function cli(cwd, args) {
  const env = { ...process.env, TZ: 'UTC', HOME: cwd };
  for (const key of Object.keys(env)) if (key.startsWith('BLACKBOARD_')) delete env[key];
  const r = spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd], { cwd, env, encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout };
}

function files(dir) {
  const root = path.join(dir, '.blackboard');
  return Object.fromEntries(fs.readdirSync(root).map((name) => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
}

const CASES = [
  { asOf: 'cp2', line: CP2_LINE, reads: [
    ['ls', '--all', '--json'], ['show', 'h1', '--json'], ['search', 'redaction', '--json'],
    ['context', '--json'], ['context', '--since', 'cp1', '--json'], ['changes', '--since', 'cp1', '--json'],
    ['history', 'h1', '--json'], ['show', 'n1', '--json'],
  ] },
  // A reset reuses ids; like `changes --since`, the reference names the last occurrence.
  { asOf: 'cp1', line: CP1_LAST_LINE, reads: [
    ['ls', '--all', '--json'], ['show', 'g1', '--json'], ['context', '--json'], ['show', 'h1', '--json'],
  ] },
];

for (const { asOf, line, reads } of CASES) {
  test(`--as-of ${asOf} reads exactly what a log cut after line ${line} reads`, (t) => {
    const full = board(t, LINES);
    const cut = board(t, LINES.slice(0, line));
    const before = files(full);
    for (const args of reads) {
      // history has no --as-of: it is the one read whose cut copy alone is compared.
      const actual = args[0] === 'history' ? null : cli(full, [...args, '--as-of', asOf]);
      const expected = cli(cut, args);
      if (actual) assert.deepEqual(actual, expected, args.join(' '));
    }
    assert.deepEqual(files(full), before, 'an as-of read writes nothing');
  });
}

test('--as-of counts only the corrupt and future lines before the checkpoint', (t) => {
  const full = board(t, LINES);
  const at = JSON.parse(cli(full, ['changes', '--since', 'cp1', '--as-of', 'cp2', '--json']).stdout);
  assert.equal(at.integrity.corruptLines, 2);
  assert.equal(at.integrity.futureEvents, 1);
  const now = JSON.parse(cli(full, ['changes', '--since', 'cp1', '--json']).stdout);
  assert.equal(now.integrity.corruptLines, 3, 'the whole log also counts the line after cp2');
});

test('--as-of names a checkpoint, and a bad one fails without output', (t) => {
  const full = board(t, LINES);
  assert.equal(cli(full, ['ls', '--as-of', 'CP2', '--json']).status, 0, 'references resolve like other ids');
  const failures = [
    ['cp9', 'not_found'], ['c', 'ambiguous_ref'], ['g1', 'not_found'],
    ...['constructor', 'toString', '__proto__', 'hasOwnProperty'].map((ref) => [ref, 'not_found']),
  ];
  for (const [ref, code] of failures) {
    const r = spawnSync(process.execPath, [CLI, 'ls', '--as-of', ref, '--json', '--cwd', full], { encoding: 'utf8' });
    assert.equal(r.status, 1, ref);
    assert.equal(r.stdout, '', ref);
    assert.equal(JSON.parse(r.stderr).code, code, ref);
  }
});

test('report exports say which checkpoint they show and otherwise match the cut log', (t) => {
  const full = board(t, LINES);
  const cut = board(t, LINES.slice(0, CP2_LINE));
  const out = (dir, name) => path.join(dir, name);
  for (const [format, name] of [['markdown', 'r.md'], ['mermaid', 'r.mmd'], ['sarif', 'r.sarif']]) {
    assert.equal(cli(full, ['export', '--format', format, '--as-of', 'cp2', '--out', out(full, name)]).status, 0);
    assert.equal(cli(cut, ['export', '--format', format, '--out', out(cut, name)]).status, 0);
  }
  // Markdown and Mermaid escape punctuation; the line names the checkpoint either way.
  const marker = /^.*As of checkpoint: cp2 .*2026.*\n/m;
  for (const name of ['r.md', 'r.mmd']) {
    const text = fs.readFileSync(out(full, name), 'utf8');
    assert.match(text, marker, name);
    assert.equal(text.replace(marker, ''), fs.readFileSync(out(cut, name), 'utf8').replaceAll(cut, full), name);
  }
  const sarif = JSON.parse(fs.readFileSync(out(full, 'r.sarif'), 'utf8'));
  assert.deepEqual(sarif.runs[0].properties.asOf, { id: 'cp2', at: T + 12000 });
  delete sarif.runs[0].properties.asOf;
  assert.deepEqual(sarif, JSON.parse(fs.readFileSync(out(cut, 'r.sarif'), 'utf8').replaceAll(cut, full)));
});

test('the viewer reads a checkpoint snapshot that is never writable', async (t) => {
  const full = board(t, LINES);
  const cut = board(t, LINES.slice(0, CP2_LINE));
  const server = await startServer({ cwd: full, port: 0 });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (suffix) => {
    const response = await fetch(`${base}${suffix}`);
    return { status: response.status, body: await response.json() };
  };
  const live = await get('/api/graph');
  assert.equal(live.body.meta.writable, true);
  assert.equal(live.body.meta.asOf, undefined);

  const past = await get('/api/graph?asOf=cp2');
  assert.equal(past.status, 200);
  assert.equal(past.body.meta.writable, undefined);
  assert.deepEqual(past.body.meta.asOf, {
    id: 'cp2', at: T + 12000, agentId: 'agent:primary', sessionId: 'session_ASOF', summary: 'Hypothesis refuted.', eventId: 'event_ASOF_12',
  });
  assert.equal(past.body.meta.session, 'session_ASOF');
  assert.equal(past.body.meta.title, 'As-of fixture');
  const cutServer = await startServer({ cwd: cut, port: 0 });
  t.after(() => new Promise((resolve) => { cutServer.close(resolve); cutServer.closeAllConnections(); }));
  const expected = await (await fetch(`http://127.0.0.1:${cutServer.address().port}/api/graph`)).json();
  for (const key of ['nodes', 'edges', 'cursors', 'checkpoints', 'stats', 'digests']) {
    assert.deepEqual(past.body[key], expected[key], key);
  }

  const between = await get('/api/changes?since=cp1&asOf=cp2');
  assert.equal(between.status, 200);
  assert.deepEqual(between.body.nodes.added.map((item) => item.id), ['f1']);
  assert.deepEqual(between.body.nodes.updated.map((item) => item.id), ['h1']);

  assert.deepEqual(await get('/api/graph?asOf=cp9'), { status: 404, body: { error: 'checkpoint_not_found', asOf: 'cp9' } });
  for (const endpoint of ['/api/graph?', '/api/digest?', '/api/context?', '/api/history?node=h1&', '/api/changes?since=cp1&']) {
    for (const ref of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.deepEqual(await get(`${endpoint}asOf=${ref}`), { status: 404, body: { error: 'checkpoint_not_found', asOf: ref } });
    }
  }
  const ambiguous = await get('/api/graph?asOf=c');
  assert.equal(ambiguous.status, 400);
  assert.equal(ambiguous.body.code, 'ambiguous_ref');
  assert.deepEqual(ambiguous.body.candidates.sort(), ['cp1', 'cp2']);
  assert.deepEqual(await get('/api/changes?since=cp9&asOf=cp2'), { status: 404, body: { error: 'checkpoint_not_found', since: 'cp9' } });
});
