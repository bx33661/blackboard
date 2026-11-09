// One-shot project onboarding. This is deliberately infrastructure-only: it
// prepares storage, Claude integration and the viewer, but never chooses work
// for the Agent or writes semantic nodes on its behalf.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ensure, protectBoard, readConfig, setMeta, withLock } from './store.js';
import {
  installHooks, installLauncher, installSkill, resolveNodeBinary,
} from './hooks.js';
import { resolvePort, viewerUrl, rememberViewerPort, probeViewer } from './service.js';
import { createSystemdService } from './services/systemd.js';
import { createWindowsService } from './services/windows.js';
import { OWNER, replaceManagedService, stopManagedService } from './services/common.js';

function platformService() {
  if (process.platform === 'linux') return createSystemdService();
  if (process.platform === 'win32') return createWindowsService();
  return null;
}

export const WORKSPACE_SERVICE_LABEL = 'com.bx33661.pinwhy.workspace';

function xml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** POSIX single-quote escaping, for commands printed to the user. */
function sh(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

export function renderLaunchAgent({ cwd, cli, node = resolveNodeBinary(), port }) {
  port = resolvePort({ cwd, port });
  const log = path.join(os.tmpdir(), 'pinwhy-workspace.log');
  const err = path.join(os.tmpdir(), 'pinwhy-workspace.err.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${WORKSPACE_SERVICE_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xml(node)}</string>
    <string>${xml(cli)}</string>
    <string>serve</string>
    <string>--port</string>
    <string>${Number(port)}</string>
  </array>
  <key>WorkingDirectory</key><string>${xml(cwd)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PINWHY_CWD</key><string>${xml(cwd)}</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(err)}</string>
</dict>
</plist>
`;
}

function launchctl(args) {
  try {
    return execFileSync('launchctl', args, { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    const failure = new Error(`launchctl ${args[0]} failed: ${message}`);
    failure.status = error.status;
    throw failure;
  }
}

function workspaceServiceFile() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', `${WORKSPACE_SERVICE_LABEL}.plist`);
}

function plistString(raw, key) {
  const value = new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`).exec(raw)?.[1];
  return value === undefined ? null : value.replace(/&(amp|lt|gt|quot|apos);/g, (_, entity) =>
    ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[entity]);
}

function plistPort(raw) {
  const argumentsXml = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(raw)?.[1] || '';
  const value = /<string>--port<\/string>\s*<string>(\d+)<\/string>/.exec(argumentsXml)?.[1];
  return value === undefined ? null : resolvePort({ port: value });
}

function plistProgram(raw) {
  const args = /<key>ProgramArguments<\/key>\s*<array>([\s\S]*?)<\/array>/.exec(raw)?.[1] || '';
  return [...args.matchAll(/<string>([^<]*)<\/string>/g)].map(match =>
    plistString(`<key>value</key><string>${match[1]}</string>`, 'value'));
}

/** The single shared service can belong to a different project than the caller. */
export function workspaceServiceStatus({ cwd = process.cwd() } = {}) {
  const adapter = platformService();
  if (adapter) return adapter.status({ cwd });
  if (process.platform !== 'darwin') {
    return { mode: 'unsupported', state: 'unavailable', configured: false, managed: false, loaded: false,
      running: false, cwd: null, port: null, currentProject: false,
      message: 'Persistent services are not managed on this platform; run pinwhy serve manually and stop its foreground process to shut it down.' };
  }
  const file = workspaceServiceFile();
  const exists = fs.existsSync(file);
  const raw = exists ? fs.readFileSync(file, 'utf8') : '';
  const owner = plistString(raw, 'WorkingDirectory');
  const managed = exists && plistString(raw, 'Label') === WORKSPACE_SERVICE_LABEL
    && /<string>[^<]*\/bin\/pinwhy\.js<\/string>/.test(raw)
    && raw.includes('<string>serve</string>') && !!owner;
  let loaded = false;
  let running = false;
  try {
    const output = launchctl(['print', `gui/${process.getuid()}/${WORKSPACE_SERVICE_LABEL}`]);
    loaded = true;
    running = /^\s*state\s*=\s*running\s*$/m.test(output);
  } catch (error) {
    if (error.status !== 113 && error.status !== 3) throw error;
  }
  return {
    mode: 'launchd', label: WORKSPACE_SERVICE_LABEL, file, configured: exists, managed, loaded, running,
    state: (exists || loaded) && !managed ? 'unmanaged' : running ? 'running' : loaded ? 'waiting' : exists ? 'stopped' : 'not-installed',
    cwd: managed ? owner : null,
    port: managed ? plistPort(raw) : null,
    ...(managed ? { node: plistProgram(raw)[0], cli: plistProgram(raw)[1] } : {}),
    currentProject: managed && path.resolve(owner) === path.resolve(cwd),
  };
}

/** Stop leaves registration on disk; uninstall removes only our fixed managed plist. */
export function stopWorkspaceService({ cwd = process.cwd(), uninstall = false } = {}) {
  const adapter = platformService();
  if (adapter) return stopManagedService(adapter, { cwd, uninstall });
  const before = workspaceServiceStatus({ cwd });
  if (before.mode === 'unsupported') return before;
  if (before.state === 'unmanaged') throw new Error(`Refusing to modify a service not managed by pinwhy: ${before.file}`);
  if (before.loaded) launchctl(['bootout', `gui/${process.getuid()}/${WORKSPACE_SERVICE_LABEL}`]);
  if (uninstall && before.managed) fs.unlinkSync(before.file);
  return {
    ...before, loaded: false, running: false, state: uninstall || !before.configured ? 'not-installed' : 'stopped',
    configured: uninstall ? false : before.configured,
    managed: uninstall ? false : before.managed,
    removed: uninstall && before.managed,
    message: uninstall ? 'Managed service uninstalled; pinwhy data is unchanged.' : 'Service stopped; configuration and pinwhy data are unchanged. Run service start to restart it.',
  };
}

async function waitForGraph({ cwd, port }, timeoutMs = 6000) {
  const url = viewerUrl(port);
  const deadline = Date.now() + timeoutMs;
  let last = 'The service did not respond';
  while (Date.now() < deadline) {
    try {
      const viewer = await probeViewer({ cwd, port });
      if (viewer.state === 'online') {
        const response = await fetch(`${url}/api/graph`, { signal: AbortSignal.timeout(800) });
        if (response.ok) {
          const graph = await response.json();
          return { ok: true, nodes: Object.keys(graph.nodes || {}).length };
        }
        last = `HTTP ${response.status}`;
      } else {
        last = viewer.state === 'other-project'
          ? `Port ${port} is serving another project: ${viewer.cwd}`
          : viewer.state;
      }
    } catch (error) {
      last = error.message;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error(`pinwhy service startup verification failed: ${last}`);
}

async function bootstrapService(file) {
  let failure;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 150 * attempt));
    try {
      launchctl(['bootstrap', `gui/${process.getuid()}`, file]);
      return;
    } catch (error) { failure = error; }
  }
  throw failure;
}

