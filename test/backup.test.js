import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { backupBoard, restoreBoard } from '../lib/backup.js';
import {
  ensure, paths, addNode, addEdge, moveCursor, addCheckpoint,
  removeNode, patchNode, setMeta, replay, readState, appendEvent,
} from '../lib/store.js';
import { EVENT_VERSION } from '../lib/model.js';

const STORE_URL = new URL('../lib/store.js', import.meta.url).href;
const BACKUP_URL = new URL('../lib/backup.js', import.meta.url).href;
const digest = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-backup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  fs.mkdirSync(source);
  ensure(source);
  return { root, source, backup: path.join(root, 'backup'), target: path.join(root, 'restored') };
}

function rewriteDescriptor(backup, name) {
  const file = path.join(backup, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(file));
  const bytes = fs.readFileSync(path.join(backup, name));
  Object.assign(manifest.files.find((entry) => entry.path === name), { bytes: bytes.length, sha256: digest(bytes) });
  // Manifest diagnostic claims are never authoritative for restore validation.
  manifest.integrity = { corruptLines: 0, futureEvents: 0, rejected: 0 };
  fs.writeFileSync(file, JSON.stringify(manifest));
}

test('backup restores exact source bytes and complete graph while discarding caches', (t) => {
  const { source, backup, target } = fixture(t);
  setMeta({ title: 'handoff research', session: 'stable-session' }, source);
  const a = addNode({ type: 'hypothesis', title: 'candidate', confidence: 'suspected', enter: true }, source).node;
  const b = addNode({ type: 'custom-observation', title: 'counterevidence', at: 'src/a.js:9', tags: ['source'] }, source).node;
  addEdge({ from: b.id, to: a.id, kind: 'contradicts' }, source);
  patchNode(a.id, { status: 'refuted' }, source, { by: 'reviewer' });
  moveCursor(b.id, { agentId: 'agent:review' }, source);
  addCheckpoint({ agentId: 'agent:review', summary: 'evidence changed the conclusion' }, source);
  const retired = addNode({ title: 'retired' }, source).node;
  removeNode(retired.id, {}, source);
  const config = '{"redact":true,"digest":{"maxNeighbors":7}}\n';
  fs.writeFileSync(paths(source).config, config);
  fs.writeFileSync(paths(source).state, '{"title":"UNTRUSTED CACHE","focus":"missing"}');
  fs.writeFileSync(path.join(paths(source).root, 'tool-raw.txt'), 'not part of backup');
  const raw = fs.readFileSync(paths(source).events);
  const expected = replay(source);

  const receipt = backupBoard(source, backup);
  assert.equal(receipt.eventsSha256, digest(raw));
  assert.deepEqual(fs.readFileSync(paths(source).events), raw);
  assert.deepEqual(fs.readdirSync(backup).sort(), ['config.json', 'events.jsonl', 'manifest.json']);
  assert.equal(receipt.integrity.corruptLines, 0);
  const restored = restoreBoard(backup, target);
  assert.equal(restored.eventsSha256, receipt.eventsSha256);
  assert.equal(restored.state, 'rebuilt-from-events');
  assert.deepEqual(fs.readFileSync(paths(target).events), raw);
  assert.equal(fs.readFileSync(paths(target).config, 'utf8'), config);
  assert.deepEqual(replay(target), expected);
  assert.deepEqual(replay(target).retiredIds, { [retired.id]: true });
  assert.equal(readState(target).title, 'handoff research');
  assert.equal(readState(target).focus, a.id);
  assert.equal(readState(target).cursors['agent:review'], b.id);
  assert.match(fs.readFileSync(path.join(paths(target).root, '.gitignore'), 'utf8'), /\*/);
  const next = addNode({ type: 'note', title: 'after restore' }, target).node;
  assert.notEqual(next.id, retired.id);
});

test('empty board and absent config restore from source log without requiring a cache', (t) => {
  const { source, backup, target } = fixture(t);
  fs.unlinkSync(paths(source).config);
  fs.unlinkSync(paths(source).state);
  backupBoard(source, backup);
  restoreBoard(backup, target);
  assert.equal(fs.readFileSync(paths(target).events, 'utf8'), '');
  assert.deepEqual(replay(target), replay(source));
  assert.deepEqual(JSON.parse(fs.readFileSync(paths(target).config)), {});
});

