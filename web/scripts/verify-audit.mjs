#!/usr/bin/env node
// Browser proof over synthetic audit records and the real built viewer.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { isolatedPinwhyEnv } from '../../scripts/lib/environment.mjs';

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-audit-proof-'));
const board = path.join(scratch, 'board');
const home = path.join(scratch, 'home');
fs.mkdirSync(board); fs.mkdirSync(home);
const output = path.resolve(process.env.PINWHY_AUDIT_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-audit-results-')));
fs.mkdirSync(output, { recursive: true });
const checks = [];
const ok = (name) => { checks.push(name); console.log(`PASS ${name}`); };
let browser, server, page, failure;
const errors = [];
const artifacts = [];

try {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href : 'playwright');
  const executablePath = process.env.CHROMIUM_EXECUTABLE || chromium.executablePath();
  const env = isolatedPinwhyEnv({ HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'), XDG_CACHE_HOME: path.join(home, '.cache'), XDG_STATE_HOME: path.join(home, '.local', 'state') });
  for (const key of Object.keys(process.env)) if (key.startsWith('PINWHY_')) delete process.env[key];
  Object.assign(process.env, env);
  const { ensure, paths, replay, readEvents } = await import('../../lib/store.js');
  const { startServer } = await import('../../lib/server.js');
  const { renderExport } = await import('../../lib/export.js');
  ensure(board);
  const events = [];
  const node = (id, type, title, extra = {}) => events.push({ op: 'node', node: { id, type, title, ts: 1000, ...extra } });
  const edge = (from, to, kind, label) => events.push({ op: 'edge', edge: { id: `${from}->${to}:${kind}`, from, to, kind, ts: 1000, ...(label ? { label } : {}) } });
  node('g0', 'goal', 'Synthetic audit scope', { tags: ['source=synthetic-rev'] });
  for (let i = 0; i < 40; i++) {
    node(`q${i}`, 'question', `Synthetic question ${i}`, { status: 'open' });
    edge(`q${i}`, 'g0', 'related-to');
    for (let j = 0; j < 10; j++) {
      const id = `fd${i * 10 + j}`;
      node(id, 'finding', `Synthetic candidate ${i * 10 + j}`, { status: 'open', confidence: 'suspected' });
      edge(id, `q${i}`, 'answers');
    }
  }
  for (let i = 0; i < 65; i++) {
    node(`f${i}`, 'fact', `Synthetic evidence ${i}`, { status: 'confirmed', detail: 'A bounded source observation.' });
    edge(`f${i}`, 'fd0', 'supports', `Only supports authored part ${i}`);
  }
  node('n0', 'condition', 'Synthetic shared prerequisite', { status: 'open' });
  node('n1', 'condition', 'Synthetic evidence prerequisite', { status: 'open' });
  node('r0', 'result', 'Synthetic rebuttal of evidence', { status: 'confirmed' });
  node('r1', 'result', 'Synthetic rebuttal of prerequisite', { status: 'confirmed' });
  edge('fd0', 'n0', 'depends-on'); edge('fd10', 'n0', 'depends-on');
  edge('f0', 'n1', 'depends-on'); edge('r0', 'f0', 'contradicts', 'Challenges this evidence, not the root finding.');
  edge('r1', 'n0', 'contradicts', 'Challenges the shared prerequisite.');
  edge('r0', 'fd0', 'related-to', 'Associated check, not direct root counterevidence.');
  node('cl0', 'claim', 'Synthetic caller controls target', { status: 'open', confidence: 'suspected' });
  node('cl1', 'claim', 'Synthetic anonymous target reachability', { status: 'open', confidence: 'suspected' });
  node('fc0', 'fact', 'Synthetic bounded request observation', { status: 'confirmed' });
  node('nr0', 'negative-result', 'Synthetic default input was rejected', { status: 'confirmed', detail: '检查范围：合成版本 v1，匿名请求，仅默认配置\n实际结果：这组输入被拒绝\n可排除的范围：这组输入在当前环境中成功的判断\n未覆盖与限制：登录后的入口、其他协议和非默认配置未检查。尾部条件：保留原文。' });
  edge('cl0', 'fd399', 'supports', 'Only the input-control subclaim');
  edge('cl1', 'cl0', 'supports', 'Nested authored subclaim');
  edge('fc0', 'cl1', 'supports', 'Only this observed request');
  edge('nr0', 'cl1', 'contradicts', 'Excludes only the recorded default input, not every path.');
  fs.appendFileSync(paths(board).events, events.map((event) => JSON.stringify({ eventVersion: 1, ...event })).join('\n') + '\n');
  const bytes = () => fs.readFileSync(paths(board).events);
  const hash = () => createHash('sha256').update(bytes()).digest('hex');
  const initialHash = hash();
  server = await startServer({ cwd: board, port: 0 });
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(`${url}/?workspace=audit&issue=q0&candidate=fd0`);
  await page.getByRole('navigation', { name: '审计导航', exact: true }).waitFor();

  const nav = page.getByRole('navigation', { name: '审计导航', exact: true });
  const support = nav.getByRole('region', { name: '支持与推导', exact: true });
  await support.getByText('共 65 条 · 已展示 12 条 · 未展开 53 条', { exact: true }).waitFor();
  assert.ok(await page.locator('.react-flow__node').count() < 25, 'initial argument remains bounded');
  await support.getByRole('button', { name: '支持与推导 · 显示更多', exact: true }).click();
  await support.getByText('共 65 条 · 已展示 24 条 · 未展开 41 条', { exact: true }).waitFor();
  await support.getByRole('button', { name: '支持与推导 · 收起', exact: true }).click();
  await support.getByText('共 65 条 · 已展示 12 条 · 未展开 53 条', { exact: true }).waitFor();
  assert.equal(hash(), initialHash);
  ok('large audit groups show exact totals, expand and collapse without writing');

  await page.locator('.react-flow__node[data-id="f0"]').getByRole('button', { name: 'Synthetic evidence 0 · 存在反驳记录 · 1', exact: true }).click();
  const inspector = page.getByRole('complementary', { name: '节点详情', exact: true });
  await inspector.getByRole('heading', { name: 'Synthetic evidence 0', exact: true }).waitFor();
  const local = nav.getByRole('region', { name: '证据与条件记录详情: f0', exact: true });
  assert.equal(await local.getByRole('button', { name: 'Synthetic evidence 0 · 存在反驳记录 · 1', exact: true }).getAttribute('aria-expanded'), 'true');
  await local.getByRole('button', { name: 'Synthetic rebuttal of evidence · r0', exact: true }).waitFor();
  assert.ok((await local.innerText()).includes('Challenges this evidence, not the root finding.'));
  assert.equal(await nav.getByRole('region', { name: '反证', exact: true }).getByRole('button', { name: '反证 · 0', exact: true }).count(), 1);
  assert.equal(new URL(page.url()).searchParams.get('candidate'), 'fd0');
  assert.equal(hash(), initialHash);
  await page.screenshot({ path: path.join(output, 'evidence-challenge.png'), fullPage: true }); artifacts.push('evidence-challenge.png');
  ok('evidence rebuttals stay local, retain their explanation and never become root counterevidence');

  await page.goto(`${url}/?workspace=audit&issue=q0&candidate=fd0&node=f64`);
  await inspector.getByRole('heading', { name: 'Synthetic evidence 64', exact: true }).waitFor();
  await page.locator('.react-flow__node[data-id="f64"]').waitFor();
  assert.ok(await page.locator('.react-flow__node').count() < 25, 'deep link pins one hidden record without opening all preceding records');
  assert.equal(hash(), initialHash);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: path.join(output, 'audit-mobile.png'), fullPage: true }); artifacts.push('audit-mobile.png');
  await page.setViewportSize({ width: 1440, height: 1000 });
  ok('folded evidence remains reachable by deep link on desktop and narrow screens');

  await page.goto(`${url}/?workspace=audit&issue=q39&candidate=fd399&node=fd399`);
  await inspector.getByRole('heading', { name: 'Synthetic candidate 399', exact: true }).waitFor();
  await nav.getByRole('button', { name: '阅读子论断: Synthetic caller controls target', exact: true }).first().click();
  await page.getByRole('button', { name: '局部论证图: Synthetic caller controls target', exact: true }).waitFor();
  await nav.getByRole('button', { name: '阅读子论断: Synthetic anonymous target reachability', exact: true }).first().click();
  await page.getByRole('button', { name: '局部论证图: Synthetic anonymous target reachability', exact: true }).waitFor();
  assert.deepEqual(new URL(page.url()).searchParams.getAll('claim'), ['cl0', 'cl1']);
  assert.equal(new URL(page.url()).searchParams.get('candidate'), 'fd399');
  assert.equal(new URL(page.url()).searchParams.get('issue'), 'q39');
  assert.equal(await nav.getByRole('combobox', { name: '候选', exact: true }).locator('option[value="cl0"]').count(), 0);
  await page.reload();
  await page.getByRole('button', { name: '局部论证图: Synthetic anonymous target reachability', exact: true }).waitFor();
  await nav.getByRole('region', { name: '反证', exact: true }).getByRole('button', { name: 'Synthetic default input was rejected · nr0', exact: true }).click();
  await inspector.getByRole('heading', { name: 'Synthetic default input was rejected', exact: true }).waitFor();
  await inspector.getByText('仅描述作者明确写下的检查与排除范围。未记录范围仍未确定，不自动构成对候选的反证。', { exact: true }).waitFor();
  assert.ok((await inspector.innerText()).includes('尾部条件：保留原文。'));
  await page.screenshot({ path: path.join(output, 'bounded-negative-result.png'), fullPage: true }); artifacts.push('bounded-negative-result.png');
  await page.getByRole('button', { name: '返回子论断：Synthetic caller controls target', exact: true }).first().click();
  await page.getByRole('button', { name: '局部论证图: Synthetic caller controls target', exact: true }).waitFor();
  await page.goBack();
  await page.getByRole('button', { name: '局部论证图: Synthetic anonymous target reachability', exact: true }).waitFor();
  await page.getByRole('button', { name: '返回候选', exact: true }).first().click();
  await page.getByRole('button', { name: '局部论证图: Synthetic candidate 399', exact: true }).waitFor();
  assert.deepEqual(new URL(page.url()).searchParams.getAll('claim'), []);
  assert.equal(await nav.getByRole('region', { name: '反证', exact: true }).getByRole('button', { name: '反证 · 0', exact: true }).count(), 1);
  assert.equal(hash(), initialHash);
  ok('nested subclaims preserve candidate identity, reload and back navigation; bounded rebuttals remain attached to their own claim');

  await page.goto(`${url}/?workspace=audit&issue=q39&candidate=fd399&claim=cl0&claim=missing-claim&node=cl0`);
  await page.getByRole('button', { name: '局部论证图: Synthetic caller controls target', exact: true }).waitFor();
  await page.getByText('子论断路径在 missing-claim 处停止：当前快照中没有该记录。', { exact: true }).first().waitFor();
  assert.equal(new URL(page.url()).searchParams.get('candidate'), 'fd399');
  assert.equal(hash(), initialHash);
  ok('missing subclaim paths expose the unresolved link and retain the valid parent without changing records');

  const offline = path.join(scratch, 'audit.html');
  fs.writeFileSync(offline, renderExport({ cwd: board }));
  const offlinePage = await context.newPage();
  const offlineRequests = [];
  offlinePage.on('request', (request) => { if (/\/api\/|\/events/.test(request.url())) offlineRequests.push(request.url()); });
  await offlinePage.goto(`${pathToFileURL(offline).href}?workspace=audit&issue=q39&candidate=fd399&claim=cl0&claim=cl1&node=nr0`);
  await offlinePage.getByRole('navigation', { name: '审计导航', exact: true }).waitFor();
  await offlinePage.getByRole('button', { name: '局部论证图: Synthetic anonymous target reachability', exact: true }).waitFor();
  await offlinePage.getByRole('complementary', { name: '节点详情', exact: true }).getByText('仅描述作者明确写下的检查与排除范围。未记录范围仍未确定，不自动构成对候选的反证。', { exact: true }).waitFor();
  assert.equal(await offlinePage.getByRole('button', { name: '新建节点', exact: true }).count(), 0);
  assert.deepEqual(offlineRequests, []);
  assert.equal(hash(), initialHash);
  await offlinePage.close();
  ok('standalone audit page keeps folding available and makes no API or SSE request');

  const writes = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/nodes' && request.method() === 'POST') writes.push({ id: request.headers()['idempotency-key'], body: request.postDataJSON() });
  });
  await page.goto(`${url}/?workspace=audit&issue=q0&candidate=fd0&node=fd0`);
  await inspector.getByRole('heading', { name: 'Synthetic candidate 0', exact: true }).waitFor();
  const related = inspector.getByRole('region', { name: '添加相关节点', exact: true });
  await related.getByLabel('新节点标题', { exact: true }).fill('Synthetic atomic evidence');
  await related.getByLabel('与当前节点的关系', { exact: true }).selectOption('supports');
  await related.getByLabel('关系说明', { exact: true }).fill('Authored atomic support');
  let forwarded = false;
  await page.route('**/api/nodes', async (route) => {
    if (route.request().method() !== 'POST' || forwarded) return route.continue();
    forwarded = true;
    await route.fetch();
    await route.abort('failed');
  });
  const beforeAtomic = readEvents(board).events.length;
  await related.getByRole('button', { name: '添加', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="添加相关节点"] input[aria-label="新节点标题"]')?.value === '');
  await page.unroute('**/api/nodes');
  const newEvents = readEvents(board).events.slice(beforeAtomic);
  assert.deepEqual(newEvents.map((event) => event.op), ['node', 'edge', 'receipt']);
  const atomicNode = newEvents[0].node;
  assert.equal(newEvents[1].edge.from, atomicNode.id);
  assert.equal(newEvents[1].edge.to, 'fd0');
  assert.equal(newEvents[1].edge.label, 'Authored atomic support');
  assert.equal(newEvents[2].requestId, writes.at(-1).id);
  assert.equal(Object.values(replay(board).nodes).filter((item) => item.title === 'Synthetic atomic evidence').length, 1);
  ok('lost compound-create response resolves from its committed receipt with one node, one relation and no duplicate');

  await inspector.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.getByRole('button', { name: '新建节点', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('新节点标题', { exact: true }).fill('Synthetic original request retry');
  let blocked = true;
  const originalWrites = [];
  await page.route('**/api/nodes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    originalWrites.push({ id: route.request().headers()['idempotency-key'], body: route.request().postDataJSON() });
    if (blocked) return route.abort('failed');
    return route.continue();
  });
  const beforeUnknown = hash();
  await dialog.getByRole('button', { name: '添加', exact: true }).click();
  const inlineRecovery = dialog.getByRole('region', { name: '未确认的写入', exact: true });
  await inlineRecovery.waitFor();
  assert.equal(await dialog.getByLabel('新节点标题', { exact: true }).isDisabled(), true);
  assert.equal(await dialog.getByRole('button', { name: '丢弃草稿', exact: true }).isDisabled(), true);
  assert.equal(hash(), beforeUnknown, 'missing receipt is not a committed write');
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('radio', { name: '通用', exact: true }).click();
  const recovery = page.getByRole('region', { name: '未确认的写入', exact: true });
  await recovery.getByRole('button', { name: '核对结果', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('[aria-label="未确认的写入"] button')].every((button) => !button.disabled));
  assert.equal(hash(), beforeUnknown, 'receipt checks never complete writes');
  blocked = false;
  await recovery.getByRole('button', { name: '重试原请求', exact: true }).click();
  await recovery.waitFor({ state: 'detached' });
  assert.equal(originalWrites.length, 2);
  assert.ok(originalWrites[0].id);
  assert.deepEqual(originalWrites[1], originalWrites[0]);
  assert.equal(Object.values(replay(board).nodes).filter((item) => item.title === 'Synthetic original request retry').length, 1);
  await page.unroute('**/api/nodes');
  ok('unknown submission freezes its payload and survives mode/panel changes; explicit retry uses the original id and payload');

  const retryNode = Object.values(replay(board).nodes).find((item) => item.title === 'Synthetic original request retry');
  await page.goto(`${url}/?workspace=audit&issue=q0&candidate=fd0&node=${retryNode.id}`);
  await inspector.getByRole('heading', { name: retryNode.title, exact: true }).waitFor();
  const edit = inspector.getByRole('region', { name: '编辑节点', exact: true });
  await edit.getByRole('button', { name: '修改节点', exact: true }).click();
  await edit.getByLabel('标题', { exact: true }).fill('Synthetic recovered patch');
  const nodeRoute = `**/api/nodes/${retryNode.id}`;
  await page.route(nodeRoute, async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    await route.fetch(); await route.abort('failed');
  });
  const beforePatch = readEvents(board).events.length;
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await edit.getByRole('button', { name: '修改节点', exact: true }).waitFor();
  assert.equal(replay(board).nodes[retryNode.id].title, 'Synthetic recovered patch');
  assert.deepEqual(readEvents(board).events.slice(beforePatch).map((event) => event.op), ['patch', 'receipt']);
  await page.unroute(nodeRoute);
  ok('lost edit response resolves the committed original result without a duplicate patch or stale-field conflict');

  await page.route(nodeRoute, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    assert.ok(route.request().headers()['idempotency-key']);
    await route.fetch(); await route.abort('failed');
  });
  const beforeRemove = readEvents(board).events.length;
  await edit.getByRole('button', { name: '移除节点', exact: true }).click();
  await edit.getByRole('button', { name: '确认移除', exact: true }).click();
  await inspector.waitFor({ state: 'detached' });
  await page.waitForFunction(() => !document.querySelector('[aria-label="未确认的写入"]'));
  assert.equal(replay(board).nodes[retryNode.id], undefined);
  assert.deepEqual(readEvents(board).events.slice(beforeRemove).map((event) => event.op), ['remove', 'receipt']);
  await page.unroute(nodeRoute);
  ok('lost deletion response is recovered after the selected record disappears from the live board');

  await page.goto(`${url}/?workspace=audit&issue=q39&candidate=fd399&node=fd399`);
  await inspector.getByRole('heading', { name: 'Synthetic candidate 399', exact: true }).waitFor();
  const authored = inspector.getByRole('region', { name: '添加相关节点', exact: true });
  await authored.getByRole('button', { name: '子论断', exact: true }).click();
  await authored.getByLabel('新节点标题', { exact: true }).fill('Synthetic authored input subclaim');
  const beforeClaim = readEvents(board).events.length;
  await authored.getByRole('button', { name: '添加子论断', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="添加相关节点"] input[aria-label="新节点标题"]')?.value === '');
  const claimEvents = readEvents(board).events.slice(beforeClaim);
  assert.deepEqual(claimEvents.map((event) => event.op), ['node', 'edge', 'receipt']);
  assert.equal(claimEvents[0].node.type, 'claim');
  assert.equal(claimEvents[1].edge.from, claimEvents[0].node.id);
  assert.equal(claimEvents[1].edge.to, 'fd399');
  assert.equal(claimEvents[1].edge.kind, 'supports');
  assert.equal(replay(board).nodes.fd399.status, 'open');
  assert.equal(replay(board).nodes.fd399.confidence, 'suspected');
  ok('explicit subclaim authoring records one claim and its supporting relation without changing the parent verdict');

  await authored.getByLabel('新节点标题', { exact: true }).fill('Synthetic required reachability subclaim');
  await authored.getByLabel('与当前节点的关系', { exact: true }).selectOption('depends-on');
  const beforeRequiredClaim = readEvents(board).events.length;
  await authored.getByRole('button', { name: '添加子论断', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="添加相关节点"] input[aria-label="新节点标题"]')?.value === '');
  const requiredEvents = readEvents(board).events.slice(beforeRequiredClaim);
  assert.deepEqual(requiredEvents.map((event) => event.op), ['node', 'edge', 'receipt']);
  assert.equal(requiredEvents[0].node.type, 'claim');
  assert.equal(requiredEvents[1].edge.from, 'fd399');
  assert.equal(requiredEvents[1].edge.to, requiredEvents[0].node.id);
  assert.equal(requiredEvents[1].edge.kind, 'depends-on');
  assert.equal(replay(board).nodes.fd399.status, 'open');
  ok('necessary subclaims use the authored parent-to-child dependency direction in one recoverable write');

  await authored.getByLabel('新节点标题', { exact: true }).fill('Synthetic retained subclaim draft');
  await authored.getByRole('button', { name: '有界负结果', exact: true }).click();
  await authored.getByLabel('新节点标题', { exact: true }).fill('Synthetic bounded experiment result');
  const bounds = {
    '检查范围': '合成版本 v1\n匿名，配置 A；仅 /preview',
    '实际结果': '本组输入被拒绝\n未观察到目标访问。',
    '可排除的范围': '仅这组输入在上述配置中成功的判断',
    '未覆盖与限制': '登录后的入口未检查\nIPv6 与重定向未覆盖；尾部条件必须保留。',
  };
  for (const [label, value] of Object.entries(bounds)) await authored.getByLabel(label, { exact: true }).fill(value);
  await authored.getByLabel('详情', { exact: true }).fill('原始补充说明，包含逗号、冒号：与换行\n保留这行。');
  await authored.getByRole('button', { name: '子论断', exact: true }).click();
  assert.equal(await authored.getByLabel('新节点标题', { exact: true }).inputValue(), 'Synthetic retained subclaim draft');
  await authored.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  await authored.getByRole('button', { name: '有界负结果', exact: true }).click();
  for (const [label, value] of Object.entries(bounds)) assert.equal(await authored.getByLabel(label, { exact: true }).inputValue(), value);
  await page.route('**/api/nodes', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch(); await route.abort('failed');
  });
  const beforeBounded = readEvents(board).events.length;
  await authored.getByRole('button', { name: '记录负结果', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="添加相关节点"] input[aria-label="新节点标题"]')?.value === '');
  await page.unroute('**/api/nodes');
  const negativeEvents = readEvents(board).events.slice(beforeBounded);
  assert.deepEqual(negativeEvents.map((event) => event.op), ['node', 'edge', 'receipt']);
  const negativeNode = negativeEvents[0].node;
  assert.equal(negativeNode.type, 'negative-result');
  assert.equal(negativeEvents[1].edge.from, 'fd399');
  assert.equal(negativeEvents[1].edge.to, negativeNode.id);
  assert.equal(negativeEvents[1].edge.kind, 'related-to');
  for (const value of Object.values(bounds)) assert.ok(negativeNode.detail.includes(value));
  assert.ok(negativeNode.detail.includes('原始补充说明，包含逗号、冒号：与换行\n保留这行。'));
  assert.equal(replay(board).nodes.fd399.status, 'open');
  assert.equal(replay(board).nodes.fd399.confidence, 'suspected');
  assert.equal(Object.values(replay(board).nodes).filter((item) => item.title === 'Synthetic bounded experiment result').length, 1);
  ok('negative-result boundaries and per-mode drafts survive switching and lost responses; the default weak relation never refutes a candidate');

  await authored.getByLabel('新节点标题', { exact: true }).fill('Synthetic explicitly scoped counterevidence');
  await authored.getByLabel('可排除的范围', { exact: true }).fill('仅排除该匿名入口的特定断言，其他入口仍未确定。');
  await authored.getByLabel('与当前节点的关系', { exact: true }).selectOption('contradicts');
  const beforeExplicitCounter = readEvents(board).events.length;
  await authored.getByRole('button', { name: '记录负结果', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[aria-label="添加相关节点"] input[aria-label="新节点标题"]')?.value === '');
  const counterEvents = readEvents(board).events.slice(beforeExplicitCounter);
  assert.deepEqual(counterEvents.map((event) => event.op), ['node', 'edge', 'receipt']);
  assert.equal(counterEvents[1].edge.from, counterEvents[0].node.id);
  assert.equal(counterEvents[1].edge.to, 'fd399');
  assert.equal(counterEvents[1].edge.kind, 'contradicts');
  assert.ok(counterEvents[0].node.detail.includes('仅排除该匿名入口的特定断言，其他入口仍未确定。'));
  assert.equal(counterEvents[0].node.detail.includes('检查范围:'), false);
  assert.equal(replay(board).nodes.fd399.status, 'open');
  assert.equal(replay(board).nodes.fd399.confidence, 'suspected');
  ok('explicitly selecting contradiction records the bounded counterevidence without filling missing scope or changing the candidate verdict');

  await page.goto(`${url}/?workspace=audit&issue=q39&candidate=fd399&node=${negativeNode.id}`);
  await inspector.getByRole('heading', { name: negativeNode.title, exact: true }).waitFor();
  await inspector.getByText('仅描述作者明确写下的检查与排除范围。未记录范围仍未确定，不自动构成对候选的反证。', { exact: true }).waitFor();
  for (const value of Object.values(bounds)) assert.ok((await inspector.innerText()).includes(value));
  const negativeEdit = inspector.getByRole('region', { name: '编辑节点', exact: true });
  await negativeEdit.getByRole('button', { name: '修改节点', exact: true }).click();
  assert.equal(await negativeEdit.getByLabel('详情', { exact: true }).inputValue(), negativeNode.detail);
  const correctedDetail = `${negativeNode.detail}\n\n手工更正：追加范围限制，保持前文原样。`;
  await negativeEdit.getByLabel('详情', { exact: true }).fill(correctedDetail);
  await negativeEdit.getByRole('button', { name: '保存', exact: true }).click();
  await negativeEdit.getByRole('button', { name: '修改节点', exact: true }).waitFor();
  assert.equal(replay(board).nodes[negativeNode.id].detail, correctedDetail);
  assert.equal(replay(board).nodes.fd399.status, 'open');
  await inspector.getByText('仅描述作者明确写下的检查与排除范围。未记录范围仍未确定，不自动构成对候选的反证。', { exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(output, 'authored-negative-boundaries.png'), fullPage: true }); artifacts.push('authored-negative-boundaries.png');
  ok('bounded negative records reload and edit full authored detail without parsing or regenerating their boundaries');
  await page.setViewportSize({ width: 390, height: 844 });
  const collapseNavigation = page.getByRole('button', { name: '收起导航', exact: true });
  if (await collapseNavigation.count()) await collapseNavigation.click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.ok((await inspector.innerText()).includes('尾部条件必须保留。'));
  await inspector.getByText('仅描述作者明确写下的检查与排除范围。未记录范围仍未确定，不自动构成对候选的反证。', { exact: true }).evaluate((element) => element.scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(output, 'negative-boundaries-mobile.png'), fullPage: true }); artifacts.push('negative-boundaries-mobile.png');
  await inspector.getByText(correctedDetail, { exact: true }).evaluate((element) => element.scrollIntoView({ block: 'end' }));
  await page.screenshot({ path: path.join(output, 'negative-limitations-mobile.png'), fullPage: true }); artifacts.push('negative-limitations-mobile.png');
  ok('bounded negative scope and limitations remain readable on narrow screens without horizontal overflow');
  assert.deepEqual(errors, []);

} catch (error) {
  failure = error;
  if (page) try { await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }); artifacts.push('failure.png'); } catch {}
} finally {
  await browser?.close();
  if (server) await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
  fs.rmSync(scratch, { recursive: true, force: true });
  fs.writeFileSync(path.join(output, 'VERIFICATION.json'), JSON.stringify({ result: failure ? 'FAIL' : 'PASS', checks, errors, artifacts, ...(failure ? { error: failure.stack || String(failure) } : {}) }, null, 2) + '\n');
  console.log(`AUDIT ${failure ? 'FAIL' : 'PASS'} checks=${checks.length} artifacts=${output}`);
  if (failure) { console.error(failure); process.exitCode = 1; }
}
