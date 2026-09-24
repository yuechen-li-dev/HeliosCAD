import { test, expect } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('Hole Diameter Inspector edit rewrites Monaco source and rebuilds the wall', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Field rewrite witness');
  await page.getByLabel('Email').fill(`field-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('Correct-Helios-Password-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.getByLabel('Project name').fill('Field rewrite');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await replaceEditorSource(page, `Model Witness {
  Units: mm
  Box Body { Size: [30mm, 20mm, 10mm] }
  Modify Body { Hole<Shaft> H { On: +Z Center: Point2(0mm, 0mm) Diameter: 10mm /* keep */ End: ThroughAll } }
}
`);
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.locator('.view-line').filter({ hasText: 'Hole<Shaft> H' }).click();
  await expect(page.locator('.inspector')).toContainText('Diameter');
  await expect(page.locator('.inspector')).toContainText('10 mm');
  await expect(page.locator('.inspector')).toContainText('Authored');
  await page.getByRole('textbox', { name: 'Edit Diameter' }).fill('12');
  await page.locator('.inspector').getByRole('button', { name: 'Apply' }).first().click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.view-lines')).toContainText('Diameter: 12mm /* keep */');
  await expect(page.locator('.inspector')).toContainText('12 mm');
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await expect(page.locator('.cloud-save-state')).toContainText('Unsaved');
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+Z');
  await expect(page.locator('.view-lines')).toContainText('Diameter: 10mm /* keep */');
  await page.keyboard.press('ControlOrMeta+Y');
  await expect(page.locator('.view-lines')).toContainText('Diameter: 12mm /* keep */');
  await page.locator('.cloud-editor-actions .cloud-save').click();
  await expect(page.locator('.cloud-save-state')).toHaveText('Saved');
  await page.getByRole('button', { name: 'Projects' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.getByRole('button', { name: /Field rewrite/ }).first().click();
  await expect(page.locator('.view-lines')).toContainText('Diameter: 12mm /* keep */');
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  const canvas = page.locator('.viewport-canvas canvas');
  let wallPicked = false;
  for (const [x, y] of [[382, 132], [380, 135], [385, 134], [382, 138], [377, 133], [389, 133]]) {
    await canvas.click({ position: { x, y } });
    if ((await page.locator('.inspector').textContent())?.includes('face(H.Wall)')) { wallPicked = true; break; }
  }
  expect(wallPicked).toBe(true);
  await page.getByRole('button', { name: 'Reference Hole Wall in Source' }).click();
  await expect(page.locator('.view-lines')).toContainText('Target: face(H.Wall) Value: 12mm');
});
