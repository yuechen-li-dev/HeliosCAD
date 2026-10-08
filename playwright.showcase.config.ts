import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', outputDir: 'artifacts/local/p4-03/browser-tests',
  testMatch: ['showcase-x0.spec.ts', 'project-loading.spec.ts', 'editor-presentation.spec.ts', 'wireframe-gallery.spec.ts', 'surface-inspection.spec.ts', 'worker-sdk.spec.ts', 'language-x2.spec.ts', 'mvp-ux-x0.spec.ts'],
  timeout: 600_000, expect: { timeout: 30_000 }, workers: 1,
  use: { baseURL: process.env.HELIOS_SHOWCASE_URL ?? 'http://127.0.0.1:4173', actionTimeout: 30_000, browserName: 'chromium', channel: 'msedge', viewport: { width: 1920, height: 1080 }, trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: true, timeout: 120_000 },
});
