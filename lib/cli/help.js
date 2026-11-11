import { C } from './format.js';
import { COMMANDS, COMMAND_ALIASES, commandSpec } from './commands.js';

export function usage({ all = false } = {}) {
  const b = C.bold;
  if (all) {
    const lines = [];
    for (const command of Object.keys(COMMANDS)) {
      if (command.startsWith('-') || Object.hasOwn(COMMAND_ALIASES, command)) continue;
      const spec = commandSpec(command);
      if (!spec) continue;
      const aliases = Object.keys(COMMAND_ALIASES).filter((alias) => COMMAND_ALIASES[alias] === command);
      lines.push(`${b(command)}${aliases.length ? ` (aliases: ${aliases.join(', ')})` : ''}`);
      if (spec.subcommands) {
        for (const subcommand of Object.keys(spec.subcommands)) {
          if (command === 'release' && subcommand === 'refresh') continue;
          const leaf = commandSpec(`${command} ${subcommand}`);
          lines.push(...leaf.usage.map((line) => `  ${line}`));
        }
      } else lines.push(...spec.usage.map((line) => `  ${line}`));
    }
    console.log(`\n${b('Pinwhy')} — Public command directory\n\n${lines.join('\n')}\n\nUse pinwhy help <command> [subcommand] for options, examples and JSON output.\n`);
    return;
  }
  console.log(`
${b('Pinwhy')} — External memory for Agents

${b('Start / check')}
  init · setup · status · doctor · capabilities
  Create a board, configure integration, or inspect its health.

${b('Record')}
  node add <type> <title> · edit · link · unlink · cursor · batch
  Add facts and hypotheses, relate evidence, and update recorded fields.
  Shorthands: start · goal · intent · fact · vuln · hint

${b('Inspect / recover')}
  here · ls · show · search · context · checkpoint · digest · history · changes
  Inspect evidence and recover context; backup / restore preserve event history.

${b('Viewer / manage')}
  serve     Browse this project in the local viewer
  stop      Stop this project's viewer
  export    Save a snapshot or report to a file
  hooks     Preview or apply Claude recovery hooks
  skill     Install the Agent Skill package
  service   Manage the shared background viewer
  release   Install, switch, or check CLI releases

pinwhy help --all                  Full public command directory and aliases
pinwhy help <command> [subcommand]  Options, examples and JSON output
pinwhy <command> --help            Help without running the command

Use --cwd <directory> to select a project and --agent <name> to select an identity.
Write commands accept --request-id <ID> for safe retries; receipt <ID> checks a commit.
Use --json for machine-readable output. Put literal arguments after --.
`);
}
