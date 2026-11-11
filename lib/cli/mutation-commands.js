import fs from 'node:fs';
import path from 'node:path';
import { NODE_STATES, SEVERITIES, CONFIDENCE_LEVELS, EDGE_LABEL, currentCursor, projectNode } from '../model.js';
import { addNode, addEdge, addCheckpoint, patchNode, removeNode, removeEdge, moveCursor,
  setMeta, reset, writeBatch, checkBatch } from '../store.js';
import { paths } from '../storage/layout.js';
import { ensure, isInitialized, findRoot, protectBoard, readState } from '../storage/board.js';
import { replay, readEvents } from '../storage/event-log.js';
import { inspectInputLengths } from '../storage/input.js';
import { BATCH_LIMITS, batchTooLarge, parseBatch } from '../batch.js';
import { buildDigest } from '../digest.js';
import { OUTPUTS } from '../contracts.js';
import { C, nodeLine } from './format.js';
import { readStdin } from './stdin.js';

/** Explicit board writes share only the invocation's board and reporting helpers. */
export function createMutationCommands({ boardRoot, cwd, needInit, needInitRead, refuseMissingBoard,
  agentOf, refOrFail, fail, warnTruncated, out }) {
  function cmdInit(args, flags) {
    const explicit = boardRoot || process.env.PINWHY_CWD;
    const target = explicit ? path.resolve(explicit) : process.cwd();
    const parent = findRoot(target);
    if (parent && path.resolve(parent) !== path.resolve(target) && !flags.here) {
      fail(`A parent directory already has a board: ${parent}. Commands in subdirectories use it automatically; add --here to create a separate board here.`);
    }
    const p = ensure(target);
    if (protectBoard(target) && !flags.json) console.log(C.dim('Written .pinwhy/.gitignore; board data is excluded from version control by default.'));
    if (flags.title) setMeta({ title: String(flags.title) }, target);
    const g = replay(target);
    const state = readState(target);
    if (flags.json) return out(flags, { cwd: p.cwd, board: p.root, title: g.meta.title || state.title, session: state.session }, OUTPUTS.init);
    if (g.meta.title || flags.title) {
      console.log(`${C.grn('Initialized')} ${C.dim(p.cwd)} · ${g.meta.title}`);
    } else {
      console.log(`${C.grn('Initialized')} ${C.dim(p.cwd)} · session ${state.session}`);
      console.log(C.dim('Next: pinwhy node add goal "Project goal" --enter'));
    }
  }
  function addSimple(type, args, flags) {
    const title = args.join(' ').trim();
    needInit();
    const result = addNode(
      {
        type,
        title,
        detail: flags.detail || flags.d || '',
        parent: flags.parent || null,
        target: flags.to || null,
        status: flags.status || null,
        severity: flags.sev || null,
        confidence: flags.confidence || null,
        tags: flags.tag ? [].concat(flags.tag) : [],
        at: flags.at || null,
        enter: !!flags.enter,
        relateHere: !!flags['relate-here'],
        relation: flags.rel || flags.kind || null,
        // Only when given: an absent label keeps the request fingerprint of earlier versions.
        ...(flags.label ? { label: flags.label } : {}),
        reason: flags.reason || '',
        agentId: agentOf(flags),
        author: agentOf(flags),
        requestId: flags['request-id'],
        ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
      },
      cwd(),
    );
    warnTruncated(result);
    if (flags.json) return out(flags, { ...result, node: projectNode(result.node) }, OUTPUTS.node);
    if (!process.env.PINWHY_QUIET) {
      const entered = result.cursor ? ' · entered' : '';
      console.log(`${C.grn('+')} ${nodeLine(result.node)}${C.dim(relationsOf(result.node, result.edges || (result.edge ? [result.edge] : [])) + entered)}`);
    }
  }

  /** The relations a write just created, read from the new node's side; says so when there are none. */
  function relationsOf(node, edges) {
    if (!edges.length) return ' · no relations';
    return edges.map((edge) => (edge.from === node.id
      ? ` → ${EDGE_LABEL[edge.kind] || edge.kind} ${edge.to}`
      : ` ${EDGE_LABEL[edge.kind] || edge.kind} ${edge.from}`) + (edge.label ? ` (${edge.label})` : '')).join('');
  }
  async function cmdBatch(args, flags) {
    const check = !!flags.check;
    if (!flags.file && process.stdin.isTTY) fail('Specify a JSONL file with --file, or pipe input through stdin');
    if (check) needInitRead();
    const file = flags.file ? path.resolve(String(flags.file)) : null;
    if (file && fs.statSync(file).size > BATCH_LIMITS.batchMaxBytes) fail(batchTooLarge());
    const text = file ? fs.readFileSync(file, 'utf8') : await readStdin(BATCH_LIMITS.batchMaxBytes);
    const options = { agentId: agentOf(flags), rejectTruncation: !!flags['no-truncate'] };
    let result;
    try {
      const records = parseBatch(text);
      for (const record of records) {
        try {
          inspectInputLengths({
            ...(record.title !== undefined ? { title: record.op === 'node' ? record.title.trim() : record.title } : {}),
            ...(record.detail !== undefined ? { detail: record.detail } : {}),
            ...(record.label !== undefined ? { label: record.label } : {}),
          }, !!flags['no-truncate']);
          for (const [field, values] of [['status', NODE_STATES], ['severity', SEVERITIES], ['confidence', CONFIDENCE_LEVELS]]) {
            if (record[field] != null && !values.includes(record[field])) fail(`invalid ${field}: ${record[field]}`, { code: 'invalid_batch' });
          }
        } catch (error) { throw Object.assign(error, { line: record.line }); }
      }
      if (!check) needInit();
      result = check
        ? { checked: true, requestId: flags['request-id'] ?? null, ...checkBatch(records, options, cwd()) }
        : writeBatch(records, { ...options, requestId: flags['request-id'] }, cwd());
    } catch (error) {
      if (error.line) {
        error.message = `Line ${error.line}: ${error.message}`;
        fail(error);
      }
      throw error;
    }
    for (const entry of result.results) {
      if (entry.truncated) warnTruncated(entry, `Line ${entry.line}: `);
    }
    const results = result.results.map((entry) => (entry.node ? { ...entry, node: projectNode(entry.node) } : entry));
    if (flags.json) return out(flags, { ...result, results }, OUTPUTS.batch);
    if (process.env.PINWHY_QUIET) return;
    if (check) {
      const { nodes, edges, edits } = result.counts;
      return console.log(`${C.grn('Check passed')} Nodes +${nodes}, relations +${edges}, edits ${edits}; no records written`);
    }
    for (const entry of result.results) {
      if (entry.op === 'node') console.log(`${C.grn('+')} ${nodeLine(entry.node)}${C.dim(relationsOf(entry.node, entry.edges))}`);
      else if (entry.op === 'link') console.log(`${C.grn('+')} ${entry.edge.from} ${C.dim(EDGE_LABEL[entry.edge.kind] || entry.edge.kind)} ${entry.edge.to}${entry.edge.label ? C.dim(` (${entry.edge.label})`) : ''}`);
      else console.log(`${C.grn('✓')} ${nodeLine(entry.node)}`);
    }
    const { nodes, edges, edits } = result.counts;
    console.log(C.dim(`Batch ${result.requestId}: nodes +${nodes}, relations +${edges}, edits ${edits}`));
  }

  function elapsed(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    if (minutes < 1) return 'less than 1 minute';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return minutes % 60 ? `${hours} hr ${minutes % 60} min` : `${hours} hr`;
  }

  /** What changed on the board since this agent's previous checkpoint, up to this one. Counts only. */
  async function sincePreviousCheckpoint(checkpoint) {
    const { buildCheckpointChanges } = await import('../history.js');
    const source = readEvents(cwd());
    let previous = null;
    let end = source.events.length;
    for (let index = 0; index < source.events.length; index++) {
      const ev = source.events[index];
      if (ev?.op !== 'checkpoint') continue;
      if (ev.checkpoint?.id === checkpoint.id) { end = index + 1; break; }
      if (ev.checkpoint?.agentId === checkpoint.agentId) previous = ev.checkpoint;
    }
    if (!previous) return null;
    const changes = buildCheckpointChanges(source.events.slice(0, end), previous.id, source);
    return {
      checkpointId: previous.id,
      at: previous.at ?? null,
      nodes: { added: changes.nodes.added.length, updated: changes.nodes.updated.length, removed: changes.nodes.removed.length },
      edges: { added: changes.edges.added.length, removed: changes.edges.removed.length },
    };
  }

  async function cmdCheckpoint(args, flags) {
    const agentId = agentOf(flags);
    const summary = flags.summary || flags.title || args.join(' ').trim() || buildDigest(replay(cwd()), cwd(), agentId);
    inspectInputLengths({ summary }, !!flags['no-truncate']);
    needInit();
    const checkpoint = addCheckpoint(
      {
        summary,
        trigger: flags.trigger || (process.argv[2] === 'compact' ? 'manual-compact' : 'manual'),
        agentId,
        requestId: flags['request-id'],
        ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
      },
      cwd(),
    );
    if (flags.write) fs.writeFileSync(paths(cwd()).digest, buildDigest(replay(cwd()), cwd(), agentId));
    warnTruncated(checkpoint);
    const sincePrevious = await sincePreviousCheckpoint(checkpoint);
    if (flags.json) return out(flags, { ...checkpoint, sincePrevious }, OUTPUTS.checkpoint);
    if (!process.env.PINWHY_QUIET) {
      console.log(`${C.cyn('+')} Checkpoint ${checkpoint.id}${checkpoint.cursorNodeId ? ` @${checkpoint.cursorNodeId}` : ''}`);
      if (sincePrevious) {
        const { nodes, edges } = sincePrevious;
        const ago = sincePrevious.at ? ` (${elapsed(Number(checkpoint.at) - Number(sincePrevious.at))} ago)` : '';
        console.log(C.dim(`  Since ${sincePrevious.checkpointId}${ago}: nodes +${nodes.added} ~${nodes.updated} -${nodes.removed}; relations +${edges.added} -${edges.removed}`));
      } else {
        console.log(C.dim(`  First checkpoint for ${checkpoint.agentId}`));
      }
    }
  }

  function cmdCursor(args, flags) {
    if (args.length) needInit(); else needInitRead();
    const g = replay(cwd());
    let id = args[0];
    const agentId = agentOf(flags);
    if (!id) {
      const current = currentCursor(g, agentId);
      if (flags.json) return out(flags, { cursor: current, agentId }, OUTPUTS.cursor);
      console.log(current || '(none)');
      return;
    }
    if (id === 'none' || id === 'clear') id = null;
    if (id === 'next') {
      if (flags['request-id']) fail('cursor with --request-id requires an explicit node ID or none');
      const open = Object.values(g.nodes)
        .filter((n) => ['intent', 'hypothesis', 'question'].includes(n.type) &&
          ['open', 'active'].includes(n.status || 'open'))
        .sort((a, b) => (a.ts || 0) - (b.ts || 0));
      if (!open.length) fail('No open nodes available to enter');
      id = open[open.length - 1].id;
    }
    const cursor = moveCursor(id, { reason: flags.reason || '', agentId, requestId: flags['request-id'] }, cwd());
    if (flags.json) return out(flags, { cursor }, OUTPUTS.cursor);
    if (!process.env.PINWHY_QUIET) {
      if (cursor.to) {
        const target = replay(cwd()).nodes[cursor.to];
        console.log(`${C.grn('Cursor →')} ${target ? nodeLine(target) : `${cursor.to} (original request target removed)`}`);
      }
      else console.log(C.grn('Cursor cleared'));
    }
  }
  function cmdPromote(args, flags) {
    refuseMissingBoard();
    needInitRead();
    const id = args[0];
    const g = replay(cwd());
    const activity = g.activities[refOrFail(g.activities, id, 'activity')];
    const type = flags.kind || flags.type || 'observation';
    const result = addNode({
      type,
      title: flags.title || activity.summary || `${activity.tool} activity`,
      detail: flags.detail || flags.d || activity.output || '',
      at: activity.location?.path || activity.location || null,
      tags: ['promoted', String(activity.tool || 'tool').toLowerCase()],
      extra: { activityId: activity.id },
      enter: !!flags.enter,
      relateHere: !!flags['relate-here'],
      target: flags.to || null,
      relation: flags.rel || null,
      ...(flags.label ? { label: flags.label } : {}),
      reason: flags.reason || '',
      agentId: agentOf(flags),
      author: agentOf(flags),
      requestId: flags['request-id'],
      ...(flags['no-truncate'] ? { rejectTruncation: true } : {}),
    }, cwd());
    warnTruncated(result);
    if (flags.json) return out(flags, { ...result, node: projectNode(result.node) }, OUTPUTS.promote);
    console.log(`${C.grn('Promoted →')} ${nodeLine(result.node)}`);
  }

  function cmdState(cmd, args, flags) {
    needInit();
    const id = args[0];
    const map = { done: 'done', block: 'blocked', revive: 'open' };
    const n = patchNode(id, { status: map[cmd] }, cwd(), { by: agentOf(flags), requestId: flags['request-id'] });
    if (flags.json) return out(flags, projectNode(n), OUTPUTS[cmd]);
    if (!process.env.PINWHY_QUIET) console.log(`${C.grn('✓')} ${nodeLine(n)}`);
  }

  function cmdEdit(args, flags) {
    const id = args[0];
    const set = {};
    if (flags.title) set.title = String(flags.title);
    if (flags.detail || flags.d) set.detail = String(flags.detail || flags.d);
    if (flags.status) set.status = flags.status;
    if (flags.sev) set.severity = flags.sev;
    if (flags.confidence) set.confidence = flags.confidence;
    if (flags.tag) set.tags = [].concat(flags.tag);
    for (const field of [].concat(flags.clear || [])) set[field] = field === 'detail' ? '' : field === 'tags' ? [] : null;
    needInit();
    const n = patchNode(id, set, cwd(), { by: agentOf(flags), requestId: flags['request-id'], ...(flags['no-truncate'] ? { rejectTruncation: true } : {}) });
    warnTruncated(n);
    if (flags.json) return out(flags, projectNode(n), OUTPUTS.edit);
    if (!process.env.PINWHY_QUIET) console.log(`${C.grn('✓')} ${nodeLine(n)}`);
  }

  function cmdLink(args, flags) {
    needInit();
    const [from, to] = args;
    const kind = flags.rel || flags.kind || 'related-to';
    const edge = addEdge({ from, to, kind, label: flags.label || '', author: agentOf(flags), requestId: flags['request-id'], ...(flags['no-truncate'] ? { rejectTruncation: true } : {}) }, cwd());
    warnTruncated(edge);
    if (flags.json) return out(flags, edge, OUTPUTS.link);
    if (!process.env.PINWHY_QUIET) {
      console.log(`${C.grn('+')} ${edge.from} ${C.dim(EDGE_LABEL[edge.kind] || edge.kind)} ${edge.to}${edge.label ? C.dim(` (${edge.label})`) : ''}`);
    }
  }

  function cmdUnlink(args, flags) {
    needInit();
    const [from, to] = args;
    let edge;
    try { edge = removeEdge({ from, to, kind: flags.rel || flags.kind || null }, { by: agentOf(flags), requestId: flags['request-id'] }, cwd()); }
    catch (e) { return fail(e); }
    if (flags.json) return out(flags, edge, OUTPUTS.unlink);
    if (!process.env.PINWHY_QUIET) {
      console.log(`${C.grn('−')} ${edge.from} ${C.dim(EDGE_LABEL[edge.kind] || edge.kind)} ${edge.to}`);
    }
  }

  function cmdRemove(args, flags) {
    needInit();
    let result;
    try { result = removeNode(args[0], { by: agentOf(flags), reason: flags.reason || '', requestId: flags['request-id'] }, cwd()); }
    catch (e) { return fail(e); }
    if (flags.json) return out(flags, result, OUTPUTS.remove);
    if (!process.env.PINWHY_QUIET) {
      console.log(`${C.grn('−')} ${result.id}${result.edges.length ? C.dim(` (${result.edges.length} relations removed)`) : ''}`);
    }
  }

  function cmdReset(args, flags) {
    if (isInitialized(cwd()) && !flags.yes) {
      fail('This clears the entire graph. Add --yes to confirm');
    }
    refuseMissingBoard();
    ensure(cwd());
    const result = reset(cwd(), { by: agentOf(flags), requestId: flags['request-id'] });
    if (flags.json) return out(flags, result, OUTPUTS.reset);
    console.log(C.grn('Reset complete'));
  }
  return { cmdInit, addSimple, cmdBatch, cmdCheckpoint, cmdCursor, cmdPromote,
    cmdState, cmdEdit, cmdLink, cmdUnlink, cmdRemove, cmdReset };
}
