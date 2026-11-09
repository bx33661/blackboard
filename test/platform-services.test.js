import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { OWNER, replaceManagedService, stopManagedService } from '../lib/services/common.js';
import { createSystemdService, renderSystemdUnit } from '../lib/services/systemd.js';
import { createWindowsService, taskArguments } from '../lib/services/windows.js';

function fixture(t, platform, { installed = true, loaded = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-native-service-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = { owner: OWNER, cwd: platform === 'linux' ? '/synthetic/项目 $HOME %n "quote"' : 'C:\\项目 $HOME %n\\board',
    cli: platform === 'linux' ? '/synthetic/current/bin/pinwhy.js' : 'C:\\Program Files\\黑板\\current\\bin\\pinwhy.js',
    node: platform === 'linux' ? '/synthetic/node $runtime' : 'C:\\Program Files\\Node\\node.exe', port: 4567 };
  const state = { loaded, running: loaded, failNew: false, failOld: false, calls: [], task: null, scripts: [] };
  let adapter;
  const taskFor = (cfg, enabled) => ({ exists: true, sid: 'S-1-5-21-1234',
    description: `${OWNER}:${Buffer.from(JSON.stringify(cfg)).toString('base64')}`, enabled,
    state: enabled ? 'Running' : 'Disabled', user: 'S-1-5-21-1234', logon: 'Interactive', level: 'Limited',
    actions: [{ execute: cfg.node, arguments: taskArguments(cfg), cwd: cfg.cwd }],
    triggers: [{ user: 'S-1-5-21-1234', enabled: true, type: 'MSFT_TaskLogonTrigger' }] });
  if (platform === 'linux') {
    adapter = createSystemdService({ home: root, configHome: path.join(root, 'config'), run(command, args) {
      assert.equal(command, 'systemctl');
      assert.equal(args[0], '--user');
      state.calls.push(args.slice(1));
      const operation = args[1];
      if (operation === 'show') {
        if (args.includes('--value')) return state.dropins || '';
        return `LoadState=${fs.existsSync(adapter.file) ? 'loaded' : 'not-found'}\nActiveState=${state.running ? 'active' : 'inactive'}\nUnitFileState=${state.loaded ? 'enabled' : 'disabled'}\nFragmentPath=${state.fragment || (fs.existsSync(adapter.file) ? adapter.file : '')}\n`;
      }
      if (operation === 'disable') { state.loaded = state.running = false; return ''; }
      if (operation === 'enable') {
        state.loaded = true;
        if (args.includes('--now')) state.running = true;
        const raw = fs.readFileSync(adapter.file, 'utf8');
        const old = raw.includes('original-byte-marker');
        if (old ? state.failOld : state.failNew) throw new Error('synthetic enable failure');
        return '';
      }
      if (operation === 'start') { state.running = true; return ''; }
      if (operation === 'daemon-reload') return '';
      throw new Error(`Unexpected systemd operation: ${operation}`);
    } });
  } else {
    adapter = createWindowsService({ home: root, dataHome: path.join(root, 'local-data'), run(command, args) {
      assert.equal(command, 'powershell.exe');
      assert.deepEqual(args.slice(0, 4), ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand']);
      const script = Buffer.from(args[4], 'base64').toString('utf16le');
      state.scripts.push(script);
      const encoded = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1];
      assert.ok(encoded);
      const data = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
      state.calls.push([data.operation, data]);
      switch (data.operation) {
        case 'inspect': return JSON.stringify(state.task ? { ...state.task, xml: JSON.stringify(state.task) } : { exists: false, sid: 'S-1-5-21-1234' });
        case 'disable': if (state.task) { state.task.enabled = false; state.task.state = 'Disabled'; } return '';
        case 'register': {
          state.task = taskFor(data.config, data.start);
          const old = data.config.cli === config.cli;
          if (old ? state.failOld : state.failNew) throw new Error('synthetic register failure');
          return '';
        }
        case 'restore':
          if (state.failOld) throw new Error('synthetic restore failure');
          state.task = data.xml ? JSON.parse(data.xml) : null;
          return '';
        case 'remove': state.task = null; return '';
        default: throw new Error(`Unexpected task operation: ${data.operation}`);
      }
    } });
  }
  fs.mkdirSync(path.dirname(adapter.file), { recursive: true });
  const original = platform === 'linux' ? Buffer.from(`${renderSystemdUnit(config)}# original-byte-marker\n`)
    : Buffer.from(`${JSON.stringify(config, null, 4)}\n\n`);
  if (installed) {
    fs.writeFileSync(adapter.file, original, { mode: 0o640 });
    if (platform === 'win32') state.task = taskFor(config, loaded);
  }
  const replacement = { ...config, cli: config.cli.replace('current', 'new-current') };
  const status = () => adapter.status({ cwd: config.cwd });
  const replace = (options = {}) => replaceManagedService({ adapter, previous: status(), config: replacement,
    start: true, health: async cfg => { assert.equal(cfg.port, 4567); return { ok: true }; }, ...options });
  return { root, adapter, config, replacement, state, status, replace, original };
}

for (const platform of ['linux', 'win32']) {
  test(`${platform}: install pins native action, starts and checks health`, async t => {
    const f = fixture(t, platform, { installed: false, loaded: false });
    let health = false;
    const result = await f.replace({ health: async config => { health = true; assert.deepEqual(config, f.replacement); return { ok: true }; } });
    assert.equal(health, true);
    assert.equal(result.verified, true);
    assert.equal(result.loaded, true);
    assert.equal(result.managed, true);
    assert.equal(result.currentProject, true);
    assert.equal(result.cli, f.replacement.cli);
    assert.equal(result.port, 4567);
  });

  test(`${platform}: failed start restores exact original bytes and registration`, async t => {
    const f = fixture(t, platform);
    const registration = structuredClone(f.state.task);
    f.state.failNew = true;
    await assert.rejects(f.replace(), /synthetic/);
    assert.deepEqual(fs.readFileSync(f.adapter.file), f.original);
    if (process.platform !== 'win32') assert.equal(fs.statSync(f.adapter.file).mode & 0o777, 0o640);
    assert.equal(f.status().loaded, true);
    assert.equal(f.status().running, true);
    if (platform === 'win32') assert.deepEqual(f.state.task, registration);
  });

  test(`${platform}: failed health check restores stopped original after attempted start`, async t => {
    const f = fixture(t, platform, { loaded: false });
    await assert.rejects(f.replace({ health: async () => { throw new Error('synthetic health failure'); } }), /health failure/);
    assert.deepEqual(fs.readFileSync(f.adapter.file), f.original);
    assert.equal(f.status().state, 'stopped');
    assert.equal(f.status().loaded, false);
  });

  test(`${platform}: refresh of a stopped service never starts or health-checks it`, async t => {
    const f = fixture(t, platform, { loaded: false });
    const result = await f.replace({ start: false, health: () => assert.fail('stopped refresh health check') });
    assert.equal(result.state, 'stopped');
    assert.equal(result.verified, false);
    assert.equal(result.cli, f.replacement.cli);
    if (platform === 'linux') assert.equal(f.state.calls.some(call => ['enable', 'start'].includes(call[0])), false);
    else assert.equal(f.state.calls.find(call => call[0] === 'register')[1].start, false);
  });

  test(`${platform}: failed first installation removes configuration and registration`, async t => {
    const f = fixture(t, platform, { installed: false, loaded: false });
    f.state.failNew = true;
    await assert.rejects(f.replace());
    assert.equal(fs.existsSync(f.adapter.file), false);
    assert.equal(f.status().state, 'not-installed');
    assert.equal(f.status().loaded, false);
  });

  test(`${platform}: failed rollback retains original bytes and native recovery snapshot`, async t => {
    const f = fixture(t, platform);
    f.state.failNew = f.state.failOld = true;
    await assert.rejects(f.replace(), error => {
      assert.deepEqual(fs.readFileSync(error.recoveryPath), f.original);
      assert.equal(error.previousLoaded, true);
      if (platform === 'win32') assert.ok(fs.readFileSync(path.join(error.recoveryDirectory, 'registration.xml'), 'utf8'));
      return true;
    });
  });

  test(`${platform}: publication failure restores prior registration without changing bytes`, async t => {
    const f = fixture(t, platform);
    const rename = fs.renameSync;
    fs.renameSync = (from, to) => {
      if (to === f.adapter.file) throw new Error('synthetic publication failure');
      return rename(from, to);
    };
    try { await assert.rejects(f.replace(), /publication failure/); }
    finally { fs.renameSync = rename; }
    assert.deepEqual(fs.readFileSync(f.adapter.file), f.original);
    assert.equal(f.status().loaded, true);
    assert.equal(f.status().running, true);
  });

  test(`${platform}: restoration publication failure retains recovery bytes`, async t => {
    const f = fixture(t, platform);
    f.state.failNew = true;
    const rename = fs.renameSync;
    let publications = 0;
    fs.renameSync = (from, to) => {
      if (to === f.adapter.file && ++publications === 2) throw new Error('synthetic restore publication failure');
      return rename(from, to);
    };
    try {
      await assert.rejects(f.replace(), error => {
        assert.match(error.message, /restore publication failure/);
        assert.deepEqual(fs.readFileSync(error.recoveryPath), f.original);
        return true;
      });
    } finally { fs.renameSync = rename; }
  });

  test(`${platform}: unmanaged native registrations are refused without mutation`, async t => {
    const f = fixture(t, platform);
    if (platform === 'linux') f.state.fragment = '/synthetic/unmanaged.service';
    else f.state.task.actions[0].execute = 'C:\\unmanaged.exe';
    assert.equal(f.status().state, 'unmanaged');
    await assert.rejects(f.replace());
    assert.throws(() => stopManagedService(f.adapter, { cwd: f.config.cwd }));
    assert.equal(f.state.calls.every(call => ['inspect', 'show'].includes(call[0])), true);
    assert.deepEqual(fs.readFileSync(f.adapter.file), f.original);
  });

  test(`${platform}: stop disables restart and uninstall removes owned configuration`, t => {
    const f = fixture(t, platform);
    assert.equal(stopManagedService(f.adapter, { cwd: f.config.cwd }).state, 'stopped');
    assert.equal(f.status().loaded, false);
    assert.ok(fs.existsSync(f.adapter.file));
    const removed = stopManagedService(f.adapter, { cwd: f.config.cwd, uninstall: true });
    assert.equal(removed.removed, true);
    assert.equal(removed.state, 'not-installed');
    assert.equal(fs.existsSync(f.adapter.file), false);
  });
}

test('systemd refuses a unit with an external drop-in override', t => {
  const f = fixture(t, 'linux');
  f.state.dropins = '/synthetic/override.conf';
  assert.equal(f.status().state, 'unmanaged');
  assert.throws(() => stopManagedService(f.adapter, { cwd: f.config.cwd }));
  assert.equal(f.state.loaded, true);
});

test('Windows task arguments survive the native Node command-line parser', { skip: process.platform !== 'win32' }, t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-task-中文-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const cli = path.join(root, 'command with spaces.cjs');
  fs.writeFileSync(cli, 'console.log(JSON.stringify(process.argv.slice(2)));');
  for (const cwd of ['C:\\项目 with spaces\\', 'C:\\literal %PATH% $env:HOME & !\\', 'C:\\say "hello"\\']) {
    const config = { cli, cwd, port: 4567 };
    const result = spawnSync(process.execPath, [taskArguments(config)], {
      windowsVerbatimArguments: true, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), ['serve', '--cwd', cwd, '--port', '4567']);
  }
});

