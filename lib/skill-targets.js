import os from 'node:os';
import path from 'node:path';

export const SKILL_HOSTS = [
  { agent: 'claude', label: 'Claude Code', root: '.claude' },
  { agent: 'codex', label: 'Codex', root: '.agents' },
  { agent: 'omp', label: 'OMP', root: '.agents' },
  { agent: 'cursor', label: 'Cursor', root: '.agents' },
  { agent: 'gemini', label: 'Gemini CLI', root: '.agents' },
  { agent: 'opencode', label: 'OpenCode', root: '.agents' },
  { agent: 'copilot', label: 'GitHub Copilot CLI', root: '.agents' },
];

export const SKILL_TARGETS = [
  { agent: 'claude', label: 'Claude Code', root: '.claude', hosts: ['claude'] },
  { agent: 'codex', label: 'Agent Skills', root: '.agents', hosts: ['codex', 'omp', 'cursor', 'gemini', 'opencode', 'copilot'] },
];

export function skillDestination({ cwd = process.cwd(), scope = 'project', agent = 'claude' }) {
  if (!['project', 'user'].includes(scope)) throw new Error(`unsupported Skill scope: ${scope}`);
  const host = SKILL_HOSTS.find((entry) => entry.agent === agent);
  if (!host) throw new Error(`unsupported Agent skill target: ${agent}`);
  const base = scope === 'user' ? os.homedir() : path.resolve(cwd);
  return path.join(base, host.root, 'skills', 'pinwhy');
}
