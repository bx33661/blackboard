// Read-only quality hints for a Pinwhy board. Lint never changes the graph and
// never blocks an Agent action; it only makes context drift visible.

import { currentCursor } from './model.js';

function issue(level, code, message, nodeIds = [], detail = {}) {
  return { level, code, message, nodeIds, ...detail };
}

export function lintGraph(g, { maxTitleLength = 80 } = {}) {
  const nodes = Object.values(g.nodes || {});
  const edges = Object.values(g.edges || {});
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  const outgoing = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (incoming.has(e.to)) incoming.get(e.to).push(e);
    if (outgoing.has(e.from)) outgoing.get(e.from).push(e);
  }

  const issues = [];
  const { corruptLines = 0, rejected = 0 } = g.integrity || {};
  if (corruptLines || rejected) {
    const parts = [];
    if (corruptLines) parts.push(`${corruptLines} unparseable log lines`);
    if (rejected) parts.push(`${rejected} invalid node or relation events`);
    issues.push(issue(
      'warn', 'log-integrity',
      `Replay skipped ${parts.join(' and ')}; these records are absent from the graph. Inspect .pinwhy/events.jsonl.`,
      [], { corruptLines, rejected },
    ));
  }
  const { futureEvents = 0, unknownOps = 0 } = g.integrity || {};
  if (futureEvents) {
    issues.push(issue(
      'warn', 'log-version',
      `Replay skipped ${futureEvents} events written with a newer event format. Writes are disabled to prevent ID conflicts; switch to a newer Pinwhy version.`,
      [], { futureEvents },
    ));
  }
  if (unknownOps) {
    issues.push(issue(
      'info', 'unknown-events',
      `${unknownOps} events use operations this version does not recognize and were ignored. A newer version may be able to read them.`,
      [], { unknownOps },
    ));
  }

  // Only report loss explicitly recorded by the writer. A legacy field at a
  // length limit is not evidence that its original input was longer.
  const truncatedRecords = [
    ...nodes.map(record => ({ kind: 'node', record })),
    ...edges.map(record => ({ kind: 'edge', record })),
    ...Object.values(g.checkpoints || {}).map(record => ({ kind: 'checkpoint', record })),
  ].filter(({ record }) => {
    const value = record.inputTruncation;
    return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length;
  }).map(({ kind, record }) => ({ kind, id: record.id, inputTruncation: structuredClone(record.inputTruncation) }));
  if (truncatedRecords.length) {
    const ids = kind => truncatedRecords.filter(record => record.kind === kind).map(record => record.id);
    issues.push(issue(
      'warn', 'input-truncated-records',
      `${truncatedRecords.length} records were truncated at write time. Their stored text is incomplete; recorded confidence is unchanged.`,
      ids('node').slice(0, 20),
      { count: truncatedRecords.length, edgeIds: ids('edge').slice(0, 20),
        checkpointIds: ids('checkpoint').slice(0, 20), records: truncatedRecords.slice(0, 20) },
    ));
  }

  const long = nodes.filter((n) => [...String(n.title || '')].length > maxTitleLength);
  if (long.length) {
    issues.push(issue(
      'warn', 'long-titles',
      `${long.length} node titles exceed ${maxTitleLength} characters; use detail for evidence and process notes.`,
      long.slice(0, 20).map((n) => n.id),
      { count: long.length },
    ));
  }

  const isolated = nodes.filter((n) => !linked.has(n.id));
  if (isolated.length) {
    const byType = {};
    for (const n of isolated) byType[n.type] = (byType[n.type] || 0) + 1;
    issues.push(issue(
      isolated.length > nodes.length / 2 ? 'warn' : 'info',
      'isolated-nodes',
      `${isolated.length}/${nodes.length} nodes have no relations; they remain available as unconnected records.`,
      isolated.slice(0, 20).map((n) => n.id),
      { count: isolated.length, byType },
    ));
  }

  // Edges read "from <kind> to". A conclusion is evidenced by something that
  // supports/proves it (incoming), or by being derived from / caused by something (outgoing).
  const EVIDENCE_IN = ['supports', 'proves', 'prove', 'derive', 'produce'];
  const EVIDENCE_OUT = ['derived-from', 'caused-by'];
  const unsupported = nodes.filter((n) => {
    if (!['finding', 'vuln'].includes(n.type) || n.status === 'superseded') return false;
    return !(incoming.get(n.id) || []).some((e) => EVIDENCE_IN.includes(e.kind))
      && !(outgoing.get(n.id) || []).some((e) => EVIDENCE_OUT.includes(e.kind));
  });
  if (unsupported.length) {
    issues.push(issue(
      'warn', 'unsupported-conclusions',
      `${unsupported.length} findings or vulnerabilities have no explicit evidence relations. Recording is allowed, but their supporting context is harder to recover.`,
      unsupported.slice(0, 20).map((n) => n.id),
      { count: unsupported.length },
    ));
  }

  const findings = nodes.filter((n) => ['finding', 'vuln'].includes(n.type) && n.status !== 'superseded');
  const missingConfidence = findings.filter((n) => !n.confidence);
  if (missingConfidence.length) {
    issues.push(issue(
      'info', 'missing-confidence',
      `${missingConfidence.length} findings or vulnerabilities have no recorded confidence, so suspected, statically confirmed, and reproduced claims cannot be distinguished.`,
      missingConfidence.slice(0, 20).map((n) => n.id),
      { count: missingConfidence.length },
    ));
  }

  // Reachability is undirected here: scope only asks whether a conclusion is
  // attached to an objective, never what direction the reasoning must take.
  const goals = nodes.filter((n) => n.type === 'goal');
  if (goals.length) {
    const adjacency = new Map(nodes.map((n) => [n.id, []]));
    for (const edge of edges) {
      adjacency.get(edge.from)?.push(edge.to);
      adjacency.get(edge.to)?.push(edge.from);
    }
    const scoped = new Set(goals.map((n) => n.id));
    const queue = [...scoped];
    while (queue.length) {
      for (const next of adjacency.get(queue.shift()) || []) {
        if (!scoped.has(next)) { scoped.add(next); queue.push(next); }
      }
    }
    const unscoped = findings.filter((n) => !scoped.has(n.id));
    if (unscoped.length) {
      issues.push(issue(
        'info', 'unscoped-findings',
        `${unscoped.length} findings or vulnerabilities are not connected to any goal through explicit relations; their scope is harder to recover.`,
        unscoped.slice(0, 20).map((n) => n.id),
        { count: unscoped.length },
      ));
    }
  }

  const compoundThreads = nodes.filter((n) => {
    if (!['intent', 'hypothesis', 'question'].includes(n.type) ||
      !['open', 'active', 'blocked'].includes(n.status || 'open')) return false;
    const text = `${n.title || ''} ${n.detail || ''}`;
    const numbered = text.match(/(?:^|[\s；;])(?:\(\d+\)|（\d+）|\d+[.)、])/g) || [];
    return numbered.length >= 2;
  });
  if (compoundThreads.length) {
    issues.push(issue(
      'info', 'compound-open-threads',
      `${compoundThreads.length} open nodes contain multiple numbered items. Separate questions can be closed and handed off independently.`,
      compoundThreads.slice(0, 20).map((n) => n.id),
      { count: compoundThreads.length },
    ));
  }

  const cursorId = currentCursor(g);
  const cursor = cursorId ? g.nodes[cursorId] : null;
  if (cursor && ['done', 'dead', 'refuted', 'superseded'].includes(cursor.status)) {
    issues.push(issue('warn', 'stale-cursor', `The current cursor points to a closed node: ${cursor.id} (${cursor.status}).`, [cursor.id]));
  } else if (cursor && ['finding', 'vuln'].includes(cursor.type) &&
    (cursor.status === 'confirmed' || ['reproduced', 'confirmed'].includes(cursor.confidence))) {
    issues.push(issue(
      'info', 'settled-finding-cursor',
      `The current cursor points to a settled finding: ${cursor.id}. If work has moved elsewhere, the cursor can reflect that focus.`,
      [cursor.id],
    ));
  } else if (cursor && !(incoming.get(cursor.id)?.length || outgoing.get(cursor.id)?.length)) {
    issues.push(issue('info', 'isolated-cursor', `The current node ${cursor.id} has no direct relations.`, [cursor.id]));
  }

  const danglingSuperseded = nodes.filter((n) => n.status === 'superseded' &&
    ![...(incoming.get(n.id) || []), ...(outgoing.get(n.id) || [])].some((e) => e.kind === 'supersedes'));
  if (danglingSuperseded.length) {
    issues.push(issue(
      'info', 'unexplained-superseded',
      `${danglingSuperseded.length} superseded nodes do not identify their replacement through a supersedes relation.`,
      danglingSuperseded.map((n) => n.id),
    ));
  }

  const checkpoints = Object.values(g.checkpoints || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  if (cursor && ['intent', 'question', 'hypothesis'].includes(cursor.type) && ['open', 'active'].includes(cursor.status || 'open')) {
    const closing = checkpoints.find((c) => c.cursorNodeId === cursor.id &&
      /(?:完成|收尾|结束|已确认|已关闭)/.test(String(c.summary || '')));
    if (closing) {
      issues.push(issue(
        'warn', 'checkpoint-status-drift',
        `Checkpoint ${closing.id} describes the current thread as closed, but node ${cursor.id} is still ${cursor.status || 'open'}.`,
        [cursor.id], { checkpointId: closing.id },
      ));
    }
  }

  return {
    summary: {
      nodes: nodes.length,
      edges: edges.length,
      issues: issues.length,
      warnings: issues.filter((x) => x.level === 'warn').length,
      infos: issues.filter((x) => x.level === 'info').length,
    },
    issues,
  };
}