function unloadService() {
  try { launchctl(['bootout', `gui/${process.getuid()}/${WORKSPACE_SERVICE_LABEL}`]); }
  catch (error) { if (error.status !== 113 && error.status !== 3) throw error; }
}

/** Keep exact recovery bytes until both replacement and its health check succeed. */
async function replaceWorkspaceService({ previous, cwd, cli, port, start }) {
  const file = previous.file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const recoveryDir = fs.mkdtempSync(path.join(path.dirname(file), '.pinwhy-service-recovery-'));
  const recoveryPath = path.join(recoveryDir, 'original.plist');
  const staged = path.join(recoveryDir, 'replacement.plist');
  let mode = 0o644;
  let registrationTouched = false;
  let fileTouched = false;
  let result;
  try {
    if (previous.configured) mode = fs.statSync(file).mode & 0o777;
    if (previous.configured) fs.copyFileSync(file, recoveryPath);
    fs.writeFileSync(staged, renderLaunchAgent({ cwd, cli, port }), { mode });
    if (previous.loaded) {
      registrationTouched = true;
      launchctl(['bootout', `gui/${process.getuid()}/${WORKSPACE_SERVICE_LABEL}`]);
    }
    fs.renameSync(staged, file);
    fileTouched = true;
    let check = {};
    if (start) {
      registrationTouched = true;
      await bootstrapService(file);
      check = await waitForGraph({ cwd, port });
    }
    result = {
      mode: 'launchd', file, label: WORKSPACE_SERVICE_LABEL, port, url: viewerUrl(port), verified: start, ...check,
      previousCwd: previous.cwd, cwd: path.resolve(cwd),
      switched: !!previous.cwd && path.resolve(previous.cwd) !== path.resolve(cwd),
    };
  } catch (cause) {
    const failures = [];
    if (registrationTouched) {
      try { unloadService(); } catch (error) { failures.push(error.message); }
    }
    let restored = !fileTouched;
    if (fileTouched) {
      try {
        if (previous.configured) {
          fs.copyFileSync(recoveryPath, staged);
          fs.chmodSync(staged, mode);
          fs.renameSync(staged, file);
        } else fs.unlinkSync(file);
        restored = true;
      } catch (error) { failures.push(error.message); }
    }
    if (registrationTouched && previous.loaded && restored && !failures.length) {
      try { await bootstrapService(file); } catch (error) { failures.push(error.message); }
    }
    if (failures.length) {
      const preserved = previous.configured ? recoveryPath : recoveryDir;
      const error = new Error(`${cause.message}; service rollback failed: ${failures.join('; ')}; recovery files retained at ${preserved}`, { cause });
      error.recoveryPath = preserved;
      error.previousLoaded = previous.loaded;
      throw error;
    }
    fs.rmSync(recoveryDir, { recursive: true });
    throw new Error(`${cause.message}; ${previous.configured ? 'restored the original service configuration and load state' : 'removed the failed service configuration and registration'}`, { cause });
  }
  try { fs.rmSync(recoveryDir, { recursive: true }); }
  catch (error) { result.warning = `Service updated, but recovery file cleanup failed: ${error.message}; files retained at ${recoveryDir}`; }
  return result;
}

