import { test, expect, type Page, type Locator } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const output = resolve('artifacts/local/intellidraft');
const cli = resolve('../Aetheris/Aetheris.CLI/bin/Release/net10.0/aetheris.dll');
const panel = (page: Page) => page.getByRole('dialog', { name: 'IntelliDraft', exact: true });
test.beforeEach(async () => { await mkdir(output, { recursive: true }); });
async function start(page: Page) {
  await page.goto('/'); await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready', { timeout: 120_000 });
  await page.getByRole('button', { name: 'IntelliDraft', exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Draw rectangle', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('dialog.intellidraft:modal')).toBeVisible();
}
async function act(p: Locator, name: string) {
  await p.getByRole('button', { name, exact: true }).click();
  await expect(p.getByRole('status')).not.toContainText('Checking with compiler');
  await expect(p.getByRole('alert')).toHaveCount(0);
}
async function advanced(p: Locator, tool: string) {
  if (!await p.getByRole('button', { name: tool, exact: true }).isVisible()) await p.getByText('Advanced: points, lines and Paths', { exact: true }).click();
  await p.getByRole('button', { name: tool, exact: true }).click();
}
async function layout(p: Locator) { await advanced(p, 'Layout'); await act(p, 'Add Layout'); }
const select = (p: Locator) => p.getByRole('button', { name: 'Select and move', exact: true }).click();
/** Type a new shape's dimensions in "Add by dimensions"; the section closes again so it never shadows the inspector. */
async function addShape(p: Locator, fields: Record<string, number | string>, button = 'Add Rectangle') {
  const section = p.getByText('Add by dimensions', { exact: true });
  if (!await p.getByLabel('New center X', { exact: true }).isVisible()) await section.click();
  for (const [label, value] of Object.entries(fields)) {
    if (label === 'name') await p.getByLabel('Construction name', { exact: true }).fill(String(value));
    else await p.getByLabel(label, { exact: true }).fill(String(value));
  }
  await act(p, button); await section.click();
}
async function span(p: Locator, edge: string, from: string, to: string) {
  const name = `Add span ${edge} from ${from} to ${to}`;
  if (!await p.getByRole('button', { name, exact: true }).isVisible()) await p.getByText('Edges as a list', { exact: true }).click();
  await p.getByRole('button', { name, exact: true }).click();
}
async function point(p: Locator, name: string, x: number, y: number) {
  await advanced(p, 'Point');
  await p.getByLabel('Construction name', { exact: true }).fill(name);
  await p.getByLabel('X', { exact: true }).fill(String(x)); await p.getByLabel('Y', { exact: true }).fill(String(y));
  await act(p, 'Add Point');
}
async function line(p: Locator, name: string, from: string, to: string) {
  await p.getByLabel('Construction name', { exact: true }).fill(name);
  await p.getByLabel('From point', { exact: true }).selectOption(from); await p.getByLabel('To point', { exact: true }).selectOption(to);
  await act(p, 'Add Line');
}
async function qualify(page: Page, name: string, fixture: string) {
  await mkdir(output, { recursive: true });
  await panel(page).getByRole('button', { name: 'Build and use part', exact: true }).click();
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('.status-ready')).toContainText('Ready');
  const download = page.waitForEvent('download'); await page.getByRole('button', { name: 'Save source', exact: true }).click();
  const sourcePath = resolve(output, name + '.firmament'); await (await download).saveAs(sourcePath);
  const source = await readFile(sourcePath, 'utf8');
  const validation = JSON.parse(execFileSync('dotnet', [cli, 'validate', sourcePath, '--json'], { encoding: 'utf8' }));
  expect(validation.firmamentV2Validation.status).toBe('valid');
  await writeFile(resolve(output, name + '.validate.json'), JSON.stringify(validation, null, 2));
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  const stepDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download selected format', exact: true }).click();
  const step = resolve(output, name + '.step'); await (await stepDownload).saveAs(step);
  const reference = resolve(output, name + '.reference.step');
  execFileSync('dotnet', [cli, 'build', resolve('../Aetheris/fixtures/Regression/IntelliDraft', fixture), '--output', reference, '--json']);
  const inspect = (path: string) => JSON.parse(execFileSync('dotnet', [cli, 'analyze', path, '--json'], { encoding: 'utf8' }));
  const actual = inspect(step), expected = inspect(reference);
  await writeFile(resolve(output, name + '.analysis.json'), JSON.stringify({ actual, expected }, null, 2));
  expect(actual.summary.structuralAssessment).toBe('enclosed-manifold');
  for (const key of ['faceCount', 'edgeCount', 'vertexCount', 'bodyCount', 'shellCount']) expect(actual.summary[key]).toEqual(expected.summary[key]);
  expect(actual.summary.surfaceFamilies).toEqual(expected.summary.surfaceFamilies);
  expect(actual.summary.curveFamilies).toEqual(expected.summary.curveFamilies);
  for (const end of ['min', 'max']) for (const axis of ['x', 'y', 'z']) expect(actual.summary.boundingBox[end][axis]).toBeCloseTo(expected.summary.boundingBox[end][axis], 8);
  expect((await readFile(step, 'utf8')).match(/B_SPLINE_SURFACE_WITH_KNOTS/g)).toBeNull();
  await page.screenshot({ path: resolve(output, name + '-built.png') });
  return source;
}

test('named points and lines trace an L, edit upstream, reject a broken trace, undo and build without source editing', async ({ page }) => {
  await start(page); const p = panel(page); await layout(p);
  for (const [name, x, y] of [['a', 0, 0], ['b', 60, 0], ['c', 60, 8], ['d', 8, 8], ['e', 8, 40], ['f', 0, 40]] as const) await point(p, name, x, y);
  await p.getByRole('button', { name: 'Line', exact: true }).click();
  const edges = [['bottom', 'a', 'b'], ['right', 'b', 'c'], ['ledge', 'c', 'd'], ['upright', 'd', 'e'], ['top', 'e', 'f'], ['left', 'f', 'a']];
  for (const [name, from, to] of edges) await line(p, name, from, to);
  await p.getByRole('button', { name: 'Trace', exact: true }).click();
  await act(p, 'Add to boundary');
  await p.getByRole('button', { name: 'Use this outline', exact: true }).click();
  await expect(p.getByRole('alert')).toBeVisible(); await expect(p.getByRole('button', { name: 'Build and use part', exact: true })).toBeDisabled();
  await p.getByRole('button', { name: 'Remove bottom from trace', exact: true }).click();
  for (const [edge] of edges) { await p.getByLabel('Guide', { exact: true }).selectOption(edge); await p.getByRole('button', { name: 'Add to boundary', exact: true }).click(); }
  await act(p, 'Use this outline');
  await p.getByText('Advanced construction objects and dimensions', { exact: true }).click();
  await p.getByRole('button', { name: 'Edit point b', exact: true }).click();
  await p.getByLabel('X', { exact: true }).fill('65'); await act(p, 'Update Point');
  await act(p, 'Undo'); await act(p, 'Redo'); await act(p, 'Undo');
  await p.getByRole('button', { name: 'Extrude', exact: true }).click(); await act(p, 'Extrude Profile');
  await page.screenshot({ path: resolve(output, 'l-construction.png') });
  const source = await qualify(page, 'named-lines-l', 'named-lines-l.firmament');
  expect(source).toContain('from: a'); expect(source).toContain('bottom |> right |> ledge |> upright |> top |> left |> Close');
  await page.getByRole('button', { name: 'IntelliDraft', exact: true }).click();
  await panel(page).getByText('Advanced construction objects and dimensions', { exact: true }).click();
  await expect(panel(page).getByRole('button', { name: 'Edit point b', exact: true })).toBeVisible();
});

test('a circle span and a chord form an exact D profile', async ({ page }) => {
  await start(page); const p = panel(page); await layout(p);
  await point(p, 'center', 0, 0); await point(p, 'lower', 0, -15); await point(p, 'upper', 0, 15);
  await p.getByRole('button', { name: 'Circle', exact: true }).click();
  await p.getByLabel('Radius', { exact: true }).fill('15'); await act(p, 'Add Circle');
  await p.getByRole('button', { name: 'Line', exact: true }).click(); await line(p, 'chord', 'upper', 'lower');
  await p.getByRole('button', { name: 'Trace', exact: true }).click();
  if (!await p.getByLabel('Guide', { exact: true }).isVisible()) await p.getByText('Manual guide trace', { exact: true }).click();
  await p.getByLabel('Guide', { exact: true }).selectOption('rim');
  await p.getByLabel('Trace a span between named points').check();
  await p.getByLabel('Span from').selectOption('lower'); await p.getByLabel('Span to').selectOption('upper');
  await act(p, 'Add to boundary');
  await p.getByLabel('Trace a span between named points').uncheck(); await p.getByLabel('Guide', { exact: true }).selectOption('chord'); await act(p, 'Add to boundary');
  await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  const source = await qualify(page, 'arc-chord-d', 'arc-chord-d.firmament');
  expect(source).toContain('rim from lower to upper as rimArc'); expect(source).toContain('radius: 15mm');
});

test('ordered distance and turn Path steps build a rounded outline', async ({ page }) => {
  await start(page); const p = panel(page); await advanced(p, 'Path'); await act(p, 'Add Path');
  const step = async (name: string, kind: string, size: number, turn: number) => {
    await p.getByRole('button', { name: kind + ' step', exact: true }).click();
    await p.getByLabel('Step name').fill(name); await p.getByLabel(kind === 'Line' ? 'Step length' : 'Arc radius').fill(String(size));
    await p.getByLabel('Turn', { exact: true }).fill(String(turn)); await act(p, 'Append step');
  };
  await step('bottom', 'Line', 40, 0); await step('right', 'Line', 20, 90); await step('corner', 'Arc', 10, 90); await step('top', 'Line', 30, 0);
  await act(p, 'Close Path with line'); await p.getByRole('button', { name: 'Trace this Path', exact: true }).click();
  await act(p, 'Trace Profile'); await p.getByLabel('Extrusion depth').fill('2'); await act(p, 'Extrude Profile');
  const source = await qualify(page, 'line-arc-path', 'line-arc-path.firmament');
  expect(source).toContain('Arc corner'); expect(source).toContain('Profile section from outline;');
});

test('two retained rectangles produce an L through canvas tracing and stay related after resizing', async ({ page }) => {
  await start(page); const p = panel(page);
  await expect(p.getByLabel('Construction name', { exact: true })).toHaveValue('rect1');
  await addShape(p, { name: 'outer', 'New width': 60, 'New height': 40, 'New center X': 0, 'New center Y': 0 }); await p.getByText('Advanced: explicit expression relationship', { exact: true }).click(); await act(p, 'Add related rectangle');
  await expect(p.getByLabel('Rectangle relationship')).toHaveValue('inset');
  await p.getByLabel('Wall thickness').fill('8'); await act(p, 'Add Rectangle');
  await expect(p.getByLabel('Width', { exact: true })).toHaveValue('52');
  await expect(p.getByLabel('Width', { exact: true })).toHaveAttribute('readonly', '');
  await expect(p.getByText('Driven by outerWidth - notchWall', { exact: true })).toBeVisible();
  await page.screenshot({ path: resolve(output, 'two-rectangles-construction.png') });
  await p.getByRole('button', { name: 'Trace', exact: true }).click();
  await span(p, 'outer.Bottom', 'outer.BottomLeft', 'outer.BottomRight');
  await span(p, 'outer.Right', 'outer.BottomRight', 'notch.BottomRight');
  await span(p, 'notch.Bottom', 'notch.BottomLeft', 'notch.BottomRight');
  await span(p, 'notch.Left', 'notch.TopLeft', 'notch.BottomLeft');
  await span(p, 'outer.Top', 'notch.TopLeft', 'outer.TopLeft');
  await span(p, 'outer.Left', 'outer.TopLeft', 'outer.BottomLeft');
  await expect(p.getByText('Outline closed ✓ · 6 edges')).toBeVisible();
  await expect(p.getByRole('list', { name: 'Trace order' }).locator('li')).toHaveCount(6);
  await page.screenshot({ path: resolve(output, 'two-rectangles-trace.png') });
  await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  const source = await qualify(page, 'rectangles-l', 'rectangles-l.firmament');
  expect((source.match(/Rect2\s/g) ?? []).length).toBe(2);
  expect(source).not.toMatch(/\b(?:Line2|Point2)\s/);
  expect(source).toContain('outerWidth - notchWall'); expect(source).toContain('notch.BottomRight');

  await page.getByRole('button', { name: 'IntelliDraft', exact: true }).click();
  await act(panel(page), 'Select outer');
  await panel(page).getByLabel('Width', { exact: true }).fill('80');
  await expect(panel(page).getByRole('button', { name: 'Build and use part', exact: true })).toBeDisabled();
  await expect(panel(page).getByRole('button', { name: 'Trace', exact: true })).toBeDisabled();
  await act(panel(page), 'Apply shape dimensions');
  await act(panel(page), 'Select notch'); await expect(panel(page).getByLabel('Width', { exact: true })).toHaveValue('72');
  await panel(page).getByLabel('notchWall', { exact: true }).fill('10'); await act(panel(page), 'Apply notchWall');
  await expect(panel(page).getByLabel('Width', { exact: true })).toHaveValue('70');
  await panel(page).getByLabel('notchWall', { exact: true }).fill('100');
  await panel(page).getByRole('button', { name: 'Apply notchWall', exact: true }).click();
  await expect(panel(page).getByRole('alert')).toBeVisible();
  await expect(panel(page).getByRole('button', { name: 'Build and use part', exact: true })).toBeDisabled();
  await panel(page).getByRole('button', { name: 'Discard notchWall edit', exact: true }).click();
  // The rejected edit keeps the candidate's accepted values and geometry.
  await expect(panel(page).getByLabel('notchWall')).toHaveValue('10');
  await qualify(page, 'rectangles-l-revised', 'rectangles-l-revised.firmament');
});

test('a rectangle can be traced as a complete outline without defining corner points', async ({ page }) => {
  await start(page); const p = panel(page); await addShape(p, {});
  await p.getByRole('button', { name: 'Trace', exact: true }).click();
  await act(p, 'Use whole rectangle outline'); await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  await p.getByRole('button', { name: 'Build and use part', exact: true }).click(); await expect(p).toHaveCount(0);
  await expect(page.locator('.status-ready')).toContainText('Ready');
});

// All geometry is authored through visible pointer/field interactions. DOM matrices
// only translate test pointer locations into the canvas's displayed world frame.
async function canvasPosition(p: Locator, x: number, y: number) {
  return p.getByRole('group', { name: 'Construction and Profile preview' }).evaluate((svg, point) => {
    const location = new DOMPoint(point[0], -point[1]).matrixTransform((svg as SVGSVGElement).getScreenCTM()!);
    return { x: location.x, y: location.y };
  }, [x, y]);
}
async function pointerDrag(page: Page, p: Locator, from: [number, number], to: [number, number], alt = false) {
  const a = await canvasPosition(p, ...from), b = await canvasPosition(p, ...to);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(b.x, b.y, { steps: 12 });
  if (!alt) { await expect(p.locator('.draft-alignment-guide')).not.toHaveCount(0); await page.screenshot({ path: resolve(output, 'soft-alignment-guides.png') }); }
  await page.mouse.up();
  if (alt) await page.keyboard.up('Alt');
  await expect(p.getByRole('status')).not.toContainText('Checking with compiler');
  await expect(p.getByRole('alert')).toHaveCount(0);
  await expect(p.locator('.draft-alignment-guide')).toHaveCount(0);
}

test('draw, dimension and independently drag rectangles with temporary alignment, then trace the L', async ({ page }) => {
  await start(page); const p = panel(page);
  await p.getByLabel('Construction name', { exact: true }).fill('outer');
  const first = await canvasPosition(p, -30, -20), last = await canvasPosition(p, 30, 20);
  await page.mouse.move(first.x, first.y); await page.mouse.down(); await page.mouse.move(last.x, last.y, { steps: 12 }); await page.mouse.up();
  await expect(p.getByLabel('Width', { exact: true })).toHaveValue('60');
  await expect(p.getByLabel('Height', { exact: true })).toHaveValue('40');
  // The rectangle tool stays active and proposes the next free name.
  await expect(p.getByLabel('Construction name', { exact: true })).toHaveValue('rect1');
  await p.getByLabel('Construction name', { exact: true }).fill('notch');
  const second = await canvasPosition(p, -20, -10), secondEnd = await canvasPosition(p, 0, 10);
  await page.mouse.move(second.x, second.y); await page.mouse.down(); await page.mouse.move(secondEnd.x, secondEnd.y, { steps: 12 }); await page.mouse.up();
  await expect(p.getByLabel('Width', { exact: true })).toHaveValue('20');
  await p.getByLabel('Width', { exact: true }).fill('52'); await p.getByLabel('Height', { exact: true }).fill('32'); await act(p, 'Apply shape dimensions');
  await select(p);
  // Independent notch starts centered at (-10,0). Near the target aligns top/right,
  // but source gets only its own numeric center, with no link to outer.
  await pointerDrag(page, p, [-10, 0], [3.8, 3.8]);
  await p.getByText('Placement', { exact: true }).click();
  await expect(p.getByLabel('Center X', { exact: true })).toHaveValue('4'); await expect(p.getByLabel('Center Y', { exact: true })).toHaveValue('4');
  await page.screenshot({ path: resolve(output, 'soft-aligned-rectangles.png') });
  // Alt deliberately permits near-but-unaligned placement. Undo restores only that rectangle.
  await pointerDrag(page, p, [4, 4], [3.8, 3.8], true);
  await p.getByText('Placement', { exact: true }).click();
  await expect(p.getByLabel('Center X', { exact: true })).toHaveValue('3.8');
  await act(p, 'Undo');
  for (const [cx, cy] of [[-4, -4], [-4, 4], [4, -4]]) {
    await pointerDrag(page, p, [4, 4], [cx + .2, cy + .2]);
    await p.getByText('Placement', { exact: true }).click();
    await expect(p.getByLabel('Center X', { exact: true })).toHaveValue(String(cx));
    await expect(p.getByLabel('Center Y', { exact: true })).toHaveValue(String(cy));
    await act(p, 'Undo');
  }
  // Cancel a gesture with Escape: no source transaction and no accidental modal close.
  const gestureStart = await canvasPosition(p, 4, 4), cancel = await canvasPosition(p, 10, 10);
  await page.mouse.move(gestureStart.x, gestureStart.y); await page.mouse.down(); await page.mouse.move(cancel.x, cancel.y, { steps: 5 }); await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(p).toBeVisible(); await expect(p.locator('.draft-gesture-preview')).toHaveCount(0);
  // Move the envelope independently and prove the notch does not follow. Restore it with Undo.
  await act(p, 'Select outer'); await pointerDrag(page, p, [-26, -16], [-19, -13], true);
  await p.getByText('Placement', { exact: true }).click();
  await expect(p.getByLabel('Center X', { exact: true })).toHaveValue('7'); await expect(p.getByLabel('Center Y', { exact: true })).toHaveValue('3');
  await act(p, 'Select notch'); await p.getByText('Placement', { exact: true }).click();
  await expect(p.getByLabel('Center X', { exact: true })).toHaveValue('4'); await expect(p.getByLabel('Center Y', { exact: true })).toHaveValue('4');
  await act(p, 'Undo');
  await p.getByRole('button', { name: 'Trace', exact: true }).click();
  for (const [edge, from, to] of [
    ['outer.Bottom', 'outer.BottomLeft', 'outer.BottomRight'], ['outer.Right', 'outer.BottomRight', 'notch.BottomRight'],
    ['notch.Bottom', 'notch.BottomLeft', 'notch.BottomRight'], ['notch.Left', 'notch.TopLeft', 'notch.BottomLeft'],
    ['outer.Top', 'notch.TopLeft', 'outer.TopLeft'], ['outer.Left', 'outer.TopLeft', 'outer.BottomLeft'],
  ]) await span(p, edge, from, to);
  await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  const source = await qualify(page, 'independent-rectangles-l', 'independent-rectangles-l.firmament');
  expect(source).toContain('Static notchCenterX: Length = 4mm'); expect(source).toContain('Static notchCenterY: Length = 4mm');
  expect(source).not.toContain('notchWall'); expect(source).not.toContain('outerWidth -');
  expect((source.match(/Rect2\s/g) ?? []).length).toBe(2); expect(source).not.toMatch(/\b(?:Point2|Line2)\s/);
});

for (const [kind, label] of [['Rect2', 'rectangle'], ['Circle2', 'circle'], ['Ellipse2', 'ellipse'], ['Slot2', 'slot'], ['RoundedRect2', 'rounded rectangle']]) {
  test(`draw ${kind}, move it, trace its full outline and qualify the exported part`, async ({ page }) => {
    await start(page); const p = panel(page);
    await p.getByRole('button', { name: `Draw ${label}`, exact: true }).click();
    await p.getByLabel('Construction name', { exact: true }).fill('outline');
    const a = await canvasPosition(p, -20, -10), b = await canvasPosition(p, 20, 10);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
    await expect(p.getByRole('button', { name: 'Select outline', exact: true })).toBeVisible();
    await expect(p.getByRole('alert')).toHaveCount(0);
    if (kind === 'RoundedRect2') { await p.getByLabel('Radius', { exact: true }).fill('2'); await act(p, 'Apply shape dimensions'); }
    await select(p); await pointerDrag(page, p, [0, 0], [5, 0], true);
    await p.getByText('Placement', { exact: true }).click(); await expect(p.getByLabel('Center X', { exact: true })).toHaveValue('5');
    await p.getByRole('button', { name: 'Trace', exact: true }).click();
    await act(p, kind === 'Rect2' ? 'Use whole rectangle outline' : 'Use whole shape outline');
    await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
    const source = await qualify(page, 'draw-' + kind.toLowerCase(), 'draw-' + kind.toLowerCase() + '.firmament');
    expect(source).toContain(kind + ' outline');
  });
}

test('a long mixed shape list scrolls, filters and hides construction without mutating the part', async ({ page }) => {
  await start(page); const p = panel(page);
  await addShape(p, { name: 'outline', 'New width': 40, 'New height': 20, 'New center X': 5, 'New center Y': 0 });
  const labels = ['circle', 'ellipse', 'slot', 'rounded rectangle', 'rectangle'];
  for (let i = 0; i < 15; i++) {
    await p.getByRole('button', { name: 'Draw ' + labels[i % labels.length], exact: true }).click();
    const kind = labels[i % labels.length], fields: Record<string, number | string> = { name: 'detail' + i, 'New center X': (i % 5) * 32 - 64, 'New center Y': Math.floor(i / 5) * 24 + 24 };
    if (kind !== 'circle') { fields[kind === 'slot' ? 'New overall length' : 'New width'] = 20; fields[kind === 'slot' ? 'New slot width' : 'New height'] = 12; }
    if (['circle', 'rounded rectangle'].includes(kind)) fields['New radius'] = 2;
    await addShape(p, fields, kind === 'rectangle' ? 'Add Rectangle' : 'Add shape');
  }
  await select(p); const list = p.getByRole('list', { name: 'Construction shape list' }); await expect(list.getByRole('listitem')).toHaveCount(16);
  await act(p, 'Fit construction'); await page.screenshot({ path: resolve(output, 'shape-list-many.png') });
  expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect(list.getByRole('button', { name: 'Select detail14', exact: true })).toBeInViewport();
  await p.getByLabel('Filter construction shapes').fill('detail14'); await expect(list.getByRole('listitem')).toHaveCount(1);
  await p.getByLabel('Show detail14', { exact: true }).uncheck(); await expect(p.getByRole('button', { name: 'Move detail14', exact: true })).toHaveCount(0);
  await p.getByRole('button', { name: 'Select detail14', exact: true }).click(); await expect(p.getByLabel('Show detail14', { exact: true })).not.toBeChecked();
  await p.getByRole('button', { name: 'Show all', exact: true }).click(); await expect(p.getByLabel('Show detail14', { exact: true })).toBeChecked();
  await p.getByLabel('Filter construction shapes').fill('');
  await p.getByRole('button', { name: 'Trace', exact: true }).click(); await act(p, 'Select outline');
  await act(p, 'Use whole rectangle outline'); await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  const before = await qualify(page, 'many-shapes', 'draw-rect2.firmament');
  await page.getByRole('button', { name: 'IntelliDraft', exact: true }).click();
  await panel(page).getByLabel('Filter construction shapes').fill('outline'); await panel(page).getByLabel('Show outline', { exact: true }).uncheck();
  await expect(panel(page).getByRole('button', { name: 'Move outline', exact: true })).toHaveCount(0);
  await page.screenshot({ path: resolve(output, 'shape-list-hidden.png') });
  const after = await qualify(page, 'many-shapes-hidden', 'draw-rect2.firmament');
  expect(after).toBe(before); expect((after.match(/detail\d+\s*\{/g) ?? []).length).toBe(15);
});

test('a vertically drawn slot retains its vertical orientation', async ({ page }) => {
  await start(page); const p = panel(page);
  await p.getByRole('button', { name: 'Draw slot', exact: true }).click(); await p.getByLabel('Construction name', { exact: true }).fill('outline');
  const a = await canvasPosition(p, -5, -20), b = await canvasPosition(p, 15, 20);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 10 }); await page.mouse.up();
  await expect(p.getByLabel('Rotation', { exact: true })).toHaveValue('90');
  await p.getByRole('button', { name: 'Trace', exact: true }).click(); await act(p, 'Use whole shape outline'); await act(p, 'Use this outline'); await act(p, 'Extrude Profile');
  await qualify(page, 'draw-slot2-vertical', 'draw-slot2-vertical.firmament');
});
