// Syntax comes from the command registry; this catalog supplies descriptions and examples.
import { OUTPUTS } from '../contracts.js';
import { DEFAULT_PORT } from '../service.js';
import { COMMAND_ALIASES, commandSpec } from './commands.js';
import { C } from './format.js';

const ALIASES = COMMAND_ALIASES;

const FLAGS = {
  agent: 'Identity: author and cursor owner; default agent:primary',
  cwd: 'Project root; overrides PINWHY_CWD and ancestor lookup',
  'no-init': 'Fail if the project has no pinwhy; do not create one',
  'request-id': 'Stable request ID; retries do not duplicate writes; query with receipt',
  'no-truncate': 'Reject the entire write if text exceeds limits instead of truncating',
  json: 'Output JSON',
  detail: 'Details: evidence, conditions and process (-d)',
  tag: 'Tag (-t)',
  status: 'Recorded status',
  sev: 'Recorded severity',
  confidence: 'Recorded confidence',
  at: 'File location, e.g. src/auth.js:42',
  to: 'New node points to this node: "new node <rel> id"',
  parent: 'Source node: "id <rel> new node" (compatibility option)',
  enter: 'Move the cursor to the new node after creation',
  'relate-here': 'Create a relation to the current node',
  rel: 'Relation type; default related-to; unknown relations are preserved',
  kind: 'Synonym for --rel',
  label: 'Relation description',
  reason: 'Reason recorded in the event',
  title: 'Title',
  port: `Viewer port; defaults to project viewerPort, otherwise ${DEFAULT_PORT}`,
  limit: 'Maximum number of results (-n)',
  type: 'Filter by node type',
  'related-to': 'Only records with an explicit relation to this node',
  'group-by': 'Grouping fields: severity,status,tag:<key>; combinable',
  'as-of': 'Replay through this checkpoint event; use the last occurrence of its ID; --json matches reading the log truncated there',
  user: 'Install at user level',
  project: 'Install at project level (default)',
};

const SEARCH_FLAGS = { limit: 'Result limit 1–1000; default 30 (-n)', tag: 'Exact tag match; repeatable; multiple tags intersect (-t)' };

