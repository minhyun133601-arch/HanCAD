import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './apps/web/tests',
  outputDir: './test-artifacts/hancad-e2e',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    ...devices['Desktop Edge'],
    channel: 'msedge',
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command:
      process.env.HANCAD_PRODUCTION === '1'
        ? 'node scripts/serve-app.mjs'
        : 'pnpm dev:web --host 127.0.0.1',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer:
      process.env.HANCAD_RUNNING_APP === '1' ||
      (process.env.HANCAD_PRODUCTION !== '1' && !process.env.CI),
    timeout: 30000,
  },
});
