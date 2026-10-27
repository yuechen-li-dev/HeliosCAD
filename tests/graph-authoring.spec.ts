import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/local/graph-authoring');
const cli = resolve('../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
const panel = (page: Page) => page.locator('.authoring-panel');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Node inspector' });
test.beforeEach(async ({ page }) => {
  if (process.env.HELIOS_GRAPH_LAUNCH_URL) {
    await page.goto(process.env.HELIOS_GRAPH_LAUNCH_URL);
    await expect(page.getByRole('button', { name: 'New part', exact: true })).toBeVisible();
  }
});
async function ready(page: Page) {
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toHaveAttribute('aria-selected', 'true');
}
async function applyPreview(page: Page) {
  await panel(page).getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await panel(page).getByRole('button', { name: 'Apply', exact: true }).click(); await ready(page);
  await expect(panel(page)).toHaveCount(0);
}
async function newBlock(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(panel(page).getByLabel('X', { exact: true })).toHaveValue('40', { timeout: 120_000 });
  await panel(page).getByLabel('X', { exact: true }).fill('60');
  await panel(page).getByLabel('Y', { exact: true }).fill('40');
  await panel(page).getByLabel('Z', { exact: true }).fill('12');
  // Preview must read the focused field as well, without an Enter/blur workaround.
  await applyPreview(page);
  await expect(page.getByRole('button', { name: 'Size [60mm, 40mm, 12mm]', exact: true })).toBeVisible();
}
async function saveSource(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  const event = page.waitForEvent('download', { timeout: 30_000 }); await page.getByRole('button', { name: 'Save source', exact: true }).click();
  const path = resolve(output, name + '.firmament'); await (await event).saveAs(path);
  return { path, source: await readFile(path, 'utf8') };
}
async function step(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const event = page.waitForEvent('download', { timeout: 30_000 }); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const path = resolve(output, name + '.step'); await (await event).saveAs(path);
  const text = await readFile(path, 'utf8');
  const analysis = JSON.parse(execFileSync('dotnet', [cli, 'analyze', path, '--json'], { encoding: 'utf8' }));
  await writeFile(resolve(output, name + '.analysis.json'), JSON.stringify(analysis, null, 2));
  expect(text).toContain('MANIFOLD_SOLID_BREP'); expect(text).toContain('CLOSED_SHELL');
  expect(analysis.summary).toMatchObject({ bodyCount: 1, shellCount: 1, structuralAssessment: 'enclosed-manifold' });
  for (const [end, expected] of [['min', [-30, -20, 0]], ['max', [30, 20, 12]]] as const)
    ['x', 'y', 'z'].forEach((axis, index) => expect(analysis.summary.boundingBox[end][axis]).toBeCloseTo(expected[index], 9));
  return text;
}

test('a block, offset through hole, atomic edits, chamfer and STEP all work without source editing', async ({ page }) => {
  await newBlock(page);
  await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click();
  await panel(page).getByLabel('X', { exact: true }).fill('8'); await panel(page).getByLabel('Y', { exact: true }).fill('4');
  await panel(page).getByLabel('Diameter', { exact: true }).fill('8');
  await applyPreview(page);
  const initial = await saveSource(page, 'through-hole');
  expect(initial.source).toContain('Point2(8mm, 4mm)'); expect(initial.source).toContain('Diameter: 8mm');
  const before = await step(page, 'through-hole');
  expect((before.match(/CYLINDRICAL_SURFACE\(/g) ?? []).length).toBe(1);
  expect((before.match(/ADVANCED_FACE\(/g) ?? []).length).toBe(7);
  const volume = JSON.parse(execFileSync('dotnet', [cli, 'analyze', 'volume', resolve(output, 'through-hole.step'), '--json'], { encoding: 'utf8' }));
  expect(volume.success).toBe(true); expect(volume.volume).toBeCloseTo(60 * 40 * 12 - Math.PI * 4 * 4 * 12, 8);

  await inspector(page).getByLabel('X', { exact: true }).fill('-8');
  await inspector(page).getByLabel('Y', { exact: true }).fill('-4');
  await inspector(page).getByLabel('Diameter', { exact: true }).fill('10');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click(); await ready(page);
  await expect(inspector(page).getByLabel('Diameter', { exact: true })).toHaveValue('10');
  const edited = await saveSource(page, 'through-hole-edited');
  expect(edited.source).toContain('Point2(-8mm, -4mm)'); expect(edited.source).toContain('Diameter: 10mm');
  await inspector(page).getByRole('button', { name: 'Chamfer…', exact: true }).click();
  await panel(page).getByLabel('Distance', { exact: true }).fill('0.5'); await applyPreview(page);
  const finished = await step(page, 'through-hole-chamfer');
  expect((finished.match(/ADVANCED_FACE\(/g) ?? []).length).toBeGreaterThan(7);
  await page.screenshot({ path: resolve(output, 'block-hole-chamfer.png'), fullPage: true });
});

test('rim previews keep the accepted solid and show gold candidate boundaries until Apply', async ({ page }) => {
  await newBlock(page);
  const before = (await saveSource(page, 'rim-before')).source;
  await inspector(page).getByRole('button', { name: 'Fillet…', exact: true }).click();
  await panel(page).getByLabel('Face', { exact: true }).selectOption('-Z');
  await panel(page).getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await expect(page.locator('.authoring-preview-banner')).toContainText('gold boundaries');
  await expect.poll(async () => page.locator('[data-operation-preview-wires]').evaluateAll(nodes =>
    Math.max(0, ...nodes.map(n => Number(n.getAttribute('data-operation-preview-wires')))))).toBeGreaterThan(0);
  expect((await saveSource(page, 'rim-preview')).source).toBe(before);
  await page.screenshot({ path: resolve(output, 'gold-fillet-preview.png'), fullPage: true });
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.authoring-preview-banner')).toHaveCount(0);
  await expect.poll(async () => page.locator('[data-operation-preview-wires]').evaluateAll(nodes =>
    Math.max(0, ...nodes.map(n => Number(n.getAttribute('data-operation-preview-wires')))))).toBe(0);
  expect((await saveSource(page, 'rim-cancelled')).source).toBe(before);
  await inspector(page).getByRole('button', { name: 'Fillet…', exact: true }).click();
  await panel(page).getByLabel('Face', { exact: true }).selectOption('+X');
  await applyPreview(page);
  expect((await saveSource(page, 'right-rim')).source).toContain('Face: +X');
  const exported = await step(page, 'right-rim');
  expect((exported.match(/ADVANCED_FACE\(/g) ?? []).length).toBe(10);
});

for (const [action, finish, type] of [
  ['Counterbored hole…', 'Fillet…', 'CYLINDRICAL_SURFACE'],
  ['Countersunk hole…', 'Chamfer…', 'CONICAL_SURFACE'],
] as const) test(`${action} and ${finish} compile and export through graph controls`, async ({ page }) => {
  await newBlock(page); await inspector(page).getByRole('button', { name: action, exact: true }).click();
  await panel(page).getByLabel('X', { exact: true }).fill('8'); await applyPreview(page);
  await inspector(page).getByRole('button', { name: finish, exact: true }).click(); await applyPreview(page);
  const exported = await step(page, action.startsWith('Counterbored') ? 'counterbore-fillet' : 'countersink-chamfer');
  expect(exported).toContain(type);
  expect((exported.match(/ADVANCED_FACE\(/g) ?? []).length).toBeGreaterThan(7);
});

test('bad previews and bad applied drafts retain geometry and recover without the code editor', async ({ page }) => {
  await newBlock(page); await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click();
  await panel(page).getByLabel('Diameter', { exact: true }).fill('1000');
  await panel(page).getByRole('button', { name: 'Preview', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toContainText('Preview refused');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await saveSource(page, 'cancelled-preview')).source).not.toContain('Hole<');
  await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click(); await applyPreview(page);
  const accepted = await step(page, 'last-good');
  await inspector(page).getByLabel('Diameter', { exact: true }).fill('1000');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click();
  await expect(inspector(page).getByRole('alert')).toContainText("Draft doesn't build");
  await expect(page.locator('.viewport-pane')).toHaveClass(/ghosted/);
  await inspector(page).getByRole('button', { name: 'Revert to last good', exact: true }).click(); await ready(page);
  expect((await saveSource(page, 'reverted-source')).source).toContain('Diameter: 6mm');
  await expect(inspector(page).getByLabel('Diameter', { exact: true })).toHaveValue('6');
  const restored = await step(page, 'restored');
  // STEP headers carry session metadata; the geometric entity stream remains identical.
  expect(restored.split('DATA;')[1]).toEqual(accepted.split('DATA;')[1]);
  await page.screenshot({ path: resolve(output, 'recovered-draft.png'), fullPage: true });
});

test('blind depth, deletion, undo and redo stay in the graph workflow', async ({ page }) => {
  await newBlock(page); await inspector(page).getByRole('button', { name: 'Blind hole…', exact: true }).click();
  await panel(page).getByLabel('Blind depth', { exact: true }).fill('7'); await applyPreview(page);
  expect((await saveSource(page, 'blind-hole')).source).toContain('Blind(7mm)');
  const drilled = await step(page, 'blind-hole');
  expect((drilled.match(/CYLINDRICAL_SURFACE\(/g) ?? []).length).toBe(1);
  await inspector(page).getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('alertdialog', { name: 'Delete declaration' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await ready(page); expect((await saveSource(page, 'deleted-hole')).source).not.toContain('Hole<Shaft>');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect((await saveSource(page, 'undo-delete')).source).toContain('Blind(7mm)');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect((await saveSource(page, 'redo-delete')).source).not.toContain('Hole<Shaft>');
  const undrilled = await step(page, 'undrilled'); expect((undrilled.match(/ADVANCED_FACE\(/g) ?? []).length).toBe(6);
});

test('a through hole can switch to blind depth and back using fields', async ({ page }) => {
  await newBlock(page); await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click();
  await panel(page).getByLabel('End', { exact: true }).selectOption('Blind');
  await panel(page).getByLabel('Blind depth', { exact: true }).fill('4'); await applyPreview(page);
  expect((await saveSource(page, 'switched-blind')).source).toContain('Blind(4mm)');
  await inspector(page).getByLabel('End', { exact: true }).selectOption('ThroughAll');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click(); await ready(page);
  expect((await saveSource(page, 'switched-through')).source).toContain('End: ThroughAll');
  expect(((await step(page, 'switched-through')).match(/ADVANCED_FACE\(/g) ?? []).length).toBe(7);
});

test('a finite pocket can be created from a block through graph controls', async ({ page }) => {
  await newBlock(page); await inspector(page).getByRole('button', { name: 'Pocket…', exact: true }).click();
  await panel(page).getByLabel('Diameter', { exact: true }).fill('12');
  await panel(page).getByLabel('Depth', { exact: true }).fill('3'); await applyPreview(page);
  const pocketed = await step(page, 'pocket');
  expect((pocketed.match(/ADVANCED_FACE\(/g) ?? []).length).toBeGreaterThan(6);
});
