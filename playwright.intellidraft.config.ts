import { defineConfig } from '@playwright/test';

const port = Number(process.env.HELIOS_TEST_PORT ?? 4173);
const production = process.env.HELIOS_TEST_PRODUCTION === '1';

export default defineConfig({
  testDir: './tests', testMatch: 'intellidraft.spec.ts', workers: 1, timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: `npm run ${production ? 'preview' : 'dev'} -- --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: true, timeout: 120_000 },
});
