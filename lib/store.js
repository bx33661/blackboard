// Append-only pinwhy event store. JSON Lines is the source of truth;
// state.json is a disposable compatibility cache.

import fs from 'node:fs';
import crypto from 'node:crypto';
import {
  applyAll, edgeId, inferEdgeKind, TYPE_PREFIX,
  NODE_STATES, SEVERITIES, CONFIDENCE_LEVELS, currentCursor, nextShortId, resolveRef,
  EVENT_VERSION,
} from './model.js';
import { isOpenThread, isCurrentFinding, isExplicitlyConfirmed } from './semantics.js';
import { validateRequestId, requestFingerprint, withoutRequestId, projectReceipts } from './receipts.js';
import { withFileLock } from './storage/file-lock.js';
import { paths } from './storage/layout.js';
import { defaultState, readState, writeState, recoverState } from './storage/board.js';
import { appendRecords, readEvents, replay } from './storage/event-log.js';
import {
  parseLocation, inspectInputLengths, inputPayload, clipField,
  prepareNode, preparePatch, prepareEdge, planBatch, atBatchLine,
} from './storage/input.js';

// Preserve the public store subpath while internal consumers use each owner.
export { PINWHY_DIR, paths } from './storage/layout.js';
export {
  isInitialized, findRoot, protectBoard, ensure, defaultState, defaultConfig,
  stateFromEvents, readState, writeState, readConfig,
} from './storage/board.js';
export { readEvents, readEventsAsOf, replay } from './storage/event-log.js';
export { parseLocation, LIMITS, inspectInputLengths } from './storage/input.js';

/**
 * state.json is a disposable cache. Once the event is appended the action has
 * happened, so a failed cache write must not surface as a failed command
 * (the caller would retry and duplicate the event); readState recovers instead.
 */
function saveState(state, cwd) {
  if (activeRequest?.cwd === cwd) {
    activeRequest.state = state;
    return;
  }
  try {
    writeState(state, cwd);
  } catch {
    try { fs.unlinkSync(paths(cwd).state); } catch {}
  }
}

/** Cross-process lock. A live lock is never deleted merely because we waited. */
export function withLock(fn, cwd = process.cwd(), timeoutMs = null, { readOnly = false } = {}) {
  const p = paths(cwd);
  if (!fs.existsSync(p.root)) fs.mkdirSync(p.root, { recursive: true });
  // Callers that must never hold up the Agent (hooks) pass a short limit.
  const waitMs = timeoutMs || Number(process.env.PINWHY_LOCK_TIMEOUT_MS) || 10000;
  return withFileLock(p.lock, () => {
    // Every acquisition validates the source afresh while holding the lock.
    const log = readOnly ? undefined : assertWritableLog(cwd);
    return fn(log);
  }, waitMs);
}

/**
 * A release that skips newer events cannot see the ids they hold, so writing
 * next to them could hand out a duplicate id. Reading stays available.
 */
function assertWritableLog(cwd) {
  const log = readEvents(cwd, 0);
  const { future } = log;
  if (!future) return log;
  throw new Error(
    `The event log contains ${future} events with eventVersion > ${EVENT_VERSION}; this version cannot replay them. `
    + 'Writes are disabled to prevent ID conflicts; reads remain available. Switch to a newer version: pinwhy release ls / pinwhy release use <version>',
  );
}

function uniqueId(prefix) {
  const time = Date.now().toString(36);
  const pid = process.pid.toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `${prefix}_${time}_${pid}${random}`;
}

// Only synchronous mutation callbacks run here, under the cross-process lock.
// Buffering lets the first ordinary event carry a complete recovery plan while
// preserving the old event operations for older readers.
let activeRequest = null;

function eventRecord(ev) {
  return { eventVersion: ev.eventVersion || EVENT_VERSION, eventId: ev.eventId || uniqueId('event'), ...ev };
}

