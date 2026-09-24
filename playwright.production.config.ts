import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4174', browserName: 'chromium', channel: 'chrome', trace: 'retain-on-failure' },
  webServer: [
    {
      command: 'dotnet run --project ../Leviathan/src/Leviathan.Server/Leviathan.Server.csproj --no-launch-profile --urls http://127.0.0.1:5189',
      url: 'http://127.0.0.1:5189/api/auth/csrf',
      env: { ASPNETCORE_ENVIRONMENT: 'Development', LEVIATHAN_DATA_DIR: resolve('test-results', 'leviathan-production-data') },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    { command: 'npm run preview -- --host 127.0.0.1 --port 4174', url: 'http://127.0.0.1:4174', reuseExistingServer: false, timeout: 120_000 },
  ],
});
