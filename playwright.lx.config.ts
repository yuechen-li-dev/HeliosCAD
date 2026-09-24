import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome' },
});
