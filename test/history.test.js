import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import http from 'node:http';
import { buildNodeHistory, buildCheckpointChanges } from '../lib/history.js';
import { ensure, paths, appendEvent, readEvents, replay } from '../lib/store.js';
import { startServer } from '../lib/server.js';

const node = (id, type = 'note', title = id, extra = {}) => ({ id, type, title, ts: 100, ...extra });
const edge = (id, from, to, kind = 'supports', extra = {}) => ({ id, from, to, kind, ts: 100, ...extra });
const add = (value) => ({ op: 'node', node: value });
const rel = (value) => ({ op: 'edge', edge: value });
const checkpoint = (id = 'cp1', extra = {}) => ({ op: 'checkpoint', checkpoint: { id, at: 100, summary: 'handoff', ...extra } });

function researchEvents() {
  return [
    add(node('hy1', 'hypothesis', 'Candidate explanation', { status: 'open', author: 'agent:A', loc: { path: 'src/a.js', line: 2 } })),
    add(node('o1', 'observation', 'Old support')),
    rel(edge('support', 'o1', 'hy1')),
    checkpoint(),
    { eventId: 'patch-id', op: 'patch', id: 'hy1', set: { status: 'refuted', updated: 100, updatedBy: 'agent:B' }, reason: 'counterexample reproduced' },
    { op: 'remove', kind: 'edge', id: 'support', at: 100, by: 'agent:B' },
    add(node('o2', 'custom-evidence', 'Counterexample')),
    rel(edge('counter', 'o2', 'hy1', 'contradicts')),
    add(node('n1')),
    { op: 'remove', kind: 'node', id: 'n1', at: 99 },
  ];
}

test('checkpoint changes use event position, preserve transient changes and unknown types', () => {
  const events = researchEvents();
  const original = JSON.stringify(events);
  const result = buildCheckpointChanges(events, 'cp1');
  assert.equal(result.readOnly, true);
  assert.equal(result.prescriptive, false);
  assert.deepEqual(result.since, { id: 'cp1', at: 100, index: 3, summary: 'handoff' });
  assert.deepEqual(result.nodes.added.map((n) => [n.id, n.type]), [['o2', 'custom-evidence']]);
  assert.deepEqual(result.nodes.updated[0].fields, ['status', 'updated', 'updatedBy']);
  assert.equal(result.nodes.updated[0].before.status, 'open');
  assert.equal(result.nodes.updated[0].after.status, 'refuted');
  assert.deepEqual(result.nodes.removed, []);
  assert.deepEqual(result.edges.removed.map((e) => e.id), ['support']);
  assert.deepEqual(result.edges.added.map((e) => e.id), ['counter']);
  assert.deepEqual(result.events.map((e) => e.index), [4, 5, 6, 7, 8, 9]);
  assert.equal(result.events.at(-1).at, 99, 'a lower wall-clock timestamp remains after the checkpoint');
  assert.equal(JSON.stringify(events), original, 'replay must not mutate node event payloads');
});

test('shared current and checkpoint projections retain the recorded pre-patch state', () => {
  const source = { events: researchEvents(), corrupt: 2, future: 1 };
  const graph = replay(undefined, source);
  assert.equal(graph.nodes.hy1.status, 'refuted');
  assert.equal(graph.integrity.corruptLines, 2);
  assert.equal(graph.integrity.futureEvents, 1);
  const changes = buildCheckpointChanges(source.events, 'cp1');
  assert.equal(changes.nodes.updated[0].before.status, 'open');
  assert.equal(changes.nodes.updated[0].after.status, 'refuted');
  const history = buildNodeHistory(source.events, 'hy1');
  assert.deepEqual(history.entries.find((entry) => entry.op === 'patch').changes.status, { before: 'open', after: 'refuted' });
});

test('history and checkpoint changes retain structural rejection and tail diagnostics from the source', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-history-integrity-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  ensure(cwd);
  const events = [add(node('n1')), checkpoint(), { op: 'patch', id: 'n1', set: { title: 'changed' } }];
  const bytes = `null\n${events.map(event => JSON.stringify(event)).join('\n')}\n{"op":`;
  fs.writeFileSync(paths(cwd).events, bytes);
  const source = readEvents(cwd);
  const graph = replay(cwd, source);
  for (const result of [buildNodeHistory(source.events, 'n1', source), buildCheckpointChanges(source.events, 'cp1', source)]) {
    assert.equal(result.integrity.rejected, graph.integrity.rejected);
    assert.equal(result.integrity.rejected, 1);
    assert.equal(result.integrity.incompleteTailBytes, Buffer.byteLength('{"op":'));
  }
  assert.equal(graph.nodes.n1.title, 'changed');
  assert.equal(fs.readFileSync(paths(cwd).events, 'utf8'), bytes);
});

