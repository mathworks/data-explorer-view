// Copyright 2026 The MathWorks, Inc.
// The composed page: the table's selection fills the inspector, and the matrix glyph, in a
// Value cell or the inspector's Value row, opens the variable editor on the right cells.
import type { Page } from '@playwright/test';
import { expect, gridCells, property, row, test } from './gallery';

test('selecting a row fills the inspector, and a section row empties it', async ({ page }) => {
  await page.goto('composed.html');
  const inspector = page.locator('dex-property-inspector');
  const placeholder = page.locator('#inspector-empty');
  await expect(placeholder).toBeVisible();
  await expect(inspector).toBeHidden();

  await row(page, 'Matrix').locator('td.col-Name').click();
  await expect(inspector).toBeVisible();
  await expect(placeholder).toBeHidden();
  await expect(property(page, 'Name')).toHaveText('Matrix');
  await expect(property(page, 'Value')).toContainText('[1 2; 3 4]');
  await expect(property(page, 'Class')).toHaveText('double');

  await row(page, 'Design Data (20)').locator('td.col-Name').click();
  await expect(inspector).toBeHidden();
  await expect(placeholder).toBeVisible();
});

test('the inspector follows the selection the arrow keys move', async ({ page }) => {
  await page.goto('composed.html');
  await row(page, 'Array').locator('td.col-Name').click();
  await expect(property(page, 'Name')).toHaveText('Array');
  await page.keyboard.press('ArrowDown');
  await expect(property(page, 'Name')).toHaveText('Array1');
});

test("a Value cell's matrix glyph opens the variable editor on its cells", async ({ page }) => {
  await page.goto('composed.html');
  await row(page, 'Matrix').locator('dex-matrix-open a').click();
  const editor = page.locator('dex-variable-editor');
  await expect(editor).toHaveAttribute('open', '');
  await expect(editor.getByRole('dialog')).toHaveAccessibleName('Matrix — 2x2 double');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4']);
  await page.keyboard.press('Escape');
  await expect(editor).not.toHaveAttribute('open', '');
});

test("the inspector's matrix glyph opens the same editor", async ({ page }) => {
  await page.goto('composed.html');
  await row(page, 'stringMatrix').locator('td.col-Name').click();
  await page.locator('dex-property-inspector dex-matrix-open a').click();
  await expect(page.locator('dex-variable-editor').getByRole('dialog')).toHaveAccessibleName(
    'stringMatrix — 2x2 string',
  );
  await expect(gridCells(page)).toHaveText(['"abc"', '"de"', '"f"', '"gh i"']);
});

test('another file: a MAT-file variable opens on its own cells', async ({ page }) => {
  await page.goto('composed.html');
  await page.getByLabel('File', { exact: true }).selectOption('mat');
  await row(page, 'Mat').locator('dex-matrix-open a').click();
  await expect(page.locator('dex-variable-editor').getByRole('dialog')).toHaveAccessibleName('Mat — 2x3 double');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4', '5', '6']);
  await row(page, 'Nd').locator('td.col-Name').click();
  await expect(page.locator('dex-variable-editor')).not.toHaveAttribute('open', '');
  await expect(property(page, 'Name')).toHaveText('Nd');
});

const folderItem = (page: Page, name: string) =>
  page
    .locator('dex-hierarchy')
    .getByRole('tree', { name: 'Folder' })
    .getByRole('treeitem')
    .filter({ has: page.locator(`.label:text-is("${name}")`) });

test('a file chosen in the folder opens in the table, as one picked', async ({ page }) => {
  await page.goto('composed.html');
  const labels = page.locator('dex-hierarchy').getByRole('tree', { name: 'Folder' }).locator('.label');
  await expect(labels).toHaveText(['fixtures', 'usageorder']);
  await folderItem(page, 'fixtures').click();
  await expect(labels).toHaveText([
    'fixtures', 'nd_numeric.mat', 'numeric_json.sldd', 'object_props_binary.sldd', 'shared_gain.slx', 'usageorder',
  ]);
  await folderItem(page, 'nd_numeric.mat').click();
  await expect(row(page, 'Mat')).toBeVisible();
  await expect(page.getByLabel('File', { exact: true })).toHaveValue('mat');
  await row(page, 'Nd').locator('td.col-Name').click();
  await expect(property(page, 'Name')).toHaveText('Nd');
});

test("a dictionary's Usage names the blocks of both models, and a click opens the model on the block", async ({ page }) => {
  await page.goto('composed.html');
  // The dictionary is referenced by both models, so it is under each one's External Data.
  await folderItem(page, 'usageorder').click();
  await folderItem(page, 'ctrlA.slx').locator('.twisty').click();
  await folderItem(page, 'External Data').click();
  await folderItem(page, 'sharedParams.sldd').click();
  await expect(page.getByLabel('File', { exact: true })).toHaveValue('usageorder-sharedParams.sldd');
  const usage = row(page, 'SharedGain').locator('td.col-UsedBy');
  await expect(usage).toHaveText('GainA, LimitA(ctrlA); GainB(plantB)');
  // The first link: the column is narrow beside two panes, and clips the rest of the cell.
  await usage.getByRole('link', { name: 'GainA' }).click();
  await expect(page.getByLabel('File', { exact: true })).toHaveValue('usageorder-ctrlA.slx');
  await expect(row(page, 'GainA')).toHaveAttribute('aria-selected', 'true');
});

test('the search finds an entry by name, across the folders, and opens its file on it', async ({ page }) => {
  await page.goto('composed.html');
  const search = page.getByRole('searchbox', { name: 'Search entries' });
  const results = page.getByRole('list', { name: 'Matching entries' }).getByRole('button');
  // By name or by file: shared_gain.slx's blocks match on their file's name.
  await search.fill('gain');
  await expect(results).toHaveText([
    /GainA\s*ctrlA\.slx$/,
    /GainB\s*plantB\.slx$/,
    /PlantGain\s*shared_gain\.slx$/,
    /SharedGain\s*sharedParams\.sldd$/,
    /Trim\s*shared_gain\.slx$/,
  ]);
  // Every result draws its icon.
  await expect(results.locator('dex-icon img')).toHaveCount(5);
  await results.filter({ hasText: 'GainB' }).click();
  await expect(page.getByLabel('File', { exact: true })).toHaveValue('usageorder-plantB.slx');
  await expect(row(page, 'GainB')).toHaveAttribute('aria-selected', 'true');
  await search.fill('');
  await expect(results).toHaveCount(0);
});
