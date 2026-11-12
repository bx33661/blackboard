import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-audit-projection-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));
execFileSync(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--target', 'ES2022', '--module', 'ESNext', '--moduleResolution', 'Bundler', '--skipLibCheck', '--outDir', dir, path.join(root, 'web/src/workspace/audit.ts')], { cwd: dir });
for (const file of ['types.js', 'workspace/audit.js']) {
  const target = path.join(dir, file);
  fs.writeFileSync(target, fs.readFileSync(target, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (_all, name) => `from '${name}.js'`));
}
fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ type: 'module' }));
const { selectAudit, buildAuditIndex, argumentRole, changeAuditExpansion, AUDIT_BATCH } = await import(pathToFileURL(path.join(dir, 'workspace/audit.js')).href);
const node = (id, type, extra = {}) => ({ id, type, title: `Authored ${id}`, ...extra });
const edge = (id, from, to, kind, extra = {}) => ({ id, from, to, kind, ...extra });
const nodes = [node('q1', 'question'), node('q2', 'goal'), node('c1', 'finding'), node('c2', 'hypothesis'), node('c3', 'vuln'), node('f1', 'fact'), node('p1', 'fact'), node('condition', 'condition'), node('counter', 'result'), node('unrelated', 'fact'), node('custom', 'custom-record')];
const edges = [edge('m1', 'c1', 'q1', 'answers'), edge('m2', 'c2', 'q1', 'answers'), edge('m3', 'c3', 'q2', 'answers'), edge('s1', 'f1', 'c1', 'supports', { label: 'Only under the recorded scope' }), edge('d1', 'c1', 'p1', 'derived-from'), edge('dep1', 'c1', 'condition', 'depends-on'), edge('dep2', 'c3', 'condition', 'depends-on'), edge('oppose', 'counter', 'c2', 'contradicts'), edge('weak', 'counter', 'c1', 'related-to'), edge('beyond', 'unrelated', 'counter', 'supports')];
const snapshot = { meta: {}, nodes, edges };
const index = buildAuditIndex(snapshot);

