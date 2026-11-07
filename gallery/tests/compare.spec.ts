// Copyright 2026 The MathWorks, Inc.
// The app shell's compare, as a user reaches it: the text dictionary's tab menu, Compare With…, and
// the zip dictionary picked in the palette open a compare tab of the two, its header saying what
// differs; F7 selects the first change in both tables; and the compare is drawn light, then dark
// from Settings, each kept as a screenshot to look at.
import type { Page } from '@playwright/test';
import { APP, expect, keepScreenshot, test } from './gallery';

const exactly = (text: string) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);
/** The tab row's tab for `name`. */
const tab = (page: Page, name: string) => page.locator('dex-doc-tabs').getByRole('tab', { name, exact: true });
/** A compare table's selected rows, on the `side` it shows. */
const selected = (page: Page, side: 'left' | 'right') => page.locator(`dex-compare-view dex-tree-table[data-side="${side}"] tr[role="row"][aria-selected="true"]`);

test('compares the text dictionary with the zip one, steps to the change with F7, and draws it light and dark', async ({ page }) => {
  await page.goto(APP);
  await expect(tab(page, 'numeric_json.sldd')).toHaveAttribute('aria-selected', 'true');
  // Compare With… on the text dictionary's tab, then the zip dictionary among the open files.
  await tab(page, 'object_props_text.sldd').click({ button: 'right' });
  await page.locator('dex-context-menu').getByRole('menuitem', { name: 'Compare With…' }).click();
  await expect(page.locator('dex-command-palette [role="combobox"]')).toBeFocused();
  await page.locator('dex-command-palette [role="option"]').filter({ has: page.locator('.label', { hasText: exactly('object_props_binary.sldd') }) }).click();
  await expect(tab(page, 'object_props_text.sldd ↔ object_props_binary.sldd')).toHaveAttribute('aria-selected', 'true');
  const view = page.locator('dex-compare-view');
  await expect(view.locator('.summary')).toHaveText('1 changed');
  await expect(view.locator('.caption .name')).toHaveText(['object_props_text.sldd', 'object_props_binary.sldd']);
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
