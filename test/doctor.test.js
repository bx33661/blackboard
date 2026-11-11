import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnose } from '../lib/doctor.js';
import { ensure, paths } from '../lib/store.js';
import { buildInfo } from '../lib/build-info.js';
import { installSkill, installHooks } from '../lib/hooks.js';

const CLI = fileURLToPath(new URL('../bin/pinwhy.js', import.meta.url));
function fixture(t, initialized = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-doctor-'));
  const cwd = path.join(root, 'project');
  const home = path.join(root, 'home');
  fs.mkdirSync(cwd); fs.mkdirSync(home);
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'doctor-fixture' });
  t.mock.method(os, 'homedir', () => home);
  const previousPath = process.env.PATH;
  process.env.PATH = home;
  const previousPort = process.env.PINWHY_PORT;
  delete process.env.PINWHY_PORT;
  t.after(() => {
    Object.defineProperty(process, 'platform', descriptor);
    if (previousPath === undefined) delete process.env.PATH; else process.env.PATH = previousPath;
    if (previousPort === undefined) delete process.env.PINWHY_PORT; else process.env.PINWHY_PORT = previousPort;
    fs.rmSync(root, { recursive: true, force: true });
  });
  if (initialized) ensure(cwd);
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('synthetic offline'); });
  return { cwd, home, board: paths(cwd) };
}
const check = (report, id) => report.checks.find(item => item.id === id);

test('doctor reports an uninitialized project without creating files or treating absent integrations as loaded', async t => {
  const { cwd } = fixture(t, false);
  const report = await diagnose({ cwd, cli: CLI });
  assert.equal(report.schema, 'pinwhy.doctor.v1');
  assert.equal(report.readOnly, true);
  assert.equal(check(report, 'board.log').status, 'warning');
  assert.equal(check(report, 'integrations.loaded').status, 'unknown');
  assert.deepEqual(fs.readdirSync(cwd), []);
});

test('doctor exposes corruption, future events and broken cache without repairing or echoing board text', async t => {
  const { cwd, board } = fixture(t);
  fs.writeFileSync(board.events, 'SYNTHETIC_PRIVATE_BODY\n' + JSON.stringify({ eventVersion: 999, op: 'meta', set: {} }) + '\n');
  fs.writeFileSync(board.state, 'SYNTHETIC_PRIVATE_CACHE');
  const before = [fs.readFileSync(board.events), fs.readFileSync(board.state), fs.readFileSync(board.config)];
  const report = await diagnose({ cwd, cli: CLI, share: true });
  assert.equal(report.status, 'error');
  assert.equal(check(report, 'board.log').details.corruptLines, 1);
  assert.equal(check(report, 'board.log').details.futureEvents, 1);
  assert.equal(check(report, 'board.cache').status, 'warning');
  assert.equal(report.cwd, '<project>');
  assert.doesNotMatch(JSON.stringify(report), /SYNTHETIC_PRIVATE|pinwhy-doctor-|Users[\\/]/);
  assert.deepEqual([fs.readFileSync(board.events), fs.readFileSync(board.state), fs.readFileSync(board.config)], before);
  assert.equal(fs.existsSync(board.lock), false);
});

test('doctor distinguishes stale and unexpanded integrations from current installations', async t => {
  const { cwd } = fixture(t);
  installSkill({ cwd, cli: '/synthetic/old/bin/pinwhy.js', agent: 'codex' });
  installHooks({ cwd, cli: CLI, write: true });
  const report = await diagnose({ cwd, cli: CLI });
  assert.equal(check(report, 'integration.skill.codex.project').status, 'warning');
  assert.equal(check(report, 'integration.hook.claude.project.SessionStart').status, 'ok');
  const file = path.join(cwd, '.agents', 'skills', 'pinwhy', 'SKILL.md');
  fs.writeFileSync(file, 'node "__PINWHY_CLI__"');
  assert.equal(check(await diagnose({ cwd, cli: CLI }), 'integration.skill.codex.project').details.state, 'unexpanded');
});

test('doctor detects stale viewer code and wrong project while retaining an independent report for each check', async t => {
  const { cwd } = fixture(t);
  let identity = { version: '0.0.0', buildId: 'sha256:synthetic-older-build' };
  let owner = cwd;
  t.mock.method(globalThis, 'fetch', async () => Response.json({ cwd: owner, readOnly: true, build: identity }));
  const old = await diagnose({ cwd, cli: CLI });
  assert.equal(check(old, 'viewer').status, 'ok');
  assert.equal(check(old, 'viewer.build').status, 'warning');
  identity = buildInfo();
  assert.equal(check(await diagnose({ cwd, cli: CLI }), 'viewer.build').status, 'ok');
  owner = os.homedir();
  const other = await diagnose({ cwd, cli: CLI });
  assert.equal(check(other, 'viewer').status, 'error');
  assert.equal(check(other, 'viewer').details.state, 'other-project');
  assert.equal(check(other, 'board.log').status, 'ok');
});