test('membership indexes use named authored links and exact issue tags without title or run guesses', () => {
  assert.deepEqual(index.membership.get('q1').map((item) => item.id), ['c1', 'c2']);
  assert.deepEqual(index.reverseMembership.get('c3').map((item) => item.id), ['q2']);
  const tagged = [node('a', 'finding', { tags: ['audit=q1', 'issue=q10'] }), node('b', 'finding', { tags: ['issue=q1', 'issue=q1', 'issue=missing'] })];
  const taggedIndex = buildAuditIndex({ meta: {}, nodes: [nodes[0], ...tagged], edges: [] });
  assert.deepEqual(taggedIndex.membership.get('q1').map((item) => item.id), ['b']);
  assert.deepEqual(taggedIndex.unassigned.map((item) => item.id), ['a']);
  for (const kind of ['supports', 'contradicts', 'custom-relation', 'toString', '__proto__']) {
    const unrelatedIndex = buildAuditIndex({ ...snapshot, edges: [edge('x', 'c1', 'q1', kind)] });
    assert.deepEqual(unrelatedIndex.reverseMembership.get('c1'), []);
  }
});
test('argument directions preserve premise, conclusion and condition semantics', () => {
  assert.equal(argumentRole(edges[3], 'c1'), 'support');
  assert.equal(argumentRole(edges[3], 'f1'), 'related');
  assert.equal(argumentRole(edges[4], 'c1'), 'support');
  assert.equal(argumentRole(edges[4], 'p1'), 'related');
  assert.equal(argumentRole(edges[5], 'c1'), 'condition');
  assert.equal(argumentRole(edges[5], 'condition'), 'related');
  assert.equal(argumentRole(edges[8], 'c1'), 'related');
  assert.equal(argumentRole(edges[7], 'c2'), 'contradiction');
  assert.equal(argumentRole(edges[7], 'counter'), 'related');
});
test('related checks never become counterevidence or expand another candidate argument', () => {
  const audit = selectAudit(index, 'q1', 'c1');
  assert.deepEqual(audit.groups.support.map((item) => item.id), ['s1', 'd1']);
  assert.deepEqual(audit.groups.condition.map((item) => item.id), ['dep1']);
  assert.deepEqual(audit.groups.contradiction, []);
  assert.equal(audit.visibleIds.has('counter'), false);
  assert.equal(audit.groups.related.some((item) => item.id === 'weak'), true);
  assert.equal(audit.visibleIds.has('unrelated'), false);
  assert.equal(audit.visibleIds.has('c2'), false);
  assert.equal(audit.snapshot.edges.find((item) => item.id === 's1').label, edges[3].label);
});
test('shared conditions keep original IDs and other candidate references without importing their evidence', () => {
  const audit = selectAudit(index, 'q1', 'c1', 'condition');
  assert.equal(audit.root.id, 'c1');
  assert.equal(audit.snapshot.nodes.filter((item) => item.id === 'condition').length, 1);
  assert.equal(audit.snapshot.nodes.find((item) => item.id === 'condition'), nodes[7]);
  assert.equal(audit.groups.related.some((item) => item.id === 'dep2'), true);
  assert.equal(audit.snapshot.nodes.some((item) => item.id === 'c3'), false);
  const reference = selectAudit(index, 'q1', 'c1', 'c3');
  assert.equal(reference.root.id, 'c1');
  assert.equal(reference.snapshot.nodes.some((item) => item.id === 'c3'), true);
  assert.equal(reference.snapshot.edges.some((item) => item.id === 'dep2'), true);
  assert.equal(reference.snapshot.nodes.some((item) => item.id === 'q2'), false);
  assert.equal(audit.records.find((item) => item.id === 'custom'), nodes[10]);
  assert.equal(selectAudit(index, 'q1', 'c1', 'custom').root.id, 'c1');
});
test('empty and isolated custom boards retain reachable records without invented issues', () => {
  const empty = selectAudit(buildAuditIndex({ meta: {}, nodes: [], edges: [] }), null, null);
  assert.deepEqual(empty.snapshot.nodes, []);
  assert.equal(empty.root, null);
  const custom = node('one', 'custom-record');
  const isolated = selectAudit(buildAuditIndex({ meta: {}, nodes: [custom], edges: [] }), null, null, 'one');
  assert.deepEqual(isolated.issues, []);
  assert.deepEqual(isolated.snapshot.nodes, [custom]);
  assert.equal(isolated.root, null);
});
test('audit landing is a catalog, and reader selection does not infer issue ownership', () => {
  const landing = selectAudit(index, null, null);
  assert.equal(landing.root, null);
  assert.deepEqual(landing.snapshot.nodes, []);
  const searched = selectAudit(index, 'q1', 'c1', 'custom');
  assert.equal(searched.root.id, 'c1');
  assert.equal(searched.issue.id, 'q1');
  assert.equal(searched.visibleIds.has('custom'), true);
  assert.equal(searched.snapshot.edges.some((item) => item.from === 'custom' || item.to === 'custom'), false);
  const mismatch = selectAudit(index, 'q1', 'c3');
  assert.equal(mismatch.issue.id, 'q1');
  assert.equal(mismatch.candidate.id, 'c3');
  assert.equal(mismatch.outsideIssue, true);
  assert.deepEqual(mismatch.candidateIssues.map((item) => item.id), ['q2']);
});
test('further premises are disclosed references without transitive argument expansion', () => {
  const chain = buildAuditIndex({ meta: {}, nodes: [node('claim', 'finding'), ...['a', 'b', 'c', 'd'].map((id) => node(id, 'fact'))], edges: [edge('a-claim', 'a', 'claim', 'supports'), edge('b-a', 'b', 'a', 'supports'), edge('c-b', 'c', 'b', 'supports'), edge('d-c', 'd', 'c', 'supports')] });
  const audit = selectAudit(chain, null, 'claim');
  assert.deepEqual([...audit.visibleIds], ['claim', 'a', 'b']);
  assert.deepEqual(audit.nodeRoles.get('b'), ['premise']);
  assert.equal(audit.groups.related.some((item) => item.id === 'c-b'), true);
  assert.equal(audit.visibleIds.has('c'), false);
  const inspected = selectAudit(chain, null, 'claim', 'c');
  assert.equal(inspected.root.id, 'claim');
  assert.equal(inspected.snapshot.edges.some((item) => item.id === 'c-b'), true);
  assert.equal(inspected.visibleIds.has('d'), false);
});
test('issue overview includes explicit tag members without fabricating membership edges', () => {
  const tagged = node('tagged', 'hypothesis', { tags: ['issue=q1'] });
  const audit = selectAudit(buildAuditIndex({ ...snapshot, nodes: [...nodes, tagged] }), 'q1', null);
  assert.equal(audit.visibleIds.has('tagged'), true);
  assert.deepEqual(audit.nodeRoles.get('tagged'), ['candidate']);
  assert.equal(audit.snapshot.edges.some((item) => item.from === 'tagged' || item.to === 'tagged'), false);
});

