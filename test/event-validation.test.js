import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { backupBoard, restoreBoard } from '../lib/backup.js';
import { applyAll, emptyGraph, EVENT_VERSION } from '../lib/model.js';
import { ensure, paths, readEvents, readEventsAsOf, replay, addNode, getReceipt } from '../lib/store.js';

const line = (event) => Buffer.from(`${JSON.stringify(event)}\n`);
const node = (id, extra = {}) => ({ op: 'node', node: { id, type: 'custom-note', title: id, ...extra } });
const checkpoint = (id) => ({ op: 'checkpoint', checkpoint: { id, summary: id } });

function fixture(t, bytes = Buffer.alloc(0)) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-event-validation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  ensure(source);
  fs.writeFileSync(paths(source).events, bytes);
  return { root, source, backup: path.join(root, 'backup'), target: path.join(root, 'restored') };
}

function assertBackupParity(source, backup, target) {
  const raw = fs.readFileSync(paths(source).events);
  const sourceLog = readEvents(source);
  const graph = replay(source, sourceLog);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.eventCount, sourceLog.events.length);
  for (const key of ['corruptLines', 'futureEvents', 'rejected', 'unknownOps']) {
    assert.equal(receipt.integrity[key], graph.integrity[key], key);
  }
  assert.equal(receipt.integrity.incompleteTailBytes, sourceLog.incompleteTailBytes);
  assert.equal(Boolean(receipt.integrity.invalidUtf8), sourceLog.invalidUtf8);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'events.jsonl')), raw);
  assert.deepEqual(fs.readFileSync(paths(source).events), raw, 'reads and backup preserve every source byte');
  assert.throws(() => restoreBoard(backup, target), /event log is damaged/);
  assert.equal(fs.existsSync(target), false);
}

test('invalid envelopes are rejected uniformly while valid siblings and custom semantics survive', (t) => {
  const invalid = [null, true, 7, 'event', [], {}, { op: null }, { op: '' }, { op: '  ' }];
  const valid = [node('a'), node('b'), { op: 'edge', edge: { id: 'custom-edge', from: 'a', to: 'b', kind: 'custom-relation' } }, { op: 'custom-operation', arbitrary: [1, null] }];
  const { source, backup, target } = fixture(t, Buffer.concat([...invalid, ...valid].map(line)));
  const log = readEvents(source);
  assert.deepEqual(log.events, valid);
  assert.equal(log.invalidRecords, invalid.length);
  assert.deepEqual(log.invalidAt, invalid.map(() => 0));
  assert.equal(log.corrupt, 0);
  const graph = replay(source, log);
  assert.equal(graph.integrity.rejected, invalid.length);
  assert.equal(graph.integrity.unknownOps, 1);
  assert.equal(graph.nodes.a.type, 'custom-note');
  assert.equal(graph.edges['custom-edge'].kind, 'custom-relation');
  assertBackupParity(source, backup, target);
});

test('malformed known payloads and request plans are skipped without poisoning writes or receipt reads', (t) => {
  const planned = { ...node('planned'), eventId: 'planned-event' };
  const request = { requestId: 'broken-request', command: 'addNode', fingerprint: 'synthetic', result: {}, events: [planned] };
  const invalid = [
    { op: 'node', node: [] }, { op: 'node', node: { id: 'bad' } }, node('bad-title', { title: {} }),
    node('bad-tags', { tags: 'tag' }), { op: 'edge', edge: 'bad' },
    { op: 'patch', id: 'good', set: 'bad' }, { op: 'patch', id: 'good', set: { tags: {} } },
    { op: 'remove', id: [] }, { op: 'cursor', cursor: [] },
    { op: 'cursor', cursor: { agentId: [] } }, { op: 'activity', activity: 1 },
    { op: 'activity', activity: { id: 'activity', linkedNodeIds: {} } },
    { op: 'checkpoint', checkpoint: true }, { op: 'meta', set: [] },
    { ...node('bad-request'), request: [] },
    { ...node('bad-plan'), request: { ...request, events: [null] } },
    { ...node('bad-plan-id'), request: { ...request, events: [node('missing-event-id')] } },
    { ...node('bad-plan-payload'), request: { ...request, events: [{ op: 'patch', eventId: 'plan', id: 'good', set: [] }] } },
    { ...node('bad-recursive-plan'), request: { ...request, events: [{ ...planned, request }] } },
    { op: 'receipt', requestId: 'bad-receipt', command: 'addNode', fingerprint: 'synthetic', eventIds: [null] },
    { op: 'receipt', requestId: [], eventIds: [] },
    { ...node('bad-version'), eventVersion: { valueOf: null, toString: null } },
  ];
  const raw = Buffer.concat([line(node('good')), ...invalid.map(line)]);
  const { source, backup, target } = fixture(t, raw);
  const log = readEvents(source);
  assert.equal(log.invalidRecords, invalid.length);
  assert.deepEqual(log.events, [node('good')]);
  assert.equal(getReceipt('broken-request', source), null);
  assertBackupParity(source, backup, target);
  const input = { title: 'new write after malformed records', requestId: 'new-request' };
  const added = addNode(input, source);
  assert.equal(getReceipt(input.requestId, source).status, 'committed');
  assert.deepEqual(addNode(input, source), added);
  assert.equal(replay(source).nodes[added.node.id].title, input.title);
  assert.deepEqual(fs.readFileSync(paths(source).events).subarray(0, raw.length), raw);
});

