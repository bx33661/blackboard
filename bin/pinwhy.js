#!/usr/bin/env node
// Pinwhy — 把 Agent 的探索路径外化成递进图状态。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  EVENT_VERSION,
  TYPE_LABEL,
  NODE_STATES,
  SEVERITIES,
  CONFIDENCE_LEVELS,
  EDGE_LABEL,
  INTENT_STATUS,
  currentCursor,
  resolveRef,
  projectNode,
} from '../lib/model.js';
import {
  paths,
  ensure,
  isInitialized,
  findRoot,
  protectBoard,
  LIMITS,
  inspectInputLengths,
  addNode,
  addEdge,
  addCheckpoint,
  patchNode,
  removeNode,
  removeEdge,
  defaultAgentId,
  moveCursor,
  setMeta,
  reset,
  replay,
  readState,
  readEvents,
  readEventsAsOf,
  stats,
  writeBatch,
  checkBatch,
} from '../lib/store.js';
import { BATCH_LIMITS, batchTooLarge, parseBatch } from '../lib/batch.js';
import { validateRequestId } from '../lib/receipts.js';
import { buildDigest, neighborsOf, tail } from '../lib/digest.js';
import { buildAgentContext, renderAgentContext } from '../lib/context.js';
import { searchGraph, matchesNodeFields } from '../lib/search.js';
import { isOpenThread, isCurrentFinding } from '../lib/semantics.js';
import { DEFAULT_PORT, resolvePort, rememberViewerPort, probeViewer, stopViewer, viewerUrl } from '../lib/service.js';
import { stableCliPath, cliOrigin } from '../lib/release.js';
import { buildInfo } from '../lib/build-info.js';
import { ERROR_CODES, ERROR_SCHEMA, OUTPUTS, WRITE_TARGETS } from '../lib/contracts.js';
import { closest, parseArgs } from '../lib/cli/args.js';
import { COMMANDS } from '../lib/cli/commands.js';
import { usage } from '../lib/cli/help.js';
import { commandHelp, commandHelpFor } from '../lib/cli/command-help.js';
import { C, colorType, shortDetail, nodeLine, activityLine, serveBanner } from '../lib/cli/format.js';
import { renderStatus, renderDoctor, renderSetup, renderService } from '../lib/cli/panels.js';
import { renderNodeList, renderSearch, renderNodeDetail, renderHere } from '../lib/cli/records.js';
import { renderHistory, renderChanges } from '../lib/cli/history-view.js';
import { renderVersion, renderReleaseList, renderReleaseCheck, renderReleaseResult, renderFileResult } from '../lib/cli/results.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// Integrations record this path. Started through an installed release it is the
// stable `current` path, so an upgrade does not leave them on the old version.
const CLI = stableCliPath(path.join(ROOT, 'bin', 'pinwhy.js'));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/** Resolve a typed id, failing with the candidate list instead of a stack trace. */
function refOrFail(map, ref, label = 'node') {
  try {
    return resolveRef(map, ref, label);
  } catch (e) {
    return fail(e);
  }
}

/** Handlers throw; the top-level boundary alone formats failures and sets exit status. */
function fail(problem, details = {}) {
  throw Object.assign(problem instanceof Error ? problem : new Error(problem), {
    ...(problem instanceof Error ? {} : { code: 'invalid_usage' }), ...details,
  });
}

function printError(error) {
  if (invocation.json) {
    const code = ERROR_CODES.includes(error.code) ? error.code : error.line ? 'invalid_batch' : 'error';
    const known = Object.fromEntries(['line', 'column', 'suggestion', 'candidates', 'requestId', 'fields', 'cwd', 'committed', 'result']
      .filter((key) => error[key] !== undefined).map((key) => [key, error[key]]));
    console.error(JSON.stringify({ schema: ERROR_SCHEMA, code, ...known, message: error.message,
      ...(process.env.PINWHY_DEBUG ? { stack: error.stack } : {}),
    }));
  } else console.error(process.env.PINWHY_DEBUG ? error.stack : `${C.red('Error:')} ${error.message}`);
  process.exitCode = 1;
}

function warn(message) {
  if (invocation.json) invocation.warnings.push(message);
  else console.error(message);
}

function unknownCommand(name) {
  const suggestion = closest(name, Object.keys(COMMANDS).filter((key) => !key.startsWith('-')));
  return fail(`Unknown command ${name}${suggestion ? `; did you mean ${suggestion}?` : ''} (run pinwhy help for usage)`, {
    code: 'unknown_command', ...(suggestion ? { suggestion } : {}),
  });
}

// Set once from the command line: --cwd names the board, --no-init forbids creating one, --json shapes failures.
const invocation = { root: null, noInit: false, json: false, warnings: [] };

function cwd() {
  if (invocation.root) return invocation.root;
  const projectCwd = process.env.PINWHY_CWD;
  if (projectCwd) return path.resolve(projectCwd);
  // Like git: a command run from a subdirectory belongs to the nearest board above it.
  return findRoot(process.cwd()) || process.cwd();
}

/** Tell the Agent when something it wrote was shortened; silently losing text would be worse. */
function warnTruncated(result, prefix = '') {
  const fields = result?.truncated;
  if (!fields?.length) return;
  const names = { title: 'title', detail: 'detail', label: 'relation label', summary: 'summary' };
  const parts = fields.map((f) => `${names[f] || f} (limit: ${LIMITS[f]} characters)`);
  warn(`${prefix}${C.yel('Warning:')} ${parts.join(', ')} exceeded the limit and were truncated; split long content into nodes or save it to a file.`);
}

/** Who this write is from: --agent, else PINWHY_AGENT, else agent:primary; both spellings normalize alike. */
function agentOf(flags) {
  return flags.agent ? defaultAgentId({ PINWHY_AGENT: flags.agent }) : defaultAgentId();
}

/** Validate board-independent input before any handler can initialize or install. */
function validateInvocation(cmd, args, flags) {
  try { validateRequestId(flags['request-id']); }
  catch (error) { fail(error, { code: 'invalid_value' }); }
  const checkpoint = ['checkpoint', 'compact'].includes(cmd);
  const node = cmd === 'node' || ['start', 'goal', 'intent', 'fact', 'vuln', 'hint'].includes(cmd);
  const text = {
    ...(!checkpoint && flags.title ? { title: flags.title } : {}),
    ...(node ? { title: args.slice(cmd === 'node' ? 2 : 0).join(' ').trim() } : {}),
    ...(flags.detail ? { detail: flags.detail } : {}),
    ...(flags.label ? { label: flags.label } : {}),
    ...(checkpoint ? { summary: flags.summary || flags.title || args.join(' ').trim() } : {}),
  };
  inspectInputLengths(text, !!flags['no-truncate']);
}

