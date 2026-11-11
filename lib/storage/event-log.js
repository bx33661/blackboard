// Event log I/O and read-only projections; mutations are coordinated by store.js.
import fs from 'node:fs';
import { emptyGraph, apply, isFutureEvent, resolveRef } from '../model.js';
import { paths } from './layout.js';
import { readEventBytes, repairTornTail } from './event-file.js';

export function appendRecords(records, cwd) {
  const p = paths(cwd);
  if (!fs.existsSync(p.root)) fs.mkdirSync(p.root, { recursive: true });
  if (!fs.existsSync(p.events)) fs.writeFileSync(p.events, '');
  repairTornTail(p.events);
  fs.appendFileSync(p.events, records.map((record) => `${JSON.stringify(record)}\n`).join(''));
}

export function readEvents(cwd = process.cwd(), fromByte = 0) {
  const p = paths(cwd);
  let buf;
  try {
    const { bytes, size } = readEventBytes(p.events, fromByte);
    if (bytes === null) {
      return { events: [], corrupt: 0, future: 0, corruptAt: [], futureAt: [], offset: size, truncated: false };
    }
    buf = bytes;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      error.status ??= 500;
      throw error;
    }
    return { events: [], corrupt: 0, future: 0, corruptAt: [], futureAt: [], offset: fromByte, truncated: false };
  }
  const text = buf.toString('utf8');
  const lastNl = text.lastIndexOf('\n');
  const complete = lastNl === -1 ? '' : text.slice(0, lastNl + 1);
  const events = [];
  let corrupt = 0;
  let future = 0;
  // How many events preceded each skipped line, so a prefix of the log can
  // report exactly the skips a file cut at that point would have.
  const corruptAt = [];
  const futureAt = [];
  for (const line of complete.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    let ev;
    try { ev = JSON.parse(t); } catch { corrupt++; corruptAt.push(events.length); continue; }
    // Filtered here so every projection (replay, context deltas, state
    // recovery, the live server) skips the same events.
    if (isFutureEvent(ev)) { future++; futureAt.push(events.length); }
    else events.push(ev);
  }
  return {
    events, corrupt, future, corruptAt, futureAt,
    offset: fromByte + Buffer.byteLength(complete, 'utf8'),
    truncated: lastNl === -1,
  };
}

/**
 * The log as it stood right after checkpoint `ref` was written: exactly what
 * reading a copy of events.jsonl cut after that line would return. A reused id
 * (after a reset) names its last occurrence, as `changes --since` does. Only
 * reads; the result carries `asOf` so outputs can say which point they show.
 */
export function readEventsAsOf(cwd = process.cwd(), ref, source = readEvents(cwd, 0)) {
  const { events } = source;
  // id → position + 1: resolveRef treats a falsy entry as missing.
  const last = Object.create(null);
  for (let index = 0; index < events.length; index++) {
    const ev = events[index];
    if (ev?.op === 'checkpoint' && typeof ev.checkpoint?.id === 'string' && ev.checkpoint.id) last[ev.checkpoint.id] = index + 1;
  }
  let id;
  try {
    id = resolveRef(last, ref, 'checkpoint');
  } catch (error) {
    throw Object.assign(error, { status: error.code === 'ambiguous_ref' ? 400 : 404, asOf: String(ref ?? '') });
  }
  const index = last[id] - 1;
  const { checkpoint, eventId } = events[index];
  const before = (positions) => positions.filter((at) => at <= index).length;
  return {
    events: events.slice(0, index + 1),
    corrupt: before(source.corruptAt || []),
    future: before(source.futureAt || []),
    truncated: false,
    asOf: {
      id, at: checkpoint.at ?? null, agentId: checkpoint.agentId ?? null,
      sessionId: checkpoint.sessionId ?? null, summary: checkpoint.summary ?? '', eventId: eventId ?? null,
    },
  };
}

/** A supplied log is retained by other projections, so patched nodes must not alias its records. */
export function replay(cwd = process.cwd(), source) {
  const { events, corrupt, future } = source || readEvents(cwd, 0);
  let g = emptyGraph();
  for (const event of events) {
    const record = source && event?.op === 'node' && event.node ? { ...event, node: { ...event.node } } : event;
    g = apply(g, record);
  }
  g.integrity.corruptLines = corrupt;
  g.integrity.futureEvents = future;
  g.meta.count = Object.keys(g.nodes).length;
  return g;
}
