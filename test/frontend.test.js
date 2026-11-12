import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ensure, paths, readEvents, addNode as storeAddNode } from '../lib/store.js';
import { startServer } from '../lib/server.js';
import { webcrypto } from 'node:crypto';

globalThis.crypto ??= webcrypto;

// Compile pure viewer modules without requiring a DOM or a specific Node TS loader.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-presenter-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
const root = fileURLToPath(new URL('../', import.meta.url));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', dir, path.join(root, 'web/src/presentation.ts'), path.join(root, 'web/src/api.ts'), path.join(root, 'web/src/workspace/selectors.ts')], { cwd: dir });
function resolveModuleExtensions(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const p = path.join(directory, entry.name);
    if (entry.isDirectory()) resolveModuleExtensions(p);
    else if (entry.name.endsWith('.js')) fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_all, name) => `from '${name}.js'`));
  }
}
resolveModuleExtensions(dir);
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const modulePath = path.join(dir, 'presentation.js');
const { confidenceLabel, presentNode, nodeStateSummary, matchesNode, statusLabel, severityLabel, typeLabel } = await import(pathToFileURL(modulePath).href);
const { changeDraft, EMPTY_EDIT, EMPTY_NEW, existingLink, parseTags, nodeInputFromDraft, nodePatchFromDraft, sourceLocation, historyValue } = await import(pathToFileURL(path.join(dir, 'research-state.js')).href);
const api = await import(pathToFileURL(path.join(dir, 'api.js')).href);
const { selectWorkspaceSnapshot, selectWorkspaceAgent } = await import(pathToFileURL(path.join(dir, 'workspace/selectors.js')).href);
const node = { id: 'node-7', type: 'hypothesis', title: 'Gateway policy。Verify middleware next.', detail: 'Session boundary', status: 'open', severity: 'high', confidence: 'static-confirmed' };

test('node presenter splits a heading from evidence without rewriting it', () => {
  assert.deepEqual(presentNode(node), { headline: 'Gateway policy', summary: 'Verify middleware next.', detail: 'Session boundary' });
});
test('node presenter preserves route names and decimal punctuation', () => {
  assert.equal(presentNode({ title: '4.1.8 branchEmpList.do uses a route' }).headline, '4.1.8 branchEmpList.do uses a route');
});
test('node presenter uses explicit detail when the title is one sentence', () => {
  assert.equal(presentNode({ title: 'A short finding', detail: 'Evidence' }).summary, 'Evidence');
});
test('node presenter handles multiline and blank authored titles', () => {
  assert.equal(presentNode({ title: 'Heading\nBody' }).summary, 'Body');
  assert.equal(presentNode({ title: '  ' }).headline, '未命名节点');
});
test('board search matches id, detail and localized type/confidence, case-insensitively', () => {
  for (const query of ['NODE-7', 'session boundary', '猜测', '待验证', '高危', '静态确认']) assert.equal(matchesNode(node, query), true, query);
});
test('board search applies all terms and rejects unrelated text', () => {
  assert.equal(matchesNode(node, 'gateway session'), true);
  assert.equal(matchesNode(node, 'gateway missing'), false);
  assert.equal(matchesNode(node, '   '), true);
});
test('unknown states and custom types keep their authored labels', () => {
  assert.equal(statusLabel('custom'), 'custom');
  assert.equal(typeLabel('decision'), 'decision');
  assert.equal(severityLabel('custom'), 'custom');
  assert.equal(confidenceLabel('custom'), 'custom');
});
test('missing states are represented explicitly instead of a false status', () => {
  assert.equal(statusLabel(), '未设置');
  assert.equal(severityLabel(), '未评估');
  assert.equal(confidenceLabel(), '未声明');
});