/** Under --no-init a missing board is an error; nothing, not even the directory, is created. */
function refuseMissingBoard() {
  if (invocation.noInit && !isInitialized(cwd())) {
    fail(`${cwd()} has no .pinwhy/; --no-init prevents creating a board. Check --cwd / PINWHY_CWD, or run pinwhy init first.`, { code: 'board_missing', cwd: cwd() });
  }
}

function needInit() {
  refuseMissingBoard();
  if (!isInitialized(cwd())) {
    warn(`${C.yel('Warning:')} No .pinwhy/ in the current directory; initialized automatically.`);
  }
  return ensure(cwd());
}

/** Read-only commands must not create state as a side effect. */
function needInitRead() {
  if (!isInitialized(cwd())) {
    fail('No .pinwhy/ in the current directory. Run pinwhy init --title "Project goal" first.', { code: 'board_missing', cwd: cwd() });
  }
  return paths(cwd());
}

/**
 * Print a --json output. An object leads with its schema, which always names
 * the output, even if a record replayed from the log carries a field of that name.
 */
function out(flags, obj, output) {
  if (!flags.json) return;
  const body = output?.shape === 'object' ? Object.assign({ schema: output.schema }, obj, { schema: output.schema }) : obj;
  console.log(JSON.stringify(body));
}

/** The log a read projects: the whole of it, or cut right after --as-of's checkpoint. */
function readSource(flags) {
  if (flags['as-of'] === undefined) return readEvents(cwd());
  try { return readEventsAsOf(cwd(), flags['as-of']); } catch (error) { return fail(error); }
}

/** Human output says it shows the past; --json stays identical to reading a log cut at that point. */
function noteAsOf(source, flags) {
  if (!source.asOf || flags.json) return;
  const { id, at } = source.asOf;
  console.error(C.dim(`As of ${id}${Number.isFinite(at) ? ` (${new Date(at).toISOString()})` : ''} · read-only history; later records are excluded`));
}


async function cmdServe(args, flags) {
  const started = performance.now();
  const target = cwd();
  const port = resolvePort({ cwd: target, port: flags.port, allowZero: true });
  needInit();
  const { startServer } = await import('../lib/server.js');
  const server = await startServer({ cwd: target, port, open: !!flags.open, readOnly: !!flags['read-only'] });
  // Signal handlers run between synchronous log writes, so stopping never cuts one in half.
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(0));
  try {
    rememberViewerPort(target, server.address().port);
  } catch (error) {
    server.close();
    throw error;
  }
  console.log(serveBanner({
    version: VERSION, url: viewerUrl(server.address().port), cwd: fs.realpathSync(target),
    readOnly: !!flags['read-only'], elapsedMs: performance.now() - started,
  }));
}

async function cmdStop(args, flags) {
  const p = needInitRead();
  const { workspaceServiceStatus, stopWorkspaceService } = await import('../lib/setup.js');
  let result;
  try {
    const service = flags.port ? null : workspaceServiceStatus({ cwd: p.cwd });
    // Stop the registration itself so the service manager cannot restart the viewer.
    if (service?.currentProject && service.loaded) {
      stopWorkspaceService({ cwd: p.cwd });
      const port = service.port ?? resolvePort({ cwd: p.cwd });
      result = { state: 'stopped', via: service.mode, port, url: viewerUrl(port) };
    } else result = await stopViewer({ cwd: p.cwd, port: flags.port });
  } catch (error) { return fail(error); }
  if (flags.json) return out(flags, { ...result, cwd: p.cwd });
  console.log(result.state === 'stopped' ? `${C.grn('Stopped')} ${result.url}` : `The viewer for this project is not running (${result.url})`);
}


