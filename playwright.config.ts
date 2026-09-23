import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4173', browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'dotnet run --project ../Leviathan/src/Leviathan.Server/Leviathan.Server.csproj --no-launch-profile --urls http://127.0.0.1:5189',
      url: 'http://127.0.0.1:5189/api/auth/csrf',
      env: { ASPNETCORE_ENVIRONMENT: 'Development', LEVIATHAN_DATA_DIR: resolve('test-results', 'leviathan-data') },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    { command: 'npm run dev -- --host 127.0.0.1', url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 120_000 },
  ],
});
