#!/usr/bin/env node
// Recovery experiment helper (docs/RECOVERY_EXPERIMENT.md). Read-only: it
// replays a prefix of an event log into three recovery arms and tallies
// answers mechanically. It never writes the board or judges answer content.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { applyAll, emptyGraph } from '../lib/model.js';
import { readEvents } from '../lib/storage/event-log.js';
import { buildAgentContext, estimateTokensText } from '../lib/context.js';
import { runExperiment } from './lib/recovery-runner.mjs';

const SCHEMA = 'pinwhy.recovery-experiment.v1';
const ARMS = ['A', 'B', 'C'];
const SPECULATIVE_TYPES = new Set(['hypothesis', 'question']);
// A refuted or confirmed hypothesis is a recorded outcome, not a guess.
const SETTLED_STATUSES = new Set(['refuted', 'confirmed']);

const USAGE = `Usage:
  recovery-experiment.mjs prepare --board <root> --at <checkpoint|event:N> [--since <checkpoint>]
                                  [--budget 4000] [--agent agent:primary] [--summary-file f] --out <dir>
  recovery-experiment.mjs check --manifest <dir>/manifest.json --questions q.json --answers a.json [--json]
  recovery-experiment.mjs run --manifest <dir>/manifest.json --questions q.json --runner runner.json --out <new-dir>
                              [--prompt-file f] [--repeats 3] [--timeout-ms 120000] [--output-budget 2000] [--max-bytes 4194304]`;

function fail(message) {
  throw Object.assign(new Error(message), { usage: true });
}

