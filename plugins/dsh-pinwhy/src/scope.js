import fs from 'node:fs/promises';
import path from 'node:path';
import { PinwhyError } from './config.js';

function inside(parent, child) {
  const rel = path.relative(parent, child);
  return rel === '' || (!path.isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${path.sep}`));
}

async function directory(value) {
  const real = await fs.realpath(value);
  if (!(await fs.stat(real)).isDirectory()) throw new Error(`not a directory: ${value}`);
  return real;
}

async function findBoardRoot(startDir) {
  let cur = startDir;
  while (true) {
    try {
      const events = path.join(cur, '.pinwhy', 'events.jsonl');
      const stat = await fs.stat(events);
      if (stat.isFile()) return cur;
    } catch {}
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return null;
}

/** Bind to the original Session workspace, never the process cwd or an arbitrary model path. */
export async function selectScope(config, exec) {
  exec.signal?.throwIfAborted();
  const session = exec.agent?.session;
  if (!session || typeof session.id !== 'string' || !session.id.trim()
    || typeof session.header?.cwd !== 'string' || !path.isAbsolute(session.header.cwd)) {
    throw new PinwhyError('SESSION_REQUIRED', 'A Session with an absolute original workspace and stable id is required.');
  }
  let original;
  try { original = await directory(session.header.cwd); }
  catch (cause) { throw new PinwhyError('WORKSPACE_MISSING', 'The original Session workspace is unavailable.', { cause }); }
  const candidates = [];
  for (const row of config.projects ?? []) {
    // Missing unrelated workspaces do not disable working ones.
    let workspace;
    try { workspace = await directory(row.workspace); } catch { continue; }
    if (inside(workspace, original)) candidates.push({ ...row, workspace });
  }
  candidates.sort((a, b) => b.workspace.length - a.workspace.length);

  // If projects are explicitly configured, strictly adhere to the configured list.
  if (config.projects?.length) {
    if (!candidates.length) throw new PinwhyError('NOT_ENABLED', 'This Session workspace has no configured pinwhy project.');
    if (candidates[1]?.workspace === candidates[0].workspace) {
      throw new PinwhyError('AMBIGUOUS_PROJECT', 'Two configured workspaces resolve to the same directory.');
    }
    const row = candidates[0];
    let boardRoot;
    try {
      boardRoot = await directory(row.boardRoot);
      if (!(await fs.stat(path.join(boardRoot, '.pinwhy', 'events.jsonl'))).isFile()) throw new Error('events.jsonl is not a file');
    } catch (cause) {
      throw new PinwhyError('BOARD_NOT_INITIALIZED', 'Initialize the configured board explicitly with pinwhy init; the plugin does not initialize projects.', { cause });
    }
    exec.signal?.throwIfAborted();
    return { boardRoot, workspace: row.workspace, agentId: `dsh:${session.id}` };
  }

  // With no explicit project rows, discovery is available only after the user opts in.
  if (config.autoDiscover === true) {
    const discovered = await findBoardRoot(original);
    if (discovered) {
      exec.signal?.throwIfAborted();
      return { boardRoot: discovered, workspace: original, agentId: `dsh:${session.id}` };
    }
  }

  throw new PinwhyError('NOT_ENABLED', 'This Session workspace has no configured pinwhy project.');
}
