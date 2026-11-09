// Command syntax shared by parsing and help. Runtime dispatch stays in bin/pinwhy.js.
import { NODE_STATES, SEVERITIES, CONFIDENCE_LEVELS } from '../model.js';

const switches = new Set('json open write all open-only quiet enter relate-here user project yes with-activity here codex no-hooks no-skill no-serve read-only markdown force no-init no-truncate check share'.split(' '));
const values = {
  agent: '<name>', cwd: '<directory>', 'request-id': '<ID>', detail: '<text>', tag: '<tag>',
  status: '<state>', sev: '<severity>', confidence: '<level>', at: '<file:line>', parent: '<id>', to: '<id>',
  rel: '<relation>', kind: '<kind>', label: '<text>', reason: '<text>', title: '<text>', target: '<directory>',
  port: '<port>', summary: '<text>', trigger: '<label>', type: '<type>', file: '<file>', limit: '<count>',
  'as-of': '<checkpoint>', depth: '<depth>', focus: '<id>', budget: '<tokens>', since: '<checkpoint|timestamp>',
  out: '<path>', format: '<format>', 'related-to': '<id>', sort: '<order>', 'group-by': '<fields>',
  'max-nodes': '<count>', into: '<directory>', clear: '<field>',
};
const choices = { status: NODE_STATES, sev: SEVERITIES, confidence: CONFIDENCE_LEVELS,
  format: ['html', 'markdown', 'mermaid', 'sarif'], sort: ['severity', 'time', 'id'],
  clear: ['detail', 'tags', 'status', 'severity', 'confidence'] };
const integers = { port: [1, 65535], depth: [0, Number.MAX_SAFE_INTEGER], budget: [1, Number.MAX_SAFE_INTEGER],
  limit: [1, Number.MAX_SAFE_INTEGER], 'max-nodes': [1, Number.MAX_SAFE_INTEGER] };
const repeatable = new Set(['tag', 'to', 'clear']);
const options = (names) => Object.fromEntries(names.split(' ').filter(Boolean).map((name) => [name, {
  value: switches.has(name) ? null : values[name],
  ...(repeatable.has(name) ? { repeatable: true } : {}),
  ...(choices[name] ? { choices: choices[name] } : {}),
  ...(integers[name] ? { min: integers[name][0], max: integers[name][1] } : {}),
}]));
const spec = (usage, names, minArgs = 0, maxArgs = minArgs, extra = {}) => ({
  usage: [].concat(usage), options: options(names), minArgs, maxArgs, ...extra,
});
const WRITE = 'agent cwd no-init request-id';
const NODE = `detail tag status sev confidence at parent to enter relate-here rel kind label reason ${WRITE} no-truncate json`;
const READ = 'type status sev confidence tag';
const relationConflicts = [['rel', 'kind'], ['to', 'parent'], ['to', 'relate-here']];
const nodeUsage = 'pinwhy node add <kind> "Title" [options]';
const nodeAdd = spec(nodeUsage, NODE, 2, Infinity, { conflicts: relationConflicts });
const shorthand = spec('pinwhy start|goal|intent|fact|vuln|hint "Title" [options]', NODE, 1, Infinity, { conflicts: relationConflicts });
const checkpoint = spec('pinwhy checkpoint [summary] [--summary <text>] [--write]', `summary title trigger write ${WRITE} no-truncate json`, 0, Infinity, { conflicts: [['summary', 'title']] });
const cursor = spec('pinwhy cursor [<id>|none] [--reason <text>]', `reason ${WRITE} json`, 0, 1);
const state = spec('pinwhy done|block|revive <id>', `${WRITE} json`, 1);
const remove = spec('pinwhy remove <id> [--reason <text>]', `reason ${WRITE} json`, 1);
const list = spec('pinwhy ls [filters] [--open] [--limit <count> | --all]', `${READ} open open-only limit all as-of cwd json`, 0, 0, { conflicts: [['all', 'limit']] });
const serviceNames = 'cwd port json';
const serviceLeaf = (name) => spec(`pinwhy service ${name}${name === 'install' ? ' [--port <port>]' : ''} [--json]`, name === 'install' ? serviceNames : 'cwd json');
const releaseLeaf = (name, names = 'json', min = 0) => spec(`pinwhy release ${name}${name === 'use' ? ' <version>' : name === 'install' ? ' [--force]' : ''} [--json]`, names, min);