test('source locations are rendered as inert text and searchable with tags and author', () => {
  const sourced = { ...node, loc: { path: 'src/auth.ts', line: 42, column: 3 }, tags: ['session-boundary'], author: 'agent:review' };
  assert.equal(sourceLocation(sourced), 'src/auth.ts:42:3');
  for (const query of ['auth.ts:42', 'session-boundary', 'agent:review']) assert.equal(matchesNode(sourced, query), true);
  assert.equal(sourceLocation({ ...node, loc: 'javascript:alert(1)' }), 'javascript:alert(1)');
  assert.equal(sourceLocation({ ...node, loc: { path: 42 } }), '');
});
test('edit drafts preserve the first baseline across live updates and only patch changed fields', () => {
  const initial = { ...EMPTY_EDIT, editing: true };
  const draft = changeDraft(initial, node, 'title', 'New title');
  const live = { ...node, title: 'Agent title', detail: 'New evidence', status: 'done' };
  const next = changeDraft(draft, live, 'title', 'Another title');
  assert.deepEqual(next.fields, { title: 'Another title' });
  assert.deepEqual(next.expected, { title: node.title });
  assert.deepEqual(initial.fields, {}, 'draft helper does not mutate its input');
  const undone = changeDraft(next, live, 'title', node.title);
  assert.deepEqual(undone.fields, {});
  assert.deepEqual(undone.expected, {});
});
test('status, risk, and confidence edits remain orthogonal and retain conflict drafts', () => {
  let draft = { ...EMPTY_EDIT, editing: true, conflict: true };
  draft = changeDraft(draft, node, 'severity', 'low');
  assert.deepEqual(draft.fields, { severity: 'low' });
  assert.deepEqual(draft.expected, { severity: 'high' });
  draft = changeDraft(draft, node, 'confidence', 'suspected');
  assert.deepEqual(draft.fields, { severity: 'low', confidence: 'suspected' });
  assert.equal(draft.conflict, true, 'editing never clears an unresolved conflict');
  assert.equal('status' in draft.fields, false);
  assert.equal(node.status, 'open');
});
test('previously unset fields use the empty-string API baseline without inventing other states', () => {
  const draft = changeDraft(EMPTY_EDIT, { id: 'n', type: 'custom', title: 'N' }, 'confidence', 'confirmed');
  assert.deepEqual(draft.fields, { confidence: 'confirmed' });
  assert.deepEqual(draft.expected, { confidence: '' });
});
test('existing-node links default to weak semantics and preview exactly the submitted direction', () => {
  assert.deepEqual(existingLink('a', 'b', 'outgoing'), { from: 'a', to: 'b', kind: 'related-to' });
  assert.deepEqual(existingLink('a', 'b', 'incoming', 'contradicts'), { from: 'b', to: 'a', kind: 'contradicts' });
  assert.equal(existingLink('a', '', 'outgoing'), null);
  assert.equal(existingLink('a', 'a', 'outgoing'), null);
});
test('history values distinguish absent, empty, and structured data', () => {
  assert.equal(historyValue(null), '∅'); assert.equal(historyValue(undefined), '∅');
  assert.equal(historyValue(''), '""');
  assert.equal(historyValue({ status: 'refuted' }), '{"status":"refuted"}');
});
test('history reads encode exact identities and only perform same-origin GET requests', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ readOnly: true }) }; };
  try {
    await api.getNodeHistory('a/b?x'); await api.getCheckpointChanges('cp#1');
    assert.deepEqual(calls.map(({ url }) => url), ['/api/history?node=a%2Fb%3Fx', '/api/changes?since=cp%231']);
    assert.ok(calls.every(({ init }) => init.method === 'GET' && init.body === undefined));
  } finally { globalThis.fetch = previous; }
});
test('API conflicts preserve structured conflicting fields instead of treating the write as success', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: 'node_conflict', fields: ['severity', null, 7] }), { status: 409 });
  try {
    await assert.rejects(api.patchNode('n', { severity: 'low', expected: { severity: 'high' } }), (error) => {
      assert.ok(error instanceof api.NodeConflict);
      assert.deepEqual(error.fields, ['severity']);
      return true;
    });
  } finally { globalThis.fetch = previous; }
});

