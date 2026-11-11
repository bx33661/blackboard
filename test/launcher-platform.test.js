import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  installLauncher, installHooks, uninstallHooks, installSkill,
  integrationStatus, inspectIntegrationPaths, resolveNodeBinary,
} from '../lib/hooks.js';
import { publishCurrentLink } from '../lib/release/publication.js';

const WINDOWS = process.platform === 'win32';

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-platform-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project 中文 %PINWHY_TEST% & ! ^ (x) ' $ `");
  const home = path.join(root, 'home');
  fs.mkdirSync(project);
  fs.mkdirSync(home);
  const cli = path.join(project, 'bin', 'pinwhy.js');
  fs.mkdirSync(path.dirname(cli));
  fs.writeFileSync(cli, `const fs = require('node:fs');
console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.env.PINWHY_CWD, stdin: process.env.PINWHY_TEST_STDIN ? fs.readFileSync(0, 'utf8') : null }));
process.exit(Number(process.env.PINWHY_TEST_EXIT || 0));
`);
  return { root, project, home, cli };
}

function withHome(home, fn) {
  const homedir = os.homedir;
  os.homedir = () => home;
  try { return fn(); } finally { os.homedir = homedir; }
}

function withPlatform(platform, fn) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...descriptor, value: platform });
  try { return fn(); } finally { Object.defineProperty(process, 'platform', descriptor); }
}

function withFsMethods(methods, fn) {
  const originals = Object.fromEntries(Object.keys(methods).map((name) => [name, fs[name]]));
  try {
    for (const [name, method] of Object.entries(methods)) fs[name] = (...args) => method(originals[name], ...args);
    return fn();
  } finally { Object.assign(fs, originals); }
}

function cmdArgument(value) {
  return `"${value.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')}"`;
}

function runLauncher(file, args, env = {}) {
  const options = { encoding: 'utf8', env: { ...process.env, PINWHY_TEST: 'must-not-expand', ...env } };
  if (!WINDOWS) return spawnSync(file, args, options);
  // Expand the launcher path from the environment exactly once, so percent
  // characters in the synthetic path are not interpreted by the calling shell.
  options.env.PINWHY_TEST_LAUNCHER = file;
  options.windowsVerbatimArguments = true;
  return spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/s', '/c',
    `""%PINWHY_TEST_LAUNCHER%" ${args.map(cmdArgument).join(' ')}"`], options);
}

test('the native launcher preserves arguments, special paths, and exit status on this platform', (t) => {
  const { home, cli } = fixture(t);
  const launcher = withHome(home, () => installLauncher({ cli }));
  assert.equal(path.basename(launcher.file), WINDOWS ? 'pinwhy.cmd' : 'pinwhy');
  const args = ['', 'plain', 'two words', '中文', 'a&b|c<d>e^f(g)h!i', '100% literal', 'C:\\trailing\\', 'say "hello"', '$HOME', '`echo nope`'];
  if (!WINDOWS) args.push('line one\nline two', '%PINWHY_TEST%');
  const result = runLauncher(launcher.file, args);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).args, args);
  const failure = runLauncher(launcher.file, [], { PINWHY_TEST_EXIT: '23' });
  assert.equal(failure.status, 23, failure.stderr);
});

test('Windows launchers escape interpreter paths and preserve existing extensionless files', (t) => {
  const { home, cli } = fixture(t);
  const dir = path.join(home, '.local', 'bin');
  fs.mkdirSync(dir, { recursive: true });
  const old = path.join(dir, 'pinwhy');
  fs.writeFileSync(old, `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
  withPlatform('win32', () => withHome(home, () => {
    const launcher = installLauncher({ cli });
    assert.equal(path.basename(launcher.file), 'pinwhy.cmd');
    const content = fs.readFileSync(launcher.file, 'utf8');
    assert.match(content, /setlocal DisableDelayedExpansion/);
    assert.ok(content.includes(cli.replaceAll('%', '%%')));
    assert.ok(content.includes(' %*\r\n'));
    assert.equal(fs.readFileSync(old, 'utf8'), `#!/bin/sh\nexec "${process.execPath}" "${cli}" "$@"\n`);
    const originalNode = process.execPath;
    const specialNode = 'C:\\Node 中文 %PINWHY_TEST% & ! ^ (x)\\node.exe';
    try {
      process.execPath = specialNode;
      installLauncher({ cli });
      assert.ok(fs.readFileSync(launcher.file, 'utf8').includes(`"${specialNode.replaceAll('%', '%%')}"`));
    } finally { process.execPath = originalNode; }
    fs.writeFileSync(old, '#!/bin/sh\necho unrelated\n');
    installLauncher({ cli });
    assert.equal(fs.readFileSync(old, 'utf8'), '#!/bin/sh\necho unrelated\n');
  }));
});