async function cmdExport(args, flags) {
  needInitRead();
  const { renderExport } = await import('../lib/export.js');
  const format = flags.format || 'html';
  const extension = { html: 'html', markdown: 'md', mermaid: 'mmd', sarif: 'sarif' }[format];
  if (!extension) fail('--format must be html|markdown|mermaid|sarif');
  const abs = path.resolve(cwd(), flags.out || `pinwhy.${extension}`);
  const board = paths(cwd());
  let actual = abs, target;
  try { actual = fs.realpathSync(abs); target = fs.statSync(abs); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if ([abs, actual].some((file) => file.split(path.sep).includes(path.basename(board.root)))) fail('Export files cannot be written to the board data directory');
  if (target) {
    for (const file of [board.events, board.state, board.config, board.digest]) {
      if (!fs.existsSync(file)) continue;
      const source = fs.statSync(file);
      if (target.dev === source.dev && target.ino === source.ino) fail('Export files cannot overwrite board data or aliases of its files');
    }
  }
  const source = readSource(flags);
  const relatedTo = flags['related-to'] ? refOrFail(replay(cwd(), source).nodes, flags['related-to']) : undefined;
  const content = renderExport({
    cwd: cwd(), source: flags['as-of'] === undefined ? undefined : source, format, version: VERSION, query: args.join(' '),
    type: flags.type, status: flags.status, severity: flags.sev, confidence: flags.confidence,
    tags: flags.tag, relation: flags.rel, relatedTo, sort: flags.sort, groupBy: flags['group-by'],
    maxNodes: flags['max-nodes'] === undefined ? undefined : Number(flags['max-nodes']),
  });
  fs.writeFileSync(abs, content);
  if (flags.json) return out(flags, { file: abs, format }, OUTPUTS.export);
  console.log(renderFileResult('export', { file: abs, format, ...(source.asOf ? { asOf: source.asOf.id } : {}) }));
}

async function cmdDoctor(args, flags) {
  const { diagnose } = await import('../lib/doctor.js');
  const report = await diagnose({ cwd: cwd(), cli: CLI, port: flags.port, share: !!flags.share });
  if (flags.json) return out(flags, report, OUTPUTS.doctor);
  console.log(renderDoctor(report));
}

async function cmdStatus(args, flags) {
  const p = needInitRead();
  const port = resolvePort({ cwd: p.cwd, port: flags.port });
  const g = replay(p.cwd);
  const s = stats(g);
  const state = readState(p.cwd);
  const agentId = agentOf(flags);
  const cursorId = currentCursor(g, agentId);
  const cursor = cursorId ? g.nodes[cursorId] : null;
  const { integrationStatus } = await import('../lib/hooks.js');
  const integration = integrationStatus(p.cwd);
  const viewer = await probeViewer({ cwd: p.cwd, port });
  const latestNode = Object.values(g.nodes).reduce((latest, node) =>
    !latest || (node.updated || node.ts || 0) > (latest.updated || latest.ts || 0) ? node : latest, null);
  if (flags.json) return out(flags, {
    stats: s, cursor, cursors: g.cursors, title: g.meta.title || state.title, session: state.session,
    cwd: p.cwd, agentId, viewer, integration, latestNode: projectNode(latestNode),
  }, OUTPUTS.status);

  console.log(renderStatus({
    stats: s, cursor, title: g.meta.title || state.title, cwd: p.cwd, agentId, viewer, integration, latestNode,
  }, Object.values(g.nodes).filter(isCurrentFinding)));
}

function cmdList(args, flags) {
  needInitRead();
  const source = readSource(flags);
  const g = replay(cwd(), source);
  noteAsOf(source, flags);
  let nodes = Object.values(g.nodes).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const type = flags.type || flags.t;
  if (type) nodes = nodes.filter((n) => n.type === type || TYPE_LABEL[n.type] === type);
  const filters = { status: flags.status, severity: flags.sev, confidence: flags.confidence, tags: [].concat(flags.tag || []) };
  nodes = nodes.filter((node) => matchesNodeFields(node, filters));
  if (flags.open || flags['open-only']) {
    nodes = nodes.filter((n) =>
      isOpenThread(n));
  }
  const total = nodes.length;
  if (!flags.all) nodes = nodes.slice(-Number(flags.limit || 30));
  if (flags.json && nodes.length < total) {
    warn(`Warning: pinwhy ls matched ${total} records; showing the latest ${nodes.length}, omitting ${total - nodes.length}. Use --all to read all records or --limit to adjust the count.`);
  }
  if (flags.json) return out(flags, nodes.map(projectNode), OUTPUTS.ls);
  console.log(renderNodeList(nodes, { total }));
}

function cmdShow(args, flags) {
  needInitRead();
  const id = args[0];
  const source = readSource(flags);
  const g = replay(cwd(), source);
  const nodeId = refOrFail(g.nodes, id);
  const n = g.nodes[nodeId];
  if (flags.json) return out(flags, { node: projectNode(n), parents: parentsOf(g, nodeId).map(projectNode), children: childrenOf(g, nodeId).map(projectNode) }, OUTPUTS.show);
  noteAsOf(source, flags);
  console.log(renderNodeDetail({ node: n, neighbors: neighborsOf(g, nodeId) }));
}

function parentsOf(g, id) {
  return Object.values(g.edges)
    .filter((e) => e.to === id)
    .map((e) => ({ ...g.nodes[e.from], edge: e.kind }))
    .filter((x) => x.id);
}

function childrenOf(g, id) {
  return Object.values(g.edges)
    .filter((e) => e.from === id)
    .map((e) => ({ ...g.nodes[e.to], edge: e.kind }))
    .filter((x) => x.id);
}

function cmdTree(args, flags) {
  needInitRead();
  const g = replay(cwd());
  const depth = Number(flags.depth ?? 4);
  const kids = new Map();
  for (const e of Object.values(g.edges)) {
    if (!kids.has(e.from)) kids.set(e.from, []);
    kids.get(e.from).push(e);
  }
  const incoming = new Set(Object.values(g.edges).map((e) => e.to));
  const starts = Object.values(g.nodes).filter((n) => !incoming.has(n.id));
  const roots = starts.length
    ? starts
    : Object.values(g.nodes).slice(0, 10);
  const walk = (n, d, seen, prefix) => {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    console.log(`${prefix}${nodeLine(n)}`);
    const cs = (kids.get(n.id) || [])
      .map((e) => g.nodes[e.to])
      .filter(Boolean)
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (d >= depth) {
      const folded = cs.filter((c) => !seen.has(c.id)).length;
      if (folded) console.log(`${prefix}  ${C.dim(`… ${folded} children collapsed (increase -d to expand)`)}`);
      return;
    }
    for (const c of cs) walk(c, d + 1, seen, `${prefix}  `);
  };
  const seen = new Set();
  for (const r of roots) walk(r, 0, seen, '');
  const orphans = Object.values(g.nodes).filter((n) => !seen.has(n.id));
  if (orphans.length) {
    console.log(C.dim(`… ${orphans.length} nodes not shown in the tree (run pinwhy ls)`));
  }
}

function cmdDigest(args, flags) {
  const p = needInitRead();
  const g = replay(cwd());
  const md = buildDigest(g, cwd(), agentOf(flags));
  if (flags.write) {
    fs.writeFileSync(p.digest, md);
    if (!flags.quiet) warn(C.dim(`Written ${p.digest}`));
  }
  if (flags.json) return out(flags, { digest: md }, OUTPUTS.digest);
  console.log(md);
}

function cmdContext(args, flags) {
  needInitRead();
  const source = readSource(flags);
  const g = replay(cwd(), source);
  const wanted = flags.focus || args[0] || null;
  const focus = wanted ? refOrFail(g.nodes, wanted, 'focus node') : null;
  let since = flags.since;
  if (since !== undefined && !/^\d+$/.test(String(since)) && Object.keys(g.checkpoints || {}).length) {
    try { since = resolveRef(g.checkpoints, since, 'checkpoint'); } catch {}
  }
  const packet = buildAgentContext(g, {
    agentId: agentOf(flags),
    focus,
    depth: flags.depth === undefined ? 2 : Number(flags.depth),
    budgetTokens: flags.budget === undefined ? 4000 : Number(flags.budget),
    since,
    ...(flags.since ? { events: source.events } : {}),
    maxItems: flags.limit || flags.n,
  });
  if (flags.markdown || flags.md) console.log(renderAgentContext(packet, { asOf: source.asOf }));
  else out({ json: true }, packet, OUTPUTS.context);
}

function cmdSearch(args, flags) {
  needInitRead();
  const source = readSource(flags);
  const graph = replay(cwd(), source);
  const relatedTo = flags['related-to'] ? refOrFail(graph.nodes, flags['related-to']) : undefined;
  const result = searchGraph(graph, {
    query: args.join(' '), type: flags.type, tags: flags.tag, status: flags.status,
    severity: flags.sev, confidence: flags.confidence, groupBy: flags['group-by'],
    relation: flags.rel, relatedTo, limit: flags.limit || 30,
  });
  if (flags.json) return out(flags, result, OUTPUTS.search);
  noteAsOf(source, flags);
  console.log(renderSearch(result));
}

async function cmdHistory(args, flags) {
  needInitRead();
  const { buildNodeHistory } = await import('../lib/history.js');
  const source = readEvents(cwd());
  const result = buildNodeHistory(source.events, args[0], source);
  if (flags.json) return out(flags, result, OUTPUTS.history);
  console.log(renderHistory(result));
}

async function cmdChanges(args, flags) {
  needInitRead();
  const since = flags.since || args[0];
  const { buildCheckpointChanges } = await import('../lib/history.js');
  const source = readSource(flags);
  const result = buildCheckpointChanges(source.events, since, source);
  if (flags.json) return out(flags, result, OUTPUTS.changes);
  noteAsOf(source, flags);
  console.log(renderChanges(result));
}

async function cmdBackup(args, flags) {
  needInitRead();
  const { backupBoard } = await import('../lib/backup.js');
  const result = backupBoard(cwd(), path.resolve(cwd(), flags.out));
  if (flags.json) return out(flags, result, OUTPUTS.backup);
  console.log(renderFileResult('backup', result));
}

async function cmdRestore(args, flags) {
  const { restoreBoard } = await import('../lib/backup.js');
  const result = restoreBoard(path.resolve(process.cwd(), args[0]), path.resolve(process.cwd(), flags.into));
  if (flags.json) return out(flags, result, OUTPUTS.restore);
  console.log(renderFileResult('restore', result));
}

async function cmdReceipt(args, flags) {
  needInitRead();
  const { getReceipt } = await import('../lib/store.js');
  const receipt = getReceipt(args[0], cwd());
  if (!receipt) fail('request_not_found');
  if (flags.json) return out(flags, receipt, OUTPUTS.receipt);
  console.log(`${receipt.requestId} · ${receipt.command} · ${receipt.status}`);
  if (receipt.status === 'pending') console.log('Retry the original command with the same request-id to recover the recorded operation; this query does not write records.');
}

function cmdCapabilities(args, flags) {
  const result = {
    schemaVersion: 1, version: VERSION, eventVersion: EVENT_VERSION,
    runtime: { minimumNode: 18, runtimeDependencies: 0 },
    commands: Object.keys(COMMANDS).filter((key) => !key.startsWith('-')),
    features: { context: true, incrementalContext: true, search: true, nodeHistory: true,
      checkpointChanges: true, backupRestore: true, requestReceipts: true,
      writeAttribution: true, cwdFlag: true, noInit: true,
      rejectTruncation: true, inputTruncationMetadata: true, nodeEdgeLabel: true,
      searchFilters: true, searchGrouping: true, listAll: true, nodeJsonDefaults: true,
      nodeMultiTarget: true, checkpointDelta: true, batch: true, batchCheck: true, jsonErrors: true, asOf: true, doctor: true,
      editClear: true, listFilters: true },
    exportFormats: ['html', 'markdown', 'mermaid', 'sarif'],
    errors: { stream: 'stderr', schema: ERROR_SCHEMA, codes: ERROR_CODES },
    contextContract: { readOnly: true, prescriptive: false, nextStepSelection: 'agent-controlled' },
    limits: { ...LIMITS, ...BATCH_LIMITS },
    outputs: OUTPUTS,
    writeTargets: WRITE_TARGETS,
  };
  if (flags.json) return out(flags, result, OUTPUTS.capabilities);
  console.log(`pinwhy ${VERSION} · capabilities schema ${result.schemaVersion}`);
  console.log(Object.keys(result.features).join(', '));
}

async function cmdLint(args, flags) {
  needInitRead();
  const { lintGraph } = await import('../lib/lint.js');
  const result = lintGraph(replay(cwd()), {
    maxTitleLength: Number(flags['max-title'] || 80),
  });
  if (flags.json) return out(flags, result, OUTPUTS.lint);
  console.log(`${C.bold('pinwhy lint')} · ${result.summary.nodes} nodes · ${result.summary.edges} relations`);
  if (!result.issues.length) return console.log(C.grn('No context quality issues found.'));
  for (const x of result.issues) {
    const label = x.level === 'warn' ? C.yel('WARN') : C.cyn('INFO');
    console.log(`${label} ${x.code} · ${x.message}`);
    if (x.nodeIds?.length) {
      console.log(C.dim(`  ${x.nodeIds.join(', ')}${x.count > x.nodeIds.length ? ' …' : ''}`));
    }
  }
  console.log(C.dim('These notices do not modify the board or restrict agent actions.'));
}

function cmdTail(args, flags) {
  needInitRead();
  const g = replay(cwd());
  const text = tail(g, agentOf(flags));
  if (flags.json) return out(flags, { tail: text }, OUTPUTS.tail);
  console.log(text);
}

function cmdInit(args, flags) {
  const explicit = invocation.root || process.env.PINWHY_CWD;
  const target = explicit ? path.resolve(explicit) : process.cwd();
  const parent = findRoot(target);
  if (parent && path.resolve(parent) !== path.resolve(target) && !flags.here) {
    fail(`A parent directory already has a board: ${parent}. Commands in subdirectories use it automatically; add --here to create a separate board here.`);
  }
  const p = ensure(target);
  if (protectBoard(target) && !flags.json) console.log(C.dim('Written .pinwhy/.gitignore; board data is excluded from version control by default.'));
  if (flags.title) setMeta({ title: String(flags.title) }, target);
  const g = replay(target);
  const state = readState(target);
  if (flags.json) return out(flags, { cwd: p.cwd, board: p.root, title: g.meta.title || state.title, session: state.session }, OUTPUTS.init);
  if (g.meta.title || flags.title) {
    console.log(`${C.grn('Initialized')} ${C.dim(p.cwd)} · ${g.meta.title}`);
  } else {
    console.log(`${C.grn('Initialized')} ${C.dim(p.cwd)} · session ${state.session}`);
    console.log(C.dim('Next: pinwhy node add goal "Project goal" --enter'));
  }
}

async function cmdSetup(args, flags) {
  const { setupProject } = await import('../lib/setup.js');
  const target = path.resolve(String(flags.target || args[0] || cwd()));
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    fail(`Project directory does not exist: ${target}`);
  }
  checkoutNote();
  const result = await setupProject({
    cwd: target,
    cli: CLI,
    title: flags.title || path.basename(target),
    port: resolvePort({ cwd: target, port: flags.port }),
    hooks: !flags['no-hooks'],
    skill: !flags['no-skill'],
    serve: !flags['no-serve'],
  });
  if (flags.open && result.service?.url) {
    const { execFile } = await import('node:child_process');
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
    const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', result.service.url] : [result.service.url];
    execFile(opener, openerArgs, () => {});
  }
  if (flags.json) return out(flags, result);
  console.log(renderSetup(result));
}

