// Verify the actual dsh launcher, linked-package resolution, and graceful shutdown in a disposable home.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { normalizeConfig } from '../src/config.js';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pinwhy-profile-'));
const project = path.join(fixture, 'project');
const runtimeCli = normalizeConfig({ runtimeCli: process.env.PINWHY_TEST_CLI }).runtimeCli;
const env = { ...process.env, DSH_HOME: path.join(fixture, 'dsh-home'), DSH_TELEMETRY_DISABLED: '1' };
const dsh = process.env.DSH_BIN || 'dsh';
const run = (command, args, extraEnv = {}) => exec(command, args, { cwd: root, env: { ...env, ...extraEnv }, timeout: 60_000, maxBuffer: 2_097_152 });
try {
  await fs.mkdir(project);
  await run(process.execPath, [runtimeCli, 'init', `--cwd=${project}`, '--json']);
  const observer = path.join(fixture, 'observer.mjs');
  await fs.writeFile(observer, `
import assert from 'node:assert/strict';
export const name = 'pinwhy-loader-probe';
export const inject = ['tools', 'skills', 'agentLoop', 'appReady', 'appExit'];
export function apply(ctx, config) {
  ctx.effect(() => ctx.appReady.onReady(() => {
    (async () => {
      const schemas = ctx.tools.schemas().filter(s => s.name.startsWith('pinwhy_'));
      assert.equal(schemas.length, 9);
      const agent = await ctx.agentLoop.create('loader-probe', {}, { cwd: config.project });
      const result = await ctx.tools.execute({ callId: 'loader-probe', name: 'pinwhy_context', arguments: {}, agent, signal: new AbortController().signal });
      assert.ok(!result.isError, JSON.stringify(result));
      assert.equal(result.value.data.policy.nextStepSelection, 'agent-controlled');
      agent.session.append('sandbox/mode', { mode: 'read-only' });
      const writeArgs = { type: 'note', title: 'Live policy verification' };
      const denied = await ctx.tools.execute({ callId: 'loader-denied', name: 'pinwhy_node_add', arguments: writeArgs, agent, signal: new AbortController().signal });
      assert.equal(denied.isError, true);
      assert.match(denied.error.message, /WRITE_POLICY/);
      agent.session.append('sandbox/mode', { mode: 'workspace-write' });
      const added = await ctx.tools.execute({ callId: 'loader-write', name: 'pinwhy_node_add', arguments: writeArgs, agent, signal: new AbortController().signal });
      assert.ok(!added.isError, JSON.stringify(added));
      assert.equal(added.value.data.node.title, writeArgs.title);
      const skills = await ctx.skills.list({ cwd: config.project });
      assert.ok(skills.some(s => s.name === 'pinwhy'));
      console.log('DSH_LOADER_PROBE: 9 native tools; live Session read/write; read-only enforcement; Skill discovery PASS');
      ctx.appExit(0);
    })().catch(error => { console.error(error); ctx.appExit(1); });
  }));
}
`);
  const overlay = path.join(fixture, 'probe.patch.yml');
  const config = { runtimeCli, projects: [{ workspace: project }] };
  // JSON is valid YAML; no interpolation or shell quoting is needed for fixture paths.
  await fs.writeFile(overlay, JSON.stringify([
    { id: 'pinwhy', config },
    { insert: [{ id: 'pinwhy-probe', name: observer, config: { project } }] },
  ], null, 2));
  const profile = 'pinwhy-integration';
  const source = process.env.DSH_PLUGIN_PACKAGE || root;
  await run(dsh, ['plugin', '--profile', profile, 'add', source, '--ignore-scripts', '--config.auto-install-peers=false']);
  const dump = await run(dsh, ['--profile', profile, '--dump-config']);
  assert.match(dump.stdout, /# == dsh-pinwhy/);
  const booted = await run(dsh, ['--profile', profile, '--patch', overlay]);
  assert.match(booted.stdout, /DSH_LOADER_PROBE: .* PASS/);
  process.stdout.write(booted.stdout);
  await run(dsh, ['plugin', '--profile', profile, 'remove', 'dsh-pinwhy']);
  const removed = await run(dsh, ['--profile', profile, '--dump-config']);
  assert.ok(!removed.stdout.includes('# == dsh-pinwhy'));
  await fs.access(path.join(project, '.pinwhy/events.jsonl'));
  console.log('DSH_PROFILE: isolated install, dump-config, real loader boot, remove and retained board PASS');
} finally {
  await fs.rm(fixture, { recursive: true, force: true });
}
