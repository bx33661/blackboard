import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Tooltip } from 'radix-ui';
import { createServer } from 'vite';

// Render the real components without a browser, a listening server, or a project board.
const root = fileURLToPath(new URL('../', import.meta.url));
const server = await createServer({
  configFile: false,
  root: path.join(root, 'web'),
  resolve: { alias: { '@': path.join(root, 'web/src') } },
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true },
  appType: 'custom',
});
after(() => server.close());
const { Inspector } = await server.ssrLoadModule('/src/panels/Inspector.tsx');
const { Sidebar } = await server.ssrLoadModule('/src/panels/Sidebar.tsx');
const { t } = await server.ssrLoadModule('/src/i18n.ts');
const render = (element) => renderToStaticMarkup(createElement(Tooltip.Provider, null, element));
const escape = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#x27;');
const node = {
  id: 'synthetic-finding', type: 'finding', confidence: 'suspected',
  title: '  已观察行为。\n限制：尚未验证！  ',
  detail: `第一行保留换行\n\n${'合成证据 '.repeat(700)}\n末尾限制：实际行为尚未验证。  `,
};
const inspectorProps = {
  node, edges: [], byId: new Map([[node.id, node]]),
  onClose() {}, onFocus() {}, async onReload() {},
  isStatic: true, connected: false, revision: 0,
};

test('Inspector renders the complete authored title and detail, including punctuation and tail conditions', () => {
  const before = JSON.stringify(node);
  const html = render(createElement(Inspector, inspectorProps));
  assert.equal(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1], escape(node.title));
  assert.ok(html.includes(`>${escape(node.detail)}</p>`), 'the entire detail must appear as one authored text, not a trimmed preview');
  assert.equal(JSON.stringify(node), before, 'reading must not alter the source record');
});


const findings = Array.from({ length: 18 }, (_, i) => ({ id: `synthetic-${i}`, type: 'finding', title: `Synthetic finding ${i}` }));
const openItems = Array.from({ length: 13 }, (_, i) => ({ id: `question-${i}`, type: 'question', title: `Synthetic question ${i}` }));
const sidebarProps = {
  current: null, openItems, findings, inbox: [], selectedId: null,
  counts: { nodes: findings.length + openItems.length, edges: 0, risk: 0, open: openItems.length, candidates: findings.length },
  onSelect() {}, onSearch() {}, onShortcuts() {}, onFilter() {},
  filter: { types: [], statuses: [], confidences: [], riskOnly: false },
  filterOptions: { types: [], statuses: [], confidences: [], riskCount: 0 }, results: null,
};

test('Sidebar keeps all findings reachable behind an explicit disclosure instead of silently cutting after eight', () => {
  const before = JSON.stringify(findings);
  const html = render(createElement(Sidebar, sidebarProps));
  assert.equal((html.match(/title="Synthetic finding \d+"/g) || []).length, findings.length);
  assert.ok(/<details[^>]*>[\s\S]*?<summary[^>]*>[\s\S]*?10[\s\S]*?<\/summary>/.test(html), 'ten more findings have a native disclosure');
  assert.ok(html.includes('title="Synthetic finding 17"'));
  assert.equal(JSON.stringify(findings), before);
});

test('Sidebar open items retain every record and use the same explicit disclosure', () => {
  const html = render(createElement(Sidebar, sidebarProps));
  assert.equal((html.match(/title="Synthetic question \d+"/g) || []).length, openItems.length);
  assert.ok(/<summary[^>]*>[\s\S]*?5[\s\S]*?<\/summary>/.test(html), 'five more questions have a native disclosure');
});


test('Inspector exposes persisted input truncation instead of presenting a partial input as complete', () => {
  const truncated = { ...node, inputTruncation: { detail: { originalLength: 20006, storedLength: 20000 } } };
  const html = render(createElement(Inspector, { ...inspectorProps, node: truncated }));
  assert.ok(html.includes('20006') && html.includes('20000'), 'the saved and original lengths are visible');
});

test('Inspector retains authored relation labels and reports their recorded input loss', () => {
  const peer = { id: 'synthetic-peer', type: 'fact', title: 'Synthetic peer' };
  const label = '第一行关系说明\n限制：仅支持这一项观察。';
  const edge = { id: 'synthetic-edge', from: peer.id, to: node.id, kind: 'supports', label, inputTruncation: { label: { originalLength: 506, storedLength: 500 } } };
  const html = render(createElement(Inspector, { ...inspectorProps, edges: [edge], byId: new Map([[node.id, node], [peer.id, peer]]) }));
  assert.ok(html.includes(`>${escape(label)}</p>`), 'the authored relation label is available alongside the explicit direction');
  assert.ok(html.includes('506') && html.includes('500'));
});

const negative = {
  id: 'synthetic-negative', type: 'negative-result', status: 'open', confidence: 'suspected',
  title: '  检查入口。\n后续标题：排除范围！  ',
  detail: '检查范围:\n入口 /preview\n匿名\n\n实际结果:\n拒绝\n\n可排除范围:\n成功触发的判断\n\n未覆盖与限制:\n登录后入口\n\n补充说明:\n原文：！？\n保留换行\n',
};

test('Inspector marks a bounded negative result while retaining the complete authored title and detail', () => {
  const before = JSON.stringify(negative);
  const html = render(createElement(Inspector, { ...inspectorProps, node: negative }));
  const notice = html.match(/<section[^>]*role="note"[^>]*>([\s\S]*?)<\/section>/)?.[1] || '';
  assert.ok(notice.includes(escape(t('negative.heading'))), 'the bounded notice names the record type');
  assert.ok(notice.includes(escape(t('negative.notice'))), 'the notice does not turn the observation into automatic counterevidence');
  assert.ok(html.indexOf('role="note"') < html.indexOf(`>${escape(negative.detail)}</p>`), 'the bounded notice is prominent above the full detail');
  assert.equal(html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/)?.[1], escape(negative.title), 'the full title, including its continuation, stays visible');
  assert.ok(html.includes(`>${escape(negative.detail)}</p>`), 'excluded, uncovered and limitation text is shown exactly as authored');
  assert.equal(JSON.stringify(negative), before, 'reading never alters the stored negative result');
});

test('a manually authored negative result keeps its detail and gains no generated boundary labels', () => {
  const manual = { id: 'manual-negative', type: 'negative-result', title: '人工负结果', detail: '原始记录：未记录检查范围。\n\n限制：无。' };
  const html = render(createElement(Inspector, { ...inspectorProps, node: manual }));
  assert.ok(html.includes(`>${escape(manual.detail)}</p>`));
  for (const label of [t('negative.checkedScope'), t('negative.observedResult'), t('negative.excludedScope'), t('negative.uncovered'), t('negative.notes')]) {
    assert.equal(html.includes(escape(`${label}:`)), false, `the viewer never invents a ${label} section`);
  }
});

test('claims stay ordinary records without the bounded-negative notice', () => {
  const claim = { id: 'synthetic-claim', type: 'claim', title: '匿名输入可控制目标地址', detail: '支持上级候选；限制：尚未检查重定向。' };
  const html = render(createElement(Inspector, { ...inspectorProps, node: claim }));
  assert.equal(html.includes(escape(t('negative.heading'))), false);
  assert.ok(html.includes(`>${escape(claim.detail)}</p>`));
});

