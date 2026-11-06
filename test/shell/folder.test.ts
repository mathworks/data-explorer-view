// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A folder in the Explorer, served as the Electron app's main process serves it (folderReads
// through serveFolder) across a channel: its tree following the active tab, the Usage column it
// fills, the links it resolves, the Search view over its names, its changes, and its projects'
// pages. Ported from data-explorer-app's page test of the same name, against <dex-shell-folder>.
// The folder had a search box of its own there; the Search view is the shell's one search, and
// searches the folder's names as that box did.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { sourceUri } from '../../src/model/source/sourceUri.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import type { DexProjectPage } from '../../src/widgets/project-page/dex-project-page.js';
import { fixture, folderPart, searchPanel, serveFolderTo, startPage, tempFolder, treeLabels, until, type Page } from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  for (const s of stop) s();
  stop = [];
});

type FolderPage = Page & { folder?: ReturnType<typeof serveFolderTo> };

/** A page whose host reads the real files, and shows `dir` in the Explorer. */
function pageOn(dir?: string): FolderPage {
  const page: FolderPage = startPage();
  page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
  if (dir) show(page, dir);
  return page;
}
function show(page: FolderPage, dir: string): void {
  page.folder = serveFolderTo(page, dir);
  stop.push(page.folder.dispose);
}

const panelOf = (file: string) => document.querySelector(`.doc-panel[data-path="${CSS.escape(file)}"]`);
const tableAt = (file: string) => panelOf(file)?.querySelector<DexTreeTable>('dex-tree-table') ?? null;
const pageAt = (file: string) => panelOf(file)?.querySelector<DexProjectPage>('dex-project-page') ?? null;
const rowAt = (file: string, name: string) => tableAt(file)?.rows.find((r) => r.Name?.label === name);
/** The file of the panel on show: the active tab's. */
const activePath = () => document.querySelector<HTMLElement>('.doc-panel:not([hidden])')?.dataset.path;
const selectedInTree = () =>
  [...(document.querySelector('dex-hierarchy')?.shadowRoot?.querySelectorAll('[role="treeitem"][aria-selected="true"] .label') ?? [])].map((l) => l.textContent?.trim());
/** The blocks a variable's Usage cell names. */
const usedBy = (file: string, name: string) =>
  ((rowAt(file, name)?.UsedBy as { blockLinks?: { blockName: string }[] } | undefined)?.blockLinks ?? []).map((b) => b.blockName);
/** Search for `query` in the Search view, as its box asks once the typing pauses. */
const ask = (query: string) => {
  searchPanel().query = query;
  searchPanel().dispatchEvent(new CustomEvent('dex-search-query', { detail: { query }, bubbles: true, composed: true }));
};
/** What the Search view lists: each entry's name, once it is done searching. */
const found = () => (searchPanel().searching ? null : searchPanel().results.map((r) => r.entry.name));
const PLANT = { 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx', 'shared_gain.slx': 'shared_gain.slx' };

describe('a folder in the Explorer', () => {
  it('fills the Usage column from the models in it, for a dictionary opened before it was shown too', async () => {
    const dir = tempFolder('plant', PLANT);
    const page = pageOn();
    expect(folderPart().hidden).toBe(true);
    const dict = path.join(dir, 'params.sldd');
    void page.handle.openPaths([dict]);
    await until(() => (tableAt(dict)?.columns?.length ?? 0) > 0);
    // Before: the open tabs' answer, and no model is open.
    expect(usedBy(dict, 'Uo')).toEqual([]);
    show(page, dir);
    await until(() => !!tableAt(dict)!.columns?.includes('UsedBy') && usedBy(dict, 'Uo').includes('DictOnly'));
    expect(usedBy(dict, 'Kp')).toContain('PlantGain');
    expect(folderPart().hidden).toBe(false);
    await until(() => folderPart().shadowRoot?.querySelector('.title')?.textContent === 'plant');
    expect(folderPart().shadowRoot!.querySelector<HTMLElement>('.title')!.title).toBe(dir);
  });

  it("selects the active tab's file in its tree, and a link opens the file the tree shows for its name, wherever it is", async () => {
    // The model names its dictionary by its bare name; the dictionary is in another folder of it.
    const dir = tempFolder('work', { 'models/shadow_ws.slx': 'shadow_ws.slx', 'data/params.sldd': 'params.sldd' });
    const page = pageOn(dir);
    const model = path.join(dir, 'models', 'shadow_ws.slx');
    const dict = path.join(dir, 'data', 'params.sldd');
    void page.handle.openPaths([model]);
    await until(() => !!rowAt(model, 'params.sldd'));
    await until(() => selectedInTree().includes('shadow_ws.slx'));
    tableAt(model)!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: 'params.sldd' }, bubbles: true, composed: true }));
    await until(() => activePath() === dict);
    await until(() => selectedInTree().includes('params.sldd'));
  });

  it('a file chosen in its tree opens', async () => {
    const dir = tempFolder('plant', PLANT);
    pageOn(dir);
    await until(() => treeLabels().includes('shadow_ws.slx'));
    const row = [...document.querySelector('dex-hierarchy')!.shadowRoot!.querySelectorAll<HTMLElement>('[role="treeitem"]')].find(
      (r) => r.querySelector('.label')?.textContent?.trim() === 'shadow_ws.slx',
    )!;
    row.click();
    await until(() => activePath() === path.join(dir, 'shadow_ws.slx'));
  });

  it("follows a file added to it, which the Search view then finds, a match opening a block's model on that block", async () => {
    const dir = tempFolder('plant', PLANT);
    const page = pageOn(dir);
    await until(() => treeLabels().includes('shadow_ws.slx'));
    copyFileSync(fixture('rt_bin.sldd'), path.join(dir, 'extra.sldd'));
    page.folder!.changed([sourceUri(path.join(dir, 'extra.sldd'))]);
    await until(() => treeLabels().includes('extra.sldd'));

    // The folder has no search box of its own: the Search view is the one search.
    expect(folderPart().shadowRoot!.querySelector('input')).toBeNull();
    ask('gain');
    await until(() => found()?.length === 3);
    expect(found()).toEqual(['PlantGain', 'WsGain', 'Trim']);
    const hit = searchPanel().results[1]!;
    searchPanel().dispatchEvent(new CustomEvent('dex-search-open', { detail: { sourceUri: hit.entry.sourceUri, revealName: hit.revealName }, bubbles: true, composed: true }));
    const model = path.join(dir, 'shadow_ws.slx');
    await until(() => activePath() === model && (tableAt(model)?.selectedRowIds.length ?? 0) === 1);
    expect(tableAt(model)!.selectedRowIds).toEqual([rowAt(model, 'WsGain')!.ID]);
  });

  it("the Search view finds the names a change to the folder brought, the results on show asked again", async () => {
    const dir = tempFolder('plant', PLANT);
    const page = pageOn(dir);
    await until(() => treeLabels().includes('shadow_ws.slx') && searchPanel().scope === 'Open files and plant');
    ask('gadget');
    await until(() => found()?.length === 0);

    copyFileSync(fixture('rt_bin.sldd'), path.join(dir, 'extra.sldd'));
    page.folder!.changed([sourceUri(path.join(dir, 'extra.sldd'))]);
    await until(() => treeLabels().includes('extra.sldd'));
    // The results on show are the folder's as it is now, with no query typed since, and so are the next query's.
    await until(() => (found()?.length ?? 0) > 0);
    expect(found()).toEqual(['gadget']);
    ask('gad');
    await until(() => (found()?.length ?? 0) > 0);
    expect(found()).toEqual(['gadget']);
  });

  it('says when it holds no data files, and a folder shown in its place takes its place', async () => {
    const empty = tempFolder('empty', {});
    const note = () => folderPart().shadowRoot?.querySelector<HTMLElement>('.note');
    const page = pageOn(empty);
    await until(() => note()?.textContent === 'No data files in this folder.');
    const dir = tempFolder('plant', PLANT);
    show(page, dir);
    await until(() => treeLabels().includes('shadow_ws.slx') && !note());
    await until(() => folderPart().shadowRoot?.querySelector('.title')?.textContent === 'plant');
  });
});

