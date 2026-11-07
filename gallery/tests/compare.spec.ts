// Copyright 2026 The MathWorks, Inc.
// The app shell's compare, as a user reaches it: the text dictionary's tab menu, Compare With…, and
// the zip dictionary picked in the palette open a compare tab of the two, its header saying what
// differs and the gaps on the left offering no twisty; F7 selects the first change in both tables;
// and the compare is drawn light, then dark from Settings, each kept as a screenshot to look at.
import type { Page } from '@playwright/test';
import { APP, compareDictionaries, expect, keepScreenshot, test } from './gallery';

const exactly = (text: string) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
/** A compare table's selected rows, on the `side` it shows. */
const selected = (page: Page, side: 'left' | 'right') => page.locator(`dex-compare-view dex-tree-table[data-side="${side}"] tr[role="row"][aria-selected="true"]`);

test('compares the text dictionary with the zip one, steps to the change with F7, and draws it light and dark', async ({ page }) => {
  await page.goto(APP);
  // Compare With… on the text dictionary's tab, then the zip dictionary among the open files.
  await compareDictionaries(page);
  const view = page.locator('dex-compare-view');
  await expect(view.locator('.summary')).toHaveText('1 changed');
  await expect(view.locator('.caption .name')).toHaveText(['object_props_text.sldd', 'object_props_binary.sldd']);
  // Each heading counts its own file's entries, as the file's table does: a, fleetObject and
  // vehicleObject on both sides, though only fleetObject differs and is shown.
  await expect(view.locator('dex-tree-table tr.section-row td.col-Name .label')).toHaveText(['Other Data (3)', 'Other Data (3)']);
  // The zip file's Notes and the rows under it, gaps on the left: hatched, and with no twisty.
  await expect(view.locator('dex-tree-table[data-side="left"] tr.diff-gap')).toHaveCount(5);
  await expect(view.locator('dex-tree-table[data-side="left"] tr.diff-gap[aria-expanded]')).toHaveCount(0);
  await expect(view.locator('dex-tree-table[data-side="left"] tr.diff-gap .toggle:not(.empty)')).toHaveCount(0);
  // F7: the change, one line selected in both tables.
  await page.keyboard.press('F7');
  await expect(selected(page, 'left')).toHaveCount(1);
  await expect(selected(page, 'right')).toHaveCount(1);
  await keepScreenshot(page, 'compare-light.png');
  // Settings' Dark, the compare still shown.
  await page.locator('dex-app-shell button[data-action="settings"]').click();
  await page.locator('dex-settings-panel [role="radio"]').filter({ hasText: exactly('Dark') }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.keyboard.press('Escape');
  await expect(view).toBeVisible();
  await keepScreenshot(page, 'compare-dark.png');
});
