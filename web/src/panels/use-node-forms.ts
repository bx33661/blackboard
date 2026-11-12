import { useRef, useState, type FormEvent } from 'react';
import * as api from '../api';
import { t } from '../i18n';
import { changeDraft, EMPTY_EDIT, EMPTY_NEW, existingLink, nodeInputFromDraft, nodePatchFromDraft, type EditableField, type EditDraft, type NewNodeDraft } from '../research-state';
import { useSessionDraft, useSessionWrite } from '../session-drafts';
import type { BoardNode } from '../types';

/** Ref guards cover the same event turn; operation identity outlives this form. */
function useWrite(key: string) {
  const operation = useSessionWrite(key);
  const running = useRef(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const run = async (action: (operation: api.WriteOperation) => Promise<unknown>, onSuccess?: () => void, onReject?: (error: unknown) => void) => {
    if (running.current || operation.locked) return;
    running.current = true; setLocalBusy(true); setLocalError(null); operation.clearError();
    operation.onSuccess = onSuccess;
    operation.onReject = onReject;
    try { await action(operation); }
    catch (error) { setLocalError(operation.error ? null : error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setLocalBusy(false); }
  };
  const clearError = () => { setLocalError(null); operation.clearError(); };
  return { busy: localBusy || operation.busy, locked: operation.locked, error: operation.error || localError, operation, run, clearError };
}

/** Keep field baselines and conflict recovery together, independent of the form's markup. */
export function useNodeEdit(node: BoardNode, onReload: () => Promise<void>) {
  const [draft, setDraft] = useSessionDraft<EditDraft>(`edit:${node.id}`, EMPTY_EDIT);
  const write = useWrite(`node:${node.id}`);
  const { operation, run, clearError } = write;
  const dirty = Object.keys(draft.fields).length > 0;
  const change = (key: EditableField, value: string) => {
    if (operation.locked) return;
    const next = changeDraft(draft, node, key, value);
    setDraft(next, Object.keys(next.fields).length > 0);
  };
  const discard = () => { if (!operation.locked) { setDraft(EMPTY_EDIT, false); clearError(); } };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (operation.locked || !(draft.fields.title ?? node.title).trim() || draft.conflict) return;
    if (!dirty) { discard(); return; }
    await run(async (active) => {
      let patch: api.NodePatch;
      try { patch = nodePatchFromDraft(draft); }
      catch { throw new Error(t('edit.tagsInvalid')); }
      return api.patchNode(node.id, patch, active);
    }, () => setDraft(EMPTY_EDIT, false), (error) => {
      if (error instanceof api.NodeConflict) setDraft({ ...draft, conflict: true, conflictFields: error.fields }, true);
    });
  };
  const reloadDraft = () => run(async () => { await onReload(); setDraft({ ...EMPTY_EDIT, editing: true }, false); });
  const reload = () => run(onReload);
  const remove = () => run((active) => api.removeNode(node.id, active), () => setDraft(EMPTY_EDIT, false));
  const startEditing = () => { if (!operation.locked) setDraft({ ...draft, editing: true }, dirty); };
  return { ...write, draft, change, discard, save, reloadDraft, reload, remove, startEditing };
}

/** Creation and its explicit relation are one atomic, recoverable request. */
export function useNodeCreate(current?: BoardNode, onDone?: () => void) {
  const key = `new:${current?.id || 'standalone'}`;
  const [draft, setDraft] = useSessionDraft(key, EMPTY_NEW);
  const write = useWrite(key);
  const { operation, run, clearError } = write;
  const change = (key: keyof NewNodeDraft, value: string) => {
    if (operation.locked) return;
    const next: NewNodeDraft = { ...draft, [key]: value };
    setDraft(next, JSON.stringify(next) !== JSON.stringify(EMPTY_NEW));
  };
  const discard = () => { if (!operation.locked) { setDraft(EMPTY_NEW, false); clearError(); } };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (operation.locked || !draft.title.trim() || !draft.type.trim()) return;
    await run(async (active) => {
      let input: api.NodeInput;
      try { input = nodeInputFromDraft(draft, current?.id); } catch { throw new Error(t('edit.tagsInvalid')); }
      return api.addNode(input, active);
    }, () => { setDraft(EMPTY_NEW, false); onDone?.(); });
  };
  return { ...write, draft, change, discard, submit };
}

const EMPTY_CONNECT = { peerId: '', query: '', kind: 'related-to', label: '', direction: 'outgoing' as 'outgoing' | 'incoming' };
type ConnectDraft = typeof EMPTY_CONNECT;

/** The peer choice determines retention; search and relation controls alone are not unsaved writes. */
export function useNodeConnect(node: BoardNode, byId: Map<string, BoardNode>, onReload: () => Promise<void>) {
  const key = `connect:${node.id}`;
  const [draft, setDraft] = useSessionDraft(key, EMPTY_CONNECT);
  const [done, setDone] = useState(false);
  const write = useWrite(key);
  const { operation, run } = write;
  const link = existingLink(node.id, draft.peerId, draft.direction, draft.kind);
  const change = <K extends keyof ConnectDraft>(key: K, value: ConnectDraft[K]) => {
    if (operation.locked) return;
    const next = { ...draft, [key]: value };
    setDraft(next, Boolean(next.peerId));
    if (key === 'query' || key === 'peerId') setDone(false);
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (operation.locked || !link || !byId.has(draft.peerId)) return;
    await run((active) => api.addEdge(link.from, link.to, link.kind, draft.label, active), () => {
      setDraft(EMPTY_CONNECT, false);
      setDone(true);
      // A refresh failure cannot turn a committed relation into another write.
      void onReload().catch(() => {});
    });
  };
  return { ...write, draft, link, done, change, submit };
}

export function useEdgeRemoval(id: string) {
  const write = useWrite(`remove-edge:${id}`);
  const remove = () => write.run((active) => api.removeEdge(id, active));
  return { ...write, remove };
}
