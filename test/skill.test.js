import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { installSkill } from '../lib/hooks.js';
import { SKILL_HOSTS, skillDestination } from '../lib/skill-targets.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const CLI = path.join(ROOT, 'bin/pinwhy.js');
const SOURCE = path.join(ROOT, 'skills/pinwhy');
const THREAT_MODEL = 'methods/threat-model.md';

function files(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name);
    return entry.isDirectory() ? files(path.join(dir, entry.name), relative) : [relative];
  }).sort();
}

function checkReferences(dir) {
  for (const relative of files(dir).filter((file) => file.endsWith('.md'))) {
    const file = path.join(dir, relative);
    const text = fs.readFileSync(file, 'utf8');
    for (const [, target] of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
      const destination = path.resolve(path.dirname(file), target.split('#')[0]);
      const local = path.relative(dir, destination);
      assert.ok(local && !local.startsWith('..') && !path.isAbsolute(local), `${relative}: ${target} escapes the Skill package`);
      assert.ok(fs.statSync(destination).isFile(), `${relative}: ${target}`);
    }
  }
}

test('the optional threat-model reference is reachable inside the self-contained Skill package', () => {
  const entry = fs.readFileSync(path.join(SOURCE, 'SKILL.md'), 'utf8');
  const targets = [...entry.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
  assert.ok(targets.includes(THREAT_MODEL));
  assert.ok(fs.statSync(path.join(SOURCE, THREAT_MODEL)).isFile());
  checkReferences(SOURCE);
});

for (const { agent, root } of SKILL_HOSTS) {
  for (const scope of ['project', 'user']) {
    test(`${agent}/${scope} installs the complete optional reference without initializing a board or hooks`, (t) => {
      const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy skill package '));
      t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
      const project = path.join(temp, 'project');
      const home = path.join(temp, 'home');
      fs.mkdirSync(project); fs.mkdirSync(home);
      const base = scope === 'user' ? home : project;
      const destination = path.join(base, root, 'skills', 'pinwhy');
      fs.mkdirSync(destination, { recursive: true });
      fs.writeFileSync(path.join(destination, 'personal-note.md'), 'keep my note\n');
      const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, TMPDIR: os.tmpdir(), PINWHY_CWD: project };
      const result = spawnSync(process.execPath, [CLI, 'skill', 'install', `--${scope}`, '--host', agent], {
        cwd: project, env, encoding: 'utf8', timeout: 10000,
      });
      assert.equal(result.status, 0, result.stderr);
      for (const relative of files(SOURCE)) {
        const original = fs.readFileSync(path.join(SOURCE, relative));
        const expected = relative.endsWith('.md')
          ? Buffer.from(original.toString().replaceAll('__PINWHY_CLI__', CLI)) : original;
        assert.deepEqual(fs.readFileSync(path.join(destination, relative)), expected, relative);
      }
      assert.ok(result.stdout.includes(path.join(destination, 'SKILL.md')));
      assert.equal(fs.existsSync(path.join(base, root === '.agents' ? '.claude' : '.agents')), false);
      assert.deepEqual(fs.readdirSync(scope === 'user' ? project : home), []);
      assert.equal(fs.readFileSync(path.join(destination, 'personal-note.md'), 'utf8'), 'keep my note\n');
      checkReferences(destination);
      for (const dir of [home, project]) {
        for (const relative of ['.pinwhy', '.claude/settings.json', '.claude/settings.local.json', '.local']) {
          assert.equal(fs.existsSync(path.join(dir, relative)), false, relative);
        }
      }
    });
  }
}

function cliFixture(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy skill cli '));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const project = path.join(temp, 'project');
  const home = path.join(temp, 'home');
  fs.mkdirSync(project); fs.mkdirSync(home);
  const env = { PATH: process.env.PATH, HOME: home, USERPROFILE: home, TMPDIR: os.tmpdir(), PINWHY_CWD: project };
  const run = (...args) => spawnSync(process.execPath, [CLI, 'skill', 'install', ...args], {
    cwd: project, env, encoding: 'utf8', timeout: 10000,
  });
  return { project, home, run };
}

