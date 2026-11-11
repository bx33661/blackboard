import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, prepare, run } from '../scripts/recovery-experiment.mjs';
import { estimateTokensText } from '../lib/context.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SCRIPT = path.join(ROOT, 'scripts/recovery-experiment.mjs');

const node = (id, type, ts, extra = {}) => ({ op: 'node', node: { id, type, title: `${id} title`, ts, ...extra } });
const edge = (from, to, kind, ts) => ({ op: 'edge', edge: { id: `${from}-${kind}-${to}`, from, to, kind, ts } });
const checkpoint = (id, at, summary) => ({ op: 'checkpoint', checkpoint: { id, agentId: 'agent:primary', at, summary } });

function board() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-recovery-'));
  fs.mkdirSync(path.join(root, '.pinwhy'));
  const events = [
    node('G1', 'goal', 1, { status: 'active' }),
    node('F1', 'fact', 2, { confidence: 'reproduced' }),
    node('H1', 'hypothesis', 3, { status: 'open', confidence: 'suspected' }),
    edge('F1', 'H1', 'supports', 4),
    { op: 'cursor', cursor: { agentId: 'agent:primary', from: null, to: 'H1', reason: 'check H1', at: 4 } },
    checkpoint('cp1', 5, 'Goal G1; F1 supports H1, not yet verified.'),
    node('F2', 'finding', 6, { confidence: 'confirmed' }),
    edge('F2', 'H1', 'contradicts', 7),
    checkpoint('cp2', 8, 'F2 contradicts H1.'),
    node('F3', 'finding', 9, { confidence: 'confirmed' }),
  ].map((ev, i) => ({ eventVersion: 1, eventId: `e${i}`, ...ev }));
  const file = path.join(root, '.pinwhy/events.jsonl');
  fs.writeFileSync(file, events.map((ev) => JSON.stringify(ev)).join('\n') + '\n');
  return { root, file };
}

const read = (dir, name) => fs.readFileSync(path.join(dir, name), 'utf8');
const nodeIds = (packet) => [
  packet.currentFocus?.id,
  ...['objectives', 'openThreads', 'findings', 'confirmedFacts', 'notes', 'recentChanges'].flatMap((key) => packet[key].map((n) => n.id)),
  ...packet.neighborhood.map((item) => item.node.id),
].filter(Boolean).sort();

const compactTokens = (packet) => Math.ceil(estimateTokensText(JSON.stringify(packet)));