function hookSettings(project) {
  return JSON.parse(fs.readFileSync(path.join(project, '.claude', 'settings.json'), 'utf8'));
}

function bashBinary() {
  if (!WINDOWS) return 'bash';
  const candidates = [process.env.CLAUDE_CODE_GIT_BASH_PATH,
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Git', 'bin', 'bash.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Git', 'bin', 'bash.exe')];
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || 'bash';
}

test('Claude bash hooks preserve CLI paths, project environment, and stdin on this platform', (t) => {
  const { root, project, cli } = fixture(t);
  fs.mkdirSync(path.join(project, '.pinwhy'));
  fs.writeFileSync(path.join(project, '.pinwhy', 'events.jsonl'), '');
  installHooks({ cwd: project, cli, write: true });
  const handler = hookSettings(project).hooks.SessionStart[0].hooks[0];
  assert.equal(handler.shell, 'bash');
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project, PINWHY_TEST_STDIN: '1', PINWHY_TEST: 'must-not-expand' };
  const result = spawnSync(bashBinary(), ['-c', handler.command], { cwd: root, env, encoding: 'utf8', input: '{"synthetic":true}' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { args: ['hook', 'SessionStart'], cwd: WINDOWS ? project.replaceAll('\\', '/') : project, stdin: '{"synthetic":true}' });
  delete env.CLAUDE_PROJECT_DIR;
  const fallback = spawnSync(bashBinary(), ['-c', handler.command], { cwd: project, env, encoding: 'utf8', input: '{}' });
  assert.equal(fallback.status, 0, fallback.stderr);
  assert.deepEqual(JSON.parse(fallback.stdout).args, ['hook', 'SessionStart']);
  const absent = spawnSync(bashBinary(), ['-c', handler.command], { cwd: root, env, encoding: 'utf8', input: '{}' });
  assert.equal(absent.status, 0, absent.stderr);
  assert.equal(absent.stdout, '');
});

test('Windows hook paths use forward slashes and survive reinstall and uninstall detection', (t) => {
  const { home, project } = fixture(t);
  const cli = "C:\\Users\\synthetic 中文 & ! % (x) ' $ `\\pinwhy\\current\\bin\\pinwhy.js";
  withPlatform('win32', () => withHome(home, () => {
    installHooks({ cwd: project, cli, write: true, withActivity: true });
    const file = path.join(project, '.claude', 'settings.json');
    const settings = hookSettings(project);
    const command = settings.hooks.SessionStart[0].hooks[0].command;
    assert.ok(command.includes('C:/Users/'));
    assert.ok(!command.includes('C:\\Users\\'));
    const foreign = { type: 'command', command: 'echo unrelated' };
    settings.hooks.SessionStart[0].hooks.push(foreign);
    fs.writeFileSync(file, JSON.stringify(settings));
    installHooks({ cwd: project, cli, write: true });
    assert.deepEqual(integrationStatus(project).claude.hooks.project, ['SessionStart', 'PreCompact']);
    assert.deepEqual(hookSettings(project).hooks.SessionStart[0].hooks.filter((handler) => handler.command === 'echo unrelated'), [foreign]);
    assert.equal(hookSettings(project).hooks.SessionStart[0].hooks.length, 2);
    uninstallHooks({ cwd: project, write: true });
    assert.deepEqual(integrationStatus(project).claude.hooks.project, []);
    assert.deepEqual(hookSettings(project).hooks.SessionStart[0].hooks, [foreign]);
  }));
});

test('integration path inspection identifies installed current, stale, unexpanded and invalid entries without content leaks', (t) => {
  const { home, project, cli } = fixture(t);
  withHome(home, () => {
    assert.deepEqual(inspectIntegrationPaths({ cwd: project, cli }), []);
    installSkill({ cwd: project, cli, agent: 'claude' });
    installSkill({ cwd: project, cli, agent: 'codex' });
    installHooks({ cwd: project, cli, write: true });
    installLauncher({ cli });
    const entries = inspectIntegrationPaths({ cwd: project, cli });
    assert.equal(entries.length, 5);
    assert.ok(entries.every((entry) => entry.state === 'current'));
    const skill = path.join(project, '.claude', 'skills', 'pinwhy', 'SKILL.md');
    fs.writeFileSync(skill, 'node "__PINWHY_CLI__"');
    const codex = path.join(project, '.agents', 'skills', 'pinwhy', 'SKILL.md');
    fs.writeFileSync(codex, 'node "/synthetic/old/bin/pinwhy.js"');
    const settingsFile = path.join(project, '.claude', 'settings.json');
    const settings = hookSettings(project);
    settings.hooks.SessionStart[0].hooks[0].command += ' # stale interpreter';
    fs.writeFileSync(settingsFile, JSON.stringify(settings));
    const launcher = entries.find((entry) => entry.kind === 'launcher');
    fs.appendFileSync(launcher.file, WINDOWS ? 'rem stale target\r\n' : '# stale target\n');
    const changed = inspectIntegrationPaths({ cwd: project, cli });
    assert.equal(changed.find((entry) => entry.file === skill).state, 'unexpanded');
    assert.equal(changed.find((entry) => entry.file === codex).state, 'stale');
    assert.equal(changed.find((entry) => entry.event === 'SessionStart').state, 'stale');
    assert.equal(changed.find((entry) => entry.event === 'PreCompact').state, 'current');
    assert.equal(changed.find((entry) => entry.file === launcher.file).state, 'stale');
    fs.writeFileSync(settingsFile, '{SYNTHETIC_PRIVATE_CONTENT');
    const invalid = inspectIntegrationPaths({ cwd: project, cli }).find((entry) => entry.kind === 'hook');
    assert.equal(invalid.state, 'invalid');
    assert.equal(invalid.error, 'INVALID_CONTENT');
    assert.ok(!JSON.stringify(invalid).includes('SYNTHETIC_PRIVATE_CONTENT'));
    withFsMethods({ readFileSync: (read, file, ...args) => {
      if (file === codex) throw Object.assign(new Error('SYNTHETIC_PRIVATE_CONTENT'), { code: 'EACCES' });
      return read(file, ...args);
    } }, () => {
      const unreadable = inspectIntegrationPaths({ cwd: project, cli }).find((entry) => entry.file === codex);
      assert.equal(unreadable.state, 'invalid');
      assert.equal(unreadable.error, 'EACCES');
      assert.ok(!JSON.stringify(unreadable).includes('SYNTHETIC_PRIVATE_CONTENT'));
    });
  });
});


test('Windows fnm uses the default node.exe directly under its alias directory', (t) => {
  const { root } = fixture(t);
  const fnm = path.join(root, 'fnm');
  const pinned = path.join(fnm, 'node-versions', 'v22.0.0', 'installation', 'node.exe');
  const alias = path.join(fnm, 'aliases', 'default', 'node.exe');
  assert.equal(resolveNodeBinary(pinned, {}), pinned);
  fs.mkdirSync(path.dirname(alias), { recursive: true });
  fs.writeFileSync(alias, '');
  assert.equal(resolveNodeBinary(pinned, {}), alias);
  assert.equal(resolveNodeBinary(path.join(root, 'fnm_multishells', '123', 'node.exe'), { FNM_DIR: fnm }), alias);
  assert.equal(resolveNodeBinary(path.join(root, 'other', 'node.exe'), { FNM_DIR: fnm }), path.join(root, 'other', 'node.exe'));
});

test('Windows current publication requests an unprivileged junction and preserves traversable versions', (t) => {
  const { root } = fixture(t);
  const first = path.join(root, 'versions', '1.0.0');
  const next = path.join(root, 'versions', '2.0.0');
  fs.mkdirSync(first, { recursive: true });
  fs.mkdirSync(next, { recursive: true });
  fs.writeFileSync(path.join(first, 'marker'), 'first');
  fs.writeFileSync(path.join(next, 'marker'), 'next');
  const link = path.join(root, 'current');
  withPlatform('win32', () => withFsMethods({ symlinkSync: (symlink, target, file, type) => {
    assert.equal(type, 'junction');
    assert.ok(path.isAbsolute(target));
    return symlink(target, file, WINDOWS ? type : 'dir');
  } }, () => {
    assert.deepEqual(publishCurrentLink(link, first), []);
    assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
    assert.equal(fs.readFileSync(path.join(link, 'marker'), 'utf8'), 'first');
    assert.deepEqual(publishCurrentLink(link, next), []);
    assert.equal(fs.readFileSync(path.join(link, 'marker'), 'utf8'), 'next');
    assert.equal(fs.readFileSync(path.join(first, 'marker'), 'utf8'), 'first');
  }));
});

test('Windows current publication restores the old junction after failure and preserves recovery evidence', (t) => {
  const { root } = fixture(t);
  const first = path.join(root, 'first');
  const next = path.join(root, 'next');
  fs.mkdirSync(first);
  fs.mkdirSync(next);
  fs.writeFileSync(path.join(first, 'marker'), 'original');
  const link = path.join(root, 'current');
  const staging = `${link}.staging-${process.pid}`;
  const retired = `${link}.replaced-${process.pid}`;
  withPlatform('win32', () => withFsMethods({ symlinkSync: (symlink, target, file, type) => symlink(target, file, WINDOWS ? type : 'dir') }, () => {
    publishCurrentLink(link, first);
    const failure = Object.assign(new Error('synthetic publish failure'), { code: 'EIO' });
    withFsMethods({ renameSync: (rename, from, to) => {
      if (from === staging) throw failure;
      return rename(from, to);
    } }, () => assert.throws(() => publishCurrentLink(link, next), (error) => error === failure));
    assert.equal(fs.readFileSync(path.join(link, 'marker'), 'utf8'), 'original');
    assert.equal(fs.existsSync(staging), false);
    assert.equal(fs.existsSync(retired), false);
    const rollback = new Error('synthetic rollback failure');
    withFsMethods({ renameSync: (rename, from, to) => {
      if (from === staging) throw failure;
      if (from === retired) throw rollback;
      return rename(from, to);
    } }, () => assert.throws(() => publishCurrentLink(link, next), (error) => error === failure && error.rollbackError === rollback && error.recoveryPath === retired));
    assert.equal(fs.readFileSync(path.join(retired, 'marker'), 'utf8'), 'original');
    assert.throws(() => publishCurrentLink(link, next), (error) => error.recoveryPath === retired);
  }));
});

test('Windows current publication refuses an unmanaged directory and reports cleanup after a successful switch', (t) => {
  const { root } = fixture(t);
  const first = path.join(root, 'first');
  const next = path.join(root, 'next');
  fs.mkdirSync(first);
  fs.mkdirSync(next);
  fs.writeFileSync(path.join(first, 'marker'), 'first');
  fs.writeFileSync(path.join(next, 'marker'), 'next');
  const link = path.join(root, 'current');
  const retired = `${link}.replaced-${process.pid}`;
  fs.mkdirSync(link);
  fs.writeFileSync(path.join(link, 'unrelated'), 'preserve');
  withPlatform('win32', () => withFsMethods({ symlinkSync: (symlink, target, file, type) => symlink(target, file, WINDOWS ? type : 'dir') }, () => {
    assert.throws(() => publishCurrentLink(link, first));
    assert.equal(fs.readFileSync(path.join(link, 'unrelated'), 'utf8'), 'preserve');
    fs.rmSync(link, { recursive: true });
    publishCurrentLink(link, first);
    const warnings = withFsMethods({ rmSync: (remove, file, ...args) => {
      if (file === retired) throw new Error('synthetic cleanup failure');
      return remove(file, ...args);
    } }, () => publishCurrentLink(link, next));
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes(retired));
    assert.equal(fs.readFileSync(path.join(link, 'marker'), 'utf8'), 'next');
    assert.equal(fs.readFileSync(path.join(retired, 'marker'), 'utf8'), 'first');
  }));
});
