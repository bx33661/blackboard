// Input preparation runs before acquiring the event write lock.
import { NODE_STATES, SEVERITIES, CONFIDENCE_LEVELS } from '../model.js';
import { withoutRequestId } from '../receipts.js';

/** "src/api/auth.js:142" or "src/api/auth.js" → { path, line } */
export function parseLocation(s) {
  const t = String(s || '').trim();
  if (!t) return null;
  const m = t.match(/^(.*?):(\d+)(?::\d+)?$/);
  if (m) return { path: m[1], line: Number(m[2]) };
  const base = t.split('/').pop() || '';
  if (base && base.includes('.') && !base.startsWith('.')) return { path: t };
  return null;
}

export const LIMITS = { title: 500, detail: 20000, label: 500, summary: 12000 };

// Input loss is event data, not a warning cache: a later reader must be able
// to tell that an earlier writer supplied more text than was retained.
export function inspectInputLengths(values, rejectTruncation = false) {
  const losses = {};
  for (const [field, value] of Object.entries(values)) {
    const length = String(value || '').length;
    if (length > LIMITS[field]) losses[field] = { originalLength: length, storedLength: LIMITS[field] };
  }
  const fields = Object.keys(losses);
  if (rejectTruncation === true && fields.length) {
    const lengths = fields.map((field) => `${field} (${losses[field].originalLength} > ${losses[field].storedLength})`).join(', ');
    throw Object.assign(new Error(`input too long: ${lengths}; no text was saved`), {
      status: 422, code: 'input_too_long', fields, limits: losses,
    });
  }
  return losses;
}

// Omitted/false protection keeps precisely the pre-option receipt identity.
// Explicit strict writes do include the option, so modes cannot be mixed on
// a single request ID after an ambiguous result.
export function inputPayload(input) {
  const payload = withoutRequestId(input);
  if (payload.rejectTruncation !== true) delete payload.rejectTruncation;
  return payload;
}

/** Cut `value` to the field limit and record the field name, so the caller can say so. */
export function clipField(value, field, notes) {
  const text = String(value || '');
  if (text.length <= LIMITS[field]) return text;
  notes.push(field);
  return text.slice(0, LIMITS[field]);
}

export function prepareNode(input) {
  const { parent = null, status = null, severity = null, confidence = null, relateHere = false, target = null, label = '', title = '', detail = '' } = input;
  if (status && !NODE_STATES.includes(status)) throw new Error(`invalid node state: ${status}`);
  if (severity && !SEVERITIES.includes(severity)) throw new Error(`invalid severity: ${severity}`);
  if (confidence && !CONFIDENCE_LEVELS.includes(confidence)) throw new Error(`invalid confidence: ${confidence}`);
  // Targets share one relation; with a source as well, the direction would be ambiguous.
  const targets = target == null ? [] : [].concat(target);
  if (targets.some((ref) => typeof ref !== 'string' || !ref)) throw new Error('target must be a node id');
  if (targets.length && (parent || relateHere)) throw new Error('target cannot be combined with parent or relateHere; use link for more relations');
  if (label && !targets.length && !parent && !relateHere) throw new Error('label describes the relation; pass target, parent or relateHere');
  // Checked together so a strict write names every field that is too long.
  const { label: labelLoss, ...inputTruncation } = inspectInputLengths({ title, detail, label }, input.rejectTruncation);
  return { targets, labelLoss, inputTruncation };
}

export function preparePatch(set, rejectTruncation) {
  if (Object.hasOwn(set, 'inputTruncation')) throw new Error('inputTruncation is managed by the store');
  const textFields = Object.fromEntries(['title', 'detail'].filter((field) => typeof set[field] === 'string').map((field) => [field, set[field]]));
  return { textFields, inputTruncation: inspectInputLengths(textFields, rejectTruncation) };
}

export function prepareEdge(input) {
  return inspectInputLengths({ label: input.label || '' }, input.rejectTruncation);
}

/** Every line, including strict text limits, is validated here, before the lock is taken. */
export function planBatch(records, { agentId, rejectTruncation }) {
  const strict = rejectTruncation === true ? { rejectTruncation: true } : {};
  return records.map((record) => atBatchLine(record.line, () => {
    const author = record.agent || agentId;
    if (record.op === 'node') {
      const input = {
        type: record.type, title: record.title.trim(), detail: record.detail || '', tags: record.tags || [],
        at: record.at || null, status: record.status || null, severity: record.severity || null,
        confidence: record.confidence || null, target: record.to ?? null, relation: record.rel || null,
        label: record.label || '', agentId: author, author, ...strict,
      };
      return { record, input, prepared: prepareNode(input) };
    }
    if (record.op === 'link') {
      const input = { from: record.from, to: record.to, kind: record.rel || 'related-to', label: record.label || '', author, ...strict };
      return { record, input, prepared: prepareEdge(input) };
    }
    const set = Object.fromEntries(['title', 'detail', 'status', 'severity', 'confidence', 'tags']
      .filter((key) => key in record).map((key) => [key, record[key]]));
    return { record, set, author, prepared: preparePatch(set, rejectTruncation) };
  }));
}

export const atBatchLine = (line, fn) => {
  try { return fn(); } catch (error) { throw Object.assign(error, { line }); }
};
