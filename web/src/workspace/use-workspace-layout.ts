import { useEffect, useRef, useState } from 'react';
import { useEdgesState, useNodesState, useUpdateNodeInternals, type Edge } from '@xyflow/react';
import { layoutGraph, type CanvasNode, type Positions } from '../graph';
import type { ViewMode } from '../types';
import { layoutAudit } from './audit-layout';

export type WorkspaceProjection = { nodes: CanvasNode[]; edges: Edge[]; audit?: boolean };

/** One layout supplies both canvases. Content refreshes keep dragged positions and routed edges. */
export function useWorkspaceLayout(projection: WorkspaceProjection | null, mode: ViewMode, direction: 'RIGHT' | 'DOWN') {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const [layoutMode, setLayoutMode] = useState<ViewMode | null>(null);
  const [laying, setLaying] = useState(0);
  const [overviewColumns, setOverviewColumns] = useState<1 | 2>(() => window.innerWidth > 1100 ? 2 : 1);
  const layoutKey = useRef('');
  const lastPositions = useRef(new Map<string, Positions>());
  const laidOutDirection = useRef<string | null>(null);
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    const resize = () => setOverviewColumns(window.innerWidth > 1100 ? 2 : 1);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useEffect(() => {
    if (!projection) return;
    const key = JSON.stringify([mode, direction, overviewColumns, projection.audit, projection.nodes.map((node) => [node.id, node.data.auditRoles]), projection.edges.map((edge) => [edge.id, edge.source, edge.target])]);
    if (layoutKey.current === key) {
      const fresh = new Map(projection.nodes.map((node) => [node.id, node]));
      setNodes((previous) => previous.map((node) => {
        const next = fresh.get(node.id);
        return next ? { ...node, style: next.style, data: { ...node.data, ...next.data } } : node;
      }));
      setEdges((previous) => {
        const routes = new Map(previous.map((edge) => [edge.id, (edge.data as { route?: unknown } | undefined)?.route]));
        return projection.edges.map((edge) => ({ ...edge, data: { ...edge.data, route: routes.get(edge.id) } }));
      });
      return;
    }
    let cancelled = false;
    const viewKey = `${projection.audit ? 'audit' : 'general'}:${mode}:${direction}`;
    const slow = window.setTimeout(() => setLaying(projection.nodes.length), 300);
    const layout = projection.audit ? Promise.resolve(layoutAudit(projection.nodes, projection.edges)) : layoutGraph(projection.nodes, projection.edges, direction, mode === 'all', overviewColumns, lastPositions.current.get(viewKey));
    layout.then((layouted) => {
      if (cancelled) return;
      lastPositions.current.set(viewKey, new Map(layouted.nodes.map((node) => [node.id, node.position])));
      layoutKey.current = key;
      setNodes(layouted.nodes);
      setEdges(layouted.edges);
      setLayoutMode(mode);
      setLayoutRevision((revision) => revision + 1);
      // Direction changes move handles: ask React Flow to remeasure once for the batch.
      if (laidOutDirection.current && laidOutDirection.current !== direction) updateNodeInternals(layouted.nodes.map((node) => node.id));
      laidOutDirection.current = direction;
    }).finally(() => { clearTimeout(slow); if (!cancelled) setLaying(0); });
    return () => { cancelled = true; clearTimeout(slow); };
  }, [projection, mode, direction, overviewColumns, setNodes, setEdges, updateNodeInternals]);

  return { nodes, edges, onNodesChange, layoutRevision, layoutMode, laying };
}
