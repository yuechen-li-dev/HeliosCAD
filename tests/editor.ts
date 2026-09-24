import type { Page } from '@playwright/test';

export async function replaceEditorSource(page: Page, source: string) {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(text => navigator.clipboard.writeText(text), source);
  await page.locator('.monaco-editor .view-lines').click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
}