function estimateTokens(value) {
  // Match context's compact-JSON accounting; pretty file indentation is not
  // part of this estimate. All arms use the same mixed-language text weights.
  return Math.ceil(estimateTokensText(JSON.stringify(value)));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// `ref` is a checkpoint id (the cut includes that checkpoint event) or
// `event:N` (the first N events). Returns the exclusive end index.
function cutIndex(events, ref, label) {
  const raw = String(ref || '');
  const count = raw.match(/^event:(\d+)$/);
  if (count) {
    const end = Number(count[1]);
    if (end < 1 || end > events.length) fail(`${label} is outside the log: ${raw} (log has ${events.length} events)`);
    return end;
  }
  const index = events.findIndex((ev) => ev.op === 'checkpoint' && ev.checkpoint?.id === raw);
  if (index < 0) fail(`${label} is not a checkpoint in the log: ${raw}`);
  return index + 1;
}

function packetAt(events, options) {
  // Reducer patches mutate their graph nodes; each cut must own its payloads.
  return buildAgentContext(applyAll(emptyGraph(), structuredClone(events)), { ...options, events });
}

function projectGraph(events, { sinceEnd, sinceRef, budgetTokens, agentId }) {
  const options = { budgetTokens, agentId };
  if (sinceEnd === null) return packetAt(events, options);
  return {
    interrupted: packetAt(events.slice(0, sinceEnd), options),
    since: packetAt(events, { ...options, since: sinceRef }),
  };
}

// Arm B is arm C minus every trace of a relation, so both arms carry the same
// nodes. Replaying without edge events would also drop the focus
// neighbourhood and compare different node sets.
function stripRelations(packet) {
  const copy = structuredClone(packet);
  copy.relations = [];
  copy.neighborhood = copy.neighborhood.map(({ node }) => ({ node }));
  copy.changes = copy.changes.filter((change) => !change.kind.startsWith('relation-'));
  delete copy.omitted.relations;
  copy.truncated = Object.keys(copy.omitted).length > 0;
  // Removing relations may change the estimate's own number of digits.
  let previous;
  do {
    previous = copy.estimatedTokens;
    copy.estimatedTokens = estimateTokens(copy);
  } while (copy.estimatedTokens !== previous);
  return copy;
}

function nodesOnly(material) {
  return material.since
    ? { interrupted: stripRelations(material.interrupted), since: stripRelations(material.since) }
    : stripRelations(material);
}

function armSize(material) {
  const packets = material.since ? [material.interrupted, material.since] : [material];
  return {
    chars: packets.reduce((sum, packet) => sum + JSON.stringify(packet).length, 0),
    estimatedTokens: packets.reduce((sum, packet) => sum + packet.estimatedTokens, 0),
    truncated: packets.some((packet) => packet.truncated),
    omitted: packets.map((packet) => packet.omitted),
    relations: packets.reduce((sum, packet) => sum + packet.relations.length, 0),
  };
}

function checkpointSummary(event, label) {
  const summary = event?.op === 'checkpoint' ? String(event.checkpoint?.summary || '').trim() : '';
  if (!summary) fail(`${label} has no checkpoint summary; pass --summary-file for arm A`);
  return summary;
}

function recordingCost(events) {
  const cost = { nodeEvents: 0, edgeEvents: 0, patchEvents: 0, checkpointEvents: 0, authoredChars: 0 };
  const text = (...values) => values.reduce((sum, value) => sum + String(value || '').length, 0);
  for (const ev of events) {
    if (ev.op === 'node') { cost.nodeEvents++; cost.authoredChars += text(ev.node?.title, ev.node?.detail); }
    if (ev.op === 'edge') { cost.edgeEvents++; cost.authoredChars += text(ev.edge?.label); }
    if (ev.op === 'patch') { cost.patchEvents++; cost.authoredChars += text(ev.set?.title, ev.set?.detail); }
    if (ev.op === 'checkpoint') { cost.checkpointEvents++; cost.authoredChars += text(ev.checkpoint?.summary); }
  }
  return cost;
}

export function prepare({ board, at, since = null, budget = 4000, agent = 'agent:primary', summaryFile = null, out }) {
  if (!at) fail('--at is required');
  if (!out) fail('--out is required');
  const root = path.resolve(board || process.cwd());
  const { events: log } = readEvents(root);
  if (!log.length) fail(`no events found under ${root}`);

  if (since !== null && /^event:/.test(String(since))) fail('--since must name a checkpoint');
  const end = cutIndex(log, at, '--at');
  const events = log.slice(0, end);
  const sinceEnd = since === null ? null : cutIndex(events, since, '--since');
  if (sinceEnd === end) fail('--since must be earlier than --at');
  const budgetTokens = Number(budget);
  if (!Number.isSafeInteger(budgetTokens) || budgetTokens < 256) fail('--budget must be an integer of at least 256');

  const summary = summaryFile
    ? fs.readFileSync(summaryFile, 'utf8').trim()
    : [
      ...(sinceEnd === null ? [] : [`## Before interruption (${since})\n\n${checkpointSummary(events[sinceEnd - 1], '--since')}`]),
      `${sinceEnd === null ? '' : `## Through ${at}\n\n`}${checkpointSummary(events[end - 1], '--at')}`,
    ].join('\n\n');
  const graph = projectGraph(events, { sinceEnd, sinceRef: since, budgetTokens, agentId: agent });
  const materials = { B: nodesOnly(graph), C: graph };

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'A-summary.md'), `${summary}\n`);
  fs.writeFileSync(path.join(out, 'B-nodes.json'), `${JSON.stringify(materials.B, null, 2)}\n`);
  fs.writeFileSync(path.join(out, 'C-graph.json'), `${JSON.stringify(materials.C, null, 2)}\n`);

  const atCut = applyAll(emptyGraph(), structuredClone(events));
  const manifest = {
    schema: SCHEMA,
    mode: sinceEnd === null ? 'takeover' : 'resume',
    cut: {
      at, atEvent: end, since, sinceEvent: sinceEnd, logEvents: log.length,
      prefixSha256: crypto.createHash('sha256').update(events.map((ev) => JSON.stringify(ev)).join('\n')).digest('hex'),
    },
    agentId: agent,
    budgetTokens,
    nodesAtCut: Object.fromEntries(Object.values(atCut.nodes).map((node) => [node.id, {
      type: node.type, status: node.status || null, confidence: node.confidence || null,
    }])),
    checkpointsAtCut: events.filter((ev) => ev.op === 'checkpoint').map((ev) => ev.checkpoint.id),
    arms: {
      // A is authored plain text, not a JSON string: count its actual newlines
      // and quotes, without JSON escaping or the file's final separator newline.
      A: { file: 'A-summary.md', source: summaryFile ? 'summary-file' : 'checkpoint-summary', chars: summary.length, estimatedTokens: Math.ceil(estimateTokensText(summary)) },
      B: { file: 'B-nodes.json', ...armSize(materials.B) },
      C: { file: 'C-graph.json', ...armSize(materials.C) },
    },
    cost: recordingCost(events),
  };
  for (const arm of ARMS) {
    manifest.arms[arm].sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(out, manifest.arms[arm].file))).digest('hex');
  }
  fs.writeFileSync(path.join(out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

// Checkpoints are authored records, so citing one is never speculative.
function isSpeculative(node) {
  if (!node || SETTLED_STATUSES.has(node.status)) return false;
  return node.confidence === 'suspected' || SPECULATIVE_TYPES.has(node.type);
}

export function check({ manifest, questions, answers }) {
  if (manifest?.schema !== SCHEMA) fail(`manifest schema must be ${SCHEMA}`);
  if (!Array.isArray(questions) || !questions.length) fail('questions must be a nonempty array');
  const questionIds = new Set();
  for (const question of questions) {
    if (!question || typeof question.id !== 'string' || !question.id || typeof question.text !== 'string' || !question.text.trim()) fail('questions need nonempty id and text');
    if (questionIds.has(question.id)) fail(`duplicate question: ${question.id}`);
    questionIds.add(question.id);
    if (question.evidence !== undefined && (!Array.isArray(question.evidence) || question.evidence.some((id) => typeof id !== 'string' || !id))) fail(`invalid evidence for ${question.id}`);
    if (question.expected !== undefined && question.expected !== 'unknown') fail(`invalid expected stance for ${question.id}`);
  }
  if (!Array.isArray(answers)) fail('answers must be an array');
  const byId = new Map(questions.map((q) => [q.id, q]));
  const nodes = manifest.nodesAtCut || {};
  const checkpoints = new Set(manifest.checkpointsAtCut || []);
  const atCut = (id) => Boolean(nodes[id]) || checkpoints.has(id);
  const seen = new Set();
  const arms = Object.fromEntries(ARMS.map((arm) => [arm, {
    answered: 0, graded: 0, correct: 0,
    cites: 0, citesValid: 0, citesUnknownAtCut: [],
    evidenceQuestions: 0, evidenceHit: 0,
    unknownExpected: 0, unknownHandled: 0, missed: 0,
    guessAsFact: 0, factWithoutCitation: 0,
  }]));

  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) fail('answers must be objects');
    if (answer.cites !== undefined && (!Array.isArray(answer.cites) || answer.cites.some((id) => typeof id !== 'string' || !id))) fail('answer cites must be an array of nonempty IDs');
    if (answer.correct !== undefined && typeof answer.correct !== 'boolean') fail('human correctness must be a boolean when supplied');
    const question = byId.get(answer.question);
    if (!question) fail(`answer refers to an unknown question: ${answer.question}`);
    if (!ARMS.includes(answer.arm)) fail(`answer for ${answer.question} has an unknown arm: ${answer.arm}`);
    if (!['fact', 'guess', 'unknown'].includes(answer.stance)) fail(`answer for ${answer.question}/${answer.arm} needs stance fact, guess or unknown`);
    const key = `${answer.question}/${answer.arm}`;
    if (seen.has(key)) fail(`duplicate answer: ${key}`);
    seen.add(key);

    const tally = arms[answer.arm];
    const cites = [...new Set(answer.cites || [])];
    const valid = cites.filter(atCut);
    tally.answered++;
    if (typeof answer.correct === 'boolean') { tally.graded++; if (answer.correct) tally.correct++; }
    tally.cites += cites.length;
    tally.citesValid += valid.length;
    tally.citesUnknownAtCut.push(...cites.filter((id) => !atCut(id)).map((id) => `${answer.question}:${id}`));

    if (question.expected === 'unknown') {
      tally.unknownExpected++;
      if (answer.stance === 'unknown') tally.unknownHandled++;
    } else if (answer.stance === 'unknown') {
      tally.missed++;
    }
    if (question.evidence?.length) {
      tally.evidenceQuestions++;
      if (valid.some((id) => question.evidence.includes(id))) tally.evidenceHit++;
    }
    if (answer.stance === 'fact') {
      if (!valid.length) tally.factWithoutCitation++;
      else if (valid.every((id) => isSpeculative(nodes[id]))) tally.guessAsFact++;
    }
  }

  const unanswered = ARMS.flatMap((arm) => questions
    .filter((q) => !seen.has(`${q.id}/${arm}`) && answers.some((a) => a.arm === arm))
    .map((q) => `${q.id}/${arm}`));
  return { schema: `${SCHEMA}.check`, mode: manifest.mode, questions: questions.length, arms, unanswered };
}