test('restore permits unrelated project files but never overwrites any .blackboard entry', (t) => {
  const { root, source, backup, target } = fixture(t);
  backupBoard(source, backup);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'README.md'), 'project');
  restoreBoard(backup, target);
  const raw = fs.readFileSync(paths(target).events);
  assert.throws(() => restoreBoard(backup, target), /already has .blackboard/);
  assert.deepEqual(fs.readFileSync(paths(target).events), raw);
  assert.equal(fs.readFileSync(path.join(target, 'README.md'), 'utf8'), 'project');
  const empty = path.join(root, 'empty-project');
  fs.mkdirSync(paths(empty).root, { recursive: true });
  assert.throws(() => restoreBoard(backup, empty), /already has .blackboard/);
});

test('backup refuses overwrite, symlink sources and destinations inside source data', (t) => {
  const { root, source, backup } = fixture(t);
  backupBoard(source, backup);
  assert.throws(() => backupBoard(source, backup), /already exists/);
  assert.throws(() => backupBoard(source, path.join(paths(source).root, 'backup')), /outside/);
  const alias = path.join(root, 'data-alias');
  fs.symlinkSync(paths(source).root, alias);
  assert.throws(() => backupBoard(source, path.join(alias, 'backup')), /outside/);
  const original = path.join(root, 'original-events');
  fs.renameSync(paths(source).events, original);
  fs.symlinkSync(original, paths(source).events);
  assert.throws(() => backupBoard(source, path.join(root, 'linked')), /regular file/);
  assert.equal(fs.readFileSync(original, 'utf8'), '');
});

test('backup captures damage verbatim but restore rejects it before creating target', (t) => {
  const { source, backup, target } = fixture(t);
  addNode({ title: 'valid prefix' }, source);
  fs.appendFileSync(paths(source).events, '{broken}\n{"op":"node"');
  const raw = fs.readFileSync(paths(source).events);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.integrity.corruptLines, 1);
  assert.ok(receipt.integrity.incompleteTailBytes > 0);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'events.jsonl')), raw);
  assert.throws(() => restoreBoard(backup, target), /event log is damaged/);
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readFileSync(paths(source).events), raw);
});

test('future events can be archived but restore refuses them even when manifest hides diagnostics', (t) => {
  const { source, backup, target } = fixture(t);
  appendEvent({ eventVersion: EVENT_VERSION + 1, op: 'node', node: { id: 'n1', type: 'note', title: 'future' } }, source);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.integrity.futureEvents, 1);
  rewriteDescriptor(backup, 'events.jsonl');
  assert.throws(() => restoreBoard(backup, target), /future eventVersion/);
  assert.equal(fs.existsSync(target), false);
});

test('unknown additive operations and custom types remain byte-preserved and diagnosed', (t) => {
  const { source, backup, target } = fixture(t);
  addNode({ type: 'experiment', title: 'custom type' }, source);
  appendEvent({ op: 'future-additive-operation', detail: 'retained verbatim' }, source);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.integrity.unknownOps, 1);
  restoreBoard(backup, target);
  assert.deepEqual(replay(target), replay(source));
  assert.deepEqual(fs.readFileSync(paths(target).events), fs.readFileSync(paths(source).events));
});

