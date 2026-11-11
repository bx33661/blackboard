import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chooseSkillTargets, installSkills, renderSkillInstall } from '../lib/cli/skill-install.js';
import { parseArgs } from '../lib/cli/args.js';
import { displayWidth } from '../lib/cli/format.js';
import { SKILL_HOSTS, SKILL_TARGETS, skillDestination } from '../lib/skill-targets.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = path.join(ROOT, 'bin/pinwhy.js');
const SOURCE = path.join(ROOT, 'skills/pinwhy');

function terminals({ inputTTY = true, outputTTY = true, raw = false, flowing = false } = {}) {
  const input = new EventEmitter();
  Object.assign(input, { isTTY: inputTTY, isRaw: raw, readableFlowing: flowing, rawModes: [] });
  input.setRawMode = (value) => { input.rawModes.push(value); input.isRaw = value; };
  input.resume = () => { input.readableFlowing = true; };
  input.pause = () => { input.readableFlowing = false; };
  const output = new EventEmitter();
  Object.assign(output, { isTTY: outputTTY, columns: 100, text: '' });
  output.write = (value) => { output.text += value; return true; };
  const send = (value) => input.emit('data', Buffer.from(value));
  return { input, output, send };
}

function project(t) {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy skill chooser '));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  return cwd;
}

function checkPackage(destination) {
  function visit(source, target) {
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const sourceFile = path.join(source, entry.name);
      const targetFile = path.join(target, entry.name);
      if (entry.isDirectory()) visit(sourceFile, targetFile);
      else {
        const original = fs.readFileSync(sourceFile);
        const expected = entry.name.endsWith('.md')
          ? Buffer.from(original.toString().replaceAll('__PINWHY_CLI__', CLI)) : original;
        assert.deepEqual(fs.readFileSync(targetFile), expected, targetFile);
      }
    }
  }
  visit(SOURCE, destination);
}

function listenerCounts(input, output) {
  return [
    ...['data', 'end', 'close', 'error'].map((event) => input.listenerCount(event)),
    ...['resize', 'error'].map((event) => output.listenerCount(event)),
    ...['SIGINT', 'SIGTERM', 'exit'].map((event) => process.listenerCount(event)),
  ];
}

test('Enter accepts all checked targets and installs the complete substituted package', async (t) => {
  const cwd = project(t);
  const terminal = terminals();
  const before = listenerCounts(terminal.input, terminal.output);
  const installing = installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
  assert.match(terminal.output.text, /Installation scope/);
  assert.deepEqual(fs.readdirSync(cwd), []);
  terminal.send('\r'); // Accept project scope before choosing targets.
  terminal.output.text = terminal.output.text.slice(terminal.output.text.lastIndexOf('Pinwhy'));
  assert.match(terminal.output.text, /\[x\] Claude Code/);
  assert.match(terminal.output.text, /\[x\] Agent Skills/);
  assert.equal((terminal.output.text.match(/\[x\]/g) || []).length, 2);
  for (const host of SKILL_HOSTS) assert.ok(terminal.output.text.includes(host.label), host.label);
  assert.match(terminal.output.text, /All 2 targets are selected by default/);
  assert.ok(terminal.output.text.includes(path.join(cwd, '.claude', 'skills', 'pinwhy')));
  assert.ok(terminal.output.text.includes(path.join(cwd, '.agents', 'skills', 'pinwhy')));
  assert.match(terminal.output.text, /Scope\s+project/);
  assert.deepEqual(fs.readdirSync(cwd), []);
  terminal.send('\r');
  const result = await installing;
  assert.equal(result.scope, 'project');
  assert.deepEqual(result.targets.map(({ agent }) => agent), ['claude', 'codex']);
  checkPackage(path.join(cwd, '.claude', 'skills', 'pinwhy'));
  checkPackage(path.join(cwd, '.agents', 'skills', 'pinwhy'));
  assert.equal(fs.existsSync(path.join(cwd, '.pinwhy')), false);
  assert.equal(fs.existsSync(path.join(cwd, '.claude', 'settings.json')), false);
  assert.deepEqual(terminal.input.rawModes, [true, false]);
  assert.equal(terminal.input.readableFlowing, false);
  assert.ok(terminal.output.text.endsWith('\x1b[?25h'));
  assert.deepEqual(listenerCounts(terminal.input, terminal.output), before);
});

