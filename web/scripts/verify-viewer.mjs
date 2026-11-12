#!/usr/bin/env node
// Development-only browser verification against built assets and synthetic events.
// npm run build && npx playwright install chromium && npm run verify:viewer
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { isolatedPinwhyEnv } from '../../scripts/lib/environment.mjs';

const moduleOverride = process.env.PLAYWRIGHT_MODULE;
const executableOverride = process.env.CHROMIUM_EXECUTABLE;
const output = path.resolve(process.env.PINWHY_VIEWER_OUTPUT || fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-proof-')));
fs.mkdirSync(output, { recursive: true });
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-viewer-'));
const board = path.join(scratch, 'board');
const home = path.join(scratch, 'home');
fs.mkdirSync(board); fs.mkdirSync(home);
const results = [];
const artifacts = [];
const diagnostics = [];
const allWrites = [];
const servers = [];
const browsers = [];
const cleanupErrors = [];
const softwareRenderingArgs = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
const sceneTriggerName = '2.5D 沙盘视图（实验）';
const sceneExitName = '返回平面画布';
const sceneFailure = '无法启动 3D 渲染，已返回平面画布';
let browser;
let chromium;
let executablePath;
let eventFile;
let browserVersion;
const hash = () => eventFile && fs.existsSync(eventFile) ? createHash('sha256').update(fs.readFileSync(eventFile)).digest('hex') : null;
const ok = (name) => { results.push(name); console.log(`PASS ${name}`); };

async function bounded(promise, label, timeout = 15000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeout}ms`)), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

async function screenshot(page, name) {
  await page.screenshot({ animations: 'disabled', path: path.join(output, name), timeout: 5000 });
  artifacts.push(name);
}

async function launchBrowser(extraArgs = []) {
  const instance = await chromium.launch({ headless: true, executablePath, args: [...softwareRenderingArgs, ...extraArgs], timeout: 30000 });
  browsers.push(instance);
  return instance;
}

async function viewerContext(instance = browser) {
  const context = await instance.newContext({ locale: 'zh-CN', viewport: { width: 1360, height: 960 } });
  context.setDefaultTimeout(15000);
  context.setDefaultNavigationTimeout(30000);
  await context.addInitScript(() => localStorage.setItem('pinwhy-pref-locale', JSON.stringify('zh-CN')));
  context.on('page', (page) => {
    page.on('pageerror', (error) => diagnostics.push({ kind: 'pageerror', page: page.url(), message: String(error) }));
    page.on('console', (message) => { if (message.type() === 'error') diagnostics.push({ kind: 'console', page: page.url(), message: message.text() }); });
    page.on('requestfailed', (request) => diagnostics.push({ kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText }));
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) allWrites.push({ method: request.method(), url: request.url() });
    });
  });
  return context;
}

async function assertTriggerFocused(page) {
  await page.waitForFunction((label) => document.activeElement?.getAttribute('aria-label') === label, sceneTriggerName);
}

async function enterScene(page) {
  await page.getByRole('button', { name: sceneTriggerName, exact: true }).click();
  await page.getByRole('button', { name: sceneExitName, exact: true }).waitFor();
  await page.getByLabel('2.5D 沙盘', { exact: true }).waitFor();
  // Public canvas pixels prove that WebGL rendered a scene, beyond mounting a canvas.
  await page.waitForFunction(() => {
    const canvas = document.querySelector('[aria-label="2.5D 沙盘"] canvas');
    if (!canvas || !canvas.width || !canvas.height) return false;
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 64;
    const context = sample.getContext('2d');
    context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data;
    const colors = new Set();
    for (let index = 0; index < pixels.length; index += 4) colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]}`);
    return colors.size > 8;
  });
}

async function assertFlatUsable(page, nodeId, title) {
  const trigger = page.getByRole('button', { name: sceneTriggerName, exact: true });
  await trigger.waitFor();
  assert.equal(await trigger.isEnabled(), true);
  assert.equal(await page.getByRole('button', { name: sceneExitName, exact: true }).count(), 0);
  await assertTriggerFocused(page);
  await page.locator(`.react-flow__node[data-id="${nodeId}"]`).click();
  await page.getByRole('complementary', { name: '节点详情' }).getByRole('heading', { name: title, exact: true }).waitFor();
}

async function assertBuildTooltip(page, build, screenshotName) {
  assert.equal(typeof build?.version, 'string', 'current snapshots expose their version');
  assert.equal(typeof build?.buildId, 'string', 'current snapshots expose their content identity');
  const version = page.getByRole('button', { name: `版本 ${build.version}`, exact: true });
  await version.focus();
  const tooltip = page.getByRole('tooltip');
  await tooltip.waitFor();
  const text = await tooltip.innerText();
  for (const value of [build.version, build.buildId, build.commit, build.origin.root].filter(Boolean)) assert.ok(text.includes(value), `visible build tooltip includes ${value}`);
  assert.ok(text.includes({ checkout: '源码工作区', release: '已安装版本', other: '其他来源' }[build.origin.kind]));
  if (build.dirty !== null) assert.ok(text.includes(build.dirty ? '有未提交更改' : '无未提交更改'));
  if (build.origin.active !== undefined) assert.ok(text.includes(build.origin.active ? '当前启用' : '未启用'));
  await screenshot(page, screenshotName);
  await version.press('Tab');
  await tooltip.waitFor({ state: 'hidden' });
}