test('restore checks checksums, exact file set, path allowlist, version and symlinks', (t) => {
  const { root, source } = fixture(t);
  const cases = [
    ['checksum', (dir) => fs.appendFileSync(path.join(dir, 'events.jsonl'), '\n'), /checksum/],
    ['extra', (dir) => fs.writeFileSync(path.join(dir, 'unlisted.txt'), 'secret'), /file set/],
    ['traversal', (dir) => {
      const file = path.join(dir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(file));
      manifest.files[0].path = '../events.jsonl';
      fs.writeFileSync(file, JSON.stringify(manifest));
    }, /file path/],
    ['version', (dir) => {
      const file = path.join(dir, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(file));
      manifest.backupVersion = 999;
      fs.writeFileSync(file, JSON.stringify(manifest));
    }, /format\/version/],
    ['symlink', (dir) => {
      fs.unlinkSync(path.join(dir, 'events.jsonl'));
      fs.symlinkSync(paths(source).events, path.join(dir, 'events.jsonl'));
    }, /regular file/],
    ['config', (dir) => {
      fs.writeFileSync(path.join(dir, 'config.json'), 'null');
      rewriteDescriptor(dir, 'config.json');
    }, /config must be/],
    ['rejected-event', (dir) => {
      fs.appendFileSync(path.join(dir, 'events.jsonl'), '{"op":"node","node":{"id":"bad"}}\n');
      rewriteDescriptor(dir, 'events.jsonl');
    }, /event log is damaged/],
    ['invalid-utf8', (dir) => {
      fs.writeFileSync(path.join(dir, 'events.jsonl'), Buffer.from([255, 10]));
      rewriteDescriptor(dir, 'events.jsonl');
    }, /event log is damaged/],
  ];
  for (const [name, mutate, error] of cases) {
    const dir = path.join(root, `backup-${name}`);
    const target = path.join(root, `restore-${name}`);
    backupBoard(source, dir);
    mutate(dir);
    assert.throws(() => restoreBoard(dir, target), error, name);
    assert.equal(fs.existsSync(target), false, name);
  }
});