test('support, reverse derivation, premise and necessary-condition rebuttals stay scoped to their authored targets', () => {
  const evidenceNodes = ['support', 'derived', 'premise', 'condition', 'evidence-condition', 'against-support', 'against-derived', 'against-premise', 'against-condition', 'against-evidence-condition', 'root-counter'].map((id) => node(id, 'fact'));
  const authored = [
    edge('s', 'support', 'claim', 'supports', { label: 'direct label' }),
    edge('d', 'claim', 'derived', 'derived-from', { label: 'reverse label' }),
    edge('p', 'premise', 'support', 'supports'),
    edge('required', 'claim', 'condition', 'depends-on'),
    edge('support-required', 'support', 'evidence-condition', 'depends-on'),
    ...['support', 'derived', 'premise', 'condition', 'evidence-condition'].map((id) => edge(`against-${id}-edge`, `against-${id}`, id, 'contradicts', { label: `scope ${id}` })),
    edge('root-against', 'root-counter', 'claim', 'contradicts'),
  ];
  const evidenceIndex = buildAuditIndex({ meta: {}, nodes: [node('claim', 'finding'), ...evidenceNodes], edges: authored });
  const audit = selectAudit(evidenceIndex, null, 'claim', 'claim');
  assert.deepEqual(audit.groups.contradiction.map((item) => item.id), ['root-against']);
  for (const id of ['support', 'derived', 'premise', 'condition']) {
    assert.equal(audit.contexts.get(id).groups.contradiction.length, 1);
    assert.equal(audit.contexts.get(id).pages.contradiction.shown, 0);
    assert.equal(audit.visibleIds.has(`against-${id}`), false);
  }
  assert.equal(audit.contexts.get('support').groups.condition.length, 1);
  const expanded = changeAuditExpansion({}, 'local:support:condition', 'more', 0);
  const conditions = selectAudit(evidenceIndex, null, 'claim', null, expanded);
  assert.equal(conditions.contexts.get('evidence-condition').groups.contradiction.length, 1);
  assert.equal(conditions.visibleIds.has('against-evidence-condition'), false);
  const details = changeAuditExpansion(expanded, 'local:evidence-condition:contradiction', 'more', 0);
  const challenged = selectAudit(evidenceIndex, null, 'claim', 'against-evidence-condition', details);
  assert.equal(challenged.root.id, 'claim');
  assert.deepEqual(challenged.groups.contradiction.map((item) => item.id), ['root-against']);
  assert.equal(challenged.visibleIds.has('against-evidence-condition'), true);
  const original = authored.find((item) => item.id === 'against-evidence-condition-edge');
  assert.equal(challenged.snapshot.edges.find((item) => item.id === original.id), original);
  assert.deepEqual([original.from, original.to, original.label], ['against-evidence-condition', 'evidence-condition', 'scope evidence-condition']);
  for (const id of ['support', 'derived', 'premise', 'condition']) {
    const shown = selectAudit(evidenceIndex, null, 'claim', null, changeAuditExpansion({}, `local:${id}:contradiction`, 'more', 0));
    assert.equal(shown.visibleIds.has(`against-${id}`), true);
    assert.equal(shown.nodeRoles.get(`against-${id}`).includes('contradiction'), false);
    assert.equal(shown.nodeRoles.get(`against-${id}`).includes('localContradiction'), true);
  }
});

