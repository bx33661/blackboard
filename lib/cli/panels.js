import { C, panel, field, indent, table, oneLine, cleanText, nodeLine, formatTime, paintType } from './format.js';
import { viewerUrl } from '../service.js';

const text = (value) => value == null ? 'unspecified' : cleanText(value);
const flag = (value) => typeof value === 'boolean' ? value ? 'yes' : 'no' : 'unknown';
const heading = (title) => ['', C.bold(title)];
const diagnostic = (status) => ({
  ok: C.grn('✓ ok'), error: C.red('✗ error'), warning: C.yel('! warning'), unknown: C.dim('? unknown'),
}[status] || text(status));

function details(value, prefix = '') {
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (!entries.length) return [field(prefix, Array.isArray(value) ? '[]' : '{}')];
    return entries.flatMap(([key, item]) => details(item, prefix ? `${prefix}.${key}` : key));
  }
  return [field(prefix, text(value), 20)];
}

export function renderDoctor(report) {
  const counts = { ok: 0, warning: 0, error: 0, unknown: 0 };
  for (const check of report.checks) counts[check.status] = (counts[check.status] || 0) + 1;
  const lines = [field('Project', text(report.cwd)), field('Overall', diagnostic(report.status)),
    `${report.checks.length} checks · ${counts.ok} passed · ${counts.warning} warnings · ${counts.error} errors · ${counts.unknown} unknown`];
  for (const check of report.checks) {
    lines.push('', `${diagnostic(check.status)}  ${C.bold(oneLine(check.id))}`, indent(text(check.message)));
    if (check.details) lines.push(...details(check.details).map((line) => indent(C.dim(line))));
    if (check.remedy) lines.push(indent(field('Fix', C.cyn(text(check.remedy)))));
  }
  return panel('Doctor', lines);
}

export function renderStatus(report, findings = []) {
  const { stats, viewer, integration } = report;
  const viewerState = {
    online: C.grn('● online'), offline: C.dim('○ not running or unreachable'),
    'other-project': C.yel('! serving another project'), unrecognized: C.yel('? unrecognized service'),
  }[viewer.state] || text(viewer.state);
  const lines = [field('Project', text(report.cwd)), field('Agent', text(report.agentId)),
    ...heading('Viewer'), field('Status', viewerState), field('Local', C.cyn(text(viewer.url)))];
  if (viewer.cwd && viewer.state !== 'online') lines.push(field('Serving', text(viewer.cwd)));
  if (viewer.state === 'online') lines.push(field('Mode', viewer.readOnly ? 'Read-only' : 'Editable'), C.dim('Stop: pinwhy stop'));
  else if (viewer.state === 'offline') lines.push(C.dim(`Start: pinwhy serve --port ${viewer.port} --open`));
  else lines.push(C.dim('Use a free port: pinwhy serve --port 0 --open'));
  lines.push(...heading('Focus'), report.cursor ? nodeLine({ ...report.cursor, title: oneLine(report.cursor.title) }) : C.dim('Cursor not set.'),
    ...heading('Records'), ...table(['Nodes', 'Relations', 'Open threads', 'Activities', 'Checkpoints'],
      [[stats.total, stats.edges, stats.frontier, stats.activities, stats.checkpoints]]));
  const types = Object.entries(stats.byType).filter(([, count]) => count);
  if (types.length) lines.push('', ...table(['Type', 'Count'], types.map(([type, count]) => [paintType(type, oneLine(type)), count])));
  if (findings.length) {
    const countBy = (key) => {
      const counts = new Map();
      for (const node of findings) counts.set(node[key] ?? 'unspecified', (counts.get(node[key] ?? 'unspecified') || 0) + 1);
      return [...counts];
    };
    lines.push(...heading(`Findings / vulnerabilities · ${findings.length}`),
      ...table(['Recorded severity', 'Count'], countBy('severity')),
      '', ...table(['Recorded confidence', 'Count'], countBy('confidence')));
  }
  const scopes = (installed) => ['project', 'user'].filter((scope) => installed?.[scope] === true).join(', ') || 'not installed';
  lines.push(...heading('Integrations'), field('Claude Skill', scopes(integration.claude.skill)), field('Codex Skill', scopes(integration.codex.skill)));
  for (const scope of ['project', 'user']) {
    const events = integration.claude.hooks[scope];
    if (events.length) lines.push(field(`Hooks (${scope})`, events.map(oneLine).join(', '), 16));
  }
  for (const error of integration.errors) lines.push(C.yel(`! Cannot inspect ${text(error.file)}: ${text(error.error)}`));
  lines.push(C.dim('Installed files do not confirm that the host loaded them.'));
  if (report.latestNode) lines.push(...heading('Latest record'), nodeLine({ ...report.latestNode, title: oneLine(report.latestNode.title) }),
    C.dim(formatTime(report.latestNode.updated ?? report.latestNode.ts)));
  return panel('Status', lines, report.title || '');
}

