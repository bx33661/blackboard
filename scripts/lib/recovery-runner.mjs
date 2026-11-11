import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { estimateTokensText } from '../../lib/context.js';

const ARMS = ['A', 'B', 'C'];
const SCHEMA = 'pinwhy.recovery-run.v1';
const DEFAULT_PROMPT = 'Recover only what the supplied material records. Answer every question exactly once. Use fact, guess, or unknown for stance; say unknown when the material does not establish the answer. Cite only recorded node or checkpoint IDs. Return the response envelope required by the adapter protocol. Do not grade your answers or consult other sources.';
const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const json = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const save = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function positive(value, name) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${name} must be a positive integer`);
  return n;
}

function metric(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function invoke(argv, input, { timeoutMs, maxBytes, cwd }) {
  return new Promise((resolve) => {
    const start = performance.now();
    const child = spawn(argv[0], argv.slice(1), { shell: false, cwd, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks = { stdout: [], stderr: [] };
    const sizes = { stdout: 0, stderr: 0 };
    let failure = null;
    const stop = (reason) => {
      failure ||= reason;
      if (process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); }
      } else child.kill('SIGKILL');
      // A descendant may inherit the pipes. Do not let it hold the experiment open.
      child.stdout.destroy();
      child.stderr.destroy();
      child.stdin.destroy();
    };
    const timer = setTimeout(() => stop('timeout'), timeoutMs);
    for (const stream of ['stdout', 'stderr']) {
      child[stream].on('data', (chunk) => {
        const available = Math.max(0, maxBytes - sizes[stream]);
        chunks[stream].push(chunk.subarray(0, available));
        sizes[stream] += chunk.length;
        if (sizes[stream] > maxBytes) stop(`${stream} exceeded ${maxBytes} bytes`);
      });
    }
    child.on('error', (error) => { failure ||= `spawn: ${error.message}`; });
    child.stdin.on('error', (error) => { failure ||= `stdin: ${error.message}`; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(chunks.stdout).toString('utf8'),
        stderr: Buffer.concat(chunks.stderr).toString('utf8'),
        elapsedMs: performance.now() - start, exitCode: code, signal,
        failure: failure || (code === 0 ? null : `runner exited ${code ?? signal}`),
      });
    });
    child.stdin.end(input);
  });
}

function validateResponse(raw, model, questions, arm, checkAnswers, manifest) {
  let response;
  try { response = JSON.parse(raw); } catch { throw new Error('runner stdout must be one JSON response envelope'); }
  if (!object(response) || response.model !== model) throw new Error('runner model identity must equal the fixed requested model');
  if (!Array.isArray(response.answers)) throw new Error('runner response needs an answers array');
  for (const answer of response.answers) {
    if (!object(answer) || typeof answer.answer !== 'string' || !answer.answer.trim()
      || !Array.isArray(answer.cites) || answer.cites.some((id) => typeof id !== 'string' || !id)
      || Object.hasOwn(answer, 'correct') || Object.hasOwn(answer, 'arm')) {
      throw new Error('runner answers need nonempty answer text and string cites; arm and human correctness must not be supplied');
    }
  }
  const answers = response.answers.map((answer) => ({ ...answer, arm }));
  const checked = checkAnswers({ manifest, questions, answers });
  if (answers.length !== questions.length || checked.unanswered.length) throw new Error('runner response is incomplete: every question needs exactly one answer');
  if (Object.hasOwn(response, 'supplementaryReads') && !metric(response.supplementaryReads)) throw new Error('supplementaryReads must be a nonnegative integer when supplied');
  if (Object.hasOwn(response, 'usage') && (!object(response.usage) || !Object.keys(response.usage).length
    || Object.values(response.usage).some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0))) {
    throw new Error('usage must contain nonnegative numeric measurements when supplied');
  }
  return { response, answers, checked };
}

// This development tool consumes only a prepared corpus. It never opens a board.
export async function runExperiment({ manifest: manifestFile, questions: questionsFile, runner: runnerFile,
  promptFile = null, out, repeats = 3, timeoutMs = 120000, outputBudget = 2000, maxBytes = 4 * 1024 * 1024, checkAnswers }) {
  if (!manifestFile || !questionsFile || !runnerFile || !out) throw new Error('run needs --manifest, --questions, --runner and --out');
  repeats = positive(repeats, 'repeats');
  timeoutMs = positive(timeoutMs, 'timeout-ms');
  outputBudget = positive(outputBudget, 'output-budget');
  maxBytes = positive(maxBytes, 'max-bytes');
  const manifest = json(manifestFile);
  if (manifest.schema !== 'pinwhy.recovery-experiment.v1') throw new Error('unsupported prepared manifest schema');
  positive(manifest.budgetTokens, 'prepared material budget');
  const questions = json(questionsFile);
  // Reuse the checker validation before creating any output or starting a process.
  checkAnswers({ manifest, questions, answers: [] });
  const runner = json(runnerFile);
  if (!object(runner) || !Array.isArray(runner.argv) || !runner.argv.length
    || runner.argv.some((arg) => typeof arg !== 'string' || !arg || arg.includes('\0'))
    || typeof runner.model !== 'string' || !runner.model.trim()
    || (runner.parameters !== undefined && !object(runner.parameters))) {
    throw new Error('runner config needs argv (nonempty string array), model, and optional parameters object');
  }
  const prompt = promptFile ? fs.readFileSync(promptFile, 'utf8') : DEFAULT_PROMPT;
  if (!prompt.trim()) throw new Error('prompt must not be empty');
  const sources = new Map();
  const addSource = (name, file) => {
    if (sources.has(name)) throw new Error(`duplicate corpus filename: ${name}`);
    const absolute = fs.realpathSync(file);
    const bytes = fs.readFileSync(absolute);
    sources.set(name, { absolute, bytes, sha256: sha256(bytes) });
    return bytes;
  };
  addSource('manifest.json', manifestFile);
  addSource('questions.json', questionsFile);
  addSource('runner.json', runnerFile);
  if (promptFile) addSource('prompt.txt', promptFile);
  const materials = {};
  for (const arm of ARMS) {
    const file = manifest.arms?.[arm]?.file;
    if (typeof file !== 'string' || path.basename(file) !== file || file === '.' || file === '..') throw new Error(`invalid prepared file for arm ${arm}`);
    materials[arm] = addSource(file, path.join(path.dirname(manifestFile), file)).toString('utf8');
    if (manifest.arms[arm].sha256 && sha256(materials[arm]) !== manifest.arms[arm].sha256) throw new Error(`prepared arm ${arm} changed after preparation`);
  }
  const output = path.resolve(out);
  // The output must be a fresh sibling/directory, never a source directory or its ancestor.
  for (const { absolute } of sources.values()) {
    const relative = path.relative(output, absolute);
    if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('output directory must not contain corpus inputs');
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(output);
  const corpusDir = path.join(output, 'corpus');
  fs.mkdirSync(corpusDir);
  for (const [name, source] of sources) fs.writeFileSync(path.join(corpusDir, name), source.bytes, { flag: 'wx' });
  fs.writeFileSync(path.join(output, 'prompt.txt'), prompt, { flag: 'wx' });
  const publicQuestions = questions.map(({ id, text }) => ({ id, text }));
  const plan = Array.from({ length: repeats }, (_, repeat) => ARMS.map((_, index) => ({
    repeat: repeat + 1, arm: ARMS[(index + repeat) % ARMS.length],
  }))).flat();
  const identity = { schema: SCHEMA, runner, prompt, outputBudget, materialBudget: manifest.budgetTokens,
    repeats, timeoutMs, maxBytes, plan, sources: Object.fromEntries([...sources].map(([name, source]) => [name, source.sha256])) };
  const report = { schema: SCHEMA, experimentId: sha256(JSON.stringify(identity)), status: 'running',
    settings: identity, prepared: { mode: manifest.mode, cut: manifest.cut, arms: manifest.arms, cost: manifest.cost }, runs: [] };
  const reportFile = path.join(output, 'run-manifest.json');
  const flush = () => fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  flush();
  const changedSources = () => [...sources].filter(([, source]) => {
    try { return sha256(fs.readFileSync(source.absolute)) !== source.sha256; } catch { return true; }
  }).map(([name]) => name);
  for (const item of plan) {
    const id = `${String(item.repeat).padStart(3, '0')}-${item.arm}`;
    const dir = path.join(output, id);
    fs.mkdirSync(dir);
    const fullPrompt = `${prompt}\n\nQuestions:\n${JSON.stringify(publicQuestions)}\n\nRecovery material:\n${materials[item.arm]}`;
    const request = { schema: 'pinwhy.recovery-run.request.v1', model: runner.model,
      parameters: runner.parameters || {}, budget: { maxOutputTokens: outputBudget, materialTokens: manifest.budgetTokens },
      questions: publicQuestions, prompt: fullPrompt };
    const input = `${JSON.stringify(request)}\n`;
    fs.writeFileSync(path.join(dir, 'prompt.txt'), fullPrompt, { flag: 'wx' });
    fs.writeFileSync(path.join(dir, 'request.json'), input, { flag: 'wx' });
    const record = { id, ...item, model: runner.model, status: 'running',
      sizes: { materialBytes: Buffer.byteLength(materials[item.arm]), promptChars: fullPrompt.length,
        promptBytes: Buffer.byteLength(fullPrompt), estimatedPromptTokens: Math.ceil(estimateTokensText(fullPrompt)), stdinBytes: Buffer.byteLength(input) },
      promptSha256: sha256(fullPrompt), requestSha256: sha256(input) };
    report.runs.push(record);
    flush();
    const result = await invoke(runner.argv, input, { timeoutMs, maxBytes, cwd: dir });
    fs.writeFileSync(path.join(dir, 'stdout.txt'), result.stdout, { flag: 'wx' });
    fs.writeFileSync(path.join(dir, 'stderr.txt'), result.stderr, { flag: 'wx' });
    Object.assign(record, { elapsedMs: result.elapsedMs, exitCode: result.exitCode, signal: result.signal,
      sizes: { ...record.sizes, stdoutBytes: Buffer.byteLength(result.stdout), stderrBytes: Buffer.byteLength(result.stderr) } });
    try {
      if (result.failure) throw new Error(result.failure);
      const { response, answers, checked } = validateResponse(result.stdout, runner.model, questions, item.arm, checkAnswers, manifest);
      if (Object.hasOwn(response, 'usage')) record.usage = response.usage;
      if (Object.hasOwn(response, 'supplementaryReads')) record.supplementaryReads = response.supplementaryReads;
      save(path.join(dir, 'answers.json'), answers);
      save(path.join(dir, 'check.json'), checked);
      record.status = 'complete';
    } catch (error) {
      record.status = 'failed';
      record.error = error.message;
    }
    const changed = changedSources();
    if (changed.length) { record.status = 'failed'; record.error = `corpus inputs changed: ${changed.join(', ')}`; }
    flush();
    if (changed.length) break;
  }
  report.status = report.runs.length === plan.length && report.runs.every((run) => run.status === 'complete') ? 'complete' : 'failed';
  flush();
  return report;
}
