import { expect, test } from '@playwright/test';
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

test('local agent edits through real compiler, exports changed geometry and restores its recovery checkpoint', async ({ page, context }) => {
  const csrf = async () => (await (await context.request.get('/api/auth/csrf')).json()).token as string;
  const registered = await context.request.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': await csrf() },
    data: { email: `agent-${Date.now()}@example.test`, password: 'Fixture-Password-2026!', displayName: 'Engineer' } });
  expect(registered.ok()).toBe(true);
  const errors: string[] = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('banner').locator('input[type=file]').setInputFiles('fixtures/author-local/part.firmament');
  await expect(page.locator('.status-ready')).toContainText('Ready');
  const step = async (name: string) => {
    await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
    const event = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
    const download = await event; const path = `artifacts/local/author-e2e/${name}.step`; await download.saveAs(path);
    return readFile(path, 'utf8');
  };
  const before = await step('before');
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  await page.getByText('AI connection settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Test connection', exact: true }).click();
  await expect(page.getByLabel('AI model')).toHaveValue('fixture-model');
  await page.getByLabel('Engineering intent').fill('Increase width to 30mm; keep other dimensions.');
  await page.getByRole('button', { name: 'Run agent', exact: true }).click();
  await expect(page.getByText('Working project updated and built.', { exact: true })).toBeVisible({ timeout: 90_000 });
  await expect(page.locator('.status-ready')).toContainText('Ready');
  const after = await step('after');
  const coordinates = (source: string) => [...source.matchAll(/CARTESIAN_POINT\([^,]*,\(([-+\d.E]+),([-+\d.E]+),([-+\d.E]+)\)\)/gi)]
    .map(match => match.slice(1).map(value => Number(value) || 0));
  const bounds = (source: string) => [0, 1, 2].map(axis => {
    const values = coordinates(source).map(p => p[axis]); return [Math.min(...values), Math.max(...values)];
  });
  expect(bounds(before)).toEqual([[-10, 10], [-7.5, 7.5], [0, 8]]);
  expect(bounds(after)).toEqual([[-15, 15], [-7.5, 7.5], [0, 8]]);
  expect((after.match(/ADVANCED_FACE\(/g) ?? []).length).toBe((before.match(/ADVANCED_FACE\(/g) ?? []).length);
  await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore AI changes applied', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore Before AI task', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore Restored Before AI task', exact: true })).toBeVisible();
  expect(bounds(await step('restored'))).toEqual(bounds(before));
  expect(errors).toEqual([]);
  await page.screenshot({ path: 'artifacts/local/author-e2e/completed.png' });
});

for (const client of ['claude-code', 'claude-desktop', 'antigravity'] as const) test(`${client} native MCP connection builds, checkpoints and cancels through the same host`, async ({ page, context, playwright }) => {
  const token = (await (await context.request.get('/api/auth/csrf')).json()).token;
  const registration = await context.request.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': token }, data: {
    email: `${client}-${Date.now()}@example.test`, password: 'Fixture-Password-2026!', displayName: 'Desktop test' } }); expect(registration.ok()).toBe(true);
  await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('banner').locator('input[type=file]').setInputFiles('fixtures/author-local/part.firmament');
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  await page.getByLabel('AI connection').selectOption(client);
  await expect(page.getByLabel('AI model')).toHaveCount(0);
  await page.getByText('AI connection settings', { exact: true }).click();
  await page.getByRole('button', { name: 'Prepare desktop connection', exact: true }).click();
  await page.getByText('Desktop MCP configuration', { exact: true }).click();
  const config = JSON.parse(await page.locator('.desktop-agent-connection pre').innerText()).mcpServers.helios;
  if (client === 'claude-desktop') expect(config.args).toContain('--helios-desktop-mcp');
  else expect(client === 'claude-code' ? config.type : config.serverUrl).toBe(client === 'claude-code' ? 'http' : 'http://127.0.0.1:4182/api/helios/author/local/mcp');
  const endpoint = config.url ?? config.serverUrl ?? config.args.at(-1);
  const headers = config.headers ?? { Authorization: 'Bearer ' + config.env.HELIOS_DESKTOP_CAPABILITY };
  const native = await playwright.request.newContext({ extraHTTPHeaders: { ...headers, Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' } });
  const child = client === 'claude-desktop' ? spawn(config.command, config.args, { env: { ...process.env, ...config.env }, windowsHide: true, stdio: 'pipe' }) : null;
  const pending = new Map<number, { resolve(value: any): void; reject(reason: unknown): void }>();
  const exited = child ? new Promise<number | null>(resolve => child.once('exit', resolve)) : null;
  if (child) {
    child.stderr.resume();
    createInterface({ input: child.stdout }).on('line', line => {
      const message = JSON.parse(line); const wait = pending.get(message.id);
      if (wait) { pending.delete(message.id); message.error ? wait.reject(new Error('Stdio MCP error')) : wait.resolve(message.result); }
    });
    child.once('exit', () => { for (const wait of pending.values()) wait.reject(new Error('Stdio bridge exited before completing RPC')); });
  }
  let sequence = 0;
  const rpc = async (method: string, params: object) => {
    if (child) return new Promise<any>((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
    const response = await native.post(endpoint, { data: { jsonrpc: '2.0', id: ++sequence, method, params } });
    expect(response.status()).toBe(200);
    const body = await response.text();
    const result = JSON.parse(body.startsWith('{') ? body : body.split('\n').filter(line => line.startsWith('data:')).at(-1)!.slice(5));
    expect(result.error).toBeUndefined(); return result.result;
  };
  try {
    const unauthorized = await context.request.post(endpoint, { data: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} } }); expect(unauthorized.status()).toBe(401);
    const initialized = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: client + '-smoke', version: '1' } });
    expect(initialized.capabilities.tools).toBeDefined();
    child?.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await rpc('tools/list', {}); expect(tools.tools.some((t: { name: string }) => t.name === 'edit_file')).toBe(true);
    expect((await rpc('tools/call', { name: 'read_file', arguments: { path: 'part.firmament' } })).isError).toBe(true);
    await page.getByLabel('Engineering intent').fill('Change width to 30mm; keep the other dimensions.');
    await page.getByRole('button', { name: 'Start desktop task', exact: true }).click();
    await expect(page.getByRole('region', { name: 'AI Author', exact: true })).toContainText('Waiting for');
    expect((await rpc('tools/call', { name: 'task_context', arguments: {} })).content[0].text).toContain('Change width to 30mm');
    expect((await rpc('tools/call', { name: 'finish_task', arguments: { summary: 'Premature' } })).isError).toBe(true);
    expect((await rpc('tools/call', { name: 'read_file', arguments: { path: 'part.firmament' } })).content[0].text).toContain('20mm');
    expect((await rpc('tools/call', { name: 'edit_file', arguments: { path: 'part.firmament', before: '20mm', after: '30mm' } })).isError).toBe(false);
    const built = await rpc('tools/call', { name: 'build', arguments: {} }); expect(JSON.parse(built.content[0].text).result.accepted).toBe(true);
    expect((await rpc('tools/call', { name: 'finish_task', arguments: { summary: 'Width revised and built.' } })).isError).toBe(false);
    await expect(page.getByText('Working project updated and built.', { exact: true })).toBeVisible();
    await expect(page.locator('.view-lines')).toContainText('30mm');
    await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore AI changes applied', exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
    await page.getByLabel('Engineering intent').fill('A task that will be cancelled.');
    await page.getByRole('button', { name: 'Start desktop task', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Stop agent', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Stop agent', exact: true }).click();
    await expect(page.getByRole('region', { name: 'AI Author', exact: true }).getByRole('alert')).toContainText('Cancelled');
    await expect.poll(async () => (await rpc('tools/call', { name: 'read_file', arguments: { path: 'part.firmament' } })).isError).toBe(true);
    await expect(page.locator('.view-lines')).toContainText('30mm');
    await page.getByRole('button', { name: 'Disconnect desktop', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Copy MCP configuration', exact: true })).toHaveCount(0);
    expect((await native.post(endpoint, { data: { jsonrpc: '2.0', id: 99, method: 'tools/list', params: {} } })).status()).toBe(401);
  } finally {
    if (child) { child.stdin.end(); expect(await Promise.race([exited, new Promise(resolve => setTimeout(() => resolve('timeout'), 5000))])).toBe(0); }
    await native.dispose();
  }
});

