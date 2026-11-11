import path from 'node:path';
import { C, panel, field, cleanText, table, formatTime, displayWidth } from './format.js';

const text = (value) => cleanText(String(value));
const present = (value) => value !== undefined && value !== null;
const valueText = (value) => present(value) ? text(value) : 'unspecified';


function warnings(values) {
  return (Array.isArray(values) ? values : present(values) ? [values] : [])
    .map((warning) => C.yel(field('Warning', text(warning))));
}

export function renderVersion({ version, build = {}, where }) {
  const origin = build.origin || {};
  const originLabel = { checkout: 'development checkout', release: 'installed release', other: 'package copy' }[origin.kind];
  const lines = [field('Version', valueText(version)), field('Origin', valueText(originLabel ?? where ?? origin.kind))];
  if (origin.kind === 'release') {
    lines.push(field('Release', valueText(origin.version)));
    lines.push(field('Current', typeof origin.active === 'boolean' ? String(origin.active) : 'unspecified'));
  }
  if (present(origin.root)) lines.push(field('Source path', text(origin.root)));
  lines.push(field('Source', valueText(build.commit)));
  if (typeof build.dirty === 'boolean') lines.push(field('Uncommitted', String(build.dirty)));
  lines.push(C.dim(field('Build', valueText(build.buildId))));
  return panel('Version', lines);
}

export function renderReleaseList(list) {
  const lines = [field('Home', valueText(list.home)), field('Current', list.current ? text(list.current) : '(none)')];
  if (!list.versions?.length) {
    lines.push('No releases installed.', 'Run pinwhy release install from a development checkout.');
  } else {
    const rows = list.versions.map((release) => [
      release.active === true ? '*' : '', valueText(release.version),
      release.git ? `${valueText(release.git.commit)}${release.git.dirty === true ? ' · uncommitted changes' : ''}` : 'unspecified',
      typeof release.installedAt === 'number' ? formatTime(release.installedAt) : valueText(release.installedAt),
    ]);
    const grid = table(['Active', 'Version', 'Source', 'Installed'], rows);
    if (process.stdout.isTTY && grid.some((line) => displayWidth(line) + 2 > (process.stdout.columns || 80))) {
      for (const row of rows) lines.push('', field('Version', `${row[1]}${row[0] ? ' · current' : ''}`), field('Source', row[2]), field('Installed', row[3]));
    } else lines.push('', ...grid);
    lines.push('', C.bold('Locations'));
    for (const release of list.versions) {
      const location = release.path ?? release.dir ?? (list.home ? path.join(list.home, 'versions', String(release.version)) : null);
      lines.push(field(valueText(release.version), valueText(location)));
    }
  }
  return panel('Releases', lines);
}

export function renderReleaseCheck(result) {
  const lines = [
    field('Current', valueText(result.currentVersion)),
    field('Latest', valueText(result.latestVersion)),
    field('Status', result.status === 'available' ? C.cyn(valueText(result.status)) : valueText(result.status)),
  ];
  if (present(result.source)) lines.push(C.dim(field('Source', text(result.source))));
  if (present(result.updateUrl)) lines.push(field('Update URL', C.cyn(text(result.updateUrl))));
  return panel('Release check', lines);
}

function refreshLines(refresh) {
  if (!present(refresh)) return [field('Refresh', 'unspecified')];
  const lines = ['', C.bold('Integrations')];
  if (present(refresh.error)) lines.push(C.yel(field('Refresh error', text(refresh.error))));
  if (refresh.launcher) {
    lines.push(field('Launcher', valueText(refresh.launcher.file)));
    if (refresh.launcher.onPath === false) lines.push(C.yel(field('PATH', `Add ${valueText(refresh.launcher.dir)} to your shell configuration.`)));
  }
  if (Array.isArray(refresh.skills)) lines.push(field('User Skills', refresh.skills.length ? refresh.skills.map(text).join(', ') : 'none installed'));
  if (refresh.hooks) {
    lines.push(field('User hooks', valueText(refresh.hooks.file)));
    if (refresh.hooks.events) lines.push(field('Hook events', refresh.hooks.events.map(text).join(', ')));
  } else if (refresh.hooks === null) lines.push(field('User hooks', 'none installed'));
  const service = refresh.service;
  if (service) {
    lines.push(field('Service', service.refreshed === true
      ? service.restarted === true ? 'restarted' : 'configuration refreshed; not restarted'
      : `${valueText(service.state)} · not refreshed`));
    if (service.cwd) lines.push(field('Service project', text(service.cwd)));
    if (service.port != null) lines.push(field('Service port', text(service.port)));
    if (typeof service.verified === 'boolean') lines.push(field('HTTP check', service.verified ? 'verified' : 'not verified'));
    if (service.warning) lines.push(C.yel(field('Warning', text(service.warning))));
  }
  lines.push(...warnings(refresh.warnings), C.dim('Project Skills/hooks are unchanged; rerun setup there if needed.'));
  return lines;
}

export function renderReleaseResult(result, { action } = {}) {
  const lines = [];
  if (action === 'install') {
    lines.push(field('Installation', result.replaced === true ? 'replaced' : 'installed'));
  }
  if (present(result.version)) lines.push(field('Version', text(result.version)));
  if (Object.hasOwn(result, 'previous') || present(result.version)) {
    lines.push(field('Current', `${result.previous ? text(result.previous) : '(none)'} → ${valueText(result.version)}`));
  }
  if (present(result.dir)) lines.push(field('Location', text(result.dir)));
  if (present(result.currentCLI ?? result.cli)) lines.push(field('Current CLI', text(result.currentCLI ?? result.cli)));
  lines.push(...warnings(result.warnings));
  lines.push(...refreshLines(action === 'refresh' ? result : result.refresh));
  return panel(action === 'install' ? 'Release installation' : action === 'refresh' ? 'Release refresh' : 'Release switch', lines);
}

export function renderFileResult(kind, result) {
  const output = kind === 'export' ? result.file : kind === 'restore' ? result.boardPath : result.path;
  const lines = [field(kind === 'restore' ? 'Board path' : 'Output', valueText(output))];
  if (kind === 'restore' && present(result.path)) lines.push(field('Destination', text(result.path)));
  for (const [key, label] of [['format', 'Format'], ['asOf', 'As of'], ['manifest', 'Manifest'], ['eventCount', 'Events'], ['state', 'State']]) {
    if (present(result[key])) lines.push(field(label, text(result[key])));
  }
  const issues = Object.entries(result.integrity || {}).filter(([key, count]) => key !== 'eventCount' && count);
  for (const [key, count] of issues) lines.push(C.yel(field(key, text(count))));
  if (present(result.eventsSha256)) lines.push('', C.dim(field('Events SHA256', text(result.eventsSha256))));
  return panel(kind === 'export' ? 'Export complete' : kind === 'backup' ? 'Backup complete' : 'Restore complete', lines);
}
