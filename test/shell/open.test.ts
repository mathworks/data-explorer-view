// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Opening files in the shell: one tab each, a table connected to its document in the one editing
// workspace, read-only where the document takes no edits, and the tab wiring around them (the
// last opened active, a second open of a file its tab again, a read that fails in the table's
// banner, a tab closed while its file is read, a link into another file). Ported from
// data-explorer-app's page test of the same name: its cases, against the shell's parts.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseLinkTarget } from '../../src/model/ids/linkTarget.js';
import { sourceUri, uriPath } from '../../src/model/source/sourceUri.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import { linkDestination } from '../../src/widgets/app-shell/connect/links.js';
import { DexShellNote } from '../../src/widgets/app-shell/connect/dex-shell-note.js';
import { activeTab, at, choose, fixture, inspectorNote, menuOn, open, rowOf, settled, startPage, tabNames, tableOf, until, welcomeShown } from './harness.js';

const ALL = {
  'params.sldd': 'params.sldd',
  'rt_bin.sldd': 'rt_bin.sldd',
  'shared_gain.slx': 'shared_gain.slx',
  'legacy_ctrl.mdl': 'legacy_ctrl.mdl',
  'ParamMat.mat': 'ParamMat.mat',
};

describe('the shell opens files as tabs', () => {
  it('a tab per file, the last one active, each a table of its file; a MAT-file, a dictionary and a .slx take edits, a .mdl does not', async () => {
    const page = startPage(ALL);
    await open(page, ...Object.keys(ALL));
    await until(() => tabNames().length === 5);
    expect(tabNames()).toEqual(Object.keys(ALL));
    await until(() => !!activeTab()?.textContent?.includes('ParamMat.mat'));
    expect(document.querySelectorAll('.doc-panel:not([hidden])')).toHaveLength(1);
    await until(() => !welcomeShown());
    expect(['params.sldd', 'rt_bin.sldd', 'ParamMat.mat', 'shared_gain.slx'].map((n) => tableOf(n)!.readonly)).toEqual([false, false, false, false]);
    expect(tableOf('legacy_ctrl.mdl')!.readonly).toBe(true);
    // shared_gain.slx was made by hand and names none of its parts: its Model Workspace opens for
    // viewing only, as a MAT-file a save could not keep does, and says why in a user's words, not
    // the package's part names (core's reason was 'it holds no "[Content_Types].xml"').
    await until(() => !!tableOf('shared_gain.slx')!.banners?.notice);
    expect(tableOf('shared_gain.slx')!.banners?.notice).toBe(
      'Read-only: shared_gain.slx is not packaged the way Simulink saves a model, so it opens for viewing only: a save from here could lose part of it.',
    );
  });

  it('a file already open is its tab again, not a second one', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'rt_bin.sldd');
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => !!activeTab()?.textContent?.includes('params.sldd'));
    expect(tabNames()).toEqual(['params.sldd', 'rt_bin.sldd']);
  });

  it('a file named by another spelling of its path is its tab again, not a second one that fails', async () => {
    // A Windows file as File > Open names it, as the folder's tree names it (view's uriPath writes
    // the drive letter lower-case), and as a link from a model beside it names it.
    const opened = 'C:\\work\\params.sldd';
    const fromTree = uriPath(sourceUri(opened));
    const fromLink = linkDestination(parseLinkTarget('Kp@params.sldd'), 'C:\\work\\plant.slx').path;
    expect([fromTree, fromLink]).toEqual(['c:\\work\\params.sldd', 'C:\\work/params.sldd']);
    const page = startPage();
    const bytes = new Uint8Array(readFileSync(fixture('params.sldd')));
    for (const p of [opened, fromTree, fromLink]) page.main.files.set(p, bytes);
    const tables = () => [...document.querySelectorAll<DexTreeTable>('.doc-panel dex-tree-table')];
    void page.handle.openPaths([opened]);
    await until(() => (tables()[0]?.rows.length ?? 0) > 0);
    void page.handle.openPaths([fromTree, fromLink]);
    await settled(50);
    expect(tabNames()).toEqual(['params.sldd']);
    expect(tables().map((t) => t.banners?.error)).toEqual([undefined]);
  });

  it("a file core cannot read, or the host will not, opens with the reason in its table's banner", async () => {
    const page = startPage({ 'broken.sldd': 'README.md' });
    void page.handle.openPaths([at('broken.sldd'), at('gone.sldd')]);
    await until(() => !!tableOf('broken.sldd')?.banners?.error && !!tableOf('gone.sldd')?.banners?.error);
    expect(tableOf('broken.sldd')!.banners?.error).toMatch(/broken\.sldd/);
    expect(tableOf('gone.sldd')!.banners?.error).toBe(`Failed to open gone.sldd: ENOENT: no such file, open '${at('gone.sldd')}'`);
    expect(tableOf('broken.sldd')!.rows).toEqual([]);
  });

  it('says "Opening NAME…" in the tab while its file is read and parsed, as a status, and not once it is shown or failed', async () => {
    // The tab was blank meanwhile. The note says it once the read has taken a moment (its own
    // stylesheet holds it back a little), so a file read at once never flashes it.
    const page = startPage({ 'params.sldd': 'params.sldd' });
    const read = page.host.readFile;
    const held: (() => void)[] = [];
    page.host.readFile = (p) => new Promise((resolve, reject) => held.push(() => read(p).then(resolve, reject)));
    const panel = (name: string) => document.querySelector<HTMLElement>(`.doc-panel[data-path="${at(name)}"]`);
    const noteIn = (name: string) => panel(name)?.querySelector<HTMLElement>('dex-shell-note');
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => !!noteIn('params.sldd'));
    expect(noteIn('params.sldd')!.getAttribute('role')).toBe('status');
    expect(noteIn('params.sldd')!.textContent).toBe('Opening params.sldd…');
    held.shift()!();
    await until(() => (tableOf('params.sldd')?.rows.length ?? 0) > 0);
    expect(noteIn('params.sldd')).toBeNull();
    // A read that fails takes the note away too, and its banner says why.
    void page.handle.openPaths([at('gone.sldd')]);
    await until(() => !!noteIn('gone.sldd'));
    held.shift()!();
    await until(() => !!tableOf('gone.sldd')?.banners?.error);
    expect(noteIn('gone.sldd')).toBeNull();
    // Held back by a delayed fade in, not hidden: in the accessibility tree from the start.
    const css = [DexShellNote.styles].flat(Infinity).map((sheet) => (sheet as { cssText: string }).cssText.replace(/\s+/g, ' ')).join('\n');
    expect(css).toMatch(/:host\(\[role='status'\]\) \{ animation: [\w-]+ 0s \d+ms both; \}/);
  });

  it('each file keeps its own column choices, under a key of its own', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'rt_bin.sldd');
    expect(tableOf('params.sldd')!.storageKey).toBe(`dex-shell:${sourceUri(at('params.sldd'))}`);
    expect(tableOf('rt_bin.sldd')!.storageKey).toBe(`dex-shell:${sourceUri(at('rt_bin.sldd'))}`);
  });

  it('the column choices go under the storage key the app gives', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' }, { storageKey: 'my-app' });
    await open(page, 'params.sldd');
    expect(tableOf('params.sldd')!.storageKey).toBe(`my-app:${sourceUri(at('params.sldd'))}`);
  });

  it('with no folder shown, a dictionary has a Usage column as a model does (openUsage.test.ts says what fills it)', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'params.sldd', 'shadow_ws.slx');
    await until(() => !!tableOf('shadow_ws.slx')!.columns?.includes('UsedBy'));
    await until(() => !!tableOf('params.sldd')!.columns?.includes('UsedBy'));
  });

  it("closing a tab activates its neighbour and the inspector shows that file's page; none is left, its empty text", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'rt_bin.sldd');
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    await until(() => !!activeTab()?.textContent?.includes('params.sldd'));
    const inspector = document.querySelector('dex-property-inspector')!;
    await until(() => inspector.groups[0]?.properties[0]?.value === 'params.sldd');
    expect(inspectorNote().hidden).toBe(true);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    await until(welcomeShown);
    expect(inspectorNote().hidden).toBe(false);
    expect(document.title).toBe('Data Explorer');
  });

  it('a tab closed while its file is read leaves nothing open: the file opens again, and the host stops watching it', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    const read = page.host.readFile;
    let release!: () => void;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => tabNames().length === 1);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    page.host.readFile = read;
    release();
    await settled(20);

    void page.handle.openPaths([at('params.sldd')]);
    await until(() => (tableOf('params.sldd')?.rows.length ?? 0) > 0 || !!tableOf('params.sldd')?.banners?.error);
    expect(tableOf('params.sldd')!.banners?.error).toBeUndefined();
    expect(tabNames()).toEqual(['params.sldd']);
    // A host starts watching a file once it is read, after the close it heard first: told again.
    expect(page.main.closedFiles).toEqual([at('params.sldd'), at('params.sldd')]);
  });

  it('a tab closed while its file is read, and opened again meanwhile, keeps its file watched', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd' });
    const read = page.host.readFile;
    let release!: () => void;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => tabNames().length === 1);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    const first = release;
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => tabNames().length === 1);
    page.host.readFile = read;
    first();
    release();
    await until(() => (tableOf('params.sldd')?.rows.length ?? 0) > 0 || !!tableOf('params.sldd')?.banners?.error);
    expect(tableOf('params.sldd')!.banners?.error).toBeUndefined();
    expect(page.main.closedFiles).toEqual([at('params.sldd')]);
  });

  it('a link into another file opens it, beside the file it is in, and selects the row it names', async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx', 'params.sldd': 'params.sldd' });
    await open(page, 'shadow_ws.slx');
    // The DictOnly block's Usage, Value=Uo: Uo in the dictionary the model names, not open, by its
    // name. (WsGain's Kp is the model workspace's, which shadows the dictionary's.)
    const block = await rowOf('shadow_ws.slx', 'DictOnly');
    const link = (block.UsedBy as { paramLinks?: { linkTarget: string }[] }).paramLinks?.[0]?.linkTarget;
    expect(link).toBe('Uo@params.sldd');
    tableOf('shadow_ws.slx')!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: link }, bubbles: true, composed: true }));
    await until(() => tabNames().includes('params.sldd') && (tableOf('params.sldd')?.selectedRowIds.length ?? 0) > 0);
    const uo = await rowOf('params.sldd', 'Uo');
    expect(tableOf('params.sldd')!.selectedRowIds).toEqual([uo.ID]);
    await until(() => !!activeTab()?.textContent?.includes('params.sldd'));
  });

  it('a tab closed while its file is read, and opened again by another spelling of its path, keeps its file watched', async () => {
    const page = startPage();
    const bytes = new Uint8Array(readFileSync(fixture('params.sldd')));
    const opened = 'C:\\work\\params.sldd';
    const respelled = uriPath(sourceUri(opened));
    for (const p of [opened, respelled]) page.main.files.set(p, bytes);
    const read = page.host.readFile;
    let release!: () => void;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    void page.handle.openPaths([opened]);
    await until(() => tabNames().length === 1);
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    const first = release;
    void page.handle.openPaths([respelled]);
    await until(() => tabNames().length === 1);
    page.host.readFile = read;
    first();
    release();
    await until(() => (document.querySelector<DexTreeTable>('.doc-panel dex-tree-table')?.rows.length ?? 0) > 0);
    await settled();
    // The file is the open tab's, by its uri: the late read of the closed tab does not unwatch it.
    expect(page.main.closedFiles).toEqual([opened]);
  });

  it('a link into a file whose tab is still reading it selects its row once it is read', async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx', 'params.sldd': 'params.sldd' });
    await open(page, 'shadow_ws.slx');
    const read = page.host.readFile;
    let release!: () => void;
    page.host.readFile = (p) => new Promise((resolve) => (release = () => resolve(read(p))));
    void page.handle.openPaths([at('params.sldd')]);
    await until(() => tabNames().length === 2 && !!release);
    page.host.readFile = read;
    tableOf('shadow_ws.slx')!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: 'Kp@params.sldd' }, bubbles: true, composed: true }));
    await settled();
    release();
    const kp = await rowOf('params.sldd', 'Kp');
    await until(() => tableOf('params.sldd')!.selectedRowIds.join() === kp.ID);
  });

  it("a model's menu copies a row's name and value through the host's clipboard", async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx' });
    await open(page, 'shadow_ws.slx');
    expect((await menuOn('shadow_ws.slx', 'Kp')).map((i) => i.id)).toEqual(['copyName', 'copyValue', 'showInGraph']);
    choose('copyName');
    await menuOn('shadow_ws.slx', 'Kp');
    choose('copyValue');
    await until(() => page.main.copied.length === 2);
    expect(page.main.copied).toEqual(['Kp', '7']);
  });

  it("a dictionary's menu is the editing one, ending with the text copies; a MAT-file kept for viewing only has the read-only one", async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'viewing_only.mat': 'viewing_only.mat' });
    await open(page, 'params.sldd', 'viewing_only.mat');
    expect((await menuOn('params.sldd', 'Ki')).map((i) => i.id)).toEqual([
      'copy',
      'cut',
      'paste',
      'addChild',
      'delete',
      'undo',
      'redo',
      'copyName',
      'copyValue',
      'showInGraph',
    ]);
    // Copy Name, from the editing menu, puts text on the host's clipboard.
    choose('copyName');
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual(['Ki']);
    await until(() => !!tableOf('viewing_only.mat')!.banners?.notice);
    expect(tableOf('viewing_only.mat')!.banners?.notice).toMatch(/opens for viewing only/);
    expect((await menuOn('viewing_only.mat', 'd_scalar')).map((i) => i.id)).toEqual(['copyName', 'copyValue', 'showInGraph']);
    choose('copyValue');
    await until(() => page.main.copied.length === 2);
    expect(page.main.copied).toEqual(['Ki', '3.5']);
  });

  it('a host that has a clipboard by the time of a copy is asked, whatever it had when the file opened', async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx' }, { without: ['copyText'] });
    await open(page, 'shadow_ws.slx');
    page.host.copyText = async (text) => void page.main.copied.push(text);
    await menuOn('shadow_ws.slx', 'Kp');
    choose('copyName');
    await until(() => page.main.copied.length === 1);
    expect(page.main.copied).toEqual(['Kp']);
  });

  it('a host with no clipboard of its own copies through the page\'s', async () => {
    const page = startPage({ 'shadow_ws.slx': 'shadow_ws.slx' }, { without: ['copyText'] });
    const written: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t: string) => void written.push(t) }, configurable: true });
    try {
      await open(page, 'shadow_ws.slx');
      await menuOn('shadow_ws.slx', 'Kp');
      choose('copyName');
      await until(() => written.length === 1);
      expect(written).toEqual(['Kp']);
    } finally {
      Reflect.deleteProperty(navigator, 'clipboard');
    }
  });
});
