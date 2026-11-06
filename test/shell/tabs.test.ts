// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's tab row, connected: <dex-doc-tabs> mirrors the open tabs (each one's name, its kind's
// icon, its unsaved mark, whether it is a preview, its path as the tooltip), and the row's requests
// act (select, close, pin, move). A file opened by a click in the folder's tree, a search pick or a
// link is a preview tab, which the next such file replaces, unless it holds edits; a tab is kept
// once pinned, once edited, or when it was opened for good (Open, a drop, openPaths).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  activeTab,
  docTabs,
  dirtyTabs,
  edit,
  explorer,
  open,
  previewTabs,
  rowOf,
  serveFolderTo,
  startPage,
  tabIdOf,
  tabNamed,
  tabNames,
  tableOf,
  tempFolder,
  treeLabels,
  until,
  type Page,
} from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

const request = (type: 'dex-tab-select' | 'dex-tab-close' | 'dex-tab-pin' | 'dex-tab-move', detail: object) =>
  docTabs().dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

/** A page showing a folder of these files, whose host reads them from disk. */
function folderPage(files: Record<string, string>): { page: Page; dir: string } {
  const dir = tempFolder('plant', files);
  const page = startPage();
  page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
  const folder = serveFolderTo(page, dir);
  stop.push(folder.dispose);
  return { page, dir };
}

/** Choose `label`'s row in the folder's tree, as a click on it does. */
async function chooseInTree(label: string): Promise<void> {
  await until(() => treeLabels().includes(label));
  [...document.querySelector('dex-hierarchy')!.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')]
    .find((r) => r.querySelector('.label')?.textContent?.trim() === label)!
    .click();
}

describe('the tab row', () => {
  it('mirrors the open tabs: names, kinds, the active one, and the path as each tooltip', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd', 'shadow_ws.slx', 'ParamMat.mat');
    await until(() => tabNames().length === 3);
    expect(docTabs().slot).toBe('tabs');
    expect(docTabs().tabs.map((t) => [t.label, t.icon, t.title, !!t.dirty, !!t.preview])).toEqual([
      ['params.sldd', 'simulinkDataDictionary_FT', '/work/params.sldd', false, false],
      ['shadow_ws.slx', 'simulinkModel_FT', '/work/shadow_ws.slx', false, false],
      ['ParamMat.mat', 'matlabWorkspaceFile', '/work/ParamMat.mat', false, false],
    ]);
    expect(docTabs().active).toBe(tabIdOf('ParamMat.mat'));
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 1);
    expect(docTabs().tabs.find((t) => t.label === 'ParamMat.mat')!.dirty).toBe(true);
  });

  it('a select request shows that tab, a close request closes it, asking first about unsaved edits', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => tabNames().length === 2);
    tabNamed('params.sldd')!.click();
    await until(() => activeTab() === tabNamed('params.sldd'));
    expect(document.querySelector<HTMLElement>('.doc-panel:not([hidden])')!.dataset.path).toBe('/work/params.sldd');

    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.closeAnswers.push('discard');
    // The tab not active, closed from the row: it asks about that one.
    request('dex-tab-close', { id: tabIdOf('ParamMat.mat') });
    await until(() => tabNames().length === 1);
    expect(page.main.closeAsked).toEqual([]);
    request('dex-tab-close', { id: tabIdOf('params.sldd') });
    await until(() => tabNames().length === 0);
    expect(page.main.closeAsked).toEqual([['params.sldd']]);
  });

  it('a move request puts the tab where the row says, the active one staying active; the Explorer keeps that order', async () => {
    const page = startPage({ 'a.sldd': 'params.sldd', 'b.sldd': 'params.sldd', 'c.sldd': 'params.sldd' });
    await open(page, 'a.sldd', 'b.sldd', 'c.sldd');
    await until(() => tabNames().length === 3);
    request('dex-tab-move', { id: tabIdOf('a.sldd'), index: 2 });
    await until(() => tabNames().join() === 'b.sldd,c.sldd,a.sldd');
    expect(docTabs().active).toBe(tabIdOf('c.sldd'));
    expect(explorer().files.map((f) => f.label)).toEqual(['b.sldd', 'c.sldd', 'a.sldd']);
    request('dex-tab-move', { id: tabIdOf('a.sldd'), index: 0 });
    await until(() => tabNames().join() === 'a.sldd,b.sldd,c.sldd');
  });

  it('next and previous tab go round the row', async () => {
    const page = startPage({ 'a.sldd': 'params.sldd', 'b.sldd': 'params.sldd', 'c.sldd': 'params.sldd' });
    await open(page, 'a.sldd', 'b.sldd', 'c.sldd');
    page.command('next-tab');
    await until(() => docTabs().active === tabIdOf('a.sldd'));
    page.command('previous-tab');
    await until(() => docTabs().active === tabIdOf('c.sldd'));
  });
});

