import { defineConfig } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const data = resolve('artifacts/local/author-e2e');
mkdirSync(data, { recursive: true });
const executable = resolve('../Leviathan/tests/Leviathan.AgentPeer/bin/Release/net10.0/Leviathan.AgentPeer' + (process.platform === 'win32' ? '.exe' : ''));
const config = resolve(data, 'helios.toml');
const server = process.env.HELIOS_AUTHOR_TEST_SERVER ?? resolve('../Leviathan/src/Leviathan.Server/bin/Release/net10.0/Leviathan.Server.dll');
writeFileSync(config, `defaultProvider = 'codex'\n[agents.codex]\nexecutable = '${executable.replaceAll('\\', '/')}'\n`);

export default defineConfig({
  testDir: './tests', testMatch: 'author-local.spec.ts', workers: 1, timeout: 120_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:4182', browserName: 'chromium', channel: 'chrome', viewport: { width: 1920, height: 1080 }, trace: 'retain-on-failure' },
  webServer: [
    { command: `dotnet "${server}" --urls http://127.0.0.1:5198`,
      url: 'http://127.0.0.1:5198/health/live', reuseExistingServer: false,
      env: { ASPNETCORE_ENVIRONMENT: 'Development', LEVIATHAN_DATA_DIR: resolve(data, 'data'), HELIOS_LOCAL_AI: 'true', HELIOS_CONFIG_FILE: config, LEVIATHAN_ALLOW_UNSAFE_ADMIN: 'false' } },
    { command: 'npm run dev -- --host 127.0.0.1 --port 4182', url: 'http://127.0.0.1:4182', reuseExistingServer: false, env: { HELIOS_API_URL: 'http://127.0.0.1:5198' } },
  ],
});
