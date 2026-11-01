#!/usr/bin/env node
// Creates only isolated synthetic files under a fresh output directory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, run } from './recovery-experiment.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'blackboard-recovery-synthetic-'));
const board = path.join(root, 'synthetic-board');
fs.mkdirSync(path.join(board, '.blackboard'), { recursive: true });
const events = [
  { op: 'node', node: { id: 'H1', type: 'hypothesis', title: 'Synthetic cache hypothesis', status: 'open', confidence: 'suspected', ts: 1 } },
  { op: 'node', node: { id: 'F1', type: 'fact', title: 'Synthetic isolated observation', ts: 2 } },
  { op: 'edge', edge: { id: 'F1-supports-H1', from: 'F1', to: 'H1', kind: 'supports', ts: 3 } },
  { op: 'checkpoint', checkpoint: { id: 'synthetic-cut', agentId: 'agent:primary', at: 4, summary: 'Synthetic F1 supports H1; the cause remains unverified.' } },
].map((event, index) => ({ eventVersion: 1, eventId: `synthetic-${index}`, ...event }));
fs.writeFileSync(path.join(board, '.blackboard/events.jsonl'), `${events.map((event) => JSON.stringify(event)).join('\n')}\n`);
const corpus = path.join(root, 'prepared');
prepare({ board, at: 'synthetic-cut', out: corpus });
const questions = path.join(root, 'questions.json');
fs.writeFileSync(questions, JSON.stringify([
  { id: 'q-evidence', text: 'What supports H1?', evidence: ['F1'] },
  { id: 'q-unknown', text: 'Was the cause reproduced?', expected: 'unknown' },
]));
const runner = path.join(root, 'runner.json');
fs.writeFileSync(runner, JSON.stringify({ model: 'synthetic-unknown-v1',
  argv: [process.execPath, fileURLToPath(new URL('./lib/recovery-synthetic-runner.mjs', import.meta.url))] }));
const result = await run({ manifest: path.join(corpus, 'manifest.json'), questions, runner, out: path.join(root, 'runs'), repeats: 3 });
console.log(`Synthetic protocol smoke only; no model recovery claim: ${result.status}`);
console.log(`Artifacts: ${root}`);
if (result.status !== 'complete') process.exitCode = 1;
