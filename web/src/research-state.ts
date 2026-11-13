import type { NodeInput, NodePatch } from './api';
import type { BoardNode } from './types';

export type EditableField = 'title' | 'detail' | 'status' | 'severity' | 'confidence' | 'tags' | 'at';
export type EditableFields = Partial<Record<EditableField, string>>;
export type EditDraft = { editing: boolean; fields: EditableFields; expected: EditableFields; conflict: boolean; conflictFields?: string[] };
export const EMPTY_EDIT: EditDraft = { editing: false, fields: {}, expected: {}, conflict: false };

/** Capture a field's baseline once; unrelated SSE updates never enter the write. */
export function changeDraft(draft: EditDraft, node: BoardNode, key: EditableField, value: string): EditDraft {
  const fields = { ...draft.fields };
  const expected = { ...draft.expected };
  const baseline = expected[key] ?? (key === 'tags' ? JSON.stringify(Array.isArray(node.tags) ? node.tags : null) : key === 'at' ? sourceLocation(node) : String(node[key] ?? ''));
  let unchanged = value === baseline;
  if (key === 'tags') {
    try { unchanged = JSON.stringify(parseTags(value)) === JSON.stringify(baseline === 'null' ? [] : parseTags(baseline)); }
    catch { unchanged = false; }
  }
  if (unchanged) { delete fields[key]; delete expected[key]; }
  else { fields[key] = value; expected[key] = baseline; }
  return { ...draft, fields, expected };
}

/** JSON is an internal lossless draft format; invalid saved drafts remain repairable. */
export function parseTags(value: string): string[] {
  const parsed: unknown = JSON.parse(value || '[]');
  if (!Array.isArray(parsed) || !parsed.every((tag) => typeof tag === 'string')) throw new Error('tags');
  return parsed;
}

/** Convert only changed form fields; source baselines use null for an absent location. */
export function nodePatchFromDraft(draft: EditDraft): NodePatch {
  const { tags, at, ...fields } = draft.fields;
  const { tags: expectedTags, at: expectedAt, ...expected } = draft.expected;
  return {
    ...fields,
    ...(tags !== undefined ? { tags: parseTags(tags) } : {}),
    ...(at !== undefined ? { at: at || null } : {}),
    expected: {
      ...expected,
      ...(tags !== undefined ? { tags: !expectedTags || expectedTags === 'null' ? null : parseTags(expectedTags) } : {}),
      ...(at !== undefined ? { at: expectedAt || null } : {}),
    },
  };
}

export type NewNodeDraft = {
  type: string; title: string; detail: string; tags: string; at: string; status: string; severity: string; confidence: string; label: string; link: string;
  /** Optional boundaries for a negative-result; authored text is serialized into detail even after a type change. */
  checkedScope: string; observedResult: string; excludedScope: string; uncovered: string;
};
export const EMPTY_NEW: NewNodeDraft = {
  type: 'fact', title: '', detail: '', tags: '[]', at: '', label: '', status: '', severity: '', confidence: '', link: 'related-to',
  checkedScope: '', observedResult: '', excludedScope: '', uncovered: '',
};

/** Each explicit create shortcut owns its draft; the legacy key keeps manual creation and old drafts. */
export type NewNodeMode = 'related' | 'claim' | 'negative-result';
export function newNodeDraftKey(currentId: string | undefined, mode: NewNodeMode): string {
  const base = `new:${currentId || 'standalone'}`;
  return mode === 'related' ? base : `${base}:${mode}`;
}
export function newNodeDefaults(mode: NewNodeMode): NewNodeDraft {
  if (mode === 'claim') return { ...EMPTY_NEW, type: 'claim', link: 'supports' };
  if (mode === 'negative-result') return { ...EMPTY_NEW, type: 'negative-result', link: 'related-to' };
  return EMPTY_NEW;
}
/** Presets never mutate an authored draft; type and relation remain explicit form fields. */
export function changeNewNodeDraft(draft: NewNodeDraft, key: keyof NewNodeDraft, value: string): NewNodeDraft {
  const next: NewNodeDraft = { ...draft, [key]: value };
  return next;
}

