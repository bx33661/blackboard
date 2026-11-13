import type { BoardEdge, BoardNode, GraphSnapshot } from '../types';
import { values } from '../types';

export const isAuditIssue = (node: BoardNode) => node.type === 'question' || node.type === 'goal';
export const isAuditCandidate = (node: BoardNode) => ['finding', 'vuln', 'hypothesis'].includes(node.type);
/** Claims are independently reviewable subclaims, never top-level candidates. */
export const isAuditClaim = (node: BoardNode) => node.type === 'claim';
export type ArgumentRole = 'support' | 'contradiction' | 'condition' | 'related';
export type AuditNodeRole = ArgumentRole | 'root' | 'premise' | 'candidate' | 'localContradiction' | 'localCondition';
export const AUDIT_BATCH = 12;
const roles: ArgumentRole[] = ['support', 'contradiction', 'condition', 'related'];
const membershipKinds: Record<string, true> = { answers: true, 'related-to': true, refines: true };
/** A claim child is authored as child→supports parent, parent→derived-from child, or parent→depends-on child. */
const claimConclusionKinds: Record<string, true> = { supports: true, proves: true, prove: true };
const claimContextKinds: Record<string, true> = { 'derived-from': true, 'depends-on': true };
const emptyGroups = (): Record<ArgumentRole, BoardEdge[]> => ({ support: [], contradiction: [], condition: [], related: [] });

/** Direction is authored: A supports B, B derived-from A, B depends-on C. */
export function argumentRole(edge: BoardEdge, conclusion: string): ArgumentRole {
  if ((edge.to === conclusion && ['supports', 'proves', 'prove'].includes(edge.kind)) ||
    (edge.from === conclusion && edge.kind === 'derived-from')) return 'support';
  if (edge.kind === 'contradicts' && edge.to === conclusion) return 'contradiction';
  if (edge.from === conclusion && edge.kind === 'depends-on') return 'condition';
  return 'related';
}

export type AuditIndex = {
  snapshot: GraphSnapshot; nodes: BoardNode[]; byId: Map<string, BoardNode>; edges: BoardEdge[];
  nodeOrder: Map<string, number>; edgeOrder: Map<string, number>; adjacency: Map<string, BoardEdge[]>;
  arguments: Map<string, Record<ArgumentRole, BoardEdge[]>>;
  issues: BoardNode[]; candidates: BoardNode[]; membership: Map<string, BoardNode[]>;
  reverseMembership: Map<string, BoardNode[]>; unassigned: BoardNode[];
};

/** Built once per immutable snapshot, with no issue × candidate × edge scans. */
export function buildAuditIndex(snapshot: GraphSnapshot): AuditIndex {
  const nodes = values(snapshot.nodes);
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  const edges = values(snapshot.edges).filter((edge) => byId.has(edge.from) && byId.has(edge.to));
  const edgeOrder = new Map(edges.map((edge, index) => [edge.id, index]));
  const adjacency = new Map<string, BoardEdge[]>();
  const argumentsByNode = new Map<string, Record<ArgumentRole, BoardEdge[]>>();
  const issues = nodes.filter(isAuditIssue);
  const candidates = nodes.filter(isAuditCandidate);
  const memberships = new Map<string, Set<string>>(candidates.map((node) => [node.id, new Set()]));
  for (const candidate of candidates) {
    for (const tag of Array.isArray(candidate.tags) ? candidate.tags : []) {
      if (typeof tag !== 'string' || !tag.startsWith('issue=')) continue;
      const issue = byId.get(tag.slice(6));
      if (issue && isAuditIssue(issue)) memberships.get(candidate.id)!.add(issue.id);
    }
  }
  for (const edge of edges) {
    for (const id of new Set([edge.from, edge.to])) {
      const list = adjacency.get(id) ?? [];
      list.push(edge);
      adjacency.set(id, list);
      const groups = argumentsByNode.get(id) ?? emptyGroups();
      groups[argumentRole(edge, id)].push(edge);
      argumentsByNode.set(id, groups);
    }
    if (!Object.hasOwn(membershipKinds, edge.kind)) continue;
    for (const [candidateId, issueId] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      const issue = byId.get(issueId)!;
      if (memberships.has(candidateId) && isAuditIssue(issue)) memberships.get(candidateId)!.add(issueId);
    }
  }
  const membership = new Map<string, BoardNode[]>(issues.map((issue) => [issue.id, []]));
  const reverseMembership = new Map<string, BoardNode[]>();
  const unassigned: BoardNode[] = [];
  for (const candidate of candidates) {
    const ids = [...memberships.get(candidate.id)!].sort((a, b) => nodeOrder.get(a)! - nodeOrder.get(b)!);
    reverseMembership.set(candidate.id, ids.map((id) => byId.get(id)!));
    if (!ids.length) unassigned.push(candidate);
    for (const id of ids) membership.get(id)!.push(candidate);
  }
  return { snapshot, nodes, byId, edges, nodeOrder, edgeOrder, adjacency, arguments: argumentsByNode, issues, candidates, membership, reverseMembership, unassigned };
}

