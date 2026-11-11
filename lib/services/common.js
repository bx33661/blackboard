import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const LABEL = 'com.bx33661.pinwhy.workspace';
export const OWNER = 'pinwhy-workspace-service-v1';

/** Native operations must never leave setup waiting for an interactive prompt. */
export function runNative(command, args) {
  try {
    return execFileSync(command, args, { encoding: 'utf8', timeout: 15000, windowsHide: true,
      maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (cause) {
    const error = new Error(`${command} ${args[0]} failed: ${cause.stderr?.toString().trim() || cause.message}`, { cause });
    error.status = cause.status;
    error.code = cause.code;
    error.stdout = cause.stdout?.toString() || '';
    error.stderr = cause.stderr?.toString() || '';
    throw error;
  }
}

export function readOptional(file) {
  try { return fs.readFileSync(file); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export function serviceState({ mode, file, configured = false, managed = false, loaded = false,
  running = false, config = null, cwd = process.cwd(), ...extra }) {
  return { mode, label: LABEL, file, configured, managed, loaded, running,
    state: (configured || loaded || running) && !managed ? 'unmanaged' : running ? 'running'
      : loaded ? 'waiting' : configured ? 'stopped' : 'not-installed',
    cwd: managed ? config.cwd : null, port: managed ? config.port : null,
    ...(managed ? { cli: config.cli, node: config.node } : {}),
    currentProject: managed && path.resolve(config.cwd) === path.resolve(cwd), ...extra };
}

export function unavailable(mode, file, message) {
  return { mode, label: LABEL, file, state: 'unavailable', configured: false,
    managed: false, loaded: false, running: false, cwd: null, port: null, currentProject: false, message };
}

export function validConfig(config, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return config && config.owner === OWNER && ['cwd', 'cli', 'node'].every(key =>
    typeof config[key] === 'string' && paths.isAbsolute(config[key]) && !/[\0\r\n]/.test(config[key]))
    && /[\\/]bin[\\/]pinwhy\.js$/.test(config.cli)
    && Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535;
}

/** Preserve both on-disk bytes and the native manager's registration on failure. */
export async function replaceManagedService({ adapter, previous, config, start, health }) {
  if (previous.state === 'unavailable') throw new Error(previous.message);
  if (previous.state === 'unmanaged') throw new Error(`Refusing to overwrite a service not managed by pinwhy: ${previous.file}`);
  const file = previous.file;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const recoveryDir = fs.mkdtempSync(path.join(path.dirname(file), '.pinwhy-service-recovery-'));
  const recoveryPath = path.join(recoveryDir, 'original');
  const staged = path.join(recoveryDir, 'replacement');
  const original = readOptional(file);
  let touched = false;
  let published = false;
  const mode = original ? fs.statSync(file).mode & 0o777 : 0o600;
  let result;
  try {
    if (original) fs.writeFileSync(recoveryPath, original, { mode });
    adapter.saveRecovery?.(previous, recoveryDir);
    fs.writeFileSync(staged, adapter.render(config), { mode });
    if (previous.configured || previous.loaded || previous.running) {
      touched = true;
      adapter.deactivate(previous);
    }
    fs.renameSync(staged, file);
    published = true;
    touched = true;
    adapter.activate(config, start);
    const check = start ? await health(config) : {};
    result = { ...adapter.status({ cwd: config.cwd }), verified: start, ...check,
      previousCwd: previous.cwd, switched: !!previous.cwd && previous.cwd !== config.cwd };
  } catch (cause) {
    const failures = [];
    if (touched) {
      try { adapter.deactivate({ ...previous, configured: true }); } catch (error) { failures.push(error.message); }
    }
    let restored = !published;
    if (published) {
      try {
        if (original) {
          fs.copyFileSync(recoveryPath, staged);
          fs.chmodSync(staged, mode);
          fs.renameSync(staged, file);
        } else fs.unlinkSync(file);
        restored = true;
      } catch (error) { failures.push(error.message); }
    }
    if (touched && restored) {
      try { adapter.restore(previous); } catch (error) { failures.push(error.message); }
    }
    if (failures.length) {
      const error = new Error(`${cause.message}; service rollback failed: ${failures.join('; ')}; recovery files retained at ${recoveryDir}`, { cause });
      error.recoveryPath = original ? recoveryPath : recoveryDir;
      error.recoveryDirectory = recoveryDir;
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

export function stopManagedService(adapter, { cwd, uninstall = false } = {}) {
  const before = adapter.status({ cwd });
  if (before.state === 'unavailable') return before;
  if (before.state === 'unmanaged') throw new Error(`Refusing to modify a service not managed by pinwhy: ${before.file}`);
  if (before.managed) {
    adapter.deactivate(before);
    if (uninstall) {
      adapter.remove(before);
      if (readOptional(before.file)) fs.unlinkSync(before.file);
      adapter.reload?.();
    }
  }
  return { ...adapter.status({ cwd }), removed: uninstall && before.managed,
    message: uninstall ? 'Managed service uninstalled; pinwhy data is unchanged.' : 'Service stopped; configuration and pinwhy data are unchanged. Run service start to restart it.' };
}
