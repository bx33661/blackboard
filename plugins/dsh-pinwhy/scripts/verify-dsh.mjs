// Run with a normal npm-installed SDK, or the desktop runtime in ELECTRON_RUN_AS_NODE mode.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire, registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const req = createRequire(process.env.DSH_RUNTIME_MANIFEST || new URL('../package.json', import.meta.url));
const resolved = new Map(['@deepseek-ai/cordis', '@deepseek-ai/dsh-system-prompt', '@deepseek-ai/dsh-tools', '@deepseek-ai/dsh-skill', '@deepseek-ai/schemastery', '@deepseek-ai/dsh-tool-executor-native']
  .map((name) => [name, req.resolve(name)]));
// Test-process-only resolver. Production resolution belongs to DSH's linked-package loader.
const hooks = registerHooks({ resolve(specifier, context, next) {
  return next(resolved.get(specifier) ?? specifier, context);
} });
const load = async (name) => import(pathToFileURL(resolved.get(name)).href);
const { Context } = await load('@deepseek-ai/cordis');
const systemPrompt = await load('@deepseek-ai/dsh-system-prompt');
const tools = await load('@deepseek-ai/dsh-tools');
const skills = await load('@deepseek-ai/dsh-skill');
const toolExecutor = await load('@deepseek-ai/dsh-tool-executor-native');
const plugin = await import('../src/index.js');
const wireSchema = JSON.parse(JSON.stringify(plugin.Config.toJSON()));
assert.ok(Object.values(wireSchema.refs).every(node => node.type !== 'transform'), 'browser form schema must be rehydratable without Host callbacks');
const { normalizeConfig } = await import('../src/config.js');
const runtimeCli = normalizeConfig({ runtimeCli: process.env.PINWHY_TEST_CLI }).runtimeCli;
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-pinwhy-native-'));
const ctx = new Context();
try {
  execFileSync(process.execPath, [runtimeCli, 'init', `--cwd=${dir}`, '--json'], {
    cwd: dir, env: { ...process.env, ...(process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}) },
  });
  await ctx.plugin(systemPrompt.default);
  await ctx.plugin(tools.default);
  await ctx.plugin(toolExecutor);
  await ctx.plugin(skills.default);
  // This minimal registry harness supplies a writable fixture policy; verify:profile tests the live policy service.
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write', workspaceRoot: dir }) });
  const config = { runtimeCli, projects: [{ workspace: dir }] };
  let fiber = await ctx.plugin(plugin, config);
  const count = () => ctx.tools.schemas().filter((s) => s.name.startsWith('pinwhy_')).length;
  assert.equal(count(), 11);
  let serial = 0;
  const agent = { id: 'native-test', session: { id: 'native-test', header: { cwd: dir } }, ctx };
  const call = async (name, args) => {
    const res = await ctx.tools.execute({
      calls: [{ callId: `native-${++serial}`, name, arguments: args }],
      agent, signal: new AbortController().signal,
    });
    return res.results[0].result;
  };
  const added = await call('pinwhy_node_add', { type: 'custom-type', title: 'Native DSH registration', enter: true });
  assert.ok(!added.isError, JSON.stringify(added));
  assert.equal(added.value.data.node.title, 'Native DSH registration');
  const packet = await call('pinwhy_context', {});
  assert.ok(!packet.isError, JSON.stringify(packet));
  assert.equal(packet.value.data.currentFocus.id, added.value.data.node.id);
  const search = await call('pinwhy_search', { query: 'Native DSH' });
  assert.ok(!search.isError, JSON.stringify(search));
  const invalid = await call('pinwhy_node_add', { type: 42, title: 'Invalid' });
  assert.equal(invalid.isError, true);
  const catalog = await ctx.skills.list({ cwd: dir });
  assert.ok(catalog.some((s) => s.name === 'pinwhy'));
  const skill = await ctx.skills.get('pinwhy', { cwd: dir });
  assert.match(skill.content, /## DSH adapter/);
  await fiber.dispose();
  assert.equal(count(), 0);
  assert.equal((await ctx.skills.list({ cwd: dir })).some((s) => s.name === 'pinwhy'), false);
  fiber = await ctx.plugin(plugin, config);
  assert.equal(count(), 11);
  const restored = await call('pinwhy_context', {});
  assert.ok(!restored.isError, JSON.stringify(restored));
  assert.equal(restored.value.data.currentFocus.id, added.value.data.node.id);
  await fiber.dispose();
  console.log('DSH_NATIVE: 11 tools; real registry execution/schema validation; Skill load; unload/reload; retained board PASS');
} finally {
  await ctx.fiber.dispose();
  hooks.deregister();
  await fs.rm(dir, { recursive: true, force: true });
}
