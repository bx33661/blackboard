import fs from 'node:fs';
import path from 'node:path';
import { buildInfo } from './build-info.js';
import { paths } from './storage/layout.js';
import { readEvents, replay } from './storage/event-log.js';
import { inspectIntegrationPaths } from './hooks.js';
import { probeViewer, resolvePort } from './service.js';
import { workspaceServiceStatus } from './setup.js';

const errorCode = (error) => typeof error?.code === 'string' ? error.code : 'inspection_failed';
const jsonObject = (file) => {
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_object');
  return value;
};
const quote = (value) => process.platform === 'win32'
  ? `'${String(value).replaceAll("'", "''")}'`
  : `'${String(value).replaceAll("'", "'\\''")}'`;

function launcherOnPath() {
  const names = process.platform === 'win32' ? ['pinwhy.cmd', 'pinwhy.exe', 'pinwhy.bat'] : ['pinwhy'];
  for (const dir of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const file = path.resolve(dir.replace(/^"|"$/g, ''), name);
      try {
        if (!fs.statSync(file).isFile()) continue;
        fs.accessSync(file, process.platform === 'win32' ? fs.constants.R_OK : fs.constants.X_OK);
        return file;
      } catch { /* Continue searching PATH without executing an arbitrary launcher. */ }
    }
  }
  return null;
}