test('Space, split arrow sequences and up/down wrapping select only the desired target', async () => {
  const terminal = terminals();
  const choosing = chooseSkillTargets({ cwd: '/synthetic/project', scope: 'project', ...terminal });
  terminal.send(' '); // Uncheck Claude.
  terminal.send('\x1b'); terminal.send('['); terminal.send('B');
  terminal.send(' '); // Uncheck Codex.
  terminal.send('\x1b[B'); // Wrap to Claude.
  terminal.send('\x1b[A'); // Wrap back to Codex.
  terminal.send(' \r');
  assert.deepEqual(await choosing, { scope: 'project', agents: ['codex'] });
});

test('an empty choice stays open, explains the requirement, and a toggles all back on', async (t) => {
  const cwd = project(t);
  const terminal = terminals();
  const installing = installSkills({ cwd, cli: CLI, flags: { project: true }, ...terminal });
  terminal.send('a\r');
  assert.match(terminal.output.text, /Select at least one target/);
  assert.equal(terminal.input.isRaw, true);
  assert.deepEqual(fs.readdirSync(cwd), []);
  terminal.send('a\r');
  const result = await installing;
  assert.deepEqual(result.targets.map(({ agent }) => agent), ['claude', 'codex']);
});

for (const key of ['\u0003', '\x1b']) {
  test(`${key === '\u0003' ? 'Ctrl+C' : 'Escape'} cancels without writing and restores terminal state`, async (t) => {
    const cwd = project(t);
    const terminal = terminals({ raw: true, flowing: true });
    const externalListener = () => {};
    terminal.input.on('data', externalListener);
    const before = listenerCounts(terminal.input, terminal.output);
    const installing = installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
    terminal.send(key);
    const result = await installing;
    assert.equal(result, null);
    assert.deepEqual(fs.readdirSync(cwd), []);
    assert.deepEqual(terminal.input.rawModes, [true, true]);
    assert.equal(terminal.input.readableFlowing, true);
    assert.ok(terminal.output.text.endsWith('\x1b[?25h'));
    assert.deepEqual(listenerCounts(terminal.input, terminal.output), before);
    assert.match(renderSkillInstall(result), /Cancelled\. No files were written/);
  });
}

test('input errors restore raw mode, cursor and listeners before rejecting', async () => {
  const terminal = terminals();
  const before = listenerCounts(terminal.input, terminal.output);
  const choosing = chooseSkillTargets({ cwd: '/synthetic/project', scope: 'project', ...terminal });
  terminal.input.emit('error', new Error('synthetic input failure'));
  await assert.rejects(choosing, /synthetic input failure/);
  assert.deepEqual(terminal.input.rawModes, [true, false]);
  assert.ok(terminal.output.text.endsWith('\x1b[?25h'));
  assert.deepEqual(listenerCounts(terminal.input, terminal.output), before);
});

for (const event of ['end', 'close']) {
  test(`input ${event} cancels without writing`, async (t) => {
    const cwd = project(t);
    const terminal = terminals();
    const installing = installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
    terminal.input.emit(event);
    assert.equal(await installing, null);
    assert.deepEqual(fs.readdirSync(cwd), []);
    assert.deepEqual(terminal.input.rawModes, [true, false]);
  });
}

test('the chooser sanitizes scope paths before terminal rendering', async () => {
  const terminal = terminals();
  const choosing = chooseSkillTargets({ cwd: '/synthetic/\x1b[31mproject\nname', scope: 'project', ...terminal });
  assert.ok(terminal.output.text.includes('/synthetic/project name/.claude/skills/pinwhy'));
  assert.ok(!terminal.output.text.includes('\x1b[31m'));
  terminal.send('\u0003');
  assert.equal(await choosing, null);
});

for (const flags of [{ json: true }, { claude: true }, { codex: true }, { all: true }, { yes: true }, { yes: true, codex: true }]) {
  test(`explicit or JSON selection bypasses a TTY chooser: ${JSON.stringify(flags)}`, async (t) => {
    const cwd = project(t);
    const terminal = terminals();
    const result = await installSkills({ cwd, cli: CLI, flags, ...terminal });
    assert.deepEqual(terminal.input.rawModes, []);
    assert.equal(terminal.output.text, '');
    const expected = flags.codex ? ['codex'] : flags.all || flags.yes ? ['claude', 'codex'] : ['claude'];
    assert.deepEqual((result.targets || [result]).map(({ agent }) => agent), expected);
  });
}

