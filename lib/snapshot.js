// One graph projection for live HTTP/SSE and read-only offline exports.
import { stats } from './store.js';
import { replay } from './storage/event-log.js';
import { readState, stateFromEvents } from './storage/board.js';
import { projectNodeMap } from './model.js';
import { buildAgentDigests } from './digest.js';
import { GRAPH_SCHEMA } from './contracts.js';
import { buildInfo } from './build-info.js';

/**
 * `source` from readEventsAsOf projects the board at a checkpoint: the cache
 * fields come from that log prefix, never from today's state.json, and the
 * result is never writable.
 */
export function buildGraphSnapshot(cwd, { writable = false, includeActivityDetails = true, includeLocalPaths = true, build = buildInfo(), source } = {}) {
  const graph = replay(cwd, source);
  const asOf = source?.asOf || null;
  const state = asOf ? { ...stateFromEvents(source.events), session: asOf.sessionId } : readState(cwd);
  const digests = buildAgentDigests(graph, cwd);
  let identity = build;
  if (!includeLocalPaths) {
    const { root: _root, ...origin } = build.origin;
    identity = { ...build, origin };
  }
  return {
    schema: GRAPH_SCHEMA,
    meta: {
      ...graph.meta,
      title: graph.meta.title || state.title,
      focus: [graph.meta.focus, state.focus].find((id) => id && graph.nodes[id]) || null,
      session: state.session,
      writable: writable && !asOf ? true : undefined,
      ...(asOf ? { asOf } : {}),
      build: identity,
    },
    nodes: projectNodeMap(graph.nodes),
    edges: graph.edges,
    cursors: graph.cursors,
    cursorTrail: graph.cursorTrail.slice(-100),
    // Raw tool material belongs in the live local viewer, never a shared HTML file.
    activities: includeActivityDetails ? graph.activities : Object.fromEntries(
      Object.values(graph.activities).map((activity) => [activity.id, {
        id: activity.id,
        tool: activity.tool,
        status: activity.status,
        at: activity.at,
        linkedNodeIds: activity.linkedNodeIds,
      }]),
    ),
    checkpoints: graph.checkpoints,
    stats: stats(graph),
    digest: digests['agent:primary'],
    digests,
  };
}
