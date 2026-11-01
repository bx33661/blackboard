import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installWorkspaceService, refreshWorkspaceService, renderLaunchAgent, workspaceServiceStatus, WORKSPACE_SERVICE_LABEL } from '../lib/setup.js';

// POSIX fake executables exercise launchd behavior on macOS and Linux without a real job.
const test = (name, run) => nodeTest(name, { skip: process.platform === 'win32' }, run);

function fixture(t, { installed = true, loaded = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-launchd-fixture-'));
  const project = path.join(root, 'project');
  const home = path.join(root, 'home');
  const fakeBin = path.join(root, 'fake-bin');
  const file = path.join(home, 'Library', 'LaunchAgents', `${WORKSPACE_SERVICE_LABEL}.plist`);
  for (const dir of [project, fakeBin, path.dirname(file)]) fs.mkdirSync(dir, { recursive: true });
  const stateFile = path.join(root, 'launchd-state.json');
  const oldCli = '/synthetic/old/bin/blackboard.js';
  const cli = '/synthetic/new/bin/blackboard.js';
  const original = Buffer.from(`${renderLaunchAgent({ cwd: project, cli: oldCli, port: 4567 })}\n<!-- preserve exact original bytes -->\n`);
  if (installed) fs.writeFileSync(file, original, { mode: 0o640 });
  const save = state => fs.writeFileSync(stateFile, JSON.stringify(state));
  const state = () => JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  save({ loaded, running: loaded, calls: [] });
  fs.writeFileSync(path.join(fakeBin, 'launchctl'), `#!${process.execPath}
const fs = require('node:fs');
const file = process.env.BLACKBOARD_TEST_LAUNCHD_STATE;
const state = JSON.parse(fs.readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
state.calls.push(args);
function save() { fs.writeFileSync(file, JSON.stringify(state)); }
if (args[0] === 'print') {
  save();
  if (!state.loaded) process.exit(113);
  console.log('state = ' + (state.running ? 'running' : 'waiting'));
} else if (args[0] === 'bootout') {
  state.loaded = state.running = false;
  save();
} else if (args[0] === 'bootstrap') {
  const raw = fs.readFileSync(args[2], 'utf8');
  const old = raw.includes('/synthetic/old/bin/blackboard.js');
  state.loaded = true;
  state.running = true;
  save();
  if (old ? state.failOldBootstrap : state.failNewBootstrap) process.exit(5);
} else process.exit(99);
`, { mode: 0o755 });
  const platform = Object.getOwnPropertyDescriptor(process, 'platform');
  const env = { HOME: process.env.HOME, PATH: process.env.PATH, BLACKBOARD_PORT: process.env.BLACKBOARD_PORT,
    BLACKBOARD_TEST_LAUNCHD_STATE: process.env.BLACKBOARD_TEST_LAUNCHD_STATE };
  const fetch = globalThis.fetch;
  const requests = [];
  Object.defineProperty(process, 'platform', { ...platform, value: 'darwin' });
  process.env.HOME = home;
  process.env.PATH = `${fakeBin}${path.delimiter}${env.PATH}`;
  process.env.BLACKBOARD_TEST_LAUNCHD_STATE = stateFile;
  process.env.BLACKBOARD_PORT = '9999';
  globalThis.fetch = async url => {
    requests.push(String(url));
    if (String(url).endsWith('/api/status')) return Response.json({ cwd: fs.realpathSync(project), readOnly: false });
    return state().failHealth ? new Response('synthetic health failure', { status: 503 }) : Response.json({ nodes: {} });
  };
  t.after(() => {
    Object.defineProperty(process, 'platform', platform);
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    globalThis.fetch = fetch;
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { project, file, cli, oldCli, original, state, save, requests };
}

function assertRestored(f, loaded) {
  assert.deepEqual(fs.readFileSync(f.file), f.original);
  assert.equal(fs.statSync(f.file).mode & 0o777, 0o640);
  assert.equal(f.state().loaded, loaded);
  assert.equal(fs.readdirSync(path.dirname(f.file)).some(name => name.startsWith('.blackboard-service-recovery-')), false);
}

test('refresh retains the plist port despite environment and project config drift and keeps stopped services stopped', async t => {
  const f = fixture(t, { loaded: false });
  fs.mkdirSync(path.join(f.project, '.blackboard'));
  fs.writeFileSync(path.join(f.project, '.blackboard', 'config.json'), JSON.stringify({ viewerPort: 8888 }));
  const stopped = await refreshWorkspaceService({ cli: f.cli });
  assert.equal(stopped.port, 4567);
  assert.equal(stopped.restarted, false);
  assert.equal(f.state().loaded, false);
  assert.equal(f.state().calls.some(call => call[0] === 'bootstrap' || call[0] === 'bootout'), false);
  assert.match(fs.readFileSync(f.file, 'utf8'), /<string>4567<\/string>/);
  f.save({ ...f.state(), loaded: true, running: true });
  const running = await refreshWorkspaceService({ cli: f.cli });
  assert.equal(running.restarted, true);
  assert.equal(running.verified, true);
  assert.equal(running.port, 4567);
  assert.equal(f.requests.every(url => url.startsWith('http://127.0.0.1:4567/')), true);
});

test('replacement publication failure restores the exact old plist and loaded state', async t => {
  const f = fixture(t);
  const rename = fs.renameSync;
  let fail = true;
  fs.renameSync = (from, to) => {
    if (to === f.file && fail) { fail = false; throw new Error('synthetic write failure'); }
    return rename(from, to);
  };
  try {
    await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), /synthetic write failure.*已恢复/);
  } finally { fs.renameSync = rename; }
  assertRestored(f, true);
});

test('staging write failure leaves the stopped original registration unchanged', async t => {
  const f = fixture(t, { loaded: false });
  const write = fs.writeFileSync;
  fs.writeFileSync = (file, ...args) => {
    if (String(file).endsWith('/replacement.plist')) throw new Error('synthetic staging write failure');
    return write(file, ...args);
  };
  try {
    await assert.rejects(refreshWorkspaceService({ cli: f.cli }), /synthetic staging write failure.*已恢复/);
  } finally { fs.writeFileSync = write; }
  assertRestored(f, false);
});

test('failed replacement bootstrap unloads its partial job and restores the loaded original', async t => {
  const f = fixture(t);
  f.save({ ...f.state(), failNewBootstrap: true });
  await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), /bootstrap.*已恢复/);
  assertRestored(f, true);
  assert.equal(f.state().calls.filter(call => call[0] === 'bootout').length, 2);
});

