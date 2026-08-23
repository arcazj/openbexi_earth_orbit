import { spawnSync } from 'node:child_process';
import { resolvePythonCommand } from './python-discovery.mjs';

const args = process.argv.slice(2);
const python = resolvePythonCommand();
if (python) {
  const result = spawnSync(python.command, [...python.prefix, ...args], {
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

console.error('Python 3 was not found. Install Python 3 or set OPENBEXI_PYTHON_COMMAND.');
process.exit(1);
