import { defineConfig, devices } from '@playwright/test';
import fs from 'node:fs';

const port = Number(process.env.OPENBEXI_TEST_PORT || 4173);
const externalTestServer = process.env.OPENBEXI_EXTERNAL_TEST_SERVER === '1';

function splitCommand(commandLine) {
  const configured = String(commandLine || '').trim();
  if (!configured) return [];
  if (fs.existsSync(configured)) return [configured];
  return [...configured.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)]
    .map(match => match[1] ?? match[2] ?? match[3]);
}

function quoteShellArgument(value) {
  const text = String(value);
  if (process.platform === 'win32') {
    const escaped = text
      .replace(/(\\*)"/g, '$1$1\\"')
      .replace(/(\\+)$/g, '$1$1');
    return `"${escaped}"`;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

const pythonTokens = splitCommand(
  process.env.OPENBEXI_PYTHON_COMMAND || (process.platform === 'win32' ? 'py -3' : 'python3')
);
const webServerCommand = [
  ...pythonTokens,
  'server.py',
  '--host',
  '127.0.0.1',
  '--port',
  String(port)
].map(quoteShellArgument).join(' ');

export default defineConfig({
  testDir: './tests_browser',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [['line'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    screenshot: 'only-on-failure',
    // Recording every WebGL frame materially distorts the catalog-screening test.
    // CI retries once, so retain full diagnostics on that retry instead.
    trace: 'on-first-retry',
    video: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      testMatch: ['**/conjunction.spec.js', '**/timelines.spec.js', '**/satelliteFilters.spec.js'],
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: externalTestServer ? undefined : {
    command: webServerCommand,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000
  }
});
