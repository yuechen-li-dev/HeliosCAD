import { test, expect } from '@playwright/test';

test('Box top face keeps its source selector through browser picking', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Correspondence Witness');
  await page.getByLabel('Email').fill(`correspondence-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('Correct-Helios-Password-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.getByLabel('Project name').fill('Box correspondence');
  await page.getByRole('button', { name: 'Create project' }).click();
  const editor = page.getByRole('textbox', { name: 'Firmament source' });
  await expect(editor).toBeVisible();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await editor.fill('Model BoxWitness {\n    Units: mm\n    Box Body { Size: [40mm, 30mm, 8mm] }\n}\n');
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.getByRole('button', { name: 'TOP', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('ORTHOGRAPHIC');
  const canvas = page.locator('.viewport-canvas canvas');
  await expect(canvas).toBeVisible();
  await canvas.screenshot({ path: 'test-results/box-top.png' });
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  await expect(page.locator('.inspector')).toContainText('face(+Z)');
  await page.getByRole('button', { name: 'Copy Selector' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('face(+Z)');
  await page.getByRole('button', { name: 'Go to Source' }).click();
  expect(await editor.evaluate((element: HTMLTextAreaElement) => element.value.slice(element.selectionStart, element.selectionEnd))).toContain('Box Body');

  await page.getByRole('button', { name: 'Selection mode' }).click();
  await expect(page.getByRole('button', { name: 'Selection mode' })).toHaveText('PICK EDGE');
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 + 30 } });
  await expect(page.locator('.inspector')).toContainText('Edge ID');
  await expect(page.locator('.inspector')).toContainText('Body.edge(TopFront)');
  await expect(page.locator('.inspector')).toContainText('Firmament has no qualified source selector');
  await expect(page.getByRole('button', { name: 'Copy Selector' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Selection mode' }).click();

  await page.getByRole('button', { name: 'RIGHT', exact: true }).click();
  await page.waitForTimeout(800);
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  await expect(page.locator('.inspector')).toContainText('face(+X)');
  await page.getByRole('button', { name: 'FRONT', exact: true }).click();
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  await expect(page.locator('.inspector')).toContainText('face(-Y)');

  await editor.evaluate((element: HTMLTextAreaElement) => {
    element.focus();
    element.setSelectionRange(element.value.indexOf('Size:'), element.value.indexOf('Size:'));
    element.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }));
  });
  await expect(page.locator('.status-selection')).toHaveText('Box correspondence');

  await editor.fill('Model BoxWitness {\n    Units: mm\n    Box Body { Size: [45mm, 30mm, 8mm] }\n}\n');
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await page.getByRole('button', { name: 'TOP', exact: true }).click();
  await canvas.click({ position: { x: bounds!.width / 2, y: bounds!.height / 2 } });
  await expect(page.locator('.inspector')).toContainText('Body.face(+Z)');
  await expect(page.locator('.inspector')).toContainText('face(+Z)');
  await page.getByRole('button', { name: 'Reference Face in Source' }).click();
  await expect(editor).toHaveValue(/Pmi \{ Datum SelectedFace1 \{ Target: face\(\+Z\) \} \}/);
  await page.getByRole('button', { name: '↻ Rebuild' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
});
