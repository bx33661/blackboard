import { useCallback, useEffect, useRef, useState } from 'react';
import { t } from '../i18n';
import type { BoardNode, GraphSnapshot } from '../types';
import type { Connection } from '../use-graph-stream';

/** Reader feedback has a workspace lifetime and never changes the streamed board. */
export function useWorkspaceFeedback(snapshot: GraphSnapshot | null, allNodes: BoardNode[], digest: string, agentId: string, connection: Connection, isStatic: boolean) {
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [copied, setCopied] = useState(false);
  const [offlineShown, setOfflineShown] = useState(false);
  const stamps = useRef<Map<string, number> | null>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const freshTimer = useRef<number | undefined>(undefined);
  const noticeTimer = useRef<number | undefined>(undefined);
  const linkTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    setCopied(false);
    clearTimeout(copyTimer.current);
  }, [digest, agentId]);

  useEffect(() => {
    if (!snapshot) return;
    const next = new Map(allNodes.map((node) => [node.id, Number(node.updated || node.ts || 0)]));
    const previous = stamps.current;
    stamps.current = next;
    if (!previous) return;
    const changed = new Set<string>();
    next.forEach((stamp, id) => { if (previous.get(id) !== stamp) changed.add(id); });
    if (!changed.size) return;
    setFresh(changed);
    clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), 4000);
  }, [snapshot, allNodes]);

  useEffect(() => {
    if (connection !== 'offline' || isStatic) { setOfflineShown(false); return; }
    const timer = window.setTimeout(() => setOfflineShown(true), 1500);
    return () => clearTimeout(timer);
  }, [connection, isStatic]);

  const flash = useCallback((message: string) => {
    setNotice(message);
    clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 2600);
  }, []);

  const copyNodeLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setLinkCopied(true);
      clearTimeout(linkTimer.current);
      linkTimer.current = window.setTimeout(() => setLinkCopied(false), 2000);
    } catch { flash(t('app.clipboardFailed')); }
  }, [flash]);

  const copyDigest = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(digest);
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch { setCopied(false); }
  }, [digest]);

  useEffect(() => () => {
    clearTimeout(copyTimer.current);
    clearTimeout(freshTimer.current);
    clearTimeout(noticeTimer.current);
    clearTimeout(linkTimer.current);
  }, []);

  return { fresh, notice, flash, linkCopied, copyNodeLink, copied, copyDigest, offlineShown };
}
