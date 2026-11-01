import { useMemo, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import { focusedIds } from '../canvas-state';
import type { CanvasNode, EdgeStyle } from '../graph';
import type { ViewMode } from '../types';

/** Decorate selection without replacing unchanged React Flow cards or the shared layout. */
export function useWorkspacePresentation(nodes: CanvasNode[], edges: Edge[], selectedId: string | null, fresh: ReadonlySet<string>, mode: ViewMode, edgeStyle: EdgeStyle) {
  const cache = useRef(new Map<string, { source: CanvasNode; built: CanvasNode }>());
  const highlighted = useMemo(() => focusedIds(selectedId, edges), [selectedId, edges]);
  const displayNodes = useMemo(() => {
    const next = nodes.map((node) => {
      const selected = !node.data.group && node.id === selectedId;
      const muted = !node.data.group && Boolean(selectedId) && !highlighted.has(node.id);
      const freshFlag = fresh.has(node.id);
      const hit = cache.current.get(node.id);
      // Dragging replaces the source object: its new position must reach React Flow.
      if (hit && hit.source === node && hit.built.selected === selected && hit.built.data.muted === muted && hit.built.data.fresh === freshFlag) return hit.built;
      return { ...node, selected, data: { ...node.data, muted, fresh: freshFlag } };
    });
    cache.current = new Map(next.map((built, i) => [built.id, { source: nodes[i], built }]));
    return next;
  }, [nodes, selectedId, highlighted, fresh]);

  const displayEdges = useMemo(() => edges.map((edge) => {
    const active = Boolean(selectedId) && (edge.source === selectedId || edge.target === selectedId);
    const group = (edge.data as { group?: string } | undefined)?.group;
    const color = group && group !== 'link' ? `var(--rel-${group})` : 'var(--ink)';
    const recolor = (marker: Edge['markerEnd']) => marker && selectedId
      ? { ...(marker as object), color: active ? color : 'var(--line)' } as Edge['markerEnd']
      : marker;
    return {
      ...edge,
      type: 'routed',
      data: { ...edge.data, style: edgeStyle },
      markerEnd: recolor(edge.markerEnd),
      markerStart: recolor(edge.markerStart),
      className: `${edge.className || ''} ${active ? 'is-focused' : selectedId ? 'is-muted' : ''}`,
      label: active ? edge.label : undefined,
      // The overview draws only selected relations; weak links elsewhere wait for focus.
      hidden: !active && (mode === 'all' || (!selectedId && Boolean((edge.data as { quiet?: boolean } | undefined)?.quiet))),
      zIndex: active ? 10 : 0,
      style: { ...edge.style, opacity: selectedId ? active ? 1 : .12 : 1, strokeWidth: active ? 2 : edge.style?.strokeWidth },
    };
  }), [edges, selectedId, mode, edgeStyle]);

  return { highlighted, displayNodes, displayEdges };
}
