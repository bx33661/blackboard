#!/usr/bin/env node
// Build the four real npm artifacts from one maintained implementation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { npmEntry } from './lib/npm.mjs';
import { isolatedPinwhyEnv } from './lib/environment.mjs';

const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), '..');
const CORE_FILES = [
  'core.js', 'model.js', 'store.js', 'semantics.js', 'receipts.js', 'contracts.js',
  'context.js', 'search.js', 'history.js', 'backup.js',
  'storage/file-lock.js', 'storage/event-file.js', 'storage/event-codec.js',
  'storage/layout.js', 'storage/board.js', 'storage/event-log.js', 'storage/input.js',
];
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

export function packPackages({ source = ROOT, outDir = path.join(source, 'dist', 'npm') } = {}) {
  source = fs.realpathSync(path.resolve(source));
  outDir = path.resolve(outDir);
  const product = json(path.join(source, 'package.json'));
  const coreSource = path.join(source, 'packages', 'pinwhy-core');
  const cliSource = path.join(source, 'packages', 'pinwhy-cli');
  const { private: coreTemplate, ...core } = json(path.join(coreSource, 'package.json'));
  const { private: cliTemplate, ...cli } = json(path.join(cliSource, 'package.json'));
  assert.equal(coreTemplate, true, 'the SDK source manifest is a private publication template');
  assert.equal(cliTemplate, true, 'the CLI source manifest is a private publication template');
  const adapterSource = path.join(source, 'plugins', 'dsh-pinwhy');
  const adapter = json(path.join(adapterSource, 'package.json'));
  assert.equal(product.name, 'pinwhy');
  assert.equal(core.name, 'pinwhy-core');
  assert.equal(cli.name, 'pinwhy-cli');
  assert.equal(adapter.name, 'dsh-pinwhy');
  assert.equal(core.version, product.version, 'SDK version must match the canonical implementation');
  assert.equal(cli.version, product.version, 'CLI entry version must match its runtime');
  assert.deepEqual(cli.dependencies, { pinwhy: product.version }, 'CLI must use the exact verified runtime');
  assert.deepEqual(product.dependencies || {}, {}, 'the complete runtime has no package dependencies');
  assert.deepEqual(core.dependencies || {}, {}, 'the SDK has no package dependencies');
  assert.ok(fs.existsSync(path.join(source, 'public', 'index.html')), 'build the workspace before packing');
  fs.mkdirSync(outDir, { recursive: true });
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pinwhy-npm-stage-'));
  const npm = npmEntry();
  const artifacts = [];
  try {
    const stagedCore = path.join(scratch, 'pinwhy-core');
    fs.mkdirSync(stagedCore);
    fs.writeFileSync(path.join(stagedCore, 'package.json'), `${JSON.stringify(core, null, 2)}\n`);
    fs.copyFileSync(path.join(coreSource, 'README.md'), path.join(stagedCore, 'README.md'));
    fs.copyFileSync(path.join(source, 'LICENSE'), path.join(stagedCore, 'LICENSE'));
    for (const relative of CORE_FILES) {
      const destination = path.join(stagedCore, 'lib', relative);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(source, 'lib', relative), destination);
    }
    const stagedCli = path.join(scratch, 'pinwhy-cli');
    fs.mkdirSync(stagedCli);
    fs.writeFileSync(path.join(stagedCli, 'package.json'), `${JSON.stringify(cli, null, 2)}\n`);
    for (const name of ['README.md', 'bin']) fs.cpSync(path.join(cliSource, name), path.join(stagedCli, name), { recursive: true });
    fs.copyFileSync(path.join(source, 'LICENSE'), path.join(stagedCli, 'LICENSE'));
    fs.chmodSync(path.join(stagedCli, 'bin', 'pinwhy.js'), 0o755);
    for (const [directory, metadata] of [[stagedCore, core], [source, product], [stagedCli, cli], [adapterSource, adapter]]) {
      const result = spawnSync(process.execPath, [npm, 'pack', '--json', '--ignore-scripts', '--pack-destination', outDir], {
        cwd: directory, env: isolatedPinwhyEnv({ npm_config_update_notifier: 'false' }),
        encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
      });
      assert.equal(result.status, 0, `npm pack ${metadata.name}: ${result.stderr || result.error?.message}`);
      const [packed] = JSON.parse(result.stdout);
      assert.equal(packed.name, metadata.name);
      assert.equal(packed.version, metadata.version);
      assert.ok(packed.files.some((entry) => entry.path === 'LICENSE'), `${metadata.name} must include its MIT license`);
      artifacts.push({
        name: packed.name, version: packed.version, filename: packed.filename,
        shasum: packed.shasum, integrity: packed.integrity,
        size: packed.size, unpackedSize: packed.unpackedSize, files: packed.files,
        metadata,
      });
    }
    const manifest = { schema: 'pinwhy.npm-artifacts.v1', artifacts };
    fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
    return manifest;
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) {
  try {
    const args = process.argv.slice(2);
    assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--out-dir'), 'Usage: npm run pack:packages -- [--out-dir DIR]');
    const outDir = path.resolve(args[1] || path.join(ROOT, 'dist', 'npm'));
    const manifest = packPackages({ outDir });
    console.log(JSON.stringify({ output: outDir, packages: manifest.artifacts.map(({ name, version, filename, size }) => ({ name, version, filename, size })) }, null, 2));
  } catch (error) {
    console.error(`pack:packages: ${error.message}`);
    process.exitCode = 1;
  }
}
