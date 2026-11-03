import { expect, test, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { replaceEditorSource } from './editor';

const fixture = await readFile('../Aetheris/fixtures/Language/Editor/parameterized-plate.firmament', 'utf8');
const assemblyFixture = await readFile('../Aetheris/fixtures/Canonical/Learn/06-post-on-plate.firmament', 'utf8');
const editor = (page: Page) => page.getByRole('textbox', { name: 'Editor content', exact: true });
async function sourceText(page: Page) {
  await editor(page).press('Escape'); await editor(page).press('ControlOrMeta+a'); await editor(page).press('ControlOrMeta+c');
  const source = await page.evaluate(() => navigator.clipboard.readText());
  await editor(page).press('ArrowRight'); return source.replaceAll('\r\n', '\n');
}
async function cursorAt(page: Page, source: string, offset: number) {
  await editor(page).press('Escape'); await editor(page).press('ControlOrMeta+Home');
  const lines = source.slice(0, offset).split('\n');
  for (let line = 1; line < lines.length; line++) await editor(page).press('ArrowDown');
  for (let column = 0; column < lines.at(-1)!.length; column++) await editor(page).press('ArrowRight');
}
const suggest = async (page: Page) => { await editor(page).press('ControlOrMeta+Space'); return page.locator('.suggest-widget.visible'); };
async function buildCurrent(page: Page) {
  await page.getByRole('tab', { name: 'Output', exact: true }).click();
  const before = ((await page.locator('.dock-output').textContent())?.match(/Build finished/g) ?? []).length;
  await page.getByRole('button', { name: 'Build', exact: true }).click();
  await expect.poll(async () => ((await page.locator('.dock-output').textContent())?.match(/Build finished/g) ?? []).length).toBeGreaterThan(before);
  await expect(page.locator('.status-ready')).toContainText('Ready');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/local'); await expect(page.locator('.status-ready')).toContainText('Ready');
  await page.getByRole('tab', { name: 'Source', exact: true }).click();
});

test('document and solid templates insert complete source with name tab stops; mid-word fields retain one colon', async ({ page }) => {
  await replaceEditorSource(page, 'Mo'); await expect(await suggest(page)).toContainText('Model');
  await editor(page).press('Enter'); await page.keyboard.type('demoPart'); await editor(page).press('Tab');
  const model = await sourceText(page);
  expect(model).toContain('Model demoPart'); expect(model).toContain('Box body');
  await buildCurrent(page);

  const draft = 'Model demoPart {\n  units: mm\n  Cy\n}\n';
  await replaceEditorSource(page, draft); await cursorAt(page, draft, draft.indexOf('Cy') + 2);
  await expect(await suggest(page)).toContainText('Cylinder');
  await editor(page).press('Enter'); await page.keyboard.type('stock'); await editor(page).press('Tab');
  const cylinder = await sourceText(page);
  expect(cylinder).toContain('Cylinder stock'); expect(cylinder.match(/Model /g)).toHaveLength(1);
  await cursorAt(page, cylinder, cylinder.indexOf('radius') + 2);
  await expect(await suggest(page)).toContainText('radius'); await editor(page).press('Enter');
  const completed = await sourceText(page); expect(completed).toBe(cylinder); expect(completed).not.toContain('radius: dius');
  await buildCurrent(page);
});

