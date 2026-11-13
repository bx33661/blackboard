import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import http from 'node:http';
import { pipeline } from 'node:stream';
import { bound } from './bridge.js';
import { PinwhyError } from './config.js';
import { selectScope } from './scope.js';

const PREFIX = '/pinwhy-viewer/';

/** One opaque node identity: never a path, so a read cannot be redirected to a file. */
function nodeIdentity(value) {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.includes('\0')
    || /\s/.test(value) || /[\\/]/.test(value) || value === '.' || value === '..') {
    throw new PinwhyError('INVALID_ARGUMENT', 'Expected one node identity, not a path.');
  }
  return value;
}

/** `pinwhy/node.read` payloads are exact: a Session identity plus one node identity. */
function nodeReadPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PinwhyError('INVALID_ARGUMENT', 'Expected a Session and one node identity.');
  }
  const keys = Object.keys(payload);
  if (keys.length !== 2 || !keys.includes('sessionId') || !keys.includes('nodeId')) {
    throw new PinwhyError('INVALID_ARGUMENT', 'Expected exactly a Session and one node identity.');
  }
  if (typeof payload.sessionId !== 'string' || !payload.sessionId.trim() || payload.sessionId.includes('\0')) {
    throw new PinwhyError('INVALID_ARGUMENT', 'Expected a Session identity.');
  }
  return { sessionId: payload.sessionId, nodeId: nodeIdentity(payload.nodeId) };
}

/** One owned, read-only CLI process. A ready response never changes project configuration. */
function startViewer(config, runtime, scope, basePath) {
  const { PINWHY_CWD: _cwd, PINWHY_AGENT: _agent, PINWHY_PORT: _port, ...env } = process.env;
  if (process.versions.electron) env.ELECTRON_RUN_AS_NODE = '1';
  const child = spawn(config.nodeExecutable, [runtime.real, 'serve', `--cwd=${scope.boardRoot}`,
    '--read-only', '--ephemeral', '--json', '--port=0', `--base-path=${basePath}`], {
    cwd: scope.boardRoot, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  let alive = true, settled = false, bytes = 0, stdout = '', stderr = '', escalation;
  let resolveReady, rejectReady;
  const ready = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const closed = new Promise(resolve => child.once('close', () => { alive = false; clearTimeout(escalation); resolve(); }));
  const stop = () => {
    if (!alive) return closed;
    child.kill('SIGTERM');
    escalation ??= setTimeout(() => child.kill('SIGKILL'), 500);
    escalation.unref();
    return closed;
  };
  const fail = error => {
    if (!settled) { settled = true; clearTimeout(deadline); rejectReady(error); }
    void stop();
  };
  const deadline = setTimeout(() => fail(new PinwhyError('TIMEOUT', 'The read-only viewer did not become ready.')), config.timeoutMs);
  child.once('error', cause => fail(new PinwhyError('SPAWN_FAILED', 'The viewer process could not start.', { cause })));
  child.once('close', (code, signal) => {
    if (!settled) { settled = true; clearTimeout(deadline); rejectReady(new PinwhyError('CLI_FAILED', `Viewer exited ${code ?? signal}: ${stderr.trim()}`)); }
  });
  const collect = chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > config.maxOutputBytes) { fail(new PinwhyError('OUTPUT_LIMIT', 'The viewer startup output exceeded its limit.')); return false; }
    return true;
  };
  child.stderr.on('data', chunk => { if (collect(chunk)) stderr += chunk; });
  child.stdout.on('data', chunk => {
    if (!collect(chunk) || settled) return;
    stdout += chunk;
    const newline = stdout.indexOf('\n');
    if (newline < 0) return;
    try {
      const value = JSON.parse(stdout.slice(0, newline));
      const url = new URL(value.url);
      if (value.schema !== 'pinwhy.viewer.v1' || value.cwd !== scope.boardRoot || value.readOnly !== true
        || url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
        || url.pathname !== basePath || url.search || url.hash || url.username || url.password) {
        throw new Error('unexpected viewer identity');
      }
      settled = true; clearTimeout(deadline); resolveReady(value.url);
    } catch (cause) { fail(new PinwhyError('INVALID_JSON', 'The CLI did not return a valid read-only viewer address.', { cause })); }
  });
  return { ready, stop, get alive() { return alive; } };
}