test('failed replacement health check restores exact configuration and the previous loading state', async t => {
  const f = fixture(t);
  f.save({ ...f.state(), failHealth: true });
  await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), /校验失败.*已恢复/);
  assertRestored(f, true);
});

test('failed first installation removes its plist and any partially bootstrapped job', async t => {
  const f = fixture(t, { installed: false, loaded: false });
  f.save({ ...f.state(), failNewBootstrap: true });
  await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), /bootstrap.*已移除/);
  assert.equal(fs.existsSync(f.file), false);
  assert.equal(f.state().loaded, false);
});

test('rollback bootstrap failure explicitly reports and retains the original recovery bytes', async t => {
  const f = fixture(t);
  f.save({ ...f.state(), failNewBootstrap: true, failOldBootstrap: true });
  await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), error => {
    assert.match(error.message, /服务回滚失败.*恢复文件保留于/);
    assert.equal(error.previousLoaded, true);
    assert.deepEqual(fs.readFileSync(error.recoveryPath), f.original);
    assert.equal(error.message.includes(error.recoveryPath), true);
    return true;
  });
});

test('rollback file publication failure retains exact original recovery bytes and reports their path', async t => {
  const f = fixture(t);
  f.save({ ...f.state(), failNewBootstrap: true });
  const rename = fs.renameSync;
  let publications = 0;
  fs.renameSync = (from, to) => {
    if (to === f.file && ++publications === 2) throw new Error('synthetic restore write failure');
    return rename(from, to);
  };
  try {
    await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), error => {
      assert.match(error.message, /服务回滚失败:.*synthetic restore write failure.*恢复文件保留于/);
      assert.deepEqual(fs.readFileSync(error.recoveryPath), f.original);
      assert.equal(f.state().loaded, false);
      return true;
    });
  } finally { fs.renameSync = rename; }
});

test('unmanaged registrations are never replaced or booted out', async t => {
  const f = fixture(t);
  const unmanaged = '<plist><dict><key>Label</key><string>synthetic.unmanaged</string></dict></plist>';
  fs.writeFileSync(f.file, unmanaged);
  await assert.rejects(installWorkspaceService({ cwd: f.project, cli: f.cli, port: 4567 }), /拒绝覆盖/);
  const refreshed = await refreshWorkspaceService({ cli: f.cli });
  assert.equal(refreshed.refreshed, false);
  assert.equal(workspaceServiceStatus({ cwd: f.project }).state, 'unmanaged');
  assert.equal(fs.readFileSync(f.file, 'utf8'), unmanaged);
  assert.equal(f.state().calls.every(call => call[0] === 'print'), true);
});