for (const host of SKILL_HOSTS) {
  for (const extra of [[], ['--yes'], ['--json']]) {
    test(`--host ${host.agent} ${extra.join(' ')} installs one package without prompting`, async (t) => {
      const cwd = project(t);
      const terminal = terminals();
      const { flags } = parseArgs(['install', '--host', host.agent, ...extra], 'skill');
      const result = await installSkills({ cwd, cli: CLI, flags, ...terminal });
      assert.deepEqual(Object.keys(result).sort(), ['agent', 'message', 'scope']);
      assert.equal(result.agent, host.agent);
      assert.equal(result.scope, 'project');
      assert.ok(result.message.includes(skillDestination({ cwd, agent: host.agent })));
      assert.ok(renderSkillInstall(result).includes(`✓ ${host.label}`));
      assert.deepEqual(terminal.input.rawModes, []);
      assert.equal(terminal.output.text, '');
      assert.deepEqual(fs.readdirSync(cwd), [host.root]);
      checkPackage(skillDestination({ cwd, agent: host.agent }));
      assert.equal(fs.existsSync(path.join(cwd, '.claude', 'settings.json')), false);
    });
  }
}

for (const conflicting of ['claude', 'codex', 'all']) {
  test(`--host conflicts with --${conflicting} before any writes`, async (t) => {
    const cwd = project(t);
    const terminal = terminals();
    await assert.rejects(async () => {
      const { flags } = parseArgs(['install', '--host', 'cursor', `--${conflicting}`], 'skill');
      await installSkills({ cwd, cli: CLI, flags, ...terminal });
    }, { code: 'conflicting_options' });
    assert.deepEqual(fs.readdirSync(cwd), []);
    assert.deepEqual(terminal.input.rawModes, []);
    assert.equal(terminal.output.text, '');
  });
}

for (const [args, code] of [
  [['--host', 'unknown'], 'invalid_value'],
  [['--host', 'CLAUDE'], 'invalid_value'],
  [['--host'], 'missing_value'],
  [['--host', 'cursor', '--host', 'gemini'], 'invalid_usage'],
]) {
  test(`invalid host arguments fail before writing: ${args.join(' ')}`, async (t) => {
    const cwd = project(t);
    await assert.rejects(async () => {
      const { flags } = parseArgs(['install', ...args], 'skill');
      await installSkills({ cwd, cli: CLI, flags });
    }, { code });
    assert.deepEqual(fs.readdirSync(cwd), []);
  });
}

test('a direct unknown host selection fails before writing', async (t) => {
  const cwd = project(t);
  const terminal = terminals();
  await assert.rejects(installSkills({ cwd, cli: CLI, flags: { host: 'unknown' }, ...terminal }), /unsupported Agent skill target/);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.deepEqual(terminal.input.rawModes, []);
});

for (const flags of [{ all: true }, { yes: true }, {}]) {
  test(`all-target selection writes each physical package only once: ${JSON.stringify(flags)}`, async (t) => {
    const cwd = project(t);
    const terminal = terminals();
    const written = [];
    for (const [method, destinationIndex] of [['writeFileSync', 0], ['copyFileSync', 1]]) {
      const original = fs[method];
      t.mock.method(fs, method, (...args) => {
        written.push(args[destinationIndex]);
        return original(...args);
      });
    }
    const installing = installSkills({ cwd, cli: CLI, flags, ...terminal });
    if (!flags.all && !flags.yes) terminal.send('\r\r');
    const result = await installing;
    assert.deepEqual(result.targets.map(({ agent }) => agent), ['claude', 'codex']);
    assert.deepEqual(fs.readdirSync(cwd).sort(), ['.agents', '.claude']);
    assert.equal(written.length, new Set(written).size);
    assert.equal(written.filter((file) => path.basename(file) === 'SKILL.md').length, 2);
    for (const target of SKILL_TARGETS) checkPackage(skillDestination({ cwd, agent: target.agent }));
  });
}