export async function installWorkspaceService({ cwd, cli, port }) {
  port = resolvePort({ cwd, port });
  const adapter = platformService();
  if (adapter) {
    const config = { owner: OWNER, cwd: path.resolve(cwd), cli: path.resolve(cli), node: resolveNodeBinary(), port };
    const previous = adapter.status({ cwd });
    const result = await replaceManagedService({ adapter, previous, config, start: true, health: waitForGraph });
    return { ...result, url: viewerUrl(port) };
  }
  const url = viewerUrl(port);
  if (process.platform !== 'darwin') {
    return {
      mode: 'manual', url, verified: false,
      // Single quotes survive POSIX shells verbatim; JSON double quotes would
      // still let $var, `cmd`, and $(…) expand inside printed paths.
      command: `PINWHY_CWD=${sh(cwd)} ${sh(resolveNodeBinary())} ${sh(cli)} serve --port ${port}`,
    };
  }

  const previous = workspaceServiceStatus({ cwd });
  if (previous.state === 'unmanaged') throw new Error(`Refusing to overwrite a service not managed by pinwhy: ${previous.file}`);
  return replaceWorkspaceService({ previous, cwd, cli, port, start: true });
}

/**
 * Point the existing shared service at `cli` without changing its project or
 * port. A running service restarts so it serves the new code; a stopped one
 * stays stopped.
 */
export async function refreshWorkspaceService({ cli }) {
  const status = workspaceServiceStatus();
  if (status.state === 'unmanaged') return { ...status, refreshed: false };
  const adapter = platformService();
  if (adapter) {
    if (!status.managed || status.state === 'unavailable') return { ...status, refreshed: false };
    if (!fs.existsSync(status.cwd)) {
      return { ...status, refreshed: false, warning: `The service's project directory no longer exists: ${status.cwd}; run pinwhy setup again in the target project.` };
    }
    const config = { owner: OWNER, cwd: status.cwd, cli: path.resolve(cli), node: resolveNodeBinary(), port: status.port };
    const result = await replaceManagedService({ adapter, previous: status, config, start: status.loaded, health: waitForGraph });
    return { ...result, url: viewerUrl(config.port), refreshed: true, restarted: status.loaded };
  }
  if (status.mode !== 'launchd' || !status.managed) return { ...status, refreshed: false };
  if (!fs.existsSync(status.cwd)) {
    return { ...status, refreshed: false, warning: `The service's project directory no longer exists: ${status.cwd}; run pinwhy setup again in the target project.` };
  }
  const port = status.port ?? resolvePort({ cwd: status.cwd });
  const result = await replaceWorkspaceService({ previous: status, cwd: status.cwd, cli, port, start: status.loaded });
  return { ...status, ...result, refreshed: true, restarted: status.loaded };
}

export async function setupProject({
  cwd,
  cli,
  title = path.basename(cwd),
  port,
  hooks = true,
  skill = true,
  serve = true,
}) {
  const target = path.resolve(cwd);
  if (!fs.statSync(target).isDirectory()) throw new Error(`Project directory does not exist: ${target}`);
  port = resolvePort({ cwd: target, port });
  const board = ensure(target);
  protectBoard(target);
  if (title) setMeta({ title: String(title) }, target);

  // Semantic writes remain manual. Recovery hooks do not record tool activity.
  withLock(() => {
    const config = { ...readConfig(target), autoRecord: false };
    fs.writeFileSync(board.config, JSON.stringify(config, null, 2));
  }, target);

  const launcher = installLauncher({ cli, scope: 'user' });
  const skillResult = skill ? installSkill({ cwd: target, cli, scope: 'project', agent: 'claude' }) : null;
  const hooksResult = hooks
    ? installHooks({ cwd: target, write: true, cli, scope: 'project', withActivity: false })
    : null;
  const service = serve ? await installWorkspaceService({ cwd: target, cli, port }) : null;
  rememberViewerPort(target, port);

  return {
    cwd: target,
    title: String(title || ''),
    board: board.root,
    autoRecord: false,
    launcher,
    skill: skillResult,
    hooks: hooksResult ? { file: hooksResult.file, activityCapture: false } : null,
    service,
  };
}
