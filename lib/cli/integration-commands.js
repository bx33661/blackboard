import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EVENT_VERSION } from '../model.js';
import { LIMITS } from '../storage/input.js';
import { BATCH_LIMITS } from '../batch.js';
import { paths } from '../storage/layout.js';
import { resolvePort, rememberViewerPort, stopViewer, viewerUrl } from '../service.js';
import { cliOrigin } from '../release.js';
import { buildInfo } from '../build-info.js';
import { ERROR_CODES, ERROR_SCHEMA, OUTPUTS, WRITE_TARGETS } from '../contracts.js';
import { C, serveBanner } from './format.js';
import { renderDoctor, renderSetup, renderService } from './panels.js';
import { renderVersion, renderReleaseList, renderReleaseCheck, renderReleaseResult } from './results.js';
import { readStdin } from './stdin.js';
import { COMMANDS } from './commands.js';

/** Installation identity is supplied by the entrypoint, preserving release/current paths. */
export function createIntegrationCommands({ cwd, needInit, needInitRead, fail, warn, out }, { root: ROOT, cli: CLI, version: VERSION }) {
  async function cmdServe(args, flags) {
    const started = performance.now();
    const target = cwd();
    const port = resolvePort({ cwd: target, port: flags.port, allowZero: true });
    needInit();
    const { startServer } = await import('../server.js');
    const server = await startServer({ cwd: target, port, open: !!flags.open, readOnly: !!flags['read-only'] });
    // Signal handlers run between synchronous log writes, so stopping never cuts one in half.
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => process.exit(0));
    try {
      rememberViewerPort(target, server.address().port);
    } catch (error) {
      server.close();
      throw error;
    }
    console.log(serveBanner({
      version: VERSION, url: viewerUrl(server.address().port), cwd: fs.realpathSync(target),
      readOnly: !!flags['read-only'], elapsedMs: performance.now() - started,
    }));
  }

  async function cmdStop(args, flags) {
    const p = needInitRead();
    const { workspaceServiceStatus, stopWorkspaceService } = await import('../setup.js');
    let result;
    try {
      const service = flags.port ? null : workspaceServiceStatus({ cwd: p.cwd });
      // Stop the registration itself so the service manager cannot restart the viewer.
      if (service?.currentProject && service.loaded) {
        stopWorkspaceService({ cwd: p.cwd });
        const port = service.port ?? resolvePort({ cwd: p.cwd });
        result = { state: 'stopped', via: service.mode, port, url: viewerUrl(port) };
      } else result = await stopViewer({ cwd: p.cwd, port: flags.port });
    } catch (error) { return fail(error); }
    if (flags.json) return out(flags, { ...result, cwd: p.cwd });
    console.log(result.state === 'stopped' ? `${C.grn('Stopped')} ${result.url}` : `The viewer for this project is not running (${result.url})`);
  }
  async function cmdDoctor(args, flags) {
    const { diagnose } = await import('../doctor.js');
    const report = await diagnose({ cwd: cwd(), cli: CLI, port: flags.port, share: !!flags.share });
    if (flags.json) return out(flags, report, OUTPUTS.doctor);
    console.log(renderDoctor(report));
  }
  async function cmdSetup(args, flags) {
    const { setupProject } = await import('../setup.js');
    const target = path.resolve(String(flags.target || args[0] || cwd()));
    if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
      fail(`Project directory does not exist: ${target}`);
    }
    checkoutNote();
    const result = await setupProject({
      cwd: target,
      cli: CLI,
      title: flags.title || path.basename(target),
      port: resolvePort({ cwd: target, port: flags.port }),
      hooks: !flags['no-hooks'],
      skill: !flags['no-skill'],
      serve: !flags['no-serve'],
    });
    if (flags.open && result.service?.url) {
      const { execFile } = await import('node:child_process');
      const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const openerArgs = process.platform === 'win32' ? ['/c', 'start', '', result.service.url] : [result.service.url];
      execFile(opener, openerArgs, () => {});
    }
    if (flags.json) return out(flags, result);
    console.log(renderSetup(result));
  }
  async function cmdHooks(args, flags) {
    const { installHooks, uninstallHooks } = await import('../hooks.js');
    const sub = args[0] || 'install';
    const scope = flags.user ? 'user' : 'project';
    const action = sub === 'install' ? installHooks : uninstallHooks;
    if (sub === 'install' && flags.write) checkoutNote();
    const res = action({
      cwd: cwd(), write: !!flags.write, cli: CLI, scope, withActivity: !!flags['with-activity'],
    });
    if (flags.json) return out(flags, res);
    console.log(res.plan);
    if (res.write) {
      console.log(C.grn(`${sub === 'install' ? 'Written' : 'Removed Pinwhy hooks from'} ${res.file}`));
    }
    else console.log(C.dim('No changes written. Add --write to apply.'));
    if (sub === 'install' && res.removed?.length) {
      console.log(C.yel(`Tool activity collection installed by older defaults has been disabled (${res.removed.join(', ')}). Use --with-activity to enable it again.`));
    }
    if (sub === 'install' && res.withActivity) {
      console.log(C.yel('Warning: Activity collection is enabled. Inputs and outputs from Bash/Read/Grep and similar tools are written to .pinwhy/events.jsonl with best-effort redaction; Write/Edit record paths only. Keep .pinwhy/ out of version control.'));
    }
    if (sub === 'install' && scope === 'project') {
      console.log(C.dim('Tip: Use --user for a global installation; global hooks run only in directories with .pinwhy/.'));
    }
  }

  async function cmdSkill(args, flags) {
    const { installSkill } = await import('../hooks.js');
    const scope = flags.user ? 'user' : 'project';
    const agent = flags.codex ? 'codex' : 'claude';
    checkoutNote();
    const message = installSkill({ cwd: cwd(), cli: CLI, scope, agent });
    if (flags.json) return out(flags, { agent, scope, message });
    console.log(message);
  }

  async function cmdService(args, flags) {
    const { workspaceServiceStatus, stopWorkspaceService, installWorkspaceService } = await import('../setup.js');
    const sub = args[0] || 'status';
    let result;
    if (sub === 'install' || sub === 'start') {
      const target = needInitRead().cwd;
      checkoutNote();
      let port;
      if (sub === 'start') {
        const current = workspaceServiceStatus({ cwd: target });
        if (!current.managed || !current.currentProject) fail('No managed service is registered for this project; run pinwhy service install first, or use --cwd to select the service project.');
        port = current.port ?? resolvePort({ cwd: target });
      } else port = resolvePort({ cwd: target, port: flags.port });
      result = await installWorkspaceService({ cwd: target, cli: CLI, port });
      if (result.verified) rememberViewerPort(target, port);
    } else result = sub === 'status'
      ? workspaceServiceStatus({ cwd: cwd() })
      : stopWorkspaceService({ cwd: cwd(), uninstall: sub === 'uninstall' });
    if (flags.json) return out(flags, result);
    console.log(renderService(result, { action: sub }));
  }

  async function cmdLauncher(args, flags) {
    const { installLauncher } = await import('../hooks.js');
    checkoutNote();
    const res = installLauncher({ cli: CLI, scope: flags.project ? 'project' : 'user' });
    if (flags.json) return out(flags, res);
    console.log(`${C.grn('Installed')} ${res.file}`);
    if (!res.onPath) console.log(C.yel(`Warning: ${res.dir} is not on PATH; add it to your shell configuration.`));
  }

  function cmdVersion() {
    const build = buildInfo();
    const origin = build.origin;
    const where = origin.kind === 'release'
      ? (origin.active ? 'installed release · current' : `installed release ${origin.version} · not current`)
      : origin.kind === 'checkout' ? `development checkout ${origin.root}` : ROOT;
    console.log(renderVersion({ version: VERSION, build, where }));
  }

  /** Integrations written from a checkout follow every edit in it; say so, but do not refuse. */
  function checkoutNote() {
    if (cliOrigin(CLI).kind !== 'checkout') return;
    warn(C.yel(`Warning: Running from a development checkout; integrations will point to ${CLI} and follow changes in this repository immediately. For daily use, run pinwhy release install first.`));
  }

  /** The refresh runs in the newly active release, so its own code writes the integrations. */
  function refreshFromRelease(cli) {
    const res = spawnSync(process.execPath, [cli, 'release', 'refresh', '--json'], { encoding: 'utf8', env: process.env });
    if (res.status !== 0) return { error: (res.stderr || '').trim() || `exit ${res.status}` };
    try {
      return JSON.parse(res.stdout);
    } catch {
      return { error: `Cannot parse refresh result: ${res.stdout.slice(0, 200)}` };
    }
  }


  async function cmdRelease(args, flags) {
    const release = await import('../release.js');
    const sub = args[0] || 'ls';
    const origin = cliOrigin(CLI);
    if (sub === 'check') {
      const { checkForUpdates } = await import('../release/update.js');
      const result = await checkForUpdates({ currentVersion: VERSION });
      if (flags.json) return out(flags, result, OUTPUTS['release check']);
      console.log(renderReleaseCheck(result));
      return;
    }
    if (sub === 'ls' || sub === 'list') {
      const list = release.listReleases();
      if (flags.json) return out(flags, list);
      console.log(renderReleaseList(list));
      return;
    }
    if (sub === 'install') {
      if (origin.kind === 'release') fail('release install must run from a development checkout, for example: node /path/to/pinwhy/bin/pinwhy.js release install');
      const installed = release.installRelease({ source: ROOT, force: !!flags.force });
      const switched = release.useRelease(installed.version);
      const refresh = refreshFromRelease(switched.cli);
      const result = { ...installed, previous: switched.previous, cli: switched.cli, ...(switched.warnings?.length ? { warnings: [...installed.warnings, ...switched.warnings] } : {}), refresh };
      if (refresh.error) fail(`Integration refresh failed: ${refresh.error}; current has switched. Fix the issue and run pinwhy release use ${installed.version} again.`, { code: 'error', committed: true, result });
      if (flags.json) return out(flags, result);
      return console.log(renderReleaseResult(result, { action: 'install' }));
    }
    if (sub === 'use') {
      const switched = release.useRelease(args[1]);
      const refresh = refreshFromRelease(switched.cli);
      const result = { ...switched, refresh };
      if (refresh.error) fail(`Integration refresh failed: ${refresh.error}; current has switched. Fix the issue and run pinwhy release use ${switched.version} again.`, { code: 'error', committed: true, result });
      if (flags.json) return out(flags, result);
      return console.log(renderReleaseResult(result, { action: 'use' }));
    }
    if (sub === 'refresh') {
      // Internal step of install/use: only the active release may repoint integrations,
      // otherwise a checkout or an inactive version would capture them again.
      if (origin.kind !== 'release' || !origin.active) fail('release refresh must run from the release selected by current; use release install or release use');
      return out({ json: true }, await release.refreshIntegrations({ cli: CLI }));
    }
    fail('Usage: pinwhy release install|use|ls|check');
  }

  async function hookEntry(event, args, flags) {
    const { runHook } = await import('../hooks.js');
    let payload = {};
    try {
      const raw = process.stdin.isTTY ? '' : await readStdin();
      if (raw.trim()) payload = JSON.parse(raw);
    } catch {
      payload = {};
    }
    try {
      const res = runHook({ event, payload, cwd: cwd(), args });
      if (res && res.stdout) process.stdout.write(res.stdout);
      if (res && res.digestFile) {
        try {
          fs.writeFileSync(paths(cwd()).digest, res.digest || '');
        } catch {}
      }
    } catch (e) {
      // A hook must never break the host session.
      if (process.env.PINWHY_DEBUG) console.error(e);
    }
  }
  function cmdCapabilities(args, flags) {
    const result = {
      schemaVersion: 1, version: VERSION, eventVersion: EVENT_VERSION,
      runtime: { minimumNode: 18, runtimeDependencies: 0 },
      commands: Object.keys(COMMANDS).filter((key) => !key.startsWith('-')),
      features: { context: true, incrementalContext: true, search: true, nodeHistory: true,
        checkpointChanges: true, backupRestore: true, requestReceipts: true,
        writeAttribution: true, cwdFlag: true, noInit: true,
        rejectTruncation: true, inputTruncationMetadata: true, nodeEdgeLabel: true,
        searchFilters: true, searchGrouping: true, listAll: true, nodeJsonDefaults: true,
        nodeMultiTarget: true, checkpointDelta: true, batch: true, batchCheck: true, jsonErrors: true, asOf: true, doctor: true,
        editClear: true, listFilters: true, resourcePaths: true },
      resources: { cli: CLI, skill: path.join(path.dirname(path.dirname(CLI)), 'skills', 'pinwhy') },
      exportFormats: ['html', 'markdown', 'mermaid', 'sarif'],
      errors: { stream: 'stderr', schema: ERROR_SCHEMA, codes: ERROR_CODES },
      contextContract: { readOnly: true, prescriptive: false, nextStepSelection: 'agent-controlled' },
      limits: { ...LIMITS, ...BATCH_LIMITS },
      outputs: OUTPUTS,
      writeTargets: WRITE_TARGETS,
    };
    if (flags.json) return out(flags, result, OUTPUTS.capabilities);
    console.log(`pinwhy ${VERSION} · capabilities schema ${result.schemaVersion}`);
    console.log(Object.keys(result.features).join(', '));
  }
  return { cmdServe, cmdStop, cmdDoctor, cmdSetup, cmdHooks, cmdSkill,
    cmdService, cmdLauncher, cmdVersion, cmdRelease, cmdCapabilities, hookEntry };
}
