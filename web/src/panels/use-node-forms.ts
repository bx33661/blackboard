import { useState, type FormEvent } from 'react';
import * as api from '../api';
import { t } from '../i18n';
import { changeDraft, EMPTY_EDIT, existingLink, type EditableField, type EditDraft } from '../research-state';
import { useSessionDraft } from '../session-drafts';
import type { BoardNode } from '../types';

/** A failed explicit write leaves its form and session draft available for retry. */
function useWrite() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await action(); return true; }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); return false; }
    finally { setBusy(false); }
  };
  return { busy, error, run, clearError: () => setError(null) };
}

/** Keep field baselines and conflict recovery together, independent of the form's markup. */
export function useNodeEdit(node: BoardNode, onReload: () => Promise<void>) {
  const [draft, setDraft] = useSessionDraft<EditDraft>(`edit:${node.id}`, EMPTY_EDIT);
  const { busy, error, run, clearError } = useWrite();
  const dirty = Object.keys(draft.fields).length > 0;
  const change = (key: EditableField, value: string) => {
    const next = changeDraft(draft, node, key, value);
    setDraft(next, Object.keys(next.fields).length > 0);
  };
  const discard = () => { setDraft(EMPTY_EDIT, false); clearError(); };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!(draft.fields.title ?? node.title).trim() || draft.conflict) return;
    if (!dirty) { discard(); return; }
    const ok = await run(async () => {
      try { await api.patchNode(node.id, { ...draft.fields, expected: draft.expected }); }
      catch (e) {
        if (e instanceof api.NodeConflict) setDraft({ ...draft, conflict: true }, true);
        throw e;
      }
    });
    if (ok) discard();
  };
  const reloadDraft = async () => {
    if (await run(onReload)) { setDraft({ ...EMPTY_EDIT, editing: true }, false); clearError(); }
  };
  const reload = async () => { if (await run(onReload)) clearError(); };
  const remove = async () => { if (await run(() => api.removeNode(node.id))) discard(); };
  const startEditing = () => setDraft({ ...draft, editing: true }, dirty);
  return { draft, busy, error, change, discard, save, reloadDraft, reload, remove, startEditing };
}

const EMPTY_NEW = { type: 'fact', title: '', link: 'related-to', createdId: '' };
type NewDraft = typeof EMPTY_NEW;

/** Creation and linking are separate writes; retry a failed link with the already-created ID. */
export function useNodeCreate(current?: BoardNode, onDone?: () => void) {
  const [draft, setDraft] = useSessionDraft(`new:${current?.id || 'standalone'}`, EMPTY_NEW);
  const { type, title, link, createdId } = draft;
  const { busy, error, run, clearError } = useWrite();
  const change = (key: 'type' | 'title' | 'link', value: string) => {
    const next: NewDraft = { ...draft, [key]: value };
    setDraft(next, Boolean(next.title || next.createdId) || next.type !== 'fact' || next.link !== 'related-to');
  };
  const discard = () => { setDraft(EMPTY_NEW, false); clearError(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) return;
    const ok = await run(async () => {
      const node = createdId ? { id: createdId } : (await api.addNode({ type, title: title.trim() })).node;
      setDraft({ ...draft, createdId: node.id }, true);
      if (current) {
        try {
          const way = api.LINKS.find((item) => item.id === link)!;
          await (way.from === 'new' ? api.addEdge(node.id, current.id, way.kind) : api.addEdge(current.id, node.id, way.kind));
        } catch (e) {
          // The node is already in the log; a retry must not create a second orphan.
          throw new Error(t('edit.linkFailed', { id: node.id, error: e instanceof Error ? e.message : String(e) }));
        }
      }
    });
    if (ok) { setDraft(EMPTY_NEW, false); onDone?.(); }
  };
  return { draft, busy, error, change, discard, submit };
}

const EMPTY_CONNECT = { peerId: '', query: '', kind: 'related-to', direction: 'outgoing' as 'outgoing' | 'incoming' };
type ConnectDraft = typeof EMPTY_CONNECT;

/** The peer choice determines retention; search and relation controls alone are not unsaved writes. */
export function useNodeConnect(node: BoardNode, byId: Map<string, BoardNode>, onReload: () => Promise<void>) {
  const [draft, setDraft] = useSessionDraft(`connect:${node.id}`, EMPTY_CONNECT);
  const [done, setDone] = useState(false);
  const { busy, error, run } = useWrite();
  const link = existingLink(node.id, draft.peerId, draft.direction, draft.kind);
  const change = <K extends keyof ConnectDraft>(key: K, value: ConnectDraft[K]) => {
    const next = { ...draft, [key]: value };
    setDraft(next, Boolean(next.peerId));
    if (key === 'query' || key === 'peerId') setDone(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!link || !byId.has(draft.peerId)) return;
    if (await run(() => api.addEdge(link.from, link.to, link.kind))) {
      setDraft(EMPTY_CONNECT, false);
      setDone(true);
      // Refresh failures must not offer a duplicate write: the relation is already committed.
      await onReload().catch(() => {});
    }
  };
  return { draft, link, done, busy, error, change, submit };
}
