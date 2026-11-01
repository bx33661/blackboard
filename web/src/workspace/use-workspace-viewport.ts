import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { getNodesBounds, getViewportForBounds, useNodesInitialized, useReactFlow } from '@xyflow/react';
import { frameStrategy, pickFocus } from '../canvas-state';
import { NODE_H, NODE_W, type CanvasNode } from '../graph';
import type { ViewMode } from '../types';

type Options = {
  viewportRef: RefObject<HTMLDivElement | null>;
  pendingFocus: RefObject<string | null>;
  layoutRevision: number;
  mode: ViewMode;
  follow: boolean;
  currentId: string | null;
  selectedId: string | null;
};

/** Framing and following move the reader's viewport, never the recorded agent cursor. */
export function useWorkspaceViewport({ viewportRef, pendingFocus, layoutRevision, mode, follow, currentId, selectedId }: Options) {
  const initialized = useNodesInitialized();
  const { fitView, getNode, getNodes, setCenter } = useReactFlow<CanvasNode>();
  const framedRevision = useRef(0);
  const lastCurrent = useRef<string | null>(null);
  const live = useRef({ follow: false, currentId: null as string | null, selectedId: null as string | null });
  const [motion, setMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 350);
  live.current = { follow: follow && mode !== 'all', currentId, selectedId };

  useEffect(() => {
    const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => { setMotion(preference.matches ? 0 : 350); };
    preference.addEventListener('change', update);
    return () => preference.removeEventListener('change', update);
  }, []);

  const centerOnNode = useCallback((id: string, reserveInspector = true, duration = motion) => {
    const node = getNode(id);
    if (!node) return;
    const width = viewportRef.current?.clientWidth || 700;
    // The desktop inspector floats over the right edge; centre in the remaining space.
    const overlay = reserveInspector && width >= 640 ? Math.min(372, width * .5) : 0;
    const zoom = Math.min(1, Math.max(.55, (width - overlay) / (NODE_W + 48)));
    const parent = node.parentId ? getNode(node.parentId) : null;
    setCenter(
      node.position.x + (parent?.position.x || 0) + (node.data.compact ? 120 : NODE_W / 2) + overlay / (2 * zoom),
      node.position.y + (parent?.position.y || 0) + Number(node.style?.height || NODE_H) / 2,
      { zoom, duration },
    );
  }, [getNode, setCenter, viewportRef, motion]);

  useEffect(() => {
    if (!initialized || !layoutRevision || framedRevision.current === layoutRevision) return;
    const frame = requestAnimationFrame(() => {
      const duration = framedRevision.current === 0 ? 0 : motion;
      framedRevision.current = layoutRevision;
      const following = live.current.follow && live.current.currentId && getNode(live.current.currentId) ? live.current.currentId : null;
      // A view switch can leave a requested node waiting for the next layout.
      const requested = pendingFocus.current && getNode(pendingFocus.current) ? pendingFocus.current : null;
      if (requested) {
        centerOnNode(requested, true, duration);
        pendingFocus.current = null;
      } else if (following) centerOnNode(following, Boolean(live.current.selectedId), duration);
      else {
        const cards = getNodes().filter((node) => !node.data.group);
        const box = viewportRef.current;
        const fitZoom = mode !== 'all' && cards.length && box
          ? getViewportForBounds(getNodesBounds(cards), box.clientWidth, box.clientHeight, .08, 1, .14).zoom
          : 1;
        const start = frameStrategy(fitZoom) === 'focus'
          ? pickFocus(cards.map((node) => ({ id: node.id, degree: node.data.degree, ts: node.data.item.ts })), live.current.currentId)
          : null;
        if (start) centerOnNode(start, false, duration);
        else fitView({ padding: .14, duration, minZoom: .08, maxZoom: 1 });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, layoutRevision, centerOnNode, fitView, getNode, getNodes, mode, motion, pendingFocus, viewportRef]);

  useEffect(() => {
    const previous = lastCurrent.current;
    lastCurrent.current = currentId;
    if (!currentId || previous === currentId || !follow || mode === 'all') return;
    const frame = requestAnimationFrame(() => centerOnNode(currentId, Boolean(live.current.selectedId)));
    return () => cancelAnimationFrame(frame);
  }, [currentId, follow, mode, centerOnNode]);

  return { centerOnNode, motion };
}
