// Run against a disposable DSH Web profile; never loads a model or touches a real board.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const exec = promisify(execFile);
const plugin = fileURLToPath(new URL('../', import.meta.url));
const cli = process.env.PINWHY_TEST_CLI || fileURLToPath(new URL('../../../bin/pinwhy.js', import.meta.url));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'pinwhy-dsh-canvas-'));
const project = path.join(fixture, 'project'), other = path.join(fixture, 'other');
const env = { ...process.env, DSH_HOME: path.join(fixture, 'home'), DSH_TELEMETRY_DISABLED: '1' };
const dsh = process.env.DSH_BIN || 'dsh';
const run = (command, args) => exec(command, args, { env, timeout: 60_000, maxBuffer: 2_097_152 });
const pinwhy = async (cwd, args) => JSON.parse((await run(process.execPath, [cli, ...args, `--cwd=${cwd}`, '--json'])).stdout);
let host, browser, page, logs = '';
try {
  for (const dir of [project, other]) { await fs.mkdir(dir); await pinwhy(dir, ['init', '--here']); }
  const first = (await pinwhy(project, ['node', 'add', 'fact', 'Existing project memory', '--detail=Evidence recorded before the panel opened', '--no-init'])).node;
  const second = (await pinwhy(project, ['node', 'add', 'hypothesis', 'A recorded claim', '--no-init'])).node;
  await pinwhy(project, ['link', first.id, second.id, '--rel=supports', '--no-init']);
  await pinwhy(project, ['cursor', second.id, '--agent=dsh:pinwhy-canvas-one', '--no-init']);
  await pinwhy(other, ['node', 'add', 'fact', 'Separate project memory', '--no-init']);
  for (let index = 0; index < 36; index++) {
    await pinwhy(project, ['node', 'add', 'observation', `Synthetic evidence ${index + 1}`, `--to=${second.id}`, '--rel=supports', '--no-init']);
  }
  const before = await fs.readFile(path.join(project, '.pinwhy/events.jsonl'));
  const configBefore = await fs.readFile(path.join(project, '.pinwhy/config.json'));
  const observer = path.join(fixture, 'observer.mjs');
  await fs.writeFile(observer, `
export const name = 'pinwhy-canvas-fixture';
export const inject = ['appReady', 'workspaceRegistry', 'sessionController', 'sessions', 'sessionTitle'];
export function apply(ctx, config) {
  ctx.effect(() => ctx.appReady.onReady(() => {
    (async () => {
      const otherWorkspace = await ctx.workspaceRegistry.create(config.other, 'Other project');
      const projectWorkspace = await ctx.workspaceRegistry.create(config.project, 'Canvas project');
      for (const [id, workspace, title] of [['pinwhy-canvas-one', projectWorkspace, 'Canvas conversation'], ['pinwhy-canvas-two', otherWorkspace, 'Other conversation']]) {
        const { sessionId } = await ctx.sessionController.create({ sessionId: id, workspaceId: workspace.id });
        const session = ctx.sessions.get(sessionId);
        await ctx.sessionTitle.rename(session, title);
        session.append('turn/start', { turn: 0 });
        session.append('step/start', { turn: 0, step: 0 });
        session.append('user/message', { id: id + '-message', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Synthetic navigation fixture. No model request is sent.' }] }, { surfaceOp: 'append' });
        session.append('step/end', { turn: 0, step: 0 });
        session.append('turn/end', { turn: 0, reason: { kind: 'completed' } });
        await ctx.sessions.flush(session);
      }
      console.log('PINWHY_CANVAS_FIXTURE_READY');
    })().catch(error => console.error(error));
  }));
}
`);
  const overlay = path.join(fixture, 'canvas.patch.yml');
  await fs.writeFile(overlay, JSON.stringify([
    { id: 'pinwhy', config: { runtimeCli: cli, projects: [{ workspace: project }, { workspace: other }], autoDiscover: false } },
    { insert: [{ id: 'pinwhy-canvas-fixture', name: observer, config: { project, other } }] },
  ]));
  await run(dsh, ['plugin', '--profile', 'web', 'add', plugin, '--ignore-scripts', '--config.auto-install-peers=false']);
  host = spawn(dsh, ['--profile', 'web', '--patch', overlay, '--no-open', '--port=0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DSH startup timed out:\n${logs}`)), 60_000);
    const consume = chunk => {
      logs += chunk.toString();
      const url = logs.match(/https?:\/\/127\.0\.0\.1:\d+[^\s\x1b]*/)?.[0];
      if (url && logs.includes('PINWHY_CANVAS_FIXTURE_READY')) { clearTimeout(timer); resolve(url); }
    };
    host.stdout.on('data', consume); host.stderr.on('data', consume);
    host.once('error', reject);
    host.once('exit', code => { clearTimeout(timer); reject(new Error(`DSH exited ${code}:\n${logs}`)); });
  });
  const url = await ready;
  browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url);
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('dialog', { name: 'Get started', exact: true }).getByRole('button').first().click();
  await page.locator('[data-sidebar-scrollport]').getByText('Canvas project', { exact: true }).click();
  await page.locator('[data-sidebar-scrollport]').getByText('Canvas conversation', { exact: true }).click();
  assert.equal(await page.locator('[data-pinwhy-composer-btn]').count(), 0);
  const output = process.env.PINWHY_CANVAS_OUTPUT || fixture;
  await fs.mkdir(output, { recursive: true });
  await page.locator('nav button[aria-haspopup="menu"]').first().click();
  await page.locator('[data-pinwhy-global-entry]').waitFor();
  await page.screenshot({ path: path.join(output, 'dsh-more-entry.png'), fullPage: true });
  await page.locator('[data-pinwhy-global-entry]').press('Enter');
  const iframe = page.frameLocator('iframe[data-pinwhy-viewer]');
  await iframe.locator('.react-flow__node').first().waitFor();
  assert.equal(await page.locator('[data-pinwhy-board-root]').getAttribute('title'), await fs.realpath(project));
  assert.ok((await page.locator('iframe[data-pinwhy-viewer]').boundingBox()).width >= 900);
  assert.ok((await iframe.locator('header[data-presentation="embedded"]').boundingBox()).height <= 50);
  const frame = () => page.frames().find(frame => frame.url().includes('/pinwhy-viewer/'));
  await frame().waitForFunction(() => {
    const viewport = document.querySelector('.react-flow__viewport');
    return viewport && new DOMMatrixReadOnly(getComputedStyle(viewport).transform).a >= 0.55;
  });
  await page.screenshot({ path: path.join(output, 'dsh-global-board.png'), fullPage: true });
  const picker = page.locator('[data-pinwhy-session-picker]');
  const projectGroups = await picker.locator('optgroup').evaluateAll(groups => groups.map(group => group.label));
  assert.ok(projectGroups.includes('project') && projectGroups.includes('other'));
  const source = await page.locator('iframe[data-pinwhy-viewer]').getAttribute('src');
  let releaseDocument;
  const documentGate = new Promise(resolve => { releaseDocument = resolve; });
  const documentRoute = url => url.pathname === new URL(source, page.url()).pathname;
  const delayDocument = async route => { await documentGate; await route.continue(); };
  await page.route(documentRoute, delayDocument);
  const navigation = page.waitForEvent('framenavigated', { predicate: frame => frame.url().includes('/pinwhy-viewer/') });
  const reloadClick = page.locator('[data-pinwhy-reload]').click();
  await page.locator('.pinwhy-frame-loading').waitFor();
  assert.equal(await page.locator('[data-pinwhy-viewer-pane]').getAttribute('aria-busy'), 'true');
  await page.screenshot({ path: path.join(output, 'dsh-canvas-loading.png'), fullPage: true });
  releaseDocument();
  await reloadClick; await navigation;
  await page.unroute(documentRoute, delayDocument);
  await page.locator('[data-pinwhy-viewer-pane][aria-busy="false"]').waitFor();
  await iframe.locator('.react-flow__node').first().waitFor();
  assert.equal(await page.locator('iframe[data-pinwhy-viewer]').getAttribute('src'), source);
  await page.setViewportSize({ width: 600, height: 900 });
  await picker.focus();
  const heading = await page.locator('.pinwhy-global-heading').boundingBox();
  const pickerBounds = await picker.boundingBox();
  assert.ok(pickerBounds.y >= heading.y + heading.height);
  assert.equal(await page.locator('.pinwhy-global-header').evaluate(header => header.scrollWidth <= header.clientWidth), true);
  await page.screenshot({ path: path.join(output, 'dsh-canvas-narrow.png'), fullPage: true });
  await picker.selectOption('');
  await page.locator('[data-pinwhy-viewer-status="empty"]').waitFor();
  assert.equal(await page.locator('iframe[data-pinwhy-viewer]').count(), 0);
  await page.screenshot({ path: path.join(output, 'dsh-canvas-empty.png'), fullPage: true });
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.locator('[data-pinwhy-session-picker]').selectOption('pinwhy-canvas-two');
  await iframe.getByLabel('Overview', { exact: true }).click();
  await iframe.getByText('Separate project memory', { exact: true }).first().waitFor();
  assert.equal(await page.locator('[data-pinwhy-board-root]').getAttribute('title'), await fs.realpath(other));
  await page.locator('[data-sidebar-scrollport]').getByText('Canvas conversation', { exact: true }).click();
  await page.getByRole('button', { name: 'More conversation views', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Pinwhy Board', exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, 'dsh-conversation-entry.png'), fullPage: true });
  await page.getByRole('menuitem', { name: 'Pinwhy Board', exact: true }).click();
  await iframe.locator('.react-flow__edge').first().waitFor();
  assert.equal(await page.locator('[data-pinwhy-board-root]').getAttribute('title'), await fs.realpath(project));
  const searchNode = async title => {
    await iframe.getByRole('button', { name: 'Search', exact: true }).click();
    await iframe.getByPlaceholder('Search nodes or type a command…').fill(title);
    await iframe.getByRole('dialog').getByText(title, { exact: true }).click();
  };
  await searchNode(first.title);
  await iframe.getByText('Evidence recorded before the panel opened', { exact: true }).first().waitFor();
  assert.deepEqual(await fs.readFile(path.join(project, '.pinwhy/events.jsonl')), before);
  assert.deepEqual(await fs.readFile(path.join(project, '.pinwhy/config.json')), configBefore);
  const changed = (await pinwhy(project, ['node', 'add', 'observation', 'External write reaches the canvas', `--to=${second.id}`, '--rel=supports', '--no-init'])).node;
  await iframe.getByRole('button', { name: 'Close details', exact: true }).click();
  await searchNode(changed.title);
  await iframe.getByRole('button', { name: 'Close details', exact: true }).click();
  await page.screenshot({ path: path.join(output, 'dsh-canvas.png'), fullPage: true });
  await iframe.locator('[data-scene3d-trigger]').click();
  await iframe.getByRole('button', { name: 'Back to the flat canvas', exact: true }).waitFor();
  await frame().waitForFunction(() => {
    const canvas = document.querySelector('[aria-label="2.5D sandbox"] canvas');
    if (!canvas?.width || !canvas.height) return false;
    const sample = document.createElement('canvas'); sample.width = 64; sample.height = 64;
    const context = sample.getContext('2d'); context.drawImage(canvas, 0, 0, 64, 64);
    const pixels = context.getImageData(0, 0, 64, 64).data, colors = new Set();
    for (let i = 0; i < pixels.length; i += 4) colors.add(`${pixels[i]},${pixels[i + 1]},${pixels[i + 2]}`);
    return colors.size > 8;
  });
  await page.screenshot({ path: path.join(output, 'dsh-canvas-3d.png'), fullPage: true });
  await iframe.getByRole('button', { name: 'Back to the flat canvas', exact: true }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await frame().waitForFunction(() => document.documentElement.dataset.theme === 'dark');
  await page.screenshot({ path: path.join(output, 'dsh-canvas-dark.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log(`DSH_CANVAS: both native menus; grouped Sessions; real document reload; loading and empty states; narrow layout; readable dense graph; Session switching; evidence; readonly opening; external sync; 2D/3D and dark appearance PASS\nScreenshots: ${output}`);
} catch (error) {
  console.error(logs);
  if (page) {
    const output = process.env.PINWHY_CANVAS_OUTPUT || fixture;
    await fs.mkdir(output, { recursive: true });
    await page.screenshot({ path: path.join(output, 'dsh-canvas-failure.png'), fullPage: true }).catch(() => {});
    console.error((await page.locator('body').innerText()).slice(0, 12000));
  }
  throw error;
} finally {
  await browser?.close();
  if (host && host.exitCode === null) {
    const closed = new Promise(resolve => host.once('exit', resolve));
    host.kill('SIGTERM');
    const escalation = setTimeout(() => host.kill('SIGKILL'), 3000);
    await closed; clearTimeout(escalation);
  }
  if (process.env.PINWHY_CANVAS_OUTPUT) await fs.rm(fixture, { recursive: true, force: true });
}
