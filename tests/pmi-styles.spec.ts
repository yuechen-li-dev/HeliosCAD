import { test, expect, type Page, type TestInfo } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
const out = 'artifacts/local/pmi-styles';

async function downloadGlb(page: Page, info: TestInfo, filename: string) {
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  await page.getByRole('checkbox', { name: /^STEP AP242/ }).uncheck();
  await page.getByRole('checkbox', { name: /^glTF \/ GLB/ }).check();
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Download selected format' }).click();
  const path = info.outputPath(filename);
  await (await download).saveAs(path);
  const glb = await readFile(path);
  expect(glb.subarray(0, 4).toString()).toBe('glTF');
  const jsonEnd = 20 + glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, jsonEnd).toString());
  const positions = (index: number) => {
    const accessor = json.accessors[index];
    const view = json.bufferViews[accessor.bufferView];
    const start = jsonEnd + 8 + (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    return Array.from({ length: accessor.count }, (_, i) =>
      Array.from({ length: 3 }, (_, axis) => glb.readFloatLE(start + i * (view.byteStride ?? 12) + axis * 4)));
  };
  return { json, positions };
}

test('Bearing mount keeps its dimension callouts and readable backing panels in GLB', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Bearing mount', exact: true }).click();
  await expect(page.locator('.status-ready')).toHaveText('Ready');
  const legend = page.getByLabel('PMI annotations');
  await legend.getByRole('radio', { name: 'Drawing', exact: true }).click();
  await expect(legend).toContainText('BoreSize');
  await legend.getByRole('button', { name: 'Hide list' }).click();
  await expect(legend.getByRole('button', { name: 'Show list' })).toHaveAttribute('aria-expanded', 'false');
  await expect(legend).not.toContainText('BoreSize');
  for (const view of ['Top', 'Iso']) {
    await page.getByRole('button', { name: view, exact: true }).click();
    await page.screenshot({ path: info.outputPath(`bearing-mount-${view}.png`) });
  }
  const { json } = await downloadGlb(page, info, 'bearing-mount.glb');
  const records = json.asset.extras.pmi as { name: string; stepFaceEntities: number[] }[];
  expect(records.find(r => r.name === 'BoreSize')?.stepFaceEntities.length).toBeGreaterThan(0);
  expect(records.find(r => r.name === 'BlockLength')?.stepFaceEntities.length).toBeGreaterThan(0);
  const backing = json.materials.filter((m: { name: string }) => m.name.startsWith('PMI panel '));
  expect(backing.length).toBeGreaterThan(10);
  expect(backing.every((m: { pbrMetallicRoughness: { baseColorFactor: number[] } }) => m.pbrMetallicRoughness.baseColorFactor[3] === 1)).toBe(true);
});

