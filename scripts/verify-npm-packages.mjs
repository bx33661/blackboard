#!/usr/bin/env node
// Verify real tarballs with npm and isolated consumers, without registry credentials.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { packPackages } from './pack-packages.mjs';
import { npmEntry, isolatedNpmEnv } from './lib/npm.mjs';

const exec = promisify(execFile);
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const hash = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function localRegistry(artifacts, directory) {
  const byName = new Map(artifacts.map((artifact) => [artifact.name, artifact]));
  const byFilename = new Map(artifacts.map((artifact) => [artifact.filename, artifact]));
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    const filename = pathname.startsWith('/tarballs/') && decodeURIComponent(pathname.slice('/tarballs/'.length));
    if (filename && byFilename.has(filename)) {
      res.setHeader('Content-Type', 'application/octet-stream');
      fs.createReadStream(path.join(directory, filename)).pipe(res);
      return;
    }
    const artifact = byName.get(decodeURIComponent(pathname.slice(1)));
    if (!artifact) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"not found"}'); return; }
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      name: artifact.name, 'dist-tags': { latest: artifact.version },
      versions: { [artifact.version]: { ...artifact.metadata, dist: {
        tarball: `http://127.0.0.1:${server.address().port}/tarballs/${artifact.filename}`,
        shasum: artifact.shasum, integrity: artifact.integrity,
      } } },
    }));
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

const SDK_CONSUMER = `import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import {
  ensure, paths, addNode, addEdge, patchNode, replay, readEvents, currentCursor,
  moveCursor, addCheckpoint, buildAgentContext, searchGraph, backupBoard, restoreBoard,
} from 'pinwhy-core';
import { emptyGraph, applyAll } from 'pinwhy-core/model';
const require = createRequire(import.meta.url);
const cwd = path.resolve('sdk-board');
assert.equal(fs.existsSync(cwd), false, 'importing the SDK must not initialize a project');
ensure(cwd);
const goal = addNode({ type: 'goal', title: 'Verify authorization' }, cwd).node;
const evidenceInput = { type: 'observation', title: 'Anonymous access returned 403', author: 'sdk-reviewer', requestId: 'sdk-evidence' };
const evidence = addNode(evidenceInput, cwd).node;
assert.equal(addNode(evidenceInput, cwd).node.id, evidence.id, 'request retries must retain the recorded node');
assert.equal(Object.keys(replay(cwd).edges).length, 0, 'node creation must not invent a relation');
assert.equal(currentCursor(replay(cwd)), null, 'node creation must not implicitly move the cursor');
addEdge({ from: evidence.id, to: goal.id, kind: 'supports', author: 'sdk-reviewer' }, cwd);
moveCursor(evidence.id, { agentId: 'agent:review', reason: 'Inspect evidence' }, cwd);
addCheckpoint({ agentId: 'agent:review', summary: 'Evidence recorded' }, cwd);
const beforeConflict = fs.readFileSync(paths(cwd).events);
assert.throws(() => patchNode(evidence.id, { title: 'Changed' }, cwd, { expected: { title: 'Stale draft' } }), /node_conflict/);
assert.deepEqual(fs.readFileSync(paths(cwd).events), beforeConflict);
const graph = replay(cwd);
assert.equal(graph.nodes[evidence.id].author, 'sdk-reviewer');
assert.equal(currentCursor(graph, 'agent:review'), evidence.id);
assert.equal(currentCursor(graph), null, 'Agent cursors must remain independent');
const beforeRead = fs.readFileSync(paths(cwd).events);
const packet = buildAgentContext(graph, { agentId: 'agent:review', budgetTokens: 4000 });
assert.deepEqual(packet.policy, { readOnly: true, prescriptive: false, nextStepSelection: 'agent-controlled' });
assert.equal(packet.currentFocus.id, evidence.id);
assert.equal(searchGraph(graph, { query: 'Anonymous' }).items[0].id, evidence.id);
const replayed = applyAll(emptyGraph(), readEvents(cwd).events);
assert.equal(replayed.nodes[evidence.id].title, evidence.title);
assert.equal(currentCursor(replayed, 'agent:review'), evidence.id);
assert.deepEqual(fs.readFileSync(paths(cwd).events), beforeRead, 'projections must not write events');
const backup = path.resolve('sdk-backup');
const restored = path.resolve('sdk-restored');
backupBoard(cwd, backup);
restoreBoard(backup, restored);
assert.deepEqual(fs.readFileSync(paths(restored).events), beforeRead);
const cli = path.join(path.dirname(require.resolve('pinwhy/package.json')), 'bin/pinwhy.js');
const shown = spawnSync(process.execPath, [cli, 'show', evidence.id, '--cwd', cwd, '--json'], { encoding: 'utf8' });
assert.equal(shown.status, 0, shown.stderr);
assert.equal(JSON.parse(shown.stdout).node.author, 'sdk-reviewer');
const written = spawnSync(process.execPath, [cli, 'node', 'add', 'note', 'Written through CLI', '--cwd', cwd, '--json'], { encoding: 'utf8' });
assert.equal(written.status, 0, written.stderr);
const writtenId = JSON.parse(written.stdout).node.id;
assert.equal(replay(cwd).nodes[writtenId].title, 'Written through CLI');
assert.equal(fs.readFileSync(paths(cwd).events).subarray(0, beforeRead.length).equals(beforeRead), true);
await assert.rejects(import('pinwhy-core/lib/store.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
console.log('SDK_CONSUMER PASS: explicit writes, idempotency, isolated cursors, conflicts, read-only recovery, byte-preserving backup, model replay and CLI interoperability');
`;