async function main() {
  const argv = process.argv.slice(2);
  const delimiter = argv.indexOf('--');
  const options = delimiter < 0 ? argv : argv.slice(0, delimiter);
  const cmd = argv[0];
  invocation.json = options.includes('--json') || (cmd === 'context' && !options.includes('--markdown') && !options.includes('--md'));
  if (options.includes('--help') || options.includes('-h')) {
    if (!cmd || ['--help', '-h'].includes(cmd)) return usage({ all: options.includes('--all') });
    if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
    const { args, flags } = parseArgs(argv.slice(1), cmd, { help: true });
    const help = cmd === 'help' ? args.join(' ') : `${cmd}${COMMANDS[cmd].subcommands && args[0] ? ` ${args[0]}` : ''}`;
    if (!help) return usage({ all: !!flags.all });
    if (!commandHelpFor(help)) return unknownCommand(help);
    return console.log(commandHelp(help));
  }
  if (cmd === undefined) return usage();
  // Options belong to a command; keep the documented placement rule.
  if (cmd.startsWith('--') && cmd !== '--version') {
    return fail(`Options must follow a command, for example: pinwhy <command> ${cmd.split('=')[0]} …`);
  }
  if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
  let parsed;
  try { parsed = parseArgs(argv.slice(1), cmd); }
  catch (error) { return fail(error); }
  const { args, flags } = parsed;
  if (flags.cwd) invocation.root = path.resolve(String(flags.cwd));
  invocation.noInit = !!flags['no-init'];
  validateInvocation(cmd, args, flags);

  switch (cmd) {
    case 'help': {
      if (!args.length) return usage({ all: !!flags.all });
      const help = args.join(' ');
      if (!commandHelpFor(help)) return unknownCommand(help);
      return console.log(commandHelp(help));
    }
    case '-v':
    case '--version':
    case 'version':
      return cmdVersion();
    case 'init':
      return cmdInit(args, flags);
    case 'setup':
      return cmdSetup(args, flags);
    case 'status':
      return cmdStatus(args, flags);
    case 'doctor':
      return cmdDoctor(args, flags);
    case 'node':
      return addSimple(args[1], args.slice(2), flags);
    case 'start':
      return addSimple('start', args, flags);
    case 'goal':
      return addSimple('goal', args, flags);
    case 'intent':
      return addSimple('intent', args, flags);
    case 'fact':
      return addSimple('fact', args, flags);
    case 'vuln':
      return addSimple('vuln', args, flags);
    case 'hint':
      return addSimple('hint', args, flags);
    case 'compact':
    case 'checkpoint':
      return cmdCheckpoint(args, flags);
    case 'focus':
    case 'cursor':
      return cmdCursor(args, flags);
    case 'here':
      return cmdHere(args, flags);
    case 'activity':
      return cmdActivity(args, flags);
    case 'promote':
      return cmdPromote(args, flags);
    case 'batch':
      return cmdBatch(args, flags);
    case 'done':
    case 'block':
    case 'revive':
      return cmdState(cmd, args, flags);
    case 'edit':
      return cmdEdit(args, flags);
    case 'link':
      return cmdLink(args, flags);
    case 'unlink':
      return cmdUnlink(args, flags);
    case 'remove':
    case 'rm':
      return cmdRemove(args, flags);
    case 'ls':
    case 'list':
      return cmdList(args, flags);
    case 'show':
      return cmdShow(args, flags);
    case 'search': return cmdSearch(args, flags);
    case 'history': return cmdHistory(args, flags);
    case 'changes': return cmdChanges(args, flags);
    case 'backup': return cmdBackup(args, flags);
    case 'restore': return cmdRestore(args, flags);
    case 'receipt': return cmdReceipt(args, flags);
    case 'capabilities': return cmdCapabilities(args, flags);
    case 'tree':
      return cmdTree(args, flags);
    case 'digest':
      return cmdDigest(args, flags);
    case 'context':
      return cmdContext(args, flags);
    case 'lint':
      return cmdLint(args, flags);
    case 'tail':
      return cmdTail(args, flags);
    case 'serve':
      return cmdServe(args, flags);
    case 'stop':
      return cmdStop(args, flags);
    case 'export':
      return cmdExport(args, flags);
    case 'reset':
      return cmdReset(args, flags);
    case 'hooks':
      return cmdHooks(args, flags);
    case 'service':
      return cmdService(args, flags);
    case 'skill':
      return cmdSkill(args, flags);
    case 'launcher':
      return cmdLauncher(args, flags);
    case 'release':
      return cmdRelease(args, flags);
    case 'hook':
      return hookEntry(args[0], args.slice(1), flags);
    default:
      unknownCommand(cmd);
  }
}

