import { defineConfig, devices } from '@playwright/test';

const port = Number(process.env.OPENBEXI_TEST_PORT || 4173);
const pythonCommand = process.platform === 'win32' ? 'py -3' : 'python3';

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
      testMatch: '**/conjunction.spec.js',
      use: { ...devices['Pixel 7'] }
    }
  ],
  webServer: {
    command: `${pythonCommand} server.py --host 127.0.0.1 --port ${port}`,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  }
});
