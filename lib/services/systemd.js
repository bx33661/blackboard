import os from 'node:os';
import path from 'node:path';
import { LABEL, OWNER, readOptional, runNative, serviceState, unavailable, validConfig } from './common.js';

const UNIT = `${LABEL}.service`;

// systemd parses these itself: escape % specifiers and disable $ expansion
// with ExecStart's ':' prefix, including for the executable path.
function quote(value) {
  const text = String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('%', '%%');
  return `"${text}"`;
}

export function renderSystemdUnit(config) {
  if (!validConfig(config, 'linux')) throw new Error('Invalid systemd service configuration');
  return `# ${OWNER} ${Buffer.from(JSON.stringify(config)).toString('base64')}
[Unit]
Description=Pinwhy workspace viewer

[Service]
Type=simple
WorkingDirectory=${quote(config.cwd)}
ExecStart=:${[config.node, config.cli, 'serve', '--cwd', config.cwd, '--port', String(config.port)].map(quote).join(' ')}
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
`;
}

function parseUnit(raw) {
  const marker = new RegExp(`^# ${OWNER} ([A-Za-z0-9+/=]+)$`, 'm').exec(raw)?.[1];
  if (!marker) return null;
  let config;
  try { config = JSON.parse(Buffer.from(marker, 'base64').toString('utf8')); } catch { return null; }
  if (!validConfig(config, 'linux')) return null;
  // Every effective directive must match; comments and blank lines are harmless.
  const directives = text => text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#')).join('\n');
  return directives(raw) === directives(renderSystemdUnit(config)) ? config : null;
}

function noSession(error) {
  return error.code === 'ENOENT' || /Failed to connect to (?:user scope )?bus(?: via local transport)?: (?:No medium found|No such file or directory|Host is down)|\$DBUS_SESSION_BUS_ADDRESS and \$XDG_RUNTIME_DIR not defined|System has not been booted with systemd/i.test(error.message);
}

export function createSystemdService({ run = runNative, home = os.homedir(), configHome = process.env.XDG_CONFIG_HOME } = {}) {
  const file = path.join(configHome && path.isAbsolute(configHome) ? configHome : path.join(home, '.config'), 'systemd', 'user', UNIT);
  const ctl = args => run('systemctl', ['--user', ...args]);
  const reload = () => ctl(['daemon-reload']);
  const adapter = {
    mode: 'systemd', file, render: renderSystemdUnit, reload,
    status({ cwd = process.cwd() } = {}) {
      const raw = readOptional(file);
      let output;
      try {
        output = ctl(['show', UNIT, '--no-pager', '--property=LoadState,ActiveState,UnitFileState,FragmentPath']);
      } catch (error) {
        if (noSession(error)) return unavailable('systemd', file, 'systemd --user is unavailable; it requires a systemd session and user bus for the current user.');
        if (error.status === 4 && /(?:^|\n)LoadState=not-found(?:\n|$)/.test(error.stdout)) output = error.stdout;
        else throw error;
      }
      const properties = Object.fromEntries(output.trim().split(/\r?\n/).map(line => {
        const index = line.indexOf('=');
        if (index < 1) throw new Error(`Cannot parse systemd service status: ${line}`);
        return [line.slice(0, index), line.slice(index + 1)];
      }));
      if (!['loaded', 'not-found', 'error', 'bad-setting', 'masked', 'merged', 'stub'].includes(properties.LoadState)
        || !['active', 'inactive', 'activating', 'deactivating', 'failed', 'reloading', 'maintenance'].includes(properties.ActiveState)
        || properties.UnitFileState === undefined || properties.FragmentPath === undefined) {
        throw new Error('Cannot parse systemd service status');
      }
      const config = raw ? parseUnit(raw.toString('utf8')) : null;
      const fragmentOwned = !properties.FragmentPath || path.resolve(properties.FragmentPath) === path.resolve(file);
      // Drop-ins can override ExecStart and are never ours.
      let dropins;
      try { dropins = ctl(['show', UNIT, '--no-pager', '--property=DropInPaths', '--value']).trim(); }
      catch (error) { if (error.status === 4 && properties.LoadState === 'not-found') dropins = ''; else throw error; }
      const registered = properties.LoadState !== 'not-found';
      const loaded = ['enabled', 'enabled-runtime'].includes(properties.UnitFileState);
      return serviceState({ mode: 'systemd', file, cwd, configured: !!raw || registered,
        managed: !!config && fragmentOwned && !dropins && !['masked', 'error', 'bad-setting'].includes(properties.LoadState),
        config, loaded, running: properties.ActiveState === 'active' });
    },
    deactivate() { reload(); ctl(['disable', '--now', UNIT]); },
    activate(config, start) {
      reload();
      if (start) ctl(['enable', '--now', UNIT]);
    },
    restore(previous) {
      reload();
      if (previous.loaded) ctl(['enable', UNIT]);
      if (previous.running) ctl(['start', UNIT]);
    },
    remove() {},
  };
  return adapter;
}
