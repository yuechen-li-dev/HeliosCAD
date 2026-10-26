import type { Page } from '@playwright/test';

export async function replaceEditorSource(page: Page, source: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), source);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}

/**
 * Click outward from the viewport centre until `found` holds. Picks depend on the viewport's size,
 * which the workbench layout decides, so tests search near the framed model instead of fixed pixels.
 */
export async function pickNearCenter(page: Page, found: () => Promise<boolean>, reach = 60, step = 5) {
  const canvas = page.locator('.viewport-canvas canvas');
  const box = (await canvas.boundingBox())!;
  const cx = box.width / 2, cy = box.height / 2;
  for (let r = 0; r <= reach; r += step)
    for (let a = 0; a < (r ? 16 : 1); a++) {
      const angle = a * Math.PI / 8;
      await canvas.click({ position: { x: cx + r * Math.cos(angle), y: cy - r * Math.sin(angle) } });
      if (await found()) return true;
    }
  return false;
}