test('history shows field values, recorded attribution, incident relations and removed nodes', () => {
  const events = researchEvents();
  const result = buildNodeHistory(events, 'hy1');
  assert.deepEqual(result.entries.map((e) => e.op), ['node', 'edge', 'patch', 'remove', 'edge']);
  assert.equal(result.entries[0].by, 'agent:A');
  assert.equal(result.entries[0].changes.$node.after.loc.path, 'src/a.js');
  const patch = result.entries.find((e) => e.op === 'patch');
  assert.equal(patch.by, 'agent:B');
  assert.equal(patch.reason, 'counterexample reproduced');
  assert.equal(patch.eventId, 'patch-id');
  assert.deepEqual(patch.changes.status, { before: 'open', after: 'refuted' });
  assert.deepEqual(patch.changes.updatedBy, { before: null, after: 'agent:B' });
  assert.equal(result.entries.find((e) => e.op === 'edge').by, null, 'a relation does not borrow a nearby author');
  const removed = buildNodeHistory(events, 'n1');
  assert.equal(removed.entries.at(-1).changes.$node.after, null);
  assert.throws(() => buildNodeHistory(events, 'missing'), { message: 'node_not_found', status: 404 });
});

test('implicit relation deletions and explicit reset are graph changes with whole-log integrity', () => {
  const events = [
    { op: 'unknown-before-reset' },
    { op: 'edge', edge: edge('dangling', 'a', 'b') },
    add(node('a')), add(node('b')), rel(edge('ab', 'a', 'b', 'custom-kind')),
    checkpoint(),
    { op: 'remove', kind: 'node', id: 'b', at: 101, by: 'human', reason: 'obsolete' },
    { op: 'reset' },
    { op: 'unknown-after-reset' },
  ];
  const result = buildCheckpointChanges(events, 'cp1');
  assert.deepEqual(result.nodes.removed.map((n) => n.id), ['a', 'b']);
  assert.equal(result.edges.removed[0].kind, 'custom-kind');
  assert.equal(result.events[0].edges.removed[0].id, 'ab');
  assert.deepEqual(result.events.map((e) => e.op), ['remove', 'reset']);
  assert.deepEqual(result.integrity, { corruptLines: 0, futureEvents: 0, unknownOps: 2, rejected: 1 });
  const history = buildNodeHistory(events, 'b');
  assert.equal(history.entries.at(-1).reason, 'obsolete');
  assert.equal(history.entries.at(-1).edges.removed[0].id, 'ab');
  assert.equal(buildNodeHistory(events, 'a').entries.at(-1).op, 'reset');
});

test('checkpoint selection uses last replayable matching event across resets', () => {
  const events = [add(node('a')), checkpoint(), { op: 'reset' }, add(node('b')), checkpoint('cp1', { summary: 'new epoch' }), add(node('c'))];
  const result = buildCheckpointChanges(events, 'cp1');
  assert.equal(result.since.index, 4);
  assert.equal(result.since.summary, 'new epoch');
  assert.deepEqual(result.nodes.added.map((n) => n.id), ['c']);
  assert.deepEqual(result.nodes.removed, []);
  assert.throws(() => buildCheckpointChanges(events, 'cp-missing'), { message: 'checkpoint_not_found', status: 404 });
  const beforeReset = buildCheckpointChanges(events.slice(0, 4), 'cp1');
  assert.deepEqual(beforeReset.nodes.removed.map((n) => n.id), ['a']);
});

test('same edge ID payload replacement is visible and unsupported events never leak', () => {
  const events = [
    add(node('a')), add(node('b')), rel(edge('ab', 'a', 'b')), checkpoint(),
    rel(edge('ab', 'a', 'b', 'supports', { label: 'new explanation' })),
    { eventVersion: 99, op: 'patch', id: 'a', set: { title: 'future' } },
    { eventVersion: 99, ...checkpoint('future-cp') },
  ];
  const result = buildCheckpointChanges(events, 'cp1');
  assert.equal(result.integrity.futureEvents, 2);
  assert.equal(result.edges.added[0].label, 'new explanation');
  assert.equal(result.edges.removed[0].label, undefined);
  assert.deepEqual(result.nodes.updated, []);
  assert.deepEqual(result.events.map((e) => e.index), [4]);
  assert.throws(() => buildCheckpointChanges(events, 'future-cp'), /checkpoint_not_found/);
  const history = buildNodeHistory(events, 'a');
  assert.deepEqual(history.entries[0].changes.$node.after.title, 'a');
});

