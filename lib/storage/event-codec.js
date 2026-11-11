// The live log and recoverable backups share byte boundaries and validation.
import { TextDecoder } from 'node:util';
import { isFutureEvent } from '../model.js';

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const string = (value) => typeof value === 'string' && value.trim().length > 0;
const strings = (value) => Array.isArray(value) && value.every((item) => typeof item === 'string');
const optionalStrings = (value, fields) => fields.every((key) => value[key] == null || typeof value[key] === 'string');

function validNodeFields(value) {
  return object(value)
    && optionalStrings(value, ['type', 'title', 'detail', 'status', 'severity', 'confidence', 'author', 'updatedBy', 'reason'])
    && (value.tags == null || strings(value.tags))
    && (value.location == null || object(value.location));
}

function validPayload(event) {
  switch (event.op) {
    case 'node':
      return validNodeFields(event.node) && string(event.node.id) && string(event.node.type);
    case 'edge': {
      const edge = event.edge;
      return object(edge) && string(edge.id) && string(edge.from) && string(edge.to)
        && optionalStrings(edge, ['kind', 'label', 'author']);
    }
    case 'patch':
      return string(event.id) && validNodeFields(event.set);
    case 'remove':
      return string(event.id) && string(event.kind);
    case 'cursor': {
      const cursor = event.cursor;
      return object(cursor) && string(cursor.agentId)
        && optionalStrings(cursor, ['id', 'from', 'to', 'reason', 'sessionId']);
    }
    case 'activity': {
      const activity = event.activity;
      return object(activity) && string(activity.id)
        && optionalStrings(activity, ['tool', 'summary', 'status', 'agentId', 'sessionId', 'input', 'output'])
        && (activity.linkedNodeIds == null || strings(activity.linkedNodeIds));
    }
    case 'checkpoint': {
      const checkpoint = event.checkpoint;
      return object(checkpoint) && string(checkpoint.id)
        && optionalStrings(checkpoint, ['agentId', 'sessionId', 'cursorNodeId', 'summary', 'trigger']);
    }
    case 'meta':
      return object(event.set) && optionalStrings(event.set, ['title', 'session', 'focus']);
    case 'receipt':
      return string(event.requestId) && string(event.command) && string(event.fingerprint)
        && Array.isArray(event.eventIds) && event.eventIds.length > 0 && event.eventIds.every(string);
    default:
      // Additive operations, custom types and relation names remain readable.
      return true;
  }
}

function validEnvelope(event) {
  return object(event) && string(event.op)
    && (event.eventId == null || string(event.eventId))
    && (event.eventVersion == null || (['number', 'string'].includes(typeof event.eventVersion)
      && Number.isFinite(Number(event.eventVersion))));
}

function validRequest(request, event) {
  if (!object(request) || !string(request.requestId) || !string(request.command) || !string(request.fingerprint)
    || !Object.hasOwn(request, 'result') || !Array.isArray(request.events) || !request.events.length) return false;
  const ids = new Set();
  for (const planned of request.events) {
    // Recovery plans contain ordinary events, never another recovery plan. Each
    // entry needs its own identity because recovery deduplicates by eventId.
    if (!validEnvelope(planned) || !string(planned.eventId) || Object.hasOwn(planned, 'request')
      || isFutureEvent(planned) || !validPayload(planned) || ids.has(planned.eventId)) return false;
    ids.add(planned.eventId);
  }
  return string(event.eventId) && ids.has(event.eventId);
}

/** Decode only complete JSONL records; offset always points after a raw LF byte. */
export function decodeEventBytes(bytes, fromByte = 0) {
  const events = [];
  const corruptAt = [];
  const futureAt = [];
  const invalidAt = [];
  const invalidUtf8At = [];
  // Keep BOM characters in decoded text so trim retains the live reader's
  // historical acceptance of an initial BOM (without changing byte offsets).
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let start = 0;
  for (let newline = bytes.indexOf(10); newline !== -1; newline = bytes.indexOf(10, start)) {
    let text;
    try {
      text = decoder.decode(bytes.subarray(start, newline)).trim();
    } catch {
      corruptAt.push(events.length);
      invalidUtf8At.push(events.length);
      start = newline + 1;
      continue;
    }
    start = newline + 1;
    if (!text) continue;
    let event;
    try { event = JSON.parse(text); } catch { corruptAt.push(events.length); continue; }
    if (!validEnvelope(event)) { invalidAt.push(events.length); continue; }
    // A future format may change known payloads: count and block writes before
    // applying this release's payload rules to it.
    if (isFutureEvent(event)) { futureAt.push(events.length); continue; }
    if (!validPayload(event) || (Object.hasOwn(event, 'request') && !validRequest(event.request, event))) {
      invalidAt.push(events.length);
      continue;
    }
    events.push(event);
  }
  const incompleteTailBytes = bytes.length - start;
  return {
    events, corrupt: corruptAt.length, future: futureAt.length, corruptAt, futureAt,
    invalidRecords: invalidAt.length, invalidAt, invalidUtf8: invalidUtf8At.length > 0, invalidUtf8At,
    offset: fromByte + start, truncated: incompleteTailBytes > 0, incompleteTailBytes,
  };
}
