import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function splitCommand(commandLine) {
  return [...String(commandLine).matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
    .map(match => match[1] ?? match[2] ?? match[3]);
}

function installedWindowsPythonCandidates() {
  if (process.platform !== 'win32') return [];
  const roots = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Python'),
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)']
  ].filter(Boolean);
  const candidates = [];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^Python\d+(?:\.\d+)*$/i.test(entry.name)) continue;
      const executable = path.join(root, entry.name, 'python.exe');
      if (fs.existsSync(executable)) candidates.push({ command: executable, prefix: [] });
    }
  }
  return candidates.sort((left, right) => right.command.localeCompare(left.command));
}

export function pythonCandidates(configuredCommand = process.env.OPENBEXI_PYTHON_COMMAND) {
  const candidates = [];
  const configured = String(configuredCommand || '').trim();
  if (configured) {
    if (fs.existsSync(configured)) candidates.push({ command: configured, prefix: [] });
    else {
      const [command, ...prefix] = splitCommand(configured);
      if (command) candidates.push({ command, prefix });
    }
  }
  if (process.platform === 'win32') candidates.push({ command: 'py', prefix: ['-3'] });
  candidates.push({ command: 'python3', prefix: [] }, { command: 'python', prefix: [] });
  candidates.push(...installedWindowsPythonCandidates());

  const seen = new Set();
  return candidates.filter(candidate => {
    const key = `${candidate.command}\0${candidate.prefix.join('\0')}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolvePythonCommand(options = {}) {
  const cwd = options.cwd || process.cwd();
  for (const candidate of pythonCandidates(options.configuredCommand)) {
    const probe = spawnSync(candidate.command, [
      ...candidate.prefix,
      '-c',
      'import json,sys;print(json.dumps({"executable":sys.executable,"major":sys.version_info[0]}))'
    ], {
      cwd,
      encoding: 'utf8',
      timeout: options.timeoutMs ?? 5000,
      windowsHide: true
    });
    if (probe.error || probe.status !== 0) continue;
    try {
      const line = String(probe.stdout || '').trim().split(/\r?\n/).at(-1);
      const result = JSON.parse(line);
      if (result?.major === 3 && typeof result.executable === 'string' && result.executable.trim()) {
        return { command: result.executable, prefix: [] };
      }
    } catch {
      // Keep probing when a launcher does not return the expected interpreter identity.
    }
  }
  return null;
}