function addSimple(type, args, flags) {
  const title = args.join(' ').trim();
  needInit();
  const result = addNode(
    {
      type,
      title,
      detail: flags.detail || flags.d || '',
      parent: flags.parent || null,
      target: flags.to || null,
      status: flags.status || null,
      severity: flags.sev || null,
      confidence: flags.confidence || null,
      tags: flags.tag ? [].concat(flags.tag) : [],
      at: flags.at || null,
      enter: !!flags.enter,
      relateHere: !!flags['relate-here'],
      relation: flags.rel || flags.kind || null,
      // Only when given: an absent label keeps the request fingerprint of earlier versions.
      ...(flags.label ? { label: flags.label } : {}),
      reason: flags.reason || '',
      agentId: agentOf(flags),
      author: agentOf(flags),
      requestId: flags['request-id'],
      ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
    },
    cwd(),
  );
  warnTruncated(result);
  if (flags.json) return out(flags, { ...result, node: projectNode(result.node) }, OUTPUTS.node);
  if (!process.env.PINWHY_QUIET) {
    const entered = result.cursor ? ' · entered' : '';
    console.log(`${C.grn('+')} ${nodeLine(result.node)}${C.dim(relationsOf(result.node, result.edges || (result.edge ? [result.edge] : [])) + entered)}`);
  }
}

/** The relations a write just created, read from the new node's side; says so when there are none. */
function relationsOf(node, edges) {
  if (!edges.length) return ' · no relations';
  return edges.map((edge) => (edge.from === node.id
    ? ` → ${EDGE_LABEL[edge.kind] || edge.kind} ${edge.to}`
    : ` ${EDGE_LABEL[edge.kind] || edge.kind} ${edge.from}`) + (edge.label ? ` (${edge.label})` : '')).join('');
}

/**
 * A non-blocking stdin pipe can return EAGAIN to a synchronous read once input exceeds the pipe buffer.
 * Reading stops just past `maxBytes`, so the caller still sees an over-limit input without buffering all of it.
 */