export function appendEvent(ev, cwd = process.cwd()) {
  const record = eventRecord(ev);
  if (activeRequest?.cwd === cwd) {
    activeRequest.events.push(record);
    // A batch reads its own uncommitted writes; nothing reaches the log until it all succeeds.
    // Replay patches nodes in place, so the graph gets a copy: a later edit in the same batch
    // must not rewrite an earlier buffered event or the result already returned for it.
    if (activeRequest.graph) activeRequest.graph = applyAll(activeRequest.graph, [JSON.parse(JSON.stringify(record))]);
  } else appendRecords([record], cwd);
  return record;
}

/** The graph a write sees: a batch's buffered state, otherwise the log. */
function workingGraph(cwd, source) {
  return activeRequest?.cwd === cwd && activeRequest.graph ? activeRequest.graph : replay(cwd, source);
}

function publicReceipt(receipt) {
  if (!receipt) return null;
  const { _events, ...result } = receipt;
  return result;
}

/** A query never completes or otherwise changes an interrupted request. */
export function getReceipt(requestId, cwd = process.cwd()) {
  const id = validateRequestId(requestId);
  if (!id) throw new Error('requestId is required');
  return publicReceipt(projectReceipts(readEvents(cwd).events).get(id));
}

function receiptMarker(request) {
  return eventRecord({
    op: 'receipt', requestId: request.requestId, command: request.command,
    fingerprint: request.fingerprint, eventIds: request.eventIds || request.events.map((ev) => ev.eventId),
    at: Date.now(),
  });
}

/**
 * A requested mutation is a recoverable complete-line prefix, not a filesystem
 * transaction: the node, relation and cursor retain their ordinary operations.
 * Its first event embeds the exact plan/result. A commit marker means the whole
 * plan landed. A matching explicit retry resumes a partial plan; unrelated new
 * mutations stop until it is resolved. IDs stay deduplicated across reset.
 */
function withMutation(command, payload, requestId, fn, cwd, timeoutMs = null) {
  const id = validateRequestId(requestId);
  const fingerprint = id ? requestFingerprint(command, payload) : null;
  return withLock((log) => {
    const receipts = projectReceipts(log.events);
    const previous = id ? receipts.get(id) : null;
    if (previous) {
      if (previous.command !== command || previous.fingerprint !== fingerprint) {
        throw Object.assign(new Error(`request_id_conflict: ${id} was used for a different command or payload`), { code: 'request_id_conflict', status: 409 });
      }
      if (previous.status === 'pending') {
        if (!previous.recoverable) {
          throw Object.assign(new Error(`request_recovery_conflict: ${id} has later unrelated events; inspect the receipt before recovery`), { code: 'request_recovery_conflict', status: 409 });
        }
        const committed = new Set(previous.committedEventIds);
        appendRecords([...previous._events.filter((ev) => !committed.has(ev.eventId)), receiptMarker(previous)], cwd);
        saveState(recoverState(cwd), cwd);
      }
      return previous.result;
    }
    const pending = [...receipts.values()].find((receipt) => receipt.status === 'pending');
    if (pending) {
      throw Object.assign(new Error(`pending_request: ${pending.requestId}; retry that exact request before a new mutation`), { code: 'pending_request', status: 409, requestId: pending.requestId });
    }
    if (!id) return fn(log);
    const transaction = { cwd, events: [], state: null };
    activeRequest = transaction;
    let result;
    try { result = fn(log); } finally { activeRequest = null; }
    if (!transaction.events.length) throw new Error('requested mutation did not produce an event');
    // Clone through JSON so a later caller mutation cannot alter the result
    // preserved in the log, and return exactly what a future retry will read.
    const storedResult = JSON.parse(JSON.stringify(result));
    const request = { requestId: id, command, fingerprint, result: storedResult, events: transaction.events, at: Date.now() };
    const records = transaction.events.map((ev, index) => index === 0 ? { ...ev, request } : ev);
    try {
      appendRecords([...records, receiptMarker(request)], cwd);
    } catch (error) {
      // A failed/ambiguous append may have committed a cursor. Never leave a
      // pre-commit cache that conceals that log state from recovery.
      try { fs.unlinkSync(paths(cwd).state); } catch {}
      throw error;
    }
    if (transaction.state) saveState(transaction.state, cwd);
    return storedResult;
  }, cwd, timeoutMs);
}

