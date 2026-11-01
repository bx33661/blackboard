// Runtime identity is content-based; installation paths and publication times are not inputs.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { cliOrigin, sourceProvenance } from './release.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
let cached;

function contentId(root, pkg) {
  const files = new Set();
  function collect(relative) {
    const absolute = path.resolve(root, relative);
    const local = path.relative(root, absolute);
    if (!local || local.startsWith(`..${path.sep}`) || path.isAbsolute(local)) return;
    let stat;
    try { stat = fs.lstatSync(absolute); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    // Published runtime files are regular files; do not read outside the package through links.
    if (stat.isSymbolicLink()) throw new Error(`构建身份不支持符号链接: ${local}`);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolute).sort()) collect(path.join(local, entry));
    } else if (stat.isFile()) files.add(local.split(path.sep).join('/'));
  }
  collect('package.json');
  for (const entry of pkg.files || ['bin', 'lib', 'public', 'skills']) collect(entry);
  const hash = createHash('sha256');
  for (const relative of [...files].sort()) {
    const bytes = fs.readFileSync(path.join(root, relative));
    hash.update(`${Buffer.byteLength(relative)}:${relative}:${bytes.length}:`);
    hash.update(bytes);
  }
  return `sha256:${hash.digest('hex')}`;
}

/** Defaults are cached for the process lifetime; explicit locations support isolated inspection. */
export function buildInfo(options = {}) {
  const useCache = options.root === undefined && options.cli === undefined && options.home === undefined;
  if (useCache && cached) return cached;
  const root = fs.realpathSync(options.root || (options.cli ? path.resolve(path.dirname(options.cli), '..') : ROOT));
  const cli = options.cli || path.join(root, 'bin', 'blackboard.js');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const provenance = sourceProvenance(root);
  const info = Object.freeze({
    version: String(pkg.version),
    buildId: contentId(root, pkg),
    commit: typeof provenance?.commit === 'string' ? provenance.commit : null,
    dirty: typeof provenance?.dirty === 'boolean' ? provenance.dirty : null,
    origin: Object.freeze(cliOrigin(cli, options.home)),
  });
  if (useCache) cached = info;
  return info;
}
