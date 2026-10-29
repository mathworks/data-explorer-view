// Copyright 2026 The MathWorks, Inc.
// What every gallery test shares: it fails on anything the page reports going wrong (a console
// error, an uncaught exception, a request that failed or was answered with an error status),
// and it knows the gallery's pages and how to pick a theme.
import { test as base, expect, type Page } from '@playwright/test';

export const PAGES = [
  'index.html',
  'tree-table.html',
  'property-inspector.html',
  'variable-editor.html',
  'context-menu.html',
  'error-dialog.html',
  'project-page.html',
  'hierarchy.html',
  'composed.html',
  'folder.html',
] as const;

export const test = base.extend<{ problems: string[] }>({
  problems: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`console error: ${m.text()}`);
      });
      page.on('pageerror', (e) => problems.push(`uncaught: ${e.message}`));
      page.on('requestfailed', (r) => problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
      page.on('response', (r) => {
        if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`);
      });
      await use(problems);
      expect(problems, 'what the page reported going wrong').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Picks a theme with the header's switch. */
export async function pickTheme(page: Page, theme: 'light' | 'dark' | 'high-contrast'): Promise<void> {
  await page.getByLabel('Theme', { exact: true }).selectOption(theme);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
}

const exactly = (text: string) => new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`);

/** The table's row whose Name reads `name` (a section's name has its count after it). */
export function row(page: Page, name: string) {
  return page
    .locator('dex-tree-table tr[role="row"][data-row-id]')
    .filter({ has: page.locator('td.col-Name .label', { hasText: exactly(name) }) });
}

/** The value the property inspector shows for the property `name`. */
export function property(page: Page, name: string) {
  return page
    .locator('dex-property-inspector .prop-row')
    .filter({ has: page.locator('.prop-name', { hasText: exactly(name) }) })
    .locator('.prop-value');
}

/** The variable editor's cells, in document order: row by row. */
export function gridCells(page: Page) {
  return page.locator('dex-variable-editor [role="gridcell"]');
}

/** One frame later: a widget that listens from the next frame on (a menu, an editor) is listening. */
export async function nextFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve(null))));
}