describe('a project', () => {
  /** Plant (a shortcut to a dictionary, a component Lib) and Lib, side by side. */
  function projects(): string {
    const dir = mkdtempSync(path.join(tmpdir(), 'dex-shell-projects-'));
    mkdirSync(path.join(dir, 'Plant', 'data'), { recursive: true });
    copyFileSync(fixture('params.sldd'), path.join(dir, 'Plant', 'data', 'params.sldd'));
    writeFileSync(path.join(dir, 'Plant', 'matlab.toml'), 'name = "Plant"\n\n[project.shortcuts]\nparams = {path = "data/params.sldd"}\n');
    mkdirSync(path.join(dir, 'Lib'));
    writeFileSync(path.join(dir, 'Lib', 'matlab.toml'), 'name = "Lib"\n');
    return dir;
  }

  it('outside the shown folder asks for its folder, and shows its page once the folder is shown', async () => {
    const dir = projects();
    const marker = path.join(dir, 'Plant', 'matlab.toml');
    const page = pageOn();
    void page.handle.openPaths([marker]);
    await until(() => !!pageAt(marker)?.error);
    expect(pageAt(marker)!.error).toBe('Open the folder this project is in to see its page.');
    show(page, dir);
    await until(() => pageAt(marker)?.payload?.page?.name === 'Plant');
  });

  it("repaints its page when its matlab.toml is saved, and its links open a file, or a component's project", async () => {
    const dir = projects();
    const marker = path.join(dir, 'Plant', 'matlab.toml');
    const page = pageOn(dir);
    void page.handle.openPaths([marker]);
    await until(() => pageAt(marker)?.payload?.page?.name === 'Plant');
    writeFileSync(marker, 'name = "Plant"\n\n[project.shortcuts]\nparams = {path = "data/params.sldd"}\nmain = {path = "main.m"}\n');
    page.folder!.changed([sourceUri(marker)]);
    await until(() => JSON.stringify(pageAt(marker)?.payload ?? '').includes('main.m'));

    const follow = (detail: unknown) => pageAt(marker)!.dispatchEvent(new CustomEvent('dex-project-open', { detail, bubbles: true, composed: true }));
    follow({ path: 'data/params.sldd' });
    await until(() => activePath() === path.join(dir, 'Plant', 'data', 'params.sldd'));
    follow({ path: '../Lib', preferProject: true });
    await until(() => activePath() === path.join(dir, 'Lib', 'matlab.toml'));
    await until(() => pageAt(path.join(dir, 'Lib', 'matlab.toml'))?.payload?.page?.name === 'Lib');
  });

  it('a link to what the shell does not open is shown in the file manager', async () => {
    const dir = projects();
    const marker = path.join(dir, 'Plant', 'matlab.toml');
    const page = pageOn(dir);
    void page.handle.openPaths([marker]);
    await until(() => pageAt(marker)?.payload?.page?.name === 'Plant');
    pageAt(marker)!.dispatchEvent(new CustomEvent('dex-project-open', { detail: { path: 'data' }, bubbles: true, composed: true }));
    await until(() => page.main.revealed.length === 1);
    expect(page.main.revealed).toEqual([path.join(dir, 'Plant', 'data')]);
  });
});