function renderCheck(result) {
  const rows = [
    ['Correct (human graded)', (t) => `${t.correct}/${t.graded}`],
    ['Valid citations', (t) => `${t.citesValid}/${t.cites}`],
    ['Evidence hits', (t) => `${t.evidenceHit}/${t.evidenceQuestions}`],
    ['Unknowns acknowledged', (t) => `${t.unknownHandled}/${t.unknownExpected}`],
    ['Unanswered', (t) => String(t.missed)],
    ['Guesses stated as facts', (t) => String(t.guessAsFact)],
    ['Uncited factual claims', (t) => String(t.factWithoutCitation)],
  ];
  const lines = [`Mode: ${result.mode} · Questions: ${result.questions}`, '', `| Metric | ${ARMS.join(' | ')} |`, `| --- |${ARMS.map(() => ' --- |').join('')}`];
  for (const [label, cell] of rows) lines.push(`| ${label} | ${ARMS.map((arm) => cell(result.arms[arm])).join(' | ')} |`);
  for (const arm of ARMS) {
    const bad = result.arms[arm].citesUnknownAtCut;
    if (bad.length) lines.push('', `${arm} cited nodes absent at the selected checkpoint: ${bad.join(', ')}`);
  }
  if (result.unanswered.length) lines.push('', `Unanswered: ${result.unanswered.join(', ')}`);
  return lines.join('\n');
}

