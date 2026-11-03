import { defineConfig } from '@playwright/test';

if (!process.env.HELIOS_RELEASE_BASE_URL || !process.env.HELIOS_RELEASE_STORAGE_STATE)
  throw new Error('Run this suite through node scripts/qualify-standalone.mjs --usage. It requires an extracted, authenticated production host.');

export default defineConfig({
  testDir: './tests',
  testMatch: ['learning.spec.ts', 'language-experience.spec.ts', 'language-x2.spec.ts',
    'graph-authoring.spec.ts', 'intellidraft.spec.ts', 'gallery.spec.ts', 'solidworks.spec.ts',
    'project-loading.spec.ts', 'field-rewrite-x1.spec.ts', 'branding.spec.ts', 'worker-aot-cache.spec.ts'],
  workers: 1, maxFailures: 3, timeout: 180_000, expect: { timeout: 30_000 },
  outputDir: process.env.HELIOS_RELEASE_RESULTS ?? 'artifacts/local/0.1-qualification/usage-tests',
  reporter: [['list'], ['json', { outputFile: 'artifacts/local/0.1-qualification/usage-results.json' }]],
  use: { baseURL: process.env.HELIOS_RELEASE_BASE_URL, storageState: process.env.HELIOS_RELEASE_STORAGE_STATE,
    browserName: 'chromium', channel: process.env.HELIOS_BROWSER_CHANNEL,
    viewport: { width: 1600, height: 1100 }, trace: 'retain-on-failure' },
});