/** A completed report is data, including failures; inspection never creates or repairs a board. */
export async function diagnose({ cwd = process.cwd(), cli, port, share = false }) {
  cwd = path.resolve(cwd);
  const checks = [];
  const project = share ? '"<project>"' : quote(cwd);
  const command = (args) => `pinwhy ${args} --cwd ${project}`;
  const add = (id, status, message, details = null, remedy = null) => checks.push({ id, status, message, details, remedy });
  add('runtime', Number(process.versions.node.split('.')[0]) >= 18 ? 'ok' : 'error', 'Node.js runtime', {
    nodeVersion: process.versions.node, platform: process.platform, arch: process.arch,
  });

  let build;
  try {
    build = buildInfo();
    add('cli', build.origin.kind === 'checkout' || build.origin.active === false ? 'warning' : 'ok',
      build.origin.kind === 'checkout' ? 'Running from a development checkout' : build.origin.active === false ? 'The current CLI is not the active release' : 'CLI build origin is recognized',
      { cli, version: build.version, buildId: build.buildId, origin: build.origin.kind, active: build.origin.active ?? null },
      build.origin.kind === 'checkout' ? `node ${share ? '"<cli>"' : quote(cli)} release install`
        : build.origin.active === false ? `pinwhy release use ${build.version}` : null);
  } catch (error) { add('cli', 'error', 'Cannot read CLI build information', { code: errorCode(error) }); }

  const launcher = launcherOnPath();
  add('launcher.path', launcher ? 'ok' : 'warning', launcher ? 'The pinwhy launcher is on PATH' : 'The pinwhy launcher was not found on PATH',
    { file: launcher }, launcher ? null : `node ${share ? '"<cli>"' : quote(cli)} launcher --user; add the printed directory to PATH`);

  const board = paths(cwd);
  let boardExists = false;
  try {
    const stat = fs.statSync(board.events);
    boardExists = stat.isFile();
    if (!boardExists) throw new Error('not_a_file');
    const source = readEvents(cwd);
    const graph = replay(cwd, source);
    const { corruptLines = 0, futureEvents = 0, rejected = 0, unknownOps = 0 } = graph.integrity;
    const incompleteTailBytes = Math.max(0, stat.size - source.offset);
    const damaged = corruptLines + rejected;
    add('board.log', damaged || futureEvents ? 'error' : unknownOps || incompleteTailBytes ? 'warning' : 'ok',
      damaged ? 'The event log contains records that cannot be fully replayed' : futureEvents ? 'The log contains a newer event version; this release refuses to write'
        : incompleteTailBytes ? 'The log ends with an incomplete line; a concurrent write may be in progress, so check again later'
          : unknownOps ? 'The log contains operations unknown to this release' : 'The event log can be fully replayed',
      { corruptLines, futureEvents, rejected, unknownOps, incompleteTailBytes },
      damaged ? command('lint') : futureEvents || unknownOps ? 'pinwhy release check' : null);
    try {
      fs.accessSync(board.events, fs.constants.W_OK);
      fs.accessSync(board.root, fs.constants.W_OK);
      add('board.access', 'ok', 'The event log and data directory are writable');
    } catch (error) { add('board.access', 'warning', 'The event log or data directory is not writable', { code: errorCode(error) }); }
  } catch (error) {
    add('board.log', error.code === 'ENOENT' ? 'warning' : 'error',
      error.code === 'ENOENT' ? 'Pinwhy has not been initialized in this project' : 'Cannot read or replay the event log',
      { code: errorCode(error) }, error.code === 'ENOENT' ? command('init') : command('lint'));
  }
  if (boardExists) {
    for (const [id, file, label] of [['board.config', board.config, 'Configuration'], ['board.cache', board.state, 'State cache']]) {
      try { jsonObject(file); add(id, 'ok', `${label} is readable`); }
      catch (error) {
        add(id, id === 'board.config' && error.code !== 'ENOENT' ? 'error' : 'warning',
          `${label} is missing or invalid${id === 'board.cache' ? '; reads can still recover from the event log' : ''}`, { code: errorCode(error) });
      }
    }
  }

  try {
    const entries = inspectIntegrationPaths({ cwd, cli });
    if (!entries.length) add('integrations', 'unknown', 'No installed Skill, Hook, or launcher was found; manual CLI use is unaffected');
    for (const entry of entries) {
      add(`integration.${entry.kind}.${entry.agent || 'cli'}.${entry.scope}${entry.event ? `.${entry.event}` : ''}`,
        entry.state === 'current' ? 'ok' : entry.state === 'invalid' ? 'error' : 'warning',
        entry.state === 'current' ? 'The integration path matches the current CLI'
          : entry.state === 'unexpanded' ? 'The integration still contains an unexpanded CLI placeholder' : entry.state === 'stale' ? 'The integration path or command does not match the current CLI' : 'Cannot inspect the integration file',
        entry,
        entry.state === 'current' ? null : entry.kind === 'launcher' ? 'pinwhy launcher --user'
          : entry.kind === 'hook' ? command(`hooks install --write --${entry.scope}`)
            : command(`skill install${entry.agent === 'codex' ? ' --codex' : ''} --${entry.scope}`));
    }
  } catch (error) { add('integrations', 'error', 'Cannot inspect integration paths', { code: errorCode(error) }); }
  add('integrations.loaded', 'unknown', 'Installed files do not prove that the host has loaded the Skill or executed the Hook; verify within the host');

  let service;
  try {
    service = workspaceServiceStatus({ cwd });
    const status = service.state === 'unmanaged' ? 'error'
      : service.state === 'unavailable' || service.mode === 'unsupported' ? 'unknown'
        : service.managed && !service.currentProject ? 'warning' : 'ok';
    add('service', status, service.state === 'unmanaged' ? 'The service with this name is not owned by Pinwhy; overwriting is forbidden'
      : service.state === 'unavailable' ? 'The current user\'s service manager is unavailable'
        : service.managed && !service.currentProject ? 'The shared service currently belongs to another project' : 'Persistent service registration status',
      { mode: service.mode, state: service.state, managed: !!service.managed, loaded: !!service.loaded,
        running: !!service.running, cwd: service.cwd ?? null, port: service.port ?? null,
        file: service.file ?? null, cli: service.cli ?? null }, service.state === 'unavailable' ? command('serve') : null);
    if (service.managed && service.cli) {
      const current = path.normalize(service.cli) === path.normalize(cli);
      add('service.path', current ? 'ok' : 'warning', current ? 'The persistent service uses the current CLI path' : 'The persistent service CLI path differs from the current command',
        { cli: service.cli }, current ? null : command('service install'));
    }
  } catch (error) { add('service', 'error', 'Cannot inspect persistent service registration', { code: errorCode(error) }); }

  try {
    const selectedPort = port ?? process.env.PINWHY_PORT ?? (service?.currentProject ? service.port : undefined);
    const resolvedPort = resolvePort({ cwd, port: selectedPort });
    // probeViewer needs an existing project directory for realpath, but never a board.
    const viewer = await probeViewer({ cwd, port: resolvedPort });
    add('viewer', viewer.state === 'online' ? 'ok' : viewer.state === 'offline' ? 'warning' : 'error',
      viewer.state === 'online' ? 'The viewer is serving the current project' : viewer.state === 'other-project' ? 'The port is serving another project'
        : viewer.state === 'unrecognized' ? 'The port is occupied by an unrecognized service' : 'The current project viewer is offline',
      { state: viewer.state, port: viewer.port, cwd: viewer.cwd, readOnly: viewer.readOnly },
      viewer.state === 'offline' ? command(`serve --port ${resolvedPort}`) : null);
    if (viewer.state === 'online') {
      const identity = viewer.build;
      add('viewer.build', !identity?.buildId || !build ? 'unknown' : identity.buildId === build.buildId ? 'ok' : 'warning',
        !identity?.buildId ? 'The viewer did not provide a build identity; its running version cannot be verified'
          : identity.buildId === build?.buildId ? 'The viewer build matches the current CLI' : 'The viewer build differs from the current CLI; restart or switch the service',
        { version: identity?.version ?? null, buildId: identity?.buildId ?? null },
        identity?.buildId && build && identity.buildId !== build.buildId
          ? service?.managed && service.currentProject ? command('service start')
            : `${command('stop')}; ${command(`serve --port ${resolvedPort}`)}` : null);
    }
  } catch (error) { add('viewer', 'error', 'Cannot resolve the port configuration or probe the viewer', { code: errorCode(error) }); }

  const status = checks.some(check => check.status === 'error') ? 'error' : checks.some(check => check.status === 'warning') ? 'warning' : 'ok';
  const report = { schema: 'pinwhy.doctor.v1', readOnly: true, cwd, status, checks };
  if (!share) return report;
  const sanitize = (value) => {
    if (Array.isArray(value)) return value.map(sanitize);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
    if (typeof value !== 'string') return value;
    if (path.isAbsolute(value)) return value === cwd ? '<project>' : '<path>';
    return value;
  };
  return sanitize(report);
}