test('unreadable successful writes check the receipt once and preserve the unconfirmed operation', async () => {
  const previous = globalThis.fetch;
  const responses = [
    new Response('{', { status: 200 }), new Response('', { status: 201 }),
    new Response('null', { status: 200 }), new Response('[]', { status: 200 }),
    new Response('true', { status: 200 }),
    new Response(new ReadableStream({ start(controller) { controller.error(new Error('Interrupted body')); } }), { status: 200 }),
  ];
  try {
    for (const response of responses) {
      const operation = new api.WriteOperation();
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push({ url, init });
        return init.method === 'GET' ? new Response('{"error":"receipt_not_found"}', { status: 404 }) : response;
      };
      await assert.rejects(api.patchNode('n', { title: 'Draft title' }, operation), { code: 'write_unconfirmed' });
      assert.equal(operation.locked, true);
      assert.deepEqual(calls.map(({ init }) => init.method), ['PATCH', 'GET']);
      assert.equal(calls[1].url, `/api/receipt?requestId=${calls[0].init.headers['Idempotency-Key']}`);
      assert.equal(calls[1].init.body, undefined);
    }
  } finally { globalThis.fetch = previous; }
});

test('unstructured server errors remain uncertain and never trigger an automatic second mutation', async () => {
  const previous = globalThis.fetch;
  try {
    for (const body of ['<html>Bad gateway</html>', 'null', '[]', '42', '{"error":{"message":"upstream failed"}}']) {
      const operation = new api.WriteOperation();
      const methods = [];
      globalThis.fetch = async (_url, init) => { methods.push(init.method); return new Response(body, { status: 502 }); };
      await assert.rejects(api.patchNode('n', { title: 'Draft title' }, operation), { code: 'write_unconfirmed' });
      assert.equal(operation.locked, true);
      assert.deepEqual(methods, ['PATCH', 'GET']);
    }
  } finally { globalThis.fetch = previous; }
});

test('well-formed API responses return their JSON result', async () => {
  const previous = globalThis.fetch;
  const result = { node: { id: 'created-node', type: 'note', title: 'A note' }, edges: [] };
  globalThis.fetch = async () => new Response(JSON.stringify(result), { status: 201 });
  try { assert.deepEqual(await api.addNode({ type: 'note', title: 'A note' }), result); }
  finally { globalThis.fetch = previous; }
});

test('viewer writes opt into rejecting truncated input while preserving the submitted fields and baselines', async () => {
  const previous = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return { ok: true, json: async () => init.method === 'POST' ? { node: { id: 'n1', type: 'finding', title: 'Authored title' }, edges: [] } : { id: 'n/1', type: 'finding', title: 'Authored title' } };
  };
  const create = { type: 'finding', title: 'Authored title', detail: 'Authored detail' };
  const patch = { detail: 'Changed detail', expected: { detail: 'Authored detail' } };
  try {
    await api.addNode(create); await api.patchNode('n/1', patch);
    assert.deepEqual(calls, [
      { url: '/api/nodes', body: { ...create, rejectTruncation: true } },
      { url: '/api/nodes/n%2F1', body: { ...patch, rejectTruncation: true } },
    ]);
    assert.equal('rejectTruncation' in create, false, 'sending must not mutate the creation draft');
    assert.equal('rejectTruncation' in patch, false, 'sending must not mutate the edit draft');
  } finally { globalThis.fetch = previous; }
});

test('viewer length rejection explains that nothing was saved rather than treating the write as success', async () => {
  const previous = globalThis.fetch;
  // Match the server's error envelope: the stable code is separate from its readable message.
  const responses = [
    { error: 'input too long: detail (20001 > 20000); no text was saved', code: 'input_too_long', fields: ['detail'], limits: { detail: { originalLength: 20001, storedLength: 20000 } } },
    { error: 'input_too_long', fields: ['detail'] },
  ];
  try {
    for (const response of responses) {
      globalThis.fetch = async () => ({ ok: false, status: 422, json: async () => response });
      await assert.rejects(api.patchNode('n', { detail: 'x'.repeat(20001) }), /未保存.*详情/);
    }
  }
  finally { globalThis.fetch = previous; }
});


