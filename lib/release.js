// Installed releases. Agents, hooks, the launcher and the shared service run a
// copy under <data>/pinwhy/current, never the development checkout, so
// editing the repository changes nothing until a release is installed.
//
//   <data>/pinwhy/versions/<version>/   immutable copy of the package files
//   <data>/pinwhy/current -> versions/<version>
//
// Upgrading or rolling back only swaps the `current` link; integrations point
// at `current` and do not have to be rewritten.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { publishPackage, publishCurrentLink } from './release/publication.js';

const RELEASE_INFO = '.release.json';

export function releaseHome(env = process.env) {
  return path.join(env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share'), 'pinwhy');
}

function versionsDir(home) {
  return path.join(home, 'versions');
}

function currentLink(home) {
  return path.join(home, 'current');
}

function realpathOrNull(file) {
  try {
    return fs.realpathSync(file);
  } catch {
    return null;
  }
}

function within(parent, child) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

/**
 * Node resolves symlinks for the main script, so a CLI started through
 * `current` sees its versioned path. Integrations must record `current`
 * instead, or an upgrade would leave them pinned to the old version.
 */
export function stableCliPath(cli, home = releaseHome()) {
  const realCurrent = realpathOrNull(currentLink(home));
  const realCli = realpathOrNull(cli);
  if (!realCurrent || !realCli || !within(realCurrent, realCli)) return cli;
  return path.join(currentLink(home), path.relative(realCurrent, realCli));
}

/** Where the running CLI comes from: the active release, another installed version, or a checkout. */
export function cliOrigin(cli, home = releaseHome()) {
  const realCli = realpathOrNull(cli) || cli;
  const realVersions = realpathOrNull(versionsDir(home));
  if (realVersions && within(realVersions, realCli)) {
    const version = path.relative(realVersions, realCli).split(path.sep)[0];
    const realCurrent = realpathOrNull(currentLink(home));
    return { kind: 'release', version, active: !!realCurrent && within(realCurrent, realCli) };
  }
  const root = path.resolve(path.dirname(realCli), '..');
  return { kind: fs.existsSync(path.join(root, '.git')) ? 'checkout' : 'other', root };
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function gitInfo(root) {
  if (!fs.existsSync(path.join(root, '.git'))) return null;
  try {
    const run = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return { commit: run(['rev-parse', '--short', 'HEAD']), dirty: run(['status', '--porcelain']).length > 0 };
  } catch {
    return null;
  }
}

/** Release copies retain their source provenance; unknown origins stay unknown. */
export function sourceProvenance(root) {
  return readJson(path.join(root, RELEASE_INFO))?.git || gitInfo(root);
}

function newestMtime(dir) {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    newest = Math.max(newest, entry.isDirectory() ? newestMtime(file) : fs.statSync(file).mtimeMs);
  }
  return newest;
}

/** Copy the package's published files into an immutable version directory. */
export function installRelease({ source, home = releaseHome(), force = false }) {
  const pkg = readJson(path.join(source, 'package.json'));
  if (!pkg?.version || !Array.isArray(pkg.files)) throw new Error(`Not a Pinwhy package directory: ${source}`);
  const version = String(pkg.version);
  if (!/^[\w.+-]+$/.test(version)) throw new Error(`Version cannot be used as a directory name: ${version}`);
  if (!fs.existsSync(path.join(source, 'public', 'index.html'))) {
    throw new Error('public/ is missing build output; run npm run build first');
  }
  const warnings = [];
  const webSrc = path.join(source, 'web', 'src');
  if (fs.existsSync(webSrc) && newestMtime(webSrc) > fs.statSync(path.join(source, 'public', 'index.html')).mtimeMs) {
    warnings.push('web/src is newer than the build output in public/; if the frontend has changed, run npm run build first');
  }
  const git = gitInfo(source);
  if (git?.dirty) warnings.push(`The source directory has uncommitted changes (based on ${git.commit})`);

  const versions = versionsDir(home);
  const dest = path.join(versions, version);
  if (fs.existsSync(dest) && !force) {
    throw new Error(`Version ${version} is already installed; installed releases are immutable. Increase the version in package.json, or use --force to overwrite`);
  }
  warnings.push(...publishPackage({
    source, files: pkg.files, dest,
    info: { version, installedAt: new Date().toISOString(), source, ...(git ? { git } : {}) },
  }));
  return { version, dir: dest, replaced: force, warnings };
}

export function activeVersion(home = releaseHome()) {
  const target = realpathOrNull(currentLink(home));
  return target ? path.basename(target) : null;
}

/** Repoint `current`, preserving the old junction on a failed Windows switch. */
export function useRelease(version, home = releaseHome()) {
  const versions = versionsDir(home);
  const dest = path.join(versions, String(version));
  if (!fs.existsSync(path.join(dest, 'bin', 'pinwhy.js'))) {
    const installed = listReleases(home).versions.map((v) => v.version);
    throw new Error(`Version ${version} is not installed; installed: ${installed.join(', ') || 'none'}`);
  }
  const previous = activeVersion(home);
  const link = currentLink(home);
  const warnings = publishCurrentLink(link, dest);
  return { version: String(version), previous, cli: path.join(link, 'bin', 'pinwhy.js'), ...(warnings.length ? { warnings } : {}) };
}

export function listReleases(home = releaseHome()) {
  const versions = versionsDir(home);
  const current = activeVersion(home);
  const entries = fs.existsSync(versions)
    ? fs.readdirSync(versions, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    : [];
  return {
    home,
    current,
    versions: entries.map((e) => {
      const info = readJson(path.join(versions, e.name, RELEASE_INFO)) || {};
      return { version: e.name, active: e.name === current, installedAt: info.installedAt || null, git: info.git || null };
    }).sort((a, b) => String(a.installedAt).localeCompare(String(b.installedAt))),
  };
}

/**
 * Re-apply user-level integrations from the running release, so the Skill text,
 * hook commands and service definition come from the code now in `current`.
 * Project-level installs are not discoverable from here and are left alone.
 */
export async function refreshIntegrations({ cli }) {
  const { installLauncher, installSkill, installHooks, integrationStatus } = await import('./hooks.js');
  const { refreshWorkspaceService } = await import('./setup.js');
  const home = os.homedir();
  const status = integrationStatus(home);
  const result = { cli, launcher: installLauncher({ cli, scope: 'user' }), skills: [], hooks: null, service: null };
  for (const agent of ['claude', 'codex']) {
    if (status[agent].skill.user) {
      installSkill({ cwd: home, cli, scope: 'user', agent });
      result.skills.push(agent);
    }
  }
  const userHooks = status.claude.hooks.user;
  if (userHooks.length) {
    const res = installHooks({ cwd: home, write: true, cli, scope: 'user', withActivity: userHooks.includes('PostToolUse') });
    result.hooks = { file: res.file, events: userHooks };
  }
  try {
    result.service = await refreshWorkspaceService({ cli });
  } catch (error) {
    result.service = { refreshed: false, warning: error.message };
  }
  return result;
}
