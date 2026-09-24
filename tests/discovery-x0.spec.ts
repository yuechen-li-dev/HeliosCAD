import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const password = 'Discovery-Correct-Password-2026!';

test('gallery remains readable on mobile in Mars and Sirius', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.gallery-card')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const card of await page.locator('.gallery-card').all()) {
    await card.scrollIntoViewIfNeeded();
    await expect(card.locator('img')).toHaveJSProperty('complete', true);
    expect(await card.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/discovery-mobile-mars.png', fullPage: true });
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('sirius');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'sirius');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/discovery-mobile-sirius.png', fullPage: true });
});

test('Cartesian lamp shows its two authored sources and exact STEP artifact', async ({ page }) => {
  await page.goto('/m/cartesian-lamp');
  await expect(page.getByRole('heading', { name: 'Cartesian lamp' })).toBeVisible();
  await page.getByRole('button', { name: 'View Source' }).click();
  await expect(page.locator('.detail-source')).toContainText('Assembly CartesianLamp');
  await expect(page.locator('.detail-source')).toContainText('lamp-shade-loft.firmament');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download STEP' }).click();
  const download = await downloadPromise;
  const hash = createHash('sha256').update(await readFile((await download.path())!)).digest('hex').toUpperCase();
  expect(hash).toBe('1388CA985A1002E80A356F086B238A63FC9CD03FD7ED4C1755398BD7E9FCDCEF');
  await page.getByRole('button', { name: 'Explore editable shade' }).click();
  await expect(page.getByRole('heading', { name: 'Cartesian lamp shade' })).toBeVisible();
});

test('anonymous discovery, source, auth-then-fork, and real editor', async ({ page }) => {
  const runtimeRequests: string[] = [];
  page.on('request', request => { if (/aetheris|worker|\.wasm/i.test(request.url())) runtimeRequests.push(request.url()); });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Explore models. Make one yours.' })).toBeVisible();
  await expect(page.locator('.gallery-card')).toHaveCount(8);
  console.log('DISCOVERY_HOME_VISIBLE_MS', await page.evaluate(() => Math.round(performance.now())));
  await page.getByRole('searchbox', { name: 'Search models' }).fill('offset');
  await expect(page.locator('.gallery-card')).toHaveCount(1);
  await page.locator('.gallery-card').click();
  await expect(page.getByRole('heading', { name: 'Cartesian lamp shade' })).toBeVisible();
  await page.getByRole('button', { name: 'View Source' }).click();
  await expect(page.locator('.detail-source')).toContainText('Model CartesianLampShade');
  expect(runtimeRequests).toEqual([]);
  await page.getByRole('button', { name: 'Fork', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Discovery User');
  await page.getByLabel('Email').fill(`discovery-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.locator('.monaco-editor')).toBeVisible();
  await expect(page.locator('.view-lines')).toContainText('CartesianLampShade');
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 90000 });
  await expect(page.locator('.statusbar')).toContainText('0 DIAGNOSTICS');
  await page.locator('.cloud-project-bar').getByRole('button', { name: 'Discover' }).click();
  await expect(page.getByRole('heading', { name: 'Explore models. Make one yours.' })).toBeVisible();
  await page.getByRole('button', { name: 'My Projects' }).click();
  await expect(page.locator('.project-row > button:first-child')).toContainText('Cartesian lamp shade Copy');
});

test('publish saved revision and keep private edits out of public detail', async ({ browser, page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'My Projects' }).click();
  await page.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await page.getByLabel('Name').fill('Publisher');
  await page.getByLabel('Email').fill(`publish-${Date.now()}@example.test`);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByLabel('Project name').fill('Publication box');
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.status-ready')).toContainText('READY', { timeout: 90000 });
  await page.locator('.cloud-editor-actions').getByRole('button', { name: 'Publish' }).click();
  await page.getByRole('form', { name: 'Publish model' }).getByLabel('Description').fill('Published revision test');
  await page.getByRole('form', { name: 'Publish model' }).getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByRole('form', { name: 'Publish model' })).toHaveCount(0);
  await page.locator('.cloud-project-bar').getByRole('button', { name: 'Discover' }).click();
  await expect(page.locator('.gallery-card')).toHaveCount(9);
  await page.getByRole('searchbox', { name: 'Search models' }).fill('Publication box');
  await page.locator('.gallery-card').click();
  await page.getByRole('button', { name: 'View Source' }).click();
  await expect(page.locator('.detail-source')).toContainText('Model Untitled');
  await expect(page.locator('.detail-source')).toContainText('40mm');
  const link = page.url();
  const anonymous = await browser.newContext();
  const visitor = await anonymous.newPage();
  await visitor.goto(link);
  await expect(visitor.locator('.detail-source')).toHaveCount(0);
  await visitor.getByRole('button', { name: 'Fork', exact: true }).click();
  await visitor.getByRole('button', { name: 'New to Helios? Create an account' }).click();
  await visitor.getByLabel('Name').fill('Visitor');
  await visitor.getByLabel('Email').fill(`visitor-${Date.now()}@example.test`);
  await visitor.getByLabel('Password').fill(password);
  await visitor.getByRole('button', { name: 'Create account' }).click();
  await expect(visitor.locator('.view-lines')).toContainText('Model Untitled');
  await expect(visitor.locator('.status-ready')).toContainText('READY', { timeout: 90000 });
  await anonymous.close();
});



