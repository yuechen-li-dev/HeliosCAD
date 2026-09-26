import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: 'mvp-ux-x0.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome', viewport: { width: 2560, height: 1440 } },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:4173/local', reuseExistingServer: false, timeout: 120_000 },
});