function syntheticBoard() {
  const issues = Array.from({ length: 40 }, (_, i) => node(`issue-${i}`, i % 2 ? 'question' : 'goal'));
  const candidates = Array.from({ length: 400 }, (_, i) => node(`candidate-${i}`, i % 2 ? 'finding' : 'hypothesis', { tags: i % 3 === 0 ? [`issue=issue-${i % 40}`] : [] }));
  const evidence = Array.from({ length: 65 }, (_, i) => node(`evidence-${i}`, 'fact'));
  const counters = Array.from({ length: 31 }, (_, i) => node(`counter-${i}`, 'result'));
  const conditions = Array.from({ length: 29 }, (_, i) => node(`condition-${i}`, 'condition'));
  const others = Array.from({ length: 27 }, (_, i) => node(`other-${i}`, 'coverage'));
  const boardEdges = [
    ...candidates.filter((_, i) => i % 3 !== 0).map((item) => edge(`member-${item.id}`, item.id, `issue-${Number(item.id.split('-')[1]) % 40}`, 'answers')),
    ...evidence.map((item, i) => i % 2 ? edge(`support-${i}`, 'candidate-0', item.id, 'derived-from', { label: `scope-${i}` }) : edge(`support-${i}`, item.id, 'candidate-0', 'supports', { label: `scope-${i}` })),
    ...counters.map((item, i) => edge(`counter-${i}`, item.id, 'candidate-0', 'contradicts')),
    ...conditions.map((item, i) => edge(`condition-${i}`, 'candidate-0', item.id, 'depends-on')),
    ...others.map((item, i) => edge(`other-${i}`, item.id, 'candidate-0', 'related-to')),
    ...candidates.slice(1).map((item, i) => edge(`shared-${i}`, evidence[0].id, item.id, 'supports')),
    edge('reverse-member', 'issue-2', 'candidate-0', 'refines'),
    edge('duplicate-member', 'candidate-0', 'issue-0', 'answers'),
    edge('self', 'evidence-0', 'evidence-0', 'custom-relation'),
    edge('dangling', 'not-present', 'candidate-0', 'supports'),
  ];
  return { meta: {}, nodes: [...issues, ...candidates, ...evidence, ...counters, ...conditions, ...others], edges: boardEdges };
}