/** Short ids (n12, hy3) are what an Agent has to type; they are derived from the log inside the write lock. */
function nodeId(g, type) {
  return nextShortId(g.nodes, TYPE_PREFIX[type] || 'n', g.retiredIds);
}

/** Who writes by default: PINWHY_AGENT keeps parallel Agents from sharing one cursor. */
export function defaultAgentId(env = process.env) {
  const raw = String(env.PINWHY_AGENT || '').trim();
  if (!raw) return 'agent:primary';
  return raw.includes(':') ? raw : `agent:${raw}`;
}

function cursorRecord({ from = null, to = null, reason = '', agentId = 'agent:primary', sessionId }) {
  const cursor = {
    id: uniqueId('cursor'), agentId, from, to, at: Date.now(), sessionId,
  };
  if (reason) cursor.reason = String(reason).slice(0, 500);
  return cursor;
}

/** Add a logic node. Linking and entering are explicit, independent options. */
export function addNode(input, cwd = process.cwd()) {
  const prepared = prepareNode(input);
  return withMutation('addNode', inputPayload(input), input.requestId, (log) => writeNode(input, prepared, cwd, log), cwd);
}

/** Runs inside the write lock; a batch calls it once per line on its working graph. */
function writeNode(input, { targets, labelLoss, inputTruncation }, cwd, source) {
  const {
    type = 'note', title = '', detail = '', parent = null, status = null,
    severity = null, confidence = null, tags = [], auto = false, session = null, extra = null,
    at = null, enter = false, relateHere = false, relation = null, label = '',
    agentId = 'agent:primary', reason = '', author = null,
  } = input;
  const state = readState(cwd);
  const g = workingGraph(cwd, source);
  const truncated = [];
  const node = {
    id: nodeId(g, type), type, title: clipField(title, 'title', truncated),
    ts: Date.now(), session: session || state.session,
  };
  if (detail) node.detail = clipField(detail, 'detail', truncated);
  if (tags && tags.length) node.tags = [...new Set(tags.map(String))];
  if (auto) node.auto = true;
  if (author) node.author = String(author).slice(0, 80);
  if (status) node.status = status;
  else if (['intent', 'hypothesis', 'question'].includes(type)) node.status = 'open';
  // Severity is never inferred from the type: an unrated candidate stays unrated.
  if (severity) node.severity = severity;
  if (confidence) node.confidence = confidence;
  if (extra && typeof extra === 'object') {
    Object.assign(node, extra);
    // Legacy extensions may replace text after the primary field was
    // clipped. That replacement was not clipped, so the earlier length
    // warning no longer describes the value actually written to the log.
    for (const field of ['title', 'detail']) {
      if (Object.prototype.propertyIsEnumerable.call(extra, field)) delete inputTruncation[field];
    }
  }
  // Extensions cannot forge or erase store-owned input integrity metadata.
  delete node.inputTruncation;
  if (Object.keys(inputTruncation).length) node.inputTruncation = inputTruncation;
  if (input.rejectTruncation === true) inspectInputLengths({ title: node.title, detail: node.detail }, true);
  if (at) {
    const loc = parseLocation(at);
    if (loc) node.loc = loc;
  }

  let sourceId = parent ? resolveRef(g.nodes, parent, 'source node') : null;
  if (!sourceId && relateHere) sourceId = currentCursor(g, agentId);
  if (sourceId && !g.nodes[sourceId]) throw new Error(`no such source node: ${sourceId}`);
  if (sourceId && parent) node.parent = sourceId; // legacy projection only
  // Resolved before anything is written, so an unknown target leaves the log untouched.
  const targetIds = [...new Set(targets.map((ref) => resolveRef(g.nodes, ref, 'target node')))];
  // relateHere without a cursor creates no relation, so there is nothing for the label to describe.
  if (label && !sourceId && !targetIds.length) throw new Error('label describes the relation, but there is no cursor to relate to');

  appendEvent({ op: 'node', node }, cwd);

  // The new node reads "<new> <relation> <target>"; a source reads "<source> <relation> <new>".
  const pairs = targetIds.length ? targetIds.map((id) => [node.id, id]) : sourceId ? [[sourceId, node.id]] : [];
  const typeOf = (id) => (id === node.id ? type : g.nodes[id]?.type);
  const clippedLabel = label ? clipField(label, 'label', truncated) : '';
  const edges = pairs.map(([from, to]) => {
    const kind = relation || inferEdgeKind(typeOf(from), typeOf(to));
    const edge = { id: edgeId(from, to, kind), from, to, kind, ts: node.ts };
    if (node.author) edge.author = node.author;
    if (clippedLabel) edge.label = clippedLabel;
    if (labelLoss) edge.inputTruncation = { label: labelLoss };
    appendEvent({ op: 'edge', edge }, cwd);
    return edge;
  });
  const edge = edges[0] || null;

  let cursor = null;
  if (enter) {
    const from = currentCursor(g, agentId);
    cursor = cursorRecord({ from, to: node.id, reason, agentId, sessionId: state.session });
    appendEvent({ op: 'cursor', cursor }, cwd);
    state.cursors[agentId] = node.id;
    if (agentId === 'agent:primary') state.focus = node.id;
  }
  saveState(state, cwd);
  return truncated.length ? { node, edge, edges, cursor, truncated } : { node, edge, edges, cursor };
}

