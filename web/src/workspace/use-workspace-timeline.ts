import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChangesBetween, getGraphAsOf } from '../api';
import type { CheckpointChanges, GraphSnapshot } from '../types';
import type { NodeChange } from './use-workspace-presentation';

export type TimelinePoint = { id: string; at: number | null; agentId: string | null; summary: string };

// Bookkeeping that every patch stamps; listed only when nothing else changed.
const STAMP_FIELDS: Record<string, true> = { updated: true, updatedBy: true };
const PLAY_STEP_MS = 1500;

/**
 * The live board's checkpoints in log order, and the board as it stood at one of them.
 * Viewing the past only reads `/api/graph?asOf=`; it never writes events or moves a cursor.
 * `asOf === null` is the live board; while a point loads, the previous picture stays on screen.
 */
export function useWorkspaceTimeline(live: GraphSnapshot | null, asOf: string | null, setAsOf: (ref: string | null) => void, isStatic: boolean) {
  const points = useMemo<TimelinePoint[]>(() => Object.entries(live?.checkpoints || {})
    .map(([key, checkpoint]) => ({
      id: typeof checkpoint.id === 'string' && checkpoint.id ? checkpoint.id : key,
      at: typeof checkpoint.at === 'number' && Number.isFinite(checkpoint.at) ? checkpoint.at : null,
      agentId: typeof checkpoint.agentId === 'string' ? checkpoint.agentId : null,
      summary: typeof checkpoint.summary === 'string' ? checkpoint.summary : '',
    }))
    .sort((a, b) => (a.at ?? 0) - (b.at ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)), [live?.checkpoints]);

  const active = Boolean(asOf) && !isStatic;
  const [past, setPast] = useState<{ ref: string; snapshot: GraphSnapshot } | null>(null);
  const [error, setError] = useState<{ ref: string; text: string } | null>(null);

  useEffect(() => {
    if (!active || !asOf) { setPast(null); setError(null); return; }
    let cancelled = false;
    getGraphAsOf(asOf).then(
      (snapshot) => { if (!cancelled) { setPast({ ref: asOf, snapshot }); setError(null); } },
      (failure) => { if (!cancelled) setError({ ref: asOf, text: failure instanceof Error ? failure.message : String(failure) }); },
    );
    return () => { cancelled = true; };
  }, [active, asOf]);

  const loaded = active && past?.ref === asOf ? past.snapshot : null;
  const loading = active && !loaded && error?.ref !== asOf;
  const resolvedId = loaded?.meta.asOf?.id ?? null;
  const found = active ? points.findIndex((point) => point.id === (resolvedId ?? asOf)) : -1;
  // `points.length` is the live board. A point still loading, or one the live list lacks, counts as there.
  const position = active && found >= 0 ? found : points.length;
  const previousId = found > 0 ? points[found - 1].id : null;

  const [delta, setDelta] = useState<{ key: string; data: CheckpointChanges | null; error: string | null } | null>(null);
  const deltaKey = resolvedId ? `${previousId ?? ''}>${resolvedId}` : null;
  useEffect(() => {
    if (!deltaKey || !resolvedId) { setDelta(null); return; }
    if (!previousId) { setDelta({ key: deltaKey, data: null, error: null }); return; }
    let cancelled = false;
    getChangesBetween(previousId, resolvedId).then(
      (data) => { if (!cancelled) setDelta({ key: deltaKey, data, error: null }); },
      (failure) => { if (!cancelled) setDelta({ key: deltaKey, data: null, error: failure instanceof Error ? failure.message : String(failure) }); },
    );
    return () => { cancelled = true; };
  }, [deltaKey, resolvedId, previousId]);
  const changes = delta?.key === deltaKey ? delta : null;

  const changeMap = useMemo(() => {
    if (!changes?.data) return null;
    const map = new Map<string, NodeChange>();
    for (const node of changes.data.nodes.added) map.set(node.id, { kind: 'added', fields: [] });
    for (const item of changes.data.nodes.updated) {
      const authored = item.fields.filter((field) => !STAMP_FIELDS[field]);
      map.set(item.id, { kind: 'updated', fields: authored.length ? authored : item.fields });
    }
    return map;
  }, [changes]);

  const goTo = useCallback((next: number) => {
    const clamped = Math.max(0, Math.min(points.length, next));
    setAsOf(clamped === points.length ? null : points[clamped].id);
  }, [points, setAsOf]);
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; }, [goTo]);

  const [playing, setPlaying] = useState(false);
  /** Playing from the live board starts at the first checkpoint; reaching the live board again stops. */
  const play = useCallback(() => {
    if (!points.length) return;
    if (!active) goTo(0);
    setPlaying(true);
  }, [active, goTo, points.length]);
  useEffect(() => {
    if (!playing) return;
    if (!active) { setPlaying(false); return; }
    if (loading) return;
    const timer = window.setTimeout(() => goToRef.current(position + 1), PLAY_STEP_MS);
    return () => clearTimeout(timer);
  }, [playing, active, loading, position]);

  return {
    points, position, active,
    /** What the canvas shows: the loaded point, else whatever was on screen before. */
    snapshot: active ? loaded ?? past?.snapshot ?? live : live,
    point: loaded?.meta.asOf ?? null,
    loading,
    error: active && error?.ref === asOf ? error.text : null,
    previousId, changes, changeMap,
    goTo, playing, play, pause: useCallback(() => setPlaying(false), []),
  };
}
