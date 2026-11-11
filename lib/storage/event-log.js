// Event log I/O and read-only projections; mutations are coordinated by store.js.
import fs from 'node:fs';
import { emptyGraph, apply, resolveRef } from '../model.js';
import { paths } from './layout.js';
import { readEventBytes, repairTornTail } from './event-file.js';
import { decodeEventBytes } from './event-codec.js';

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
      return decodeEventBytes(Buffer.alloc(0), size);
    }
    buf = bytes;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      error.status ??= 500;
      throw error;
    }
    return decodeEventBytes(Buffer.alloc(0), fromByte);
  }
  return decodeEventBytes(buf, fromByte);
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
    invalidRecords: before(source.invalidAt || []),
    invalidUtf8: before(source.invalidUtf8At || []) > 0,
    corruptAt: (source.corruptAt || []).filter((at) => at <= index),
    futureAt: (source.futureAt || []).filter((at) => at <= index),
    invalidAt: (source.invalidAt || []).filter((at) => at <= index),
    invalidUtf8At: (source.invalidUtf8At || []).filter((at) => at <= index),
    truncated: false,
    incompleteTailBytes: 0,
    asOf: {
      id, at: checkpoint.at ?? null, agentId: checkpoint.agentId ?? null,
      sessionId: checkpoint.sessionId ?? null, summary: checkpoint.summary ?? '', eventId: eventId ?? null,
    },
  };
}

/** A supplied log is retained by other projections, so patched nodes must not alias its records. */
export function replay(cwd = process.cwd(), source) {
  const { events, corrupt = 0, future = 0, invalidRecords = 0, incompleteTailBytes = 0 } = source || readEvents(cwd, 0);
  let g = emptyGraph();
  for (const event of events) {
    const record = source && event?.op === 'node' && event.node ? { ...event, node: { ...event.node } } : event;
    g = apply(g, record);
  }
  g.integrity.corruptLines = corrupt;
  g.integrity.futureEvents = future;
  g.integrity.rejected += invalidRecords;
  if (incompleteTailBytes) g.integrity.incompleteTailBytes = incompleteTailBytes;
  g.meta.count = Object.keys(g.nodes).length;
  return g;
}