const HELP = {
  init: {
    about: 'Create .pinwhy/ in the project root.',
    flags: { title: 'Pinwhy title', here: 'Create an independent pinwhy here even if an ancestor has one' },
    examples: ['pinwhy init --title "Audit synthetic-lib@1.0.0"'],
    output: '{schema, cwd, board, title, session}',
  },
  setup: {
    about: 'Configure Claude Skill, recovery hooks and a persistent viewer. Changes local integration configuration.',
    flags: {
      target: 'Project directory; equivalent to the positional argument', title: 'Pinwhy title', open: 'Open the page when finished',
      'no-hooks': 'Skip hook installation', 'no-skill': 'Skip Skill installation', 'no-serve': 'Do not start the persistent service',
    },
    examples: ['pinwhy setup --title "Task" --open', 'pinwhy setup --no-hooks --no-serve'],
  },
  status: {
    about: 'Inspect data counts, integration configuration and actual viewer probe results. Read-only.',
    examples: ['pinwhy status --cwd /path/to/project', 'pinwhy status --json'],
    output: '{schema, stats, cursor, cursors, title, session, cwd, agentId, viewer, integration, latestNode}',
  },
  doctor: {
    about: 'Check the running version, service ownership, integration paths and log integrity. Read-only; no automatic repairs.',
    flags: { share: 'Hide local absolute paths for a shareable diagnostic report' },
    examples: ['pinwhy doctor', 'pinwhy doctor --cwd /path/to/project --json', 'pinwhy doctor --share --json'],
    output: '{schema, readOnly, cwd, status, checks}; status is ok/warning/error; each check has id/status/message/details/remedy. A completed report returns 0; status describes any issues',
  },
  node: {
    about: 'Add a logic node. Creates no edges and moves no cursor by default. Common types: start, goal, intent, hypothesis, question, observation, finding. Custom types are accepted and preserved.',
    examples: ['pinwhy node add hypothesis "Claim to verify" --confidence suspected --to g1 --enter', 'pinwhy fact "Unauthenticated API returns 200" --at src/api.js:42 --to hy1 --rel supports --json'],
    output: '{schema, node, edge, edges, cursor}; new ID: node.id; edges contains all relations created; edge is the first or null; cursor is null when unchanged',
  },
  checkpoint: {
    about: 'Create a recovery checkpoint and show changes since this identity\'s previous checkpoint. compact is a compatibility alias.',
    flags: { summary: 'Summary; defaults to the current Digest', title: 'Synonym for --summary', trigger: 'Trigger source label; default manual', write: 'Also write .pinwhy/digest.md' },
    examples: ['pinwhy checkpoint --summary "fd1 reproduced; focused on q2; report in out/REPORT.md"'],
    output: '{schema, id, agentId, at, sessionId, cursorNodeId, summary, trigger, sincePrevious}; sincePrevious contains incremental counts; null for the first checkpoint',
  },
  cursor: {
    about: 'Move the current cursor without creating an edge. With no argument, show the cursor. focus is a compatibility alias.',
    examples: ['pinwhy cursor q1 --reason "Investigating authorization"', 'pinwhy cursor none'],
    output: '{schema, cursor}; also includes agentId when called without arguments',
  },
  here: {
    about: 'Show the current node, one-hop neighbors and recent trail. Read-only.',
    examples: ['pinwhy here --agent audit-a1'], output: '{schema, agentId, cursor, node, neighbors, trail}',
  },
  activity: {
    about: 'Inspect the raw activity layer. Activities are not logic nodes; collection is off by default.',
    examples: ['pinwhy activity ls --limit 10', 'pinwhy activity show act1 --json'], output: 'ls: array of activity records; show: one activity record',
  },
  promote: {
    about: 'Promote an activity to a logic node.',
    flags: { kind: 'New node type', type: 'Synonym for --kind', detail: 'Details (-d)' },
    examples: ['pinwhy promote act1 --kind observation --title "Token remains valid after logout" --to hy1 --rel supports'],
    output: 'Same as node add: {schema, node, edge, edges, cursor}',
  },
  batch: {
    about: 'Write node/link/edit operations atomically: all succeed or none are written. Does not move cursors; excludes deletion and checkpoints.',
    flags: { file: 'JSONL file; reads stdin if omitted', 'request-id': 'Required for writes; retries with the same ID and content do not duplicate writes', check: 'Validate against the current pinwhy without writing; later log changes may still cause the actual write to fail', agent: 'Default author for the batch; each line can override agent', 'no-truncate': 'Reject the entire batch if any field exceeds limits' },
    sections: [['Input format (JSON Lines; one object per line; blank lines ignored)', [
      'op=node  Required: type title; optional: detail tags at status severity confidence to rel label ref agent',
      'op=link  Required: from to; optional: rel label agent',
      'op=edit  Required: id and at least one of title detail status severity confidence tags; optional: agent',
      'Clear optional edit fields with native JSON values: detail: "", tags: [], status: null, severity: null, confidence: null. Do not use a clear property.',
      'to accepts an ID or an array of IDs. ref names a node within this batch; later lines use "$name" to reference it. References expire after the batch.',
      'Final IDs are assigned by type; read results[].node.id. Unknown fields fail. See capabilities.limits for batch limits.',
    ]]],
    examples: ['pinwhy batch --check --file wave-3.jsonl', 'pinwhy batch --request-id wave-3 --file wave-3.jsonl --no-init --json', '{"op":"node","ref":"h","type":"hypothesis","title":"Missing filter","confidence":"suspected","to":"g1"}', '{"op":"node","type":"observation","title":"Tenant not compared","at":"src/export.ts:42","to":"$h","rel":"supports"}'],
    output: '{schema, requestId, refs, counts: {nodes, edges, edits}, results}; refs maps batch names to node IDs; results[] follows input order with line and op. node entries have node, edges and optional ref; link entries have edge; edit entries have node. Truncation adds truncated. --check adds checked: true; IDs are estimates only',
  },
  done: {
    about: 'Change node status: done marks completion, block marks blocked, revive restores open.',
    examples: ['pinwhy block q1', 'pinwhy revive q1 --json'],
    output: 'Updated node fields at the top level: {schema, id, type, title, status, severity, confidence, ...}; no node wrapper',
  },
  edit: {
    about: 'Edit node fields; --detail replaces existing text.',
    flags: { title: 'New title', detail: 'New details; replaces existing text (-d)', tag: 'Replaces existing tags (-t)', clear: 'Clear a field: detail becomes "", tags becomes [], and dimensions become null' },
    examples: ['pinwhy edit fd1 --confidence reproduced', 'pinwhy edit hy1 --clear detail --clear tags --clear status --json'],
    output: 'Updated node fields at the top level: {schema, id, type, title, status, severity, confidence, ...}; no node wrapper; read id, not node.id',
  },
  link: {
    about: 'Create an explicit relation, read as "from <rel> to".',
    examples: ['pinwhy link o1 hy1 --rel supports', 'pinwhy link o2 hy1 --rel contradicts --label "Write API returns 403"'], output: '{schema, id, from, to, kind, ts, author}; may include label',
  },
  unlink: {
    about: 'Remove a relation; use --rel when multiple relation types connect the nodes.',
    examples: ['pinwhy unlink o1 hy1 --rel supports'], output: 'Removed relation record: {schema, id, from, to, kind, ts, author}',
  },
  remove: {
    about: 'Remove a node and its relations from the graph; preserve event log history. rm is an alias.',
    examples: ['pinwhy remove hy3 --reason "Duplicate record"'], output: '{schema, id, edges}',
  },
  ls: {
    about: 'List recent nodes by creation time; report truncated counts on stderr. list is an alias.',
    flags: { type: 'Node type (-t)', open: 'Only open hypotheses and questions', 'open-only': 'Same as --open', limit: 'Result count; default 30 (-n)', all: 'Return all matches; mutually exclusive with --limit', tag: SEARCH_FLAGS.tag, status: 'Exact recorded status', sev: 'Exact recorded severity', confidence: 'Exact recorded confidence' },
    examples: ['pinwhy ls --type finding --all', 'pinwhy ls --status open --sev high --confidence reproduced --tag auth --tag site=example.test --json'], output: 'Array of node records; no top-level schema. For total counts, read search.total',
  },
  show: {
    about: 'Show a node and its incoming and outgoing relations. Read-only.', examples: ['pinwhy show fd1', 'pinwhy show fd1 --json'], output: '{schema, node, parents, children}',
  },
  tree: {
    about: 'Print an indented tree of explicit relations. Text output only.', flags: { depth: 'Expansion depth; default 4 (-d)' }, examples: ['pinwhy tree -d 8'],
  },
  digest: {
    about: 'Generate a Markdown summary of the current node, neighbors, trail and open nodes.',
    flags: { write: 'Also write .pinwhy/digest.md', quiet: 'With --write, omit the output path message' }, examples: ['pinwhy digest --agent audit-a1'], output: '{schema, digest}; digest contains Markdown',
  },
  context: {
    about: 'Structured recovery context for Agents; JSON by default. Read-only; does not suggest next steps.',
    flags: { focus: 'Focus on this node without moving the cursor', depth: 'Neighborhood depth 0–5', budget: 'Approximate token budget', since: 'Only changes after this checkpoint or timestamp', limit: 'Maximum entries per section (-n)', markdown: 'Output readable Markdown (--md)' },
    examples: ['pinwhy context --budget 4000', 'pinwhy context --since cp2 --markdown', 'pinwhy context --as-of cp3 --budget 4000'],
    output: 'Recovery context object; policy is always readOnly: true, prescriptive: false, nextStepSelection: "agent-controlled"; truncated and omitted describe budget omissions',
  },
  lint: {
    about: 'Read-only context quality checks. Reports only; exit code is always 0.', examples: ['pinwhy lint --json'], output: '{schema, summary, issues}',
  },
  tail: {
    about: 'Print a one-line summary: nodes, relations, open items, activities and current node.', examples: ['pinwhy tail --agent audit-a1'], output: '{schema, tail}',
  },
  serve: {
    about: 'Start the foreground viewer on 127.0.0.1 only. Stop with Ctrl+C or pinwhy stop.',
    flags: { port: 'Listening port; 0 lets the OS choose an available port. Saves the actual port in project configuration', open: 'Open the browser after startup', 'read-only': 'Disable page editing' }, examples: ['pinwhy serve --open', 'pinwhy serve --port 0 --read-only'],
  },
  stop: {
    about: 'Stop this project\'s viewer. Leave other projects and unidentified listeners alone; preserve pinwhy data.',
    flags: { port: 'Port to stop; defaults to the project\'s recorded port. An explicit port bypasses the shared service' }, examples: ['pinwhy stop', 'pinwhy stop --cwd /path/to/project --port 4334'],
    output: '{state, via, port, url, cwd}; state is stopped or not-running; via is process, launchd, systemd, scheduled-task or null. Not a contract output; no schema',
  },
  export: {
    about: 'Export a snapshot or report. html is a complete read-only snapshot; markdown/mermaid/sarif support filtering.',
    flags: { out: 'Output file; default pinwhy.<extension> (-o)', format: 'Export format; default html', type: 'Filter by node type (report formats)', tag: 'Exact tag match; repeatable (-t)', sort: 'Order: severity|time|id; default severity', 'group-by': 'Markdown/Mermaid grouping: severity,status,tag:<key>', 'max-nodes': 'Mermaid node limit; default 200; omissions noted in comments' },
    examples: ['pinwhy export --format markdown --sev high -o report.md', 'pinwhy export --format sarif --type vuln -o findings.sarif', 'pinwhy export --format markdown --as-of cp4 -o report-cp4.md'], output: '{schema, file, format}; content is written to the file',
  },
  reset: {
    about: 'Clear the graph. Requires --yes.', flags: { yes: 'Confirm clearing the graph' }, examples: ['pinwhy reset --yes --cwd /path/to/demo'], output: 'State object after reset',
  },
  search: {
    about: 'Search all nodes; keywords are case-insensitive and intersect. Filters use recorded fields only.',
    flags: SEARCH_FLAGS,
    examples: ['pinwhy search "tenant" --json', 'pinwhy search --type vuln --group-by severity,status'], output: '{schema, readOnly, prescriptive, query, total, items, truncated}; total counts all matches; --group-by adds groupBy and groups',
  },
  history: {
    about: 'Show the change history of a node and its relations, including removed nodes.', examples: ['pinwhy history fd1 --json'], output: 'History of one node, including readOnly and prescriptive',
  },
  changes: {
    about: 'Show changes and events since a checkpoint; add --as-of to compare two checkpoints.', flags: { since: 'Starting checkpoint ID' },
    examples: ['pinwhy changes --since cp2 --json', 'pinwhy changes --since cp2 --as-of cp3'], output: 'Changes since a checkpoint, including readOnly and prescriptive',
  },
  backup: {
    about: 'Write raw events and a checksum manifest to a new directory.', flags: { out: 'Backup directory; must be new (-o)' }, examples: ['pinwhy backup --out /tmp/board-backup --json'], output: 'Backup receipt',
  },
  restore: {
    about: 'Restore a backup into a directory without a pinwhy.', flags: { into: 'Destination project directory; must not already have a pinwhy' }, examples: ['pinwhy restore /tmp/board-backup --into /tmp/board-restored --json'], output: 'Restore receipt',
  },
  receipt: {
    about: 'Read-only lookup of whether a write with --request-id completed.', examples: ['pinwhy receipt wave-3 --json'], output: 'Write receipt; result preserves the original write result without normalization',
  },
  capabilities: {
    about: 'Integration capability negotiation: commands, features, runtime resource paths, output schemas, limits and write targets.', examples: ['pinwhy capabilities --json'], output: '{schema, schemaVersion, version, eventVersion, runtime, commands, features, resources: {cli, skill}, exportFormats, contextContract, limits, outputs, writeTargets}',
  },
  hooks: {
    about: 'Install or uninstall Claude Code recovery hooks. Prints a plan unless --write is supplied.',
    flags: { write: 'Write configuration changes', 'with-activity': 'Also collect tool activity (may contain sensitive content; off by default)' }, examples: ['pinwhy hooks install --user --write', 'pinwhy hooks uninstall --project --write'],
  },
  skill: {
    about: 'Install the complete Skill package for Claude or Codex.', flags: { codex: 'Install for Codex instead of Claude' }, examples: ['pinwhy skill install --user', 'pinwhy skill install --codex'],
  },
  launcher: {
    about: 'Install the pinwhy launcher.', examples: ['pinwhy launcher --user'],
  },
  service: {
    about: 'Manage the current user\'s shared workspace service (macOS / Linux / Windows). It may belong to another project; use pinwhy stop to stop only this project\'s viewer.',
    examples: ['pinwhy service install --port 4333', 'pinwhy service start', 'pinwhy service status --json', 'pinwhy service stop'],
  },
  release: {
    about: 'Manage installed immutable releases and check upstream updates. Run install only from the development repository.',
    flags: { force: 'Replace an installed release with the same version' },
    examples: ['pinwhy release check', 'pinwhy release check --json', 'pinwhy release ls --json', 'pinwhy release use 0.10.1'],
    output: 'check: pinwhy.update-check.v1 · currentVersion, latestVersion, status (available/current/ahead), source, updateUrl; other subcommands depend on local installation state.',
  },
  hook: {
    about: 'Host hook entry point, called by the host; no manual invocation needed.', examples: ['pinwhy hook SessionStart'],
  },
  help: {
    about: 'Show the overview, full public directory with --all, or help for a command path.', examples: ['pinwhy help --all', 'pinwhy help node add', 'pinwhy help service install', 'pinwhy help release use'],
    flags: { all: 'List all public commands and aliases' },
  },
  version: {
    about: 'Print the version and current CLI source.', examples: ['pinwhy version'],
  },
};

