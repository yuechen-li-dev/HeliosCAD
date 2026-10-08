import { readFile } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('project root builds included definitions, preserves module edits and diagnoses missing resources', async ({ page }) => {
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('READY');
  // The existing browser-local file input carries explicit documents to the SDK.
  await page.locator('input[type=file]').setInputFiles(['fixtures/project-loading/root.firmasm', 'fixtures/project-loading/block.firmament']);
  await expect(page.locator('.status-ready')).toContainText('READY');
  // The display snapshot includes the assembly root plus two shared instances.
  await expect(page.locator('.statusbar')).toContainText('1 DEFS · 3 OCC');
  await page.getByRole('tab', { name: 'Files', exact: true }).click();
  await page.getByRole('button', { name: 'block.firmament', exact: true }).click();
  const source = await readFile('fixtures/project-loading/block.firmament', 'utf8');
  await replaceEditorSource(page, source.replace('4mm', '6mm'));
  await page.getByRole('button', { name: 'root.firmasm', exact: true }).click();
  await page.getByRole('button', { name: 'block.firmament', exact: true }).click();
  await expect(page.locator('.view-lines')).toContainText('6mm');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('READY');
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.getByRole('tab', { name: 'Problems', exact: true }).click();
  await expect(page.locator('.dock-errors .error')).toHaveCount(0);
  await page.getByRole('button', { name: 'root.firmasm', exact: true }).click();
  const root = await readFile('fixtures/project-loading/root.firmasm', 'utf8');
  await replaceEditorSource(page, root.replace('block.firmament', 'missing.firmament'));
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.dock-errors')).toContainText('assembly-include-file-not-found');
  await expect(page.locator('.statusbar')).toContainText('MODEL OUT OF DATE');
  await expect(page.locator('.statusbar')).toContainText('1 DEFS · 3 OCC');
});
