import { COMMANDS, commandSpec } from './commands.js';

const usageError = (code, message, details = {}) => Object.assign(new Error(message), { code, ...details });

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
}

/** The accepted name a typo most likely meant, or null when nothing is close. */
export function closest(name, candidates) {
  const limit = name.length <= 2 ? 1 : Math.max(2, Math.floor(name.length / 3));
  let best = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    const score = candidate.startsWith(name) ? 0 : editDistance(name, candidate);
    if (score <= limit && score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

function unknownOption(spelling, cmd, options) {
  const suggestion = closest(spelling, Object.keys(options).map((flag) => `--${flag}`));
  throw usageError('unknown_option', `Unknown option ${spelling} for command ${cmd}; ${suggestion ? `did you mean ${suggestion}?` : `run pinwhy ${cmd} --help for available options`}`, suggestion ? { suggestion } : {});
}

/** Tokenize before resolving a subcommand: options may precede it and -- protects data. */
export function parseArgs(argv, cmd = '', { help = false } = {}) {
  const args = [];
  const flags = {};
  const root = COMMANDS[cmd];
  const allowed = root?.options || {};
  const aliases = {
    '-d': cmd === 'tree' ? 'depth' : 'detail',
    '-t': ['ls', 'list'].includes(cmd) ? 'type' : 'tag',
    '-n': 'limit', '-o': 'out', n: 'limit', o: 'out', md: 'markdown',
    d: cmd === 'tree' ? 'depth' : 'detail',
    t: ['ls', 'list'].includes(cmd) ? 'type' : 'tag',
  };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--') { args.push(...argv.slice(i + 1)); break; }
    if (help && ['--help', '-h'].includes(token)) continue;
    if (!token.startsWith('-') || token === '-') { args.push(token); continue; }
    const eq = token.indexOf('=');
    const spelling = eq < 0 ? token : token.slice(0, eq);
    const raw = spelling.startsWith('--') ? spelling.slice(2) : spelling;
    const key = aliases[raw] || raw;
    const option = allowed[key];
    if (!option) {
      // Help must remain available even when the original invocation is invalid.
      if (help) continue;
      unknownOption(spelling, cmd, allowed);
    }
    let value;
    if (option.value === null) {
      if (eq >= 0 && !help) throw usageError('invalid_value', `Option ${spelling} does not accept a value`);
      value = true;
    } else {
      value = eq >= 0 ? token.slice(eq + 1) : argv[++i];
      if (value === undefined || (eq < 0 && value.startsWith('-') && !/^-\d/.test(value)) || !value.length) {
        if (help) { if (value?.startsWith('-')) i--; continue; }
        throw usageError('missing_value', `Option ${spelling} requires a value`);
      }
    }
    if (flags[key] !== undefined) {
      if (!option.repeatable && !help) throw usageError('invalid_usage', `Option ${spelling} cannot be repeated`);
      flags[key] = option.repeatable ? [].concat(flags[key], value) : value;
    } else flags[key] = value;
  }
  if (help) return { args, flags };
  if (!root) return { args, flags };
  let spec = root;
  let positional = args;
  if (root.subcommands) {
    const sub = args[0] ?? root.defaultSubcommand;
    spec = commandSpec(cmd, sub);
    if (!spec) {
      const suggestion = sub && closest(sub, Object.keys(root.subcommands).filter((key) => !root.subcommands[key].hidden));
      throw usageError(sub ? 'unknown_command' : 'invalid_usage', sub ? `Unknown subcommand ${sub} for ${cmd}${suggestion ? `; did you mean ${suggestion}?` : ''}` : root.usage.join('\n'), suggestion ? { suggestion } : {});
    }
    positional = args.length ? args.slice(1) : [];
    for (const key of Object.keys(flags)) if (!Object.hasOwn(spec.options, key)) unknownOption(`--${key}`, `${cmd} ${sub}`, spec.options);
  }
  if (positional.length < spec.minArgs || positional.length > spec.maxArgs) {
    throw usageError('invalid_usage', `Usage: ${spec.usage.join('\n')}`);
  }
  if (Number.isFinite(spec.maxArgs) && positional.some((value) => !value.trim())) throw usageError('invalid_value', 'Positional arguments cannot be empty');
  for (const pair of [['user', 'project'], ['markdown', 'json'], ...(spec.conflicts || [])]) {
    if (pair.every((key) => flags[key] !== undefined)) throw usageError('conflicting_options', `Options --${pair[0]} and --${pair[1]} conflict`);
  }
  for (const [key, value] of Object.entries(flags)) {
    const option = spec.options[key];
    for (const item of option.repeatable ? [].concat(value) : [value]) {
      if (option.min !== undefined && (!/^\d+$/.test(item) || !Number.isSafeInteger(Number(item)) || Number(item) < option.min || Number(item) > option.max)) {
        throw usageError('invalid_value', `--${key} must be an integer from ${option.min} to ${option.max}; received ${item}`);
      }
      if (option.choices && !option.choices.includes(item)) {
        const suggestion = closest(item, option.choices);
        throw usageError('invalid_value', `--${key} must be ${option.choices.join('|')}`, suggestion ? { suggestion } : {});
      }
    }
  }
  if (cmd === 'setup' && flags.target && args.length) throw usageError('conflicting_options', '--target conflicts with the positional directory');
  if (['checkpoint', 'compact'].includes(cmd) && args.length && (flags.summary || flags.title)) throw usageError('conflicting_options', 'A positional summary conflicts with --summary/--title');
  if (cmd === 'context' && flags.focus && args.length) throw usageError('conflicting_options', 'A positional focus conflicts with --focus');
  if (cmd === 'changes' && ((flags.since && args.length) || (!flags.since && !args.length))) throw usageError('invalid_usage', 'Supply one checkpoint with --since or a positional argument');
  if (cmd === 'backup' && !flags.out) throw usageError('invalid_usage', 'backup requires --out <path>');
  if (cmd === 'restore' && !flags.into) throw usageError('invalid_usage', 'restore requires --into <directory>');
  if (cmd === 'help' && flags.all && args.length) throw usageError('conflicting_options', '--all cannot be combined with a command help path');
  if (cmd === 'batch' && !flags.check && !flags['request-id']) throw usageError('invalid_usage', 'batch requires --request-id: retry with the same ID after a failure or interruption');
  if (['checkpoint', 'compact'].includes(cmd) && flags['request-id'] && !flags.summary && !flags.title && !args.join(' ').trim()) throw usageError('invalid_usage', 'Checkpoints with --request-id require an explicit --summary to keep retries stable');
  if (['cursor', 'focus'].includes(cmd) && flags['request-id'] && (!args.length || args[0] === 'next')) throw usageError('invalid_usage', 'cursor with --request-id requires an explicit node ID or none');
  if (cmd === 'edit') {
    const fieldFlags = { title: 'title', detail: 'detail', status: 'status', severity: 'sev', confidence: 'confidence', tags: 'tag' };
    for (const field of [].concat(flags.clear || [])) {
      if (flags[fieldFlags[field]] !== undefined) throw usageError('conflicting_options', `--clear ${field} conflicts with --${fieldFlags[field]}`);
    }
    if (!Object.values(fieldFlags).some((key) => flags[key] !== undefined) && !flags.clear) throw usageError('invalid_usage', 'No fields to update');
    if (flags.title !== undefined && !flags.title.trim()) throw usageError('invalid_value', 'A node title cannot be empty');
  }
  const isNode = cmd === 'node' || ['start', 'goal', 'intent', 'fact', 'vuln', 'hint'].includes(cmd);
  if (cmd === 'node' && !args[1].trim()) throw usageError('invalid_value', 'A node kind cannot be empty');
  if (isNode || cmd === 'promote') {
    if ((flags.rel || (isNode && flags.kind) || flags.label) && !flags.to && !flags.parent && !flags['relate-here']) {
      throw usageError('invalid_usage', '--rel/--label describes a relation; provide --to, --parent or --relate-here');
    }
    if (isNode && !args.slice(cmd === 'node' ? 2 : 0).join(' ').trim()) throw usageError('invalid_usage', 'A node title cannot be empty');
  }
  return { args, flags };
}
