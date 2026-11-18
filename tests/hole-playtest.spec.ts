import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TelosCamera } from '@aetheris/three-telos';

const authoring = (page: Page) => page.locator('.authoring-panel');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Node inspector' });
const viewport = (page: Page) => page.locator('[data-testid="viewport"] canvas');
const apply = (page: Page) => authoring(page).getByRole('button', { name: 'Apply', exact: true });
const field = (page: Page, name: string) => authoring(page).getByLabel(name, { exact: true });
const advice = (page: Page) => authoring(page).getByRole('alert').locator(':scope > p');

async function ready(page: Page) {
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 90_000 });
}

async function clickWorld(page: Page, point: readonly number[]) {
  const canvas = viewport(page);
  await expect(canvas).toHaveAttribute('data-surface-inspection', /"camera"/);
  const state = JSON.parse((await canvas.getAttribute('data-surface-inspection'))!).camera;
  const rect = (await canvas.boundingBox())!;
  const camera = new TelosCamera();
  camera.mode = state.mode;
  camera.span = state.span;
  camera.position.fromArray(state.position);
  camera.target.fromArray(state.target);
  camera.up.fromArray(state.up);
  camera.resize(rect.width, rect.height);
  const pixel = camera.project(point);
  await page.mouse.click(rect.x + pixel[0], rect.y + pixel[1]);
}

async function newBlock(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(field(page, 'X')).toHaveValue('40', { timeout: 90_000 });
  await authoring(page).getByRole('button', { name: 'Preview', exact: true }).click();
  await apply(page).click();
  await ready(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
}

async function commit(page: Page) {
  await expect(authoring(page).getByRole('status')).toContainText('Preview ready');
  await expect(viewport(page)).toHaveAttribute('data-operation-preview-wires', /^[1-9]/);
  await expect(apply(page)).toBeInViewport();
  await apply(page).click();
  await ready(page);
  await expect(authoring(page)).toHaveCount(0);
}

async function source(page: Page) {
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  return readFile(await (await download).path(), 'utf8');
}

test.beforeEach(async ({ page }) => {
  if (process.env.HELIOS_GRAPH_WEBGL === 'true')
    await page.addInitScript(() => localStorage.setItem('helios.viewport.renderer', 'webgl'));
});
test.use({ viewport: { width: 1280, height: 720 } });

const holeCases = [
  {
    tool: 'Add hole…', kind: 'Shaft', invalidField: 'Center X', invalidValue: '20',
    guidance: 'Move Center X or Y farther inside the face', validValue: '7', sourceValue: 'ThroughAll',
  },
  {
    tool: 'Blind hole…', kind: 'Shaft', invalidField: 'Blind depth', invalidValue: '8',
    guidance: 'Reduce Blind depth or choose Through all', validValue: '4', sourceValue: 'Blind(4mm)',
  },
  {
    tool: 'Counterbored hole…', kind: 'Counterbore', invalidField: 'Counterbore diameter', invalidValue: '3',
    guidance: 'Set Counterbore diameter larger than Diameter', validValue: '7', sourceValue: 'CounterboreDiameter: 7mm',
    recess: { field: 'Counterbore depth', invalidValue: '8', guidance: 'Reduce Counterbore depth', restoredValue: '1' },
  },
  {
    tool: 'Countersunk hole…', kind: 'Countersink', invalidField: 'Countersink diameter', invalidValue: '3',
    guidance: 'Set Countersink diameter larger than Diameter', validValue: '8', sourceValue: 'CountersinkDiameter: 8mm',
    recess: { field: 'Countersink angle', invalidValue: '5', guidance: 'increase Countersink angle', restoredValue: '90' },
  },
];

for (const item of holeCases) {
  test(`${item.tool} places on a block, explains a refusal, and commits the repaired hole`, async ({ page }, testInfo) => {
    await newBlock(page);
    await inspector(page).getByRole('button', { name: item.tool, exact: true }).click();
    await expect(field(page, 'Diameter')).toBeVisible();
    await clickWorld(page, [8, 5, 8]);
    await expect(field(page, 'Center X')).toBeVisible();
    expect(Number(await field(page, 'Center X').inputValue())).toBeCloseTo(8, 0);
    expect(Number(await field(page, 'Center Y').inputValue())).toBeCloseTo(5, 0);
    await expect(viewport(page)).toHaveAttribute('data-feature-placement', /"face\(\+Z\)"/);
    await field(page, item.invalidField).fill(item.invalidValue);
    await expect(advice(page)).toContainText(item.guidance);
    await expect(apply(page)).toBeDisabled();
    await expect(apply(page)).toBeInViewport();
    await expect(authoring(page).locator('details[open]').filter({ hasText: 'Technical details' })).toHaveCount(0);
    expect(await source(page)).not.toContain('Hole<');
    await page.screenshot({ path: testInfo.outputPath('refused.png'), fullPage: true });

    await field(page, item.invalidField).fill(item.validValue);
    if (item.recess) {
      await field(page, item.recess.field).fill(item.recess.invalidValue);
      await expect(advice(page)).toContainText(item.recess.guidance);
      await expect(apply(page)).toBeDisabled();
      await field(page, item.recess.field).fill(item.recess.restoredValue);
    }
    await field(page, 'Center Y').fill('5');
    await expect(authoring(page).getByRole('status')).toContainText('Preview ready');
    await page.screenshot({ path: testInfo.outputPath('accepted.png'), fullPage: true });
    await commit(page);
    const edited = await source(page);
    expect(edited).toContain(`Hole<${item.kind}>`);
    expect(edited).toMatch(/on:\s*face\(\+Z\)/i);
    expect(edited.toLowerCase()).toContain(item.sourceValue.toLowerCase());
  });
}

test('a blind hole on the bracket explains how to keep its location and finish as a through hole', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Simple bracket', exact: true }).click();
  await ready(page);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await inspector(page).getByRole('button', { name: 'Blind hole…', exact: true }).click();
  await expect(field(page, 'Blind depth')).toBeVisible();
  await clickWorld(page, [16, -10, 3]);
  await expect(advice(page)).toContainText('Choose Through all to keep this location');
  await expect(apply(page)).toBeDisabled();
  await field(page, 'Center X').fill('13');
  await field(page, 'Center Y').fill('10');
  await field(page, 'End').selectOption('ThroughAll');
  await commit(page);
  const edited = await source(page);
  expect(edited).toContain('.Side(');
  expect(edited).toContain('Point2(13mm, 10mm)');
  expect(edited).toContain('ThroughAll');
});

