import { useMemo, useState } from 'react';
import { project, type RelationGroup } from '../graph';
import { filterActive, filterNodes, type NodeFilter } from '../presentation';
import type { GraphSnapshot, ViewMode } from '../types';
import { selectWorkspaceAgent, selectWorkspaceSnapshot } from './selectors';
import { AUDIT_BATCH, buildAuditIndex, changeAuditExpansion, selectAudit, type AuditExpansion, type AuditExpansionAction } from './audit';

/** Keep snapshot catalogues stable when only the reader's view, selection or filters change. */
export function useWorkspaceData(snapshot: GraphSnapshot | null, mode: ViewMode, agentId: string, filter: NodeFilter, auditLocation?: { issueId: string | null; candidateId: string | null; selectedId: string | null }) {
  const board = useMemo(() => selectWorkspaceSnapshot(snapshot), [snapshot]);
  const agent = useMemo(() => selectWorkspaceAgent(snapshot, board, agentId), [snapshot, board, agentId]);
  const auditIndex = useMemo(() => snapshot ? buildAuditIndex(snapshot) : null, [snapshot]);
  const rootKey = JSON.stringify([auditLocation?.issueId, auditLocation?.candidateId]);
  const [expanded, setExpanded] = useState<{ rootKey: string; values: AuditExpansion }>({ rootKey, values: {} });
  // Reset on a reader root change, while snapshot/SSE refreshes retain the displayed row budget.
  if (expanded.rootKey !== rootKey) setExpanded({ rootKey, values: {} });
  const expansion = expanded.rootKey === rootKey ? expanded.values : {};
  const expandAudit = (key: string, action: AuditExpansionAction, defaultLimit = AUDIT_BATCH) => setExpanded((previous) => ({ rootKey, values: changeAuditExpansion(previous.rootKey === rootKey ? previous.values : {}, key, action, defaultLimit) }));
  const audit = useMemo(() => auditIndex && auditLocation ? selectAudit(auditIndex, auditLocation.issueId, auditLocation.candidateId, auditLocation.selectedId, expansion) : null, [auditIndex, auditLocation?.issueId, auditLocation?.candidateId, auditLocation?.selectedId, expansion]);
  const projection = useMemo(() => {
    if (!snapshot) return null;
    if (!audit) return project(snapshot, mode, '', agentId);
    const local = project(audit.snapshot, 'all', '', agentId);
    return {
      ...local, audit: true,
      nodes: local.nodes.map((node) => {
        const context = audit.contexts.get(node.id);
        const auditCounts = context ? { contradiction: context.groups.contradiction.length, condition: context.groups.condition.length } : undefined;
        const hasBadges = auditCounts && (auditCounts.contradiction > 0 || auditCounts.condition > 0);
        const height = Number(node.style?.height ?? node.height ?? 128) + (hasBadges ? 72 : 24);
        return { ...node, width: node.width ?? 288, height, initialWidth: node.initialWidth ?? 288, initialHeight: height, style: { ...node.style, height }, data: { ...node.data, auditRoles: audit.nodeRoles.get(node.id), auditCounts } };
      }),
      edges: local.edges.map((edge) => ({ ...edge, data: { ...edge.data, quiet: false } })),
      hidden: 0,
    };
  }, [snapshot, mode, agentId, audit]);
  const results = useMemo(() => filterActive(filter) ? filterNodes(board.paletteNodes, filter) : null, [board.paletteNodes, filter]);
  const legend = useMemo(() => {
    const types = new Set<string>();
    projection?.nodes.forEach((node) => { if (!node.data.group) types.add(node.data.item.type); });
    const groups = new Set<RelationGroup>();
    projection?.edges.forEach((edge) => {
      // project() assigns every rendered edge a relation family.
      const data = edge.data as { group: RelationGroup };
      groups.add(data.group);
    });
    return { types: [...types].sort(), groups: [...groups] };
  }, [projection]);

  return { board, agent, audit, expandAudit, projection, results, legend };
}