/** The one explicit authored link that makes `childId` a claim child of `parentId`, if any. */
export function claimChildEdge(index: AuditIndex, parentId: string, childId: string): BoardEdge | null {
  if (parentId === childId || !index.byId.has(parentId) || !index.byId.has(childId)) return null;
  for (const edge of index.adjacency.get(parentId) ?? []) {
    if (edge.from === childId && edge.to === parentId && claimConclusionKinds[edge.kind]) return edge;
    if (edge.from === parentId && edge.to === childId && claimContextKinds[edge.kind]) return edge;
  }
  return null;
}

export type AuditClaimNotice = { kind: 'missing' | 'invalid' | 'type' | 'cycle'; id: string; parent?: BoardNode };
export type AuditClaimPath = { claims: BoardNode[]; edges: BoardEdge[]; notice: AuditClaimNotice | null };

/**
 * Walk the requested claim path only through explicit links. A stale, invalid or repeated step stops
 * at the last safe prefix; it never invents ownership, reorders arrows or follows an inferred relation.
 */
export function resolveClaimPath(index: AuditIndex, anchorId: string | null, ids: readonly string[]): AuditClaimPath {
  const claims: BoardNode[] = [];
  const edges: BoardEdge[] = [];
  const seen = new Set<string>();
  let parentId = anchorId;
  let notice: AuditClaimNotice | null = null;
  for (const id of ids) {
    if (!id) continue;
    const node = index.byId.get(id);
    if (!node) { notice = { kind: 'missing', id }; break; }
    if (!isAuditClaim(node)) { notice = { kind: 'type', id }; break; }
    if (seen.has(id)) { notice = { kind: 'cycle', id }; break; }
    if (parentId) {
      const edge = claimChildEdge(index, parentId, id);
      if (!edge) { notice = { kind: 'invalid', id, parent: index.byId.get(parentId) }; break; }
      edges.push(edge);
    }
    claims.push(node);
    seen.add(id);
    parentId = id;
  }
  return { claims, edges, notice };
}

/** The URL carries one repeated `claim` parameter per path level, outermost first. */
export function readClaimPath(params: Pick<URLSearchParams, 'getAll'>): string[] {
  return params.getAll('claim').filter((id) => typeof id === 'string' && id.length > 0);
}

export function writeClaimPath(url: URL, ids: readonly string[]): void {
  url.searchParams.delete('claim');
  for (const id of ids) if (id) url.searchParams.append('claim', id);
}

/** Expansion belongs to one reading root; snapshot refreshes keep it, a new issue/candidate/claim path resets it. */
export function auditRootKey(issueId: string | null, candidateId: string | null, claimPath: readonly string[]): string {
  return JSON.stringify([issueId, candidateId, claimPath]);
}

export type AuditExpansion = Record<string, number>;
export type AuditPage<T> = { key: string; items: T[]; total: number; shown: number; hidden: number; limit: number; open: boolean };
export type AuditExpansionAction = 'more' | 'collapse' | 'toggle';
export function changeAuditExpansion(expansion: AuditExpansion, key: string, action: AuditExpansionAction, defaultLimit = AUDIT_BATCH): AuditExpansion {
  const current = expansion[key] ?? defaultLimit;
  return { ...expansion, [key]: action === 'more' ? current + AUDIT_BATCH : action === 'collapse' ? defaultLimit : current > 0 ? 0 : AUDIT_BATCH };
}

/** A selected row is pinned without opening all the preceding rows. Order remains authored. */
export function auditPage<T>(items: T[], key: string, expansion: AuditExpansion, defaultLimit = AUDIT_BATCH, pinned?: (item: T) => boolean): AuditPage<T> {
  const limit = expansion[key] ?? defaultLimit;
  const shownItems = limit > 0 ? items.filter((item, index) => index < limit || Boolean(pinned?.(item))) : [];
  return { key, items: shownItems, total: items.length, shown: shownItems.length, hidden: items.length - shownItems.length, limit, open: limit > 0 };
}

