import fs from 'node:fs';
import { TYPE_LABEL, currentCursor, resolveRef, projectNode } from '../model.js';
import { stats } from '../store.js';
import { readState } from '../storage/board.js';
import { replay, readEvents } from '../storage/event-log.js';
import { buildDigest, neighborsOf, tail } from '../digest.js';
import { buildAgentContext, renderAgentContext } from '../context.js';
import { searchGraph, matchesNodeFields } from '../search.js';
import { isOpenThread, isCurrentFinding } from '../semantics.js';
import { resolvePort, probeViewer } from '../service.js';
import { OUTPUTS } from '../contracts.js';
import { C, nodeLine, activityLine } from './format.js';
import { renderStatus } from './panels.js';
import { renderNodeList, renderSearch, renderNodeDetail, renderHere } from './records.js';
import { renderHistory, renderChanges } from './history-view.js';

/** Board projections and inspection never initialize a board. */
export function createQueryCommands({ cwd, needInitRead, agentOf, readSource, noteAsOf, refOrFail, fail, warn, out }) {
  async function cmdStatus(args, flags) {
    const p = needInitRead();
    const port = resolvePort({ cwd: p.cwd, port: flags.port });
    const g = replay(p.cwd);
    const s = stats(g);
    const state = readState(p.cwd);
    const agentId = agentOf(flags);
    const cursorId = currentCursor(g, agentId);
    const cursor = cursorId ? g.nodes[cursorId] : null;
    const { integrationStatus } = await import('../hooks.js');
    const integration = integrationStatus(p.cwd);
    const viewer = await probeViewer({ cwd: p.cwd, port });
    const latestNode = Object.values(g.nodes).reduce((latest, node) =>
      !latest || (node.updated || node.ts || 0) > (latest.updated || latest.ts || 0) ? node : latest, null);
    if (flags.json) return out(flags, {
      stats: s, cursor, cursors: g.cursors, title: g.meta.title || state.title, session: state.session,
      cwd: p.cwd, agentId, viewer, integration, latestNode: projectNode(latestNode),
    }, OUTPUTS.status);

    console.log(renderStatus({
      stats: s, cursor, title: g.meta.title || state.title, cwd: p.cwd, agentId, viewer, integration, latestNode,
    }, Object.values(g.nodes).filter(isCurrentFinding)));
  }

  function cmdList(args, flags) {
    needInitRead();
    const source = readSource(flags);
    const g = replay(cwd(), source);
    noteAsOf(source, flags);
    let nodes = Object.values(g.nodes).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    const type = flags.type || flags.t;
    if (type) nodes = nodes.filter((n) => n.type === type || TYPE_LABEL[n.type] === type);
    const filters = { status: flags.status, severity: flags.sev, confidence: flags.confidence, tags: [].concat(flags.tag || []) };
    nodes = nodes.filter((node) => matchesNodeFields(node, filters));
    if (flags.open || flags['open-only']) {
      nodes = nodes.filter((n) =>
        isOpenThread(n));
    }
    const total = nodes.length;
    if (!flags.all) nodes = nodes.slice(-Number(flags.limit || 30));
    if (flags.json && nodes.length < total) {
      warn(`Warning: pinwhy ls matched ${total} records; showing the latest ${nodes.length}, omitting ${total - nodes.length}. Use --all to read all records or --limit to adjust the count.`);
    }
    if (flags.json) return out(flags, nodes.map(projectNode), OUTPUTS.ls);
    console.log(renderNodeList(nodes, { total }));
  }

  function cmdShow(args, flags) {
    needInitRead();
    const id = args[0];
    const source = readSource(flags);
    const g = replay(cwd(), source);
    const nodeId = refOrFail(g.nodes, id);
    const n = g.nodes[nodeId];
    if (flags.json) return out(flags, { node: projectNode(n), parents: parentsOf(g, nodeId).map(projectNode), children: childrenOf(g, nodeId).map(projectNode) }, OUTPUTS.show);
    noteAsOf(source, flags);
    console.log(renderNodeDetail({ node: n, neighbors: neighborsOf(g, nodeId) }));
  }

  function parentsOf(g, id) {
    return Object.values(g.edges)
      .filter((e) => e.to === id)
      .map((e) => ({ ...g.nodes[e.from], edge: e.kind }))
      .filter((x) => x.id);
  }

  function childrenOf(g, id) {
    return Object.values(g.edges)
      .filter((e) => e.from === id)
      .map((e) => ({ ...g.nodes[e.to], edge: e.kind }))
      .filter((x) => x.id);
  }

  function cmdTree(args, flags) {
    needInitRead();
    const g = replay(cwd());
    const depth = Number(flags.depth ?? 4);
    const kids = new Map();
    for (const e of Object.values(g.edges)) {
      if (!kids.has(e.from)) kids.set(e.from, []);
      kids.get(e.from).push(e);
    }
    const incoming = new Set(Object.values(g.edges).map((e) => e.to));
    const starts = Object.values(g.nodes).filter((n) => !incoming.has(n.id));
    const roots = starts.length
      ? starts
      : Object.values(g.nodes).slice(0, 10);
    const walk = (n, d, seen, prefix) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      console.log(`${prefix}${nodeLine(n)}`);
      const cs = (kids.get(n.id) || [])
        .map((e) => g.nodes[e.to])
        .filter(Boolean)
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (d >= depth) {
        const folded = cs.filter((c) => !seen.has(c.id)).length;
        if (folded) console.log(`${prefix}  ${C.dim(`… ${folded} children collapsed (increase -d to expand)`)}`);
        return;
      }
      for (const c of cs) walk(c, d + 1, seen, `${prefix}  `);
    };
    const seen = new Set();
    for (const r of roots) walk(r, 0, seen, '');
    const orphans = Object.values(g.nodes).filter((n) => !seen.has(n.id));
    if (orphans.length) {
      console.log(C.dim(`… ${orphans.length} nodes not shown in the tree (run pinwhy ls)`));
    }
  }

  function cmdDigest(args, flags) {
    const p = needInitRead();
    const g = replay(cwd());
    const md = buildDigest(g, cwd(), agentOf(flags));
    if (flags.write) {
      fs.writeFileSync(p.digest, md);
      if (!flags.quiet) warn(C.dim(`Written ${p.digest}`));
    }
    if (flags.json) return out(flags, { digest: md }, OUTPUTS.digest);
    console.log(md);
  }

  function cmdContext(args, flags) {
    needInitRead();
    const source = readSource(flags);
    const g = replay(cwd(), source);
    const wanted = flags.focus || args[0] || null;
    const focus = wanted ? refOrFail(g.nodes, wanted, 'focus node') : null;
    let since = flags.since;
    if (since !== undefined && !/^\d+$/.test(String(since)) && Object.keys(g.checkpoints || {}).length) {
      try { since = resolveRef(g.checkpoints, since, 'checkpoint'); } catch {}
    }
    const packet = buildAgentContext(g, {
      agentId: agentOf(flags),
      focus,
      depth: flags.depth === undefined ? 2 : Number(flags.depth),
      budgetTokens: flags.budget === undefined ? 4000 : Number(flags.budget),
      since,
      ...(flags.since ? { events: source.events } : {}),
      maxItems: flags.limit || flags.n,
    });
    if (flags.markdown || flags.md) console.log(renderAgentContext(packet, { asOf: source.asOf }));
    else out({ json: true }, packet, OUTPUTS.context);
  }

  function cmdSearch(args, flags) {
    needInitRead();
    const source = readSource(flags);
    const graph = replay(cwd(), source);
    const relatedTo = flags['related-to'] ? refOrFail(graph.nodes, flags['related-to']) : undefined;
    const result = searchGraph(graph, {
      query: args.join(' '), type: flags.type, tags: flags.tag, status: flags.status,
      severity: flags.sev, confidence: flags.confidence, groupBy: flags['group-by'],
      relation: flags.rel, relatedTo, limit: flags.limit || 30,
    });
    if (flags.json) return out(flags, result, OUTPUTS.search);
    noteAsOf(source, flags);
    console.log(renderSearch(result));
  }

  async function cmdHistory(args, flags) {
    needInitRead();
    const { buildNodeHistory } = await import('../history.js');
    const source = readEvents(cwd());
    const result = buildNodeHistory(source.events, args[0], source);
    if (flags.json) return out(flags, result, OUTPUTS.history);
    console.log(renderHistory(result));
  }

  async function cmdChanges(args, flags) {
    needInitRead();
    const since = flags.since || args[0];
    const { buildCheckpointChanges } = await import('../history.js');
    const source = readSource(flags);
    const result = buildCheckpointChanges(source.events, since, source);
    if (flags.json) return out(flags, result, OUTPUTS.changes);
    noteAsOf(source, flags);
    console.log(renderChanges(result));
  }
  async function cmdReceipt(args, flags) {
    needInitRead();
    const { getReceipt } = await import('../store.js');
    const receipt = getReceipt(args[0], cwd());
    if (!receipt) fail('request_not_found');
    if (flags.json) return out(flags, receipt, OUTPUTS.receipt);
    console.log(`${receipt.requestId} · ${receipt.command} · ${receipt.status}`);
    if (receipt.status === 'pending') console.log('Retry the original command with the same request-id to recover the recorded operation; this query does not write records.');
  }
  async function cmdLint(args, flags) {
    needInitRead();
    const { lintGraph } = await import('../lint.js');
    const result = lintGraph(replay(cwd()), {
      maxTitleLength: Number(flags['max-title'] || 80),
    });
    if (flags.json) return out(flags, result, OUTPUTS.lint);
    console.log(`${C.bold('pinwhy lint')} · ${result.summary.nodes} nodes · ${result.summary.edges} relations`);
    if (!result.issues.length) return console.log(C.grn('No context quality issues found.'));
    for (const x of result.issues) {
      const label = x.level === 'warn' ? C.yel('WARN') : C.cyn('INFO');
      console.log(`${label} ${x.code} · ${x.message}`);
      if (x.nodeIds?.length) {
        console.log(C.dim(`  ${x.nodeIds.join(', ')}${x.count > x.nodeIds.length ? ' …' : ''}`));
      }
    }
    console.log(C.dim('These notices do not modify the board or restrict agent actions.'));
  }

  function cmdTail(args, flags) {
    needInitRead();
    const g = replay(cwd());
    const text = tail(g, agentOf(flags));
    if (flags.json) return out(flags, { tail: text }, OUTPUTS.tail);
    console.log(text);
  }
  function cmdHere(args, flags) {
    needInitRead();
    const g = replay(cwd());
    const agentId = agentOf(flags);
    const id = currentCursor(g, agentId);
    const node = id ? g.nodes[id] : null;
    const neighbors = neighborsOf(g, id);
    const trail = (g.cursorTrail || []).filter((c) => c.agentId === agentId).slice(-10);
    if (flags.json) return out(flags, { agentId, cursor: id, node: projectNode(node), neighbors: neighbors.map((item) => ({ ...item, node: projectNode(item.node) })), trail }, OUTPUTS.here);
    console.log(renderHere({ agentId, cursor: id, node, neighbors, trail }));
  }


  function cmdActivity(args, flags) {
    needInitRead();
    const g = replay(cwd());
    const sub = args[0] || 'ls';
    if (sub === 'show') {
      const a = g.activities[refOrFail(g.activities, args[1], 'activity')];
      if (flags.json) return out(flags, a, OUTPUTS['activity show']);
      console.log(activityLine(a));
      if (a.input) console.log(`\nInput\n${a.input}`);
      if (a.output) console.log(`\nOutput\n${a.output}`);
      return;
    }
    const limit = Number(flags.limit || flags.n || 30);
    const activities = Object.values(g.activities)
      .sort((a, b) => (a.at || 0) - (b.at || 0))
      .slice(-limit);
    if (flags.json) return out(flags, activities, OUTPUTS.activity);
    if (!activities.length) return console.log(C.dim('(no activities)'));
    for (const a of activities) console.log(activityLine(a));
  }
  return { cmdStatus, cmdList, cmdShow, cmdTree, cmdDigest, cmdContext, cmdSearch,
    cmdHistory, cmdChanges, cmdReceipt, cmdLint, cmdTail, cmdHere, cmdActivity };
}