test('a concurrent writer cannot leave a partial compound action in the snapshot', async (t) => {
  const { root, source, backup, target } = fixture(t);
  addNode({ title: 'root' }, source);
  const paused = path.join(root, 'writer-paused');
  const release = path.join(root, 'release-writer');
  const contended = path.join(root, 'backup-contended');
  const continueWriting = path.join(root, 'continue-writing');
  const receiptFile = path.join(root, 'receipt.json');
  const children = [];
  function startChild(code) {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (bytes) => { stderr += bytes; });
    const exited = once(child, 'exit');
    const entry = { child, exited, stderr: () => stderr };
    children.push(entry);
    return entry;
  }
  async function waitForFile(file, entry) {
    const deadline = Date.now() + 8000;
    while (!fs.existsSync(file)) {
      if (entry.child.exitCode !== null || entry.child.signalCode !== null) {
        assert.fail(`child exited before ${path.basename(file)}: ${entry.stderr()}`);
      }
      if (Date.now() >= deadline) assert.fail(`timed out waiting for ${path.basename(file)}: ${entry.stderr()}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  try {
    const writer = startChild(`
      import fs from 'node:fs';
      import { addNode } from ${JSON.stringify(STORE_URL)};
      const source = ${JSON.stringify(source)};
      const file = ${JSON.stringify(paths(source).events)};
      const wait = (marker) => {
        const deadline = Date.now() + 15000;
        while (!fs.existsSync(marker)) {
          if (Date.now() >= deadline) throw new Error('timed out waiting for ' + marker);
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
        }
      };
      addNode({ title: 'write-0', parent: 'n1', enter: true }, source);
      const append = fs.appendFileSync;
      let paused = false;
      fs.appendFileSync = function(target, ...args) {
        const result = append.call(this, target, ...args);
        if (target === file && !paused) {
          paused = true;
          fs.writeFileSync(${JSON.stringify(paused)}, 'paused');
          wait(${JSON.stringify(release)});
        }
        return result;
      };
      addNode({ title: 'write-1', parent: 'n1', enter: true }, source);
      if (!paused) throw new Error('compound write did not reach the pause');
      fs.appendFileSync = append;
      wait(${JSON.stringify(continueWriting)});
      addNode({ title: 'write-2', parent: 'n1', enter: true }, source);
    `);
    await waitForFile(paused, writer);
    const partial = fs.readFileSync(paths(source).events, 'utf8').trimEnd().split('\n').map(JSON.parse);
    assert.equal(partial.length, 5);
    assert.equal(partial.at(-1).node.title, 'write-1');

    const archiver = startChild(`
      import fs from 'node:fs';
      import { backupBoard } from ${JSON.stringify(BACKUP_URL)};
      const open = fs.openSync;
      let reported = false;
      fs.openSync = function(target, flags, ...args) {
        try { return open.call(this, target, flags, ...args); }
        catch (error) {
          if (!reported && target === ${JSON.stringify(paths(source).lock)} && flags === 'wx' && error.code === 'EEXIST') {
            reported = true;
            fs.writeFileSync(${JSON.stringify(contended)}, 'contended');
          }
          throw error;
        }
      };
      const receipt = backupBoard(${JSON.stringify(source)}, ${JSON.stringify(backup)});
      if (!reported) throw new Error('backup never contended for the writer lock');
      fs.writeFileSync(${JSON.stringify(receiptFile)}, JSON.stringify(receipt));
    `);
    await waitForFile(contended, archiver);
    fs.writeFileSync(release, 'release');
    assert.equal((await archiver.exited)[0], 0, archiver.stderr());

    const receipt = JSON.parse(fs.readFileSync(receiptFile, 'utf8'));
    restoreBoard(backup, target);
    const graph = replay(target);
    assert.equal(Object.keys(graph.nodes).length, 3);
    assert.equal(Object.keys(graph.edges).length, 2);
    assert.equal(graph.cursorTrail.length, 2);
    assert.equal(receipt.eventCount, 7);
    const captured = fs.readFileSync(paths(target).events);
    assert.deepEqual(captured, fs.readFileSync(paths(source).events));
    assert.equal(receipt.eventsSha256, digest(captured));

    fs.writeFileSync(continueWriting, 'continue');
    assert.equal((await writer.exited)[0], 0, writer.stderr());
    const finalBytes = fs.readFileSync(paths(source).events);
    assert.deepEqual(finalBytes.subarray(0, captured.length), captured);
    assert.equal(replay(source).cursorTrail.length, 3);
  } finally {
    for (const { child } of children) {
      if (child.exitCode === null && child.signalCode === null) child.kill();
    }
    await Promise.allSettled(children.map(({ exited }) => exited));
  }
});


test('restore cleans staging data after cache-write failure and leaves the backup intact', (t) => {
  const { source, backup, target } = fixture(t);
  addNode({ title: 'before failure' }, source);
  backupBoard(source, backup);
  const raw = fs.readFileSync(path.join(backup, 'events.jsonl'));
  const rename = fs.renameSync;
  try {
    fs.renameSync = (from, to) => {
      if (String(to).endsWith(`${path.sep}.blackboard${path.sep}state.json`)) throw new Error('injected cache-write failure');
      return rename(from, to);
    };
    assert.throws(() => restoreBoard(backup, target), /injected cache-write failure/);
  } finally {
    fs.renameSync = rename;
  }
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(fs.readFileSync(path.join(backup, 'events.jsonl')), raw);
  restoreBoard(backup, target);
  assert.deepEqual(replay(target), replay(source));
});


test('a reset cannot hide damaged historical records from restore validation', (t) => {
  const { source, backup, target } = fixture(t);
  appendEvent({ op: 'node', node: { id: 'bad' } }, source);
  appendEvent({ op: 'unknown-historical-op' }, source);
  appendEvent({ op: 'reset' }, source);
  addNode({ title: 'valid current graph' }, source);
  const receipt = backupBoard(source, backup);
  assert.equal(receipt.integrity.rejected, 1);
  assert.equal(receipt.integrity.unknownOps, 1);
  assert.throws(() => restoreBoard(backup, target), /event log is damaged/);
  assert.equal(fs.existsSync(target), false);
});


test('restore never adds files inside the source backup, including through aliases', (t) => {
  const { root, source, backup } = fixture(t);
  backupBoard(source, backup);
  const names = fs.readdirSync(backup).sort();
  const alias = path.join(root, 'backup-alias');
  fs.symlinkSync(backup, alias);
  for (const target of [backup, path.join(backup, 'nested-target'), path.join(alias, 'nested-target')]) {
    assert.throws(() => restoreBoard(backup, target), /outside the source backup/);
    assert.deepEqual(fs.readdirSync(backup).sort(), names);
  }
  assert.throws(() => restoreBoard(alias, path.join(root, 'new-target')), /real directory/);
});
