import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const hero = '.knot-logo--hero';
test.beforeEach(async () => { await mkdir('artifacts/local/branding', { recursive: true }); });

test('the Aetheris GLB renders, rotates, and survives opening the CAD workspace', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.knot-logo[data-state=ready]')).toHaveCount(2);
  const canvas = page.locator(`${hero} canvas`), first = await canvas.screenshot();
  await page.waitForTimeout(1600); // Compare actual rendered orientations, not a mocked animation state.
  expect((await canvas.screenshot()).equals(first)).toBe(false);
  await page.screenshot({ path: 'artifacts/local/branding/home-light.png' });
  await page.locator('.welcome-header').screenshot({ path: 'artifacts/local/branding/header-light.png' });
  await page.locator('.welcome-brand').screenshot({ path: 'artifacts/local/branding/mark-light.png' });
  await page.locator('.welcome-lockup').screenshot({ path: 'artifacts/local/branding/lockup-light.png' });
  await page.getByRole('button', { name: 'Use dark theme', exact: true }).click();
  await page.screenshot({ path: 'artifacts/local/branding/home-dark.png' });
  await page.locator('.welcome-header').screenshot({ path: 'artifacts/local/branding/header-dark.png' });
  await page.locator('.welcome-brand').screenshot({ path: 'artifacts/local/branding/mark-dark.png' });
  await page.locator('.welcome-lockup').screenshot({ path: 'artifacts/local/branding/lockup-dark.png' });
  await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.locator('.brand .knot-logo[data-state=ready]')).toHaveCount(1);
  await page.screenshot({ path: 'artifacts/local/branding/workspace.png' });
  expect(errors).toEqual([]);
});

test('reduced motion keeps the actual model still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.locator(`${hero}[data-state=ready]`)).toHaveCount(1);
  const canvas = page.locator(`${hero} canvas`), first = await canvas.screenshot();
  await page.waitForTimeout(1600);
  expect((await canvas.screenshot()).equals(first)).toBe(true);
});

test('a failed asset falls back to the boxed H without blocking the app', async ({ page }) => {
  await page.route('**/branding/aetheris-knot.glb', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.knot-logo[data-state=fallback]')).toHaveCount(2);
  await expect(page.locator(`${hero} .knot-logo-fallback`)).toBeVisible();
  await expect(page.locator('.knot-logo canvas')).toHaveCount(0);
  await page.getByRole('button', { name: 'New part', exact: true }).click();
  await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.locator('.brand .knot-logo[data-state=fallback]')).toHaveCount(1);
});