for (const mode of ['failed', 'hold'] as const) test(`${mode} task preserves working geometry and reaps its agent process`, async ({ page, context }) => {
  const data = resolve('artifacts/local/author-e2e'); const config = resolve(data, 'helios.toml');
  const originalConfig = await readFile(config, 'utf8');
  const peer = resolve(data, mode + '-peer');
  await cp(resolve('../Leviathan/tests/Leviathan.AgentPeer/bin/Release/net10.0'), peer, { recursive: true });
  await writeFile(resolve(peer, mode), '');
  const executable = resolve(peer, 'Leviathan.AgentPeer' + (process.platform === 'win32' ? '.exe' : ''));
  await writeFile(config, `defaultProvider = 'codex'\n[agents.codex]\nexecutable = '${executable.replaceAll('\\', '/')}'\n`);
  try {
    const token = (await (await context.request.get('/api/auth/csrf')).json()).token;
    const registered = await context.request.post('/api/auth/register', { headers: { 'X-CSRF-TOKEN': token }, data: {
      email: `${mode}-${Date.now()}@example.test`, password: 'Fixture-Password-2026!', displayName: 'Engineer' } }); expect(registered.ok()).toBe(true);
    await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
    await page.getByRole('banner').locator('input[type=file]').setInputFiles('fixtures/author-local/part.firmament');
    await expect(page.locator('.status-ready')).toContainText('Ready');
    await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
    await page.getByText('AI connection settings', { exact: true }).click();
    await page.getByRole('button', { name: 'Test connection', exact: true }).click();
    await expect(page.getByLabel('AI model')).toHaveValue('fixture-model');
    // The probe process has already exited. The next PID must belong to the actual task.
    const probePid = await readFile(resolve(peer, 'peer.pid'), 'utf8');
    await page.getByLabel('Engineering intent').fill('Change width.'); await page.getByRole('button', { name: 'Run agent', exact: true }).click();
    await expect.poll(async () => readFile(resolve(peer, 'peer.pid'), 'utf8')).not.toBe(probePid);
    const taskPid = Number(await readFile(resolve(peer, 'peer.pid'), 'utf8'));
    if (mode === 'hold') await page.getByRole('button', { name: 'Stop agent', exact: true }).click();
    await expect(page.getByRole('region', { name: 'AI Author', exact: true }).getByRole('alert')).toContainText(mode === 'hold' ? 'Cancelled' : 'Codex did not complete');
    await expect.poll(() => { try { process.kill(taskPid, 0); return false; } catch { return true; } }).toBe(true);
    await expect(page.locator('.status-ready')).toContainText('Ready');
    await expect(page.locator('.view-lines')).toContainText('20mm');
    await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Restore Before AI task', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore AI changes applied', exact: true })).toHaveCount(0);
  } finally { await writeFile(config, originalConfig); }
});
