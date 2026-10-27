import { defineConfig } from '@playwright/test';

const port = Number(process.env.HELIOS_TEST_PORT ?? 4184);
export default defineConfig({
  testDir: './tests', testMatch: ['viewport-fallback.spec.ts', 'intellidraft.spec.ts', 'graph-authoring.spec.ts'],
  outputDir: 'artifacts/local/demo-polish/browser', workers: 1, timeout: 180_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', channel: 'chrome',
    viewport: { width: 1600, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: `npm run dev -- --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: false, timeout: 120_000 },
});
