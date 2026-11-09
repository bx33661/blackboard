import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commandHelp, commandHelpFor } from '../lib/cli/command-help.js';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'pinwhy.js');

function isolated(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-help-'));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PINWHY_')));
  const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { cwd: dir, env, encoding: 'utf8' });
  try { run(cli, dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('help reaches nested commands without initializing or installing anything', () => {
  isolated((cli, dir) => {
    for (const args of [
      ['help'], ['help', '--all'], ['batch', '--help'], ['edit', '-h'],
      ['node', 'add', '--help'], ['help', 'node', 'add'],
      ['service', 'install', '--help'], ['help', 'service', 'install'],
      ['release', 'use', '--help'], ['help', 'release', 'use'],
    ]) {
      const result = cli(...args);
      assert.equal(result.status, 0, `${args.join(' ')}: ${result.stderr}`);
      assert.deepEqual(fs.readdirSync(dir), [], `${args.join(' ')} created files`);
    }
  });
});

test('overview points to the full directory, which includes aliases and hides internal refresh', () => {
  isolated((cli) => {
    assert.match(cli('help').stdout, /help --all/);
    const directory = cli('help', '--all');
    assert.equal(directory.status, 0);
    for (const command of ['receipt', 'backup', 'restore', 'release use', 'service install']) {
      assert.ok(directory.stdout.includes(command), `missing ${command}`);
    }
    assert.doesNotMatch(directory.stdout, /release refresh/);
  });
});

test('leaf options distinguish values, switches and repeatable fields', () => {
  const install = commandHelp('service install');
  const start = commandHelp('service start');
  assert.match(install, /--port\s+<[^>]+>/);
  assert.doesNotMatch(start.split('Examples')[0], /--port/);
  assert.match(commandHelp('release install'), /--force(?:\s|$)/);
  assert.doesNotMatch(commandHelp('release use').split('Examples')[0], /--force/);
  assert.match(commandHelp('edit'), /--clear\s+<[^>]+>.*repeatable/);
  assert.match(commandHelp('node add'), /--tag\s+<[^>]+>.*repeatable/);
  assert.match(commandHelp('ls'), /--status\s+<[^>]+>/);
  assert.match(commandHelp('ls'), /--confidence\s+<[^>]+>/);
});


test('unknown command paths reject rather than silently showing root help', () => {
  for (const command of ['no-such-command', 'node missing', 'service missing', 'release use extra', 'edit extra']) {
    assert.equal(commandHelpFor(command), null);
    assert.equal(commandHelp(command), null);
  }
  isolated((cli, dir) => {
    for (const args of [['help', 'no-such-command'], ['help', 'node', 'missing'], ['service', 'missing', '--help']]) {
      const result = cli(...args);
      assert.notEqual(result.status, 0, args.join(' '));
      assert.deepEqual(fs.readdirSync(dir), []);
    }
  });
});

test('literal --help after -- is recorded as title data', () => {
  isolated((cli) => {
    const result = cli('node', 'add', 'observation', '--json', '--', '--help');
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.node.title, '--help');
    const shown = cli('show', output.node.id, '--json');
    assert.equal(shown.status, 0, shown.stderr);
    assert.equal(JSON.parse(shown.stdout).node.title, '--help');
  });
});
