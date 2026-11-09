import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LABEL, OWNER, readOptional, runNative, serviceState, unavailable, validConfig } from './common.js';

/** CommandLineToArgvW / Node CRT quoting; cmd.exe is never involved. */
export function quoteWindowsArgument(value) {
  return `"${String(value).replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/g, '$1$1')}"`;
}

export function taskArguments(config) {
  return [config.cli, 'serve', '--cwd', config.cwd, '--port', String(config.port)].map(quoteWindowsArgument).join(' ');
}

const SCRIPT = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$d = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__DATA__')) | ConvertFrom-Json
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$name = '${LABEL}-' + $sid
$task = Get-ScheduledTask -ErrorAction Stop | Where-Object { $_.TaskName -eq $name -and $_.TaskPath -eq '\\' }
if (@($task).Count -gt 1) { throw 'Ambiguous Pinwhy scheduled task' }
switch ($d.operation) {
  'inspect' {
    if (!$task) { @{ exists = $false; sid = $sid } | ConvertTo-Json -Compress; break }
    $actions = @($task.Actions | ForEach-Object { @{ execute = $_.Execute; arguments = $_.Arguments; cwd = $_.WorkingDirectory } })
    $triggers = @($task.Triggers | ForEach-Object { @{ user = $_.UserId; enabled = $_.Enabled; type = $_.CimClass.CimClassName } })
    @{ exists = $true; sid = $sid; description = $task.Description; enabled = [bool]$task.Settings.Enabled;
       state = [string]$task.State; actions = $actions; triggers = $triggers; user = $task.Principal.UserId;
       logon = [string]$task.Principal.LogonType; level = [string]$task.Principal.RunLevel;
       xml = (Export-ScheduledTask -TaskName $name -TaskPath '\\' -ErrorAction Stop) } | ConvertTo-Json -Depth 8 -Compress
  }
  'disable' {
    if ($task) {
      Disable-ScheduledTask -TaskName $name -TaskPath '\\' -ErrorAction Stop | Out-Null
      Stop-ScheduledTask -TaskName $name -TaskPath '\\' -ErrorAction Stop
    }
  }
  'register' {
    $action = New-ScheduledTaskAction -Execute $d.config.node -Argument $d.arguments -WorkingDirectory $d.config.cwd
    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $sid
    $principal = New-ScheduledTaskPrincipal -UserId $sid -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew
    $settings.Enabled = [bool]$d.start
    $definition = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description $d.description
    Register-ScheduledTask -TaskName $name -TaskPath '\\' -InputObject $definition -Force -ErrorAction Stop | Out-Null
    if ($d.start) { Start-ScheduledTask -TaskName $name -TaskPath '\\' -ErrorAction Stop }
  }
  'restore' {
    if ($d.xml) {
      Register-ScheduledTask -TaskName $name -TaskPath '\\' -Xml $d.xml -Force -ErrorAction Stop | Out-Null
      if ($d.running) { Start-ScheduledTask -TaskName $name -TaskPath '\\' -ErrorAction Stop }
    } elseif ($task) { Unregister-ScheduledTask -TaskName $name -TaskPath '\\' -Confirm:$false -ErrorAction Stop }
  }
  'remove' { if ($task) { Unregister-ScheduledTask -TaskName $name -TaskPath '\\' -Confirm:$false -ErrorAction Stop } }
  default { throw 'Unknown Pinwhy task operation' }
}
`;

export function createWindowsService({ run = runNative, home = os.homedir(), dataHome = process.env.LOCALAPPDATA } = {}) {
  const file = path.join(dataHome || path.join(home, 'AppData', 'Local'), 'pinwhy', 'service', 'workspace.json');
  const call = (operation, data = {}) => {
    const encodedData = Buffer.from(JSON.stringify({ operation, ...data })).toString('base64');
    const script = SCRIPT.replace('__DATA__', encodedData);
    return run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]);
  };
  const render = config => `${JSON.stringify(config, null, 2)}\n`;
  const adapter = {
    mode: 'scheduled-task', file, render,
    status({ cwd = process.cwd() } = {}) {
      let task;
      try { task = JSON.parse(call('inspect').replace(/^\uFEFF/, '')); }
      catch (error) {
        if (error.code === 'ENOENT') return unavailable('scheduled-task', file, 'Windows ScheduledTasks is unavailable; it requires Windows PowerShell and the current interactive user session.');
        throw error;
      }
      if (typeof task.exists !== 'boolean' || typeof task.sid !== 'string') throw new Error('Cannot parse Windows ScheduledTasks status');
      const raw = readOptional(file);
      let diskConfig = null;
      if (raw) {
        try { diskConfig = JSON.parse(raw.toString('utf8')); }
        catch (cause) { throw new Error(`Cannot parse service configuration: ${file}`, { cause }); }
      }
      let config = diskConfig;
      let owned = validConfig(config, 'win32');
      if (task.exists) {
        if (typeof task.xml !== 'string' || typeof task.enabled !== 'boolean' || typeof task.state !== 'string'
          || !Array.isArray(task.actions) || !Array.isArray(task.triggers)) throw new Error('Cannot parse Windows ScheduledTasks registration');
        const marker = new RegExp(`^${OWNER}:([A-Za-z0-9+/=]+)$`).exec(task.description || '')?.[1];
        try { config = marker ? JSON.parse(Buffer.from(marker, 'base64').toString('utf8')) : null; } catch { config = null; }
        owned = !!raw && validConfig(config, 'win32') && task.actions.length === 1
          && task.actions[0].execute === config.node && task.actions[0].arguments === taskArguments(config)
          && task.actions[0].cwd === config.cwd && task.user === task.sid && task.logon === 'Interactive' && task.level === 'Limited'
          && task.triggers.length === 1 && task.triggers[0].user === task.sid && task.triggers[0].enabled === true
          && task.triggers[0].type === 'MSFT_TaskLogonTrigger';
        if (raw && (!validConfig(diskConfig, 'win32') || render(diskConfig) !== render(config))) owned = false;
      }
      const status = serviceState({ mode: 'scheduled-task', file, cwd, configured: !!raw || task.exists,
        managed: !!owned, config, loaded: task.exists && task.enabled, running: task.exists && task.state === 'Running' });
      Object.defineProperty(status, 'registration', { value: task.exists ? task : null });
      return status;
    },
    saveRecovery(previous, dir) {
      if (previous.registration) fs.writeFileSync(path.join(dir, 'registration.xml'), previous.registration.xml, { mode: 0o600 });
    },
    deactivate() { call('disable'); },
    activate(config, start) {
      call('register', { config, start, arguments: taskArguments(config),
        description: `${OWNER}:${Buffer.from(JSON.stringify(config)).toString('base64')}` });
    },
    restore(previous) { call('restore', { xml: previous.registration?.xml || null, running: previous.running }); },
    remove() { call('remove'); },
  };
  return adapter;
}