test('Windows refuses to adopt an existing task when its local ownership file is missing', t => {
  const f = fixture(t, 'win32');
  fs.unlinkSync(f.adapter.file);
  assert.equal(f.status().state, 'unmanaged');
  assert.throws(() => stopManagedService(f.adapter, { cwd: f.config.cwd }));
  assert.equal(f.state.task.enabled, true);
});

test('systemd missing user session is unavailable; permissions and parse failures propagate', () => {
  const error = Object.assign(new Error('Failed to connect to bus: No medium found'), { status: 1 });
  const adapter = createSystemdService({ home: '/synthetic', configHome: '/synthetic/config', run() { throw error; } });
  assert.equal(adapter.status().state, 'unavailable');
  error.message = 'Permission denied';
  assert.throws(() => adapter.status(), /Permission denied/);
  const invalid = createSystemdService({ home: '/synthetic', configHome: '/synthetic/config', run: () => 'unparseable' });
  assert.throws(() => invalid.status());
});

test('Windows native permission and invalid JSON errors never become missing registrations', () => {
  const denied = createWindowsService({ home: '/synthetic', dataHome: '/synthetic/data', run() { throw new Error('Access denied'); } });
  assert.throws(() => denied.status(), /Access denied/);
  const invalid = createWindowsService({ home: '/synthetic', dataHome: '/synthetic/data', run: () => '{invalid json' });
  assert.throws(() => invalid.status(), SyntaxError);
});