export function patchNode(ref, set, cwd = process.cwd(), { by = null, expected = null, requestId = null, rejectTruncation = false } = {}) {
  const prepared = preparePatch(set, rejectTruncation);
  const payload = { ref, set, by, expected, ...(rejectTruncation === true ? { rejectTruncation: true } : {}) };
  return withMutation('patchNode', payload, requestId, (log) => writePatch(ref, set, { by, expected }, prepared, cwd, log), cwd);
}

function writePatch(ref, set, { by = null, expected = null }, { textFields, inputTruncation }, cwd, source) {
  const g = workingGraph(cwd, source);
  const id = resolveRef(g.nodes, ref);
  if (expected) {
    const fields = Object.keys(expected).filter((key) => {
      const actual = g.nodes[id][key];
      const original = expected[key];
      if (key === 'tags') {
        if (original === null) return actual != null;
        return !Array.isArray(actual) || !Array.isArray(original) ||
          actual.length !== original.length || actual.some((tag, index) => tag !== original[index]);
      }
      if (key === 'loc') {
        if (original === null) return actual != null;
        if (!actual || !original || typeof actual !== 'object' || typeof original !== 'object' ||
          Array.isArray(actual) || Array.isArray(original)) return true;
        return ['path', 'line', 'column'].some((field) =>
          Object.hasOwn(actual, field) !== Object.hasOwn(original, field) || actual[field] !== original[field]);
      }
      return (actual ?? '') !== original;
    });
    if (fields.length) {
      throw Object.assign(new Error('node_conflict'), { status: 409, fields });
    }
  }
  if ('id' in set || 'ts' in set) throw new Error('a node\'s id and creation time cannot be changed');
  if (set.status && !NODE_STATES.includes(set.status)) throw new Error(`invalid node state: ${set.status}`);
  if (set.severity && !SEVERITIES.includes(set.severity)) throw new Error(`invalid severity: ${set.severity}`);
  if (set.confidence && !CONFIDENCE_LEVELS.includes(set.confidence)) throw new Error(`invalid confidence: ${set.confidence}`);
  const truncated = [];
  const updated = { ...set, updated: Date.now() };
  if (by) updated.updatedBy = String(by).slice(0, 80);
  if (typeof updated.title === 'string') updated.title = clipField(updated.title, 'title', truncated);
  if (typeof updated.detail === 'string') updated.detail = clipField(updated.detail, 'detail', truncated);
  const previous = g.nodes[id].inputTruncation;
  const remaining = previous && typeof previous === 'object' && !Array.isArray(previous) ? { ...previous } : {};
  for (const field of Object.keys(textFields)) {
    delete remaining[field];
    if (inputTruncation[field]) remaining[field] = inputTruncation[field];
  }
  if (Object.keys(inputTruncation).length || (previous && Object.keys(textFields).length)) {
    // A null is explicit in the patch event, so replay also clears the last
    // warning. Editing another dimension never erases a text warning.
    updated.inputTruncation = Object.keys(remaining).length ? remaining : null;
  }
  const before = g.nodes[id];
  appendEvent({ op: 'patch', id, set: updated }, cwd);
  const node = { ...before, ...updated };
  return truncated.length ? { ...node, truncated } : node;
}