test('large indexed boards retain ordered explicit membership, direction, shared identities and complete bounded group counts', () => {
  const large = syntheticBoard();
  const largeIndex = buildAuditIndex(large);
  assert.equal(largeIndex.issues.length, 40);
  assert.equal(largeIndex.candidates.length, 400);
  assert.deepEqual(largeIndex.membership.get('issue-0').map((item) => item.id), Array.from({ length: 10 }, (_, i) => `candidate-${i * 40}`));
  assert.deepEqual(largeIndex.reverseMembership.get('candidate-0').map((item) => item.id), ['issue-0', 'issue-2']);
  assert.equal(largeIndex.adjacency.get('evidence-0').filter((item) => item.id === 'self').length, 1);
  assert.equal(largeIndex.edges.some((item) => item.id === 'dangling'), false);
  assert.equal(largeIndex.unassigned.length, 0);
  const audit = selectAudit(largeIndex, 'issue-0', 'candidate-0', 'candidate-0');
  assert.equal(audit.pages.support.total, 65);
  assert.equal(audit.pages.contradiction.total, 31);
  assert.equal(audit.pages.condition.total, 29);
  for (const role of ['support', 'contradiction', 'condition']) {
    assert.equal(audit.pages[role].shown, AUDIT_BATCH);
    assert.equal(audit.pages[role].hidden, audit.pages[role].total - AUDIT_BATCH);
  }
  assert.deepEqual(audit.pages.support.items.map((item) => item.id), Array.from({ length: 12 }, (_, i) => `support-${i}`));
  assert.equal(audit.pages.support.items[1].from, 'candidate-0');
  assert.equal(audit.pages.support.items[1].to, 'evidence-1');
  assert.equal(audit.pages.support.items[1].label, 'scope-1');
  assert.equal(audit.pages.related.shown, 0);
  assert.equal(audit.pages.related.total > 400, true);
  assert.equal(audit.catalog.records.shown, 0);
  assert.equal(audit.catalog.records.hidden, large.nodes.length);
  assert.equal(audit.snapshot.nodes.length, 1 + AUDIT_BATCH * 3);
  assert.equal(audit.snapshot.nodes.filter((item) => item.id === 'evidence-0').length, 1);
  assert.equal(audit.visibleIds.has('candidate-1'), false);
  assert.equal(audit.catalog.issues.shown, AUDIT_BATCH);
  assert.equal(audit.index, largeIndex);
});

test('show more and collapse preserve explicit budgets across snapshots without silently losing selected rows', () => {
  const large = syntheticBoard();
  const largeIndex = buildAuditIndex(large);
  let expansion = changeAuditExpansion({}, 'support', 'more');
  expansion = changeAuditExpansion(expansion, 'contradiction', 'more');
  expansion = changeAuditExpansion(expansion, 'condition', 'more');
  expansion = changeAuditExpansion(expansion, 'related', 'more', 0);
  const shown = selectAudit(largeIndex, 'issue-0', 'candidate-0', null, expansion);
  assert.equal(shown.pages.support.shown, 24);
  assert.equal(shown.pages.contradiction.shown, 24);
  assert.equal(shown.pages.condition.shown, 24);
  assert.equal(shown.pages.related.shown, 12);
  const next = { ...large, nodes: [...large.nodes, node('new-evidence', 'fact')], edges: [...large.edges, edge('new-support', 'new-evidence', 'candidate-0', 'supports')] };
  const refreshed = selectAudit(buildAuditIndex(next), 'issue-0', 'candidate-0', null, expansion);
  assert.equal(refreshed.pages.support.total, 66);
  assert.equal(refreshed.pages.support.shown, 24);
  assert.deepEqual(refreshed.pages.support.items, shown.pages.support.items);
  const collapsed = changeAuditExpansion(expansion, 'support', 'collapse');
  const selected = selectAudit(largeIndex, 'issue-0', 'candidate-0', 'evidence-64', collapsed);
  assert.equal(selected.root.id, 'candidate-0');
  assert.equal(selected.visibleIds.has('evidence-64'), true);
  assert.equal(selected.pages.support.shown, 13);
  assert.equal(selected.pages.support.hidden, 52);
  assert.equal(selected.snapshot.edges.some((item) => item.id === 'support-64'), true);
  const closed = selectAudit(largeIndex, 'issue-0', 'candidate-0', 'evidence-64', { ...collapsed, support: 0 });
  assert.equal(closed.pages.support.shown, 0);
  assert.equal(closed.visibleIds.has('evidence-64'), true);
  assert.equal(closed.root.id, 'candidate-0');
  const changedRoot = selectAudit(largeIndex, 'issue-1', 'candidate-1', 'evidence-0');
  assert.equal(changedRoot.root.id, 'candidate-1');
  assert.equal(changedRoot.snapshot.nodes.find((item) => item.id === 'evidence-0'), largeIndex.byId.get('evidence-0'));
  assert.equal(changedRoot.visibleIds.has('candidate-0'), false);
  assert.equal(changedRoot.snapshot.edges.some((item) => item.id === 'shared-0'), true);
});

