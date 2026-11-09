import fs from 'node:fs';
import path from 'node:path';
import { paths, readConfig, withLock } from './store.js';

export const DEFAULT_PORT = 4333;

function validatePort(value, allowZero = false) {
  if ((typeof value !== 'number' && typeof value !== 'string')
    || (typeof value === 'string' && !/^\d+$/.test(value))
    || !Number.isInteger(Number(value))
    || Number(value) < (allowZero ? 0 : 1)
    || Number(value) > 65535) {
    throw new Error(`Invalid port: ${String(value)}; expected an integer from ${allowZero ? '0' : '1'} to 65535`);
  }
  return Number(value);
}

/** Explicit flags, PINWHY_PORT, project config, then the default. */
export function resolvePort({ cwd = process.cwd(), port, env = process.env, allowZero = false } = {}) {
  let value = port !== undefined ? port : env.PINWHY_PORT;
  if (value === undefined) value = readConfig(cwd).viewerPort;
  return validatePort(value === undefined ? DEFAULT_PORT : value, allowZero);
}

export function viewerUrl(port) {
  return `http://127.0.0.1:${validatePort(port)}`;
}

/** Store only the selected port alongside the existing project configuration. */
export function rememberViewerPort(cwd, port) {
  const viewerPort = validatePort(port);
  const file = paths(cwd).config;
  withLock(() => {
    const config = { ...readConfig(cwd), viewerPort };
    fs.writeFileSync(file, JSON.stringify(config, null, 2));
  }, cwd);
  return viewerPort;
}

/** A reachable HTTP listener is not necessarily this project's pinwhy. */
async function inspectViewer({ cwd = process.cwd(), port } = {}) {
  port = resolvePort({ cwd, port });
  const viewer = { port, url: viewerUrl(port), state: 'offline', cwd: null, readOnly: null };
  let response;
  try {
    response = await fetch(`${viewer.url}/api/status`, {
      signal: AbortSignal.timeout(800), redirect: 'error',
    });
  } catch {
    return viewer;
  }
  viewer.state = 'unrecognized';
  try {
    if (!response.ok) return viewer;
    const status = await response.json();
    if (!status || typeof status.cwd !== 'string' || !path.isAbsolute(status.cwd)
      || typeof status.readOnly !== 'boolean') return viewer;
    const actual = fs.realpathSync(status.cwd);
    viewer.cwd = actual;
    viewer.readOnly = status.readOnly;
    if (status.build && typeof status.build === 'object' && !Array.isArray(status.build)) viewer.build = status.build;
    if (Number.isSafeInteger(status.pid) && status.pid > 1) viewer.pid = status.pid;
    viewer.state = actual === fs.realpathSync(cwd) ? 'online' : 'other-project';
  } catch {
    // Invalid JSON, an unknown identity, or a disappearing service stays unrecognized.
  }
  return viewer;
}

export async function probeViewer(options) {
  const { pid: _pid, ...viewer } = await inspectViewer(options);
  return viewer;
}

/** Stop this project's viewer; a listener that does not identify as this project is left alone. */
export async function stopViewer({ cwd = process.cwd(), port, timeoutMs = 5000 } = {}) {
  const { pid, ...viewer } = await inspectViewer({ cwd, port });
  const result = { via: null, port: viewer.port, url: viewer.url };
  if (viewer.state === 'offline') return { ...result, state: 'not-running' };
  if (viewer.state === 'other-project') {
    throw new Error(`Port ${viewer.port} is serving another project ${viewer.cwd}; it was not stopped. To stop it, run pinwhy stop --cwd "${viewer.cwd}" --port ${viewer.port}`);
  }
  if (viewer.state === 'unrecognized') throw new Error(`Port ${viewer.port} is not serving a recognized pinwhy service; it was not stopped`);
  if (!pid) throw new Error('This viewer was started by an older version that does not support stop and did not report a process ID; press Ctrl+C in its terminal');
  try {
    process.kill(pid, 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') throw new Error(`Cannot stop process ${pid}: ${error.code || error.message}`);
  }
  const deadline = Date.now() + timeoutMs;
  while ((await probeViewer({ cwd, port: viewer.port })).state === 'online') {
    if (Date.now() >= deadline) {
      throw new Error(`A stop signal was sent to process ${pid}, but the service is still online; if a system service manager controls it, run pinwhy service stop`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { ...result, state: 'stopped', via: 'process' };
}