test('history keeps both explicit reset incarnations and ignores rejected identity patches', () => {
  const events = [add(node('a')), { op: 'reset' }, add(node('a', 'observation', 'second')), { op: 'patch', id: 'a', set: { id: 'other', ts: 1, title: 'changed' } }];
  const result = buildNodeHistory(events, 'a');
  assert.deepEqual(result.entries.map((e) => e.op), ['node', 'reset', 'node', 'patch']);
  assert.deepEqual(Object.keys(result.entries.at(-1).changes), ['title']);
  assert.equal(result.entries.at(-1).changes.title.before, 'second');
});

function fixture(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-history-'));
  ensure(cwd);
  t.after(() => fs.rmSync(cwd, { force: true, recursive: true }));
  return cwd;
}
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

function rawGet(port, headers) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port, path: '/api/history?node=hy1', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => { text += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    }).on('error', reject);
  });
}

test('real read-only server serves history/changes, reports corrupt/future events, keeps files byte-identical', async (t) => {
  const cwd = fixture(t);
  for (const event of researchEvents()) appendEvent(event, cwd);
  fs.appendFileSync(paths(cwd).events, '{bad-json}\n');
  appendEvent({ eventVersion: 99, op: 'patch', id: 'hy1', set: { title: 'not readable yet' } }, cwd);
  appendEvent({ op: 'future-new-operation' }, cwd);
  // History must not create or repair a disposable state cache either.
  fs.writeFileSync(paths(cwd).state, 'deliberately-invalid-cache');
  const before = { log: hash(paths(cwd).events), state: hash(paths(cwd).state) };
  const server = await startServer({ cwd, port: 0, readOnly: true });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async (suffix) => {
    const res = await fetch(`${base}${suffix}`);
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  };
  const history = await get('/api/history?node=hy1');
  assert.equal(history.status, 200);
  assert.equal(history.cache, 'no-store');
  assert.equal(history.body.readOnly, true);
  assert.equal(history.body.prescriptive, false);
  assert.deepEqual(history.body.integrity, { corruptLines: 1, futureEvents: 1, unknownOps: 1, rejected: 0 });
  assert.equal(history.body.entries.find((e) => e.op === 'patch').changes.status.after, 'refuted');
  const changes = await get('/api/changes?since=cp1');
  assert.equal(changes.status, 200);
  assert.equal(changes.body.nodes.updated[0].after.title, 'Candidate explanation');
  assert.equal(changes.body.edges.removed[0].id, 'support');
  assert.equal(changes.body.edges.added[0].id, 'counter');
  for (const [suffix, status, error] of [
    ['/api/history', 400, 'node_required'],
    ['/api/history?node=missing', 404, 'node_not_found'],
    ['/api/changes', 400, 'since_required'],
    ['/api/changes?since=missing', 404, 'checkpoint_not_found'],
  ]) {
    const result = await get(suffix);
    assert.equal(result.status, status);
    assert.equal(result.body.error, error);
  }
  const refused = await rawGet(server.address().port, { Host: 'not-loopback.example' });
  assert.equal(refused.status, 403);
  assert.equal(refused.body.error, 'host_not_allowed');
  const write = await fetch(`${base}/api/nodes`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify({ title: 'no change' }) });
  assert.equal(write.status, 403);
  assert.deepEqual(await write.json(), { error: 'read_only' });
  assert.deepEqual({ log: hash(paths(cwd).events), state: hash(paths(cwd).state) }, before);
  assert.deepEqual(history.body, buildNodeHistory(readEvents(cwd).events, 'hy1', readEvents(cwd)));
});

test('HTTP projections report read failures and recover without losing committed data', async (t) => {
  const cwd = fs.realpathSync(fixture(t));
  for (const event of researchEvents()) appendEvent(event, cwd);
  const file = paths(cwd).events;
  const before = fs.readFileSync(file);
  const server = await startServer({ cwd, port: 0, readOnly: true });
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const open = fs.openSync;
  const read = fs.readSync;
  let descriptor;
  fs.openSync = function(target, flags, ...args) {
    const fd = open.call(this, target, flags, ...args);
    if (target === file && flags === 'r') descriptor = fd;
    return fd;
  };
  fs.readSync = function(fd, ...args) {
    if (fd === descriptor) throw Object.assign(new Error('synthetic unavailable log'), { code: 'EIO' });
    return read.call(this, fd, ...args);
  };
  try {
    for (const route of ['/api/graph', '/api/context?since=cp1']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 500);
      assert.equal((await response.json()).error, 'synthetic unavailable log');
    }
  } finally {
    fs.openSync = open;
    fs.readSync = read;
  }
  const response = await fetch(`${base}/api/graph`);
  assert.equal(response.status, 200);
  const graph = await response.json();
  assert.equal(graph.nodes.hy1.status, 'refuted');
  assert.equal(graph.nodes.o1.title, 'Old support');
  assert.deepEqual(fs.readFileSync(file), before);
});