test('Dragging the bore callout moves its whole stack in GLB, with the leader pinned', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Open Bearing mount', exact: true }).click();
  await expect(page.locator('.status-ready')).toHaveText('Ready');
  const legend = page.getByLabel('PMI annotations');
  await legend.getByRole('radio', { name: 'Drawing', exact: true }).click();
  await legend.getByRole('button', { name: 'Hide list' }).click();
  const baseline = await downloadGlb(page, info, 'bearing-default.glb');
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  const viewport = page.getByLabel('Model workspace');
  await viewport.hover();
  await page.mouse.wheel(0, 450); // Leave room for callouts outside the part.
  const callout = page.getByRole('button', { name: 'Move BoreSize', exact: true });
  const isUnderPointer = () => callout.evaluate(element => {
    const box = element.getBoundingClientRect();
    return document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2) === element;
  });
  await expect.poll(isUnderPointer).toBe(true);
  const initial = (await callout.getAttribute('points'))!;
  const box = (await callout.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await expect(callout).toHaveAttribute('data-dragging', 'true');
  await page.mouse.move(x - 45, y - 38, { steps: 8 });
  await expect(callout).not.toHaveAttribute('points', initial);
  await page.mouse.up();
  await expect(legend.getByRole('button', { name: 'Reset layout' })).toBeVisible();
  await page.getByRole('button', { name: 'Iso', exact: true }).click();
  await page.screenshot({ path: info.outputPath('bearing-arranged.png') });
  const arranged = await downloadGlb(page, info, 'bearing-arranged.glb');
  const annotation = (file: typeof arranged, name: string) => file.json.asset.extras.pmi.find((item: { name: string }) => item.name === name);
  const before = annotation(baseline, 'BoreSize'), after = annotation(arranged, 'BoreSize');
  const mesh = (file: typeof arranged, id: string) => file.json.meshes.find((m: { name: string }) => m.name === id);
  const buffers = (file: typeof arranged, id: string) => mesh(file, id).primitives.map((p: { attributes: { POSITION: number } }) => file.positions(p.attributes.POSITION));
  expect(after.anchor).toEqual(before.anchor);
  expect(after.target).toEqual(before.target);
  expect(after.stepFaceEntities).toEqual(before.stepFaceEntities);
  const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));
  const delta = after.labelPosition.map((v: number, i: number) => v - before.labelPosition[i]);
  expect(Math.hypot(...delta)).toBeGreaterThan(1);
  expect(Math.abs(delta[2])).toBeLessThan(1e-8);
  const [beforeLines, beforeText, beforePanel, beforeTarget] = buffers(baseline, before.id);
  const [afterLines, afterText, afterPanel, afterTarget] = buffers(arranged, after.id);
  expect(afterLines[0]).toEqual(beforeLines[0]);
  expect(distance(afterLines.at(-1), beforeLines.at(-1).map((v: number, j: number) => v + delta[j]))).toBeLessThan(0.0001);
  expect(afterTarget).toEqual(beforeTarget);
  for (const [old, moved] of [[beforeText, afterText], [beforePanel, afterPanel]]) {
    expect(moved).toHaveLength(old.length);
    for (let i = 0; i < old.length; i++) {
      // Text fill also contains a fixed leader arrow. Every other vertex moves by the same offset.
      expect(Math.min(distance(old[i], moved[i]), distance(old[i].map((v: number, j: number) => v + delta[j]), moved[i]))).toBeLessThan(0.0001);
    }
  }
  expect(distance(beforePanel[0].map((v: number, j: number) => v + delta[j]), afterPanel[0])).toBeLessThan(0.0001);
  const boreLocation = annotation(baseline, 'BoreLocation');
  expect(distance(boreLocation.labelPosition.map((v: number, j: number) => v + delta[j]), annotation(arranged, 'BoreLocation').labelPosition)).toBeLessThan(1e-8);
  expect(annotation(arranged, 'BlockLength')).toEqual(annotation(baseline, 'BlockLength'));
  await legend.getByRole('button', { name: 'Reset layout' }).click();
  await expect(legend.getByRole('button', { name: 'Reset layout' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Top', exact: true }).click();
  await expect(callout).toHaveAttribute('points', /,/);
  await callout.press('ArrowRight');
  await expect(legend.getByRole('button', { name: 'Reset layout' })).toBeVisible();
});

test('Markers number and colour each record over the view; Drawing shows the ASME presentation instead', async ({ page }) => {
  await mkdir(out, { recursive: true });
  let source = await readFile('fixtures/solidworks/part.firmament', 'utf8');
  source = source.replace(/\}\s*$/, `    Recognize part {
        Region Bore { kind: HoleShaft stepFaceEntities: ["#76", "#177"] }
    }
    Pmi {
        Datum A { target: part.face("#142") }
        Datum B { target: part.face("#163") }
        HoleDiameter BoreSize { target: part.region("Bore") value: 10mm tolerance: PlusMinus(0.02mm, 0.01mm) }
        Distance Thickness { between: [part.face("#142"), part.face("#163")] value: 9mm tolerance: PlusMinus(0.1mm, 0.1mm) }
        Position BorePos { target: part.region("Bore") tolerance: 0.05mm zone: Cylindrical datumRefs: [A] }
        Flatness TopFlat { target: part.face("#142") tolerance: 0.02mm }
        Note Material { text: "6061-T6" }
    }
}
`);
  const files: Record<string, Uint8Array> = { 'helios-workspace.json': Buffer.from(JSON.stringify({ schema: 'helios/workspace/1', root: 'part.firmament' })), 'part.firmament': Buffer.from(source), 'part.step': await readFile('fixtures/solidworks/part.step') };
  await writeFile(`${out}/pmi.zip`, zipSync(files));
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(`${out}/pmi.zip`);
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByLabel('PMI annotations')).toBeVisible();
  // One tag per record, numbered in Pmi order; a datum's tag is its letter alone.
  const markers = page.locator('.pmi-marker');
  await expect(markers).toHaveCount(7);
  await expect(page.locator('.pmi-marker[data-record="1"]')).toHaveText('1Datum A');
  await expect(page.locator('.pmi-marker[data-record="3"]')).toHaveText('3Ø10 +0.02/-0.01 · BoreSize');
  // No two tags overlap.
  const boxes = await markers.evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom]));
  for (const a of boxes) for (const b of boxes) if (a !== b) expect(a[0]! < b[2]! && a[2]! > b[0]! && a[1]! < b[3]! && a[3]! > b[1]!).toBe(false);
  await page.screenshot({ path: `${out}/markers.png` });
  await page.getByRole('radio', { name: 'Drawing', exact: true }).click();
  await expect(page.getByRole('radio', { name: 'Drawing', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.pmi-marker')).toHaveCount(0);
  await page.screenshot({ path: `${out}/drawing.png` });
  await page.getByRole('button', { name: 'Front', exact: true }).click(); await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/drawing-front.png` });
  // The choice is remembered for this browser.
  await page.reload(); await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('banner').locator('input[type=file]').setInputFiles(`${out}/pmi.zip`);
  await expect(page.getByRole('radio', { name: 'Drawing', exact: true })).toHaveAttribute('aria-checked', 'true');
});
