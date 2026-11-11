// Board discovery, configuration and the disposable state cache.
import fs from 'node:fs';
import path from 'node:path';
import { NODE_TYPES, TYPE_PREFIX } from '../model.js';
import { paths } from './layout.js';
import { readEvents } from './event-log.js';

export function isInitialized(cwd = process.cwd()) {
  return fs.existsSync(paths(cwd).events);
}

/**
 * The board that owns `start`: the nearest directory at or above it holding
 * `.pinwhy/events.jsonl`, like git finds its repository. Null when there is none.
 */
export function findRoot(start = process.cwd()) {
  let dir = path.resolve(start);
  for (;;) {
    if (isInitialized(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The board holds raw agent text (and, with activity capture, tool output), so a
 * new one keeps itself out of version control until someone chooses otherwise.
 */
export function protectBoard(cwd = process.cwd()) {
  const file = path.join(paths(cwd).root, '.gitignore');
  if (fs.existsSync(file)) return false;
  fs.writeFileSync(file, '# pinwhy data may contain sensitive text; remove this file to track it\n*\n');
  return true;
}

export function ensure(cwd = process.cwd()) {
  const p = paths(cwd);
  if (!fs.existsSync(p.root)) {
    fs.mkdirSync(p.root, { recursive: true });
    protectBoard(cwd);
  }
  if (!fs.existsSync(p.events)) fs.writeFileSync(p.events, '');
  if (!fs.existsSync(p.state)) fs.writeFileSync(p.state, JSON.stringify(defaultState(), null, 2));
  if (!fs.existsSync(p.config)) fs.writeFileSync(p.config, JSON.stringify(defaultConfig(), null, 2));
  return p;
}

export function defaultState() {
  const seq = {};
  for (const t of NODE_TYPES) seq[TYPE_PREFIX[t]] = 0;
  return {
    session: `session_${Date.now().toString(36)}`,
    title: '',
    started: new Date().toISOString(),
    focus: null,
    cursors: {},
    seq, // retained only so older installations remain readable
    hooks: true,
  };
}

export function defaultConfig() {
  return {
    // Only honored when optional hooks are explicitly installed. The normal
    // path remains direct Agent read/write calls.
    autoRecord: true,
    autoTools: ['Bash', 'WebFetch', 'WebSearch', 'Write', 'Edit', 'Read', 'Grep', 'Glob'],
    maxActivities: 4000,
    maxAutoFacts: 4000, // legacy alias
    detailLimit: 1200,
    redact: true,
    digest: {
      maxNeighbors: 16,
      maxTrail: 10,
      maxOpenNodes: 16,
      maxCheckpoints: 6,
    },
  };
}

/** The cache a log implies: what state.json holds once rebuilt from `events`. */
export function stateFromEvents(events) {
  const state = defaultState();
  for (const ev of events) {
    if (ev?.op === 'reset') {
      const fresh = defaultState();
      Object.assign(state, fresh);
    } else if (ev?.op === 'meta' && ev.set) {
      if (ev.set.title !== undefined) state.title = ev.set.title;
      if (ev.set.session !== undefined) state.session = ev.set.session;
      if (ev.set.focus !== undefined) state.focus = ev.set.focus;
    } else if (ev?.op === 'cursor' && ev.cursor?.agentId) {
      state.cursors[ev.cursor.agentId] = ev.cursor.to || null;
      if (ev.cursor.agentId === 'agent:primary') state.focus = ev.cursor.to || null;
    }
  }
  return state;
}

export function recoverState(cwd) {
  return stateFromEvents(readEvents(cwd, 0).events);
}

export function readState(cwd = process.cwd()) {
  const p = paths(cwd);
  try {
    const parsed = JSON.parse(fs.readFileSync(p.state, 'utf8'));
    return { ...defaultState(), ...parsed, cursors: parsed.cursors || {} };
  } catch {
    return recoverState(cwd);
  }
}

export function writeState(state, cwd = process.cwd()) {
  const p = paths(cwd);
  const tmp = `${p.state}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, p.state);
  return state;
}

export function readConfig(cwd = process.cwd()) {
  const defaults = defaultConfig();
  const p = paths(cwd);
  try {
    const parsed = JSON.parse(fs.readFileSync(p.config, 'utf8'));
    return { ...defaults, ...parsed, digest: { ...defaults.digest, ...(parsed.digest || {}) } };
  } catch {
    return defaults;
  }
}