test('live diagnostics underline the actual token, clear after repair, and comments stay quiet', async ({ page }) => {
  const invalid = 'Model m {\n  units: mm\n  Box stock { size: [40mm, 30mm, 8mm]; wrong: 1mm }\n}\n';
  await replaceEditorSource(page, invalid);
  await expect(page.locator('.squiggly-error').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Problems', exact: true }).click();
  await expect(page.locator('.dock-errors')).toContainText("Unknown field 'wrong'");
  await cursorAt(page, invalid, invalid.indexOf('wrong') - 1); await editor(page).press('F8');
  await expect(page.locator('.zone-widget')).toContainText("Unknown field 'wrong'"); await editor(page).press('Escape');
  const repaired = invalid.replace('; wrong: 1mm', ''); await replaceEditorSource(page, repaired);
  await expect(page.locator('.squiggly-error')).toHaveCount(0); await expect(page.locator('.dock-errors')).toContainText('No problems.');
  const comment = repaired.replace('  Box', '  // Box radius: }\n  Box'); await replaceEditorSource(page, comment);
  await cursorAt(page, comment, comment.indexOf('// Box') + '// Bo'.length); await suggest(page);
  await expect(page.locator('.suggest-widget.visible .monaco-list-row')).toHaveCount(0);
});

test('formatter shortcut is idempotent and undoable; find and comment shortcuts work', async ({ page }) => {
  const ugly = 'Model demo{units:mm;\n// keep this comment\nBox stock{size:[40mm,30mm,8mm]}}\n';
  await replaceEditorSource(page, ugly); await editor(page).press('Shift+Alt+f');
  await expect(page.locator('.view-lines')).toContainText('Model demo {');
  const formatted = await sourceText(page); expect(formatted).toContain('keep this comment'); expect(formatted).toContain('40mm');
  await page.getByRole('button', { name: 'Format document', exact: true }).click(); expect(await sourceText(page)).toBe(formatted);
  await editor(page).press('ControlOrMeta+z'); expect(await sourceText(page)).toBe(ugly);
  await cursorAt(page, ugly, ugly.indexOf('Box')); await editor(page).press('ControlOrMeta+/');
  expect(await sourceText(page)).toMatch(/\/\/\s*Box stock/);
  await editor(page).press('ControlOrMeta+f'); await expect(page.locator('.find-widget.visible')).toBeVisible();
  await page.keyboard.type('stock'); await expect(page.locator('.find-widget')).toContainText('1 of 1'); await page.keyboard.press('Escape');

  const invalid = 'Model unfinished {\n'; await replaceEditorSource(page, invalid); await editor(page).press('Shift+Alt+f');
  await expect(page.locator('.bottom-dock')).toContainText('Fix syntax errors first');
  await page.getByRole('tab', { name: 'Output', exact: true }).click();
  await expect(page.locator('.dock-output')).toContainText('Format refused'); expect(await sourceText(page)).toBe(invalid);
});

test('local values complete and Feature definitions navigate through the current project snapshot', async ({ page }) => {
  await replaceEditorSource(page, fixture); const value = fixture.lastIndexOf('thickness');
  await cursorAt(page, fixture, value + 3); await expect(await suggest(page)).toContainText('thickness'); await editor(page).press('Escape');
  const call = fixture.lastIndexOf('mountHole'); await cursorAt(page, fixture, call + 3); await editor(page).press('F12');
  await expect.poll(async () => { await editor(page).press('ControlOrMeta+c'); return page.evaluate(() => navigator.clipboard.readText()); }).toContain('Feature mountHole');

  const split = assemblyFixture.indexOf('Assembly PostOnPlate'), library = assemblyFixture.slice(0, split), root = 'include "parts/library.firmament"\n' + assemblyFixture.slice(split);
  const archive = zipSync({
    'helios-workspace.json': Buffer.from(JSON.stringify({ schema: 'helios/workspace/1', root: 'root.firmament' })),
    'root.firmament': Buffer.from(root), 'parts/library.firmament': Buffer.from(library),
  });
  await page.getByRole('banner').locator('input[type=file]').setInputFiles({ name: 'editor.helios.zip', mimeType: 'application/zip', buffer: Buffer.from(archive) });
  await expect(page.locator('.workspace-identity')).toContainText('root.firmament'); await expect(page.locator('.status-ready')).toContainText('Ready');
  await expect(page.locator('.statusbar')).toContainText('2 definitions');
  await expect(page.locator('.statusbar')).not.toContainText('Out of date');
  await cursorAt(page, root, root.indexOf('BasePlate') + 3); await editor(page).press('F12');
  await expect(page.locator('.workspace-identity')).toContainText('parts/library.firmament');
  await expect(page.locator('.view-lines')).toContainText('Struct BasePlate');
  await mkdir('artifacts/local/language-polish', { recursive: true });
  await page.screenshot({ path: 'artifacts/local/language-polish/project-definition.png', fullPage: true });
});