function mixedTextBoard(t) {
  const { root, file } = board();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const events = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  for (const event of events) {
    if (event.node) {
      event.node.title = `观察 ${event.node.id}: mixed ASCII 与中文`;
      event.node.detail = '第一行：只观察到局部结果。\n限制：真实部署状态未验证，path="src/sample.js"。';
    }
    if (event.checkpoint) event.checkpoint.summary = `检查点 ${event.checkpoint.id}: 已记录支持与反证。\n限制：其余情况未验证。`;
  }
  fs.writeFileSync(file, `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
  return { root, file };
}

test('summary costs count authored plain text rather than JSON quotes and escaped newlines', (t) => {
  const { root } = mixedTextBoard(t);
  const summaryFile = path.join(root, 'summary.md');
  const summary = '第一行：条件未验证。\nSecond line: "quoted" path C:\\sample\\file。';
  fs.writeFileSync(summaryFile, ` \n${summary}\n `);
  const out = path.join(root, 'out');
  const manifest = prepare({ board: root, at: 'cp1', summaryFile, out });
  assert.equal(read(out, 'A-summary.md'), `${summary}\n`);
  assert.equal(manifest.arms.A.chars, summary.length, 'character counts retain the existing content-only convention');
  assert.equal(manifest.arms.A.estimatedTokens, Math.ceil(estimateTokensText(summary)));
  assert.notEqual(manifest.arms.A.estimatedTokens, compactTokens(summary), 'plain-text costs must not include JSON quoting/escaping');
});

test('mixed-language node and graph arms share the compact JSON token estimator', (t) => {
  const { root, file } = mixedTextBoard(t);
  const before = fs.readFileSync(file);
  const out = path.join(root, 'out');
  const manifest = prepare({ board: root, at: 'cp2', budget: 8000, out });
  const b = JSON.parse(read(out, 'B-nodes.json'));
  const c = JSON.parse(read(out, 'C-graph.json'));
  assert.deepEqual(nodeIds(b), nodeIds(c));
  assert.deepEqual(b.relations, []);
  assert.ok(c.relations.length > 0);
  for (const [arm, packet] of [['B', b], ['C', c]]) {
    assert.equal(packet.estimatedTokens, compactTokens(packet), `${arm} estimate includes its final own digit count`);
    assert.equal(manifest.arms[arm].estimatedTokens, compactTokens(packet), `${arm} manifest uses the same estimator`);
    assert.equal(manifest.arms[arm].chars, JSON.stringify(packet).length, `${arm} chars count compact JSON, not file indentation`);
    assert.ok(manifest.arms[arm].estimatedTokens > Math.ceil(manifest.arms[arm].chars / 4), `${arm} accounts for Chinese text`);
  }
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(fs.readdirSync(path.join(root, '.pinwhy')), ['events.jsonl']);
});

test('mixed-language resume costs sum the final interrupted and delta packet estimates', (t) => {
  const { root } = mixedTextBoard(t);
  const out = path.join(root, 'out');
  const manifest = prepare({ board: root, at: 'cp2', since: 'cp1', budget: 8000, out });
  for (const arm of ['B', 'C']) {
    const material = JSON.parse(read(out, `${arm}-${arm === 'B' ? 'nodes' : 'graph'}.json`));
    const packets = [material.interrupted, material.since];
    for (const packet of packets) assert.equal(packet.estimatedTokens, compactTokens(packet), `${arm} packet estimate`);
    assert.equal(manifest.arms[arm].estimatedTokens, packets.reduce((sum, packet) => sum + compactTokens(packet), 0));
    assert.equal(manifest.arms[arm].chars, packets.reduce((sum, packet) => sum + JSON.stringify(packet).length, 0));
  }
  const summary = read(out, 'A-summary.md').slice(0, -1);
  assert.equal(manifest.arms.A.estimatedTokens, Math.ceil(estimateTokensText(summary)));
});


test('takeover materials stop at the cut and differ only in relations', () => {
  const { root, file } = board();
  const before = fs.readFileSync(file, 'utf8');
  const out = path.join(root, 'out');
  const manifest = prepare({ board: root, at: 'cp1', budget: 2000, out });

  assert.equal(manifest.mode, 'takeover');
  assert.equal(manifest.cut.atEvent, 6);
  assert.deepEqual(Object.keys(manifest.nodesAtCut).sort(), ['F1', 'G1', 'H1']);
  for (const name of ['A-summary.md', 'B-nodes.json', 'C-graph.json']) {
    assert.doesNotMatch(read(out, name), /F2|F3|contradicts/, `${name} leaks events after the cut`);
  }
  assert.match(read(out, 'A-summary.md'), /F1 supports H1/);

  const b = JSON.parse(read(out, 'B-nodes.json'));
  const c = JSON.parse(read(out, 'C-graph.json'));
  assert.equal(b.request.budgetTokens, c.request.budgetTokens);
  assert.deepEqual(nodeIds(b), nodeIds(c));
  assert.ok(c.neighborhood.length > 0, 'the focus neighbourhood is selected through relations');
  // Authored prose (checkpoint summaries) may mention relations; structure may not.
  assert.doesNotMatch(read(out, 'B-nodes.json'), /"(relation|direction|from|to)":/);
  assert.deepEqual(b.relations, []);
  assert.deepEqual(c.relations.map((r) => r.kind), ['supports']);
  assert.ok(manifest.arms.B.chars < manifest.arms.C.chars);
  assert.deepEqual(c.policy, { readOnly: true, prescriptive: false, nextStepSelection: 'agent-controlled' });
  assert.equal(manifest.arms.C.relations, 1);
  assert.deepEqual(manifest.cost, { nodeEvents: 3, edgeEvents: 1, patchEvents: 0, checkpointEvents: 1, authoredChars: manifest.cost.authoredChars });

  // Read-only: the log is untouched and no state cache appears.
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.deepEqual(fs.readdirSync(path.join(root, '.pinwhy')), ['events.jsonl']);
});

test('resume materials keep the interrupted view and the delta apart', () => {
  const { root } = board();
  const out = path.join(root, 'out');
  const manifest = prepare({ board: root, at: 'cp2', since: 'cp1', budget: 2000, out });

  assert.equal(manifest.mode, 'resume');
  assert.equal(manifest.cut.sinceEvent, 6);
  const c = JSON.parse(read(out, 'C-graph.json'));
  assert.ok(!JSON.stringify(c.interrupted).includes('F2'));
  assert.deepEqual(c.since.recentChanges.map((n) => n.id), ['F2']);
  assert.deepEqual(c.since.changes.map((change) => change.relation), ['contradicts']);
  const b = JSON.parse(read(out, 'B-nodes.json'));
  assert.deepEqual(b.since.changes, []);
  assert.ok(!read(out, 'C-graph.json').includes('F3'));

  const summary = read(out, 'A-summary.md');
  assert.ok(summary.indexOf('F1 supports H1') < summary.indexOf('F2 contradicts H1'));
});

test('prepare refuses ambiguous cuts instead of guessing', () => {
  const { root } = board();
  const out = path.join(root, 'out');
  assert.throws(() => prepare({ board: root, at: 'cp9', out }), /not a checkpoint/);
  assert.throws(() => prepare({ board: root, at: 'cp1', since: 'cp2', out }), /not a checkpoint/);
  assert.throws(() => prepare({ board: root, at: 'cp1', since: 'cp1', out }), /earlier than/);
  assert.throws(() => prepare({ board: root, at: 'event:3', out }), /summary-file/);
  const summaryFile = path.join(root, 'handoff.md');
  fs.writeFileSync(summaryFile, 'Handoff written by the task agent.');
  assert.equal(prepare({ board: root, at: 'event:3', summaryFile, out }).arms.A.source, 'summary-file');
});

test('check tallies citations, unknowns and guesses mechanically per arm', () => {
  const { root } = board();
  const manifest = prepare({ board: root, at: 'cp1', out: path.join(root, 'out') });
  const questions = [
    { id: 'q1', text: 'What supports H1?', evidence: ['F1'] },
    { id: 'q2', text: 'Was H1 refuted?', expected: 'unknown' },
    { id: 'q3', text: 'Is H1 true?', evidence: ['H1'] },
  ];
  const answers = [
    { question: 'q1', arm: 'C', answer: 'F1', cites: ['F1'], stance: 'fact', correct: true },
    { question: 'q2', arm: 'C', answer: 'not recorded', cites: [], stance: 'unknown', correct: true },
    { question: 'q3', arm: 'C', answer: 'yes', cites: ['H1'], stance: 'fact', correct: false },
    { question: 'q1', arm: 'B', answer: 'F2', cites: ['F2'], stance: 'fact' },
    { question: 'q2', arm: 'B', answer: 'yes, by F2', cites: ['F2'], stance: 'fact' },
  ];
  const result = check({ manifest, questions, answers });

  assert.deepEqual(
    { ...result.arms.C, citesUnknownAtCut: undefined },
    {
      answered: 3, graded: 3, correct: 2, cites: 2, citesValid: 2, citesUnknownAtCut: undefined,
      evidenceQuestions: 2, evidenceHit: 2, unknownExpected: 1, unknownHandled: 1, missed: 0,
      guessAsFact: 1, factWithoutCitation: 0,
    },
  );
  assert.deepEqual(result.arms.B.citesUnknownAtCut, ['q1:F2', 'q2:F2']);
  assert.equal(result.arms.B.evidenceHit, 0);
  assert.equal(result.arms.B.unknownHandled, 0);
  assert.equal(result.arms.B.factWithoutCitation, 2);
  assert.deepEqual(result.unanswered, ['q3/B']);

  assert.throws(() => check({ manifest, questions, answers: [...answers, answers[0]] }), /duplicate answer/);
  assert.throws(() => check({ manifest, questions, answers: [{ question: 'q1', arm: 'C', cites: [] }] }), /stance/);
});

test('checkpoints recorded before the cut are valid, non-speculative citations', () => {
  const { root } = board();
  const takeover = prepare({ board: root, at: 'cp1', out: path.join(root, 'takeover') });
  const resume = prepare({ board: root, at: 'cp2', since: 'cp1', out: path.join(root, 'resume') });
  assert.deepEqual(takeover.checkpointsAtCut, ['cp1']);
  assert.deepEqual(resume.checkpointsAtCut, ['cp1', 'cp2']);

  const questions = [{ id: 'q1', text: 'Where were we?', evidence: ['cp1'] }];
  const answers = [
    { question: 'q1', arm: 'B', answer: 'cp1 says F1 supports H1', cites: ['cp1'], stance: 'fact' },
    { question: 'q1', arm: 'C', answer: 'cp2 says F2 contradicts H1', cites: ['cp2'], stance: 'fact' },
  ];
  const atCp1 = check({ manifest: takeover, questions, answers });
  assert.equal(atCp1.arms.B.citesValid, 1);
  assert.deepEqual(atCp1.arms.B.citesUnknownAtCut, []);
  assert.equal(atCp1.arms.B.evidenceHit, 1);
  assert.equal(atCp1.arms.B.guessAsFact, 0);
  assert.equal(atCp1.arms.B.factWithoutCitation, 0);
  // cp2 was written after the cp1 cut, so citing it there is still flagged.
  assert.deepEqual(atCp1.arms.C.citesUnknownAtCut, ['q1:cp2']);
  assert.equal(check({ manifest: resume, questions, answers }).arms.C.citesValid, 1);
});

test('only unsettled hypotheses and questions count as speculative', () => {
  const manifest = {
    schema: 'pinwhy.recovery-experiment.v1',
    nodesAtCut: {
      open: { type: 'hypothesis', status: 'open', confidence: 'suspected' },
      refuted: { type: 'hypothesis', status: 'refuted', confidence: null },
      refutedSuspected: { type: 'hypothesis', status: 'refuted', confidence: 'suspected' },
      confirmed: { type: 'hypothesis', status: 'confirmed', confidence: null },
      question: { type: 'question', status: 'open', confidence: null },
      suspectedFinding: { type: 'finding', status: 'open', confidence: 'suspected' },
    },
    checkpointsAtCut: [],
  };
  const ids = Object.keys(manifest.nodesAtCut);
  const questions = ids.map((id) => ({ id, text: id }));
  const answers = ids.map((id) => ({ question: id, arm: 'B', answer: id, cites: [id], stance: 'fact' }));
  const flagged = (cites) => check({
    manifest, questions: [{ id: 'q', text: 'q' }], answers: [{ question: 'q', arm: 'B', answer: 'x', cites, stance: 'fact' }],
  }).arms.B.guessAsFact;

  assert.equal(check({ manifest, questions, answers }).arms.B.guessAsFact, 3);
  for (const id of ['open', 'question', 'suspectedFinding']) assert.equal(flagged([id]), 1, id);
  for (const id of ['refuted', 'refutedSuspected', 'confirmed']) assert.equal(flagged([id]), 0, id);
  assert.equal(flagged(['open', 'refuted']), 0, 'a settled citation backs the fact');
});

test('the command line prints a per-arm table and fails with usage on bad input', () => {
  const { root } = board();
  const out = path.join(root, 'out');
  const prep = spawnSync(process.execPath, [SCRIPT, 'prepare', '--board', root, '--at', 'cp1', '--out', out], { encoding: 'utf8' });
  assert.equal(prep.status, 0, prep.stderr);
  assert.match(prep.stdout, /takeover at cp1 \(6\/10 events\)/);

  fs.writeFileSync(path.join(root, 'q.json'), JSON.stringify([{ id: 'q1', text: 'x', expected: 'unknown' }]));
  fs.writeFileSync(path.join(root, 'a.json'), JSON.stringify([{ question: 'q1', arm: 'A', cites: [], stance: 'unknown' }]));
  const run = spawnSync(process.execPath, [SCRIPT, 'check', '--manifest', path.join(out, 'manifest.json'),
    '--questions', path.join(root, 'q.json'), '--answers', path.join(root, 'a.json')], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);

  const bad = spawnSync(process.execPath, [SCRIPT, 'prepare', '--board', root], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--at is required[\s\S]*Usage:/);
});

function runnerFixture(t, mode = 'complete', extraArg = '') {
  const { root, file } = board();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const corpus = path.join(root, 'prepared');
  const manifest = prepare({ board: root, at: 'cp1', out: corpus });
  const questions = path.join(root, 'questions.json');
  fs.writeFileSync(questions, JSON.stringify([
    { id: 'evidence', text: 'What supports H1?', evidence: ['F1'] },
    { id: 'unknown', text: 'Is the cause reproduced?', expected: 'unknown' },
  ]));
  const adapter = path.join(root, 'adapter.mjs');
  fs.writeFileSync(adapter, `
    import fs from 'node:fs';
    let input = ''; for await (const chunk of process.stdin) input += chunk;
    const request = JSON.parse(input);
    const mode = process.argv[2];
    if (request.prompt.includes('"expected"') || request.prompt.includes('"evidence":')) throw new Error('grading key leaked');
    if (mode === 'timeout') await new Promise(() => setInterval(() => {}, 1000));
    if (mode === 'fail') { console.error('synthetic failure'); process.exit(7); }
    if (mode === 'malformed') { console.log('not json'); process.exit(0); }
    if (mode === 'large') { console.log('x'.repeat(10000)); process.exit(0); }
    if (mode === 'mutate') fs.appendFileSync(process.argv[3], 'changed');
    const answers = request.questions.map(({ id }) => ({ question: id, answer: 'not recorded', cites: [], stance: 'unknown' }));
    if (mode === 'incomplete') answers.pop();
    if (mode === 'duplicate') answers[1] = answers[0];
    if (mode === 'self-grade') answers[0].correct = true;
    if (mode === 'bad-cites') answers[0].cites = 'F1';
    const response = { model: mode === 'wrong-model' ? 'another-model' : request.model, answers };
    if (mode === 'metrics') { response.usage = { inputTokens: 42, outputTokens: 8 }; response.supplementaryReads = 0; }
    if (mode === 'bad-metrics') response.supplementaryReads = -1;
    if (mode === 'bad-usage') response.usage = { inputTokens: 'unknown' };
    console.log(JSON.stringify(response));
  `);
  const runner = path.join(root, 'runner.json');
  fs.writeFileSync(runner, JSON.stringify({ argv: [process.execPath, adapter, mode, extraArg || 'literal;$(never-execute)'], model: 'synthetic-fixed-model', parameters: { temperature: 0, seed: 123 } }));
  return { root, file, corpus, manifest, questions, runner,
    options: { manifest: path.join(corpus, 'manifest.json'), questions, runner, out: path.join(root, 'run'), repeats: 1 } };
}

test('repeated runner saves fixed inputs, balanced order, raw answers and mechanical checks without grading', async (t) => {
  const fixture = runnerFixture(t);
  const inputs = [fixture.file, fixture.questions, fixture.runner, ...['manifest.json', 'A-summary.md', 'B-nodes.json', 'C-graph.json'].map((name) => path.join(fixture.corpus, name))];
  const before = inputs.map((file) => fs.readFileSync(file));
  const result = await run({ ...fixture.options, repeats: 3, outputBudget: 777 });
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.runs.map(({ arm }) => arm), ['A', 'B', 'C', 'B', 'C', 'A', 'C', 'A', 'B']);
  for (const record of result.runs) {
    const dir = path.join(fixture.options.out, record.id);
    const request = JSON.parse(read(dir, 'request.json'));
    assert.equal(request.model, 'synthetic-fixed-model');
    assert.deepEqual(request.parameters, { temperature: 0, seed: 123 });
    assert.equal(request.budget.maxOutputTokens, 777);
    assert.equal(request.budget.materialTokens, fixture.manifest.budgetTokens);
    assert.deepEqual(request.questions.map(Object.keys), [['id', 'text'], ['id', 'text']]);
    assert.equal(request.prompt, read(dir, 'prompt.txt'));
    assert.ok(record.elapsedMs >= 0);
    assert.equal(record.sizes.stdinBytes, Buffer.byteLength(read(dir, 'request.json')));
    assert.equal(Object.hasOwn(record, 'usage'), false);
    assert.equal(Object.hasOwn(record, 'supplementaryReads'), false);
    const checked = JSON.parse(read(dir, 'check.json')).arms[record.arm];
    assert.equal(checked.graded, 0);
    assert.equal(checked.correct, 0);
    assert.equal(checked.missed, 1);
    assert.equal(checked.unknownHandled, 1);
    assert.equal(JSON.parse(read(dir, 'stdout.txt')).model, request.model);
  }
  inputs.forEach((file, index) => assert.deepEqual(fs.readFileSync(file), before[index]));
  assert.deepEqual(fs.readdirSync(path.join(fixture.root, '.pinwhy')), ['events.jsonl']);
  const repeated = await run({ ...fixture.options, repeats: 3, outputBudget: 777, out: path.join(fixture.root, 'second-run') });
  assert.equal(repeated.experimentId, result.experimentId);
  assert.deepEqual(repeated.runs.map(({ requestSha256 }) => requestSha256), result.runs.map(({ requestSha256 }) => requestSha256));
  await assert.rejects(run(fixture.options), /EEXIST/);
});

test('runner preserves supplied metrics and leaves absent measurements unknown', async (t) => {
  const fixture = runnerFixture(t, 'metrics');
  const result = await run(fixture.options);
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.runs[0].usage, { inputTokens: 42, outputTokens: 8 });
  assert.equal(result.runs[0].supplementaryReads, 0);
});

for (const [mode, message] of [
  ['malformed', /JSON response envelope/], ['incomplete', /incomplete/], ['duplicate', /duplicate answer/],
  ['self-grade', /human correctness/], ['bad-cites', /string cites/], ['wrong-model', /model identity/],
  ['bad-metrics', /supplementaryReads/], ['bad-usage', /usage must/], ['fail', /runner exited 7/],
]) {
  test(`runner records ${mode} failure without fabricating answers or scores`, async (t) => {
    const fixture = runnerFixture(t, mode);
    const result = await run(fixture.options);
    assert.equal(result.status, 'failed');
    assert.equal(result.runs.length, 3, 'each planned arm keeps its own failure record');
    for (const record of result.runs) {
      assert.equal(record.status, 'failed');
      assert.match(record.error, message);
      const dir = path.join(fixture.options.out, record.id);
      assert.ok(fs.existsSync(path.join(dir, 'stdout.txt')));
      assert.equal(fs.existsSync(path.join(dir, 'check.json')), false);
      assert.equal(fs.existsSync(path.join(dir, 'answers.json')), false);
    }
    assert.equal(JSON.parse(read(fixture.options.out, 'run-manifest.json')).status, 'failed');
  });
}

test('runner bounds execution time and captured output and records spawn failures', async (t) => {
  for (const mode of ['timeout', 'large', 'spawn']) {
    const fixture = runnerFixture(t, mode);
    if (mode === 'spawn') fs.writeFileSync(fixture.runner, JSON.stringify({ argv: [path.join(fixture.root, 'missing-executable')], model: 'synthetic-fixed-model' }));
    const result = await run({ ...fixture.options, timeoutMs: mode === 'timeout' ? 100 : 10000, maxBytes: mode === 'large' ? 256 : 4096 });
    assert.equal(result.status, 'failed');
    for (const record of result.runs) {
      assert.match(record.error, mode === 'timeout' ? /timeout/ : mode === 'large' ? /exceeded 256 bytes/ : /spawn:/);
      assert.ok(record.sizes.stdoutBytes <= (mode === 'large' ? 256 : 4096));
    }
  }
});

test('runner detects corpus changes before execution and during an adapter call', async (t) => {
  const fixture = runnerFixture(t);
  const material = path.join(fixture.corpus, 'A-summary.md');
  fs.appendFileSync(material, 'unexpected edit');
  await assert.rejects(run(fixture.options), /arm A changed after preparation/);
  assert.equal(fs.existsSync(fixture.options.out), false);

  const changed = runnerFixture(t, 'mutate');
  const config = JSON.parse(fs.readFileSync(changed.runner, 'utf8'));
  config.argv[3] = changed.questions;
  fs.writeFileSync(changed.runner, JSON.stringify(config));
  const result = await run(changed.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.runs.length, 1, 'stop mixing results after corpus mutation');
  assert.match(result.runs[0].error, /corpus inputs changed: questions.json/);
  assert.equal(JSON.parse(read(path.join(changed.options.out, 'corpus'), 'questions.json')).length, 2, 'immutable initial snapshot survives source mutation');
});

test('checker rejects malformed question keys and answer structures before tallying', (t) => {
  const fixture = runnerFixture(t);
  const questions = [{ id: 'q', text: 'Question' }];
  assert.throws(() => check({ manifest: fixture.manifest, questions: [...questions, ...questions], answers: [] }), /duplicate question/);
  assert.throws(() => check({ manifest: fixture.manifest, questions, answers: {} }), /answers must be an array/);
  assert.throws(() => check({ manifest: fixture.manifest, questions, answers: [null] }), /answers must be objects/);
  assert.throws(() => check({ manifest: fixture.manifest, questions, answers: [{ question: 'q', arm: 'A', stance: 'fact', cites: 'F1' }] }), /cites must be an array/);
});

test('run CLI returns failure status while preserving the inspectable manifest', (t) => {
  const fixture = runnerFixture(t, 'malformed');
  const result = spawnSync(process.execPath, [SCRIPT, 'run', '--manifest', fixture.options.manifest,
    '--questions', fixture.questions, '--runner', fixture.runner, '--out', fixture.options.out, '--repeats', '1', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'failed');
  assert.equal(JSON.parse(read(fixture.options.out, 'run-manifest.json')).runs.length, 3);
});

test('resume projections keep pre-patch cut payloads and raw-prefix identity isolated', (t) => {
  const { root, file } = board();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const events = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  events.splice(6, 0, { eventVersion: 1, eventId: 'patch-after-interruption', op: 'patch', id: 'H1',
    set: { title: 'H1 later refuted title', status: 'refuted', updated: 6 } });
  const source = `${events.map((event) => JSON.stringify(event)).join('\n')}\n`;
  fs.writeFileSync(file, source);
  const out = path.join(root, 'resume-patched');
  const manifest = prepare({ board: root, at: 'cp2', since: 'cp1', out });
  const graph = JSON.parse(read(out, 'C-graph.json'));
  assert.equal(graph.interrupted.currentFocus.id, 'H1');
  assert.equal(graph.interrupted.currentFocus.title, 'H1 title');
  assert.equal(graph.interrupted.currentFocus.status, 'open');
  assert.equal(graph.since.currentFocus.title, 'H1 later refuted title');
  assert.equal(graph.since.currentFocus.status, 'refuted');
  assert.equal(manifest.nodesAtCut.H1.status, 'refuted');
  const prefix = events.slice(0, manifest.cut.atEvent);
  assert.equal(manifest.cut.prefixSha256, crypto.createHash('sha256').update(prefix.map((event) => JSON.stringify(event)).join('\n')).digest('hex'));
  assert.equal(fs.readFileSync(file, 'utf8'), source);
  const interrupted = prepare({ board: root, at: 'cp1', out: path.join(root, 'interruption-only') });
  assert.equal(interrupted.nodesAtCut.H1.status, 'open');
});
