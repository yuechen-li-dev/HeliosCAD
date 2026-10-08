import { expect, test } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('Aetheris language intelligence drives Monaco at 1440p', async ({ page }) => {
  await page.setViewportSize({ width: 2560, height: 1440 });
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.monaco-editor')).toHaveAttribute('data-uri', /\.firmament$/);
  await replaceEditorSource(page, 'Model M {\n Units: mm\n Thr');
  await page.keyboard.press('ControlOrMeta+Space');
  await expect(page.locator('.suggest-widget')).toContainText('Thread');
  await page.keyboard.press('Escape');

  await replaceEditorSource(page, 'Model M {\n Units: mm\n Thread T {\n Maj');
  await page.keyboard.press('ControlOrMeta+Space');
  await expect(page.locator('.suggest-widget')).toContainText('MajorDiameter');
  await page.keyboard.press('Escape');

  await replaceEditorSource(page, 'Model M {\n Units: mm\n Thread T {\n Wrong: 1mm\n }\n Box Body { Size: [8mm, 8mm, 8mm] }\n}');
  await page.getByRole('tab', { name: /Problems/ }).click();
  await expect(page.locator('.dock-errors')).toContainText('thread field invalid', { timeout: 30_000 });
  await page.locator('.dock-errors button').first().click();
  await expect(page.getByRole('textbox', { name: 'Editor content' })).toBeFocused();

  const ugly = 'Model M {\n Units: mm\n // keep this comment\n Box Body { Size: [10mm, 8mm, 4mm] }\n}\n';
  await replaceEditorSource(page, ugly);
  await expect(page.locator('.dock-errors')).toContainText('No language or build diagnostics.');
  const format = async () => { await page.getByRole('button', { name: /Command Palette/ }).click(); await page.getByRole('dialog', { name: 'Command palette' }).getByRole('button', { name: /Format Document/ }).click(); };
  await format();
  await expect(page.locator('.view-lines')).toContainText('keep this comment');
  const once = await page.locator('.view-lines').innerText();
  await format();
  const twice = await page.locator('.view-lines').innerText();
  expect(twice).toBe(once);
  const boxLine = await page.locator('.view-line', { hasText: 'Box Body' }).boundingBox();
  if (!boxLine) throw new Error('Formatted Box line is not visible');
  await page.mouse.move(boxLine.x + 25, boxLine.y + boxLine.height / 2);
  await expect(page.locator('.monaco-hover:not(.hidden)').first()).toContainText('Box');
  await expect.poll(async () => page.locator('.view-lines span[class^="mtk"]').evaluateAll(elements =>
    new Set(elements.map(element => element.className)).size)).toBeGreaterThan(2);
  const measures = await page.evaluate(() => Object.fromEntries(
    ['helios-lx-complete', 'helios-lx-analyze', 'helios-lx-hover', 'helios-lx-format'].map(name =>
      [name, performance.getEntriesByName(name).map(entry => Math.round(entry.duration))])));
  console.log('Language latency (ms):', JSON.stringify(measures));
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('1 DEFS');
  await page.getByRole('tab', { name: 'Terminal · local' }).click();
  await page.screenshot({ path: 'artifacts/local/p4-03/HELIOS-LANGUAGE-X2-2560x1440.png', fullPage: true });
});