export function addEdge(input, cwd = process.cwd()) {
  const inputTruncation = prepareEdge(input);
  return withMutation('addEdge', inputPayload(input), input.requestId, (log) => writeEdge(input, inputTruncation, cwd, log), cwd);
}

function writeEdge(input, inputTruncation, cwd, source) {
  const { kind = 'related-to', label = '', author = null } = input;
  const g = workingGraph(cwd, source);
  const from = resolveRef(g.nodes, input.from);
  const to = resolveRef(g.nodes, input.to);
  if (from === to) throw new Error('a logic edge cannot link a node to itself');
  const edge = { id: edgeId(from, to, kind), from, to, kind, ts: Date.now() };
  if (author) edge.author = String(author).slice(0, 80);
  const truncated = [];
  if (label) edge.label = clipField(label, 'label', truncated);
  if (Object.keys(inputTruncation).length) edge.inputTruncation = inputTruncation;
  appendEvent({ op: 'edge', edge }, cwd);
  return truncated.length ? { ...edge, truncated } : edge;
}

/** Apply a plan to the active request's working graph; the caller decides whether its events are kept. */
function applyBatch(planned, cwd, source) {
  activeRequest.graph = replay(cwd, source);
  const created = new Map();
  const local = (ref) => (ref.startsWith('$') ? created.get(ref.slice(1)) : ref);
  const counts = { nodes: 0, edges: 0, edits: 0 };
  const results = planned.map(({ record, input, set, author, prepared }) => atBatchLine(record.line, () => {
    const base = { line: record.line, op: record.op };
    if (record.op === 'node') {
      const { node, edges, truncated } = writeNode(input, { ...prepared, targets: prepared.targets.map(local) }, cwd);
      if (record.ref) created.set(record.ref, node.id);
      counts.nodes++;
      counts.edges += edges.length;
      return { ...base, ...(record.ref ? { ref: record.ref } : {}), node, edges, ...(truncated ? { truncated } : {}) };
    }
    if (record.op === 'link') {
      const { truncated, ...edge } = writeEdge({ ...input, from: local(input.from), to: local(input.to) }, prepared, cwd);
      counts.edges++;
      return { ...base, edge, ...(truncated ? { truncated } : {}) };
    }
    const { truncated, ...node } = writePatch(local(record.id), set, { by: author }, prepared, cwd);
    counts.edits++;
    return { ...base, node, ...(truncated ? { truncated } : {}) };
  }));
  return { refs: Object.fromEntries(created), counts, results };
}

/**
 * Write parsed batch records as one request: ordinary node/edge/patch events,
 * buffered on a working graph and appended together, or not at all. Errors
 * carry the input line. No cursor moves; identities only attribute authorship.
 */
