import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { pickNearCenter } from './editor';

const output = 'artifacts/local/label';

async function openPart(page: Page) {
  await mkdir(output, { recursive: true });
  const files: Record<string, Uint8Array> = { 'helios-workspace.json': Buffer.from(JSON.stringify({ schema: 'helios/workspace/1', root: 'part.firmament' })) };
  for (const name of ['part.step', 'part.firmament']) files[name] = await readFile(`fixtures/solidworks/${name}`);
  await writeFile(`${output}/part.helios.zip`, zipSync(files));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(`${output}/part.helios.zip`);
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Label', exact: true }).click();
}

/** Pick the washer's bore, which SolidWorks exported as two half-cylinders, and name it as one hole. */
async function recognizeBore(page: Page, name = 'Bore') {
  const form = page.getByRole('form', { name: 'Add Recognize', exact: true });
  expect(await pickNearCenter(page, async () => form.isVisible(), 120, 6)).toBe(true);
  await expect(page.getByRole('radio', { name: 'Recognize hole (2 faces)', exact: true })).toBeChecked();
  await form.getByLabel('Name', { exact: true }).fill(name);
  await expect(form.getByLabel('Source to write', { exact: true })).toHaveText(new RegExp(`^Region ${name} \\{ kind: HoleShaft stepFaceEntities: \\["#\\d+", "#\\d+"\\] \\}$`));
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByLabel('PMI records', { exact: true })).toContainText(name);
}

test('a hole and a datum face offer axis perpendicularity; the datum picker admits only declared datums', async ({ page }) => {
  await openPart(page);
  const canvas = page.locator('.viewport-canvas canvas'), box = (await canvas.boundingBox())!;
  // The top face of the washer, above the bore.
  const top = { x: box.width / 2, y: box.height / 2 - 100 };
  await canvas.click({ position: top, modifiers: ['Alt'] });
  const datumForm = page.getByRole('form', { name: 'Add Datum', exact: true });
  await expect(datumForm).toBeVisible();
  await datumForm.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByLabel('PMI records', { exact: true })).toContainText('A');
  // A second datum on the same face is refused with the reason.
  await expect(page.getByRole('radio', { name: /this face is A/ })).toBeDisabled();

  // The bore, then Ctrl-click the datum face: one hole, one plane.
  await recognizeBore(page);
  // The selection stays on the hole, now labeled by its name.
  await expect(page.getByRole('radio', { name: 'Diameter Ø10.000', exact: true })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Recognize/ })).toHaveCount(0);
  await expect(page.locator('.selection-measure')).toContainText('Ø');
  // Alt picks the face even next to an edge.
  await canvas.click({ position: top, modifiers: ['Control', 'Alt'] });
  await expect(page.locator('.selection-chip')).toHaveCount(2);
  const radio = page.getByRole('radio', { name: 'Axis perpendicularity to A', exact: true });
  await expect(radio).toBeEnabled(); await expect(radio).toBeChecked();
  const form = page.getByRole('form', { name: 'Add Perpendicularity', exact: true });
  await expect(form.getByLabel('Primary datum', { exact: true })).toHaveValue('A');
  await expect(form.getByLabel('Primary datum', { exact: true }).locator('option')).toHaveText(['Choose…', 'A']);
  await form.getByLabel('Tolerance Ø (mm)', { exact: true }).fill('0.05');
  await expect(form.getByLabel('Source to write', { exact: true })).toContainText('target: part.region("Bore") tolerance: 0.05mm zone: Cylindrical datumRefs: [A]');
  await form.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.authoring-preview-banner')).toBeVisible();
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByLabel('PMI records', { exact: true })).toContainText('AxisPerpendicularity');
  await page.screenshot({ path: `${output}/label-axis-perpendicularity.png` });
  // Esc clears the selection; with nothing selected the part offers a note.
  await page.locator('body').press('Escape');
  await expect(page.locator('.selection-chip')).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Note', exact: true })).toBeChecked();
});

test('an out-of-band nominal warns and needs a second click', async ({ page }) => {
  await openPart(page);
  await recognizeBore(page);
  const form = page.getByRole('form', { name: 'Add HoleDiameter', exact: true });
  await form.getByLabel('Nominal (mm)', { exact: true }).fill('9.5');
  await form.getByLabel('Fit', { exact: true }).selectOption('H7');
  await expect(form.getByLabel('Upper + (mm)', { exact: true })).toHaveValue('0.015');
  await expect(form.getByRole('alert')).toContainText('does not meet its own requirement');
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(form.getByRole('button', { name: 'Apply anyway', exact: true })).toBeVisible();
});

test('the face opposite a datum plane takes its thickness, measured and rounded', async ({ page }) => {
  await openPart(page);
  const canvas = page.locator('.viewport-canvas canvas'), box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 - 100 }, modifiers: ['Alt'] });
  await page.getByRole('form', { name: 'Add Datum', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  // Orbit below the part and pick its bottom face.
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy + 150); await page.mouse.down(); await page.mouse.move(cx, cy - 250, { steps: 16 }); await page.mouse.up();
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 + 100 }, modifiers: ['Alt'] });
  const radio = page.getByRole('radio', { name: /^Distance from A 9\.000$/ });
  await radio.check();
  const form = page.getByRole('form', { name: 'Add Distance', exact: true });
  await expect(form.getByLabel('Nominal (mm)', { exact: true })).toHaveValue('9');
  await form.getByLabel('Name', { exact: true }).fill('Thickness');
  await form.getByLabel('Upper + (mm)', { exact: true }).fill('0.1');
  await form.getByLabel('Lower − (mm)', { exact: true }).fill('0.1');
  await expect(form.getByLabel('Source to write', { exact: true })).toHaveText(/^Distance Thickness \{ between: \[part\.face\("#\d+"\), part\.face\("#\d+"\)\] value: 9mm tolerance: PlusMinus\(0\.1mm, 0\.1mm\) \}$/);
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByLabel('PMI records', { exact: true })).toContainText('Thickness');
  await expect(page.getByLabel('PMI annotations', { exact: true })).toContainText('Thickness');
  // The same pair now refuses a second distance.
  await expect(page.getByRole('radio', { name: /^Distance from A/ })).toBeDisabled();
  await page.screenshot({ path: `${output}/label-thickness.png` });
});