test('a null line cannot brick new writes, including writes with a request ID', (t) => {
  const { source } = fixture(t, Buffer.from('null\n'));
  const first = addNode({ title: 'ordinary' }, source).node;
  const second = addNode({ title: 'receipted', requestId: 'after-null' }, source).node;
  assert.equal(replay(source).nodes[first.id].title, 'ordinary');
  assert.equal(replay(source).nodes[second.id].title, 'receipted');
  assert.equal(replay(source).integrity.rejected, 1);
  assert.equal(getReceipt('after-null', source).status, 'committed');
});

test('fatal UTF-8 decoding isolates bad lines and offsets always follow raw newline bytes', (t) => {
  const prefix = line(node('prefix', { title: '字节' }));
  const bad = Buffer.concat([Buffer.from('{"op":"custom-operation","text":"'), Buffer.from([0xff]), Buffer.from('"}\n')]);
  const good = line(node('sibling'));
  const bytes = Buffer.concat([prefix, bad, good]);
  const { source, backup, target } = fixture(t, bytes);
  const log = readEvents(source);
  assert.deepEqual(log.events.map((event) => event.node.id), ['prefix', 'sibling']);
  assert.equal(log.corrupt, 1);
  assert.equal(log.invalidRecords, 0);
  assert.equal(log.invalidUtf8, true);
  assert.deepEqual(log.corruptAt, [1]);
  assert.deepEqual(log.invalidUtf8At, [1]);
  assert.equal(log.offset, bytes.length);
  const delta = readEvents(source, prefix.length);
  assert.deepEqual(delta.events, [node('sibling')]);
  assert.equal(delta.offset, bytes.length);
  assert.equal(delta.corrupt, 1);
  assertBackupParity(source, backup, target);
  const appended = addNode({ title: 'after invalid UTF-8' }, source).node;
  const next = readEvents(source, log.offset);
  assert.equal(next.corrupt, 0);
  assert.deepEqual(next.events.map((event) => event.node.id), [appended.id]);
  assert.equal(next.offset, fs.statSync(paths(source).events).size);
  assert.deepEqual(fs.readFileSync(paths(source).events).subarray(0, bytes.length), bytes);
});

test('complete prefixes report all trailing bytes without repairing partial UTF-8 tails', (t) => {
  const prefix = line(node('prefix'));
  const tail = Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xe4, 0xb8]);
  const bytes = Buffer.concat([prefix, tail]);
  const { source, backup, target } = fixture(t, bytes);
  const log = readEvents(source);
  assert.equal(log.offset, prefix.length);
  assert.equal(log.truncated, true);
  assert.equal(log.incompleteTailBytes, tail.length);
  assert.equal(log.invalidUtf8, false, 'an unfinished line is a tail, not a corrupt complete line');
  assert.equal(replay(source).integrity.incompleteTailBytes, tail.length);
  assert.deepEqual(readEvents(source, prefix.length).events, []);
  assertBackupParity(source, backup, target);
});

