// Pinwhy digest: restore the Agent's position and local context without
// prescribing a next action.

import { TYPE_LABEL, EDGE_LABEL, CONFIDENCE_LABEL, currentCursor } from './model.js';
import { readConfig, stats } from './store.js';
import { isOpenThread } from './semantics.js';

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function clip(s, n) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function sorted(values, key = 'ts') {
  return [...values].sort((a, b) => (a[key] || a.at || 0) - (b[key] || b.at || 0));
}

function inputTruncationNotice(record) {
  const value = record.inputTruncation;
  return value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length
    ? ` [input was truncated at write time: ${JSON.stringify(value)}]` : '';
}

function nodeText(n) {
  const type = TYPE_LABEL[n.type] || n.type;
  const state = n.status ? ` · ${n.status}` : '';
  const confidence = n.confidence ? ` · ${CONFIDENCE_LABEL[n.confidence] || n.confidence}` : '';
  const loc = n.loc ? ` @${n.loc.path}${n.loc.line ? `:${n.loc.line}` : ''}` : '';
  return `[${n.id}] ${type}${state}${confidence}: ${clip(n.title, 180)}${loc}${inputTruncationNotice(n)}`;
}

export function neighborsOf(g, id) {
  if (!id) return [];
  const out = [];
  for (const e of Object.values(g.edges)) {
    if (e.from === id && g.nodes[e.to]) out.push({ direction: 'out', edge: e, node: g.nodes[e.to] });
    else if (e.to === id && g.nodes[e.from]) out.push({ direction: 'in', edge: e, node: g.nodes[e.from] });
  }
  return out.sort((a, b) => (a.edge.ts || 0) - (b.edge.ts || 0));
}

/** Legacy helper retained for callers; follows explicit legacy parent only. */
export function pathTo(g, id, max = 40) {
  const out = [];
  let cur = g.nodes[id];
  const seen = new Set();
  while (cur && out.length < max && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent ? g.nodes[cur.parent] : null;
  }
  return out;
}

function byAgent(records) {
  const groups = new Map();
  for (const record of records) {
    const group = groups.get(record.agentId);
    if (group) group.push(record);
    else groups.set(record.agentId, [record]);
  }
  return groups;
}

function digestData(g, cwd) {
  const nodes = sorted(Object.values(g.nodes));
  return {
    d: readConfig(cwd).digest || {},
    s: stats(g),
    nodes,
    openNodes: nodes.filter(isOpenThread),
    trails: byAgent(g.cursorTrail || []),
    checkpoints: byAgent(sorted(Object.values(g.checkpoints || {}), 'at')),
  };
}

export function buildDigest(g, cwd = process.cwd(), agentId = 'agent:primary') {
  const data = digestData(g, cwd);
  return renderDigest(g, data, agentId);
}