test('large issue candidate lists and record catalogs render only explicit pages while retaining all totals', () => {
  const large = syntheticBoard();
  for (let i = 0; i < 400; i++) large.nodes[40 + i].tags = ['issue=issue-0'];
  const largeIndex = buildAuditIndex(large);
  const audit = selectAudit(largeIndex, 'issue-0', null, 'issue-0');
  assert.equal(audit.catalog.members.total, 400);
  assert.equal(audit.catalog.members.shown, 12);
  assert.equal(audit.snapshot.nodes.filter((item) => item.type === 'finding' || item.type === 'hypothesis').length, 12);
  const expanded = selectAudit(largeIndex, 'issue-0', null, 'issue-0', changeAuditExpansion({}, 'members', 'more'));
  assert.equal(expanded.catalog.members.shown, 24);
  assert.equal(expanded.visibleIds.has('candidate-23'), true);
  assert.equal(expanded.visibleIds.has('candidate-24'), false);
  const selected = selectAudit(largeIndex, 'issue-0', null, 'candidate-399');
  assert.equal(selected.catalog.members.shown, 13);
  assert.equal(selected.visibleIds.has('candidate-399'), true);
  assert.equal(selected.root.id, 'issue-0');
  const catalog = selectAudit(largeIndex, null, null, null);
  assert.equal(catalog.catalog.records.total, large.nodes.length);
  assert.equal(catalog.catalog.records.shown, 12);
  const opened = selectAudit(largeIndex, 'issue-0', null, null, changeAuditExpansion({}, 'records', 'more', 0));
  assert.equal(opened.catalog.records.shown, 12);
  assert.equal(opened.catalog.records.hidden, large.nodes.length - 12);
});

test('selection and expansion reuse snapshot membership indexes without re-reading candidate ownership', () => {
  let tagReads = 0;
  const candidates = Array.from({ length: 400 }, (_, i) => {
    const candidate = node(`c-${i}`, 'finding');
    Object.defineProperty(candidate, 'tags', { get() { tagReads++; return ['issue=q']; } });
    return candidate;
  });
  const indexed = buildAuditIndex({ meta: {}, nodes: [node('q', 'question'), ...candidates], edges: [] });
  const readsAfterIndex = tagReads;
  for (let i = 0; i < 30; i++) {
    const audit = selectAudit(indexed, 'q', `c-${i}`, `c-${399 - i}`, { records: 24 });
    assert.equal(audit.members, indexed.membership.get('q'));
    assert.equal(audit.candidateIssues, indexed.reverseMembership.get(`c-${i}`));
    assert.equal(audit.root.id, `c-${i}`);
    assert.equal(audit.visibleIds.has(`c-${399 - i}`), true);
  }
  assert.equal(tagReads, readsAfterIndex);
});

