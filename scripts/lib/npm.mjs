import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { isolatedPinwhyEnv } from './environment.mjs';

// Invoke npm's JavaScript entry directly, including on Windows (.cmd is not an executable).
export function npmEntry() {
  const candidates = [process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')];
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    for (const name of ['npm', 'npm.cmd']) {
      const file = path.join(dir, name);
      try {
        const resolved = fs.realpathSync(file);
        if (resolved.endsWith('.js')) candidates.push(resolved);
        candidates.push(path.join(path.dirname(resolved), 'node_modules/npm/bin/npm-cli.js'));
      } catch {}
    }
  }
  const entry = candidates.find((file) => file && file.endsWith('.js') && fs.existsSync(file));
  assert.ok(entry, 'npm CLI entry not found; run through npm run verify:package or install npm alongside Node');
  return entry;
}

/** Isolate npm configuration, cache and Pinwhy data without creating files or installing integrations. */
export function isolatedNpmEnv(home, overrides = {}) {
  return isolatedPinwhyEnv({
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    LOCALAPPDATA: path.join(home, 'AppData', 'Local'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CONFIG_HOME: path.join(home, '.config'),
    npm_config_cache: path.join(home, 'npm-cache'),
    npm_config_userconfig: path.join(home, '.npmrc'),
    npm_config_globalconfig: path.join(home, 'global.npmrc'),
    npm_config_update_notifier: 'false',
    ...overrides,
  });
}