describe('preview tabs', () => {
  it("a file chosen in the folder's tree opens in a preview tab, which the next one chosen replaces", async () => {
    const { dir } = folderPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await chooseInTree('params.sldd');
    await until(() => tabNames().join() === 'params.sldd');
    expect(previewTabs()).toEqual(['params.sldd']);
    await chooseInTree('rt_bin.sldd');
    await until(() => tabNames().join() === 'rt_bin.sldd');
    expect(previewTabs()).toEqual(['rt_bin.sldd']);
    // The replaced tab's panel and table are gone with it.
    expect(document.querySelectorAll('.doc-panel')).toHaveLength(1);
    expect(document.querySelector<HTMLElement>('.doc-panel')!.dataset.path).toBe(path.join(dir, 'rt_bin.sldd'));
  });

  it('is replaced where it stands in the row, between the tabs kept around it', async () => {
    const { page, dir } = folderPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    void page.handle.openPaths([path.join(dir, 'ParamMat.mat')]);
    await until(() => tabNames().length === 1);
    await chooseInTree('params.sldd');
    await until(() => tabNames().length === 2);
    // Kept tabs either side: the preview between them.
    request('dex-tab-move', { id: tabIdOf('ParamMat.mat'), index: 1 });
    await until(() => tabNames().join() === 'params.sldd,ParamMat.mat');
    await chooseInTree('rt_bin.sldd');
    await until(() => tabNames().join() === 'rt_bin.sldd,ParamMat.mat');
  });

  it('a pin request keeps it, so the next file chosen opens beside it', async () => {
    folderPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await chooseInTree('params.sldd');
    await until(() => previewTabs().join() === 'params.sldd');
    request('dex-tab-pin', { id: tabIdOf('params.sldd') });
    await until(() => previewTabs().length === 0);
    await chooseInTree('rt_bin.sldd');
    await until(() => tabNames().join() === 'params.sldd,rt_bin.sldd');
    expect(previewTabs()).toEqual(['rt_bin.sldd']);
  });

  it('an edit keeps it', async () => {
    const { dir } = folderPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await chooseInTree('params.sldd');
    const file = path.join(dir, 'params.sldd');
    const table = () => document.querySelector(`.doc-panel[data-path="${CSS.escape(file)}"] dex-tree-table`) as HTMLElement & { rows: { ID: string; Name: { label: string } }[] };
    await until(() => !!table()?.rows.some((r) => r.Name?.label === 'Kp'));
    const kp = table().rows.find((r) => r.Name.label === 'Kp')!;
    table().dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: kp.ID, columnId: 'Value', oldValue: '1', newValue: '5' }, bubbles: true, composed: true }));
    await until(() => dirtyTabs().length === 1 && previewTabs().length === 0);
    await chooseInTree('rt_bin.sldd');
    await until(() => tabNames().join() === 'params.sldd,rt_bin.sldd');
  });

  it('a file opened for good opens in a kept tab, and pins the preview it is in already', async () => {
    const { page, dir } = folderPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await chooseInTree('params.sldd');
    await until(() => previewTabs().join() === 'params.sldd');
    // Opened again, for good: the same tab, kept.
    void page.handle.openPaths([path.join(dir, 'params.sldd')]);
    await until(() => previewTabs().length === 0);
    expect(tabNames()).toEqual(['params.sldd']);
    void page.handle.openPaths([path.join(dir, 'rt_bin.sldd')]);
    await until(() => tabNames().length === 2);
    expect(previewTabs()).toEqual([]);
  });

  it("a link opens its file in a preview tab", async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx', 'params.sldd': 'params.sldd' });
    await open(page, 'shadow_ws.slx');
    const block = await rowOf('shadow_ws.slx', 'WsGain');
    tableOf('shadow_ws.slx')!.dispatchEvent(
      new CustomEvent('dex-link-clicked', { detail: { target: (block.UsedBy as { linkTarget: string }).linkTarget }, bubbles: true, composed: true }),
    );
    await until(() => tabNames().includes('params.sldd'));
    expect(previewTabs()).toEqual(['params.sldd']);
  });
});
