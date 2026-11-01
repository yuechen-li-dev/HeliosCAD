import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

test('entrypoint initializes React refresh even when the HTML preamble is late', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/', async route => {
    const response = await route.fetch();
    const html = await response.text();
    expect(html).toContain('injectIntoGlobalHook(window)');
    // Force the startup ordering seen in the retained blank-page trace: allow
    // the application module graph to evaluate before HTML initializes refresh.
    await route.fulfill({ response, body: html.replace('<script type="module">import { injectIntoGlobalHook }', '<script type="module" async>import { injectIntoGlobalHook }')
      .replace('injectIntoGlobalHook(window);', 'await new Promise(resolve => setTimeout(resolve, 1500)); injectIntoGlobalHook(window);') });
  });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'New part', exact: true })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  expect(errors).toEqual([]);
});

test('reloads open a working editor and draft in both themes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await mkdir('artifacts/local/ui-polish', { recursive: true });
  await page.goto('/');
  for (let n = 0; n < 5; n++) {
    await expect(page.getByRole('button', { name: 'New part', exact: true })).toBeVisible();
    await page.reload();
  }
  await expect(page).toHaveTitle('Aetheris Helios');
  await expect(page.getByRole('heading', { name: 'Aetheris Helios', exact: true })).toBeVisible();
  await page.screenshot({ path: 'artifacts/local/ui-polish/home.png' });
  await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.getByRole('button', { name: 'Aetheris Helios home', exact: true })).toBeVisible();
  for (const theme of ['apollonia', 'bronze-age']) {
    await page.getByLabel('Theme', { exact: true }).selectOption(theme);
    await page.screenshot({ path: `artifacts/local/ui-polish/workspace-${theme}.png` });
    await page.getByRole('button', { name: 'IntelliDraft', exact: true }).click();
    const draft = page.getByRole('dialog', { name: 'IntelliDraft', exact: true });
    await expect(draft.getByLabel('Drawing axes X / Y', { exact: true })).toBeVisible();
    await draft.getByLabel('Drawing plane', { exact: true }).selectOption('XZ');
    await expect(draft.getByLabel('Drawing axes X / Z', { exact: true })).toBeVisible();
    await draft.getByText('Add by dimensions', { exact: true }).click();
    for (const [field, value] of Object.entries({ 'New width': '40', 'New height': '24', 'New center X': '0', 'New center Y': '0' })) await draft.getByLabel(field, { exact: true }).fill(value);
    await draft.getByRole('button', { name: 'Add Rectangle', exact: true }).click();
    await expect(draft.getByRole('button', { name: 'Select rect1', exact: true })).toBeVisible();
    await expect(draft.getByLabel('Drawing axes X / Z', { exact: true })).toBeVisible();
    await draft.getByRole('button', { name: 'Select and move', exact: true }).click();
    await draft.getByRole('button', { name: 'Zoom in construction', exact: true }).click();
    await page.screenshot({ path: `artifacts/local/ui-polish/draft-${theme}.png` });
    page.once('dialog', dialog => dialog.accept());
    await draft.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(draft).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});