export function writeBatch(records, { agentId = 'agent:primary', requestId = null, rejectTruncation = false } = {}, cwd = process.cwd()) {
  if (!validateRequestId(requestId)) throw new Error('a batch needs a request id');
  const planned = planBatch(records, { agentId, rejectTruncation });
  const strict = rejectTruncation === true ? { rejectTruncation: true } : {};
  const payload = { records: records.map(({ line: _line, ...record }) => record), agentId, ...strict };
  return withMutation('batch', payload, requestId, (log) => ({ requestId, ...applyBatch(planned, cwd, log) }), cwd);
}

/** Run a batch against the current board and discard its events; nothing reaches the log. */
export function checkBatch(records, { agentId = 'agent:primary', rejectTruncation = false } = {}, cwd = process.cwd()) {
  const planned = planBatch(records, { agentId, rejectTruncation });
  return withLock((log) => {
    activeRequest = { cwd, events: [], state: null };
    try { return applyBatch(planned, cwd, log); } finally { activeRequest = null; }
  }, cwd);
}

/** Take a node, with its relations, off the board. The log still holds everything that was ever written. */
export function removeNode(ref, { by = null, reason = '', requestId = null } = {}, cwd = process.cwd()) {
  return withMutation('removeNode', { ref, by, reason }, requestId, (log) => {
    const g = replay(cwd, log);
    const id = resolveRef(g.nodes, ref);
    const edges = Object.values(g.edges).filter((e) => e.from === id || e.to === id).map((e) => e.id);
    appendEvent({ op: 'remove', kind: 'node', id, by: by || undefined, reason: reason ? String(reason).slice(0, 500) : undefined, at: Date.now() }, cwd);
    return { id, edges };
  }, cwd);
}

/** Cut one relation. `ref` is an edge id, or pass `from`, `to` and optionally `kind` to find it. */
export function removeEdge({ id = null, from = null, to = null, kind = null } = {}, { by = null, requestId = null } = {}, cwd = process.cwd()) {
  return withMutation('removeEdge', { id, from, to, kind, by }, requestId, (log) => {
    const g = replay(cwd, log);
    let edge = id ? g.edges[id] : null;
    if (!edge && from && to) {
      const a = resolveRef(g.nodes, from, 'source node');
      const b = resolveRef(g.nodes, to, 'target node');
      const found = Object.values(g.edges).filter((e) => e.from === a && e.to === b && (!kind || e.kind === kind));
      if (found.length > 1) throw new Error(`more than one relation links ${a} → ${b}; pass the kind (${found.map((e) => e.kind).join(', ')})`);
      edge = found[0] || null;
    }
    if (!edge) throw new Error(`no such relation: ${id || `${from} → ${to}`}`);
    appendEvent({ op: 'remove', kind: 'edge', id: edge.id, by: by || undefined, at: Date.now() }, cwd);
    return edge;
  }, cwd);
}

export function moveCursor(ref, { reason = '', agentId = 'agent:primary', requestId = null } = {}, cwd = process.cwd()) {
  return withMutation('moveCursor', { ref, reason, agentId }, requestId, (log) => {
    const g = replay(cwd, log);
    const id = ref ? resolveRef(g.nodes, ref) : null;
    const state = readState(cwd);
    const cursor = cursorRecord({
      from: currentCursor(g, agentId), to: id || null, reason, agentId,
      sessionId: state.session,
    });
    appendEvent({ op: 'cursor', cursor }, cwd);
    state.cursors[agentId] = id || null;
    if (agentId === 'agent:primary') state.focus = id || null;
    saveState(state, cwd);
    return cursor;
  }, cwd);
}

/** Backward-compatible alias. */
export function setFocus(id, cwd = process.cwd()) {
  return moveCursor(id, {}, cwd);
}

