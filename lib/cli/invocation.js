import path from 'node:path';
import { resolveRef } from '../model.js';
import { defaultAgentId } from '../store.js';
import { paths } from '../storage/layout.js';
import { ensure, isInitialized, findRoot } from '../storage/board.js';
import { readEvents, readEventsAsOf } from '../storage/event-log.js';
import { LIMITS, inspectInputLengths } from '../storage/input.js';
import { validateRequestId } from '../receipts.js';
import { ERROR_CODES, ERROR_SCHEMA } from '../contracts.js';
import { C } from './format.js';

/** A fresh invocation owns board selection and buffered diagnostics; nothing is shared between runs. */
export function createInvocation({ root = null, noInit = false, json = false } = {}) {
  const warnings = [];
  /** Resolve a typed id, failing with the candidate list instead of a stack trace. */
  function refOrFail(map, ref, label = 'node') {
    try {
      return resolveRef(map, ref, label);
    } catch (e) {
      return fail(e);
    }
  }

  function warn(message) {
    if (json) warnings.push(message);
    else console.error(message);
  }
  function cwd() {
    if (root) return root;
    const projectCwd = process.env.PINWHY_CWD;
    if (projectCwd) return path.resolve(projectCwd);
    // Like git: a command run from a subdirectory belongs to the nearest board above it.
    return findRoot(process.cwd()) || process.cwd();
  }
  /** Tell the Agent when something it wrote was shortened; silently losing text would be worse. */
  function warnTruncated(result, prefix = '') {
    const fields = result?.truncated;
    if (!fields?.length) return;
    const names = { title: 'title', detail: 'detail', label: 'relation label', summary: 'summary' };
    const parts = fields.map((f) => `${names[f] || f} (limit: ${LIMITS[f]} characters)`);
    warn(`${prefix}${C.yel('Warning:')} ${parts.join(', ')} exceeded the limit and were truncated; split long content into nodes or save it to a file.`);
  }

  /** Who this write is from: --agent, else PINWHY_AGENT, else agent:primary; both spellings normalize alike. */
  function agentOf(flags) {
    return flags.agent ? defaultAgentId({ PINWHY_AGENT: flags.agent }) : defaultAgentId();
  }

  /** Validate board-independent input before any handler can initialize or install. */
  function validateInvocation(cmd, args, flags) {
    try { validateRequestId(flags['request-id']); }
    catch (error) { fail(error, { code: 'invalid_value' }); }
    const checkpoint = ['checkpoint', 'compact'].includes(cmd);
    const node = cmd === 'node' || ['start', 'goal', 'intent', 'fact', 'vuln', 'hint'].includes(cmd);
    const text = {
      ...(!checkpoint && flags.title ? { title: flags.title } : {}),
      ...(node ? { title: args.slice(cmd === 'node' ? 2 : 0).join(' ').trim() } : {}),
      ...(flags.detail ? { detail: flags.detail } : {}),
      ...(flags.label ? { label: flags.label } : {}),
      ...(checkpoint ? { summary: flags.summary || flags.title || args.join(' ').trim() } : {}),
    };
    inspectInputLengths(text, !!flags['no-truncate']);
  }

  /** Under --no-init a missing board is an error; nothing, not even the directory, is created. */
  function refuseMissingBoard() {
    if (noInit && !isInitialized(cwd())) {
      fail(`${cwd()} has no .pinwhy/; --no-init prevents creating a board. Check --cwd / PINWHY_CWD, or run pinwhy init first.`, { code: 'board_missing', cwd: cwd() });
    }
  }

  function needInit() {
    refuseMissingBoard();
    if (!isInitialized(cwd())) {
      warn(`${C.yel('Warning:')} No .pinwhy/ in the current directory; initialized automatically.`);
    }
    return ensure(cwd());
  }

  /** Read-only commands must not create state as a side effect. */
  function needInitRead() {
    if (!isInitialized(cwd())) {
      fail('No .pinwhy/ in the current directory. Run pinwhy init --title "Project goal" first.', { code: 'board_missing', cwd: cwd() });
    }
    return paths(cwd());
  }

  /**
   * Print a --json output. An object leads with its schema, which always names
   * the output, even if a record replayed from the log carries a field of that name.
   */
  function out(flags, obj, output) {
    if (!flags.json) return;
    const body = output?.shape === 'object' ? Object.assign({ schema: output.schema }, obj, { schema: output.schema }) : obj;
    console.log(JSON.stringify(body));
  }

  /** The log a read projects: the whole of it, or cut right after --as-of's checkpoint. */
  function readSource(flags) {
    if (flags['as-of'] === undefined) return readEvents(cwd());
    try { return readEventsAsOf(cwd(), flags['as-of']); } catch (error) { return fail(error); }
  }

  /** Human output says it shows the past; --json stays identical to reading a log cut at that point. */
  function noteAsOf(source, flags) {
    if (!source.asOf || flags.json) return;
    const { id, at } = source.asOf;
    console.error(C.dim(`As of ${id}${Number.isFinite(at) ? ` (${new Date(at).toISOString()})` : ''} · read-only history; later records are excluded`));
  }
  return { boardRoot: root, cwd, refOrFail, fail, warn, warnTruncated, agentOf,
    validateInvocation, refuseMissingBoard, needInit, needInitRead, out, readSource, noteAsOf,
    flushWarnings() {
      if (!process.exitCode) for (const message of warnings) console.error(message);
    },
  };
}
export function printError(error, json) {
  if (json) {
    const code = ERROR_CODES.includes(error.code) ? error.code : error.line ? 'invalid_batch' : 'error';
    const known = Object.fromEntries(['line', 'column', 'suggestion', 'candidates', 'requestId', 'fields', 'cwd', 'committed', 'result']
      .filter((key) => error[key] !== undefined).map((key) => [key, error[key]]));
    console.error(JSON.stringify({ schema: ERROR_SCHEMA, code, ...known, message: error.message,
      ...(process.env.PINWHY_DEBUG ? { stack: error.stack } : {}),
    }));
  } else console.error(process.env.PINWHY_DEBUG ? error.stack : `${C.red('Error:')} ${error.message}`);
  process.exitCode = 1;
}
/** Handlers throw; the top-level boundary alone formats failures and sets exit status. */
export function fail(problem, details = {}) {
  throw Object.assign(problem instanceof Error ? problem : new Error(problem), {
    ...(problem instanceof Error ? {} : { code: 'invalid_usage' }), ...details,
  });
}