async function readStdin(maxBytes = Infinity) {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
    size += chunk.length;
    if (size > maxBytes) break;
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function cmdBatch(args, flags) {
  const check = !!flags.check;
  if (!flags.file && process.stdin.isTTY) fail('Specify a JSONL file with --file, or pipe input through stdin');
  if (check) needInitRead();
  const file = flags.file ? path.resolve(String(flags.file)) : null;
  if (file && fs.statSync(file).size > BATCH_LIMITS.batchMaxBytes) fail(batchTooLarge());
  const text = file ? fs.readFileSync(file, 'utf8') : await readStdin(BATCH_LIMITS.batchMaxBytes);
  const options = { agentId: agentOf(flags), rejectTruncation: !!flags['no-truncate'] };
  let result;
  try {
    const records = parseBatch(text);
    for (const record of records) {
      try {
        inspectInputLengths({
          ...(record.title !== undefined ? { title: record.op === 'node' ? record.title.trim() : record.title } : {}),
          ...(record.detail !== undefined ? { detail: record.detail } : {}),
          ...(record.label !== undefined ? { label: record.label } : {}),
        }, !!flags['no-truncate']);
        for (const [field, values] of [['status', NODE_STATES], ['severity', SEVERITIES], ['confidence', CONFIDENCE_LEVELS]]) {
          if (record[field] != null && !values.includes(record[field])) fail(`invalid ${field}: ${record[field]}`, { code: 'invalid_batch' });
        }
      } catch (error) { throw Object.assign(error, { line: record.line }); }
    }
    if (!check) needInit();
    result = check
      ? { checked: true, requestId: flags['request-id'] ?? null, ...checkBatch(records, options, cwd()) }
      : writeBatch(records, { ...options, requestId: flags['request-id'] }, cwd());
  } catch (error) {
    if (error.line) {
      error.message = `Line ${error.line}: ${error.message}`;
      fail(error);
    }
    throw error;
  }
  for (const entry of result.results) {
    if (entry.truncated) warnTruncated(entry, `Line ${entry.line}: `);
  }
  const results = result.results.map((entry) => (entry.node ? { ...entry, node: projectNode(entry.node) } : entry));
  if (flags.json) return out(flags, { ...result, results }, OUTPUTS.batch);
  if (process.env.PINWHY_QUIET) return;
  if (check) {
    const { nodes, edges, edits } = result.counts;
    return console.log(`${C.grn('Check passed')} Nodes +${nodes}, relations +${edges}, edits ${edits}; no records written`);
  }
  for (const entry of result.results) {
    if (entry.op === 'node') console.log(`${C.grn('+')} ${nodeLine(entry.node)}${C.dim(relationsOf(entry.node, entry.edges))}`);
    else if (entry.op === 'link') console.log(`${C.grn('+')} ${entry.edge.from} ${C.dim(EDGE_LABEL[entry.edge.kind] || entry.edge.kind)} ${entry.edge.to}${entry.edge.label ? C.dim(` (${entry.edge.label})`) : ''}`);
    else console.log(`${C.grn('✓')} ${nodeLine(entry.node)}`);
  }
  const { nodes, edges, edits } = result.counts;
  console.log(C.dim(`Batch ${result.requestId}: nodes +${nodes}, relations +${edges}, edits ${edits}`));
}

function elapsed(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 1) return 'less than 1 minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} hr ${minutes % 60} min` : `${hours} hr`;
}

/** What changed on the board since this agent's previous checkpoint, up to this one. Counts only. */
async function sincePreviousCheckpoint(checkpoint) {
  const { buildCheckpointChanges } = await import('../lib/history.js');
  const source = readEvents(cwd());
  let previous = null;
  let end = source.events.length;
  for (let index = 0; index < source.events.length; index++) {
    const ev = source.events[index];
    if (ev?.op !== 'checkpoint') continue;
    if (ev.checkpoint?.id === checkpoint.id) { end = index + 1; break; }
    if (ev.checkpoint?.agentId === checkpoint.agentId) previous = ev.checkpoint;
  }
  if (!previous) return null;
  const changes = buildCheckpointChanges(source.events.slice(0, end), previous.id, source);
  return {
    checkpointId: previous.id,
    at: previous.at ?? null,
    nodes: { added: changes.nodes.added.length, updated: changes.nodes.updated.length, removed: changes.nodes.removed.length },
    edges: { added: changes.edges.added.length, removed: changes.edges.removed.length },
  };
}

async function cmdCheckpoint(args, flags) {
  const agentId = agentOf(flags);
  const summary = flags.summary || flags.title || args.join(' ').trim() || buildDigest(replay(cwd()), cwd(), agentId);
  inspectInputLengths({ summary }, !!flags['no-truncate']);
  needInit();
  const checkpoint = addCheckpoint(
    {
      summary,
      trigger: flags.trigger || (process.argv[2] === 'compact' ? 'manual-compact' : 'manual'),
      agentId,
      requestId: flags['request-id'],
      ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
    },
    cwd(),
  );
  if (flags.write) fs.writeFileSync(paths(cwd()).digest, buildDigest(replay(cwd()), cwd(), agentId));
  warnTruncated(checkpoint);
  const sincePrevious = await sincePreviousCheckpoint(checkpoint);
  if (flags.json) return out(flags, { ...checkpoint, sincePrevious }, OUTPUTS.checkpoint);
  if (!process.env.PINWHY_QUIET) {
    console.log(`${C.cyn('+')} Checkpoint ${checkpoint.id}${checkpoint.cursorNodeId ? ` @${checkpoint.cursorNodeId}` : ''}`);
    if (sincePrevious) {
      const { nodes, edges } = sincePrevious;
      const ago = sincePrevious.at ? ` (${elapsed(Number(checkpoint.at) - Number(sincePrevious.at))} ago)` : '';
      console.log(C.dim(`  Since ${sincePrevious.checkpointId}${ago}: nodes +${nodes.added} ~${nodes.updated} -${nodes.removed}; relations +${edges.added} -${edges.removed}`));
    } else {
      console.log(C.dim(`  First checkpoint for ${checkpoint.agentId}`));
    }
  }
}

function cmdCursor(args, flags) {
  if (args.length) needInit(); else needInitRead();
  const g = replay(cwd());
  let id = args[0];
  const agentId = agentOf(flags);
  if (!id) {
    const current = currentCursor(g, agentId);
    if (flags.json) return out(flags, { cursor: current, agentId }, OUTPUTS.cursor);
    console.log(current || '(none)');
    return;
  }
  if (id === 'none' || id === 'clear') id = null;
  if (id === 'next') {
    if (flags['request-id']) fail('cursor with --request-id requires an explicit node ID or none');
    const open = Object.values(g.nodes)
      .filter((n) => ['intent', 'hypothesis', 'question'].includes(n.type) &&
        ['open', 'active'].includes(n.status || 'open'))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (!open.length) fail('No open nodes available to enter');
    id = open[open.length - 1].id;
  }
  const cursor = moveCursor(id, { reason: flags.reason || '', agentId, requestId: flags['request-id'] }, cwd());
  if (flags.json) return out(flags, { cursor }, OUTPUTS.cursor);
  if (!process.env.PINWHY_QUIET) {
    if (cursor.to) {
      const target = replay(cwd()).nodes[cursor.to];
      console.log(`${C.grn('Cursor →')} ${target ? nodeLine(target) : `${cursor.to} (original request target removed)`}`);
    }
    else console.log(C.grn('Cursor cleared'));
  }
}

function cmdHere(args, flags) {
  needInitRead();
  const g = replay(cwd());
  const agentId = agentOf(flags);
  const id = currentCursor(g, agentId);
  const node = id ? g.nodes[id] : null;
  const neighbors = neighborsOf(g, id);
  const trail = (g.cursorTrail || []).filter((c) => c.agentId === agentId).slice(-10);
  if (flags.json) return out(flags, { agentId, cursor: id, node: projectNode(node), neighbors: neighbors.map((item) => ({ ...item, node: projectNode(item.node) })), trail }, OUTPUTS.here);
  console.log(renderHere({ agentId, cursor: id, node, neighbors, trail }));
}


