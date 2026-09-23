import { test, expect } from '@playwright/test';

test('Helix palette command builds through the installed Aetheris runtime', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Helix Witness');
  await page.getByLabel('Email').fill(`helix-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('Correct-Helios-Password-2026');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Your projects' })).toBeVisible();
  await page.getByLabel('Project name').fill('Helix witness');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('textbox', { name: 'Firmament source' })).toBeVisible();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await page.getByRole('button', { name: /Command Palette/ }).click();
  await page.getByLabel('Search commands').fill('Helix');
  await page.getByRole('button', { name: /New Helix Model/ }).click();
  await expect(page.getByRole('textbox', { name: 'Firmament source' })).toHaveValue(/Helix Winding/);
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 120_000 });
  await expect(page.locator('.statusbar')).toContainText('1 DEFS');
  await page.getByRole('button', { name: /PROBLEMS/ }).click();
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
});
