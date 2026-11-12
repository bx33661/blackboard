import { useMemo, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import { focusedIds } from '../canvas-state';
import type { CanvasNode, EdgeStyle } from '../graph';
import type { ViewMode } from '../types';

export type NodeChange = { kind: 'added' | 'updated'; fields: string[] };

/** Decorate selection without replacing unchanged React Flow cards or the shared layout. */
export function useWorkspacePresentation(nodes: CanvasNode[], edges: Edge[], selectedId: string | null, fresh: ReadonlySet<string>, mode: ViewMode, edgeStyle: EdgeStyle, changes: ReadonlyMap<string, NodeChange> | null = null) {
  const cache = useRef(new Map<string, { source: CanvasNode; built: CanvasNode }>());
  const highlighted = useMemo(() => focusedIds(selectedId, edges), [selectedId, edges]);
  const displayNodes = useMemo(() => {
    const next = nodes.map((node) => {
      const selected = !node.data.group && node.id === selectedId;
      const muted = !node.data.group && !node.data.auditRoles && Boolean(selectedId) && !highlighted.has(node.id);
      const freshFlag = fresh.has(node.id);
      const change = changes?.get(node.id);
      const hit = cache.current.get(node.id);
      // Dragging replaces the source object: its new position must reach React Flow.
      if (hit && hit.source === node && hit.built.selected === selected && hit.built.data.muted === muted && hit.built.data.fresh === freshFlag
        && hit.built.data.change === change?.kind && hit.built.data.changeFields === change?.fields) return hit.built;
      return { ...node, selected, data: { ...node.data, muted, fresh: freshFlag, change: change?.kind, changeFields: change?.fields } };
    });
    cache.current = new Map(next.map((built, i) => [built.id, { source: nodes[i], built }]));
    return next;
  }, [nodes, selectedId, highlighted, fresh, changes]);

  const audit = nodes.some((node) => Boolean(node.data.auditRoles));
  const displayEdges = useMemo(() => edges.map((edge) => {
    const active = Boolean(selectedId) && (edge.source === selectedId || edge.target === selectedId);
    const group = (edge.data as { group?: string } | undefined)?.group;
    const color = group && group !== 'link' ? `var(--rel-${group})` : 'var(--ink)';
    const recolor = (marker: Edge['markerEnd']) => marker && selectedId && !audit
      ? { ...(marker as object), color: active ? color : 'var(--line)' } as Edge['markerEnd']
      : marker;
    return {
      ...edge,
      type: 'routed',
      data: { ...edge.data, style: edgeStyle },
      markerEnd: recolor(edge.markerEnd),
      markerStart: recolor(edge.markerStart),
      className: `${edge.className || ''} ${active ? 'is-focused' : selectedId && !audit ? 'is-muted' : ''}`,
      label: active || audit ? edge.label : undefined,
      // Audit keeps the local argument readable while the Inspector follows individual records.
      hidden: !audit && !active && (mode === 'all' || (!selectedId && Boolean((edge.data as { quiet?: boolean } | undefined)?.quiet))),
      zIndex: active ? 10 : 0,
      style: { ...edge.style, opacity: selectedId && !audit ? active ? 1 : .12 : 1, strokeWidth: active ? 2 : edge.style?.strokeWidth },
    };
  }), [audit, edges, selectedId, mode, edgeStyle]);

  return { highlighted, displayNodes, displayEdges };
}