test('a second hole preserves the existing drill point and explains how to make a through-hole pair', async ({ page }, testInfo) => {
  await newBlock(page);
  await inspector(page).getByRole('button', { name: 'Blind hole…', exact: true }).click();
  await field(page, 'Blind depth').fill('4');
  await clickWorld(page, [-8, -5, 8]);
  await commit(page);
  const accepted = await source(page);
  expect(accepted).toContain('Blind(4mm)');

  async function startSecondHole() {
    await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click();
    await expect(field(page, 'Diameter')).toBeVisible();
    await clickWorld(page, [8, 5, 8]);
  }
  await startSecondHole();
  await expect(advice(page)).toContainText('BlindHole has a drill point');
  await expect(advice(page)).toContainText('set its End to Through all');
  await expect(apply(page)).toBeDisabled();
  expect(await source(page)).toBe(accepted);
  await page.screenshot({ path: testInfo.outputPath('preserved-drill-point.png'), fullPage: true });

  await authoring(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await inspector(page).getByLabel('End', { exact: true }).selectOption('ThroughAll');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click();
  await ready(page);
  await startSecondHole();
  await commit(page);
  expect((await source(page)).match(/End:\s*ThroughAll/gi)).toHaveLength(2);
});

test('the catalog Perforation guides diameter, pitch and margin edits and exports six open vents', async ({ page }, testInfo) => {
  await newBlock(page);
  await page.getByRole('button', { name: 'Add a body or feature', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search parts and features' }).fill('Perforation');
  await page.getByRole('option', { name: /Perforation/ }).click();
  await expect(authoring(page).getByText(/Use \+Z for the top of a block/)).toBeVisible();
  await field(page, 'Layout').selectOption('Grid');
  const preview = authoring(page).getByRole('button', { name: 'Preview', exact: true });
  for (const row of [
    { field: 'Diameter', invalid: '0', repair: '6', guidance: 'Use positive Diameter and Pitch values' },
    { field: 'Pitch', invalid: '6', repair: '12', guidance: 'Increase Pitch or reduce Diameter' },
    { field: 'Margin', invalid: '20', repair: '3', guidance: 'Reduce Margin or Diameter' },
  ]) {
    await field(page, row.field).fill(row.invalid);
    await preview.click();
    await expect(advice(page)).toContainText(row.guidance);
    await expect(apply(page)).toBeDisabled();
    await expect(apply(page)).toBeInViewport();
    await field(page, row.field).fill(row.repair);
  }
  expect(await source(page)).not.toContain('Perforation');
  await preview.click();
  await expect(authoring(page).getByRole('status')).toContainText('Preview ready');
  await apply(page).click();
  await ready(page);
  const edited = await source(page);
  expect(edited).toContain('Perforation Vents');
  expect(edited).toContain('Layout: Grid');
  expect(edited).toContain('Pitch: 12mm');
  expect(edited).toContain('Margin: 3mm');

  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const path = testInfo.outputPath('perforation.step');
  await (await download).saveAs(path);
  const text = await readFile(path, 'utf8');
  expect(text.match(/CYLINDRICAL_SURFACE\(/g)).toHaveLength(6);
  const cli = resolve('../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
  const result = JSON.parse(execFileSync('dotnet', [cli, 'analyze', path, '--json'], { encoding: 'utf8' }));
  expect(result.summary).toMatchObject({ bodyCount: 1, shellCount: 1, structuralAssessment: 'enclosed-manifold' });
  await page.getByRole('button', { name: 'Iso', exact: true }).click();
  await page.screenshot({ path: testInfo.outputPath('perforation.png'), fullPage: true });
});