export type AuditLocalContext = { node: BoardNode; groups: Record<ArgumentRole, BoardEdge[]>; pages: Record<ArgumentRole, AuditPage<BoardEdge>> };
export type AuditSelection = {
  index: AuditIndex; issues: BoardNode[]; candidates: BoardNode[]; issue: BoardNode | null; candidate: BoardNode | null;
  root: BoardNode | null; members: BoardNode[]; groups: Record<ArgumentRole, BoardEdge[]>;
  pages: Record<ArgumentRole, AuditPage<BoardEdge>>; premises: AuditPage<BoardEdge>;
  /** Safe valid prefix of the requested claim path; links keep their authored direction. */
  claimPath: BoardNode[]; claimPathEdges: BoardEdge[]; claimNotice: AuditClaimNotice | null;
  /** Bounded direct child-claim list: explicit supports/derived-from/depends-on links only. */
  claims: AuditPage<BoardEdge>;
  catalog: Record<'issues' | 'members' | 'candidateIssues' | 'unassigned' | 'records', AuditPage<BoardNode>>;
  contexts: Map<string, AuditLocalContext>; argumentEdges: Set<string>; nodeRoles: Map<string, AuditNodeRole[]>;
  outsideIssue: boolean; missingIssue: boolean; missingCandidate: boolean; candidateIssues: BoardNode[];
  unassigned: BoardNode[]; records: BoardNode[]; visibleIds: Set<string>; snapshot: GraphSnapshot;
};