for (const target of [[], ['--claude'], ['--codex'], ['--claude', '--yes'], ['--codex', '--yes'], ...SKILL_HOSTS.flatMap(({ agent }) => [['--host', agent], ['--host', agent, '--yes']])]) {
  test(`single-target JSON retains its legacy shape: ${target.join(' ') || 'no target'}`, (t) => {
    const { project, run } = cliFixture(t);
    const result = run(...target, '--json');
    assert.equal(result.status, 0, result.stderr);
    assert.ok(!result.stdout.includes('\x1b'));
    const output = JSON.parse(result.stdout);
    const agent = target.includes('--host') ? target[target.indexOf('--host') + 1] : target.includes('--codex') ? 'codex' : 'claude';
    assert.deepEqual(Object.keys(output).sort(), ['agent', 'message', 'scope']);
    assert.equal(output.agent, agent);
    assert.equal(output.scope, 'project');
    assert.ok(output.message.includes(path.join(project, agent === 'claude' ? '.claude' : '.agents', 'skills', 'pinwhy', 'SKILL.md')));
    assert.equal(fs.existsSync(path.join(project, agent === 'claude' ? '.agents' : '.claude')), false);
  });
}

for (const automation of ['--all', '--yes']) {
  for (const scope of ['project', 'user']) {
    test(`${automation}/${scope} returns both JSON targets and installs the full package`, (t) => {
      const { project, home, run } = cliFixture(t);
      const result = run(automation, `--${scope}`, '--json');
      assert.equal(result.status, 0, result.stderr);
      const output = JSON.parse(result.stdout);
      assert.deepEqual(Object.keys(output).sort(), ['scope', 'targets']);
      assert.equal(output.scope, scope);
      assert.deepEqual(output.targets.map(({ agent }) => agent), ['claude', 'codex']);
      const base = scope === 'user' ? home : project;
      for (const [index, root] of ['.claude', '.agents'].entries()) {
        const destination = path.join(base, root, 'skills', 'pinwhy');
        assert.equal(output.targets[index].scope, scope);
        assert.ok(output.targets[index].message.includes(path.join(destination, 'SKILL.md')));
        for (const relative of files(SOURCE)) {
          const original = fs.readFileSync(path.join(SOURCE, relative));
          const expected = relative.endsWith('.md')
            ? Buffer.from(original.toString().replaceAll('__PINWHY_CLI__', CLI)) : original;
          assert.deepEqual(fs.readFileSync(path.join(destination, relative)), expected, relative);
        }
      }
      for (const directory of [project, home]) {
        for (const relative of ['.pinwhy', '.claude/settings.json', '.claude/settings.local.json', '.local']) {
          assert.equal(fs.existsSync(path.join(directory, relative)), false, relative);
        }
      }
    });
  }
}

for (const conflict of [['--claude', '--codex'], ['--claude', '--all'], ['--codex', '--all'], ['--user', '--project']]) {
  test(`conflicting Skill flags fail before any writes: ${conflict.join(' ')}`, (t) => {
    const { project, home, run } = cliFixture(t);
    const result = run(...conflict, '--json');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /conflict/);
    assert.deepEqual(fs.readdirSync(project), []);
    assert.deepEqual(fs.readdirSync(home), []);
  });
}


test('invalid domain Skill targets and scopes fail before creating directories', (t) => {
  const { project, home } = cliFixture(t);
  for (const scope of ['project', 'user']) {
    const options = { cwd: project, cli: CLI, scope, agent: 'unknown' };
    assert.throws(() => skillDestination(options), /unsupported Agent skill target: unknown/);
    assert.throws(() => installSkill(options), /unsupported Agent skill target: unknown/);
  }
  for (const { agent } of SKILL_HOSTS) {
    const options = { cwd: project, cli: CLI, scope: 'unknown', agent };
    assert.throws(() => skillDestination(options), /unsupported Skill scope: unknown/);
    assert.throws(() => installSkill(options), /unsupported Skill scope: unknown/);
  }
  assert.deepEqual(fs.readdirSync(project), []);
  assert.deepEqual(fs.readdirSync(home), []);
});
