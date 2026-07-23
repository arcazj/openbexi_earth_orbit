import { spawnSync } from 'node:child_process';

const candidates = process.platform === 'win32'
  ? [
      { command: 'py', prefix: ['-3'] },
      { command: 'python', prefix: [] },
      { command: 'python3', prefix: [] }
    ]
  : [
      { command: 'python3', prefix: [] },
      { command: 'python', prefix: [] }
    ];

const args = process.argv.slice(2);
for (const candidate of candidates) {
  const probe = spawnSync(candidate.command, [...candidate.prefix, '--version'], {
    encoding: 'utf8'
  });
  if (probe.error || probe.status !== 0) continue;

  const result = spawnSync(candidate.command, [...candidate.prefix, ...args], {
    stdio: 'inherit',
    env: process.env
  });
  process.exit(result.status ?? 1);
}

console.error('Python 3 was not found. Install Python 3 or add it to PATH.');
process.exit(1);
