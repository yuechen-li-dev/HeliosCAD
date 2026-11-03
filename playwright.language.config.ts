import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: ['language-x2.spec.ts', 'language-experience.spec.ts', 'editor-presentation.spec.ts'],
  workers: 1, timeout: 120_000, expect: { timeout: 30_000 },
  outputDir: 'artifacts/local/language-polish/browser-tests',
  use: { baseURL: 'http://127.0.0.1:4175', channel: 'chrome', viewport: { width: 1600, height: 1100 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1 --port 4175', url: 'http://127.0.0.1:4175', reuseExistingServer: !process.env.CI },
});
