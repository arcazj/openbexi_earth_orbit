import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { APP_VERSION } from '../js/releaseVersion.js';
import { resolvePythonCommand } from './python-discovery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.OPENBEXI_TEST_PORT || 4173);
const HEALTH_URL = `http://127.0.0.1:${PORT}/api/health`;
const START_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 5_000;
const EXPECTED_HEALTH_APP = 'openbexi_earth_orbit';

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function resolvePython() {
  const python = resolvePythonCommand({ cwd: ROOT });
  if (python) return python;
  throw new Error('Python 3 was not found. Install Python 3 or set OPENBEXI_PYTHON_COMMAND.');
}

async function serverAvailable() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_500);
  try {
    const response = await fetch(HEALTH_URL, { signal: controller.signal, cache: 'no-store' });
    if (!response.ok) return false;
    const health = await response.json();
    return health?.status === 'ok' &&
      health?.app === EXPECTED_HEALTH_APP &&
      health?.version === APP_VERSION;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForServer(server) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await serverAvailable()) return;
    if (server.spawnError) {
      throw server.spawnError;
    }
    if (server.exitCode !== null || server.signalCode !== null) {
      throw new Error(`Browser test server exited before becoming ready (code ${server.exitCode ?? server.signalCode}).`);
    }
    await delay(250);
  }
  throw new Error(`Browser test server did not become ready at ${HEALTH_URL}.`);
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(timeoutMs).then(() => false)
  ]);
}

function signalProcessTree(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    if (result.status !== 0) child.kill(signal);
    return;
  }
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error;
  }
}

async function stopProcessTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  signalProcessTree(child, 'SIGTERM');
  if (await waitForExit(child, STOP_TIMEOUT_MS)) return;
  signalProcessTree(child, 'SIGKILL');
  await waitForExit(child, STOP_TIMEOUT_MS);
}

async function runPlaywright() {
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  if (!fs.existsSync(cli) || !fs.statSync(cli).isFile()) {
    throw new Error('Playwright is not installed. Run npm install first.');
  }
  managedPlaywright = spawn(process.execPath, [cli, 'test', ...process.argv.slice(2)], {
    cwd: ROOT,
    env: { ...process.env, OPENBEXI_EXTERNAL_TEST_SERVER: '1' },
    stdio: 'inherit',
    windowsHide: true,
    detached: process.platform !== 'win32'
  });
  return new Promise((resolve, reject) => {
    managedPlaywright.once('error', reject);
    managedPlaywright.once('exit', code => resolve(code ?? 1));
  });
}

let managedServer = null;
let managedPlaywright = null;
let shutdownPromise = null;

async function shutdownForSignal(signal) {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    await stopProcessTree(managedPlaywright);
    await stopProcessTree(managedServer);
    process.exit(signal === 'SIGINT' ? 130 : 143);
  })();
  return shutdownPromise;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void shutdownForSignal(signal);
  });
}

try {
  if (!await serverAvailable()) {
    const python = resolvePython();
    managedServer = spawn(
      python.command,
      [...python.prefix, 'server.py', '--host', '127.0.0.1', '--port', String(PORT)],
      {
        cwd: ROOT,
        stdio: 'inherit',
        windowsHide: true,
        detached: process.platform !== 'win32'
      }
    );
    managedServer.once('error', error => {
      managedServer.spawnError = error;
      console.error(`Browser test server failed: ${error.message}`);
    });
    await waitForServer(managedServer);
  }
  process.exitCode = await runPlaywright();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await stopProcessTree(managedPlaywright);
  await stopProcessTree(managedServer);
}
