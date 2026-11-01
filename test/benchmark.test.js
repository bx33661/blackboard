import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkPerformanceBudget, fixtureEvents, percentile, runBenchmark, summary } from '../scripts/benchmark.mjs';
import { applyAll, emptyGraph } from '../lib/model.js';

const root = fileURLToPath(new URL('../', import.meta.url));

test('benchmark fixtures are deterministic, valid and contain unknown types without rejecting them', () => {
  const first = fixtureEvents(100, 1000);
  assert.deepEqual(first, fixtureEvents(100, 1000));
  assert.equal(first.length, 1000);
  assert.equal(new Set(first.map((event) => event.eventId)).size, 1000);
  const graph = applyAll(emptyGraph(), first);
  assert.equal(Object.keys(graph.nodes).length, 100);
  assert.ok(Object.values(graph.nodes).some((node) => node.type === 'experiment'));
  assert.equal(graph.integrity.rejected, 0);
  assert.equal(Object.keys(graph.checkpoints).length, 1);
  assert.equal(graph.cursors['agent:primary'].to, 'n2');
  assert.throws(() => fixtureEvents(1, 100), /at least 2/);
  assert.throws(() => fixtureEvents(100, 101), /at least 2/);
});

test('benchmark percentiles use nearest-rank without mutating samples', () => {
  const samples = [100, 1, 4, 8, 3];
  assert.equal(percentile(samples, .5), 4);
  assert.equal(percentile(samples, .95), 100);
  assert.equal(percentile([], .5), null);
  assert.deepEqual(summary(samples), { samples, p50: 4, p95: 100, unit: 'ms' });
  assert.deepEqual(samples, [100, 1, 4, 8, 3]);
});

test('small benchmark exercises cold/read/context/write/concurrency and validates every log', async () => {
  const result = await runBenchmark({ source: root, nodes: 30, events: 100, runs: 2 });
  assert.equal(result.schemaVersion, 1);
  assert.equal(result.machine.node, process.version);
  const [sample] = result.results;
  assert.equal(sample.nodes, 30);
  assert.equal(sample.events, 100);
  assert.match(sample.fixtureSha256, /^[a-f0-9]{64}$/);
  for (const metric of Object.values(sample.metrics)) {
    assert.equal(metric.samples.length, 2);
    assert.ok(metric.p95 >= metric.p50 && metric.p50 >= 0);
  }
  assert.equal(sample.concurrency.workers, 2);
  assert.equal(sample.concurrency.write.samples.length, 4);
  assert.deepEqual(sample.integrity, { sourceUnchanged: true, fullReplayEqual: true, writePrefixPreserved: true, concurrentWritesExact: true });
});

test('benchmark CLI supports source/output and rejects accidental unknown options', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-benchmark-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const script = path.join(root, 'scripts', 'benchmark.mjs');
  const output = path.join(tmp, 'result.json');
  const result = spawnSync(process.execPath, [script, '--source', root, '--nodes', '10', '--events', '30', '--runs', '1', '--no-concurrency', '--output', output], { cwd: tmp, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), JSON.parse(fs.readFileSync(output, 'utf8')));
  assert.equal(JSON.parse(result.stdout).results[0].concurrency, null);
  const invalid = spawnSync(process.execPath, [script, '--board-root', '/not-a-board'], { encoding: 'utf8' });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /unknown option/);
  assert.deepEqual(fs.readdirSync(tmp), ['result.json'], 'the working directory is never treated as a board');
});

test('performance budgets enforce measured boundaries and reject unmeasured work', () => {
  const report = { results: [{ nodes: 10, events: 30, metrics: { fullReplay: { p50: 4, p95: 8 } } }] };
  const limit = { nodes: 10, events: 30, metric: 'fullReplay', statistic: 'p95', maxMs: 8 };
  const budget = { schema: 'blackboard.performance-budget.v1', limits: [limit] };
  assert.equal(checkPerformanceBudget(report, budget).passed, true);
  const failed = checkPerformanceBudget(report, { ...budget, limits: [{ ...limit, maxMs: 7 }] });
  assert.equal(failed.passed, false);
  assert.equal(failed.checks[0].observedMs, 8);
  for (const invalid of [
    { ...limit, events: 31 },
    { ...limit, metric: 'unmeasured' },
    { ...limit, statistic: 'average' },
    { ...limit, maxMs: 0 },
    { ...limit, maxMs: NaN },
  ]) assert.throws(() => checkPerformanceBudget(report, { ...budget, limits: [invalid] }));
});

test('a failed CLI budget exits unsuccessfully and retains the measured report', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-budget-cli-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const budget = path.join(tmp, 'budget.json');
  const output = path.join(tmp, 'report.json');
  fs.writeFileSync(budget, JSON.stringify({ schema: 'blackboard.performance-budget.v1', limits: [
    { nodes: 10, events: 30, metric: 'fullReplay', statistic: 'p95', maxMs: Number.MIN_VALUE },
  ] }));
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/benchmark.mjs'), '--nodes', '10', '--events', '30', '--runs', '1', '--no-concurrency', '--budget', budget, '--output', output], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.deepEqual(JSON.parse(result.stdout), report);
  assert.equal(report.budget.passed, false);
  assert.ok(report.budget.checks[0].observedMs > report.budget.checks[0].maxMs);
});

test('benchmark source identity changes when a measured storage helper changes', async (t) => {
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-benchmark-source-'));
  t.after(() => fs.rmSync(source, { recursive: true, force: true }));
  fs.cpSync(path.join(root, 'lib'), path.join(source, 'lib'), { recursive: true });
  fs.copyFileSync(path.join(root, 'package.json'), path.join(source, 'package.json'));
  const options = { source, nodes: 10, events: 30, runs: 1, 'no-concurrency': true };
  const before = await runBenchmark(options);
  fs.appendFileSync(path.join(source, 'lib', 'storage', 'event-file.js'), '\n// Synthetic measured-source revision.\n');
  const after = await runBenchmark(options);
  assert.notEqual(after.sourceFingerprint.start, before.sourceFingerprint.start);
  assert.equal(after.sourceFingerprint.changedDuringRun, false);
  assert.equal(before.results[0].fixtureSha256, after.results[0].fixtureSha256);
});