function renderDigest(g, data, agentId) {
  const { d, s, nodes, openNodes } = data;
  const cursorId = currentCursor(g, agentId);
  const cursor = cursorId ? g.nodes[cursorId] : null;
  const neighbors = neighborsOf(g, cursorId).slice(-(d.maxNeighbors || 16));
  const trail = (data.trails.get(agentId) || []).slice(-(d.maxTrail || 10));
  const checkpoints = (data.checkpoints.get(agentId) || []).slice(-(d.maxCheckpoints || 6));

  const L = [];
  L.push(`# Pinwhy recovery${g.meta.title ? ` — ${g.meta.title}` : ''}`);
  L.push('');
  L.push(
    `Nodes ${s.total} · Relations ${s.edges} · Open nodes ${s.frontier} · ` +
      `Activities ${s.activities} · Checkpoints ${s.checkpoints}`,
  );
  L.push('');

  L.push('## Current node');
  if (cursor) {
    L.push(`- ${nodeText(cursor)}`);
    if (cursor.detail) L.push(`  ${clip(cursor.detail, 300)}`);
  } else {
    L.push('_No cursor is set for this Agent. The cursor is an optional focus marker, set with `pinwhy cursor <id>` or `--enter` when creating a node. Recently active nodes are shown below._');
  }
  L.push('');

  if (cursor) {
    L.push('## Around the current node');
    if (!neighbors.length) {
      L.push('_The current node has no direct relations._');
    } else {
      for (const { direction, edge, node } of neighbors) {
        const rel = EDGE_LABEL[edge.kind] || edge.kind;
        if (direction === 'out') L.push(`- [${cursorId}] --${rel}--> ${nodeText(node)}${inputTruncationNotice(edge)}`);
        else L.push(`- ${nodeText(node)} --${rel}--> [${cursorId}]${inputTruncationNotice(edge)}`);
      }
    }
    L.push('');
  } else {
    // Without a cursor the digest would otherwise be nearly empty, so show what
    // was touched last, with enough detail and relations to pick the thread up.
    const active = [...nodes].filter((n) => n.status !== 'superseded')
      .sort((a, b) => (b.updated || b.ts || 0) - (a.updated || a.ts || 0))
      .slice(0, d.maxActiveNodes || 8);
    if (active.length) {
      L.push('## Recently active');
      for (const n of active) {
        L.push(`- ${nodeText(n)}`);
        if (n.detail) L.push(`  ${clip(n.detail, 140)}`);
      }
      L.push('');
      const ids = new Set(active.map((n) => n.id));
      const links = sorted(Object.values(g.edges), 'ts')
        .filter((e) => (ids.has(e.from) || ids.has(e.to)) && g.nodes[e.from] && g.nodes[e.to])
        .slice(-(d.maxNeighbors || 16));
      if (links.length) {
        L.push('## Relations');
        for (const e of links) L.push(`- [${e.from}] --${EDGE_LABEL[e.kind] || e.kind}--> [${e.to}]${inputTruncationNotice(e)}`);
        L.push('');
      }
    }
  }

  L.push('## Recent trail');
  if (!trail.length) {
    L.push('_No cursor movements recorded._');
  } else {
    const ids = [];
    if (trail[0].from) ids.push(trail[0].from);
    for (const c of trail) if (c.to) ids.push(c.to);
    L.push(`- ${ids.join(' → ') || '(cursor cleared)'}`);
    for (const c of trail.filter((x) => x.reason).slice(-4)) {
      L.push(`  - ${fmtTime(c.at)} → ${c.to || 'none'}: ${clip(c.reason, 140)}`);
    }
  }
  L.push('');

  L.push('## Open nodes');
  if (!openNodes.length) {
    L.push('_No open intents, hypotheses, questions, or actions._');
  } else {
    for (const n of openNodes.slice(-(d.maxOpenNodes || 16))) L.push(`- ${nodeText(n)}`);
  }
  L.push('');

  if (checkpoints.length) {
    L.push('## Recent checkpoints');
    for (const c of checkpoints) {
      const at = c.cursorNodeId ? ` @${c.cursorNodeId}` : '';
      L.push(`- [${c.id}] ${fmtTime(c.at)}${at} ${clip(c.summary || 'No summary', 180)}${inputTruncationNotice(c)}`);
    }
    L.push('');
  }

  const recent = cursor ? nodes.filter((n) => n.id !== cursorId && n.status !== 'superseded').slice(-10) : [];
  if (recent.length) {
    L.push('## Recent nodes');
    for (const n of recent) L.push(`- ${nodeText(n)}`);
    L.push('');
  }

  L.push('_This digest restores recorded context; the Agent chooses the next step. Relations and cursor trails are independent._');
  return L.join('\n');
}

/** Each identity gets its own read-only recovery projection, including offline exports. */
export function buildAgentDigests(g, cwd = process.cwd()) {
  const identities = new Set(['agent:primary', ...Object.keys(g.cursors || {})]);
  for (const checkpoint of Object.values(g.checkpoints || {})) {
    if (checkpoint.agentId) identities.add(checkpoint.agentId);
  }
  const data = digestData(g, cwd);
  return Object.fromEntries([...identities].map((agentId) => [agentId, renderDigest(g, data, agentId)]));
}

/** One-line status pointer. */
export function tail(g, agentId = 'agent:primary') {
  const s = stats(g);
  const cursor = currentCursor(g, agentId);
  return `${s.total} nodes · ${s.edges} relations · ${s.frontier} open · ${s.activities} activities${
    cursor ? ` · current ${cursor}` : ''
  }`;
}
