import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { unzipSync } from 'fflate';
import { chromium, expect } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const archive = resolve(process.argv[2] ?? JSON.parse(await readFile(join(root, 'artifacts/local/standalone/latest.json'))).archive);
const working = join(root, 'artifacts/local/standalone', `Extracted smoke ${Date.now()}`);
const extracted = join(working, 'Extracted package'); await mkdir(extracted, { recursive: true });
if (archive.endsWith('.zip')) {
  for (const [name, bytes] of Object.entries(unzipSync(await readFile(archive)))) {
    const path = resolve(extracted, name); assert.ok(path.startsWith(extracted + '/').valueOf() || path.startsWith(extracted + '\\'));
    if (name.endsWith('/')) { await mkdir(path, { recursive: true }); continue; }
    await mkdir(resolve(path, '..'), { recursive: true }); await writeFile(path, bytes);
  }
} else assert.equal(spawnSync('tar', ['-xzf', archive, '-C', extracted]).status, 0);
const bundle = join(extracted, (await readdir(extracted)).find(name => name.startsWith('Helios-')));
const manifest = JSON.parse(await readFile(join(bundle, 'helios-bundle.json')));
for (const file of JSON.parse(await readFile(join(bundle, 'FILES.json')))) {
  const bytes = await readFile(join(bundle, file.name)); assert.equal(bytes.length, file.size);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
}
const executable = join(bundle, process.platform === 'win32' ? 'Helios.exe' : 'Helios');
const data = join(working, 'User data');
const port = Number(process.env.HELIOS_QUALIFY_PORT ?? 4287), address = `http://127.0.0.1:${port}`;
let child, browser, browserPage;
let output = '';
function launch() {
  child = spawn(executable, ['--no-browser', '--port', String(port), '--data-dir', data], {
    cwd: working, windowsHide: true,
    env: { ...process.env, PATH: process.platform === 'win32' ? `${process.env.SystemRoot}\\System32` : '/usr/bin:/bin',
      DOTNET_ROOT: join(working, 'no-dotnet-install'), DOTNET_MULTILEVEL_LOOKUP: '0',
      HELIOS_CONFIG_FILE: join(working, 'no-credentials.toml'), ASPNETCORE_ENVIRONMENT: 'Production' }
  });
  child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
  return child;
}
async function waitReady() {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error(`Launcher exited ${child.exitCode}: ${output}`);
    try {
      const session = JSON.parse(await readFile(join(data, 'running.json')));
      if ((await fetch(address + '/health/ready')).ok) return session;
    } catch {}
    await delay(500);
  }
  throw Error(`Host readiness timed out: ${output}`);
}
async function exited(process) {
  for (let i = 0; i < 100; i++) { if (process.exitCode !== null) return process.exitCode; await delay(100); }
  throw Error('Host did not terminate after Quit');
}
async function stop(cookie) {
  // CSRF cookie accompanies the request token and authentication cookie.
  const tokenResponse = await fetch(address + '/api/auth/csrf', { headers: { Cookie: cookie } });
  const token = (await tokenResponse.json()).token;
  const csrfCookie = tokenResponse.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const response = await fetch(address + '/__helios/stop', { method: 'POST', headers: { Cookie: cookie + '; ' + csrfCookie, 'X-CSRF-TOKEN': token } });
  assert.equal(response.status, 204); assert.equal(await exited(child), 0);
}
try {
  launch(); let session = await waitReady();
  assert.equal((await fetch(address + '/api/auth/me')).status, 401);
  assert.equal((await fetch(address + '/api/helios/author/status')).status, 401);
  assert.equal((await fetch(address + '/__helios/status', { headers: { Origin: 'https://untrusted.example' } })).status, 403);
  assert.equal((await fetch(address + '/__helios/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"token":"wrong"}' })).status, 401);
  const login = await fetch(address + '/__helios/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: session.Token }) });
  assert.equal(login.status, 204);
  let cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const user = await (await fetch(address + '/api/auth/me', { headers: { Cookie: cookie } })).json(); assert.equal(user.displayName, 'Local engineer');
  assert.equal((await fetch(address + '/api/auth/register', { method: 'POST' })).status, 403);
  assert.equal((await fetch(address + '/__helios/stop', { method: 'POST', headers: { Cookie: cookie } })).status, 400);
  assert.equal((await fetch(address + '/aetheris-runtime/not-present.wasm')).status, 404);
  assert.equal((await fetch(address + '/api/not-present', { headers: { Cookie: cookie } })).status, 404);
  const duplicate = spawn(executable, ['--no-browser', '--port', String(port), '--data-dir', data], { cwd: working, windowsHide: true, stdio: 'ignore' });
  assert.equal(await exited(duplicate), 0);
  console.log('Extracted host: startup, authentication, origin/CSRF guards, single-instance checks passed.');
  // Browser exercises the fragment/bootstrap-cookie path, compiler, viewport and real exports.
  browser = await chromium.launch(process.env.HELIOS_BROWSER_CHANNEL ? { channel: process.env.HELIOS_BROWSER_CHANNEL } : {});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = browserPage = await context.newPage(); const errors = []; page.on('pageerror', error => { errors.push(String(error)); console.error('Browser error:', String(error)); });
  page.on('console', message => {
    if (message.type() === 'error') {
      console.error('Browser console:', message.text());
      for (const arg of message.args()) void arg.evaluate(value => value instanceof Error ? ({ message: value.message, details: value.details }) : null).then(value => { if (value) console.error('Error details:', value); }).catch(() => {});
    }
  });
  await page.goto(address + '/__helios/start#' + session.Token);
  await expect(page.getByRole('button', { name: 'New part', exact: false })).toBeVisible();
  assert.equal(new URL(page.url()).hash, '');
  await expect(page.getByRole('button', { name: 'Quit Helios', exact: true })).toBeVisible();
  await page.goto(address + '/local');
  await expect.poll(() => page.locator('.status-ready').innerText(), { timeout: 180_000 }).toMatch(/Ready|Worker failed/);
  assert.match(await page.locator('.status-ready').innerText(), /Ready/);
  await expect(page.locator('.viewport-canvas canvas')).toBeVisible();
  console.log('Production gallery, editor, CAD runtime and viewport loaded.');
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(join(root, 'fixtures/author-local/part.firmament'));
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const download = await downloadEvent; const stepPath = join(working, 'box.step'); await download.saveAs(stepPath);
  const step = await readFile(stepPath, 'utf8');
  const points = [...step.matchAll(/CARTESIAN_POINT\([^,]*,\(([-+\d.E]+),([-+\d.E]+),([-+\d.E]+)\)\)/gi)].map(match => match.slice(1).map(Number));
  assert.deepEqual([0, 1, 2].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]), [[-10, 10], [-7.5, 7.5], [0, 8]]);
  assert.equal((step.match(/ADVANCED_FACE\(/g) ?? []).length, 6);
  console.log('STEP export matches independent nominal bounds and topology.');
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  await page.getByRole('dialog', { name: 'Export formats' }).getByLabel(/GLB|glTF/i).check();
  await page.getByRole('dialog', { name: 'Export formats' }).getByLabel(/PDF/i).check();
  const packageDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: /Download ZIP/ }).click();
  const exportArchive = join(working, 'exports.zip'); await (await packageDownload).saveAs(exportArchive);
  const exports = unzipSync(await readFile(exportArchive));
  const pdf = Object.entries(exports).find(([name]) => name.endsWith('.pdf'));
  const glb = Object.entries(exports).find(([name]) => name.endsWith('.glb'));
  assert.ok(pdf && glb); assert.equal(Buffer.from(pdf[1]).subarray(0, 4).toString(), '%PDF'); assert.equal(Buffer.from(glb[1]).subarray(0, 4).toString(), 'glTF');
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(stepPath);
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(join(root, 'fixtures/author-local/part.firmament'));
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  console.log('GLB/PDF export and STEP reopening passed.');
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  await expect(page.getByLabel('AI connection')).toBeVisible();
  await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
  await page.getByRole('button', { name: 'Save checkpoint', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore Manual checkpoint', exact: true })).toBeVisible();
  await page.screenshot({ path: join(working, 'workspace.png') });
  const apiCsrf = await context.request.get(address + '/api/auth/csrf'); const csrfToken = (await apiCsrf.json()).token;
  const project = await context.request.post(address + '/api/projects', { headers: { 'X-CSRF-TOKEN': csrfToken }, data: { appId: 'helios', name: 'Packaged restart witness', source: await readFile(join(root, 'fixtures/author-local/part.firmament'), 'utf8') } });
  assert.equal(project.status(), 201);
  const projectId = (await project.json()).id;
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Quit Helios', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Helios stopped', exact: true })).toBeVisible();
  assert.equal(await exited(child), 0);
  await assert.rejects(() => fetch(address + '/health/live'));
  launch(); session = await waitReady();
  await page.goto(address + '/__helios/start#' + session.Token);
  await expect(page.getByRole('button', { name: 'New part', exact: false })).toBeVisible();
  const projects = await context.request.get(address + '/api/projects'); assert.ok((await projects.json()).some(project => project.id === projectId));
  await page.goto(address + '/local'); await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Version Control', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore Manual checkpoint', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Restore Manual checkpoint', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restore Restored Manual checkpoint', exact: true })).toBeVisible();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  assert.deepEqual(errors, []);
  const cookies = await context.cookies(); cookie = cookies.map(value => `${value.name}=${value.value}`).join('; ');
  await stop(cookie);
  const log = await readFile(join(data, 'logs/helios.log'), 'utf8'); assert.ok(!log.includes(session.Token));
  await writeFile(join(working, 'QUALIFICATION.json'), JSON.stringify({ verdict: 'passed', archive: basename(archive), manifest,
    browser: browser.version(), checks: ['inventory', 'self-contained startup', 'authentication and CSRF', 'loopback origin guard', 'single host', 'production WASM build', 'STEP bounds/topology/reopening', 'GLB/PDF export', 'local projects restart', 'browser checkpoint restart/restore', 'AI settings', 'Quit and process exit'], errors }, null, 2));
  await writeFile(join(root, 'artifacts/local/standalone/qualified.json'), JSON.stringify({ working, archive }, null, 2));
  console.log(`Standalone qualification passed: ${working}`);
} finally {
  if (browserPage && !browserPage.isClosed()) {
    await browserPage.screenshot({ path: join(working, 'last-page.png') }).catch(() => {});
    await writeFile(join(working, 'last-page.txt'), await browserPage.locator('body').innerText().catch(() => 'Page unavailable'));
  }
  await browser?.close();
  if (child && child.exitCode === null) { child.kill(); await exited(child).catch(() => {}); }
  await writeFile(join(working, 'host-output.log'), output);
}