test('canvas state summary never hides a refuted status behind a reproduced confidence', () => {
  assert.equal(nodeStateSummary({ status: 'refuted', severity: 'high', confidence: 'reproduced' }), '已反驳 · 高危 · 已复现');
  assert.equal(nodeStateSummary({ confidence: 'confirmed' }), '已确认');
  assert.equal(nodeStateSummary({}), '');
});

test('workspace catalogues preserve authored order, stable severity ties and open-thread semantics', () => {
  const nodes = Object.freeze([
    { id: 'a', type: 'finding', title: 'Critical finding', severity: 'critical', status: 'open', ts: 5 },
    { id: 'b', type: 'vuln', title: 'First high finding', severity: 'high', ts: 10 },
    { id: 'c', type: 'finding', title: 'Second high finding', severity: 'high', status: 'confirmed', confidence: 'static-confirmed', ts: 10 },
    { id: 'd', type: 'finding', title: 'Custom risk', severity: 'custom', ts: 0 },
    { id: 's', type: 'finding', title: 'Superseded finding', severity: 'critical', status: 'superseded', ts: 99 },
    { id: 'h', type: 'hypothesis', title: 'Unset status is open', status: null, ts: 20 },
    { id: 'q', type: 'question', title: 'Blocked thread', status: 'blocked', ts: 1 },
    { id: 'i', type: 'intent', title: 'Deferred thread', status: 'deferred', ts: 2 },
    { id: 'n', type: 'custom', title: 'Unlinked note', ts: 0 },
  ]);
  const edges = Object.freeze([
    { id: 'e1', from: 'a', to: 'h', kind: 'supports' },
    { id: 'e2', from: 'b', to: 'absent', kind: 'related-to' },
  ]);
  const activities = Object.freeze([{ id: 'old', at: 1 }, { id: 'new', at: 2 }, { id: 'tie', at: 2 }]);
  const snapshot = { meta: {}, nodes, edges, activities, stats: { vulns: { critical: 1, high: 2 }, frontier: 7, candidates: 2 } };
  const board = selectWorkspaceSnapshot(snapshot);
  assert.deepEqual(board.findings.map((item) => item.id), ['a', 'b', 'c', 'd']);
  assert.deepEqual(board.openItems.map((item) => item.id), ['q', 'h']);
  assert.deepEqual(board.inbox.map((item) => item.id), ['n', 'i', 'q', 's', 'd', 'c']);
  assert.deepEqual(board.paletteNodes.map((item) => item.id), ['s', 'h', 'b', 'c', 'a', 'i', 'q', 'd', 'n']);
  assert.deepEqual(board.activities.map((item) => item.id), ['new', 'tie', 'old']);
  assert.deepEqual(activities.map((item) => item.id), ['old', 'new', 'tie'], 'sorting must leave the streamed snapshot untouched');
  assert.equal(board.byId.get('c'), nodes[2], 'inspector and catalogues share the original node objects');
  assert.deepEqual(board.counts, { nodes: 9, edges: 2, risk: 3, open: 7, candidates: 2 });
  assert.equal(board.filterOptions.riskCount, 4, 'risk facets include superseded nodes independently of sidebar grouping');
  assert.deepEqual(board.filterOptions.types.map(({ value, count }) => [value, count]), [
    ['finding', 4], ['vuln', 1], ['hypothesis', 1], ['question', 1], ['intent', 1], ['custom', 1],
  ]);
  assert.deepEqual(board.filterOptions.statuses.map(({ value, count }) => [value, count]), [
    ['', 4], ['open', 1], ['confirmed', 1], ['superseded', 1], ['blocked', 1], ['deferred', 1],
  ]);
  assert.deepEqual(board.filterOptions.confidences, [{ value: '', count: 8 }, { value: 'static-confirmed', count: 1 }]);
  const records = selectWorkspaceSnapshot({ ...snapshot, nodes: Object.fromEntries(nodes.map((item) => [item.id, item])), edges: Object.fromEntries(edges.map((item) => [item.id, item])), activities: Object.fromEntries(activities.map((item) => [item.id, item])) });
  assert.deepEqual(records, board, 'record and array snapshots present the same catalogues');
});

