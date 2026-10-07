import { test, expect } from "@playwright/test";

test("surface inspection preserves source selection through packed face isolation", async ({ page }) => {
  await page.goto("/tests/three-telos-witness.html");
  await page.waitForFunction(() => window.heliosTelosQualification?.compiled);
  await page.getByText("Surface / trim inspection", { exact: true }).click();
  const canvas = page.getByLabel("Engineering WebGPU viewport");
  const state = () => canvas.evaluate(element => JSON.parse(element.getAttribute("data-surface-inspection") ?? "{}"));
  for (const theme of ["Sirius", "Mars"]) {
    await page.getByRole("button", {name: theme + " viewport"}).click();
    await expect.poll(() => canvas.evaluate(element => JSON.parse(element.getAttribute("data-telos-presentation") ?? "{}").id)).toBe(theme.toLowerCase());
  }
  let camera: unknown;
  for (const mode of ["surfaces", "wire", "overlay", "patches"]) {
    await page.getByLabel("Surface inspection view").selectOption(mode);
    await expect.poll(async () => (await state()).mode).toBe(mode);
    const current = await state();
    if (camera) expect(current.camera).toEqual(camera); else camera = current.camera;
    if (mode === "wire") expect(current.visibleMeshes + current.visibleFields).toBe(0);
    if (mode === "surfaces") expect(current.visibleEdges).toBe(0);
  }
  await page.getByLabel("Surface inspection view").selectOption("surfaces");
  const box = await canvas.boundingBox(); expect(box).not.toBeNull();
  await canvas.click({ position: { x: box!.width / 2, y: box!.height / 2 } });
  await expect.poll(async () => (await state()).visibleMeshes).toBe(1);
  const isolated = (await state()).isolatedFace;
  const hit = await canvas.evaluate(element => JSON.parse(element.getAttribute("data-surface-inspection-pick") ?? "null"));
  expect(isolated.faceId).toBe(hit.faceId);
  expect(isolated.occurrenceId).toBe(hit.occurrenceId);
  const selected = await page.evaluate(() => window.heliosTelosQualification.selected);
  expect(selected?.faceId).toBe(String(hit.faceId));
  expect(selected?.occurrenceId).toBe(hit.occurrenceId);
});
