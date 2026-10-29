// Copyright 2026 The MathWorks, Inc.
// The served-folder page: a folder read across a MessageChannel (serveFolder, folderReader), its
// tree open at the top level, a link in the table opening the file the tree shows for it, in
// another of the folder's folders, and the tree showing the file the table shows.
import type { Page } from '@playwright/test';
import { expect, row, test } from './gallery';

const tree = (page: Page) => page.locator('dex-hierarchy').getByRole('tree', { name: 'Served folder' });
const items = (page: Page, name: string) =>
  tree(page).getByRole('treeitem').filter({ has: page.locator(`.label:text-is("${name}")`) });
const item = (page: Page, name: string) => items(page, name).first();
const labels = (page: Page) => page.locator('dex-hierarchy [role="treeitem"] .label');
const selected = (page: Page) => tree(page).locator('[role="treeitem"][aria-selected="true"]');
const opened = (page: Page) => page.locator('#event-log li');
const ROOT = 'file:///fixtures/served';

test('reads the folder across a channel: the tree, and the bytes of a file it opens', async ({ page }) => {
  await page.goto('folder.html');
  await expect(item(page, 'ctrlA.slx')).toBeVisible();
  await item(page, 'ctrlA.slx').click();
  await expect(opened(page).first()).toHaveText(`${ROOT}/models/ctrlA.slx`);
  await expect(page.locator('#shown')).toHaveText('models/ctrlA.slx');
  await expect(row(page, 'GainA')).toBeVisible();
});

test("opens the folder's top level on first show, and keeps what the user closes", async ({ page }) => {
  await page.goto('folder.html');
  await expect(labels(page)).toHaveText(['data', 'sharedParams.sldd', 'models', 'ctrlA.slx', 'plantB.slx', 'workspace', 'data.sldd', 'model.slx']);
  for (const group of ['data', 'models', 'workspace']) await expect(item(page, group)).toHaveAttribute('aria-expanded', 'true');
  await item(page, 'models').locator('.twisty').click();
  await expect(labels(page)).toHaveText(['data', 'sharedParams.sldd', 'models', 'workspace', 'data.sldd', 'model.slx']);
  await expect(item(page, 'models')).toHaveAttribute('aria-expanded', 'false');
});

test('shows the file the table shows: the rows above it opened, and it selected', async ({ page }) => {
  await page.goto('folder.html');
  await item(page, 'model.slx').click();
  await expect(row(page, 'params.sldd')).toBeVisible();
  // params.sldd is a row only under model.slx's External Data: a link to it opens both.
  await row(page, 'params.sldd').locator('a.value-link').click();
  await expect(page.locator('#shown')).toHaveText('workspace/params.sldd');
  await expect(selected(page)).toHaveCount(1);
  await expect(selected(page).locator('.label')).toHaveText('params.sldd');
  await expect(selected(page)).toHaveAttribute('aria-level', '4');
  await expect(item(page, 'External Data')).toHaveAttribute('aria-expanded', 'true');
  await expect(selected(page)).toBeInViewport();
});

test('a link in the table opens the file the tree shows for its name, in another folder', async ({ page }) => {
  await page.goto('folder.html');
  await item(page, 'ctrlA.slx').click();
  // GainA's value is SharedGain of sharedParams.sldd, which is in data/, not beside the model.
  await row(page, 'GainA').locator('td.col-UsedBy a.value-link').click();
  await expect(opened(page).first()).toHaveText(`${ROOT}/data/sharedParams.sldd`);
  await expect(page.locator('#shown')).toHaveText('data/sharedParams.sldd');
  await expect(row(page, 'SharedGain')).toHaveAttribute('aria-selected', 'true');
  // And the tree shows it: its row in data/, the shallowest of its rows.
  await expect(selected(page).locator('.label')).toHaveText('sharedParams.sldd');
  await expect(selected(page)).toHaveAttribute('aria-level', '2');
});

test('says when the folder was cut short: a last row, after every folder of the files listed', async ({ page }) => {
  await page.goto('folder.html?limit=4');
  const notice = item(page, 'Only the first 4 files are shown');
  await expect(labels(page)).toHaveText([
    'data', 'sharedParams.sldd', 'models', 'ctrlA.slx', 'plantB.slx', 'workspace', 'data.sldd', 'Only the first 4 files are shown',
  ]);
  await expect(notice).toHaveAttribute('aria-level', '1');
  await expect(notice.locator('svg.info')).toBeVisible();
  await expect(notice).toHaveAttribute('title', /holds more data files than the 4 listed/);
  // The whole folder says nothing of the kind.
  await page.goto('folder.html');
  await expect(item(page, 'model.slx')).toBeVisible();
  await expect(tree(page).locator('.notice')).toHaveCount(0);
});
