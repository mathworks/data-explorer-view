// Copyright 2026 The MathWorks, Inc.
// What every gallery test shares: it fails on anything the page reports going wrong (a console
// error, an uncaught exception, a request that failed or was answered with an error status, a
// page served by another checkout's gallery); every navigation after its first waits for the
// page's requests to settle; and it knows the gallery's pages, how to pick a theme, how to open the
// app page's compare, and how to keep a screenshot to look at.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { test as base, expect, type Locator, type Page } from '@playwright/test';

/** The gallery these tests are of: what its servers say in X-Dex-Gallery (vite.config.ts). */
const GALLERY = realpathSync(resolve(import.meta.dirname, '..'));

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

/**
 * The app shell's page, which the index lists too: the window is the app's, with no gallery header
 * (its theme is the shell's own Settings), so the tests of the header's pages are not its; app.spec.ts
 * is, and the policy and dev-mode checks take it as well.
 */
export const APP = 'app.html';

/** The page's requests, for a test that must not cut one off (`network`). */
export interface Network {
  /**
   * Resolves once no request of the page is in flight, and none has started or ended, nor the
   * page loaded, for `quietMs`: a widget still drawing asks for its icons in bursts, and Firefox
   * asks for the page's favicon just after its load. A navigation would abort a request still
   * loading, and the failed request would fail the test; every page.goto() after a test's first,
   * and every page.reload(), waits for this first (the `page` fixture below).
   */
  settled(quietMs?: number): Promise<void>;
}

/** The requests in flight of each page, and when that last changed (or the page loaded). */
const traffic = new WeakMap<Page, { inFlight: number; changed: number }>();

function track(page: Page): void {
  const t = { inFlight: 0, changed: Date.now() };
  const touch = () => void (t.changed = Date.now());
  page.on('request', () => (t.inFlight++, touch()));
  page.on('requestfinished', () => (t.inFlight--, touch()));
  page.on('requestfailed', () => (t.inFlight--, touch()));
  // What a browser asks for of its own after a load (Firefox: the favicon) starts after it.
  page.on('load', touch);
  traffic.set(page, t);
}

async function settle(page: Page, quietMs = 250): Promise<void> {
  const t = traffic.get(page)!;
  await expect
    .poll(() => t.inFlight === 0 && Date.now() - t.changed >= quietMs, { message: 'the page stops loading', intervals: [50] })
    .toBe(true);
}

export const test = base.extend<{ problems: string[]; network: Network }>({
  // The page, whose every navigation after its first, and every reload, first lets what the page
  // is loading finish: a navigation aborts it, and the aborted request (NS_BINDING_ABORTED in
  // Firefox, an icon, a fixture, the favicon) would fail the test. Nothing is ignored: a request
  // that fails for any reason still fails the test (`problems`).
  page: async ({ page }, use) => {
    track(page);
    let navigated = false;
    const goto = page.goto.bind(page);
    const reload = page.reload.bind(page);
    page.goto = async (url, options) => {
      if (navigated) await settle(page);
      navigated = true;
      return goto(url, options);
    };
    page.reload = async (options) => {
      await settle(page);
      return reload(options);
    };
    await use(page);
  },
  network: async ({ page }, use) => {
    await use({ settled: (quietMs) => settle(page, quietMs) });
  },
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
        // A page another checkout's server answered would be a test of that checkout's code. Only
        // a page's own content is checked: a 304 (a reload, a page visited again) carries no
        // header and no content, and the copy it keeps was checked when it came, in this test's
        // own browser context.
        const from = r.headers()['x-dex-gallery'];
        if (r.request().resourceType() === 'document' && r.status() < 300 && from !== GALLERY) {
          problems.push(`${r.url()} was served by ${from === undefined ? 'a server that is not a gallery' : `the gallery at ${from}`}, not ${GALLERY}`);
        }
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

/**
 * On the app page, its files open: Compare With… on the text dictionary's tab, and the zip one
 * picked among the open files in the palette. Done once the compare's tab is the active one.
 */
export async function compareDictionaries(page: Page): Promise<void> {
  const tab = (name: string) => page.locator('dex-doc-tabs').getByRole('tab', { name, exact: true });
  await expect(tab('numeric_json.sldd')).toHaveAttribute('aria-selected', 'true');
  await tab('object_props_text.sldd').click({ button: 'right' });
  await page.locator('dex-context-menu').getByRole('menuitem', { name: 'Compare With…' }).click();
  await expect(page.locator('dex-command-palette [role="combobox"]')).toBeFocused();
  await page.locator('dex-command-palette [role="option"]').filter({ has: page.locator('.label', { hasText: exactly('object_props_binary.sldd') }) }).click();
  await expect(tab('object_props_text.sldd ↔ object_props_binary.sldd')).toHaveAttribute('aria-selected', 'true');
}

/**
 * Keep a screenshot of `target` (the page, or an element of it) as `name` in the test's output
 * folder, for a person to look at. Not in WebKit: its screenshot first adds a <style> to the page,
 * to line up its animations, the page's policy refuses it, and the refusal is a console error that
 * fails the test.
 */
export async function keepScreenshot(page: Page, name: string, target: Page | Locator = page): Promise<void> {
  if (page.context().browser()?.browserType().name() === 'webkit') return;
  await target.screenshot({ path: test.info().outputPath(name) });
}
