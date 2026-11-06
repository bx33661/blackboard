import { useEffect, useRef, useState } from 'react';
import type { ViewMode } from '../types';

/** Reader navigation lives in the address bar; restoring it never writes board events. */
export function useWorkspaceLocation() {
  const [initial] = useState(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const mode: ViewMode = view === 'logic' || view === 'all' ? view : 'context';
    // An offline export has no server to ask for another checkpoint; its own snapshot is all there is.
    const asOf = window.__BLACKBOARD_DATA__ === undefined ? params.get('asOf') || null : null;
    const page = params.get('page') === 'notes' || (window.__BLACKBOARD_DATA__ === undefined && !params.has('page') && !params.has('view') && !params.has('node') && !params.has('asOf')) ? 'notes' : 'board';
    return { agentId: params.get('agent') || 'agent:primary', mode, node: params.get('node'), asOf, page };
  });
  const [agentId, setAgentId] = useState(initial.agentId);
  const [mode, setMode] = useState(initial.mode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** The checkpoint the reader is looking back at; `null` is the live board. */
  const [asOf, setAsOf] = useState<string | null>(initial.asOf);
  const [page, setPage] = useState<'board' | 'notes'>(initial.page as 'board' | 'notes');
  // Workspace resolves this once the snapshot and visible projection have arrived.
  const deepLink = useRef(initial.node);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.set('view', mode);
    url.searchParams.set('agent', agentId);
    history.replaceState(null, '', url);
  }, [mode, agentId]);

  useEffect(() => {
    if (deepLink.current && !selectedId) return;
    const url = new URL(location.href);
    if (selectedId) url.searchParams.set('node', selectedId); else url.searchParams.delete('node');
    history.replaceState(null, '', url);
  }, [selectedId]);

  useEffect(() => {
    if (window.__BLACKBOARD_DATA__ !== undefined) return;
    const url = new URL(location.href);
    if (asOf) url.searchParams.set('asOf', asOf); else url.searchParams.delete('asOf');
    history.replaceState(null, '', url);
  }, [asOf]);

  useEffect(() => {
    const url = new URL(location.href);
    if (page === 'notes') url.searchParams.set('page', 'notes'); else url.searchParams.delete('page');
    history.replaceState(null, '', url);
  }, [page]);

  return { agentId, setAgentId, mode, setMode, selectedId, setSelectedId, asOf, setAsOf, page, setPage, deepLink, pendingFocus };
}