test('workspace Agent perspectives preserve explicit identities and isolate cursor and digest fallbacks', () => {
  const primary = { id: 'p', type: 'finding', title: 'Primary focus', severity: 'high' };
  const review = { id: 'r', type: 'hypothesis', title: 'Review focus', status: 'blocked' };
  const snapshot = {
    meta: { focus: primary.id }, nodes: [primary, review], edges: [],
    cursors: {
      'agent:primary': { id: 'cp', agentId: 'agent:primary', to: primary.id },
      'agent:review': { id: 'cr', agentId: 'agent:review', to: review.id },
      'agent:ghost': { id: 'cg', agentId: 'agent:ghost', to: 'removed' },
    },
    checkpoints: { archive: { agentId: 'agent:archive' }, review: { agentId: 'agent:review' } },
    digest: 'Legacy primary digest', digests: { 'agent:review': 'Review digest' },
  };
  const before = structuredClone(snapshot);
  const board = selectWorkspaceSnapshot(snapshot);
  const main = selectWorkspaceAgent(snapshot, board, 'agent:primary');
  const reviewer = selectWorkspaceAgent(snapshot, board, 'agent:review');
  const unknown = selectWorkspaceAgent(snapshot, board, 'agent:pending');
  assert.equal(main.current, primary);
  assert.equal(main.digest, 'Legacy primary digest');
  assert.deepEqual(main.findings, []);
  assert.deepEqual(main.openItems, [review]);
  assert.equal(reviewer.currentId, review.id);
  assert.equal(reviewer.current, review);
  assert.equal(reviewer.digest, 'Review digest');
  assert.deepEqual(reviewer.findings, [primary]);
  assert.deepEqual(reviewer.openItems, []);
  assert.deepEqual(unknown.agentIds, ['agent:primary', 'agent:archive', 'agent:ghost', 'agent:pending', 'agent:review']);
  assert.equal(unknown.currentId, null);
  assert.equal(unknown.current, null);
  assert.equal(unknown.digest, '');
  assert.equal(selectWorkspaceAgent(snapshot, board, 'agent:ghost').current, null);
  assert.equal(selectWorkspaceAgent({ ...snapshot, digests: { 'agent:primary': '' } }, board, 'agent:primary').digest, '', 'an explicit empty digest never falls back to the legacy digest');
  assert.equal(selectWorkspaceAgent({ ...snapshot, cursors: {} }, board, 'agent:primary').current, primary, 'legacy focus belongs only to primary');
  assert.deepEqual(snapshot, before, 'reading another perspective cannot move a cursor or rewrite the snapshot');
});

test('workspace catalogues are usable while the first snapshot is still loading', () => {
  const board = selectWorkspaceSnapshot(null);
  const agent = selectWorkspaceAgent(null, board, 'agent:waiting');
  assert.deepEqual(board.allNodes, []);
  assert.deepEqual(board.allEdges, []);
  assert.deepEqual(board.filterOptions, { types: [], statuses: [], confidences: [], riskCount: 0 });
  assert.deepEqual(board.counts, { nodes: 0, edges: 0, risk: 0, open: 0, candidates: 0 });
  assert.deepEqual(agent.agentIds, ['agent:primary', 'agent:waiting']);
  assert.equal(agent.current, null);
  assert.equal(agent.digest, '');
});

test('metadata drafts serialize exact tags and source columns with unset baselines', () => {
  const initial = { id: 'n', type: 'condition', title: 'Gate' };
  let draft = changeDraft(EMPTY_EDIT, initial, 'tags', '["issue=q1","a,b","  spaced  ","line\\nbreak"]');
  draft = changeDraft(draft, initial, 'at', 'src/gate.ts:12:7');
  assert.deepEqual(nodePatchFromDraft(draft), {
    tags: ['issue=q1', 'a,b', '  spaced  ', 'line\nbreak'], at: 'src/gate.ts:12:7',
    expected: { tags: null, at: null },
  });
  const sourced = { ...initial, tags: ['a,b', 'same'], loc: { path: 'src/gate.ts', line: 12, column: 7 } };
  draft = changeDraft(EMPTY_EDIT, sourced, 'tags', '[]');
  draft = changeDraft(draft, sourced, 'at', '');
  assert.deepEqual(nodePatchFromDraft(draft), { tags: [], at: null, expected: { tags: ['a,b', 'same'], at: 'src/gate.ts:12:7' } });
  assert.deepEqual(changeDraft(EMPTY_EDIT, sourced, 'tags', '[ "a,b", "same" ]').fields, {}, 'formatting alone is not an edit');
  assert.deepEqual(changeDraft(EMPTY_EDIT, initial, 'tags', '[]').fields, {}, 'an absent array displays empty without creating a write');
  assert.deepEqual(parseTags(''), []);
  for (const invalid of ['{', '{}', 'null', '[1]', '["ok",null]']) assert.throws(() => parseTags(invalid));
});