async function freePort() {
  const socket = net.createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}

async function checkViewer(cli, board, env) {
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [cli, 'serve', '--cwd', board, '--port', String(port), '--read-only'], {
    env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '', stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve) => child.once('close', resolve));
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`CLI viewer did not start: ${stderr}`)), 15000);
      const finish = (error) => { clearTimeout(timer); error ? reject(error) : resolve(); };
      child.once('error', finish);
      child.once('exit', (code) => { if (!stdout.includes(url)) finish(new Error(`viewer exited ${code}: ${stderr}`)); });
      child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.includes(url)) finish(); });
    });
    const statusResponse = await fetch(`${url}/api/status`);
    assert.equal(statusResponse.status, 200);
    const status = await statusResponse.json();
    assert.equal(status.readOnly, true);
    const response = await fetch(url);
    assert.equal(response.status, 200);
    const html = await response.text();
    const asset = html.match(/src="((?:\.\/|\/)assets\/[^\"]+\.js)"/);
    assert.ok(asset, 'served workspace must reference its real built entry');
    const assetPath = asset[1].replace(/^\.\//, '/');
    assert.equal((await fetch(`${url}${assetPath}`)).status, 200);
  } finally {
    child.kill('SIGTERM');
    let timer;
    try { await Promise.race([closed, new Promise((_, reject) => { timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('viewer shutdown timed out')); }, 5000); })]); }
    finally { clearTimeout(timer); }
  }
}

