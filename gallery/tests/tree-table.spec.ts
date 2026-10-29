// Copyright 2026 The MathWorks, Inc.
// The tree table alone, fed by connectTable: each kind of file in a table, the file picker, the
// read-only switch, the selection it reports, moving the selection with the arrow keys, the rows
// a paint held back, the read-only menu and Ctrl+F.
import { expect, row, test } from './gallery';

const FILES = [
  { id: 'sldd-text', names: ['Design Data (20)', 'Array', 'Matrix', 'stringMatrix'] },
  { id: 'sldd-zip', names: ['Other Data (3)', 'a', 'fleetObject', 'vehicleObject'] },
  { id: 'mat', names: ['Mat', 'Mat(2,3)', 'Nd', 'Nd4'] },
  { id: 'slx', names: ['PlantGain', 'Trim', 'Params.SLDD'] },
];

for (const file of FILES) {
  test(`a ${file.id} file draws its rows`, async ({ page }) => {
    await page.goto(`tree-table.html?fixture=${file.id}`);
    for (const name of file.names) await expect(row(page, name)).toBeVisible();
    // Each row draws a cell per column the table shows.
    const cellsPerRow = await page.locator('dex-tree-table thead th[role="columnheader"]').count();
    await expect(row(page, file.names[1]).locator('td[role="gridcell"]')).toHaveCount(cellsPerRow);
  });
}

test('the file picker swaps the table and names the file in the URL', async ({ page }) => {
  await page.goto('tree-table.html');
  await expect(row(page, 'Matrix')).toBeVisible();
  await page.getByLabel('File', { exact: true }).selectOption('mat');
  await expect(row(page, 'Nd4')).toBeVisible();
  await expect(row(page, 'Matrix')).toHaveCount(0);
  await expect(page.locator('dex-tree-table')).toHaveCount(1);
  expect(new URL(page.url()).searchParams.get('fixture')).toBe('mat');
});

test('a click selects a row and the table says so', async ({ page }) => {
  await page.goto('tree-table.html');
  await row(page, 'Matrix').locator('td.col-Name').click();
  await expect(row(page, 'Matrix')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#event-log li').first()).toContainText('dex-row-selected');
  await expect(page.locator('#event-log li').first()).toContainText('/design/Matrix');
});

test('the arrow keys move the selection', async ({ page }) => {
  await page.goto('tree-table.html');
  await row(page, 'Array').locator('td.col-Name').click();
  await expect(row(page, 'Array')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'Array1')).toHaveAttribute('aria-selected', 'true');
  await expect(row(page, 'Array')).toHaveAttribute('aria-selected', 'false');
  await page.keyboard.press('ArrowDown');
  await expect(row(page, 'CellArray')).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowUp');
  await expect(row(page, 'Array1')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('dex-tree-table tr[aria-selected="true"]')).toHaveCount(1);
});

test('the read-only switch reaches the table', async ({ page }) => {
  await page.goto('tree-table.html');
  const grid = page.locator('dex-tree-table [role="treegrid"]');
  await expect(grid).toHaveAttribute('aria-readonly', 'true');
  await page.getByLabel('Read-only', { exact: true }).uncheck();
  await expect(grid).not.toHaveAttribute('aria-readonly', 'true');
  await expect(page.locator('dex-tree-table')).not.toHaveAttribute('readonly');
});

test('a row the paint held back opens onto its rows, under the banner that says so', async ({ page }) => {
  await page.goto('tree-table.html?fixture=sldd-text&budget=5');
  await expect(page.locator('dex-tree-table .banner-warning')).toContainText('This file is too large to load at once');
  const rows = page.locator('dex-tree-table tr[role="row"][data-row-id]');
  const before = await rows.count();
  await row(page, 'Array').locator('.toggle').click();
  await expect(row(page, 'Array')).toHaveAttribute('aria-expanded', 'true');
  await expect.poll(() => rows.count()).toBeGreaterThan(before);
  await expect(page.locator('#event-log li').filter({ hasText: 'dex-request-children' })).toHaveCount(1);
});

test('a right-click on a row opens the read-only menu', async ({ page }) => {
  await page.goto('tree-table.html');
  await row(page, 'Matrix').locator('td.col-Name').click({ button: 'right' });
  const menu = page.locator('dex-context-menu');
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.locator('.item-label')).toHaveText(['Copy Name', 'Copy Value']);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
});

test('Ctrl+F (Cmd+F) puts the caret in the search box', async ({ page }) => {
  await page.goto('tree-table.html');
  await row(page, 'Matrix').locator('td.col-Name').click();
  await page.keyboard.press('ControlOrMeta+f');
  const focused = () =>
    page.evaluate(() => {
      let el: Element | null = document.activeElement;
      while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
      return el?.tagName ?? '';
    });
  await expect.poll(focused).toBe('INPUT');
});