export type NegativeDetailLabels = { checkedScope: string; observedResult: string; excludedScope: string; uncovered: string; notes: string };
const recorded = (value: string | undefined) => typeof value === 'string' && value.trim() !== '';
/** Explicitly written boundaries survive a later type change; they are never silently dropped. */
export function hasNegativeBoundaries(draft: Pick<NewNodeDraft, 'checkedScope' | 'observedResult' | 'excludedScope' | 'uncovered'>): boolean {
  return [draft.checkedScope, draft.observedResult, draft.excludedScope, draft.uncovered].some(recorded);
}

/**
 * Save the optional boundaries as ordinary readable detail text. Empty fields stay unrecorded;
 * authored values, notes, and newlines are copied exactly, and the viewer never parses this back.
 */
export function negativeResultDetail(draft: Pick<NewNodeDraft, 'detail' | 'checkedScope' | 'observedResult' | 'excludedScope' | 'uncovered'>, labels: NegativeDetailLabels): string {
  const sections: string[] = [];
  const add = (label: string, value: string | undefined) => {
    if (recorded(value)) sections.push(`${label}:\n${value}`);
  };
  add(labels.checkedScope, draft.checkedScope);
  add(labels.observedResult, draft.observedResult);
  add(labels.excludedScope, draft.excludedScope);
  add(labels.uncovered, draft.uncovered);
  // Legacy or manual negatives keep their detail untouched when no boundary was written.
  if (!sections.length) return draft.detail || '';
  if (recorded(draft.detail)) sections.push(`${labels.notes}:\n${draft.detail}`);
  return sections.join('\n\n');
}

/** The create form accepts authored types and preserves tag strings and source columns. */
export function nodeInputFromDraft(draft: NewNodeDraft, currentId?: string, negativeLabels?: NegativeDetailLabels): NodeInput {
  const tags = parseTags(draft.tags);
  const type = draft.type.trim();
  // Boundary text is explicit authored content: keep it in the ordinary detail even after a type change.
  const detail = negativeLabels && hasNegativeBoundaries(draft) ? negativeResultDetail(draft, negativeLabels) : draft.detail;
  // "Current depends on new" and "just related" author the selected record as the source; other kinds source the new record.
  const parentLinked = draft.link === 'related-to' || draft.link === 'depends-on';
  return {
    type, title: draft.title.trim(),
    ...(detail ? { detail } : {}),
    ...(tags.length ? { tags } : {}),
    ...(draft.at ? { at: draft.at } : {}),
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.severity ? { severity: draft.severity } : {}),
    ...(draft.confidence ? { confidence: draft.confidence } : {}),
    ...(currentId ? { ...(parentLinked ? { parent: currentId } : { target: currentId }), relation: draft.link, ...(draft.label ? { label: draft.label } : {}) } : {}),
  };
}

/** Viewers distinguish the bounded negative type by its authored type string only. */
export const isNegativeResultType = (type: string) => type.trim() === 'negative-result';

/** Explicit direction for linking existing nodes, without creating a node or moving a cursor. */
export function existingLink(currentId: string, peerId: string, direction: 'outgoing' | 'incoming', kind = 'related-to') {
  if (!peerId || currentId === peerId) return null;
  return { from: direction === 'outgoing' ? currentId : peerId, to: direction === 'outgoing' ? peerId : currentId, kind };
}

/** Display/copy only. A stored source never becomes executable or an arbitrary file read. */
export function sourceLocation(node: BoardNode): string {
  if (typeof node.loc === 'string') return node.loc;
  if (node.loc && typeof node.loc === 'object' && 'path' in node.loc) {
    const loc = node.loc as { path?: unknown; line?: unknown; column?: unknown };
    if (typeof loc.path === 'string') return `${loc.path}${typeof loc.line === 'number' ? `:${loc.line}` : ''}${typeof loc.column === 'number' ? `:${loc.column}` : ''}`;
  }
  return '';
}

export function historyValue(value: unknown): string {
  if (value === null || value === undefined) return '∅';
  return typeof value === 'string' ? value || '""' : JSON.stringify(value);
}