async function verify() {
  // Resolve Playwright's installed browser before replacing HOME for the application.
  ({ chromium } = await import(moduleOverride ? pathToFileURL(path.resolve(moduleOverride)).href : 'playwright'));
  executablePath = executableOverride || chromium.executablePath();
  const env = isolatedPinwhyEnv({ HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'), XDG_CACHE_HOME: path.join(home, '.cache'), XDG_STATE_HOME: path.join(home, '.local', 'state'), PINWHY_CWD: board, PINWHY_QUIET: '1' });
  for (const key of Object.keys(process.env)) if (key.startsWith('PINWHY_')) delete process.env[key];
  Object.assign(process.env, env);
  const { ensure, addNode, addEdge, patchNode, removeNode, removeEdge, moveCursor, addCheckpoint, replay, readEvents, paths } = await import('../../lib/store.js');
  const { startServer } = await import('../../lib/server.js');
  const { renderExport } = await import('../../lib/export.js');
  eventFile = paths(board).events;
  ensure(board);
  const longTag = `boundary-${'x'.repeat(200)}`;
  const hypothesis = addNode({ type: 'hypothesis', title: 'Session isolation hypothesis', detail: 'Original assumption', status: 'open', severity: 'high', confidence: 'suspected', at: 'src/session.ts:42', tags: ['auth-boundary', longTag], author: 'agent:A' }, board).node;
  const evidence = addNode({ type: 'fact', title: 'Old support evidence' }, board).node;
  const counter = addNode({ type: 'observation', title: 'Counter evidence' }, board).node;
  const oldEdge = addEdge({ from: evidence.id, to: hypothesis.id, kind: 'supports' }, board);
  moveCursor(hypothesis.id, { agentId: 'agent:A' }, board);
  const checkpoint = addCheckpoint({ agentId: 'agent:A', summary: 'Handoff before the counterexample' }, board);
  patchNode(hypothesis.id, { status: 'refuted', detail: 'Counterexample recorded' }, board, { by: 'agent:B' });
  removeEdge({ id: oldEdge.id }, { by: 'agent:B' }, board);
  addEdge({ from: counter.id, to: hypothesis.id, kind: 'contradicts' }, board);
  const secondCheckpoint = addCheckpoint({ agentId: 'agent:B', summary: 'Handoff after the counterexample' }, board);
  const longCheckpoint = addCheckpoint({ agentId: 'agent:B', summary: `Long-summary-${'s'.repeat(200)}` }, board);
  const server = await startServer({ cwd: board, port: 0 }); servers.push(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  browser = await launchBrowser();
  browserVersion = await browser.version();
  const context = await viewerContext();
  const page = await context.newPage();
  const pageErrors = []; page.on('pageerror', (e) => pageErrors.push(String(e)));
  const writes = []; page.on('request', (req) => { if (req.url().includes('/api/') && !['GET', 'HEAD'].includes(req.method())) writes.push({ method: req.method(), url: req.url(), body: req.postDataJSON(), requestId: req.headers()['idempotency-key'] }); });
  await page.goto(`${url}/?view=all&node=${hypothesis.id}`);
  const inspector = page.getByRole('complementary', { name: '节点详情' });
  await inspector.waitFor();
  assert.equal(await inspector.getByLabel('位置', { exact: true }).innerText(), 'src/session.ts:42');
  assert.ok((await inspector.innerText()).includes('auth-boundary'));
  assert.ok((await inspector.innerText()).includes('agent:A'));
  assert.ok((await inspector.innerText()).includes('已反驳'));
  assert.ok((await inspector.innerText()).includes('高危'));
  assert.ok((await inspector.innerText()).includes('待验证'));
  ok('source location, tags and recorded author are visible as text');

  const beforeIdentity = hash();
  const identityResponse = await context.request.get(`${url}/api/graph`, { timeout: 15000 });
  assert.equal(identityResponse.ok(), true);
  const identitySnapshot = await identityResponse.json();
  await assertBuildTooltip(page, identitySnapshot.meta.build, 'build-identity.png');
  assert.equal(hash(), beforeIdentity);
  assert.equal(writes.length, 0);
  ok('visible version tooltip presents the public snapshot build identity and provenance without writing');

  const legacySnapshot = structuredClone(identitySnapshot);
  delete legacySnapshot.meta.build;
  const legacyContext = await viewerContext();
  const legacyPage = await legacyContext.newPage();
  await legacyPage.route('**/api/graph', (route) => route.fulfill({ json: legacySnapshot }));
  // Keep this public legacy snapshot authoritative instead of receiving current-version SSE.
  await legacyPage.route('**/events', (route) => route.abort('failed'));
  await legacyPage.goto(`${url}/?view=all&node=${hypothesis.id}`);
  await legacyPage.getByRole('complementary', { name: '节点详情' }).getByRole('heading', { name: 'Session isolation hypothesis', exact: true }).waitFor();
  assert.equal(await legacyPage.getByRole('button', { name: /^版本 / }).count(), 0);
  await screenshot(legacyPage, 'legacy-build-omitted.png');
  await legacyContext.close();
  assert.equal(hash(), beforeIdentity);
  assert.equal(allWrites.length, 0);
  ok('a public legacy snapshot without build metadata remains usable and omits the version control');

  const beforeRead = hash();
  await inspector.getByRole('button', { name: '查看历史', exact: true }).click();
  await inspector.getByRole('button', { name: '刷新历史', exact: true }).waitFor();
  await page.waitForFunction(() => [...document.querySelectorAll('summary')].some((el) => el.textContent.includes('patch')));
  const patchHistory = inspector.locator('details').filter({ has: page.locator('summary', { hasText: /patch/ }) }).first();
  await patchHistory.locator('summary').first().click();
  assert.ok((await patchHistory.innerText()).includes('refuted'));
  assert.ok((await patchHistory.innerText()).includes('open'));
  await screenshot(page, 'node-history.png');
  await page.getByRole('button', { name: '现场摘要', exact: true }).click();
  await page.getByLabel('选择检查点', { exact: true }).selectOption(checkpoint.id);
  await page.getByText('Handoff before the counterexample', { exact: true }).first().waitFor();
  const changes = page.getByRole('region', { name: '交接后变化' });
  await page.waitForFunction(() => document.querySelector('[aria-label="交接后变化"]')?.textContent.includes('移除关系 · 1'));
  const changesText = await changes.innerText();
  assert.match(changesText, /修改节点 · 1/); assert.match(changesText, /新增关系 · 1/); assert.match(changesText, /移除关系 · 1/);
  assert.ok(changesText.includes(counter.id)); assert.ok(changesText.includes(evidence.id));
  await changes.locator('details').filter({ has: page.locator('summary', { hasText: hypothesis.id }) }).first().locator('summary').first().click();
  assert.ok((await changes.innerText()).includes('refuted'));
  await screenshot(page, 'checkpoint-changes.png');
  assert.equal(hash(), beforeRead, 'reading history and changes never writes');
  assert.equal(writes.length, 0);
  ok('checkpoint diff shows changed hypothesis, removed support and new counterevidence without any write');
  await page.getByRole('button', { name: '关闭摘要', exact: true }).click();

  const graphBeforeLink = replay(board); const eventsBeforeLink = readEvents(board).events.length;
  const connect = inspector.getByRole('region', { name: '关联已有节点' });
  await connect.getByLabel('搜索已有节点', { exact: true }).fill('Old support');
  await connect.getByLabel('选择已有节点', { exact: true }).selectOption(evidence.id);
  assert.match(await connect.getByLabel('方向预览', { exact: true }).innerText(), new RegExp(`${hypothesis.id}.*${evidence.id}`));
  await connect.getByRole('button', { name: '建立关系', exact: true }).click();
  await connect.getByRole('status').waitFor();
  const graphAfterLink = replay(board);
  assert.equal(Object.keys(graphAfterLink.nodes).length, Object.keys(graphBeforeLink.nodes).length);
  assert.deepEqual(graphAfterLink.cursors, graphBeforeLink.cursors);
  assert.equal(Object.keys(graphAfterLink.edges).length, Object.keys(graphBeforeLink.edges).length + 1);
  const newEvents = readEvents(board).events.slice(eventsBeforeLink);
  assert.deepEqual(newEvents.filter((event) => event.op !== 'receipt').map((event) => event.op), ['edge']);
  assert.ok(writes.at(-1).requestId, 'browser mutations carry an idempotency key');
  assert.equal(newEvents.filter((event) => event.op === 'receipt' && event.requestId === writes.at(-1).requestId).length, 1);
  assert.deepEqual(writes.at(-1).body, { from: hypothesis.id, to: evidence.id, kind: 'related-to', rejectTruncation: true });
  ok('linking existing nodes emits exactly one edge event, default related-to, no new node or cursor mutation');

  await inspector.getByRole('button', { name: '修改节点', exact: true }).click();
  const edit = inspector.getByRole('region', { name: '编辑节点' });
  await edit.getByLabel('标题', { exact: true }).fill('Reviewed hypothesis');
  await edit.getByLabel('风险', { exact: true }).selectOption('critical');
  await edit.getByLabel('可信度', { exact: true }).selectOption('confirmed');
  patchNode(hypothesis.id, { detail: 'Concurrent evidence retained' }, board, { by: 'agent:C' });
  await page.waitForFunction(() => document.querySelector('[aria-label="编辑节点"] textarea[aria-label="详情"]')?.value === 'Concurrent evidence retained');
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await edit.getByRole('button', { name: '修改节点', exact: true }).waitFor();
  const reviewed = replay(board).nodes[hypothesis.id];
  assert.equal(reviewed.title, 'Reviewed hypothesis'); assert.equal(reviewed.severity, 'critical'); assert.equal(reviewed.confidence, 'confirmed'); assert.equal(reviewed.status, 'refuted'); assert.equal(reviewed.detail, 'Concurrent evidence retained');
  const patchWrite = writes.filter((item) => item.method === 'PATCH').at(-1).body;
  const { expected, rejectTruncation, ...changedFields } = patchWrite;
  assert.deepEqual(changedFields, { title: 'Reviewed hypothesis', severity: 'critical', confidence: 'confirmed' });
  assert.equal(rejectTruncation, true);
  assert.deepEqual(expected, { title: 'Session isolation hypothesis', severity: 'high', confidence: 'suspected' });
  ok('independent risk/confidence edits send only changed fields and retain concurrent untouched evidence and status');

  await edit.getByRole('button', { name: '修改节点', exact: true }).click();
  await edit.getByLabel('风险', { exact: true }).selectOption('low');
  patchNode(hypothesis.id, { severity: 'medium' }, board, { by: 'agent:C' });
  await page.waitForFunction(() => [...document.querySelectorAll('dd')].some((el) => el.textContent === '中危'));
  await edit.getByRole('button', { name: '保存', exact: true }).click();
  await edit.getByRole('alert').waitFor();
  assert.equal(await edit.getByLabel('风险', { exact: true }).inputValue(), 'low');
  assert.equal(replay(board).nodes[hypothesis.id].severity, 'medium');
  await inspector.getByRole('button', { name: '关闭详情', exact: true }).click();
  await page.locator(`.react-flow__node[data-id="${hypothesis.id}"]`).click();
  assert.equal(await edit.getByLabel('风险', { exact: true }).inputValue(), 'low');
  assert.ok(await edit.getByRole('button', { name: '保存', exact: true }).isDisabled());
  await screenshot(page, 'conflict-draft.png');
  await edit.getByRole('button', { name: '丢弃草稿', exact: true }).click();
  ok('conflicting risk changes return 409, preserve the selected draft across closing/reopening, and never overwrite');
  assert.deepEqual(pageErrors, []);

  const racePage = await context.newPage();
  const raceErrors = []; racePage.on('pageerror', (e) => raceErrors.push(String(e)));
  const beforeRaces = hash();
  let releaseHistory; let historyReceived; let historyFinished;
  const heldHistory = new Promise((resolve) => { releaseHistory = resolve; });
  const receivedHistory = new Promise((resolve) => { historyReceived = resolve; });
  const finishedHistory = new Promise((resolve) => { historyFinished = resolve; });
  await racePage.route('**/api/history?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('node') !== hypothesis.id) return route.continue();
    const response = await route.fetch(); historyReceived(); await heldHistory;
    await route.fulfill({ response }); historyFinished();
  });
  await racePage.goto(`${url}/?view=all&node=${hypothesis.id}`);
  const raceInspector = racePage.getByRole('complementary', { name: '节点详情' });
  await raceInspector.getByRole('button', { name: '查看历史', exact: true }).click();
  await bounded(receivedHistory, 'held node history request');
  await raceInspector.getByRole('button', { name: /Counter evidence/ }).click();
  await raceInspector.getByRole('heading', { name: 'Counter evidence', exact: true }).waitFor();
  await raceInspector.getByRole('button', { name: '查看历史', exact: true }).click();
  const raceHistory = raceInspector.getByRole('region', { name: '节点历史' });
  await racePage.waitForFunction(() => document.querySelector('[aria-label="节点历史"] details'));
  releaseHistory(); await bounded(finishedHistory, 'released node history response');
  await raceHistory.locator('details').evaluateAll((items) => items.forEach((item) => { item.open = true; }));
  assert.ok((await raceHistory.innerText()).includes('Counter evidence'));
  assert.ok(!(await raceHistory.innerText()).includes('Original assumption'));
  assert.ok(!(await raceHistory.innerText()).includes('Concurrent evidence retained'));
  ok('delayed history for a previous node never renders under the newly selected node');

  let releaseChanges; let changesReceived; let changesFinished;
  const heldChanges = new Promise((resolve) => { releaseChanges = resolve; });
  const receivedChanges = new Promise((resolve) => { changesReceived = resolve; });
  const finishedChanges = new Promise((resolve) => { changesFinished = resolve; });
  await racePage.route('**/api/changes?*', async (route) => {
    if (new URL(route.request().url()).searchParams.get('since') !== checkpoint.id) return route.continue();
    const response = await route.fetch(); changesReceived(); await heldChanges;
    await route.fulfill({ response }); changesFinished();
  });
  await racePage.getByRole('button', { name: '现场摘要', exact: true }).click();
  const raceChanges = racePage.getByRole('region', { name: '交接后变化' });
  await racePage.getByLabel('选择检查点', { exact: true }).selectOption(checkpoint.id);
  await bounded(receivedChanges, 'held checkpoint changes request');
  await racePage.getByLabel('选择检查点', { exact: true }).selectOption(secondCheckpoint.id);
  await raceChanges.getByText('Handoff after the counterexample', { exact: true }).waitFor();
  releaseChanges(); await bounded(finishedChanges, 'released checkpoint changes response');
  assert.equal(await raceChanges.getByText('Handoff before the counterexample', { exact: true }).count(), 0);
  assert.ok((await raceChanges.innerText()).includes('Handoff after the counterexample'));
  assert.equal(hash(), beforeRaces);
  ok('delayed checkpoint diff never replaces the newly selected checkpoint and reading remains event-hash neutral');

  const streamPage = await context.newPage();
  const streamErrors = []; streamPage.on('pageerror', (e) => streamErrors.push(String(e)));
  let releaseGraph; let graphReceived; let graphFinished;
  const heldGraph = new Promise((resolve) => { releaseGraph = resolve; });
  const receivedGraph = new Promise((resolve) => { graphReceived = resolve; });
  const finishedGraph = new Promise((resolve) => { graphFinished = resolve; });
  await streamPage.route('**/api/graph', async (route) => {
    const response = await route.fetch(); graphReceived(); await heldGraph;
    await route.fulfill({ response }); graphFinished();
  });
  await streamPage.goto(`${url}/?view=all&node=${counter.id}`);
  await bounded(receivedGraph, 'held initial graph request');
  const streamInspector = streamPage.getByRole('complementary', { name: '节点详情' });
  await streamInspector.getByRole('heading', { name: 'Counter evidence', exact: true }).waitFor();
  patchNode(counter.id, { title: 'Evidence delivered by newer SSE' }, board, { by: 'agent:stream' });
  await streamInspector.getByRole('heading', { name: 'Evidence delivered by newer SSE', exact: true }).waitFor();
  releaseGraph(); await bounded(finishedGraph, 'released initial graph response');
  // Observe a later animation frame after fetch processing instead of relying on a fixed delay.
  await streamPage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await streamInspector.getByRole('heading', { name: 'Evidence delivered by newer SSE', exact: true }).count(), 1, 'newer SSE title remains after the delayed initial graph response');
  assert.equal(await streamInspector.getByRole('heading', { name: 'Counter evidence', exact: true }).count(), 0);
  assert.deepEqual(streamErrors, []);
  await streamPage.close();
  ok('a slow initial graph fetch never rolls back a newer SSE snapshot');

  const timelineBoard = path.join(scratch, 'timeline'); fs.mkdirSync(timelineBoard); ensure(timelineBoard);
  const archived = addNode({ type: 'note', title: 'Archived timeline target' }, timelineBoard).node;
  const firstPoint = addCheckpoint({ summary: 'Before the archived node was removed' }, timelineBoard);
  const marker = addNode({ type: 'note', title: 'Live timeline marker' }, timelineBoard).node;
  const secondPoint = addCheckpoint({ summary: 'Second timeline checkpoint' }, timelineBoard);
  removeNode(archived.id, {}, timelineBoard);
  const timelineServer = await startServer({ cwd: timelineBoard, port: 0 }); servers.push(timelineServer);
  const timelineUrl = `http://127.0.0.1:${timelineServer.address().port}`;
  const timelineContext = await viewerContext();
  const timelinePage = await timelineContext.newPage();
  const timelineErrors = []; timelinePage.on('pageerror', (error) => timelineErrors.push(String(error)));
  const timelineWrites = allWrites.length;
  const timelineEvents = () => fs.readFileSync(paths(timelineBoard).events, 'utf8');
  const beforeTimeline = timelineEvents();
  let releasePast; let pastReceived; let pastFinished;
  const heldPast = new Promise((resolve) => { releasePast = resolve; });
  const receivedPast = new Promise((resolve) => { pastReceived = resolve; });
  const finishedPast = new Promise((resolve) => { pastFinished = resolve; });
  await timelinePage.route('**/api/graph?*', async (route) => {
    const response = await route.fetch(); pastReceived(); await heldPast;
    await route.fulfill({ response }); pastFinished();
  });
  await timelinePage.goto(`${timelineUrl}/?view=all&node=${archived.id}&asOf=${firstPoint.id}`);
  await bounded(receivedPast, 'held historical graph request');
  await timelinePage.locator('[data-timeline]').waitFor();
  await timelinePage.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(new URL(timelinePage.url()).searchParams.get('node'), archived.id, 'the live loading fallback must not discard the historical node link');
  assert.equal(await timelinePage.getByRole('button', { name: '新建节点', exact: true }).count(), 0);
  releasePast(); await bounded(finishedPast, 'released historical graph response');
  const timelineInspector = timelinePage.getByRole('complementary', { name: '节点详情' });
  await timelineInspector.getByRole('heading', { name: archived.title, exact: true }).waitFor();
  assert.equal(new URL(timelinePage.url()).searchParams.get('node'), archived.id);
  assert.equal(await timelineInspector.getByRole('region', { name: '编辑节点' }).count(), 0);
  assert.equal(await timelineInspector.getByRole('region', { name: '关联已有节点' }).count(), 0);
  assert.equal(timelineEvents(), beforeTimeline);
  assert.equal(allWrites.length, timelineWrites);
  await screenshot(timelinePage, 'timeline-historical-link.png');
  ok('a delayed checkpoint snapshot preserves and selects a linked node removed from the live board without writes');

  let ticks = 0;
  await timelinePage.getByRole('button', { name: '依次播放检查点', exact: true }).click();
  const updateTimer = setInterval(() => patchNode(marker.id, { title: `Live timeline tick ${++ticks}` }, timelineBoard), 300);
  try {
    await timelinePage.waitForFunction((id) => document.querySelector('[data-timeline] button[aria-current="step"]')?.textContent.includes(id), secondPoint.id, { timeout: 6000 });
    await timelinePage.getByRole('button', { name: '暂停播放', exact: true }).click();
    assert.ok(ticks >= 3, 'live writes continue throughout the playback step');
  } finally { clearInterval(updateTimer); }
  const afterTimelineWrites = timelineEvents();
  const latestTitle = replay(timelineBoard).nodes[marker.id].title;
  await screenshot(timelinePage, 'timeline-live-playback.png');
  await timelinePage.getByRole('button', { name: '回到现在', exact: true }).click();
  await timelinePage.locator(`.react-flow__node[data-id="${marker.id}"]`).click();
  await timelineInspector.getByRole('heading', { name: latestTitle, exact: true }).waitFor();
  assert.equal(new URL(timelinePage.url()).searchParams.has('asOf'), false);
  await timelinePage.getByRole('button', { name: '新建节点', exact: true }).waitFor();
  assert.equal(timelineEvents(), afterTimelineWrites);
  assert.equal(allWrites.length, timelineWrites);
  assert.deepEqual(timelineErrors, []);
  await timelineContext.close();
  ok('checkpoint playback advances during continuous live writes and returns to the latest live board without edits');

  await racePage.getByRole('button', { name: '关闭摘要', exact: true }).click();
  await racePage.setViewportSize({ width: 375, height: 812 });
  await racePage.goto(`${url}/?view=all&node=${hypothesis.id}`);
  await raceInspector.waitFor();
  await raceInspector.getByRole('button', { name: '查看历史', exact: true }).click();
  await racePage.waitForFunction(() => document.querySelector('[aria-label="节点历史"] details'));
  const overflowing = async (target) => target.evaluate((root) => [root, ...root.querySelectorAll('*')].filter((el) => el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === 'visible').map((el) => ({ tag: el.tagName, text: el.textContent.slice(0, 100), width: el.clientWidth, scroll: el.scrollWidth })));
  assert.deepEqual(await overflowing(raceInspector), [], 'narrow inspector has no overflowing long source tags');
  await raceInspector.getByRole('region', { name: '证据来源' }).scrollIntoViewIfNeeded();
  await screenshot(racePage, 'narrow-inspector.png');
  await racePage.getByRole('button', { name: '现场摘要', exact: true }).click();
  await racePage.getByLabel('选择检查点', { exact: true }).selectOption(longCheckpoint.id);
  await raceChanges.getByText(`Long-summary-${'s'.repeat(200)}`, { exact: true }).waitFor();
  assert.deepEqual(await overflowing(raceChanges), [], 'narrow checkpoint diff has no overflowing long summary');
  await screenshot(racePage, 'narrow-checkpoint.png');
  assert.deepEqual(raceErrors, []);
  await racePage.close();
  ok('375px inspector and checkpoint history wrap long source tags and summaries without horizontal overflow');

  const beforeScene = hash();
  const writesBeforeScene = allWrites.length;
  const sceneContext = await viewerContext();
  const scenePage = await sceneContext.newPage();
  const sceneErrors = []; scenePage.on('pageerror', (error) => sceneErrors.push(String(error)));
  await scenePage.goto(`${url}/?view=all&node=${hypothesis.id}`);
  const sceneInspector = scenePage.getByRole('complementary', { name: '节点详情' });
  await sceneInspector.waitFor();
  await enterScene(scenePage);
  await scenePage.getByText('拖动旋转 · 右键平移 · 滚轮缩放 · 只读', { exact: true }).waitFor();
  await screenshot(scenePage, 'scene3d-enter.png');
  // Escape keeps its existing meaning: clear selection while staying in the scene.
  await scenePage.keyboard.press('Escape');
  await sceneInspector.waitFor({ state: 'hidden' });
  await scenePage.getByRole('button', { name: sceneExitName, exact: true }).waitFor();
  const canvas = scenePage.getByLabel('2.5D 沙盘', { exact: true });
  const canvasBox = await canvas.boundingBox();
  assert.ok(canvasBox, 'rendered scene has a visible canvas');
  const center = { x: canvasBox.x + canvasBox.width / 2, y: canvasBox.y + canvasBox.height / 2 };
  await scenePage.mouse.move(center.x, center.y);
  await scenePage.mouse.down();
  await scenePage.mouse.move(center.x + 60, center.y + 30, { steps: 6 });
  await scenePage.mouse.up();
  await scenePage.getByRole('button', { name: sceneExitName, exact: true }).click();
  await assertFlatUsable(scenePage, hypothesis.id, 'Reviewed hypothesis');
  await screenshot(scenePage, 'scene3d-exit.png');
  assert.deepEqual(sceneErrors, []);
  assert.equal(hash(), beforeScene, '3D navigation and selection never append events');
  assert.equal(allWrites.length, writesBeforeScene, '3D navigation never sends a mutation request');
  await sceneContext.close();
  ok('3D renders, Escape clears selection, orbiting is read-only, and exit restores a usable 2D canvas and trigger focus');

  const beforeFallbacks = hash();
  const writesBeforeFallbacks = allWrites.length;
  const chunkContext = await viewerContext();
  const chunkPage = await chunkContext.newPage();
  await chunkPage.goto(`${url}/?view=all`);
  await chunkPage.getByRole('button', { name: sceneTriggerName, exact: true }).waitFor();
  const blockedChunks = [];
  // Block scripts only after the initial 2D UI is usable; the next script is lazy-loaded.
  await chunkPage.route('**/*', async (route) => {
    const request = route.request();
    if (request.resourceType() === 'script' && new URL(request.url()).origin === url) {
      blockedChunks.push(request.url());
      await route.abort('failed');
    } else await route.continue();
  });
  await chunkPage.getByRole('button', { name: sceneTriggerName, exact: true }).click();
  await chunkPage.getByText(sceneFailure, { exact: true }).waitFor();
  assert.ok(blockedChunks.length > 0, 'the browser actually requested and failed a lazy script');
  diagnostics.push({ kind: 'injected-fault', scenario: 'lazy-chunk', blockedChunks });
  await assertFlatUsable(chunkPage, hypothesis.id, 'Reviewed hypothesis');
  await screenshot(chunkPage, 'scene3d-chunk-fallback.png');
  await chunkContext.close();
  assert.equal(hash(), beforeFallbacks);
  assert.equal(allWrites.length, writesBeforeFallbacks);
  ok('an actual lazy-script network failure announces the problem and returns focus to usable 2D without writes');

  const unavailableBrowser = await launchBrowser(['--disable-webgl', '--disable-webgl2']);
  const unavailableContext = await viewerContext(unavailableBrowser);
  const unavailablePage = await unavailableContext.newPage();
  await unavailablePage.goto(`${url}/?view=all`);
  await unavailablePage.getByRole('button', { name: sceneTriggerName, exact: true }).waitFor();
  assert.equal(await unavailablePage.evaluate(() => {
    const probe = document.createElement('canvas');
    return probe.getContext('webgl2') === null && probe.getContext('webgl') === null;
  }), true, 'this Chromium process really has no WebGL capability');
  await unavailablePage.getByRole('button', { name: sceneTriggerName, exact: true }).click();
  await unavailablePage.getByText(sceneFailure, { exact: true }).waitFor();
  await assertFlatUsable(unavailablePage, hypothesis.id, 'Reviewed hypothesis');
  await screenshot(unavailablePage, 'scene3d-webgl-fallback.png');
  await unavailableContext.close();
  assert.equal(hash(), beforeFallbacks);
  assert.equal(allWrites.length, writesBeforeFallbacks);
  ok('unavailable WebGL announces the problem and restores focus and usable 2D without writes');

  const beforeReadOnly = hash();
  const readOnlyServer = await startServer({ cwd: board, port: 0, readOnly: true }); servers.push(readOnlyServer);
  await page.goto(`http://127.0.0.1:${readOnlyServer.address().port}/?view=all&node=${hypothesis.id}`);
  await inspector.waitFor();
  assert.equal(await inspector.getByRole('region', { name: '编辑节点' }).count(), 0);
  assert.equal(await inspector.getByRole('region', { name: '关联已有节点' }).count(), 0);
  const writesBeforeReadOnly = allWrites.length;
  await enterScene(page);
  assert.equal(await inspector.getByRole('region', { name: '编辑节点' }).count(), 0);
  assert.equal(await inspector.getByRole('region', { name: '关联已有节点' }).count(), 0);
  await screenshot(page, 'scene3d-readonly.png');
  await page.getByRole('button', { name: sceneExitName, exact: true }).click();
  await assertTriggerFocused(page);
  assert.equal(allWrites.length, writesBeforeReadOnly);
  assert.equal(hash(), beforeReadOnly);
  ok('read-only service renders 3D and returns focus to 2D without mutation controls, API writes or event changes');
  await inspector.getByRole('button', { name: '查看历史', exact: true }).click();
  await page.waitForFunction(() => [...document.querySelectorAll('summary')].some((el) => el.textContent.includes('patch')));
  assert.equal(hash(), beforeReadOnly);
  ok('read-only service exposes history while suppressing every mutation form');

  const offline = path.join(output, 'offline.html'); fs.writeFileSync(offline, renderExport({ cwd: board })); artifacts.push('offline.html');
  const offlinePage = await context.newPage(); const offlineApi = [];
  offlinePage.on('request', (req) => { if (req.url().includes('/api/') || req.url().endsWith('/events')) offlineApi.push(req.url()); });
  await offlinePage.goto(`${pathToFileURL(offline).href}?view=all&node=${hypothesis.id}`);
  const offlineInspector = offlinePage.getByRole('complementary', { name: '节点详情' }); await offlineInspector.waitFor();
  assert.ok((await offlineInspector.innerText()).includes('离线快照不包含事件历史'));
  assert.equal(await offlineInspector.getByRole('region', { name: '编辑节点' }).count(), 0);
  const { root: _localRoot, ...offlineOrigin } = identitySnapshot.meta.build.origin;
  await assertBuildTooltip(offlinePage, { ...identitySnapshot.meta.build, origin: offlineOrigin }, 'offline-build-identity.png');
  await offlinePage.getByRole('button', { name: '现场摘要', exact: true }).click();
  assert.ok((await offlinePage.getByRole('region', { name: '交接后变化' }).innerText()).includes('离线快照不包含事件历史'));
  await screenshot(offlinePage, 'offline-readonly.png');
  assert.deepEqual(offlineApi, []); assert.equal(hash(), beforeReadOnly);
  ok('offline export explicitly reports unavailable history and makes zero API/SSE requests or edits');
  assert.deepEqual(pageErrors, []);
  assert.equal(allWrites.length, writesBeforeReadOnly);

}

let failure;
// A report exists even if dependency loading or Chromium startup fails.
fs.writeFileSync(path.join(output, 'VERIFICATION.json'), `${JSON.stringify({ result: 'RUNNING', checks: [] }, null, 2)}\n`);
try {
  await bounded(verify(), 'complete viewer verification', 240000);
} catch (error) {
  failure = error;
  const pages = browsers.flatMap((instance) => instance.contexts().flatMap((context) => context.pages()));
  await Promise.all(pages.map(async (page, index) => {
    try { await screenshot(page, `failure-${index + 1}.png`); }
    catch (error) { diagnostics.push({ kind: 'screenshot', page: page.url(), message: String(error) }); }
  }));
} finally {
  const cleanup = await Promise.allSettled([
    ...browsers.map((instance) => bounded(instance.close(), 'browser cleanup', 10000)),
    ...servers.map((server) => bounded(new Promise((resolve, reject) => {
      server.closeAllConnections?.();
      server.close((error) => error ? reject(error) : resolve());
    }), 'server cleanup', 10000)),
  ]);
  for (const result of cleanup) if (result.status === 'rejected') cleanupErrors.push(String(result.reason));
  if (cleanupErrors.length && !failure) failure = new Error('Viewer cleanup failed');
  let boardEventHash = null;
  try { boardEventHash = hash(); }
  catch (error) { cleanupErrors.push(String(error)); failure ||= error; }
  try { fs.rmSync(scratch, { recursive: true, force: true }); }
  catch (error) { cleanupErrors.push(String(error)); failure ||= error; }
  const report = { result: failure ? 'FAIL' : 'PASS', checks: results, browser: browserVersion, chromiumArgs: softwareRenderingArgs, artifacts, boardEventHash, diagnostics, cleanupErrors, ...(failure ? { error: failure.stack || String(failure) } : {}) };
  fs.writeFileSync(path.join(output, 'VERIFICATION.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`RESULT ${report.result} ${results.length} browser checks; artifacts: ${output}`);
  if (failure) { console.error(failure); process.exitCode = 1; }
}