export function commandHelpFor(command) {
  const parts = String(command).trim().split(/\s+/);
  parts[0] = ALIASES[parts[0]] || parts[0];
  const name = parts.join(' ');
  return Object.hasOwn(HELP, parts[0]) && commandSpec(name) ? name : null;
}

export function commandHelp(command) {
  const name = commandHelpFor(command);
  if (!name) return null;
  const [root, leaf] = name.split(' ');
  const entry = HELP[root];
  const spec = commandSpec(name);
  const b = C.bold;
  const list = (lines) => lines.map((line) => `  ${line}`).join('\n');
  const options = Object.entries(spec.options || {}).map(([flag, option]) => {
    const syntax = `--${flag}${option.value ? ` ${option.value}` : ''}${option.repeatable ? ' (repeatable)' : ''}`;
    const range = option.min === undefined ? '' : option.max === Number.MAX_SAFE_INTEGER ? `integer >= ${option.min}` : `integer ${option.min}–${option.max}`;
    const constraints = [option.choices?.join('|'), range].filter(Boolean);
    return `${syntax}  ${entry.flags?.[flag] || FLAGS[flag] || ''}${constraints.length ? ` [${constraints.join('; ')}]` : ''}`;
  });
  const output = !(root in OUTPUTS) && !entry.output ? null
    : root in OUTPUTS ? `${OUTPUTS[root].schema || OUTPUTS[root].items} · ${entry.output || ''}` : entry.output;
  const aliases = Object.keys(ALIASES).filter((alias) => ALIASES[alias] === root);
  const examples = leaf ? entry.examples.filter((example) => example === `pinwhy ${name}` || example.startsWith(`pinwhy ${name} `)) : entry.examples;
  const sections = [
    `${b(`pinwhy ${name}`)}${aliases.length ? C.dim(` (${aliases.join(', ')})`) : ''} — ${entry.about}`,
    `${b('Usage')}\n${list(spec.usage)}`,
    ...(options.length ? [`${b('Options')}\n${list(options)}`] : []),
    ...(entry.sections || []).map(([title, lines]) => `${b(title)}\n${list(lines)}`),
    `${b('Examples')}\n${list(examples.length ? examples : [`pinwhy ${name}`])}`,
    ...(output ? [`${b('--json output')}\n${list([output])}`] : []),
  ];
  return `\n${sections.join('\n\n')}\n`;
}
