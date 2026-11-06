// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's tab row, connected: <dex-doc-tabs> mirrors the open tabs (each one's name, its kind's
// icon, its unsaved mark, whether it is a preview, its path as the tooltip), and the row's requests
// act (select, close, pin, move). A file opened by a click in the folder's tree, a search pick or a
// link is a preview tab, which the next such file replaces, unless it holds edits; a tab is kept
// once pinned, once edited, or when it was opened for good (Open, a drop, openPaths).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  activeTab,
  choose,
  docsArea,
  docTabs,
  dirtyTabs,
  edit,
  explorer,
  graph,
  graphShown,
  locationBar,
  menuOn,
  open,
  previewTabs,
  rowOf,
  searchPanel,
  sectionOf,
  selectRow,
  selectTab,
  serveFolderTo,
  settled,
  startPage,
  tabIdOf,
  tabNamed,
  tabNames,
  tableOf,
  toolbar,
  toolbarButton,
  tempFolder,
  treeLabels,
  until,
  type Page,
} from './harness.js';

let stop: (() => void)[] = [];
afterEach(() => {
  vi.restoreAllMocks();
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

  it("names each file in its tooltips as a host that makes its paths up says, the tab's, the Explorer's and the location bar's", async () => {
    // A browser page's paths are its own (`/files/1/plant.sldd`): its host says what they mean.
    const page = startPage({ 'params.sldd': 'params.sldd' });
    page.host.pathTitle = (p) => `plant: ${p.slice(p.lastIndexOf('/') + 1)}`;
    await open(page, 'params.sldd');
    await until(() => docTabs().tabs[0]?.title === 'plant: params.sldd');
    expect(explorer().files[0]!.title).toBe('plant: params.sldd');
    expect(locationBar().segments[1]).toMatchObject({ label: 'params.sldd', title: 'plant: params.sldd' });
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

  it('next tab with one tab goes nowhere, and leaves the variable editor open', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    const editor = document.querySelector('dex-variable-editor')!;
    const close = vi.spyOn(editor, 'close');
    page.command('next-tab');
    page.command('previous-tab');
    await settled();
    expect(close).not.toHaveBeenCalled();
  });

  it('next and previous tab go round the row', async () => {
    const page = startPage({ 'a.sldd': 'params.sldd', 'b.sldd': 'params.sldd', 'c.sldd': 'params.sldd' });
    await open(page, 'a.sldd', 'b.sldd', 'c.sldd');
    page.command('next-tab');
    await until(() => docTabs().active === tabIdOf('a.sldd'));
    page.command('previous-tab');
    await until(() => docTabs().active === tabIdOf('c.sldd'));
  });

  it('reads the section its selection is in, with its icon and the file as the subtitle, and the file again with no row selected', async () => {
    // As the Explorer marks the section a selection is in, and the prototype's tab named the section
    // it showed: "params.sldd ▸ Design Data". Each tab by its own selection.
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd', 'ParamMat.mat');
    const design = await sectionOf('params.sldd', 'Design Data');
    await selectTab('params.sldd');
    await selectRow('params.sldd', 'Kp');
    const tabOf = (id: string) => docTabs().tabs.find((t) => t.id === id)!;
    const params = tabIdOf('params.sldd');
    await until(() => tabOf(params).subtitle === 'params.sldd');
    expect(tabOf(params)).toEqual({ id: params, label: 'Design Data', subtitle: 'params.sldd', icon: design.Name.iconId, title: '/work/params.sldd', dirty: false, preview: false });
    // A MAT-file's variables are under no section: its tab reads its name, and the other keeps its section.
    await selectTab('ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    await settled();
    expect(tabOf(tabIdOf('ParamMat.mat'))).toMatchObject({ label: 'ParamMat.mat', icon: 'matlabWorkspaceFile' });
    expect(tabOf(tabIdOf('ParamMat.mat')).subtitle).toBeUndefined();
    expect(tabOf(params).label).toBe('Design Data');
    // The file itself, from the location bar's segment: no row, the file's name.
    await selectTab('params.sldd');
    locationBar().dispatchEvent(new CustomEvent('dex-location-go', { detail: { to: 1 }, bubbles: true, composed: true }));
    await until(() => tabOf(params).subtitle === undefined);
    expect(tabOf(params)).toMatchObject({ label: 'params.sldd', icon: 'simulinkDataDictionary_FT' });
  });

  it('is hidden at Root and while no file is open, the graph or the welcome filling the center', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    expect(docTabs().hidden).toBe(true);
    await open(page, 'params.sldd');
    await until(() => !docTabs().hidden);
    explorer().dispatchEvent(new CustomEvent('dex-explorer-open', { detail: { fileId: null, pin: false }, bubbles: true, composed: true }));
    await until(() => docTabs().hidden);
    page.command('next-tab');
    await until(() => !docTabs().hidden);
  });

  it("hidden with the focus on a tab, gives the keyboard to the Explorer's Root, or the graph with the Explorer off screen", async () => {
    // Alt+Up from a focused tab goes to Root, which hides the row the focus was in: it fell to the
    // page's body. A focus elsewhere is left where it is.
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    await until(() => !docTabs().hidden && !!tabNamed('params.sldd'));
    tabNamed('params.sldd')!.focus();
    expect(docTabs().shadowRoot!.activeElement).toBe(tabNamed('params.sldd'));
    page.command('up');
    await until(() => docTabs().hidden);
    await until(() => document.activeElement === explorer());
    expect(explorer().shadowRoot!.activeElement?.getAttribute('role')).toBe('treeitem');
    expect(explorer().shadowRoot!.activeElement?.textContent?.trim()).toBe('Root');

    // The Explorer's side closed: the graph, which fills the center where the row was.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    page.shell.toggleView('explorer');
    await until(() => !page.shell.layout.left.open);
    tabNamed('params.sldd')!.focus();
    page.command('up');
    await until(() => document.activeElement === graph());
    expect(graph().shadowRoot!.activeElement?.classList.contains('canvas')).toBe(true);

    // The focus not in the row (on the toolbar's Open, say): nothing moves it.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    toolbarButton('Open')!.focus();
    page.command('up');
    await until(() => docTabs().hidden);
    await settled();
    expect(document.activeElement).toBe(toolbar());
  });

  it("hidden as the last tab closes with the focus on it, gives the keyboard to the welcome's Open File…, and the graph drawn later none", async () => {
    // With the Explorer off screen the keyboard went to the graph, which with no file open has
    // nothing to draw: its request waited, and took the keyboard from the page's body once files
    // were opened and Root drawn. The welcome is what fills the center then, and Open File… is
    // what there is to do.
    const page = startPage({ 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' });
    await open(page, 'params.sldd');
    page.shell.toggleView('explorer');
    await until(() => !page.shell.layout.left.open);
    await until(() => !!tabNamed('params.sldd'));
    tabNamed('params.sldd')!.focus();
    page.command('close-tab');
    await until(() => docTabs().hidden && tabNames().length === 0);
    const welcomeOpen = () => docsArea().shadowRoot!.querySelector<HTMLButtonElement>('.welcome button');
    await until(() => docsArea().shadowRoot!.activeElement === welcomeOpen());
    expect(welcomeOpen()!.textContent!.trim()).toBe('Open File…');
    expect(document.activeElement).toBe(docsArea());

    // The user moves on (the focus back on the body), opens two files and goes to Root: the graph
    // is drawn there and leaves the keyboard where it is.
    welcomeOpen()!.blur();
    await open(page, 'params.sldd', 'ParamMat.mat');
    page.command('show-graph');
    await until(() => graphShown() && !!graph().shadowRoot?.querySelector('.canvas[tabindex]'));
    await settled();
    expect(graph().shadowRoot!.activeElement ?? null).toBeNull();
  });

  it("Show Graph pressed in a table gives the keyboard to the Explorer's Root, or the graph with the Explorer off screen", async () => {
    // The table's panel hides as Root shows: a browser drops the focus inside it to the page's
    // body. Its chord pressed there, the keyboard goes where the tab row's does as Root shows.
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    const grid = () => tableOf('params.sldd')!.shadowRoot!.querySelector<HTMLElement>('.table-container')!;
    const chord = (el: HTMLElement) => {
      // Mod is Cmd on macOS and Ctrl elsewhere: the one the page's platform reads.
      const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'H', shiftKey: true, ...(mac ? { metaKey: true } : { ctrlKey: true }), bubbles: true, composed: true, cancelable: true }));
    };
    grid().focus();
    expect(document.activeElement).toBe(tableOf('params.sldd'));
    chord(grid());
    await until(() => docTabs().hidden && graphShown());
    await until(() => document.activeElement === explorer());
    expect(explorer().shadowRoot!.activeElement?.textContent?.trim()).toBe('Root');

    // The Explorer's side closed: the graph, which fills the center.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    page.shell.toggleView('explorer');
    await until(() => !page.shell.layout.left.open);
    grid().focus();
    chord(grid());
    await until(() => document.activeElement === graph());
    expect(graph().shadowRoot!.activeElement?.classList.contains('canvas')).toBe(true);

    // The focus not in the panel (on the toolbar's Open): nothing moves it.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    toolbarButton('Open')!.focus();
    page.command('show-graph');
    await until(() => docTabs().hidden);
    await settled();
    expect(document.activeElement).toBe(toolbar());
  });

  it("Show in Graph chosen in a table's menu gives the keyboard to the Explorer's Root, or the graph with the Explorer off screen", async () => {
    // As Show Graph's chord: the table's panel hides as Root shows. The menu gives the keyboard
    // back to the table before it says what was chosen, so the table holds it then.
    const page = startPage({ 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    const grid = () => tableOf('params.sldd')!.shadowRoot!.querySelector<HTMLElement>('.table-container')!;
    const showInGraph = async (from: HTMLElement) => {
      await menuOn('params.sldd', 'Uo');
      from.focus();
      choose('showInGraph');
    };
    await showInGraph(grid());
    await until(() => docTabs().hidden && graphShown());
    await until(() => document.activeElement === explorer());
    expect(explorer().shadowRoot!.activeElement?.textContent?.trim()).toBe('Root');

    // The Explorer's side closed: the graph, which fills the center.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    page.shell.toggleView('explorer');
    await until(() => !page.shell.layout.left.open);
    await showInGraph(grid());
    await until(() => document.activeElement === graph());
    expect(graph().shadowRoot!.activeElement?.classList.contains('canvas')).toBe(true);

    // The focus not in the panel (on the toolbar's Open): nothing moves it.
    page.command('next-tab');
    await until(() => !docTabs().hidden);
    await showInGraph(toolbarButton('Open')!);
    await until(() => docTabs().hidden);
    await settled();
    expect(document.activeElement).toBe(toolbar());
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

  it("a search pick opens its file in a preview tab", async () => {
    const { dir } = folderPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx', 'shared_gain.slx': 'shared_gain.slx' });
    await until(() => treeLabels().includes('shadow_ws.slx') && searchPanel().scope === 'Open files and plant');
    searchPanel().dispatchEvent(new CustomEvent('dex-search-query', { detail: { query: 'WsGain' }, bubbles: true, composed: true }));
    await until(() => searchPanel().results.length === 1);
    const hit = searchPanel().results[0]!;
    searchPanel().dispatchEvent(new CustomEvent('dex-search-open', { detail: { sourceUri: hit.entry.sourceUri, revealName: hit.revealName }, bubbles: true, composed: true }));
    await until(() => previewTabs().join() === 'shadow_ws.slx');
    expect(document.querySelector<HTMLElement>('.doc-panel:not([hidden])')!.dataset.path).toBe(path.join(dir, 'shadow_ws.slx'));
  });

  it("a project page's link opens its file in a preview tab", async () => {
    const dir = tempFolder('work', { 'Plant/data/params.sldd': 'params.sldd' });
    const marker = path.join(dir, 'Plant', 'matlab.toml');
    writeFileSync(marker, 'name = "Plant"\n\n[project.shortcuts]\nparams = {path = "data/params.sldd"}\n');
    const page = startPage();
    page.host.readFile = async (p) => new Uint8Array(readFileSync(p));
    stop.push(serveFolderTo(page, dir).dispose);
    void page.handle.openPaths([marker]);
    const projectPage = () => document.querySelector<HTMLElement & { payload?: unknown }>('.doc-panel dex-project-page');
    await until(() => !!projectPage()?.payload);
    projectPage()!.dispatchEvent(new CustomEvent('dex-project-open', { detail: { path: 'data/params.sldd' }, bubbles: true, composed: true }));
    await until(() => previewTabs().join() === 'params.sldd');
    expect(tabNames()).toEqual(['Plant', 'params.sldd']);
  });

  it("the inspector's link opens its file in a preview tab", async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx', 'params.sldd': 'params.sldd' });
    await open(page, 'shadow_ws.slx');
    document.querySelector('dex-property-inspector')!.dispatchEvent(
      new CustomEvent('dex-property-navigate', { detail: { sourceId: 'Kp@params.sldd' }, bubbles: true, composed: true }),
    );
    await until(() => previewTabs().join() === 'params.sldd');
    const kp = await rowOf('params.sldd', 'Kp');
    await until(() => tableOf('params.sldd')!.selectedRowIds.join() === kp.ID);
  });

  it('a preview replaced leaves no step of its own in the history: Back goes where the user was before it', async () => {
    const { page, dir } = folderPage({ 'a.sldd': 'params.sldd', 'c.sldd': 'params.sldd', 'p.sldd': 'rt_bin.sldd', 'r.sldd': 'rt_bin.sldd' });
    await page.handle.openPaths([path.join(dir, 'a.sldd'), path.join(dir, 'c.sldd')]);
    request('dex-tab-select', { id: tabIdOf('a.sldd') });
    await until(() => docTabs().active === tabIdOf('a.sldd'));
    await chooseInTree('p.sldd');
    await until(() => previewTabs().join() === 'p.sldd');
    // r.sldd takes p.sldd's place; c.sldd, the last tab, stands in while p.sldd goes.
    await chooseInTree('r.sldd');
    await until(() => tabNames().join() === 'a.sldd,c.sldd,r.sldd');
    page.command('back');
    await until(() => docTabs().active === tabIdOf('a.sldd'));
  });

  it("a link opens its file in a preview tab", async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx', 'params.sldd': 'params.sldd' });
    await open(page, 'shadow_ws.slx');
    // The DictOnly block's Usage: Uo in the dictionary the model names, by its name, beside it.
    const block = await rowOf('shadow_ws.slx', 'DictOnly');
    const link = (block.UsedBy as { paramLinks: { linkTarget: string }[] }).paramLinks[0]!.linkTarget;
    expect(link).toBe('Uo@params.sldd');
    tableOf('shadow_ws.slx')!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: link }, bubbles: true, composed: true }));
    await until(() => tabNames().includes('params.sldd'));
    expect(previewTabs()).toEqual(['params.sldd']);
  });
});
