import { test, expect } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const cli = resolve('../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
test.beforeEach(async () => { await mkdir('artifacts/local/gallery', { recursive: true }); });

test('sections scroll independently and search matches models or groups', async ({ page }) => {
  await page.goto('/');
  const basic = page.getByRole('group', { name: 'Basic models', exact: true });
  const advanced = page.getByRole('group', { name: 'Advanced models', exact: true });
  await expect(basic.getByRole('button')).toHaveCount(2); await expect(advanced.getByRole('button')).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Previous Advanced models', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Next Advanced models', exact: true }).click();
  await expect.poll(() => advanced.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  expect(await basic.evaluate(element => element.scrollLeft)).toBe(0);
  await advanced.press('End'); await expect(advanced.getByRole('button', { name: 'Open CODEX threaded bolt', exact: true })).toBeInViewport();
  await advanced.press('Home'); await expect.poll(() => advanced.evaluate(element => element.scrollLeft)).toBe(0);
  await page.getByLabel('Search examples', { exact: true }).fill('paperclip');
  await expect(basic.getByRole('button')).toHaveCount(1); await expect(advanced).toHaveCount(0);
  await page.getByLabel('Search examples', { exact: true }).fill('Advanced');
  await expect(advanced.getByRole('button')).toHaveCount(5); await expect(basic).toHaveCount(0);
  await page.getByLabel('Search examples', { exact: true }).fill('');
  await page.getByRole('region', { name: 'Example gallery', exact: true }).screenshot({ path: 'artifacts/local/gallery/sections-light.png' });
  await page.getByRole('button', { name: 'Use dark theme', exact: true }).click();
  await expect(basic.getByRole('button', { name: 'Open Simple bracket', exact: true })).toHaveCSS('background-color', 'rgb(12, 16, 14)');
  await expect(basic.getByRole('button', { name: 'Open Simple bracket', exact: true })).toHaveCSS('color', 'rgb(240, 234, 219)');
  await page.getByRole('region', { name: 'Example gallery', exact: true }).screenshot({ path: 'artifacts/local/gallery/sections-dark.png' });
});

test('personal groups persist, rename, remove and undo through the UI', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '+ New group', exact: true }).click();
  await page.getByLabel('Group name', { exact: true }).fill('My workshop');
  await page.getByLabel('Simple bracket', { exact: true }).check(); await page.getByLabel('Paperclip', { exact: true }).check();
  await page.getByRole('button', { name: 'Save group', exact: true }).click();
  await expect(page.getByRole('group', { name: 'My workshop models', exact: true })).toBeFocused();
  await page.reload();
  await expect(page.getByRole('group', { name: 'My workshop models', exact: true }).getByRole('button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Edit My workshop group', exact: true }).click();
  await page.getByLabel('Group name', { exact: true }).fill('Bench parts');
  await page.getByRole('button', { name: 'Save group', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Bench parts group', exact: true }).click();
  await page.getByRole('button', { name: 'Remove group', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Bench parts models', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo remove group', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Bench parts models', exact: true })).toBeFocused();
  await page.getByLabel('Search examples', { exact: true }).fill('Bench parts');
  await expect(page.getByRole('button', { name: 'Open Paperclip', exact: true })).toHaveCount(1);
  await page.getByRole('button', { name: 'Open Paperclip', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Open an example', exact: true });
  await expect(dialog.getByRole('group', { name: 'Bench parts models', exact: true })).toBeVisible();
  await dialog.screenshot({ path: 'artifacts/local/gallery/personal-group-dialog.png' });
});

test('mobile rows scroll without overflowing the page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto('/');
  const basic = page.getByRole('group', { name: 'Basic models', exact: true });
  await page.getByRole('button', { name: 'Next Basic models', exact: true }).click();
  await expect.poll(() => basic.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(basic.getByRole('button', { name: 'Open Paperclip', exact: true })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({ path: 'artifacts/local/gallery/mobile.png' });
});

for (const [name, id] of [['Simple bracket', 'basic-bracket'], ['Paperclip', 'paperclip']]) test(`Basic ${name} opens and exports an enclosed STEP body`, async ({ page }) => {
  await page.goto('/');
  await page.getByRole('group', { name: 'Basic models', exact: true }).getByRole('button', { name: `Open ${name}`, exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.screenshot({ path: `artifacts/local/gallery/${id}-workspace.png` });
  const saved = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save source', exact: true }).click();
  const sourcePath = `artifacts/local/gallery/${id}.firmament`; await (await saved).saveAs(sourcePath);
  expect(await readFile(sourcePath, 'utf8')).toContain(id === 'paperclip' ? 'WireForm Paperclip' : 'Model SimpleBracket');
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const stepPath = `artifacts/local/gallery/${id}.step`; await (await download).saveAs(stepPath);
  const result = JSON.parse(execFileSync('dotnet', [cli, 'analyze', resolve(stepPath), '--json'], { encoding: 'utf8' }));
  expect(result.summary.structuralAssessment).toBe('enclosed-manifold'); expect(result.summary.bodyCount).toBe(1);
});