test('empty sources have no tail; BOM and CRLF retain accepted events and exact byte offsets', (t) => {
  const { source } = fixture(t);
  assert.equal(readEvents(source).truncated, false);
  assert.equal(readEvents(source).incompleteTailBytes, 0);
  assert.deepEqual(replay(source).integrity, { corruptLines: 0, rejected: 0, futureEvents: 0, unknownOps: 0 });
  const event = node('bom');
  const bytes = Buffer.from(`\ufeff${JSON.stringify(event)}\r\n`);
  fs.writeFileSync(paths(source).events, bytes);
  assert.deepEqual(readEvents(source).events, [event]);
  assert.equal(readEvents(source).offset, bytes.length);
  assert.equal(readEvents(source).truncated, false);
});

test('reset clears graph state but preserves historical rejected and unknown counts', (t) => {
  const events = [node('old'), { op: 'edge', edge: { id: 'dangling', from: 'old', to: 'missing', kind: 'custom' } }, { op: 'custom-before' }, { op: 'reset' }, node('current'), { op: 'custom-after' }, { op: 'reset' }, node('last')];
  const { source, backup, target } = fixture(t, Buffer.concat([line(null), ...events.map(line)]));
  const graph = replay(source);
  assert.deepEqual(Object.keys(graph.nodes), ['last']);
  assert.equal(graph.integrity.rejected, 2);
  assert.equal(graph.integrity.unknownOps, 2);
  const direct = applyAll(emptyGraph(), events);
  assert.equal(direct.integrity.rejected, 1);
  assert.equal(direct.integrity.unknownOps, 2);
  assertBackupParity(source, backup, target);
});

test('as-of diagnostics match a physical checkpoint cut and exclude later damage and tails', (t) => {
  const before = Buffer.concat([
    line(node('before')), line(null), Buffer.from([0xff, 0x0a]),
    line({ op: 'custom-before' }), line({ op: 'reset' }),
    line({ op: 'custom-before-again' }),
    line({ op: 'custom-future', eventVersion: EVENT_VERSION + 1 }), line(checkpoint('cp1')),
  ]);
  const after = Buffer.concat([line(null), Buffer.from([0xff, 0x0a]), line({ op: 'custom-future', eventVersion: EVENT_VERSION + 1 }), line(checkpoint('cp2')), Buffer.from('{tail')]);
  const { source, root } = fixture(t, Buffer.concat([before, after]));
  const cut = path.join(root, 'cut');
  ensure(cut);
  fs.writeFileSync(paths(cut).events, before);
  const at = readEventsAsOf(source, 'cp1');
  assert.deepEqual(replay(source, at), replay(cut));
  assert.equal(at.invalidRecords, 1);
  assert.equal(at.corrupt, 1);
  assert.equal(at.future, 1);
  assert.equal(at.invalidUtf8, true);
  assert.equal(at.truncated, false);
  assert.equal(at.incompleteTailBytes, 0);
  assert.equal(Object.hasOwn(replay(source, at).integrity, 'incompleteTailBytes'), false);
  assert.equal(readEvents(source).incompleteTailBytes, Buffer.byteLength('{tail'));
  // A checkpoint with all UTF-8 damage after it must not inherit that flag.
  fs.writeFileSync(paths(source).events, Buffer.concat([line(checkpoint('clean')), Buffer.from([0xff, 0x0a]), Buffer.from('null\n{tail')]));
  const clean = readEventsAsOf(source, 'clean');
  assert.equal(clean.invalidUtf8, false);
  assert.equal(clean.invalidRecords, 0);
  assert.equal(clean.corrupt, 0);
  assert.equal(clean.incompleteTailBytes, 0);
});

test('future versions are skipped before current payload validation and block new writes unchanged', (t) => {
  const bytes = Buffer.concat([line(node('legacy')), line({ op: 'node', eventVersion: EVENT_VERSION + 1, node: null }), line(checkpoint('cp1'))]);
  const { source, backup, target } = fixture(t, bytes);
  const log = readEvents(source);
  assert.equal(log.future, 1);
  assert.equal(log.invalidRecords, 0);
  assert.equal(replay(source).integrity.futureEvents, 1);
  assert.throws(() => addNode({ title: 'blocked' }, source), /Writes are disabled/);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.integrity.futureEvents, 1);
  assert.throws(() => restoreBoard(backup, target), /future eventVersion/);
  assert.deepEqual(fs.readFileSync(paths(source).events), bytes);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'events.jsonl')), bytes);
});
