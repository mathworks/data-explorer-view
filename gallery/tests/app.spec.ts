// Copyright 2026 The MathWorks, Inc.
// The app shell's page: a whole app in one element, connectShell over the browser host, the
// gallery's files open as tabs and a folder in the Explorer. It loads with nothing going wrong
// under the strict policy (the shared fixture fails a test on a console error); the toolbar, the
// location bar, the Explorer, the tabs and the inspector are there; a dictionary chosen in the
// folder opens as a tab and a row of the Explorer; a row selected fills the inspector (again back
// from Root), the location bar and Raw; Root shows the relationship graph; the Explorer's button
// folds the left side away; Settings' Dark draws the app dark, and still after a reload; and the
// command palette opens on F1 and runs Show Log.
import type { Page } from '@playwright/test';
import { APP, expect, test } from './gallery';

const exactly = (text: string) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
/** The tab row's tab for `name`. */
const tab = (page: Page, name: string) => page.locator('dex-doc-tabs').getByRole('tab', { name, exact: true });
/** A row of the active tab's table, by its Name. */
const tableRow = (page: Page, name: string) =>
  page
    .locator('.doc-panel:not([hidden]) dex-tree-table tr[role="row"][data-row-id]')
    .filter({ has: page.locator('td.col-Name .label', { hasText: exactly(name) }) });
/** The Explorer's row for an open file. */
const explorerRow = (page: Page, name: string) => page.locator('dex-explorer').getByRole('treeitem', { name, exact: true });
/** The folder's tree row for a file. */
const folderRow = (page: Page, name: string) => page.locator('dex-hierarchy').getByRole('treeitem', { name, exact: true }).first();
/** A view's button on the shell's activity bars. */
const viewButton = (page: Page, view: string) => page.locator(`dex-app-shell button[data-view="${view}"]`);

/** The page, its files open: the last of the gallery's active. */
async function opened(page: Page): Promise<void> {
  await page.goto(APP);
  await expect(tab(page, 'shared_gain.slx')).toHaveAttribute('aria-selected', 'true');
  await expect(folderRow(page, 'ctrlA.slx')).toBeVisible();
}

test('lays the app out: the toolbar, the location bar, the Explorer, the tabs and the inspector', async ({ page }) => {
  await opened(page);
  for (const part of ['dex-toolbar', 'dex-location-bar', 'dex-explorer', 'dex-doc-tabs', 'dex-shell-view[view="properties"]']) {
    await expect(page.locator(part), part).toBeVisible();
  }
  // The inspector says what to do while nothing is selected.
  await expect(page.locator('.dex-inspector-empty')).toHaveText('Select an entry to view its properties.');
  await expect(page.locator('dex-doc-tabs [role="tab"]')).toHaveCount(4);
  await expect(page).toHaveTitle('shared_gain.slx — Data Explorer');
  // The toolbar, named for the app, with Folder, as the browser host shows folders.
  await expect(page.locator('dex-toolbar [role="toolbar"]')).toHaveAttribute('aria-label', 'Data Explorer');
  await expect(page.locator('dex-toolbar button').filter({ hasText: exactly('Folder') })).toBeVisible();
});

test("opens a dictionary chosen in the folder, as a tab and a row of the Explorer's open files", async ({ page }) => {
  await opened(page);
  await folderRow(page, 'sharedParams.sldd').click();
  // A file looked at in the folder opens as a preview, which the next one takes the place of.
  await expect(tab(page, 'sharedParams.sldd, preview')).toHaveAttribute('aria-selected', 'true');
  await expect(explorerRow(page, 'sharedParams.sldd')).toBeVisible();
  await expect(tableRow(page, 'SharedGain')).toBeVisible();
});

test('fills the inspector, the location bar and Raw with the row selected', async ({ page }) => {
  await opened(page);
  await tab(page, 'numeric_json.sldd').click();
  await tableRow(page, 'Array').locator('td.col-Name').click();
  await expect(tableRow(page, 'Array')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('dex-property-inspector .prop-row').first()).toBeVisible();
  await expect(page.locator('.dex-inspector-empty')).toBeHidden();
  await expect(page.locator('dex-location-bar .segment[aria-current="location"] .label')).toHaveText('Array');
  // Root and back: the row is still the inspector's.
  await page.locator('dex-location-bar .segment').first().click();
  await expect(page.locator('.dex-inspector-empty')).toBeVisible();
  await tab(page, 'numeric_json.sldd').click();
  await expect(page.locator('dex-property-inspector .prop-row').first()).toBeVisible();
  // And Raw, in the inspector's place on the right.
  await viewButton(page, 'raw').click();
  await expect(page.locator('dex-raw-viewer pre')).toContainText('"Array"');
  await expect(page.locator('dex-raw-viewer .header .label')).toHaveText('Array');
});

test('shows the relationship graph at Root, the open files and the folder in it', async ({ page }) => {
  await opened(page);
  await page.locator('dex-location-bar .segment').first().click();
  await expect(page.locator('dex-doc-tabs [role="tab"][aria-selected="true"]')).toHaveCount(0);
  await expect(page.locator('dex-relationship-graph')).toBeVisible();
  for (const file of ['ctrlA.slx', 'sharedParams.sldd', 'shared_gain.slx']) {
    await expect(page.locator('dex-relationship-graph .box').filter({ has: page.locator('.label', { hasText: exactly(file) }) }), file).toBeVisible();
  }
  // A model's items, shown by its + button.
  await page.locator('dex-relationship-graph button[aria-label="Show the items of ctrlA.slx"]').click();
  await expect(page.locator('dex-relationship-graph button[aria-label="Hide the items of ctrlA.slx"]')).toBeVisible();
});

test("folds the left side away with the Explorer's button, and shows it again", async ({ page }) => {
  await opened(page);
  await viewButton(page, 'explorer').click();
  await expect(page.locator('dex-explorer')).toBeHidden();
  await expect(viewButton(page, 'explorer')).toHaveAttribute('aria-pressed', 'false');
  await viewButton(page, 'explorer').click();
  await expect(page.locator('dex-explorer')).toBeVisible();
});

test("draws the app dark from Settings' Dark, and still after a reload", async ({ page }) => {
  await opened(page);
  await page.locator('dex-app-shell button[data-action="settings"]').click();
  await page.locator('dex-settings-panel [role="radio"]').filter({ hasText: exactly('Dark') }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(tab(page, 'shared_gain.slx')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('opens the command palette on F1, and runs Show Log from it', async ({ page }) => {
  await opened(page);
  await page.keyboard.press('F1');
  await expect(page.locator('dex-command-palette [role="combobox"]')).toBeFocused();
  await page.keyboard.type('Show Log');
  await page.keyboard.press('Enter');
  await expect(page.locator('dex-command-palette [role="combobox"]')).toBeHidden();
  await expect(page.locator('dex-log-panel')).toBeVisible();
  await expect(page.locator('dex-log-panel')).toContainText('Opened shared_gain.slx');
});
