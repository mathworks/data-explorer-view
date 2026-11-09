// Copyright 2026 The MathWorks, Inc.
// Lit's dev mode, which an app's dev server runs (the chromium-dev project), warns about an
// element that schedules an update from inside the one finishing (change-in-update): an extra
// render each time, and noise in every app's console. No widget does, a table whose first render
// already has its rows (each of a compare's two) among them. The built gallery runs
// Lit's production build, which warns of nothing, so there this passes by having nothing to say.
import { APP, compareDictionaries, expect, gridCells, PAGES, test } from './gallery';

test('no widget updates from inside its own update', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('change-in-update')) warnings.push(m.text());
  });
  for (const path of [...PAGES, APP]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // The variable editor's grid measures its cells after each render: open it, and page through.
  await page.goto('variable-editor.html');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4', '5', '6']);
  await page.getByRole('button', { name: 'Nd (2x3x2 double)' }).click();
  await page.locator('dex-variable-editor').getByRole('button', { name: 'Next page' }).click();
  await expect(gridCells(page)).toHaveText(['7', '8', '9', '10', '11', '12']);
  // A table whose first render has its rows already: each of a compare's two.
  await page.goto(APP);
  await compareDictionaries(page);
  await expect(page.locator('dex-compare-view .summary')).toHaveText('1 changed');
  expect(warnings).toEqual([]);
});