function serviceLines(result) {
  const lines = [];
  const state = result.state ?? (result.mode === 'manual' ? 'manual start required' : 'unspecified');
  const paint = result.running === true ? C.grn : ['unmanaged', 'unavailable'].includes(state) ? C.yel : C.dim;
  if (result.state != null || result.mode === 'manual') lines.push(field('State', paint(text(state))));
  lines.push(field('Manager', text(result.mode)));
  if (result.cwd != null) lines.push(field('Owner', text(result.cwd)));
  if (typeof result.currentProject === 'boolean') lines.push(field('This project', flag(result.currentProject)));
  const url = result.url || (Number.isInteger(result.port) && result.port > 0 && result.port <= 65535 ? viewerUrl(result.port) : null);
  if (url) lines.push(field('Local', C.cyn(text(url))));
  if (result.port != null) lines.push(field('Port', text(result.port)));
  for (const [key, label] of [['configured', 'Configured'], ['managed', 'Managed'], ['loaded', 'Enabled'], ['running', 'Running']]) {
    if (typeof result[key] === 'boolean') lines.push(field(label, flag(result[key])));
  }
  if (typeof result.verified === 'boolean') lines.push(field('HTTP check', result.verified ? C.grn('verified') : C.yel('not verified')));
  if (result.file) lines.push(field('Configuration', `${text(result.file)}${result.removed ? ' · removed' : ''}`));
  if (result.cli) lines.push(field('CLI', text(result.cli)));
  if (result.node) lines.push(field('Node', text(result.node)));
  if (result.switched) lines.push(field('Ownership', `${text(result.previousCwd)} → ${text(result.cwd)}`));
  if (result.command) lines.push(field('Start command', C.cyn(text(result.command))));
  if (result.message) lines.push('', text(result.message));
  if (result.warning) lines.push(C.yel(text(result.warning)));
  return lines;
}

export function renderService(result, { action = 'status' } = {}) {
  return panel(`Service ${action}`, serviceLines(result), 'shared user service');
}

export function renderSetup(result) {
  const lines = [field('Project', text(result.cwd)), field('Title', text(result.title)),
    ...heading('Configured'), field('Board', `${C.grn('✓ ready')} · ${text(result.board)}`),
    field('Auto record', flag(result.autoRecord))];
  if (result.launcher) {
    lines.push(field('Launcher', `${C.grn('✓ installed')} · ${text(result.launcher.file)}`));
    if (result.launcher.onPath === false) lines.push(C.yel(`! Add ${text(result.launcher.dir)} to PATH.`));
  }
  lines.push(field('Claude Skill', result.skill ? C.grn('✓ installed · project scope') : C.dim('− skipped')),
    field('Recovery hooks', result.hooks ? `${C.grn('✓ configured')} · ${text(result.hooks.file)}` : C.dim('− skipped'), 16));
  if (result.hooks) lines.push(field('Tool activity', flag(result.hooks.activityCapture), 16));
  lines.push(...heading('Viewer'), ...(result.service ? serviceLines(result.service) : [C.dim('− skipped; service was not started')]),
    '', C.dim('Installation does not confirm that the current host session loaded the Skill or hooks.'),
    C.dim('Inspect integration and viewer state: pinwhy status'));
  return panel('Setup', lines);
}
