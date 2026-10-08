import { test, expect } from '@playwright/test';
import { replaceEditorSource } from './editor';

test('Inter is loaded throughout the IDE and wrapping keeps long source clear of the scrollbar', async ({ page }) => {
  await page.goto('/local');
  await expect(page.locator('.status-ready')).toContainText('READY');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('14px "Inter Variable"'))).toBe(true);
  for (const selector of ['.topbar', '.view-lines', '.line-numbers', '.dock-output']) {
    expect(await page.locator(selector).first().evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter Variable');
  }
  const comment = `  // ${'Long source remains readable beside its scrollbar. '.repeat(12)}`;
  const source = `Model WrapWitness {\n${Array.from({ length: 60 }, () => comment).join('\n')}\n Box Body { Size: [24mm, 18mm, 8mm] }\n}`;
  await replaceEditorSource(page, source);
  const wrap = page.getByRole('button', { name: 'Toggle word wrap' });
  await expect(wrap).toHaveAttribute('aria-pressed', 'false');
  const gutter = page.locator('.code-editor .editor-scrollable > .scrollbar.vertical');
  expect(await gutter.evaluate(element => getComputedStyle(element).backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
  await wrap.click();
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  const textFits = async () => page.locator('.code-editor').evaluate(element => {
    const right = element.querySelector('.editor-scrollable > .scrollbar.vertical')!.getBoundingClientRect().left;
    return Array.from(element.querySelectorAll('.view-line')).every(line => {
      const range = document.createRange(); range.selectNodeContents(line);
      return Array.from(range.getClientRects()).every(rect => rect.right <= right + 1);
    });
  });
  await expect.poll(textFits).toBe(true);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(textFits).toBe(true);
  await page.screenshot({ path: 'artifacts/local/p4-03/editor-word-wrap.png' });
  await page.getByRole('textbox', { name: 'Editor content', exact: true }).press('Alt+z');
  await expect(wrap).toHaveAttribute('aria-pressed', 'false');
  await wrap.click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Toggle word wrap' })).toHaveAttribute('aria-pressed', 'true');
  const terminal = page.getByRole('tab', { name: 'Terminal · local', exact: true });
  if (await terminal.count()) {
    await terminal.click();
    expect(await page.getByLabel('Terminal output').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter Variable');
    expect(await page.getByLabel('Terminal command').evaluate(element => getComputedStyle(element).fontFamily)).toContain('Inter Variable');
  }
});