function cmdActivity(args, flags) {
  needInitRead();
  const g = replay(cwd());
  const sub = args[0] || 'ls';
  if (sub === 'show') {
    const a = g.activities[refOrFail(g.activities, args[1], 'activity')];
    if (flags.json) return out(flags, a, OUTPUTS['activity show']);
    console.log(activityLine(a));
    if (a.input) console.log(`\nInput\n${a.input}`);
    if (a.output) console.log(`\nOutput\n${a.output}`);
    return;
  }
  const limit = Number(flags.limit || flags.n || 30);
  const activities = Object.values(g.activities)
    .sort((a, b) => (a.at || 0) - (b.at || 0))
    .slice(-limit);
  if (flags.json) return out(flags, activities, OUTPUTS.activity);
  if (!activities.length) return console.log(C.dim('(no activities)'));
  for (const a of activities) console.log(activityLine(a));
}

function cmdPromote(args, flags) {
  refuseMissingBoard();
  needInitRead();
  const id = args[0];
  const g = replay(cwd());
  const activity = g.activities[refOrFail(g.activities, id, 'activity')];
  const type = flags.kind || flags.type || 'observation';
  const result = addNode({
    type,
    title: flags.title || activity.summary || `${activity.tool} activity`,
    detail: flags.detail || flags.d || activity.output || '',
    at: activity.location?.path || activity.location || null,
    tags: ['promoted', String(activity.tool || 'tool').toLowerCase()],
    extra: { activityId: activity.id },
    enter: !!flags.enter,
    relateHere: !!flags['relate-here'],
    target: flags.to || null,
    relation: flags.rel || null,
    ...(flags.label ? { label: flags.label } : {}),
    reason: flags.reason || '',
    agentId: agentOf(flags),
    author: agentOf(flags),
    requestId: flags['request-id'],
    ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
  }, cwd());
  warnTruncated(result);
  if (flags.json) return out(flags, { ...result, node: projectNode(result.node) }, OUTPUTS.promote);
  console.log(`${C.grn('Promoted →')} ${nodeLine(result.node)}`);
}

function cmdState(cmd, args, flags) {
  needInit();
  const id = args[0];
  const map = { done: 'done', block: 'blocked', revive: 'open' };
  const n = patchNode(id, { status: map[cmd] }, cwd(), { by: agentOf(flags), requestId: flags['request-id'] });
  if (flags.json) return out(flags, projectNode(n), OUTPUTS[cmd]);
  if (!process.env.PINWHY_QUIET) console.log(`${C.grn('✓')} ${nodeLine(n)}`);
}

function cmdEdit(args, flags) {
  const id = args[0];
  const set = {};
  if (flags.title) set.title = String(flags.title);
  if (flags.detail || flags.d) set.detail = String(flags.detail || flags.d);
  if (flags.status) set.status = flags.status;
  if (flags.sev) set.severity = flags.sev;
  if (flags.confidence) set.confidence = flags.confidence;
  if (flags.tag) set.tags = [].concat(flags.tag);
  for (const field of [].concat(flags.clear || [])) set[field] = field === 'detail' ? '' : field === 'tags' ? [] : null;
  needInit();
  const n = patchNode(id, set, cwd(), { by: agentOf(flags), requestId: flags['request-id'], ...(flags['no-truncate'] ? { rejectTruncation: true } : {}) });
  warnTruncated(n);
  if (flags.json) return out(flags, projectNode(n), OUTPUTS.edit);
  if (!process.env.PINWHY_QUIET) console.log(`${C.grn('✓')} ${nodeLine(n)}`);
}

function cmdLink(args, flags) {
  needInit();
  const [from, to] = args;
  const kind = flags.rel || flags.kind || 'related-to';
  const edge = addEdge({ from, to, kind, label: flags.label || '', author: agentOf(flags), requestId: flags['request-id'], ...(flags['no-truncate'] ? { rejectTruncation: true } : {}) }, cwd());
  warnTruncated(edge);
  if (flags.json) return out(flags, edge, OUTPUTS.link);
  if (!process.env.PINWHY_QUIET) {
    console.log(`${C.grn('+')} ${edge.from} ${C.dim(EDGE_LABEL[edge.kind] || edge.kind)} ${edge.to}${edge.label ? C.dim(` (${edge.label})`) : ''}`);
  }
}

function cmdUnlink(args, flags) {
  needInit();
  const [from, to] = args;
  let edge;
  try { edge = removeEdge({ from, to, kind: flags.rel || flags.kind || null }, { by: agentOf(flags), requestId: flags['request-id'] }, cwd()); }
  catch (e) { return fail(e); }
  if (flags.json) return out(flags, edge, OUTPUTS.unlink);
  if (!process.env.PINWHY_QUIET) {
    console.log(`${C.grn('−')} ${edge.from} ${C.dim(EDGE_LABEL[edge.kind] || edge.kind)} ${edge.to}`);
  }
}

function cmdRemove(args, flags) {
  needInit();
  let result;
  try { result = removeNode(args[0], { by: agentOf(flags), reason: flags.reason || '', requestId: flags['request-id'] }, cwd()); }
  catch (e) { return fail(e); }
  if (flags.json) return out(flags, result, OUTPUTS.remove);
  if (!process.env.PINWHY_QUIET) {
    console.log(`${C.grn('−')} ${result.id}${result.edges.length ? C.dim(` (${result.edges.length} relations removed)`) : ''}`);
  }
}

function cmdReset(args, flags) {
  if (isInitialized(cwd()) && !flags.yes) {
    fail('This clears the entire graph. Add --yes to confirm');
  }
  refuseMissingBoard();
  ensure(cwd());
  const result = reset(cwd(), { by: agentOf(flags), requestId: flags['request-id'] });
  if (flags.json) return out(flags, result, OUTPUTS.reset);
  console.log(C.grn('Reset complete'));
}

async function cmdHooks(args, flags) {
  const { installHooks, uninstallHooks } = await import('../lib/hooks.js');
  const sub = args[0] || 'install';
  const scope = flags.user ? 'user' : 'project';
  const action = sub === 'install' ? installHooks : uninstallHooks;
  if (sub === 'install' && flags.write) checkoutNote();
  const res = action({
    cwd: cwd(), write: !!flags.write, cli: CLI, scope, withActivity: !!flags['with-activity'],
  });
  if (flags.json) return out(flags, res);
  console.log(res.plan);
  if (res.write) {
    console.log(C.grn(`${sub === 'install' ? 'Written' : 'Removed Pinwhy hooks from'} ${res.file}`));
  }
  else console.log(C.dim('No changes written. Add --write to apply.'));
  if (sub === 'install' && res.removed?.length) {
    console.log(C.yel(`Tool activity collection installed by older defaults has been disabled (${res.removed.join(', ')}). Use --with-activity to enable it again.`));
  }
  if (sub === 'install' && res.withActivity) {
    console.log(C.yel('Warning: Activity collection is enabled. Inputs and outputs from Bash/Read/Grep and similar tools are written to .pinwhy/events.jsonl with best-effort redaction; Write/Edit record paths only. Keep .pinwhy/ out of version control.'));
  }
  if (sub === 'install' && scope === 'project') {
    console.log(C.dim('Tip: Use --user for a global installation; global hooks run only in directories with .pinwhy/.'));
  }
}