export const COMMAND_ALIASES = {
  start: 'node', goal: 'node', intent: 'node', fact: 'node', vuln: 'node', hint: 'node',
  compact: 'checkpoint', focus: 'cursor', block: 'done', revive: 'done', rm: 'remove', list: 'ls',
};

export const COMMANDS = {
  init: spec('pinwhy init [--title <text>] [--here]', 'title here cwd json'),
  setup: spec('pinwhy setup [directory] [options]', 'target title port open no-hooks no-skill no-serve json', 0, 1),
  status: spec('pinwhy status [--port <port>] [--json]', 'port agent cwd json'),
  doctor: spec('pinwhy doctor [--port <port>] [--share] [--json]', 'port cwd share json'),
  node: spec(nodeUsage, NODE, 1, Infinity, { subcommands: { add: nodeAdd } }),
  start: shorthand, goal: shorthand, intent: shorthand, fact: shorthand, vuln: shorthand, hint: shorthand,
  checkpoint, compact: checkpoint, cursor, focus: cursor,
  here: spec('pinwhy here [--agent <name>]', 'agent cwd json'),
  activity: spec(['pinwhy activity [ls]', 'pinwhy activity show <id>'], 'limit cwd json', 0, 2, {
    defaultSubcommand: 'ls', subcommands: {
      ls: spec('pinwhy activity ls [--limit <count>]', 'limit cwd json'),
      list: spec('pinwhy activity list [--limit <count>]', 'limit cwd json'),
      show: spec('pinwhy activity show <id>', 'cwd json', 1),
    },
  }),
  promote: spec('pinwhy promote <activity-id> [--kind <type>] [--to <id> --rel <relation>]', `kind type title detail to enter relate-here rel label reason ${WRITE} no-truncate json`, 1, 1, { conflicts: [['kind', 'type'], ['to', 'relate-here']] }),
  batch: spec(['pinwhy batch --request-id <ID> [--file <file>]', 'pinwhy batch --check [--file <file>]'], `file check ${WRITE} no-truncate json`),
  done: state, block: state, revive: state,
  edit: spec('pinwhy edit <id> [--title <text>] [--detail <text>] [--status <state>] [--sev <severity>] [--confidence <level>] [--tag <tag>] [--clear <field>]', `title detail status sev confidence tag clear ${WRITE} no-truncate json`, 1),
  link: spec('pinwhy link <from> <to> [--rel <relation>] [--label <text>]', `rel kind label ${WRITE} no-truncate json`, 2, 2, { conflicts: [['rel', 'kind']] }),
  unlink: spec('pinwhy unlink <from> <to> [--rel <relation>]', `rel kind ${WRITE} json`, 2, 2, { conflicts: [['rel', 'kind']] }),
  remove, rm: remove, ls: list, list,
  show: spec('pinwhy show <id>', 'as-of cwd json', 1),
  tree: spec('pinwhy tree [--depth <depth>]', 'depth cwd'),
  digest: spec('pinwhy digest [--write] [--agent <name>]', 'agent write quiet cwd json'),
  context: spec('pinwhy context [id] [--focus <id>] [--depth <depth>] [--budget <tokens>] [--since <checkpoint|timestamp>]', 'focus depth budget since limit agent markdown as-of cwd json', 0, 1),
  lint: spec('pinwhy lint [--json]', 'cwd json'),
  tail: spec('pinwhy tail [--agent <name>]', 'agent cwd json'),
  serve: spec('pinwhy serve [--port <port>] [--open] [--read-only]', 'port open read-only cwd'),
  stop: spec('pinwhy stop [--port <port>] [--json]', 'port cwd json'),
  export: spec('pinwhy export [keywords] [--format <format>] [--out <path>] [filters]', `out format ${READ} rel related-to sort group-by max-nodes as-of cwd json`, 0, Infinity),
  reset: spec('pinwhy reset --yes', `yes ${WRITE} json`),
  search: spec('pinwhy search [keywords] [filters] [--group-by <fields>] [--limit <count>]', `${READ} rel related-to group-by limit as-of cwd json`, 0, Infinity),
  history: spec('pinwhy history <id>', 'cwd json', 1),
  changes: spec('pinwhy changes --since <checkpoint> [--as-of <checkpoint>]', 'since as-of cwd json', 0, 1),
  backup: spec('pinwhy backup --out <path>', 'out cwd json'),
  restore: spec('pinwhy restore <backup-directory> --into <directory>', 'into cwd json', 1),
  receipt: spec('pinwhy receipt <request-id>', 'cwd json', 1),
  capabilities: spec('pinwhy capabilities [--json]', 'cwd json'),
  hooks: spec('pinwhy hooks install|uninstall [--write] [--user|--project]', 'write user project with-activity cwd json', 0, 1, {
    defaultSubcommand: 'install', subcommands: {
      install: spec('pinwhy hooks install [--write] [--user|--project] [--with-activity]', 'write user project with-activity cwd json'),
      uninstall: spec('pinwhy hooks uninstall [--write] [--user|--project]', 'write user project cwd json'),
    },
  }),
  skill: spec('pinwhy skill install [--codex] [--user|--project]', 'codex user project cwd json', 0, 1, {
    defaultSubcommand: 'install', subcommands: { install: spec('pinwhy skill install [--codex] [--user|--project]', 'codex user project cwd json') },
  }),
  launcher: spec('pinwhy launcher [--user|--project]', 'user project json'),
  service: spec(['pinwhy service install [--port <port>]', 'pinwhy service start|status|stop|uninstall [--json]'], serviceNames, 0, 1, {
    defaultSubcommand: 'status', subcommands: Object.fromEntries(['install', 'start', 'status', 'stop', 'uninstall'].map((name) => [name, serviceLeaf(name)])),
  }),
  release: spec(['pinwhy release install [--force]', 'pinwhy release use <version>', 'pinwhy release ls [--json]', 'pinwhy release check [--json]'], 'force json', 0, 2, {
    defaultSubcommand: 'ls', subcommands: {
      install: releaseLeaf('install', 'force json'), use: releaseLeaf('use', 'json', 1),
      ls: releaseLeaf('ls'), list: releaseLeaf('list'), check: releaseLeaf('check'),
      refresh: { ...releaseLeaf('refresh'), hidden: true },
    },
  }),
  hook: spec('pinwhy hook <event> [arguments]', '', 1, Infinity),
  help: spec('pinwhy help [command [subcommand]] [--all]', 'all', 0, 2),
  version: spec('pinwhy version', ''), '-v': spec('pinwhy -v', ''), '--version': spec('pinwhy --version', ''),
};

// Command-local bounds share the same descriptor used by help.
COMMANDS.serve.options.port = { ...COMMANDS.serve.options.port, min: 0 };
COMMANDS.context.options.depth = { ...COMMANDS.context.options.depth, max: 5 };
COMMANDS.search.options.limit = { ...COMMANDS.search.options.limit, max: 1000 };

export function commandSpec(command, subcommand) {
  const parts = String(command || '').trim().split(/\s+/);
  const root = COMMANDS[parts[0]];
  if (!root || parts.length > 2 || (subcommand !== undefined && parts.length > 1)) return null;
  const child = subcommand ?? parts[1];
  if (child === undefined) return root;
  return root.subcommands?.[child] || null;
}
