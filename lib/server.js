// Live server: serves the viewer, the graph snapshot, and an SSE stream that
// ticks whenever the event log grows.

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getReceipt } from './store.js';
import { isInitialized } from './storage/board.js';
import { replay, readEvents, readEventsAsOf } from './storage/event-log.js';
import { buildAgentContext } from './context.js';
import { buildNodeHistory, buildCheckpointChanges } from './history.js';
import { resolvePort, viewerUrl } from './service.js';
import { buildGraphSnapshot } from './snapshot.js';
import { json, jsonError, requestGuard } from './http/request.js';
import { handleWrite } from './http/write.js';
import { createGraphStream } from './http/graph-stream.js';
import { buildInfo } from './build-info.js';
import { checkForUpdates } from './release/update.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/** The whole log, or the prefix ending at `?asOf=<checkpoint>`; a read never writes. */
function readSourceAt(cwd, url) {
  return url.searchParams.has('asOf') ? readEventsAsOf(cwd, url.searchParams.get('asOf')) : readEvents(cwd);
}

/** A bad `asOf` names itself, so the viewer can tell it from a missing `since`. */
function asOfError(error) {
  if (error.asOf === undefined) return null;
  if (error.code === 'ambiguous_ref') return { error: error.message, code: 'ambiguous_ref', asOf: error.asOf, candidates: error.candidates };
  return { error: 'checkpoint_not_found', asOf: error.asOf };
}

export function startServer({ cwd = process.cwd(), port, open = false, readOnly = false, author = 'human' } = {}) {
  port = resolvePort({ cwd, port, allowZero: port !== undefined });
  if (!isInitialized(cwd)) {
    throw new Error('The current directory has no .pinwhy/; run pinwhy init first');
  }
  cwd = fs.realpathSync(cwd);
  const build = buildInfo();
  const graphStream = createGraphStream(cwd, { writable: !readOnly });

  const server = http.createServer((req, res) => {
    const guard = requestGuard(req, server.address().port);
    if (!guard.ok) return json(res, guard.status, { error: guard.error });
    const url = new URL(req.url, `http://${req.headers.host}`);
    const p = url.pathname;

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (!p.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
      if (readOnly) return json(res, 403, { error: 'read_only' });
      handleWrite(req, res, url, cwd, author).catch((error) => jsonError(req, res, error));
      return;
    }

    if (p === '/api/status') {
      return json(res, 200, { cwd, readOnly, pid: process.pid, build });
    }

    if (p === '/api/update') {
      checkForUpdates({ currentVersion: build.version })
        .then((result) => json(res, 200, result))
        .catch((error) => json(res, 502, { error: error.message }));
      return;
    }

    if (p === '/events') {
      try { graphStream.subscribe(req, res); }
      catch (error) { json(res, 500, { error: error.message }); }
      return;
    }

    if (p === '/api/receipt') {
      const requestId = url.searchParams.get('requestId');
      if (requestId === null || requestId === '') return json(res, 400, { error: 'request_id_required' });
      try {
        const receipt = getReceipt(requestId, cwd);
        if (!receipt) return json(res, 404, { error: 'receipt_not_found', requestId });
        return json(res, 200, { schema: 'pinwhy.receipt-response.v1', readOnly: true, prescriptive: false, receipt });
      } catch (error) {
        return json(res, error.status || 400, { error: error.message });
      }
    }

    if (p === '/api/history' || p === '/api/changes') {
      const key = p === '/api/history' ? 'node' : 'since';
      const value = url.searchParams.get(key)?.trim();
      if (!value) return json(res, 400, { error: `${key}_required` });
      try {
        const source = readSourceAt(cwd, url);
        const project = p === '/api/history' ? buildNodeHistory : buildCheckpointChanges;
        return json(res, 200, project(source.events, value, source));
      } catch (error) {
        const details = p === '/api/history' ? { nodeId: value } : { since: value };
        return json(res, error.status || 400, asOfError(error) ?? { error: error.message, ...details });
      }
    }

    if (p === '/api/context') {
      try {
        const source = readSourceAt(cwd, url);
        const g = replay(cwd, source);
        const focus = url.searchParams.get('focus') || null;
        if (focus && !g.nodes[focus]) {
          return json(res, 404, { error: 'focus_not_found', focus });
        }
        return json(res, 200, buildAgentContext(g, {
          agentId: url.searchParams.get('agent') || 'agent:primary',
          focus,
          depth: url.searchParams.get('depth') ?? 2,
          budgetTokens: url.searchParams.get('budget') ?? 4000,
          since: url.searchParams.get('since') ?? undefined,
          events: url.searchParams.has('since') ? source.events : undefined,
          maxItems: url.searchParams.get('limit') ?? undefined,
        }));
      } catch (error) {
        return json(res, error.status || 400, asOfError(error) ?? { error: error.message });
      }
    }

    if (p === '/api/graph' || p === '/api/digest') {
      try {
        const source = url.searchParams.has('asOf') ? readSourceAt(cwd, url) : undefined;
        const snap = buildGraphSnapshot(cwd, { writable: !readOnly, build, source });
        return json(res, 200, p === '/api/digest' ? { digest: snap.digest } : snap);
      } catch (error) {
        return json(res, error.status || 500, asOfError(error) ?? { error: error.message });
      }
    }

    let file = p === '/' ? '/index.html' : p;
    const abs = path.join(PUBLIC_DIR, path.normalize(file).replace(/^(\.\.[/\\])+/, ''));
    if (!abs.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      return res.end('forbidden');
    }
    let st;
    try {
      st = fs.statSync(abs);
    } catch {
      st = null;
    }
    if (!st || !st.isFile()) {
      res.writeHead(404);
      return res.end('not found');
    }
    const ext = path.extname(abs);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    // A vanished or unreadable file must answer 404/500, never kill the server.
    fs.createReadStream(abs).on('error', () => {
      if (!res.headersSent) res.writeHead(500);
      res.end('read error');
    }).pipe(res);
  });

  server.on('close', () => graphStream.close());

  return new Promise((resolve, reject) => {
    server.once('error', (error) => {
      graphStream.close();
      reject(error);
    });
    server.listen(port, '127.0.0.1', () => {
      const addr = viewerUrl(server.address().port);
      if (open) {
        import('node:child_process').then(({ exec }) => {
          const cmd =
            process.platform === 'darwin'
              ? `open "${addr}"`
              : process.platform === 'win32'
              ? `start "" "${addr}"`
              : `xdg-open "${addr}"`;
          exec(cmd);
        });
      }
      resolve(server);
    });
  });
}