export async function verifyNpmPackages({ source = ROOT, artifactsDir, registry } = {}) {
  const usePublishedPackages = Boolean(registry);
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-npm-consumers-'));
  let registryServer;
  try {
    const directory = artifactsDir ? path.resolve(artifactsDir) : path.join(scratch, 'artifacts');
    const manifest = artifactsDir ? JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8')) : packPackages({ source, outDir: directory });
    assert.equal(manifest.schema, 'pinwhy.npm-artifacts.v1');
    assert.deepEqual(manifest.artifacts.map((artifact) => artifact.name), ['pinwhy-core', 'pinwhy', 'pinwhy-cli', 'dsh-pinwhy']);
    for (const artifact of manifest.artifacts) {
      const bytes = fs.readFileSync(path.join(directory, artifact.filename));
      assert.equal(createHash('sha1').update(bytes).digest('hex'), artifact.shasum);
      assert.equal(`sha512-${createHash('sha512').update(bytes).digest('base64')}`, artifact.integrity);
    }
    if (!registry) {
      const local = await localRegistry(manifest.artifacts, directory);
      registryServer = local.server;
      registry = local.url;
    }
    const byName = new Map(manifest.artifacts.map((artifact) => [artifact.name, artifact]));
    const home = path.join(scratch, 'home');
    fs.mkdirSync(home);
    const env = isolatedNpmEnv(home, { npm_config_registry: registry, PINWHY_QUIET: '1' });
    const npm = npmEntry();
    const run = (command, args, cwd) => exec(command, args, { cwd, env, timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
    const install = async (name, packages) => {
      const consumer = path.join(scratch, name);
      fs.mkdirSync(consumer);
      fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name, private: true, type: 'module' }));
      const targets = packages.map((name) => usePublishedPackages
        ? `${name}@${byName.get(name).version}`
        : path.join(directory, byName.get(name).filename));
      await run(process.execPath, [npm, 'install', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--package-lock=false', ...targets], consumer);
      return consumer;
    };
    const sdkConsumer = await install('sdk-consumer', ['pinwhy-core', 'pinwhy']);
    fs.writeFileSync(path.join(sdkConsumer, 'consumer.mjs'), SDK_CONSUMER);
    const sdk = await run(process.execPath, ['consumer.mjs'], sdkConsumer);
    assert.match(sdk.stdout, /SDK_CONSUMER PASS/);
    const cliConsumer = await install('cli-consumer', ['pinwhy-cli']);
    const productRoot = path.join(cliConsumer, 'node_modules', 'pinwhy');
    const cli = path.join(cliConsumer, 'node_modules', 'pinwhy-cli', 'bin', 'pinwhy.js');
    assert.equal(JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8')).version, byName.get('pinwhy').version);
    const board = path.join(cliConsumer, 'project');
    fs.mkdirSync(board);
    const call = async (...args) => (await run(process.execPath, [cli, ...args, '--cwd', board], cliConsumer)).stdout;
    await call('init', '--title', 'Npm consumer project', '--json');
    const added = JSON.parse(await call('node', 'add', 'finding', 'Packaged CLI evidence', '--sev', 'high', '--enter', '--json'));
    assert.equal(added.node.title, 'Packaged CLI evidence');
    const eventFile = path.join(board, '.pinwhy', 'events.jsonl');
    const before = hash(eventFile);
    const capability = JSON.parse(await call('capabilities', '--json'));
    assert.equal(capability.version, byName.get('pinwhy-cli').version);
    assert.equal(capability.features.resourcePaths, true);
    assert.equal(fs.realpathSync(capability.resources.cli), fs.realpathSync(path.join(productRoot, 'bin', 'pinwhy.js')));
    assert.equal(fs.realpathSync(capability.resources.skill), fs.realpathSync(path.join(productRoot, 'skills', 'pinwhy')));
    const context = JSON.parse(await call('context'));
    assert.equal(context.policy.nextStepSelection, 'agent-controlled');
    assert.equal(context.currentFocus.id, added.node.id);
    const offline = path.join(cliConsumer, 'offline.html');
    await call('export', '--out', offline, '--json');
    assert.ok(fs.readFileSync(offline, 'utf8').includes('Packaged CLI evidence'));
    const executable = await run(process.execPath, [npm, 'exec', '--offline', '--', 'pinwhy', 'capabilities', '--json'], cliConsumer);
    assert.equal(JSON.parse(executable.stdout).version, capability.version);
    await checkViewer(cli, board, env);
    assert.equal(hash(eventFile), before, 'installed CLI reads, exports and viewer must preserve the event log');
    return {
      result: 'PASS', packages: manifest.artifacts.map(({ name, version }) => `${name}@${version}`),
      registry: registryServer ? 'temporary-local-registry' : registry,
      checks: ['tarball-integrity', 'sdk-real-exports', 'sdk-cli-event-interoperability', 'request-idempotency', 'cursor-isolation',
        'conflict-preservation', 'byte-preserving-backup', 'exact-runtime-dependency', 'npm-executable', 'runtime-resource-paths',
        'offline-export', 'http-workspace-and-assets', 'read-only-event-integrity'],
    };
  } finally {
    if (registryServer) await new Promise((resolve) => { registryServer.closeAllConnections(); registryServer.close(resolve); });
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const options = {};
    const args = process.argv.slice(2);
    for (let index = 0; index < args.length; index += 2) {
      assert.ok(['--artifacts-dir', '--registry'].includes(args[index]) && args[index + 1], 'Usage: npm run verify:npm-packages -- [--artifacts-dir DIR] [--registry URL]');
      options[args[index] === '--registry' ? 'registry' : 'artifactsDir'] = args[index + 1];
    }
    console.log(JSON.stringify(await verifyNpmPackages(options), null, 2));
  } catch (error) {
    console.error(`verify:npm-packages: ${error.message}`);
    process.exitCode = 1;
  }
}
