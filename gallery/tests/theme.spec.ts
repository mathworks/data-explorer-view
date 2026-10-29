// Copyright 2026 The MathWorks, Inc.
// The theme switch: on every page it sets `data-theme`, the page and the widgets take the
// set's colours, and the choice outlives a reload.
import { expect, PAGES, pickTheme, test } from './gallery';
import type { Page } from '@playwright/test';

// --dex-color-text in each of theme.css's sets, as the page's own text.
const TEXT = { light: 'rgb(51, 51, 51)', dark: 'rgb(224, 224, 224)', 'high-contrast': 'rgb(0, 0, 0)' } as const;

// An element inside each page's widget whose colour comes from a token.
const PROBES: Partial<Record<(typeof PAGES)[number], string>> = {
  'tree-table.html': 'dex-tree-table th[role="columnheader"]',
  'composed.html': 'dex-tree-table th[role="columnheader"]',
  'property-inspector.html': 'dex-property-inspector .prop-name',
  'variable-editor.html': 'dex-variable-editor .panel',
  'project-page.html': '#project .identity .root',
};

async function colours(page: Page, probe: string | undefined): Promise<string[]> {
  const body = await page.evaluate(() => {
    const s = getComputedStyle(document.body);
    return [s.backgroundColor, s.color];
  });
  if (!probe) return body;
  const el = page.locator(probe).first();
  await expect(el).toBeVisible();
  return [...body, await el.evaluate((e) => `${getComputedStyle(e).color} on ${getComputedStyle(e).backgroundColor}`)];
}

for (const path of PAGES) {
  test(`${path}: the theme switch changes the colours`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    const probe = PROBES[path];
    const light = await colours(page, probe);
    expect(light[1]).toBe(TEXT.light);

    await pickTheme(page, 'dark');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).color)).toBe(TEXT.dark);
    const dark = await colours(page, probe);
    expect(dark[0]).not.toBe(light[0]);
    if (probe) expect(dark[2]).not.toBe(light[2]);

    await pickTheme(page, 'high-contrast');
    const contrast = await colours(page, probe);
    expect(contrast[1]).toBe(TEXT['high-contrast']);
    if (probe) expect(contrast[2]).not.toBe(light[2]);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'high-contrast');
    await expect(page.getByLabel('Theme', { exact: true })).toHaveValue('high-contrast');
  });
}

test('the context menu and the error dialog take the dark set', async ({ page }) => {
  const menuText = async () => {
    await page.goto('context-menu.html');
    await page.locator('#target').click({ button: 'right' });
    return page.locator('dex-context-menu .menu').evaluate((e) => getComputedStyle(e).color);
  };
  const dialogSurface = async () => {
    await page.goto('error-dialog.html');
    await page.getByRole('button', { name: 'Show an error' }).click();
    return page.locator('dex-error-dialog .dialog').evaluate((e) => getComputedStyle(e).backgroundColor);
  };
  const light = [await menuText(), await dialogSurface()];
  await page.goto('index.html');
  await pickTheme(page, 'dark');
  const dark = [await menuText(), await dialogSurface()];
  expect(light[0]).toBe(TEXT.light);
  expect(dark[0]).toBe(TEXT.dark);
  expect(dark[1]).not.toBe(light[1]);
});
