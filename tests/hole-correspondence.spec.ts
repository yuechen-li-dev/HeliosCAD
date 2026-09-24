import { test, expect } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('through-hole wall selector copies into a valid PMI use site', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'My Projects' }).click();
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Hole Witness');
  await page.getByLabel('Email').fill(`hole-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('Correct-Helios-Password-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Project name').fill('Hole correspondence');
  await page.getByRole('button', { name: 'Create project' }).click();
  const editor = page.locator('.monaco-editor');
  await expect(editor).toBeVisible();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await replaceEditorSource(page, 'Model HoleWitness {\n Units: mm\n Box Body { Size: [40mm, 30mm, 8mm] }\n Modify Body { Hole<Shaft> H { On: +Z Center: Point2(0mm, 0mm) Diameter: 8mm End: ThroughAll } }\n}\n');
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  const canvas = page.locator('.viewport-canvas canvas');
  let wallPicked = false;
  for (const [x, y] of [[382, 132], [380, 135], [385, 134], [382, 138], [377, 133], [389, 133]]) {
    await canvas.click({ position: { x, y } });
    if ((await page.locator('.inspector').textContent())?.includes('material:hole:Body.H:wall')) { wallPicked = true; break; }
  }
  expect(wallPicked).toBe(true);
  await expect(page.locator('.entity-hero')).toContainText('Hole');
  await expect(page.locator('.inspector')).toContainText('SEMANTIC FIELDS');
  await expect(page.locator('.inspector')).toContainText('Diameter');
  await expect(page.locator('.inspector')).toContainText('SEMANTIC OUTPUTS');
  await expect(page.locator('.identity-list').first()).toContainText('Body.H');
  await expect(page.locator('.inspector')).toContainText('hole:Body.H');
  await expect(page.locator('.inspector')).toContainText('face(H.Wall)');
  await expect(page.getByRole('button', { name: 'Reference Face in Source' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Copy Selector' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('face(H.Wall)');
  await page.locator('.inspector-actions').getByRole('button', { name: 'Go to Source' }).click();
  await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeFocused();
  await page.locator('.view-line').filter({ hasText: 'Hole<Shaft> H' }).click();
  await expect(page.locator('.status-selection')).toHaveText('H');
  await replaceEditorSource(page, 'Model HoleWitness {\n Units: mm\n Box Body { Size: [40mm, 30mm, 8mm] }\n Modify Body { Hole<Shaft> H { On: +Z Center: Point2(0mm, 0mm) Diameter: 10mm End: ThroughAll } }\n}\n');
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.getByRole('button', { name: 'ISO', exact: true }).click();
  wallPicked = false;
  for (const [x, y] of [[382, 132], [380, 135], [385, 134], [382, 138], [377, 133], [389, 133]]) {
    await canvas.click({ position: { x, y } });
    if ((await page.locator('.inspector').textContent())?.includes('material:hole:Body.H:wall')) { wallPicked = true; break; }
  }
  expect(wallPicked).toBe(true);
  await page.getByRole('button', { name: 'Copy Selector' }).click();
  const selector = await page.evaluate(() => navigator.clipboard.readText());
  await page.getByRole('button', { name: 'Reference Hole Wall in Source' }).click();
  await expect(page.locator('.view-lines')).toContainText('HoleDiameter SelectedWall1 { Target: face(H.Wall) Value: 10mm }');
  await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeFocused();
  await page.keyboard.press('ControlOrMeta+V');
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
});