test('shared host labels wrap separately from the two checkbox labels in narrow terminals', async () => {
  const terminal = terminals();
  terminal.output.columns = 40;
  const before = listenerCounts(terminal.input, terminal.output);
  const choosing = chooseSkillTargets({ cwd: '/synthetic/project', scope: 'project', ...terminal });
  const lines = terminal.output.text.split('\n');
  const checkboxes = lines.filter((line) => line.includes('[x]'));
  assert.equal(checkboxes.length, 2);
  assert.match(checkboxes[1], /\[x\] Agent Skills$/);
  for (const host of SKILL_HOSTS.filter(({ agent }) => agent !== 'claude')) {
    const line = lines.find((value) => value.includes(host.label));
    assert.ok(line, host.label);
    assert.ok(displayWidth(line) <= terminal.output.columns, line);
    assert.equal(line.includes('[x]'), false);
  }
  terminal.output.columns = 32;
  terminal.output.emit('resize');
  terminal.send('\u0003');
  assert.equal(await choosing, null);
  assert.deepEqual(terminal.input.rawModes, [true, false]);
  assert.ok(terminal.output.text.endsWith('\x1b[?25h'));
  assert.deepEqual(listenerCounts(terminal.input, terminal.output), before);
});


for (const redirected of [{ inputTTY: false }, { outputTTY: false }]) {
  test(`a redirected stream keeps the Claude-only default without escapes: ${JSON.stringify(redirected)}`, async (t) => {
    const cwd = project(t);
    const terminal = terminals(redirected);
    const result = await installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
    assert.equal(result.agent, 'claude');
    assert.equal(result.targets, undefined);
    assert.deepEqual(terminal.input.rawModes, []);
    assert.equal(terminal.output.text, '');
    assert.ok(!renderSkillInstall(result).includes('\x1b'));
    assert.equal(fs.existsSync(path.join(cwd, '.agents')), false);
  });
}

test('global scope installs into the user home only after both confirmations', async (t) => {
  const cwd = project(t);
  const home = project(t);
  t.mock.method(os, 'homedir', () => home);
  const terminal = terminals();
  const installing = installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
  terminal.send('\x1b[B\r');
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.ok(terminal.output.text.includes(path.join(home, '.agents', 'skills', 'pinwhy')));
  terminal.send('\r');
  const result = await installing;
  assert.equal(result.scope, 'user');
  assert.deepEqual(fs.readdirSync(cwd), []);
  for (const root of ['.claude', '.agents']) checkPackage(path.join(home, root, 'skills', 'pinwhy'));
});

test('cancelling after global scope selection leaves both scopes untouched', async (t) => {
  const cwd = project(t);
  const home = project(t);
  t.mock.method(os, 'homedir', () => home);
  const terminal = terminals();
  const installing = installSkills({ cwd, cli: CLI, flags: {}, ...terminal });
  terminal.send('\x1b[B\r\u0003');
  assert.equal(await installing, null);
  assert.deepEqual(fs.readdirSync(cwd), []);
  assert.deepEqual(fs.readdirSync(home), []);
  assert.deepEqual(terminal.input.rawModes, [true, false]);
});

test('user scope displays both actual home destinations before confirmation', async () => {
  const terminal = terminals();
  const choosing = chooseSkillTargets({ cwd: '/synthetic/project', scope: 'user', ...terminal });
  assert.match(terminal.output.text, /Scope\s+user/);
  assert.ok(terminal.output.text.includes(path.join(os.homedir(), '.claude', 'skills', 'pinwhy')));
  assert.ok(terminal.output.text.includes(path.join(os.homedir(), '.agents', 'skills', 'pinwhy')));
  terminal.send('\u0003');
  assert.equal(await choosing, null);
});

test('a rendering failure restores terminal state and listeners', async () => {
  const terminal = terminals();
  const before = listenerCounts(terminal.input, terminal.output);
  const write = terminal.output.write;
  let calls = 0;
  terminal.output.write = (value) => {
    if (++calls === 2) throw new Error('synthetic output failure');
    return write(value);
  };
  await assert.rejects(chooseSkillTargets({ cwd: '/synthetic/project', scope: 'project', ...terminal }), /synthetic output failure/);
  assert.deepEqual(terminal.input.rawModes, [true, false]);
  assert.ok(terminal.output.text.endsWith('\x1b[?25h'));
  assert.deepEqual(listenerCounts(terminal.input, terminal.output), before);
});
