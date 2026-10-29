// Copyright 2026 The MathWorks, Inc.
// Lit's dev mode, which an app's dev server runs (the chromium-dev project), warns about an
// element that schedules an update from inside the one finishing (change-in-update): an extra
// render each time, and noise in every app's console. No widget does. The built gallery runs
// Lit's production build, which warns of nothing, so there this passes by having nothing to say.
import { expect, gridCells, PAGES, test } from './gallery';

test('no widget updates from inside its own update', async ({ page }) => {
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'warning' && m.text().includes('change-in-update')) warnings.push(m.text());
  });
  for (const path of PAGES) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // The variable editor's grid measures its cells after each render: open it, and page through.
  await page.goto('variable-editor.html');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4', '5', '6']);
  await page.getByRole('button', { name: 'Nd (2x3x2 double)' }).click();
  await page.locator('dex-variable-editor').getByRole('button', { name: 'Next page' }).click();
  await expect(gridCells(page)).toHaveText(['7', '8', '9', '10', '11', '12']);
  expect(warnings).toEqual([]);
});