/** Host-owned viewer processes are isolated by Session and discarded with their lifecycle. */
export class ViewerSessions {
  #entries = new Map();
  #disposed = false;
  constructor(config, bridge, session) { this.config = config; this.bridge = bridge; this.session = session; }

  async #binding(sessionId, signal) {
    if (this.#disposed) throw new PinwhyError('DISPOSED', 'The viewer adapter has unloaded.');
    signal?.throwIfAborted();
    const session = this.session(sessionId);
    if (!session) throw new PinwhyError('SESSION_REQUIRED', 'Open a live project Session before opening its board.');
    const config = this.config();
    const scope = await selectScope(config, { agent: { session }, signal });
    return { config, scope };
  }

  async open(sessionId, signal) {
    const { config, scope } = await this.#binding(sessionId, signal);
    const runtime = await this.bridge.runtime(config);
    if (runtime.capabilities.features?.ephemeralViewer !== true
      || runtime.capabilities.outputs?.serve?.schema !== 'pinwhy.viewer.v1') {
      throw new PinwhyError('RUNTIME_INCOMPATIBLE', 'Upgrade Pinwhy to a runtime providing the ephemeral read-only Web viewer.');
    }
    signal?.throwIfAborted();
    if (this.#disposed) throw new PinwhyError('DISPOSED', 'The viewer adapter has unloaded.');
    const key = JSON.stringify([scope.boardRoot, config.nodeExecutable, runtime.real, config.timeoutMs, config.maxOutputBytes]);
    let entry = this.#entries.get(sessionId);
    if (entry && (entry.key !== key || !entry.process.alive)) {
      this.#entries.delete(sessionId);
      await entry.process.stop();
      entry = undefined;
    }
    // Recheck after stopping an obsolete process: another opener may have won the slot.
    if (this.#disposed) throw new PinwhyError('DISPOSED', 'The viewer adapter has unloaded.');
    if (!this.session(sessionId)) throw new PinwhyError('SESSION_REQUIRED', 'The Session closed while opening its board.');
    entry ??= this.#entries.get(sessionId);
    if (!entry) {
      const viewerId = randomUUID(), basePath = `${PREFIX}${viewerId}/`;
      const process = startViewer(config, runtime, scope, basePath);
      entry = { key, scope, viewerId, basePath, process, sessionId };
      this.#entries.set(sessionId, entry);
      process.ready.catch(() => { if (this.#entries.get(sessionId) === entry) this.#entries.delete(sessionId); });
    }
    const url = await entry.process.ready;
    signal?.throwIfAborted();
    if (this.#disposed || this.#entries.get(sessionId) !== entry) throw new PinwhyError('DISPOSED', 'The viewer Session has closed.');
    return { url, boardRoot: scope.boardRoot, agentId: scope.agentId, viewerId: entry.viewerId };
  }

  /** Re-read one canonical CLI record; no cursor, init, write or viewer process is involved. */
  async readNode(sessionId, nodeId, signal) {
    const { config, scope } = await this.#binding(sessionId, signal);
    // `show` is the CLI's canonical node-get contract. It is board-scoped but not
    // cursor-aware, so `path` binds only --cwd (the command has no --agent option).
    const argv = bound(['show', '--json', '--', nodeId], scope, 'path');
    const { boardRoot, agentId, data } = await this.bridge.run(scope, argv, signal, undefined, config);
    const node = data?.node;
    if (!node || typeof node !== 'object' || Array.isArray(node)
      || typeof node.id !== 'string' || !node.id.trim() || node.id.includes('\0')
      || typeof node.title !== 'string' || !node.title.trim()) {
      throw new PinwhyError('CLI_FAILED', 'The CLI did not return one canonical node record.');
    }
    return { boardRoot, agentId, node };
  }

  async resolve(pathname, signal) {
    const entry = [...this.#entries.values()].find(item => pathname.startsWith(item.basePath));
    if (!entry || !entry.process.alive) throw new PinwhyError('VIEWER_MISSING', 'Reopen the board to start its viewer.');
    const { scope } = await this.#binding(entry.sessionId, signal);
    if (scope.boardRoot !== entry.scope.boardRoot) throw new PinwhyError('NOT_ENABLED', 'The Session board binding has changed. Reopen the board.');
    const url = await entry.process.ready;
    return new URL(url).origin;
  }

  async closeSession(sessionId) {
    const entry = this.#entries.get(sessionId);
    this.#entries.delete(sessionId);
    await entry?.process.stop();
  }

  async dispose() {
    this.#disposed = true;
    const entries = [...this.#entries.values()];
    this.#entries.clear();
    await Promise.all(entries.map(entry => entry.process.stop()));
  }
}

/** Authenticated Web transport uses the same prefix as the native loopback viewer. */
function proxyViewer(ctx, viewers, req, res) {
  const admission = ctx.connection.admit(req);
  if ('rejection' in admission || admission.peer.principal.kind !== 'owner') {
    res.writeHead('rejection' in admission ? admission.rejection : 403); res.end(); return;
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
  const abort = new AbortController();
  res.once('close', () => abort.abort());
  const url = new URL(req.url, 'http://viewer.invalid');
  viewers.resolve(url.pathname, abort.signal).then(origin => {
    if (abort.signal.aborted) return;
    const upstream = http.request(new URL(url.pathname + url.search, origin), {
      method: req.method, signal: abort.signal, headers: { accept: req.headers.accept ?? '*/*' },
    }, response => {
      // Do not forward cookies or grant cross-origin access; this stays inside the authenticated Host.
      const headers = {};
      for (const key of ['content-type', 'cache-control']) if (response.headers[key]) headers[key] = response.headers[key];
      res.writeHead(response.statusCode ?? 502, headers);
      pipeline(response, res, () => {});
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    upstream.end();
  }).catch(error => {
    if (abort.signal.aborted) return;
    res.writeHead(error.code === 'VIEWER_MISSING' ? 410 : 403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(error.message);
  });
}

/**
 * Exact Fetch RPC: one `client-request` envelope on Web and native carriers.
 * A malformed envelope is a transport error; handling failures stay inside `result`.
 */
function registerRpc(ctx, path, method, failureCode, handle) {
  ctx.effect(() => ctx.connection.fetch.register({
    path, methods: ['POST'], requestBody: 'buffered',
    async fetch(request) {
      let message;
      try { message = await request.json(); } catch { return new Response('Invalid JSON envelope', { status: 400 }); }
      if (message?.type !== 'client-request' || typeof message.rpcId !== 'string' || message.method !== method) {
        return new Response('Invalid RPC envelope', { status: 400 });
      }
      let result;
      try { result = { ok: true, value: await handle(message.payload, request) }; }
      catch (error) { result = { ok: false, error: { code: error.code ?? failureCode, message: error.message, details: {} } }; }
      return Response.json({ type: 'server-response', rpcId: message.rpcId, result });
    },
  }));
}

/** Add GUI support optionally: headless tools and Skills have no viewer dependency. */
export function mountViewer(ctx, config, bridge) {
  const viewers = new ViewerSessions(config, bridge, id => ctx.sessions.get(id));
  ctx.effect(() => () => viewers.dispose());
  ctx.effect(() => ctx.on('session/disposed', session => { void viewers.closeSession(session.id); }));
  // Exact Fetch routes use the Host's owner admission on Web and native carriers.
  registerRpc(ctx, '/api/pinwhy/viewer.open', 'pinwhy/viewer.open', 'VIEWER_FAILED', async (payload, request) => {
    if (!payload || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()
      || Object.keys(payload).some(key => key !== 'sessionId')) throw new PinwhyError('INVALID_ARGUMENT', 'Expected a Session identity.');
    const value = await viewers.open(payload.sessionId, request.signal);
    const url = new URL(value.url);
    url.searchParams.set('agent', value.agentId);
    url.searchParams.set('view', 'logic');
    url.searchParams.set('embed', '1');
    value.url = ctx.get('webServer') ? url.pathname + url.search : url.href;
    return value;
  });
  // The board may hand a node identity to the Host; the record itself is re-read from the CLI.
  registerRpc(ctx, '/api/pinwhy/node.read', 'pinwhy/node.read', 'NODE_READ_FAILED', async (payload, request) => {
    const { sessionId, nodeId } = nodeReadPayload(payload);
    return viewers.readNode(sessionId, nodeId, request.signal);
  });
  ctx.inject(['webServer'], web => {
    web.effect(() => web.webServer.register({ kind: 'prefix', path: PREFIX.slice(0, -1), handler: (req, res) => proxyViewer(ctx, viewers, req, res) }));
  });
}
