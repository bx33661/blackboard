#!/usr/bin/env node
// Pinwhy — 把 Agent 的探索路径外化成递进图状态。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stableCliPath } from '../lib/release.js';
import { runCli } from '../lib/cli/run.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
// Integrations record this path. Started through an installed release it is the
// stable `current` path, so an upgrade does not leave them on the old version.
const CLI = stableCliPath(path.join(ROOT, 'bin', 'pinwhy.js'));
const VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

runCli(process.argv.slice(2), { root: ROOT, cli: CLI, version: VERSION });