export function run(options) {
  return runExperiment({ ...options, checkAnswers: check });
}

async function main(argv) {
  const [command, ...rest] = argv;
  const { values } = parseArgs({
    args: rest,
    options: {
      board: { type: 'string' }, at: { type: 'string' }, since: { type: 'string' },
      budget: { type: 'string' }, agent: { type: 'string' }, 'summary-file': { type: 'string' }, out: { type: 'string' },
      manifest: { type: 'string' }, questions: { type: 'string' }, answers: { type: 'string' }, json: { type: 'boolean' },
      runner: { type: 'string' }, 'prompt-file': { type: 'string' }, repeats: { type: 'string' },
      'timeout-ms': { type: 'string' }, 'output-budget': { type: 'string' }, 'max-bytes': { type: 'string' },
    },
  });
  if (command === 'prepare') {
    const manifest = prepare({
      board: values.board, at: values.at, since: values.since ?? null, budget: values.budget ?? 4000,
      agent: values.agent ?? 'agent:primary', summaryFile: values['summary-file'] ?? null, out: values.out,
    });
    const { A, B, C } = manifest.arms;
    console.log(`${manifest.mode} at ${manifest.cut.at} (${manifest.cut.atEvent}/${manifest.cut.logEvents} events) → ${values.out}`);
    const size = (arm) => `${arm.chars} chars ~${arm.estimatedTokens} tokens${arm.truncated ? ' (truncated)' : ''}`;
    console.log(`A ${size(A)} · B ${size(B)} · C ${size(C)} · budget ${manifest.budgetTokens}`);
    return;
  }
  if (command === 'check') {
    if (!values.manifest || !values.questions || !values.answers) fail('check needs --manifest, --questions and --answers');
    const result = check({ manifest: readJson(values.manifest), questions: readJson(values.questions), answers: readJson(values.answers) });
    console.log(values.json ? JSON.stringify(result, null, 2) : renderCheck(result));
    return;
  }
  if (command === 'run') {
    const result = await run({ manifest: values.manifest, questions: values.questions, runner: values.runner,
      promptFile: values['prompt-file'], out: values.out, repeats: values.repeats ?? 3,
      timeoutMs: values['timeout-ms'] ?? 120000, outputBudget: values['output-budget'] ?? 2000,
      maxBytes: values['max-bytes'] ?? 4194304 });
    console.log(values.json ? JSON.stringify(result, null, 2) : `${result.status}: ${result.runs.length} runs → ${values.out}`);
    if (result.status !== 'complete') process.exitCode = 1;
    return;
  }
  fail(command ? `unknown command: ${command}` : 'missing command');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    if (error.usage) console.error(USAGE);
    process.exitCode = 1;
  }
}
