import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/local/graph-authoring');
const cli = resolve('../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
const panel = (page: Page) => page.locator('.authoring-panel');
const inspector = (page: Page) => page.getByRole('complementary', { name: 'Node inspector' });
test.beforeEach(async ({ page }) => {
  if (process.env.HELIOS_GRAPH_WEBGL === 'true') await page.addInitScript(() => localStorage.setItem('helios.viewport.renderer', 'webgl'));
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

test('Simple Bracket accepts a through hole along its XZ sketch extrusion using graph controls', async ({ page }) => {
  const aotRequests: string[] = [];
  page.context().on('request', request => {
    if (/\/aetheris-runtime-aot\/_framework\/dotnet\.native\..*\.wasm$/.test(request.url())) aotRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Simple bracket', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Graph', exact: true }).click(); await ready(page);
  await inspector(page).getByRole('button', { name: 'Add hole…', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Click Preview');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await panel(page).getByLabel('X', { exact: true }).fill('1.5');
  await panel(page).getByLabel('Y', { exact: true }).fill('20');
  await panel(page).getByLabel('Diameter', { exact: true }).fill('2');
  await applyPreview(page);
  const edited = await saveSource(page, 'simple-bracket-through-hole');
  expect(edited.source).toContain('on XZ');
  expect(edited.source).toContain('Point2(1.5mm, 20mm)');
  expect(edited.source).toContain('Diameter: 2mm');
  const exported = await step(page, 'simple-bracket-through-hole', { min: [0, -20, 0], max: [30, 0, 40] });
  expect(exported).toContain('CYLINDRICAL_SURFACE(');
  const validation = JSON.parse(execFileSync('dotnet', [cli, 'validate', edited.path, '--json'], { encoding: 'utf8' }));
  expect(validation.firmamentV2Validation).toMatchObject({ status: 'valid', validationLevel: 'Built' });
  if (process.env.HELIOS_GRAPH_REQUIRE_AOT === 'true') expect(aotRequests.length).toBeGreaterThan(0);
  await page.screenshot({ path: resolve(output, 'simple-bracket-through-hole.png'), fullPage: true });
});

test('a picked bracket foot supports a draggable gold hole, exact coordinates, cancel and atomic Apply', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open Simple bracket', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  const canvas = page.locator('[data-testid="viewport"] canvas');
  async function footPoint(x: number, y: number) {
    const camera = JSON.parse((await canvas.getAttribute('data-surface-inspection'))!).camera;
    const rect = (await canvas.boundingBox())!;
    return { x: rect.x + rect.width / 2 + (x - camera.target[0]) * rect.height / camera.span,
      y: rect.y + rect.height / 2 - (y - camera.target[1]) * rect.height / camera.span };
  }
  const start = await footPoint(16, -10); await page.mouse.click(start.x, start.y);
  await page.getByRole('button', { name: 'Add hole on selected face', exact: true }).click();
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await expect(canvas).toHaveAttribute('data-feature-placement', /"diameter":6/);
  await expect(canvas).toHaveAttribute('data-operation-preview-wires', /^[1-9]/);
  const beforeDrag = await panel(page).getByLabel('Center X', { exact: true }).inputValue();
  const edge = await footPoint(29, -19);
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(edge.x, edge.y, { steps: 15 }); await page.mouse.up();
  await expect(panel(page).getByLabel('Center X', { exact: true })).not.toHaveValue(beforeDrag);
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await panel(page).getByLabel('Center X', { exact: true }).fill('0');
  await expect(panel(page).getByRole('alert')).toContainText('positive edge clearance');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect((await saveSource(page, 'face-hole-cancel')).source).not.toContain('Hole<Shaft>');
  await page.getByRole('button', { name: 'Add hole on selected face', exact: true }).click();
  await panel(page).getByLabel('Center X', { exact: true }).fill('13');
  await panel(page).getByLabel('Center Y', { exact: true }).fill('10');
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await page.screenshot({ path: resolve(output, 'face-hole-gold-preview.png'), fullPage: true });
  await panel(page).getByRole('button', { name: 'Apply', exact: true }).click(); await ready(page);
  const edited = await saveSource(page, 'bracket-foot-hole');
  expect(edited.source).toContain('on XZ'); expect(edited.source).toContain('.Side(');
  expect(edited.source).toContain('Point2(13mm, 10mm)');
  const exported = await step(page, 'bracket-foot-hole', { min: [0,-20,0], max: [30,0,40] });
  expect(exported).toContain('CYLINDRICAL_SURFACE(');
  const validation = JSON.parse(execFileSync('dotnet', [cli, 'validate', edited.path, '--json'], { encoding: 'utf8' }));
  expect(validation.firmamentV2Validation).toMatchObject({ status: 'valid', validationLevel: 'Built' });
  await page.screenshot({ path: resolve(output, 'face-hole-applied.png'), fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect((await saveSource(page, 'face-hole-undo')).source).not.toContain('Hole<Shaft>');
});

test('one bracket face accepts separated holes, counterbore and countersink with collision guards', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open Simple bracket', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Graph', exact: true }).click(); await page.getByRole('button', { name: 'Top', exact: true }).click();
  const canvas = page.locator('[data-testid="viewport"] canvas');
  async function point(x: number, y: number) {
    const camera = JSON.parse((await canvas.getAttribute('data-surface-inspection'))!).camera, rect = (await canvas.boundingBox())!;
    return { x: rect.x + rect.width / 2 + (x + 3 - camera.target[0]) * rect.height / camera.span,
      y: rect.y + rect.height / 2 - (y - 20 - camera.target[1]) * rect.height / camera.span };
  }
  async function start(label: string, x: number, y: number, extras: Record<string, string> = {}) {
    await inspector(page).getByRole('button', { name: label, exact: true }).click();
    await panel(page).getByLabel('Diameter', { exact: true }).fill('4');
    for (const [name, value] of Object.entries(extras)) await panel(page).getByLabel(name, { exact: true }).fill(value);
    const p = await point(x, y); await page.mouse.click(p.x, p.y);
    await expect(panel(page).getByLabel('Center X', { exact: true })).toBeVisible();
    await panel(page).getByLabel('Center X', { exact: true }).fill(String(x));
    await panel(page).getByLabel('Center Y', { exact: true }).fill(String(y));
    await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  }
  async function commit() { await panel(page).getByRole('button', { name: 'Apply', exact: true }).click(); await ready(page); }
  await start('Add hole…', 5, 5); await commit();
  await start('Add hole…', 21, 5);
  const from = await point(21, 5), intoExistingHole = await point(5, 5);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(intoExistingHole.x, intoExistingHole.y, { steps: 15 }); await page.mouse.up();
  const clamped = JSON.parse((await canvas.getAttribute('data-feature-placement'))!).center;
  expect(Math.hypot(clamped[0] - 5, clamped[1] - 5)).toBeGreaterThanOrEqual(4.01);
  await panel(page).getByLabel('Center X', { exact: true }).fill('5'); await panel(page).getByLabel('Center Y', { exact: true }).fill('5');
  await expect(panel(page).getByRole('alert')).toContainText('existing holes');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(((await saveSource(page, 'multiple-hole-collision-cancel')).source.match(/Hole</g) ?? []).length).toBe(1);
  await start('Add hole…', 21, 5); await commit();
  await start('Counterbored hole…', 13, 14, { CounterboreDiameter: '7', CounterboreDepth: '1' });
  await panel(page).getByLabel('CounterboreDiameter', { exact: true }).fill('16');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('alert')).toContainText('positive edge clearance');
  await panel(page).getByLabel('CounterboreDiameter', { exact: true }).fill('7');
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted'); await commit();
  await start('Countersunk hole…', 21, 14, { CountersinkDiameter: '6' });
  await expect(canvas).toHaveAttribute('data-feature-placement', /"diameter":6/);
  await page.screenshot({ path: resolve(output, 'multiple-face-holes-gold.png'), fullPage: true }); await commit();
  const source = await saveSource(page, 'bracket-multiple-face-holes');
  expect((source.source.match(/Hole</g) ?? []).length).toBe(4);
  expect(source.source).toContain('Hole<Counterbore>'); expect(source.source).toContain('Hole<Countersink>');
  const exported = await step(page, 'bracket-multiple-face-holes', { min: [0,-20,0], max: [30,0,40] });
  expect(exported).toContain('CONICAL_SURFACE(');
  const validation = JSON.parse(execFileSync('dotnet', [cli, 'validate', source.path, '--json'], { encoding: 'utf8' }));
  expect(validation.firmamentV2Validation).toMatchObject({ status: 'valid', validationLevel: 'Built' });
  await page.getByRole('button', { name: 'Iso', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'bracket-multiple-face-holes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(((await saveSource(page, 'multiple-face-holes-undo')).source.match(/Hole</g) ?? []).length).toBe(3);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect(((await saveSource(page, 'multiple-face-holes-redo')).source.match(/Hole</g) ?? []).length).toBe(4);
});

test('recess defaults cut inward from the upright and a full-thickness recess has one useful error', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'Open Simple bracket', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Graph', exact: true }).click(); await page.getByRole('button', { name: 'Right', exact: true }).click();
  const canvas = page.locator('[data-testid="viewport"] canvas');
  async function clickUpright(height: number) {
    const camera = JSON.parse((await canvas.getAttribute('data-surface-inspection'))!).camera, rect = (await canvas.boundingBox())!;
    await page.mouse.click(rect.x + rect.width / 2, rect.y + rect.height / 2 - (height - camera.target[2]) * rect.height / camera.span);
  }
  await inspector(page).getByRole('button', { name: 'Counterbored hole…', exact: true }).click();
  await expect(panel(page).getByLabel('CounterboreDepth', { exact: true })).toHaveValue('1');
  await clickUpright(24);
  await expect(panel(page).getByText('Gold arrow points into the material. The recess opens on the selected face.', { exact: true })).toBeVisible();
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await panel(page).getByLabel('CounterboreDepth', { exact: true }).fill('3');
  await expect(panel(page).getByRole('alert')).toContainText('depth is 3 mm');
  await expect(panel(page).getByRole('alert')).toContainText('face has 3 mm');
  await expect(panel(page).getByRole('alert')).toContainText('2.99 mm');
  await expect(panel(page).getByRole('alert')).not.toContainText('compose-authoritative-section-stack');
  await expect(panel(page).getByRole('button', { name: 'Apply', exact: true })).toBeDisabled();
  await panel(page).getByLabel('CounterboreDepth', { exact: true }).fill('1');
  await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await panel(page).getByRole('button', { name: 'Apply', exact: true }).click(); await ready(page);
  await inspector(page).getByRole('button', { name: 'Countersunk hole…', exact: true }).click();
  await expect(panel(page).getByLabel('CountersinkDiameter', { exact: true })).toHaveValue('8');
  await clickUpright(12); await expect(panel(page).getByRole('status')).toContainText('Preview admitted');
  await page.getByRole('button', { name: 'Iso', exact: true }).click();
  await page.screenshot({ path: resolve(output, 'upright-recess-inward-preview.png'), fullPage: true });
  await panel(page).getByRole('button', { name: 'Apply', exact: true }).click(); await ready(page);
  const edited = await saveSource(page, 'upright-recess-defaults');
  const exported = await step(page, 'upright-recess-defaults', { min: [0,-20,0], max: [30,0,40] });
  expect(exported).toContain('CONICAL_SURFACE(');
  const validation = JSON.parse(execFileSync('dotnet', [cli, 'validate', edited.path, '--json'], { encoding: 'utf8' }));
  expect(validation.firmamentV2Validation).toMatchObject({ status: 'valid', validationLevel: 'Built' });
  await page.screenshot({ path: resolve(output, 'upright-recess-defaults.png'), fullPage: true });
});

test('unapplied graph fields cannot be lost by switching views or opening source', async ({ page }) => {
  await newBlock(page);
  await page.getByRole('button', { name: 'Size [60mm, 40mm, 12mm]', exact: true }).click();
  await inspector(page).getByLabel('X', { exact: true }).fill('80');
  await expect(page.getByRole('tab', { name: 'Source', exact: true })).toBeDisabled();
  await expect(page.getByRole('tab', { name: /^Parameters/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save source', exact: true })).toBeDisabled();
  await page.keyboard.press('Control+Shift+P');
  await expect(page.getByRole('dialog', { name: 'Command palette', exact: true })).toHaveCount(0);
  await inspector(page).getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Graph', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector(page).getByLabel('X', { exact: true })).toHaveValue('80');
  await page.screenshot({ path: resolve(output, 'unapplied-fields-protected.png'), fullPage: true });
  await inspector(page).getByRole('button', { name: 'Discard edits', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Source', exact: true })).toBeEnabled();
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(inspector(page).getByLabel('X', { exact: true })).toHaveValue('60');
  await inspector(page).getByLabel('X', { exact: true }).fill('80');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click(); await ready(page);
  await expect(page.getByRole('tab', { name: 'Source', exact: true })).toBeEnabled();
  expect((await saveSource(page, 'protected-field-applied')).source).toContain('[80mm, 40mm, 12mm]');
});
async function saveSource(page: Page, name: string) {
  await mkdir(output, { recursive: true });
  const event = page.waitForEvent('download', { timeout: 30_000 }); await page.getByRole('button', { name: 'Save source', exact: true }).click();
  const path = resolve(output, name + '.firmament'); await (await event).saveAs(path);
  return { path, source: await readFile(path, 'utf8') };
}
async function step(page: Page, name: string, bounds = { min: [-30, -20, 0], max: [30, 20, 12] }) {
  await mkdir(output, { recursive: true });
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const event = page.waitForEvent('download', { timeout: 30_000 }); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const path = resolve(output, name + '.step'); await (await event).saveAs(path);
  const text = await readFile(path, 'utf8');
  const analysis = JSON.parse(execFileSync('dotnet', [cli, 'analyze', path, '--json'], { encoding: 'utf8' }));
  await writeFile(resolve(output, name + '.analysis.json'), JSON.stringify(analysis, null, 2));
  expect(text).toContain('MANIFOLD_SOLID_BREP'); expect(text).toContain('CLOSED_SHELL');
  expect(analysis.summary).toMatchObject({ bodyCount: 1, shellCount: 1, structuralAssessment: 'enclosed-manifold' });
  for (const end of ['min', 'max'] as const)
    ['x', 'y', 'z'].forEach((axis, index) => expect(analysis.summary.boundingBox[end][axis]).toBeCloseTo(bounds[end][index], 9));
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

async function moveCard(page: Page, selector: string) {
  const card = page.locator(selector).first();
  const before = await card.getAttribute('style');
  const header = await card.locator('.graph-node-drag').boundingBox(); expect(header).not.toBeNull();
  await page.mouse.move(header!.x + header!.width / 2, header!.y + header!.height / 2);
  await page.mouse.down(); await page.mouse.move(header!.x + header!.width / 2 + 65, header!.y + header!.height / 2 + 45, { steps: 90 }); await page.mouse.up();
  await expect(card).not.toHaveAttribute('style', before!);
  return { card, before, moved: await card.getAttribute('style') };
}

test('card dragging persists across selection, source view and rebuild without changing the part', async ({ page }) => {
  await newBlock(page);
  await expect(page.locator('.graph-caption')).toContainText('Links show source dependencies');
  await expect(page.locator('.graph-unit .react-flow__handle')).toHaveCount(2);
  await expect(page.locator('.graph-unit .react-flow__handle.connectable')).toHaveCount(0);
  for (const handle of await page.locator('.graph-unit .react-flow__handle').all()) await expect(handle).toBeHidden();
  const source = (await saveSource(page, 'layout-before')).source;
  const geometry = await step(page, 'layout-before');
  const { card, moved } = await moveCard(page, '.react-flow__node-unit');
  await card.locator('.graph-node-drag').click();
  await expect(card).toHaveAttribute('style', moved!);
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
  await page.getByRole('tab', { name: 'Graph', exact: true }).click();
  await expect(card).toHaveAttribute('style', moved!);
  await page.getByRole('button', { name: 'Build', exact: true }).click(); await ready(page);
  await expect(card).toHaveAttribute('style', moved!);
  expect((await saveSource(page, 'layout-after')).source).toBe(source);
  expect(await step(page, 'layout-after')).toBe(geometry);
  await inspector(page).getByRole('group', { name: 'Size', exact: true }).getByLabel('X', { exact: true }).fill('62');
  await inspector(page).getByRole('button', { name: 'Apply changes', exact: true }).click(); await ready(page);
  await expect(card).toHaveAttribute('style', moved!);
  await expect(page.getByRole('button', { name: 'Size [62mm, 40mm, 12mm]', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Auto arrange', exact: true }).click();
  await expect(card).not.toHaveAttribute('style', moved!);
  await page.screenshot({ path: resolve(output, 'card-layout.png') });
});

test('assembly card dragging survives switching to Parts and back without moving physical occurrences', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New assembly', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('tab', { name: 'Graph', exact: true }).click(); await ready(page);
  const source = (await saveSource(page, 'assembly-layout-before')).source;
  const { card, moved } = await moveCard(page, '.react-flow__node-part');
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await expect(page.locator('.react-flow__node-unit').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Assembly', exact: true }).click();
  await expect(card).toHaveAttribute('style', moved!);
  expect((await saveSource(page, 'assembly-layout-after')).source).toBe(source);
  await page.getByRole('button', { name: 'Auto arrange', exact: true }).click();
  await expect(card).not.toHaveAttribute('style', moved!);
});

test('assembly ports create explicit Firmament mates and Parts exposes no wire ports', async ({ page }) => {
  await page.goto('/'); await page.getByRole('button', { name: 'New assembly', exact: true }).click(); await page.getByRole('tab', { name: 'Graph', exact: true }).click(); await ready(page);
  const from = await page.getByLabel('Mate from Fixed.Top', { exact: true }).boundingBox();
  const to = await page.getByLabel('Mate to Moving.Bottom', { exact: true }).boundingBox();
  expect(from).not.toBeNull(); expect(to).not.toBeNull();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2); await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, { steps: 16 }); await page.mouse.up();
  const menu = page.getByRole('menu', { name: 'Create mate', exact: true });
  await expect(menu).toContainText('First frame is fixed; second is moving');
  await menu.getByRole('menuitem', { name: 'Fixed rigid, no motion', exact: true }).click();
  await expect(panel(page).getByLabel('Fixed frame', { exact: true }).locator('option:checked')).toHaveText('Fixed.Top');
  await expect(panel(page).getByLabel('Moving frame', { exact: true }).locator('option:checked')).toHaveText('Moving.Bottom');
  await applyPreview(page);
  const result = await saveSource(page, 'explicit-frame-mate');
  expect(result.source).toContain('Interface<Fixed>'); expect(result.source).toContain('Fixed.Top'); expect(result.source).toContain('Moving.Bottom');
  await expect(page.locator('.assembly-joint')).toHaveCount(1);
  await expect(page.getByText('2 parts, 1 mate.', { exact: false })).toBeVisible();
  await page.screenshot({ path: resolve(output, 'explicit-frame-mate.png'), fullPage: true });
  await page.getByRole('tab', { name: 'Parts', exact: true }).click();
  await expect(page.locator('.react-flow__handle:visible')).toHaveCount(0);
  await expect(page.locator('.react-flow__handle.connectable')).toHaveCount(0);
});