test('metadata edits keep first baselines across SSE updates and omit untouched fields', () => {
  const initial = { ...node, tags: ['issue=q1', 'a,b'], loc: { path: 'src/a.ts', line: 3, column: 4 } };
  let draft = changeDraft(EMPTY_EDIT, initial, 'tags', '["issue=q2","a,b"]');
  draft = changeDraft(draft, initial, 'at', 'src/a.ts:3:9');
  const live = { ...initial, title: 'Agent title', detail: 'Fresh evidence', severity: 'low', tags: ['agent-tag'], loc: { path: 'src/agent.ts', line: 8 } };
  draft = changeDraft(draft, live, 'tags', '["issue=q3","a,b"]');
  draft = changeDraft(draft, live, 'at', 'src/a.ts:3:12');
  assert.deepEqual(nodePatchFromDraft(draft), {
    tags: ['issue=q3', 'a,b'], at: 'src/a.ts:3:12',
    expected: { tags: ['issue=q1', 'a,b'], at: 'src/a.ts:3:4' },
  });
  const titleOnly = changeDraft(EMPTY_EDIT, live, 'title', 'Human title');
  assert.deepEqual(nodePatchFromDraft(titleOnly), { title: 'Human title', expected: { title: 'Agent title' } });
});

test('invalid tags remain in the draft until corrected without losing their baseline', () => {
  const initial = { ...node, tags: ['original,tag'] };
  const draft = changeDraft(EMPTY_EDIT, initial, 'tags', '["valid",3]');
  assert.throws(() => nodePatchFromDraft(draft));
  assert.deepEqual(draft.fields, { tags: '["valid",3]' });
  assert.deepEqual(draft.expected, { tags: '["original,tag"]' });
  const fixed = changeDraft(draft, { ...initial, tags: ['agent-tag'] }, 'tags', '["fixed,tag"]');
  assert.deepEqual(nodePatchFromDraft(fixed), { tags: ['fixed,tag'], expected: { tags: ['original,tag'] } });
});

async function writeServer(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-writes-'));
  ensure(cwd);
  const server = await startServer({ cwd, port: 0 });
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    fs.rmSync(cwd, { recursive: true, force: true });
  });
  return { cwd, base };
}

