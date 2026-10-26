import { defineConfig } from '@playwright/test';

// Local graph authoring needs the real browser SDK, without accounts or an AI server.
export default defineConfig({
  testDir: './tests', testMatch: 'graph-authoring.spec.ts', timeout: 180_000,
  expect: { timeout: 30_000 }, workers: 1,
  use: { baseURL: process.env.HELIOS_GRAPH_BASE_URL ?? 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1600, height: 1000 }, trace: 'retain-on-failure' },
  webServer: process.env.HELIOS_GRAPH_BASE_URL ? undefined
    : { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
