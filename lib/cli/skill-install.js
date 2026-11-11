import { cursorTo, moveCursor, clearScreenDown } from 'node:readline';
import { installSkill } from '../hooks.js';
import { SKILL_HOSTS, SKILL_TARGETS, skillDestination } from '../skill-targets.js';
import { C, panel, field, oneLine, displayWidth } from './format.js';

function destinations(cwd, scope) {
  return SKILL_TARGETS.map((target) => ({ ...target, destination: skillDestination({ cwd, scope, agent: target.agent }) }));
}

function sharedHostLines(target, columns) {
  if (target.hosts.length < 2) return [];
  const labels = target.hosts.map((agent) => SKILL_HOSTS.find((host) => host.agent === agent).label);
  const lines = [];
  let line = '';
  for (const [index, label] of labels.entries()) {
    const text = `${label}${index < labels.length - 1 ? ',' : ''}`;
    if (line && displayWidth(`${line} ${text}`) > Math.max(1, columns - 10)) {
      lines.push(`        ${line}`);
      line = '';
    }
    line = line ? `${line} ${text}` : text;
  }
  if (line) lines.push(`        ${line}`);
  return [C.dim('      Hosts:'), ...lines.map((text) => C.dim(text))];
}

/** Only the Skill installer owns the keyboard, and only while both streams are terminals. */
export async function chooseSkillTargets({ cwd, scope, input = process.stdin, output = process.stdout }) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') {
    return { scope: scope || 'project', agents: ['claude'] };
  }
  let selectedScope = scope || 'project';
  let selectingScope = scope === undefined;
  const scopes = ['project', 'user'];
  let targets = destinations(cwd, selectedScope);
  const checked = new Set(targets.map(({ agent }) => agent));
  let focused = 0, explanation = '', rows = 0, pendingEscape = '', escapeTimer;
  let settled = false, rawChanged = false, cursorHidden = false;
  const wasRaw = !!input.isRaw;
  const wasFlowing = input.readableFlowing === true;
  let resolveChoice, rejectChoice;
  const choice = new Promise((resolve, reject) => { resolveChoice = resolve; rejectChoice = reject; });

  function render() {
    if (rows) {
      moveCursor(output, 0, -rows);
      cursorTo(output, 0);
      clearScreenDown(output);
    }
    const columns = Math.max(1, output.columns || 80);
    const lines = selectingScope
      ? [C.dim('Choose where to install the Skill. No files are written until the final confirmation.'), '',
        ...scopes.flatMap((value, index) => [
          `${focused === index ? C.cyn('›') : ' '} ${focused === index ? C.grn('(●)') : '( )'} ${C.bold(value === 'project' ? 'Project · this project only' : 'Global · all projects for this user')}`,
          ...destinations(cwd, value).map((target) => `      ${oneLine(target.destination)}`),
        ]), '', C.dim('↑/↓ move · Enter continue · Esc/Ctrl+C cancel')]
      : [field('Scope', selectedScope === 'user' ? 'user · Global' : 'project · Project'), '', ...targets.flatMap((target, index) => [
        `${focused === index ? C.cyn('›') : ' '} ${checked.has(target.agent) ? C.grn('[x]') : '[ ]'} ${C.bold(target.label)}`,
        `      ${oneLine(target.destination)}`,
        ...sharedHostLines(target, columns),
      ]), '', C.dim('↑/↓ move · Space toggle · a toggle all · Enter install · Esc/Ctrl+C cancel'),
      explanation ? C.yel(explanation) : C.dim(`All ${targets.length} targets are selected by default.`)];
    const text = panel(selectingScope ? 'Installation scope' : 'Install Skill', lines);
    rows = text.split('\n').reduce((count, line) => count + Math.max(1, Math.ceil(displayWidth(line) / columns)), 0);
    output.write(`${text}\n`);
  }

  function finish(value, error) {
    if (settled) return;
    settled = true;
    clearTimeout(escapeTimer);
    if (error) rejectChoice(error);
    else resolveChoice(value);
  }
  const cancel = () => finish(null);
  const onError = (error) => finish(null, error);
  function redraw() {
    try { render(); } catch (error) { onError(error); }
  }
  function key(value) {
    if (value === '\u0003' || value === 'escape') return cancel();
    if (selectingScope) {
      if (value === 'up' || value === 'down') focused = (focused + 1) % scopes.length;
      else if (value === '\r' || value === '\n') {
        selectedScope = scopes[focused];
        targets = destinations(cwd, selectedScope);
        selectingScope = false;
        focused = 0;
      } else return;
      redraw();
      return;
    }
    if (value === '\r' || value === '\n') {
      if (checked.size) return finish({ scope: selectedScope, agents: targets.filter(({ agent }) => checked.has(agent)).map(({ agent }) => agent) });
      explanation = 'Select at least one target, or press Esc to cancel. No files have been written.';
    } else if (value === 'up' || value === 'down') {
      focused = (focused + (value === 'up' ? targets.length - 1 : 1)) % targets.length;
    } else if (value === ' ') {
      const agent = targets[focused].agent;
      if (checked.has(agent)) checked.delete(agent);
      else checked.add(agent);
      explanation = '';
    } else if (value.toLowerCase() === 'a') {
      if (checked.size === targets.length) checked.clear();
      else for (const { agent } of targets) checked.add(agent);
      explanation = '';
    } else return;
    redraw();
  }
  function onData(chunk) {
    for (const value of String(chunk)) {
      if (settled) break;
      if (value === '\u0003') { cancel(); break; }
      if (pendingEscape) {
        clearTimeout(escapeTimer);
        pendingEscape += value;
        if (pendingEscape === '\x1b[' || pendingEscape === '\x1bO') {
          escapeTimer = setTimeout(cancel, 50);
        } else if (/^\x1b(?:\[|O)[0-?]*[ -/]*[@-~]$/.test(pendingEscape)) {
          if (pendingEscape === '\x1b[A' || pendingEscape === '\x1bOA') key('up');
          if (pendingEscape === '\x1b[B' || pendingEscape === '\x1bOB') key('down');
          pendingEscape = '';
        } else if (!/^\x1b\[[0-?]*[ -/]*$/.test(pendingEscape)) {
          cancel();
        } else escapeTimer = setTimeout(cancel, 50);
      } else if (value === '\x1b') {
        pendingEscape = value;
        escapeTimer = setTimeout(cancel, 50);
      } else key(value);
    }
  }

  function restore() {
    clearTimeout(escapeTimer);
    input.removeListener('data', onData);
    input.removeListener('end', cancel);
    input.removeListener('close', cancel);
    input.removeListener('error', onError);
    output.removeListener('error', onError);
    output.removeListener('resize', redraw);
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    process.removeListener('exit', restore);
    try {
      if (rawChanged) { rawChanged = false; input.setRawMode(wasRaw); }
    } finally {
      if (!wasFlowing) input.pause();
      if (cursorHidden) { cursorHidden = false; output.write('\x1b[?25h'); }
    }
  }

  try {
    input.setRawMode(true);
    rawChanged = true;
    input.on('data', onData);
    input.once('end', cancel);
    input.once('close', cancel);
    input.once('error', onError);
    output.once('error', onError);
    output.on('resize', redraw);
    process.once('SIGINT', cancel);
    process.once('SIGTERM', cancel);
    process.once('exit', restore);
    cursorHidden = true;
    output.write('\x1b[?25l');
    render();
    input.resume();
    return await choice;
  } finally {
    restore();
  }
}

/** Preserve the legacy single-target JSON object; bulk installs have an explicit target list. */
export async function installSkills({ cwd, cli, flags, input = process.stdin, output = process.stdout }) {
  let scope = flags.user ? 'user' : 'project';
  let agents;
  if (flags.host !== undefined) agents = [flags.host];
  else if (flags.claude || flags.codex) agents = [flags.codex ? 'codex' : 'claude'];
  else if (flags.all || flags.yes) agents = SKILL_TARGETS.map(({ agent }) => agent);
  else if (!flags.json) {
    const choice = await chooseSkillTargets({ cwd, scope: flags.user || flags.project ? scope : undefined, input, output });
    if (!choice) return null;
    ({ scope, agents } = choice);
  }
  else agents = ['claude'];
  if (!agents) return null;
  const targets = agents.map((agent) => ({ agent, scope, message: installSkill({ cwd, cli, scope, agent }) }));
  return targets.length === 1 ? targets[0] : { scope, targets };
}

export function renderSkillInstall(result) {
  if (!result) return panel('Install Skill', [C.dim('Cancelled. No files were written.')]);
  const targets = result.targets || [result];
  return panel('Skill installed', [field('Scope', result.scope), '',
    ...targets.flatMap(({ agent, message }) => {
      const target = (result.targets ? SKILL_TARGETS : SKILL_HOSTS).find((entry) => entry.agent === agent);
      return [C.grn(`✓ ${target.label}`),
        ...(result.targets ? sharedHostLines(target, process.stdout.columns || 80) : []),
        ...message.split('\n').map((line) => `  ${oneLine(line)}`), ''];
    })]);
}
