import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Edge, NodeMouseHandler, OnNodesChange } from '@xyflow/react';
import { neighborInDirection, type ArrowKey } from '../canvas-state';
import { NODE_H, NODE_W, type CanvasNode } from '../graph';
import type { BoardNode, GraphSnapshot, ViewMode } from '../types';
import type { WorkspaceProjection } from './use-workspace-layout';

type Options = {
  snapshot: GraphSnapshot | null;
  byId: Map<string, BoardNode>;
  projection: WorkspaceProjection | null;
  nodes: CanvasNode[];
  edges: Edge[];
  mode: ViewMode;
  setMode: (mode: ViewMode) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  deepLink: RefObject<string | null>;
  pendingFocus: RefObject<string | null>;
  centerOnNode: (id: string) => void;
  onNodesChange: OnNodesChange<CanvasNode>;
  closeSidebar: () => void;
  scene3d: boolean;
  revealInGeneral?: boolean;
};

/** A single selection drives the inspector, URL and both canvases, including hidden-node reveal. */
export function useWorkspaceSelection({ snapshot, byId, projection, nodes, edges, mode, setMode, selectedId, setSelectedId, deepLink, pendingFocus, centerOnNode, onNodesChange, closeSidebar, scene3d, revealInGeneral = true }: Options) {
  const focusFrame = useRef<number | null>(null);
  const keyboardFrame = useRef<number | null>(null);
  useEffect(() => () => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    if (keyboardFrame.current !== null) cancelAnimationFrame(keyboardFrame.current);
  }, []);

  useEffect(() => {
    const target = deepLink.current;
    if (!target || !snapshot) return;
    deepLink.current = null;
    if (!byId.has(target)) {
      const url = new URL(location.href);
      url.searchParams.delete('node');
      history.replaceState(null, '', url);
      return;
    }
    pendingFocus.current = target;
    setSelectedId(target);
    if (revealInGeneral && !projection?.nodes.some((node) => node.id === target)) setMode('all');
  }, [snapshot, byId, projection, deepLink, pendingFocus, setSelectedId, setMode, revealInGeneral]);

  useEffect(() => {
    if (snapshot && selectedId && !byId.has(selectedId)) {
      if (pendingFocus.current === selectedId) pendingFocus.current = null;
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
      if (keyboardFrame.current !== null) cancelAnimationFrame(keyboardFrame.current);
      setSelectedId(null);
    }
  }, [snapshot, byId, selectedId, pendingFocus, setSelectedId]);

  const focusNode = useCallback((id: string) => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    if (keyboardFrame.current !== null) cancelAnimationFrame(keyboardFrame.current);
    setSelectedId(id);
    if (window.innerWidth < 1024) closeSidebar();
    if (!projection?.nodes.some((node) => node.id === id)) {
      pendingFocus.current = id;
      if (revealInGeneral) setMode('all');
    } else {
      pendingFocus.current = null;
      focusFrame.current = requestAnimationFrame(() => { focusFrame.current = null; centerOnNode(id); });
    }
  }, [projection, centerOnNode, setSelectedId, closeSidebar, pendingFocus, setMode, revealInGeneral]);

  const handleNodesChange: OnNodesChange<CanvasNode> = useCallback((changes) => {
    onNodesChange(changes);
    const selectedChange = changes.find((change) => change.type === 'select' && change.selected);
    if (selectedChange?.type === 'select' && !selectedChange.id.startsWith('__display_group_')) setSelectedId(selectedChange.id);
    // Old-layout deselect events must not clear a newer selection; pane click and Escape do that.
  }, [onNodesChange, setSelectedId]);

  const onNodeClick: NodeMouseHandler<CanvasNode> = useCallback((_event, node) => {
    if (!node.data.group) focusNode(node.id);
  }, [focusNode]);

  const clearSelection = useCallback(() => {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    if (keyboardFrame.current !== null) cancelAnimationFrame(keyboardFrame.current);
    pendingFocus.current = null;
    setSelectedId(null);
  }, [pendingFocus, setSelectedId]);

  const switchMode = useCallback((next: ViewMode) => {
    if (next === mode) return;
    clearSelection();
    setMode(next);
  }, [mode, clearSelection, setMode]);

  useEffect(() => {
    const onArrow = (event: KeyboardEvent) => {
      if (!selectedId || event.metaKey || event.ctrlKey || event.altKey || !event.key.startsWith('Arrow')) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable], [role="dialog"], [role="slider"], [role="menu"], [data-timeline]')) return;
      const boxes = nodes.filter((node) => !node.data.group).map((node) => {
        const parent = node.parentId ? nodes.find((candidate) => candidate.id === node.parentId) : null;
        return { id: node.id, x: node.position.x + (parent?.position.x || 0), y: node.position.y + (parent?.position.y || 0), w: Number(node.style?.width || NODE_W), h: Number(node.style?.height || NODE_H) };
      });
      const next = neighborInDirection(selectedId, boxes, edges, event.key as ArrowKey);
      // Capture even a dead end so React Flow does not nudge the focused card.
      event.preventDefault();
      event.stopPropagation();
      if (!next) return;
      focusNode(next);
      if (!scene3d) keyboardFrame.current = requestAnimationFrame(() => {
        keyboardFrame.current = null;
        document.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(next)}"]`)?.focus({ preventScroll: true });
      });
    };
    window.addEventListener('keydown', onArrow, true);
    return () => window.removeEventListener('keydown', onArrow, true);
  }, [selectedId, nodes, edges, focusNode, scene3d]);

  return { selected: selectedId ? byId.get(selectedId) || null : null, focusNode, clearSelection, switchMode, handleNodesChange, onNodeClick };
}
