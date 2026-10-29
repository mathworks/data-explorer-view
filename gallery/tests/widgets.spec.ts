// Copyright 2026 The MathWorks, Inc.
// The widgets that are not a table: the property inspector, the variable editor, the context
// menu, the error dialog and the project page, each on its own page.
import { expect, gridCells, nextFrame, property, test } from './gallery';

test('the property inspector shows the entry picked', async ({ page }) => {
  await page.goto('property-inspector.html');
  await expect(property(page, 'Name')).toHaveText('Array');
  await page.getByLabel('Entries', { exact: true }).selectOption({ label: 'Matrix' });
  await expect(property(page, 'Name')).toHaveText('Matrix');
  await expect(page.locator('dex-property-inspector dex-matrix-open')).toHaveCount(1);

  await page.getByLabel('File', { exact: true }).selectOption('sldd-zip');
  await expect(page.getByLabel('Entries', { exact: true }).locator('option')).toHaveText(['a', 'fleetObject', 'vehicleObject']);
  await page.getByLabel('Entries', { exact: true }).selectOption({ label: 'fleetObject' });
  await expect(property(page, 'Name')).toHaveText('fleetObject');
});

test('the variable editor opens on a matrix, and pages through an N-D array', async ({ page }) => {
  await page.goto('variable-editor.html');
  const dialog = page.locator('dex-variable-editor').getByRole('dialog');
  await expect(dialog).toHaveAccessibleName('Mat — 2x3 double');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4', '5', '6']);

  await page.getByRole('button', { name: 'Nd (2x3x2 double)' }).click();
  await expect(dialog).toHaveAccessibleName('Nd — 2x3x2 double');
  await expect(gridCells(page)).toHaveText(['1', '2', '3', '4', '5', '6']);
  await page.locator('dex-variable-editor').getByRole('button', { name: 'Next page' }).click();
  await expect(gridCells(page)).toHaveText(['7', '8', '9', '10', '11', '12']);

  await page.locator('dex-variable-editor').getByRole('button', { name: 'Close' }).click();
  await expect(page.locator('dex-variable-editor')).not.toHaveAttribute('open', '');
});

test('the context menu opens on a right-click and sends the item picked', async ({ page }) => {
  await page.goto('context-menu.html');
  await page.locator('#target').click({ button: 'right' });
  const menu = page.locator('dex-context-menu');
  await expect(menu).toHaveAttribute('open', '');
  await expect(menu.locator('.item-label')).toHaveText(['Cut "Gain"', 'Copy "Gain"', 'Paste', 'Delete "Gain"']);
  await expect(menu.getByRole('menuitem', { name: 'Paste' })).toHaveAttribute('aria-disabled', 'true');
  await menu.getByRole('menuitem', { name: 'Copy "Gain"' }).click();
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(page.locator('#event-log li').first()).toHaveText('dex-action {"actionId":"copy"}');
});

test('the context menu works from the keyboard', async ({ page }) => {
  await page.goto('context-menu.html');
  await page.locator('#target').focus();
  await page.keyboard.press('Shift+F10');
  const menu = page.locator('dex-context-menu');
  await expect(menu).toHaveAttribute('open', '');
  await nextFrame(page);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(menu).not.toHaveAttribute('open', '');
  await expect(page.locator('#event-log li').first()).toHaveText('dex-action {"actionId":"copy"}');

  await page.locator('#target').focus();
  await page.keyboard.press('Shift+F10');
  await expect(menu).toHaveAttribute('open', '');
  await nextFrame(page);
  await page.keyboard.press('Escape');
  await expect(menu).not.toHaveAttribute('open', '');
});

test('the error dialog shows an error, and Escape gives the focus back', async ({ page }) => {
  await page.goto('error-dialog.html');
  // From the keyboard: a click does not focus a button in WebKit, so there would be no focus
  // to give back.
  const opener = page.getByRole('button', { name: 'Show an error' });
  await opener.focus();
  await page.keyboard.press('Enter');
  const dialog = page.locator('dex-error-dialog').getByRole('alertdialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Could not open the file');
  await expect(dialog).toContainText('no data dictionary part was found');
  await expect(dialog.getByRole('button', { name: 'OK' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});

test('the error dialog offers Revert for a refused edit', async ({ page }) => {
  await page.goto('error-dialog.html');
  await page.getByRole('button', { name: 'Show a refused edit' }).click();
  const dialog = page.locator('dex-error-dialog').getByRole('alertdialog');
  await expect(dialog).toContainText('[1 2; 3');
  await expect(dialog).toContainText('[1 2; 3 4]');
  await dialog.getByRole('button', { name: 'Revert' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#event-log li').first()).toHaveText('dex-revert');
});

test("the project page draws a project and follows a reference to another", async ({ page }) => {
  await page.goto('project-page.html');
  const title = page.locator('#project h1');
  await expect(title).toHaveText('MyProj');
  await expect(page.locator('#project')).toContainText('Runs automatically');
  await expect(page.locator('#project')).toContainText('3 of 7 members labelled');

  await page.locator('#project [data-open="startup.m"]').click();
  await expect(page.locator('#event-log li').first()).toHaveText('startup.m');

  await page.locator('#project [data-open="../LibProj"]').click();
  await expect(title).toHaveText('LibProj');
  await expect(page.getByLabel('Project', { exact: true })).toHaveValue('LibProj');
});

test('the project page draws in its own shadow root, with its stylesheet adopted', async ({ page }) => {
  await page.goto('project-page.html');
  await expect(page.locator('#project h1')).toHaveText('MyProj');
  const drawn = await page.locator('dex-project-page').evaluate((el) => ({
    adopted: el.shadowRoot!.adoptedStyleSheets.length,
    styleElements: el.shadowRoot!.querySelectorAll('style').length,
    inDocument: document.querySelectorAll('.dex-page').length,
    // A page rule reaches nothing in it: the document's own `.row`, were there one, is not the page's.
    width: getComputedStyle(el.shadowRoot!.querySelector('.dex-page')!).maxWidth,
  }));
  expect(drawn).toEqual({ adopted: expect.any(Number), styleElements: 0, inDocument: 0, width: '860px' });
  expect(drawn.adopted).toBeGreaterThan(0);
  // Enter on a focused link follows it, as a click does.
  await page.locator('#project [data-open="startup.m"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#event-log li').first()).toHaveText('startup.m');
});
