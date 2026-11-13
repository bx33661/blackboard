import { useEffect, useRef, useState } from 'react';
import type { ViewMode, WorkspaceMode } from '../types';
import { readClaimPath, writeClaimPath } from './audit';

type ReaderLocation = { workspace: WorkspaceMode; issueId: string | null; candidateId: string | null; node: string | null; claimPath: string[] };

/** Reader navigation lives in the address bar; restoring it never writes board events. */
export function useWorkspaceLocation() {
  const [initial] = useState(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get('view');
    const mode: ViewMode = view === 'logic' || view === 'all' ? view : 'context';
    const asOf = window.__PINWHY_DATA__ === undefined ? params.get('asOf') || null : null;
    const workspace: WorkspaceMode = params.get('workspace') === 'audit' ? 'audit' : 'general';
    return { agentId: params.get('agent') || 'agent:primary', mode, workspace, issue: params.get('issue'), candidate: params.get('candidate'), claimPath: readClaimPath(params), node: params.get('node'), asOf };
  });
  const [agentId, setAgentId] = useState(initial.agentId);
  const [mode, setMode] = useState(initial.mode);
  const [workspace, setWorkspace] = useState(initial.workspace);
  const [issueId, setIssueId] = useState<string | null>(initial.issue);
  const [candidateId, setCandidateId] = useState<string | null>(initial.candidate);
  const [claimPath, setClaimPath] = useState<string[]>(initial.claimPath);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [asOf, setAsOf] = useState<string | null>(initial.asOf);
  const deepLink = useRef(initial.node);
  const pendingFocus = useRef<string | null>(null);

  const navigateWorkspace = (patch: Partial<ReaderLocation>) => {
    const url = new URL(location.href);
    if (patch.workspace !== undefined) {
      setWorkspace(patch.workspace);
      if (patch.workspace === 'audit') url.searchParams.set('workspace', 'audit'); else url.searchParams.delete('workspace');
    }
    for (const [key, param, setter] of [
      ['issueId', 'issue', setIssueId], ['candidateId', 'candidate', setCandidateId], ['node', 'node', setSelectedId],
    ] as const) {
      if (patch[key] === undefined) continue;
      const value = patch[key] ?? null;
      setter(value);
      if (value) url.searchParams.set(param, value); else url.searchParams.delete(param);
    }
    if (patch.claimPath !== undefined) {
      const next = patch.claimPath.filter(Boolean);
      setClaimPath(next);
      writeClaimPath(url, next);
    }
    if (url.href !== location.href) history.pushState(null, '', url);
  };

  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      const view = params.get('view');
      setMode(view === 'logic' || view === 'all' ? view : 'context');
      setAgentId(params.get('agent') || 'agent:primary');
      setWorkspace(params.get('workspace') === 'audit' ? 'audit' : 'general');
      setIssueId(params.get('issue'));
      setCandidateId(params.get('candidate'));
      setClaimPath(readClaimPath(params));
      const node = params.get('node');
      deepLink.current = node;
      pendingFocus.current = node;
      setSelectedId(node);
      if (window.__PINWHY_DATA__ === undefined) setAsOf(params.get('asOf'));
    };
    window.addEventListener('popstate', restore);
    return () => window.removeEventListener('popstate', restore);
  }, []);

  useEffect(() => {
    const url = new URL(location.href);
    url.searchParams.delete('page');
    url.searchParams.set('view', mode);
    url.searchParams.set('agent', agentId);
    if (workspace === 'audit') url.searchParams.set('workspace', workspace); else url.searchParams.delete('workspace');
    if (issueId) url.searchParams.set('issue', issueId); else url.searchParams.delete('issue');
    if (candidateId) url.searchParams.set('candidate', candidateId); else url.searchParams.delete('candidate');
    writeClaimPath(url, claimPath);
    if (!deepLink.current || selectedId) {
      if (selectedId) url.searchParams.set('node', selectedId); else url.searchParams.delete('node');
    }
    if (window.__PINWHY_DATA__ === undefined) {
      if (asOf) url.searchParams.set('asOf', asOf); else url.searchParams.delete('asOf');
    }
    history.replaceState(null, '', url);
  }, [mode, agentId, workspace, issueId, candidateId, claimPath, selectedId, asOf]);

  return { workspace, navigateWorkspace, issueId, candidateId, claimPath, agentId, setAgentId, mode, setMode, selectedId, setSelectedId, asOf, setAsOf, deepLink, pendingFocus };
}