async function cmdSkill(args, flags) {
  const { installSkill } = await import('../lib/hooks.js');
  const scope = flags.user ? 'user' : 'project';
  const agent = flags.codex ? 'codex' : 'claude';
  checkoutNote();
  const message = installSkill({ cwd: cwd(), cli: CLI, scope, agent });
  if (flags.json) return out(flags, { agent, scope, message });
  console.log(message);
}

async function cmdService(args, flags) {
  const { workspaceServiceStatus, stopWorkspaceService, installWorkspaceService } = await import('../lib/setup.js');
  const sub = args[0] || 'status';
  let result;
  if (sub === 'install' || sub === 'start') {
    const target = needInitRead().cwd;
    checkoutNote();
    let port;
    if (sub === 'start') {
      const current = workspaceServiceStatus({ cwd: target });
      if (!current.managed || !current.currentProject) fail('No managed service is registered for this project; run pinwhy service install first, or use --cwd to select the service project.');
      port = current.port ?? resolvePort({ cwd: target });
    } else port = resolvePort({ cwd: target, port: flags.port });
    result = await installWorkspaceService({ cwd: target, cli: CLI, port });
    if (result.verified) rememberViewerPort(target, port);
  } else result = sub === 'status'
    ? workspaceServiceStatus({ cwd: cwd() })
    : stopWorkspaceService({ cwd: cwd(), uninstall: sub === 'uninstall' });
  if (flags.json) return out(flags, result);
  console.log(renderService(result, { action: sub }));
}

async function cmdLauncher(args, flags) {
  const { installLauncher } = await import('../lib/hooks.js');
  checkoutNote();
  const res = installLauncher({ cli: CLI, scope: flags.project ? 'project' : 'user' });
  if (flags.json) return out(flags, res);
  console.log(`${C.grn('Installed')} ${res.file}`);
  if (!res.onPath) console.log(C.yel(`Warning: ${res.dir} is not on PATH; add it to your shell configuration.`));
}

function cmdVersion() {
  const build = buildInfo();
  const origin = build.origin;
  const where = origin.kind === 'release'
    ? (origin.active ? 'installed release · current' : `installed release ${origin.version} · not current`)
    : origin.kind === 'checkout' ? `development checkout ${origin.root}` : ROOT;
  console.log(renderVersion({ version: VERSION, build, where }));
}

/** Integrations written from a checkout follow every edit in it; say so, but do not refuse. */
function checkoutNote() {
  if (cliOrigin(CLI).kind !== 'checkout') return;
  warn(C.yel(`Warning: Running from a development checkout; integrations will point to ${CLI} and follow changes in this repository immediately. For daily use, run pinwhy release install first.`));
}

/** The refresh runs in the newly active release, so its own code writes the integrations. */
function refreshFromRelease(cli) {
  const res = spawnSync(process.execPath, [cli, 'release', 'refresh', '--json'], { encoding: 'utf8', env: process.env });
  if (res.status !== 0) return { error: (res.stderr || '').trim() || `exit ${res.status}` };
  try {
    return JSON.parse(res.stdout);
  } catch {
    return { error: `Cannot parse refresh result: ${res.stdout.slice(0, 200)}` };
  }
}


async function cmdRelease(args, flags) {
  const release = await import('../lib/release.js');
  const sub = args[0] || 'ls';
  const origin = cliOrigin(CLI);
  if (sub === 'check') {
    const { checkForUpdates } = await import('../lib/release/update.js');
    const result = await checkForUpdates({ currentVersion: VERSION });
    if (flags.json) return out(flags, result, OUTPUTS['release check']);
    console.log(renderReleaseCheck(result));
    return;
  }
  if (sub === 'ls' || sub === 'list') {
    const list = release.listReleases();
    if (flags.json) return out(flags, list);
    console.log(renderReleaseList(list));
    return;
  }
  if (sub === 'install') {
    if (origin.kind === 'release') fail('release install must run from a development checkout, for example: node /path/to/pinwhy/bin/pinwhy.js release install');
    const installed = release.installRelease({ source: ROOT, force: !!flags.force });
    const switched = release.useRelease(installed.version);
    const refresh = refreshFromRelease(switched.cli);
    const result = { ...installed, previous: switched.previous, cli: switched.cli, ...(switched.warnings?.length ? { warnings: [...installed.warnings, ...switched.warnings] } : {}), refresh };
    if (refresh.error) fail(`Integration refresh failed: ${refresh.error}; current has switched. Fix the issue and run pinwhy release use ${installed.version} again.`, { code: 'error', committed: true, result });
    if (flags.json) return out(flags, result);
    return console.log(renderReleaseResult(result, { action: 'install' }));
  }
  if (sub === 'use') {
    const switched = release.useRelease(args[1]);
    const refresh = refreshFromRelease(switched.cli);
    const result = { ...switched, refresh };
    if (refresh.error) fail(`Integration refresh failed: ${refresh.error}; current has switched. Fix the issue and run pinwhy release use ${switched.version} again.`, { code: 'error', committed: true, result });
    if (flags.json) return out(flags, result);
    return console.log(renderReleaseResult(result, { action: 'use' }));
  }
  if (sub === 'refresh') {
    // Internal step of install/use: only the active release may repoint integrations,
    // otherwise a checkout or an inactive version would capture them again.
    if (origin.kind !== 'release' || !origin.active) fail('release refresh must run from the release selected by current; use release install or release use');
    return out({ json: true }, await release.refreshIntegrations({ cli: CLI }));
  }
  fail('Usage: pinwhy release install|use|ls|check');
}

async function hookEntry(event, args, flags) {
  const { runHook } = await import('../lib/hooks.js');
  let payload = {};
  try {
    const raw = process.stdin.isTTY ? '' : await readStdin();
    if (raw.trim()) payload = JSON.parse(raw);
  } catch {
    payload = {};
  }
  try {
    const res = runHook({ event, payload, cwd: cwd(), args });
    if (res && res.stdout) process.stdout.write(res.stdout);
    if (res && res.digestFile) {
      try {
        fs.writeFileSync(paths(cwd()).digest, res.digest || '');
      } catch {}
    }
  } catch (e) {
    // A hook must never break the host session.
    if (process.env.PINWHY_DEBUG) console.error(e);
  }
}

main().then(() => {
  if (!process.exitCode) for (const message of invocation.warnings) console.error(message);
}).catch(printError);
