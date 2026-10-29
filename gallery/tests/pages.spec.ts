// Copyright 2026 The MathWorks, Inc.
// Every page loads with nothing going wrong (the shared fixture fails a test on a console
// error, an uncaught exception or a failed request) and every icon on it draws.
import { expect, PAGES, test } from './gallery';

// The pages whose widgets draw icons from the package, by the bundler's copies.
const WITH_ICONS = new Set(['tree-table.html', 'hierarchy.html', 'composed.html', 'folder.html']);

for (const path of PAGES) {
  test(`${path} loads and draws every icon`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('header.bar nav a[aria-current="page"], .pages a').first()).toBeVisible();
    await page.waitForLoadState('networkidle');
    const icons = page.locator('dex-icon img');
    if (WITH_ICONS.has(path)) await expect(icons.first()).toBeVisible();
    // Files the build copied, never data: URLs (build.assetsInlineLimit: 0).
    const sources = await icons.evaluateAll((imgs) => (imgs as HTMLImageElement[]).map((img) => img.src));
    expect(sources.filter((src) => !/\.svg$/.test(src))).toEqual([]);
    // decode() rejects for an image that did not load, in every engine.
    const broken = await icons.evaluateAll((imgs) =>
      Promise.all(
        (imgs as HTMLImageElement[]).map((img) =>
          img.decode().then(
            () => '',
            () => img.src,
          ),
        ),
      ),
    );
    expect(broken.filter(Boolean)).toEqual([]);
  });
}

test('the index links every page', async ({ page }) => {
  await page.goto('index.html');
  const links = page.locator('.pages a');
  await expect(links).toHaveCount(PAGES.length - 1);
  for (const path of PAGES.slice(1)) await expect(page.locator(`.pages a[href="./${path}"]`)).toBeVisible();
});
