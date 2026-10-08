import { test, expect } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { replaceEditorSource } from './editor';

const evidence = 'artifacts/local/p4-03';
test.beforeAll(async () => { await mkdir(evidence, { recursive: true }); });
test('first sixty seconds, real build, selection, resize, diagnostics, recovery and STEP download', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)));
  const started = Date.now();
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Open Mounting plate' })).toBeVisible();
  await expect.poll(() => page.locator('.showcase-image img').evaluateAll(images => images.length === 5 && images.every(image => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await page.screenshot({ path: `${evidence}/first-launch.png` });
  await page.getByRole('button', { name: 'Open Mounting plate' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY');
  await expect(page.locator('[data-display-host="three-telos"] canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Dismiss workflow hint' }).click();
  await page.getByRole('button', { name: 'Examples', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Open an example' })).toBeVisible();
  await page.screenshot({ path: `${evidence}/gallery.png` });
  await page.getByRole('button', { name: 'Close examples', exact: true }).click();
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('READY');
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  const displayState = () => page.getByLabel('Engineering WebGPU viewport').evaluate(element => JSON.parse(element.getAttribute('data-telos-display') ?? '{}'));
  await expect.poll(async () => (await displayState()).meshSurfaces).toBeGreaterThan(0);
  const meshFallback = await displayState();
  const firstModelMs = Date.now() - started;
  await page.screenshot({ path: `${evidence}/mechanical.png` });
  await page.getByLabel('Engineering WebGPU viewport').screenshot({ path: `${evidence}/bracket-viewport.png` });
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  const canvas = page.getByLabel('Engineering WebGPU viewport');
  const bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
  await canvas.click({ position: { x: bounds!.width * .4, y: bounds!.height * .5 } });
  await expect(page.getByRole('region', { name: 'Inspector' }).locator('.entity-hero')).toBeVisible();
  await page.screenshot({ path: `${evidence}/selection-inspector.png` });
  const before = await page.locator('.source-panel').boundingBox();
  await page.getByRole('separator', { name: 'Resize source and viewport' }).press('ArrowRight');
  expect((await page.locator('.source-panel').boundingBox())!.width).toBeGreaterThan(before!.width);
  await page.getByRole('separator', { name: 'Resize bottom panel' }).press('ArrowUp');
  await page.getByRole('button', { name: 'Toggle utility dock' }).click();
  await expect(page.getByRole('complementary', { name: 'Utility panel' })).toBeHidden();
  await page.getByRole('button', { name: 'Toggle utility dock' }).click();
  await page.setViewportSize({ width: 1280, height: 800 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(1280);
  await page.screenshot({ path: `${evidence}/narrow-desktop.png` });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await replaceEditorSource(page, 'Model Broken { Box Body { Size: [20mm, 20mm, 8mm] }');
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect(page.locator('.statusbar')).toContainText('MODEL OUT OF DATE');
  await expect(page.locator('.dock-errors button').first()).toBeVisible();
  await expect(page.locator('.statusbar')).toContainText('1 DEFS');
  await page.screenshot({ path: `${evidence}/diagnostics.png` });
  const corrected = 'Model Plate { Units: mm Box Body { Size: [50mm, 40mm, 8mm] } }';
  await replaceEditorSource(page, corrected);
  await page.getByRole('textbox', { name: 'Editor content', exact: true }).press('ControlOrMeta+Enter');
  await expect(page.locator('.status-ready')).toContainText('READY');
  await expect(page.locator('.statusbar')).not.toContainText('MODEL OUT OF DATE');
  await expect.poll(async () => (await displayState()).fields).toBeGreaterThan(0);
  const qualifiedCir = await displayState();
  expect(qualifiedCir.meshSurfaces).toBe(0);
  await writeFile(`${evidence}/display-paths.json`, JSON.stringify({ meshFallback, qualifiedCir }, null, 2));
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export STEP', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('bracket.step');
  await download.saveAs(`${evidence}/bracket.step`);
  const step = await readFile(`${evidence}/bracket.step`, 'utf8');
  expect(step).toContain('ISO-10303-21'); expect(step).toContain('ADVANCED_FACE');
  await page.screenshot({ path: `${evidence}/export.png` });
  await page.getByRole('tab', { name: 'AI Author', exact: true }).click();
  await expect(page.getByText('No model is connected', { exact: false })).toBeVisible();
  await expect(page.getByLabel('AI provider')).toBeDisabled();
  await page.screenshot({ path: `${evidence}/ai-author.png` });
  expect(errors).toEqual([]);
  await writeFile(`${evidence}/first-user.json`, JSON.stringify({ firstModelMs, errors }, null, 2));
});

for (const [title, file, capture] of [['Industrial ATLAS', 'atlas-industrial.firmament', 'robot'], ['Sunburst electric guitar', 'guitar.firmasm', 'guitar'], ['Warm-modern house', 'house.firmament', 'house'], ['CODEX threaded bolt', 'hexbolt-showcase.firmament', 'bolt']] as const) {
  test(`canonical ${title} loads intact source, real geometry and hierarchy`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto('/'); const started = Date.now();
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
    try {
      await expect.poll(async () => {
        const status = await page.locator('.status-ready').innerText();
        return /Building|Initializing/.test(status) ? 'busy' : status;
      }, { timeout: 540_000, intervals: [1000, 2000, 5000] }).not.toBe('busy');
    } finally {
      await page.screenshot({ path: `${evidence}/${capture}-completion.png` });
      await writeFile(`${evidence}/${capture}-completion.json`, JSON.stringify({ milliseconds: Date.now() - started, status: await page.locator('.statusbar').innerText(), problems: (await page.locator('.dock-errors').allTextContents()).join('\n'), errors }, null, 2));
    }
    await expect(page.locator('.status-ready')).toContainText('READY');
    await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
    await expect(page.locator('[data-display-host="three-telos"] canvas')).toBeVisible();
    await expect(page.locator('.source-panel .bottom-tabs')).toContainText(file);
    const dismiss = page.getByRole('button', { name: 'Dismiss workflow hint' }); if (await dismiss.isVisible()) await dismiss.click();
    await page.getByRole('tab', { name: 'Files', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Model browser' }).getByRole('treeitem').first()).toBeVisible();
    if (capture === 'house') {
      const files = page.getByRole('region', { name: 'Project explorer' });
      await files.getByRole('button', { name: 'living.firmament', exact: true }).click();
      await expect(page.locator('.view-lines')).toContainText('components.firmament');
      await files.getByRole('button', { name: 'house.firmament', exact: true }).click();
      const cameras = page.getByLabel('Scene camera');
      await expect(cameras).toHaveValue('Hero');
      expect(await cameras.locator('option').count()).toBeGreaterThan(1);
      const camera = await cameras.locator('option').nth(1).getAttribute('value') ?? await cameras.locator('option').nth(1).textContent();
      await cameras.selectOption(camera!);
      expect(await page.getByRole('button', { name: 'Export STEP', exact: true }).count()).toBe(0);
      const canvas = page.getByLabel('Engineering WebGPU viewport');
      const bounds = await canvas.boundingBox(); expect(bounds).not.toBeNull();
      await page.mouse.move(bounds!.x + bounds!.width * .5, bounds!.y + bounds!.height * .5);
      await page.mouse.down();
      await page.mouse.move(bounds!.x + bounds!.width * .505, bounds!.y + bounds!.height * .5, { steps: 6 });
      await page.mouse.up();
    }
    await page.screenshot({ path: `${evidence}/${capture}.png` });
    await page.getByLabel('Engineering WebGPU viewport').screenshot({ path: `${evidence}/${capture}-viewport.png` });
    const hierarchy = page.getByRole('region', { name: 'Model browser' });
    if (capture === 'house') {
      await hierarchy.getByLabel('Filter model', { exact: true }).fill('coffee');
      await hierarchy.getByRole('treeitem', { name: /coffeeTable/ }).press('Enter');
    } else await hierarchy.getByRole('treeitem').nth(1).press('Enter');
    await page.getByRole('tab', { name: 'Inspector', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Inspector' }).locator('.entity-hero')).toBeVisible();
    await page.screenshot({ path: `${evidence}/${capture}-inspector.png` });
    await writeFile(`${evidence}/${capture}.json`, JSON.stringify({ milliseconds: Date.now() - started, status: await page.locator('.statusbar').innerText(), errors }, null, 2));
    expect(errors).toEqual([]);
  });
}