export function addActivity(input, cwd = process.cwd(), { lockTimeoutMs = null, requestId = null } = {}) {
  return withMutation('addActivity', withoutRequestId(input), input.requestId ?? requestId, (log) => {
    const state = readState(cwd);
    const g = replay(cwd, log);
    const activity = {
      id: nextShortId(g.activities, 'act'),
      tool: String(input.tool || 'tool'),
      summary: String(input.summary || '').slice(0, 500),
      status: input.status || 'success',
      agentId: input.agentId || 'agent:primary',
      at: Date.now(),
      sessionId: state.session,
    };
    if (input.input) activity.input = String(input.input).slice(0, 4000);
    if (input.output) activity.output = String(input.output).slice(0, 20000);
    if (input.location) activity.location = input.location;
    const cursorId = currentCursor(g, activity.agentId);
    if (cursorId) activity.linkedNodeIds = [cursorId];
    appendEvent({ op: 'activity', activity }, cwd);
    return activity;
  }, cwd, lockTimeoutMs);
}

export function addCheckpoint(input = {}, cwd = process.cwd(), { lockTimeoutMs = null, requestId = null } = {}) {
  const inputTruncation = inspectInputLengths({ summary: input.summary }, input.rejectTruncation);
  return withMutation('addCheckpoint', inputPayload(input), input.requestId ?? requestId, (log) => {
    const state = readState(cwd);
    const g = replay(cwd, log);
    const agentId = input.agentId || 'agent:primary';
    const truncated = [];
    const checkpoint = {
      id: nextShortId(g.checkpoints, 'cp'), agentId, at: Date.now(), sessionId: state.session,
      cursorNodeId: currentCursor(g, agentId),
      summary: clipField(input.summary, 'summary', truncated),
      trigger: input.trigger || 'manual',
    };
    if (Object.keys(inputTruncation).length) checkpoint.inputTruncation = inputTruncation;
    appendEvent({ op: 'checkpoint', checkpoint }, cwd);
    return truncated.length ? { ...checkpoint, truncated } : checkpoint;
  }, cwd, lockTimeoutMs);
}

export function setMeta(set, cwd = process.cwd(), { requestId = null } = {}) {
  return withMutation('setMeta', set, requestId, () => {
    const state = readState(cwd);
    if (set.title !== undefined) state.title = set.title;
    if (set.session !== undefined) state.session = set.session;
    appendEvent({ op: 'meta', set }, cwd);
    saveState(state, cwd);
    return state;
  }, cwd);
}

export function reset(cwd = process.cwd(), { by = null, requestId = null } = {}) {
  return withMutation('reset', by ? { by } : {}, requestId, () => {
    appendEvent({ op: 'reset', by: by || undefined }, cwd);
    const state = defaultState();
    saveState(state, cwd);
    return state;
  }, cwd);
}

export function stats(g) {
  const byType = {};
  const intents = { open: 0, active: 0, done: 0, blocked: 0, dead: 0 };
  const vulns = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  const confidence = { suspected: 0, 'static-confirmed': 0, reproduced: 0, confirmed: 0, unspecified: 0 };
  for (const n of Object.values(g.nodes)) {
    byType[n.type] = (byType[n.type] || 0) + 1;
    if (n.type === 'intent') intents[n.status || 'open'] = (intents[n.status || 'open'] || 0) + 1;
    if (isCurrentFinding(n) && n.severity) {
      vulns[n.severity] = (vulns[n.severity] || 0) + 1;
      const level = n.confidence || 'unspecified';
      confidence[level] = (confidence[level] || 0) + 1;
    }
  }
  const openNodes = Object.values(g.nodes).filter(isOpenThread);
  return {
    total: Object.keys(g.nodes).length,
    edges: Object.keys(g.edges).length,
    activities: Object.keys(g.activities || {}).length,
    checkpoints: Object.keys(g.checkpoints || {}).length,
    cursors: Object.keys(g.cursors || {}).length,
    byType, intents, vulns, confidence,
    frontier: openNodes.length,
    confirmed: Object.values(g.nodes).filter((n) => isCurrentFinding(n) && isExplicitlyConfirmed(n)).length,
    candidates: Object.values(g.nodes).filter((n) =>
      isCurrentFinding(n) && ['suspected', 'static-confirmed'].includes(n.confidence)).length,
  };
}
