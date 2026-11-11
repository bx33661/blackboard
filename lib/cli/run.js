import path from 'node:path';
import { closest, parseArgs } from './args.js';
import { COMMANDS } from './commands.js';
import { usage } from './help.js';
import { commandHelp, commandHelpFor } from './command-help.js';
import { createInvocation, fail, printError } from './invocation.js';
import { createQueryCommands } from './query-commands.js';
import { createMutationCommands } from './mutation-commands.js';
import { createIntegrationCommands } from './integration-commands.js';
import { createFileCommands } from './file-commands.js';

/** Parse and validate before selecting any command that can initialize or install. */
export async function runCli(argv, installation) {
  const delimiter = argv.indexOf('--');
  const options = delimiter < 0 ? argv : argv.slice(0, delimiter);
  const json = options.includes('--json') || (argv[0] === 'context' && !options.includes('--markdown') && !options.includes('--md'));
  try {
    await execute(argv, installation, json);
  } catch (error) {
    printError(error, json);
  }
}
function unknownCommand(name) {
  const suggestion = closest(name, Object.keys(COMMANDS).filter((key) => !key.startsWith('-')));
  return fail(`Unknown command ${name}${suggestion ? `; did you mean ${suggestion}?` : ''} (run pinwhy help for usage)`, {
    code: 'unknown_command', ...(suggestion ? { suggestion } : {}),
  });
}
async function execute(argv, installation, json) {
  const delimiter = argv.indexOf('--');
  const options = delimiter < 0 ? argv : argv.slice(0, delimiter);
  const cmd = argv[0];
  if (options.includes('--help') || options.includes('-h')) {
    if (!cmd || ['--help', '-h'].includes(cmd)) return usage({ all: options.includes('--all') });
    if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
    const { args, flags } = parseArgs(argv.slice(1), cmd, { help: true });
    const help = cmd === 'help' ? args.join(' ') : `${cmd}${COMMANDS[cmd].subcommands && args[0] ? ` ${args[0]}` : ''}`;
    if (!help) return usage({ all: !!flags.all });
    if (!commandHelpFor(help)) return unknownCommand(help);
    return console.log(commandHelp(help));
  }
  if (cmd === undefined) return usage();
  // Options belong to a command; keep the documented placement rule.
  if (cmd.startsWith('--') && cmd !== '--version') {
    return fail(`Options must follow a command, for example: pinwhy <command> ${cmd.split('=')[0]} …`);
  }
  if (!Object.hasOwn(COMMANDS, cmd)) return unknownCommand(cmd);
  let parsed;
  try { parsed = parseArgs(argv.slice(1), cmd); }
  catch (error) { return fail(error); }
  const { args, flags } = parsed;
  const invocation = createInvocation({
    root: flags.cwd ? path.resolve(String(flags.cwd)) : null,
    noInit: !!flags['no-init'], json,
  });
  invocation.validateInvocation(cmd, args, flags);
  const { cmdStatus, cmdList, cmdShow, cmdTree, cmdDigest, cmdContext, cmdSearch,
    cmdHistory, cmdChanges, cmdReceipt, cmdLint, cmdTail, cmdHere, cmdActivity } = createQueryCommands(invocation);
  const { cmdInit, addSimple, cmdBatch, cmdCheckpoint, cmdCursor, cmdPromote,
    cmdState, cmdEdit, cmdLink, cmdUnlink, cmdRemove, cmdReset } = createMutationCommands(invocation);
  const { cmdServe, cmdStop, cmdDoctor, cmdSetup, cmdHooks, cmdSkill,
    cmdService, cmdLauncher, cmdVersion, cmdRelease, cmdCapabilities, hookEntry } = createIntegrationCommands(invocation, installation);
  const { cmdExport, cmdBackup, cmdRestore } = createFileCommands(invocation, installation);

  async function dispatch() {
    switch (cmd) {
      case 'help': {
        if (!args.length) return usage({ all: !!flags.all });
        const help = args.join(' ');
        if (!commandHelpFor(help)) return unknownCommand(help);
        return console.log(commandHelp(help));
      }
      case '-v':
      case '--version':
      case 'version':
        return cmdVersion();
      case 'init':
        return cmdInit(args, flags);
      case 'setup':
        return cmdSetup(args, flags);
      case 'status':
        return cmdStatus(args, flags);
      case 'doctor':
        return cmdDoctor(args, flags);
      case 'node':
        return addSimple(args[1], args.slice(2), flags);
      case 'start':
        return addSimple('start', args, flags);
      case 'goal':
        return addSimple('goal', args, flags);
      case 'intent':
        return addSimple('intent', args, flags);
      case 'fact':
        return addSimple('fact', args, flags);
      case 'vuln':
        return addSimple('vuln', args, flags);
      case 'hint':
        return addSimple('hint', args, flags);
      case 'compact':
      case 'checkpoint':
        return cmdCheckpoint(args, flags);
      case 'focus':
      case 'cursor':
        return cmdCursor(args, flags);
      case 'here':
        return cmdHere(args, flags);
      case 'activity':
        return cmdActivity(args, flags);
      case 'promote':
        return cmdPromote(args, flags);
      case 'batch':
        return cmdBatch(args, flags);
      case 'done':
      case 'block':
      case 'revive':
        return cmdState(cmd, args, flags);
      case 'edit':
        return cmdEdit(args, flags);
      case 'link':
        return cmdLink(args, flags);
      case 'unlink':
        return cmdUnlink(args, flags);
      case 'remove':
      case 'rm':
        return cmdRemove(args, flags);
      case 'ls':
      case 'list':
        return cmdList(args, flags);
      case 'show':
        return cmdShow(args, flags);
      case 'search': return cmdSearch(args, flags);
      case 'history': return cmdHistory(args, flags);
      case 'changes': return cmdChanges(args, flags);
      case 'backup': return cmdBackup(args, flags);
      case 'restore': return cmdRestore(args, flags);
      case 'receipt': return cmdReceipt(args, flags);
      case 'capabilities': return cmdCapabilities(args, flags);
      case 'tree':
        return cmdTree(args, flags);
      case 'digest':
        return cmdDigest(args, flags);
      case 'context':
        return cmdContext(args, flags);
      case 'lint':
        return cmdLint(args, flags);
      case 'tail':
        return cmdTail(args, flags);
      case 'serve':
        return cmdServe(args, flags);
      case 'stop':
        return cmdStop(args, flags);
      case 'export':
        return cmdExport(args, flags);
      case 'reset':
        return cmdReset(args, flags);
      case 'hooks':
        return cmdHooks(args, flags);
      case 'service':
        return cmdService(args, flags);
      case 'skill':
        return cmdSkill(args, flags);
      case 'launcher':
        return cmdLauncher(args, flags);
      case 'release':
        return cmdRelease(args, flags);
      case 'hook':
        return hookEntry(args[0], args.slice(1), flags);
      default:
        unknownCommand(cmd);
    }
  }
  await dispatch();
  invocation.flushWarnings();
}
