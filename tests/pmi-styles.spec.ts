import { test, expect } from '@playwright/test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
const out = 'artifacts/local/pmi-styles';

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
  await page.getByRole('button', { name: 'Export ▾', exact: true }).click();
  await page.getByRole('checkbox', { name: /^STEP AP242/ }).uncheck();
  await page.getByRole('checkbox', { name: /^glTF \/ GLB/ }).check();
  const download = page.waitForEvent('download', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Download selected format' }).click();
  const path = info.outputPath('bearing-mount.glb');
  await (await download).saveAs(path);
  const glb = await readFile(path);
  expect(glb.subarray(0, 4).toString()).toBe('glTF');
  const json = JSON.parse(glb.subarray(20, 20 + glb.readUInt32LE(12)).toString());
  const records = json.asset.extras.pmi as { name: string; stepFaceEntities: number[] }[];
  expect(records.find(r => r.name === 'BoreSize')?.stepFaceEntities.length).toBeGreaterThan(0);
  expect(records.find(r => r.name === 'BlockLength')?.stepFaceEntities.length).toBeGreaterThan(0);
  const backing = json.materials.filter((m: { name: string }) => m.name.startsWith('PMI panel '));
  expect(backing.length).toBeGreaterThan(10);
  expect(backing.every((m: { pbrMetallicRoughness: { baseColorFactor: number[] } }) => m.pbrMetallicRoughness.baseColorFactor[3] === 1)).toBe(true);
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
