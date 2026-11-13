import type { Edge } from '@xyflow/react';
import { NODE_H, NODE_W, type CanvasNode } from '../graph';
import type { AuditNodeRole } from './audit';

/** Reading roles determine placement; arrows and labels retain the authored relation direction. */
export function layoutAudit(nodes: CanvasNode[], edges: Edge[]) {
  const lanes: AuditNodeRole[] = ['root', 'premise', 'support', 'contradiction', 'condition', 'candidate', 'localContradiction', 'localCondition', 'related'];
  const x: Record<AuditNodeRole, number> = { premise: 0, support: NODE_W + 100, root: (NODE_W + 100) * 2, contradiction: (NODE_W + 100) * 3, condition: (NODE_W + 100) * 2, candidate: (NODE_W + 100) * 3, localContradiction: 0, localCondition: NODE_W + 100, related: (NODE_W + 100) * 4 };
  const nextY = new Map<AuditNodeRole, number>(lanes.map((role) => [role, 0]));
  for (const [below, above] of [['condition', 'root'], ['candidate', 'contradiction'], ['localContradiction', 'premise'], ['localCondition', 'support']] as const) {
    nextY.set(below, nodes.filter((node) => lanes.find((role) => node.data.auditRoles?.includes(role)) === above).reduce((height, node) => height + Number(node.style?.height ?? NODE_H) + 72, 0));
  }
  return {
    nodes: nodes.map((node) => {
      const roles = node.data.auditRoles ?? ['related'];
      const lane = lanes.find((role) => roles.includes(role)) ?? 'related';
      const y = nextY.get(lane)!;
      const height = Number(node.style?.height ?? node.height ?? NODE_H);
      nextY.set(lane, y + height + 72);
      return { ...node, width: NODE_W, height, initialWidth: NODE_W, initialHeight: height, position: { x: x[lane], y }, data: { ...node.data, direction: 'RIGHT' as const } };
    }),
    edges: edges.map((edge) => ({ ...edge, data: { ...edge.data, route: undefined } })),
  };
}