export function selectAudit(index: AuditIndex, issueId: string | null, candidateId: string | null, selectedId: string | null = null, expansion: AuditExpansion = {}, claimIds: readonly string[] = []): AuditSelection {
  const { snapshot, byId, adjacency, issues, candidates } = index;
  const namedIssue = issueId ? byId.get(issueId) : null;
  const namedCandidate = candidateId ? byId.get(candidateId) : null;
  const issue = namedIssue && isAuditIssue(namedIssue) ? namedIssue : null;
  const candidate = namedCandidate && isAuditCandidate(namedCandidate) ? namedCandidate : null;
  // The candidate is the anchor when present; without one a claim still reads standalone.
  const resolvedClaims = resolveClaimPath(index, candidate?.id ?? null, claimIds);
  const claimPathNodes = resolvedClaims.claims;
  const root = claimPathNodes.length ? claimPathNodes[claimPathNodes.length - 1] : candidate ?? issue;
  const members = issue ? index.membership.get(issue.id)! : candidates;
  const memberIds = new Set(members.map((node) => node.id));
  const candidateIssues = candidate ? index.reverseMembership.get(candidate.id)! : [];
  const direct = root ? index.arguments.get(root.id) ?? emptyGroups() : emptyGroups();
  const groups = { ...direct, related: [...direct.related] };
  const peer = (edge: BoardEdge, id: string) => edge.from === id ? edge.to : edge.from;
  const pinEdge = (edge: BoardEdge) => selectedId !== root?.id && (edge.from === selectedId || edge.to === selectedId);
  // One bounded row per direct child claim, keeping the first authored relation as its context.
  const childClaimEdges = new Map<string, BoardEdge>();
  if (root) for (const edge of [...direct.support, ...direct.condition]) {
    const id = peer(edge, root.id);
    const node = byId.get(id);
    if (!node || !isAuditClaim(node) || !claimChildEdge(index, root.id, id)) continue;
    if (!childClaimEdges.has(id)) childClaimEdges.set(id, edge);
  }
  const claims = auditPage(
    [...childClaimEdges.values()].sort((a, b) => index.edgeOrder.get(a.id)! - index.edgeOrder.get(b.id)!),
    'claims', expansion, AUDIT_BATCH, (edge) => peer(edge, root!.id) === selectedId,
  );
  const nodeRoles = new Map<string, AuditNodeRole[]>();
  const argumentEdges = new Set<string>();
  const localEdges = new Map<string, BoardEdge>();
  const add = (id: string, role: AuditNodeRole) => {
    const current = nodeRoles.get(id) ?? [];
    if (!current.includes(role)) nodeRoles.set(id, [...current, role]);
  };
  const showEdge = (edge: BoardEdge, owner: string, role: AuditNodeRole) => {
    if (!root) return;
    const id = peer(edge, owner);
    if (id !== root.id) add(id, role);
    argumentEdges.add(edge.id);
    localEdges.set(edge.id, edge);
  };
  const pages = Object.fromEntries(roles.map((role) => [role, auditPage(groups[role], role, expansion, role === 'related' ? 0 : AUDIT_BATCH, pinEdge)])) as Record<ArgumentRole, AuditPage<BoardEdge>>;
  const catalog = {
    issues: auditPage(issues, 'issues', expansion, AUDIT_BATCH, (node) => node.id === issue?.id),
    members: auditPage(members, 'members', expansion, AUDIT_BATCH, (node) => node.id === candidate?.id || node.id === selectedId),
    candidateIssues: auditPage(candidateIssues, 'candidateIssues', expansion),
    unassigned: auditPage(index.unassigned, 'unassigned', expansion, 0, (node) => node.id === selectedId),
    records: auditPage(index.nodes, 'records', expansion, root ? 0 : AUDIT_BATCH, (node) => node.id === selectedId),
  };
  const contexts = new Map<string, AuditLocalContext>();
  const context = (id: string) => {
    if (contexts.has(id) || id === root?.id) return;
    const node = byId.get(id)!;
    const local = index.arguments.get(id) ?? emptyGroups();
    contexts.set(id, { node, groups: local, pages: Object.fromEntries(roles.map((role) => [role, auditPage(local[role], `local:${id}:${role}`, expansion, 0, (edge) => selectedId !== id && pinEdge(edge))])) as Record<ArgumentRole, AuditPage<BoardEdge>> });
  };
  const premiseEdges = new Map<string, BoardEdge>();
  const premiseOwners = new Map<string, string>();
  const supportParents = new Map<string, BoardEdge>();
  for (const edge of direct.support) {
    const id = peer(edge, root!.id);
    supportParents.set(id, edge);
    const node = byId.get(id)!;
    if (isAuditIssue(node) || isAuditCandidate(node)) continue;
    for (const premise of index.arguments.get(id)?.support ?? []) {
      if (peer(premise, id) === root!.id) continue;
      premiseEdges.set(premise.id, premise);
      premiseOwners.set(premise.id, id);
    }
  }
  const allPremises = [...premiseEdges.values()].sort((a, b) => index.edgeOrder.get(a.id)! - index.edgeOrder.get(b.id)!);
  const pinPremise = (edge: BoardEdge) => peer(edge, premiseOwners.get(edge.id)!) === selectedId;
  const visibleSupports = new Set(pages.support.items.map((edge) => peer(edge, root!.id)));
  const premiseLimit = expansion.premises ?? AUDIT_BATCH;
  const eligiblePremises = allPremises.filter((edge, position) => visibleSupports.has(premiseOwners.get(edge.id)!) || pinPremise(edge) || (premiseLimit > AUDIT_BATCH && position < premiseLimit));
  const premises = auditPage(eligiblePremises, 'premises', expansion, AUDIT_BATCH, pinPremise);
  premises.total = allPremises.length;
  premises.hidden = allPremises.length - premises.shown;
  const requiredSupportEdges = new Set(pages.support.items.map((edge) => edge.id));
  for (const edge of premises.items) requiredSupportEdges.add(supportParents.get(premiseOwners.get(edge.id)!)!.id);
  pages.support.items = direct.support.filter((edge) => requiredSupportEdges.has(edge.id));
  pages.support.shown = pages.support.items.length;
  pages.support.hidden = pages.support.total - pages.support.shown;
  const paths = new Map<string, { edge: BoardEdge; owner: string; role: AuditNodeRole }>();
  if (root) for (const role of ['support', 'contradiction', 'condition'] as const) for (const edge of direct[role]) paths.set(peer(edge, root.id), { edge, owner: root.id, role });
  for (const edge of allPremises) {
    const owner = premiseOwners.get(edge.id)!;
    const id = peer(edge, owner);
    if (!paths.has(id)) paths.set(id, { edge, owner, role: 'premise' });
  }
  if (root) {
    add(root.id, 'root');
    for (const edge of claims.items) {
      const role = argumentRole(edge, root.id);
      showEdge(edge, root.id, role === 'condition' ? 'condition' : 'support');
    }
    for (const role of roles) for (const edge of pages[role].items) showEdge(edge, root.id, role);
    for (const edge of premises.items) {
      const owner = premiseOwners.get(edge.id)!;
      showEdge(supportParents.get(owner)!, root.id, 'support');
      const id = peer(edge, owner);
      if (!nodeRoles.has(id)) add(id, 'premise');
      argumentEdges.add(edge.id);
      localEdges.set(edge.id, edge);
    }
    if (!candidate && issue && root === issue) {
      for (const member of catalog.members.items) add(member.id, 'candidate');
      for (const edge of adjacency.get(issue.id) ?? []) {
        if (nodeRoles.has(peer(edge, issue.id)) && memberIds.has(peer(edge, issue.id)) && Object.hasOwn(membershipKinds, edge.kind)) localEdges.set(edge.id, edge);
      }
    }
    if (selectedId && selectedId !== root.id) for (const edge of adjacency.get(selectedId) ?? []) {
      const owner = peer(edge, selectedId);
      const path = paths.get(owner);
      if (!path) continue;
      if (!nodeRoles.has(owner)) {
        if (path.owner !== root.id) showEdge(supportParents.get(path.owner)!, root.id, 'support');
        showEdge(path.edge, path.owner, path.role);
      }
      const role = argumentRole(edge, owner);
      showEdge(edge, owner, role === 'contradiction' ? 'localContradiction' : role === 'condition' ? 'localCondition' : 'related');
    }
    if (selectedId && byId.has(selectedId)) {
      if (!nodeRoles.has(selectedId)) add(selectedId, 'related');
      context(selectedId);
    }
    for (const [id, nodeRole] of nodeRoles) if (nodeRole.some((role) => ['support', 'premise', 'condition', 'localCondition'].includes(role))) context(id);
    // Appended contexts have closed pages by default. Only reader-expanded rows reveal more nodes.
    for (const [id, item] of contexts) {
      for (const role of roles) for (const edge of item.pages[role].items) {
        showEdge(edge, id, role === 'contradiction' ? 'localContradiction' : role === 'condition' ? 'localCondition' : 'related');
        if (role === 'condition' || role === 'support') context(peer(edge, id));
      }
    }
    const boundary = new Map(groups.related.map((edge) => [edge.id, edge]));
    const structuralEdges = new Set([...direct.support, ...direct.contradiction, ...direct.condition, ...allPremises].map((edge) => edge.id));
    const boundaryIds = new Set<string>();
    for (const edge of [...direct.support, ...direct.contradiction, ...direct.condition, ...allPremises]) {
      boundaryIds.add(edge.from);
      boundaryIds.add(edge.to);
    }
    if (!candidate && issue && root === issue) for (const member of members) boundaryIds.add(member.id);
    for (const id of boundaryIds) for (const edge of adjacency.get(id) ?? []) {
      if (!structuralEdges.has(edge.id)) boundary.set(edge.id, edge);
    }
    groups.related = [...boundary.values()].sort((a, b) => index.edgeOrder.get(a.id)! - index.edgeOrder.get(b.id)!);
    pages.related = auditPage(groups.related, 'related', expansion, 0, pinEdge);
    for (const edge of pages.related.items) {
      if (!nodeRoles.has(edge.from)) add(edge.from, 'related');
      if (!nodeRoles.has(edge.to)) add(edge.to, 'related');
      localEdges.set(edge.id, edge);
    }
  }
  if (selectedId && byId.has(selectedId)) {
    if (!nodeRoles.has(selectedId)) add(selectedId, 'related');
    context(selectedId);
    for (const edge of adjacency.get(selectedId) ?? []) if (nodeRoles.has(edge.from) && nodeRoles.has(edge.to)) localEdges.set(edge.id, edge);
  }
  if (!root && !nodeRoles.size && index.nodes.length === 1) add(index.nodes[0].id, 'related');
  const visibleIds = new Set(nodeRoles.keys());
  const visibleNodes = [...visibleIds].sort((a, b) => index.nodeOrder.get(a)! - index.nodeOrder.get(b)!).map((id) => byId.get(id)!);
  return {
    index, issues, candidates, issue, candidate, root, members, groups, pages, premises,
    claimPath: claimPathNodes, claimPathEdges: resolvedClaims.edges, claimNotice: resolvedClaims.notice, claims,
    catalog, contexts, argumentEdges, nodeRoles,
    outsideIssue: Boolean(issue && candidate && !memberIds.has(candidate.id)), candidateIssues,
    missingIssue: Boolean(issueId && !issue), missingCandidate: Boolean(candidateId && !candidate),
    unassigned: index.unassigned, records: index.nodes, visibleIds,
    snapshot: { ...snapshot, nodes: visibleNodes, edges: [...localEdges.values()].sort((a, b) => index.edgeOrder.get(a.id)! - index.edgeOrder.get(b.id)!) },
  };
}
