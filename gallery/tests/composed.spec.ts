// Copyright 2026 The MathWorks, Inc.
// The composed page: the table's selection fills the inspector, and the matrix glyph, in a
// Value cell or the inspector's Value row, opens the variable editor on the right cells.
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

test('a file chosen in the folder opens in the table, as one picked', async ({ page }) => {
  await page.goto('composed.html');
  const folder = page.locator('dex-hierarchy').getByRole('tree', { name: 'Folder' });
  await expect(folder.locator('.label')).toHaveText(['fixtures']);
  await folder.getByRole('treeitem').first().click();
  await expect(folder.locator('.label')).toHaveText([
    'fixtures', 'nd_numeric.mat', 'numeric_json.sldd', 'object_props_binary.sldd', 'shared_gain.slx',
  ]);
  await folder.getByRole('treeitem').filter({ has: page.locator('.label:text-is("nd_numeric.mat")') }).click();
  await expect(row(page, 'Mat')).toBeVisible();
  await expect(page.getByLabel('File', { exact: true })).toHaveValue('mat');
  await row(page, 'Nd').locator('td.col-Name').click();
  await expect(property(page, 'Name')).toHaveText('Nd');
});