test('viewer resolves lost responses for all five commands using real committed receipts', async (t) => {
  const { cwd, base } = await writeServer(t);
  const originalFetch = globalThis.fetch;
  const current = storeAddNode({ title: 'Current' }, cwd).node;
  const requests = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url, init });
      const response = await originalFetch(`${base}${url}`, { ...init, headers: { ...init.headers, Origin: base } });
      if (init.method !== 'GET') {
        await response.arrayBuffer();
        throw new Error('Connection lost after commit');
      }
      return response;
    };
    const ids = new Set();
    async function lost(action) {
      const operation = new api.WriteOperation();
      let completed = 0;
      operation.onSuccess = () => { completed++; };
      const result = await action(operation);
      assert.equal(completed, 1);
      assert.equal(operation.locked, false);
      const count = readEvents(cwd).events.length;
      await operation.retry();
      assert.equal(readEvents(cwd).events.length, count);
      const writes = requests.filter(({ init }) => init.method !== 'GET');
      const write = writes.at(-1);
      const key = write.init.headers['Idempotency-Key'];
      assert.ok(key);
      assert.equal(ids.has(key), false);
      ids.add(key);
      if (write.init.method === 'DELETE') assert.equal(write.init.body, undefined);
      return result;
    }
    const created = await lost((operation) => api.addNode(nodeInputFromDraft({ ...EMPTY_NEW, type: 'condition', title: 'New evidence', link: 'supports' }, current.id), operation));
    assert.equal(created.edges[0].from, created.node.id);
    assert.equal(created.edges[0].to, current.id);
    const patched = await lost((operation) => api.patchNode(created.node.id, { title: 'Revised', expected: { title: 'New evidence' } }, operation));
    assert.equal(patched.title, 'Revised');
    const edge = await lost((operation) => api.addEdge(current.id, created.node.id, 'contradicts', 'Explicit disagreement', operation));
    const removedEdge = await lost((operation) => api.removeEdge(edge.id, operation));
    assert.equal(removedEdge.id, edge.id);
    const removedNode = await lost((operation) => api.removeNode(created.node.id, operation));
    assert.equal(removedNode.id, created.node.id);
    assert.equal(requests.filter(({ init }) => init.method !== 'GET').length, 5);
    assert.equal(readEvents(cwd).events.filter((event) => event.op === 'receipt').length, 5);
    assert.equal(readEvents(cwd).events.filter((event) => event.op === 'node').length, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('a missing or unreachable receipt retains immutable payload and ID until an explicit singleflight retry', async (t) => {
  const { cwd, base } = await writeServer(t);
  const originalFetch = globalThis.fetch;
  const operation = new api.WriteOperation();
  const input = { type: 'note', title: 'Original draft', tags: ['authored'] };
  const writes = [];
  let receiptMode = 'missing';
  try {
    globalThis.fetch = async (url, init) => {
      if (init.method !== 'GET') { writes.push({ url, init }); throw new Error('No response before send'); }
      if (receiptMode === 'unreachable') throw new Error('Receipt network unavailable');
      return originalFetch(`${base}${url}`, init);
    };
    const first = api.addNode(input, operation);
    const doubleClick = api.addNode(input, operation);
    assert.equal(first, doubleClick);
    await assert.rejects(first, { code: 'write_unconfirmed' });
    const key = operation.requestId;
    assert.equal(operation.locked, true);
    assert.equal(writes.length, 1);
    assert.equal(readEvents(cwd).events.length, 0);
    input.title = 'Edited after submit';
    input.tags.push('later');
    await assert.rejects(api.addNode(input, operation));
    assert.equal(operation.requestId, key);
    await assert.rejects(operation.check(), { code: 'write_unconfirmed' });
    receiptMode = 'unreachable';
    await assert.rejects(operation.check(), { code: 'write_unconfirmed' });
    assert.equal(operation.locked, true);
    globalThis.fetch = async (url, init) => {
      writes.push({ url, init });
      return originalFetch(`${base}${url}`, { ...init, headers: { ...init.headers, Origin: base } });
    };
    const retry = operation.retry();
    assert.equal(operation.retry(), retry);
    const result = await retry;
    assert.equal(result.node.title, 'Original draft');
    assert.deepEqual(result.node.tags, ['authored']);
    assert.equal(writes.length, 2);
    assert.equal(writes[1].init.body, writes[0].init.body);
    assert.equal(writes[1].init.headers['Idempotency-Key'], key);
    assert.equal(operation.locked, false);
    assert.deepEqual(readEvents(cwd).events.map((event) => event.op), ['node', 'receipt']);
  } finally { globalThis.fetch = originalFetch; }
});

test('a partial real transaction remains pending on lookup and completes only on an identical explicit retry', async (t) => {
  const { cwd, base } = await writeServer(t);
  const current = storeAddNode({ title: 'Existing candidate' }, cwd).node;
  const originalFetch = globalThis.fetch;
  const operation = new api.WriteOperation();
  const writes = [];
  let interrupt = true;
  try {
    globalThis.fetch = async (url, init) => {
      const response = await originalFetch(`${base}${url}`, { ...init, headers: { ...init.headers, Origin: base } });
      if (init.method !== 'GET') {
        writes.push(init);
        if (interrupt) {
          interrupt = false;
          await response.arrayBuffer();
          const lines = fs.readFileSync(paths(cwd).events, 'utf8').trimEnd().split('\n');
          const first = lines.findIndex((line) => JSON.parse(line).request?.requestId === operation.requestId);
          assert.ok(first >= 0);
          fs.writeFileSync(paths(cwd).events, `${lines.slice(0, first + 1).join('\n')}\n`);
          return new Response(JSON.stringify({ error: 'EIO after a partial append' }), { status: 400 });
        }
      }
      return response;
    };
    await assert.rejects(api.addNode(nodeInputFromDraft({ ...EMPTY_NEW, title: 'Atomic relation', link: 'related-to' }, current.id), operation), { code: 'write_unconfirmed' });
    const before = fs.readFileSync(paths(cwd).events, 'utf8');
    await assert.rejects(operation.check(), { code: 'write_unconfirmed' });
    assert.equal(fs.readFileSync(paths(cwd).events, 'utf8'), before);
    assert.equal(operation.locked, true);
    const result = await operation.retry();
    assert.equal(result.edges.length, 1);
    assert.equal(result.edges[0].from, current.id);
    assert.equal(result.edges[0].to, result.node.id);
    assert.equal(writes[0].body, writes[1].body);
    assert.equal(writes[0].headers['Idempotency-Key'], writes[1].headers['Idempotency-Key']);
    assert.deepEqual(readEvents(cwd).events.map((event) => event.op), ['node', 'node', 'edge', 'receipt']);
    assert.equal(operation.locked, false);
  } finally { globalThis.fetch = originalFetch; }
});

test('definite validation rejection unlocks a corrected draft with a fresh identity', async (t) => {
  const { cwd, base } = await writeServer(t);
  const originalFetch = globalThis.fetch;
  const writes = [];
  const operation = new api.WriteOperation();
  try {
    globalThis.fetch = (url, init) => {
      writes.push(init);
      return originalFetch(`${base}${url}`, { ...init, headers: { ...init.headers, Origin: base } });
    };
    await assert.rejects(api.addNode({ type: 'note', title: 'Draft', detail: 'x'.repeat(20001) }, operation));
    assert.equal(operation.locked, false);
    assert.equal(readEvents(cwd).events.length, 0);
    const result = await api.addNode({ type: 'note', title: 'Corrected' }, operation);
    assert.equal(result.node.title, 'Corrected');
    assert.notEqual(writes[0].headers['Idempotency-Key'], writes[1].headers['Idempotency-Key']);
    assert.deepEqual(readEvents(cwd).events.map((event) => event.op), ['node', 'receipt']);
  } finally { globalThis.fetch = originalFetch; }
});

test('mismatched receipt identity, command or result cannot release an unresolved write', async () => {
  const originalFetch = globalThis.fetch;
  const operation = new api.WriteOperation();
  let completed = 0;
  operation.onSuccess = () => { completed++; };
  let override = { command: 'removeNode' };
  try {
    globalThis.fetch = async (_url, init) => {
      if (init.method !== 'GET') throw new Error('No response');
      return new Response(JSON.stringify({ schema: 'pinwhy.receipt-response.v1', readOnly: true,
        receipt: { requestId: operation.requestId, command: 'addNode', status: 'committed',
          result: { node: { id: 'n1', type: 'note', title: 'Original' }, edges: [] }, ...override } }));
    };
    await assert.rejects(api.addNode({ type: 'note', title: 'Original' }, operation), { code: 'write_unconfirmed' });
    for (const invalid of [{ requestId: 'another-request' }, { result: { id: 'unrelated-edge' } }, { result: { node: { id: 'n1' }, edges: [] } }]) {
      override = invalid;
      await assert.rejects(operation.check(), { code: 'write_unconfirmed' });
      assert.equal(operation.locked, true);
      assert.equal(completed, 0);
    }
    override = {};
    await operation.check();
    assert.equal(operation.locked, false);
    assert.equal(completed, 1);
  } finally { globalThis.fetch = originalFetch; }
});
