import { defineConfig } from '@playwright/test';

const port = Number(process.env.HELIOS_TEST_PORT ?? 4175);
const production = process.env.HELIOS_TEST_PRODUCTION === '1';
export default defineConfig({
  testDir: './tests', testMatch: 'gallery.spec.ts', workers: 1, timeout: 90_000,
  expect: { timeout: 30_000 },
  outputDir: 'artifacts/local/gallery/browser-tests',
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium', channel: 'chrome', viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: { command: `npm run ${production ? 'preview' : 'dev'} -- --host 127.0.0.1 --port ${port}`, url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI },
});