test('local rebuttal and dependency pages keep full totals and selected folded context paths', () => {
  const supports = Array.from({ length: 30 }, (_, i) => node(`s-${i}`, 'fact'));
  const counters = Array.from({ length: 35 }, (_, i) => node(`r-${i}`, 'result'));
  const conditions = Array.from({ length: 27 }, (_, i) => node(`d-${i}`, 'condition'));
  const authored = [
    ...supports.map((item, i) => edge(`s-edge-${i}`, item.id, 'claim', 'supports')),
    ...counters.map((item, i) => edge(`r-edge-${i}`, item.id, 's-29', 'contradicts', { label: `rebuttal scope ${i}` })),
    ...conditions.map((item, i) => edge(`d-edge-${i}`, 's-29', item.id, 'depends-on')),
    edge('condition-counter', 'r-0', 'd-26', 'contradicts'),
  ];
  const source = { meta: {}, nodes: [node('claim', 'finding'), ...supports, ...counters, ...conditions], edges: authored };
  const original = JSON.stringify(source);
  const indexed = buildAuditIndex(source);
  const selected = selectAudit(indexed, null, 'claim', 'r-34');
  assert.equal(selected.root.id, 'claim');
  assert.equal(selected.visibleIds.has('s-29'), true);
  assert.equal(selected.visibleIds.has('r-34'), true);
  assert.equal(selected.snapshot.edges.some((item) => item.id === 's-edge-29'), true);
  assert.equal(selected.snapshot.edges.some((item) => item.id === 'r-edge-34'), true);
  assert.equal(selected.contexts.get('s-29').groups.contradiction.length, 35);
  assert.equal(selected.contexts.get('s-29').groups.condition.length, 27);
  assert.equal(selected.groups.contradiction.length, 0);
  let expansion = changeAuditExpansion({}, 'local:s-29:contradiction', 'more', 0);
  expansion = changeAuditExpansion(expansion, 'local:s-29:condition', 'more', 0);
  const page = selectAudit(indexed, null, 'claim', 's-29', expansion);
  assert.deepEqual([page.contexts.get('s-29').pages.contradiction.total, page.contexts.get('s-29').pages.contradiction.shown, page.contexts.get('s-29').pages.contradiction.hidden], [35, 12, 23]);
  assert.deepEqual([page.contexts.get('s-29').pages.condition.total, page.contexts.get('s-29').pages.condition.shown, page.contexts.get('s-29').pages.condition.hidden], [27, 12, 15]);
  expansion = changeAuditExpansion(expansion, 'local:s-29:contradiction', 'more', 0);
  assert.equal(selectAudit(indexed, null, 'claim', 's-29', expansion).contexts.get('s-29').pages.contradiction.shown, 24);
  expansion = changeAuditExpansion(expansion, 'local:s-29:contradiction', 'collapse', 0);
  const folded = selectAudit(indexed, null, 'claim', 's-29', expansion);
  assert.equal(folded.contexts.get('s-29').pages.contradiction.shown, 0);
  assert.equal(folded.contexts.get('s-29').pages.contradiction.hidden, 35);
  assert.equal(folded.visibleIds.has('r-34'), false);
  assert.equal(JSON.stringify(source), original);
});

test('unassigned catalogs stay paged and explicit condition cycles stop at closed pages', () => {
  const candidates = Array.from({ length: 50 }, (_, i) => node(`free-${i}`, 'finding'));
  const freeIndex = buildAuditIndex({ meta: {}, nodes: candidates, edges: [] });
  const closed = selectAudit(freeIndex, null, null);
  assert.deepEqual([closed.catalog.unassigned.total, closed.catalog.unassigned.shown, closed.catalog.unassigned.hidden], [50, 0, 50]);
  const opened = selectAudit(freeIndex, null, null, null, changeAuditExpansion({}, 'unassigned', 'more', 0));
  assert.deepEqual([opened.catalog.unassigned.shown, opened.catalog.unassigned.hidden], [12, 38]);
  const cyclic = buildAuditIndex({ meta: {}, nodes: [node('claim', 'finding'), node('evidence', 'fact'), node('required', 'condition'), node('counter', 'result')], edges: [edge('support', 'evidence', 'claim', 'supports'), edge('requires', 'evidence', 'required', 'depends-on'), edge('cycle', 'required', 'evidence', 'depends-on'), edge('rebuttal', 'counter', 'required', 'contradicts')] });
  const expansion = { 'local:evidence:condition': 12, 'local:required:condition': 12, 'local:required:contradiction': 12 };
  const view = selectAudit(cyclic, null, 'claim', null, expansion);
  assert.deepEqual(new Set(view.snapshot.nodes.map((item) => item.id)), new Set(['claim', 'evidence', 'required', 'counter']));
  assert.equal(view.contexts.size, 2);
  assert.equal(view.groups.contradiction.length, 0);
  assert.equal(view.snapshot.edges.find((item) => item.id === 'cycle'), cyclic.edges.find((item) => item.id === 'cycle'));
});
