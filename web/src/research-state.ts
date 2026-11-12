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

export type NewNodeDraft = { type: string; title: string; detail: string; tags: string; at: string; status: string; severity: string; confidence: string; label: string; link: string };
export const EMPTY_NEW: NewNodeDraft = { type: 'fact', title: '', detail: '', tags: '[]', at: '', label: '', status: '', severity: '', confidence: '', link: 'related-to' };

/** The create form accepts authored types and preserves tag strings and source columns. */
export function nodeInputFromDraft(draft: NewNodeDraft, currentId?: string): NodeInput {
  const tags = parseTags(draft.tags);
  return {
    type: draft.type.trim(), title: draft.title.trim(),
    ...(draft.detail ? { detail: draft.detail } : {}),
    ...(tags.length ? { tags } : {}),
    ...(draft.at ? { at: draft.at } : {}),
    ...(draft.status ? { status: draft.status } : {}),
    ...(draft.severity ? { severity: draft.severity } : {}),
    ...(draft.confidence ? { confidence: draft.confidence } : {}),
    ...(currentId ? { ...(draft.link === 'related-to' ? { parent: currentId } : { target: currentId }), relation: draft.link, ...(draft.label ? { label: draft.label } : {}) } : {}),
  };
}

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
