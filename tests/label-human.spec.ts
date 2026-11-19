import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { TelosCamera } from '@aetheris/three-telos';

const evidence = 'artifacts/local/label-human';
const records = (page: Page) => page.getByLabel('PMI records', { exact: true });
const canvas = (page: Page) => page.locator('.viewport-canvas canvas');
const ready = (page: Page) => expect(page.locator('.status-ready')).toHaveText('Ready');

test('an applied note exports from a Box with a localized fillet', async ({ page }) => {
  await page.goto('/local');
  await ready(page);
  await page.getByRole('banner').locator('input[type=file]').setInputFiles({
    name: 'filleted-box.firmament', mimeType: 'text/plain', buffer: Buffer.from(`Model Sample {
      units: mm
      Box stock { Size: [30mm, 20mm, 10mm] }
      Modify stock { EdgeFinish Round { Face: +X Target: SharedEdgePlusZ Kind: Fillet Radius: 1mm } }
    }`),
  });
  await ready(page);
  await page.getByRole('tab', { name: 'Label', exact: true }).click();
  const note = page.getByRole('form', { name: 'Add Note', exact: true });
  await note.getByLabel('Note text', { exact: true }).fill("Deburr the operator's side.");
  await note.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(records(page)).toContainText("Deburr the operator's side.");
  await ready(page);
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const step = await readFile((await (await download).path())!, 'utf8');
  expect(step).toMatch(/PROPERTY_DEFINITION\('note:[^']+',\s*'Deburr the operator''s side\.'/);
  expect(step).toContain('CYLINDRICAL_SURFACE');
});

async function openPlate(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Mounting plate', exact: true }).click();
  await ready(page);
  await page.getByRole('tab', { name: 'Label', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Note', exact: true })).toBeEnabled();
}

// Project a known point from the displayed camera, then exercise the viewport's click path.
async function clickFace(page: Page, point: readonly [number, number, number], additive = false) {
  const viewport = canvas(page);
  await expect(viewport).toBeVisible();
  await expect(viewport).toHaveAttribute('data-surface-inspection', /"camera"/);
  const state = JSON.parse((await viewport.getAttribute('data-surface-inspection'))!).camera;
  const rect = (await viewport.boundingBox())!;
  const camera = new TelosCamera();
  camera.mode = state.mode;
  camera.span = state.span;
  camera.position.fromArray(state.position);
  camera.target.fromArray(state.target);
  camera.up.fromArray(state.up);
  camera.resize(rect.width, rect.height);
  const [x, y] = camera.project(point);
  await viewport.click({ position: { x, y }, modifiers: additive ? ['Shift'] : [] });
}

async function downloadSource(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Save source', exact: true }).click(),
  ]);
  return readFile((await download.path())!, 'utf8');
}

test('a visible face pick can take a datum and a part note, with a preview you can cancel', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await openPlate(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await clickFace(page, [-24, 3, 8]);
  await expect(page.locator('.selection-chip')).toHaveCount(1);
  await expect(page.getByRole('form', { name: 'Add Datum', exact: true })).toBeVisible();
  await page.getByRole('form', { name: 'Add Datum', exact: true }).getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(records(page)).toContainText('A');

  await page.getByRole('radio', { name: 'Note', exact: true }).check();
  const note = page.getByRole('form', { name: 'Add Note', exact: true });
  const text = note.getByLabel('Note text', { exact: true });
  await text.fill('Deburr all edges.');
  await note.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.authoring-preview-banner')).toBeVisible();
  const legend = page.getByLabel('PMI annotations');
  await expect(legend).toContainText('Deburr all edges.');
  await expect.poll(async () => {
    const [tag, box] = await Promise.all([page.locator('.pmi-marker').filter({ hasText: 'Deburr all edges.' }).boundingBox(), legend.boundingBox()]);
    return !!tag && !!box && (tag.x + tag.width <= box.x || tag.x >= box.x + box.width || tag.y + tag.height <= box.y || tag.y >= box.y + box.height);
  }).toBe(true);
  await expect(records(page)).not.toContainText('Deburr all edges.');
  await page.screenshot({ path: `${evidence}/note-preview.png` });
  await note.getByRole('button', { name: 'Cancel preview', exact: true }).click();
  await expect(page.locator('.authoring-preview-banner')).toHaveCount(0);
  await expect(page.getByLabel('PMI annotations')).not.toContainText('Deburr all edges.');
  await expect(text).toHaveValue('Deburr all edges.');
  await expect(page.locator('.selection-chip')).toHaveCount(1);
  await note.getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(page.locator('.authoring-preview-banner')).toBeVisible();
  await note.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(records(page)).toContainText('Deburr all edges.');
  await ready(page);

  await records(page).getByRole('button', { name: 'Edit Note', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit Note', exact: true });
  const editText = edit.getByLabel('Note text', { exact: true });
  await expect(editText).toHaveValue('Deburr all edges.');
  await editText.fill('First line\nSecond line');
  await expect(edit.getByText('Keep the note on one line.', { exact: false })).toBeVisible();
  await expect(edit.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await editText.fill('Mark this side "TOP".');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(records(page)).toContainText('Mark this side "TOP".');
  await ready(page);
  const source = await downloadSource(page);
  expect(source.match(/\bPmi\s*\{/gi)).toHaveLength(1);
  expect(source).toContain(JSON.stringify('Mark this side "TOP".'));
});

test('two intersecting planes explain distance refusal and can take an orientation tolerance', async ({ page }) => {
  await mkdir(evidence, { recursive: true });
  await openPlate(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await clickFace(page, [-12, 6, 8]);
  const flatness = page.getByRole('form', { name: 'Add Flatness', exact: true });
  await page.getByRole('radio', { name: 'Flatness', exact: true }).check();
  await flatness.getByLabel('Tolerance (mm)', { exact: true }).fill('0.02');
  await flatness.getByLabel('Statistical ⟨ST⟩').check();
  await flatness.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(records(page)).toContainText('Flatness');

  await page.getByRole('button', { name: 'Front', exact: true }).click();
  await clickFace(page, [12, -20, 4], true);
  await expect(page.locator('.selection-chip')).toHaveCount(2);
  await page.locator('.label-unavailable summary').click();
  await expect(page.getByRole('radio', { name: /Distance.*distance needs parallel faces/i })).toBeDisabled();
  await page.screenshot({ path: `${evidence}/distance-refusal.png` });
  const form = page.getByRole('form', { name: 'Add Perpendicularity', exact: true });
  await expect(form).toBeVisible();
  await expect(form.getByLabel('Primary datum', { exact: true })).toHaveValue('A');
  await form.getByLabel('Tolerance (mm)', { exact: true }).fill('0.05 mm');
  await form.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(records(page)).toContainText('Perpendicularity');
  await ready(page);

  const before = await downloadSource(page);
  expect(before).toContain('modifiers: [Statistical]');
  await records(page).getByRole('button', { name: 'Edit Perpendicularity', exact: true }).click();
  const edit = page.getByRole('form', { name: 'Edit Perpendicularity', exact: true });
  await edit.getByText('Firmament fields', { exact: true }).click();
  await edit.getByLabel('datumRefs', { exact: true }).fill('[Missing]');
  await edit.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(edit.getByRole('alert')).toContainText('Use a datum already listed in Label, or add the datum before editing this record.');
  await expect(await downloadSource(page)).toBe(before);
  await ready(page);
  await expect(page.getByLabel('PMI annotations')).toContainText('Perpendicularity');
  await page.screenshot({ path: `${evidence}/edit-refusal.png` });
});

test('a STEP file from another system imports and labels beside the datums it carries', async ({ page }) => {
  // STEP Tools' Boxy: written by ST-Developer, with datums A, B and C on three of its faces.
  await page.goto('/local');
  await ready(page);
  await page.getByRole('banner').locator('input[type=file]').setInputFiles('../Aetheris/testdata/step242/steptools/boxy_with_surfacetex.stp');
  await expect(page.locator('.status-ready')).toHaveText('Ready', { timeout: 300_000 });
  await expect(page.getByRole('button', { name: /^Problems 0/ })).toBeVisible();
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  // A file Aetheris did not write is admitted by a pin of its exact text.
  await expect(page.locator('.editor-pane')).toContainText('textSha256');
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(page.locator('.node-construction-actions')).toContainText('Adding holes or edge finishes to an imported part is not supported yet.');
  await page.getByRole('tab', { name: 'Label', exact: true }).click();
  const fromFile = page.getByLabel('From the STEP file', { exact: true });
  for (const name of ['A', 'B', 'C']) await expect(fromFile).toContainText(`Datum ${name}`);
  await expect(fromFile).not.toContainText('Not located');
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  // The top face's rim, between the central opening and the outer wall.
  await clickFace(page, [20, 35, 80]);
  const datum = page.getByRole('form', { name: 'Add Datum', exact: true });
  await expect(datum.getByLabel('Name', { exact: true })).toHaveValue('D');
  await datum.getByRole('button', { name: 'Apply', exact: true }).click();
  // Applying rebuilds the imported part; the development runtime takes most of a minute.
  await expect(records(page).getByLabel('From the STEP file', { exact: true })).toBeVisible({ timeout: 300_000 });
  await expect(page.locator('.status-ready')).toHaveText('Ready', { timeout: 300_000 });
  await expect(records(page)).toContainText(/Datums\s*D\s*Datum/i);
  await page.screenshot({ path: `${evidence}/foreign-step-datum.png` });
});
