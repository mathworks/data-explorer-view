// Copyright 2026 The MathWorks, Inc.
// The hierarchy page: the workspace folder read in the page, drawn as a tree a screen reader can
// walk, opened with the mouse and the keyboard, its marks, and a chosen file handed to the page.
import type { Page } from '@playwright/test';
import { expect, test } from './gallery';

const tree = (page: Page) => page.locator('dex-hierarchy').getByRole('tree', { name: 'Workspace' });
const item = (page: Page, name: string) =>
  tree(page).getByRole('treeitem').filter({ has: page.locator(`.label:text-is("${name}")`) });
const labels = (page: Page) => page.locator('dex-hierarchy [role="treeitem"] .label');

test('draws the folder, and opens it a level at a time with the mouse', async ({ page }) => {
  await page.goto('hierarchy.html');
  await expect(labels(page)).toHaveText(['workspace']);
  await expect(item(page, 'workspace')).toHaveAttribute('aria-expanded', 'false');
  await item(page, 'workspace').click();
  await expect(labels(page)).toHaveText(['workspace', 'binary.sldd', 'data.sldd', 'model.slx']);
  await expect(item(page, 'workspace')).toHaveAttribute('aria-expanded', 'true');
  await item(page, 'model.slx').locator('.twisty').click();
  await expect(labels(page)).toHaveText(['workspace', 'binary.sldd', 'data.sldd', 'model.slx', 'plant.slx', 'External Data']);
  await item(page, 'External Data').click();
  await expect(labels(page)).toHaveText([
    'workspace', 'binary.sldd', 'data.sldd', 'model.slx', 'plant.slx', 'External Data', 'params.sldd', 'signals.mat',
  ]);
  // A reference no file in the folder answers: a warning, and it says so.
  await expect(item(page, 'plant.slx').locator('svg.warning')).toBeVisible();
  await expect(item(page, 'plant.slx').locator('.description')).toHaveText('unresolved reference');
  await expect(item(page, 'params.sldd')).toHaveAttribute('aria-level', '4');
});

test('hands the page the file a chosen row opens', async ({ page }) => {
  await page.goto('hierarchy.html');
  await item(page, 'workspace').click();
  await item(page, 'data.sldd').click();
  await expect(item(page, 'data.sldd')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#event-log li').first()).toHaveText('file:///fixtures/workspace/data.sldd');
});

test('works from the keyboard: arrows, Right and Left, Home and End, Enter', async ({ page }) => {
  await page.goto('hierarchy.html');
  await expect(labels(page)).toHaveText(['workspace']);
  await item(page, 'workspace').focus();
  await page.keyboard.press('ArrowRight');
  await expect(labels(page)).toHaveCount(4);
  await page.keyboard.press('End');
  await expect(item(page, 'model.slx')).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(labels(page)).toHaveCount(6);
  await page.keyboard.press('ArrowRight');
  await expect(item(page, 'plant.slx')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(item(page, 'model.slx')).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(item(page, 'data.sldd')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#event-log li').first()).toHaveText('file:///fixtures/workspace/data.sldd');
  await page.keyboard.press('Home');
  await expect(item(page, 'workspace')).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(labels(page)).toHaveText(['workspace']);
});

test('marks a file with unsaved changes, and keeps what was open when the folder is read again', async ({ page }) => {
  await page.goto('hierarchy.html');
  await item(page, 'workspace').click();
  await expect(item(page, 'data.sldd').locator('.badge')).toHaveCount(0);
  await page.getByLabel('data.sldd has unsaved changes').check();
  await expect(item(page, 'data.sldd').locator('.badge')).toHaveText('●');
  await expect(item(page, 'data.sldd')).toContainText('Modified — unsaved changes in an open editor');
  await page.getByRole('button', { name: 'Read the folder again' }).click();
  await expect(labels(page)).toHaveText(['workspace', 'binary.sldd', 'data.sldd', 'model.slx']);
  await expect(item(page, 'data.sldd').locator('.badge')).toHaveText('●');
});
