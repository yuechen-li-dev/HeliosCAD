import { expect, test } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('1440p local IDE shell keeps edit, build, last valid model, terminal, and STEP export working', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.viewport-canvas canvas')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Inspector' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Terminal · local' })).toBeVisible();
  const bounds = await page.evaluate(() => {
    const rect = (selector: string) => { const r = document.querySelector(selector)!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    return { editor: rect('.source-panel'), viewport: rect('.viewport-pane'), utility: rect('.utility-dock'), bottom: rect('.bottom-dock') };
  });
  expect(bounds.editor.width).toBeGreaterThan(500);
  expect(bounds.viewport.width).toBeGreaterThan(500);
  expect(bounds.editor.x).toBeLessThan(bounds.viewport.x);
  expect(bounds.viewport.x).toBeLessThan(bounds.utility.x);
  expect(bounds.bottom.y).toBeGreaterThan(bounds.editor.y);
  await page.getByRole('tab', { name: 'Terminal · local' }).click();
  await page.getByLabel('Terminal command').fill('Write-Output HELIOS_TERMINAL_OK');
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByLabel('Terminal output')).toContainText('HELIOS_TERMINAL_OK');
  await page.getByRole('tab', { name: 'Files' }).click();
  await expect(page.getByRole('region', { name: 'Project explorer' })).toContainText('editable-bracket.firmament');
  await page.getByRole('tab', { name: 'Inspector' }).click();
  await page.screenshot({ path: 'artifacts/local/p4-03/HELIOS-MVP-UX-X0-2560x1440.png', fullPage: true });

  await replaceEditorSource(page, 'Model ShellWitness { Units: mm Box Body { Size: [24mm, 18mm, 8mm] } }');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('1 DEFS');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export STEP', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('editable-bracket.step');
  await expect(page.locator('.statusbar')).toContainText('STEP DOWNLOAD STARTED');

  await replaceEditorSource(page, 'Model Broken { Box Body { Size: [24mm, 18mm, 8mm] }');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('MODEL OUT OF DATE', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('1 DEFS');
  await page.getByRole('tab', { name: /Problems/ }).click();
  await expect(page.locator('.dock-errors button').first()).toBeVisible();
});
