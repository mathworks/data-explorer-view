// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's Explorer, connected: the open files under their kinds' headings, each with its
// sections (a dictionary's Design Data, a model's Model Workspace; none for a MAT-file), and what
// opening a row does: a file's tab becomes the active one, a section's is selected in its table,
// and Root shows no document at all. Its row marked selected follows the active tab and the
// section the table's selection is in; a file's right-click menu saves or closes that file.
import { describe, expect, it } from 'vitest';
import {
  activeTab,
  choose,
  dirtyTabs,
  docTabs,
  edit,
  explorer,
  explorerRowOf,
  inspectorNote,
  locationBar,
  open,
  previewTabs,
  savedTo,
  selectRow,
  settled,
  startPage,
  tabIdOf,
  tabNames,
  tableOf,
  until,
  welcomeShown,
} from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'shadow_ws.slx': 'shadow_ws.slx' };
const openRequest = (detail: { fileId: string | null; sectionId?: string; pin: boolean }) =>
  explorer().dispatchEvent(new CustomEvent('dex-explorer-open', { detail, bubbles: true, composed: true }));
const fileOf = (label: string) => explorer().files.find((f) => f.label === label);

describe('the Explorer', () => {
  it('sits in the left side as its Explorer view, above the folder', async () => {
    const page = startPage(FILES);
    const view = explorer().parentElement!;
    expect([view.localName, view.getAttribute('side'), view.getAttribute('view'), view.getAttribute('label'), view.getAttribute('icon'), view.getAttribute('shortcut')]).toEqual([
      'dex-shell-view',
      'left',
      'explorer',
      'Explorer',
      'filesSB',
      'Mod+Shift+E',
    ]);
    expect([...view.children].map((c) => c.localName)).toEqual(['dex-explorer', 'dex-shell-folder']);
    expect(view.parentElement).toBe(page.shell);
  });

  it('lists each open file under its kind, with its path, its unsaved mark, and its sections, none for a MAT-file', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat', 'shadow_ws.slx');
    await until(() => explorer().files.length === 3 && (fileOf('params.sldd')?.sections?.length ?? 0) > 0);
    expect(explorer().files.map((f) => [f.label, f.group, f.icon, f.title])).toEqual([
      ['params.sldd', 'sldd', 'simulinkDataDictionary_FT', '/work/params.sldd'],
      ['ParamMat.mat', 'mat', 'matlabWorkspaceFile', '/work/ParamMat.mat'],
      ['shadow_ws.slx', 'model', 'simulinkModel_FT', '/work/shadow_ws.slx'],
    ]);
    expect(fileOf('params.sldd')!.sections!.map((s) => [s.id, s.label])).toEqual([
      ['section:design', 'Design Data'],
      ['section:arch', 'Architectural Data'],
      ['section:config', 'Configurations'],
      ['section:other', 'Other Data'],
    ]);
    expect(fileOf('ParamMat.mat')!.sections).toEqual([]);
    await until(() => (fileOf('shadow_ws.slx')?.sections?.length ?? 0) > 0);
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => !!fileOf('ParamMat.mat')?.dirty);
  });

  it('opening a file makes its tab the active one; opening it for good keeps its preview', async () => {
    const page = startPage(FILES);
    await open(page, 'shadow_ws.slx', 'ParamMat.mat');
    explorerRowOf('shadow_ws.slx')!.click();
    await until(() => docTabs().active === tabIdOf('shadow_ws.slx'));
    expect(explorer().selected).toEqual({ fileId: tabIdOf('shadow_ws.slx') });
    // A link's file opens in a preview; its row's double-click (or Enter) keeps it.
    tableOf('shadow_ws.slx')!.dispatchEvent(new CustomEvent('dex-link-clicked', { detail: { target: 'Kp@params.sldd' }, bubbles: true, composed: true }));
    await until(() => previewTabs().join() === 'params.sldd');
    openRequest({ fileId: tabIdOf('ParamMat.mat'), pin: false });
    await until(() => docTabs().active === tabIdOf('ParamMat.mat'));
    expect(previewTabs()).toEqual(['params.sldd']);
    openRequest({ fileId: tabIdOf('params.sldd'), pin: true });
    await until(() => docTabs().active === tabIdOf('params.sldd') && previewTabs().length === 0);
  });

  it("opening a section selects its row in the file's table, and the Explorer marks the section the selection is in", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(() => (fileOf('params.sldd')?.sections?.length ?? 0) > 0);
    openRequest({ fileId: tabIdOf('params.sldd'), sectionId: 'section:config', pin: false });
    await until(() => docTabs().active === tabIdOf('params.sldd') && tableOf('params.sldd')!.selectedRowIds.join() === 'section:config');
    await until(() => explorer().selected?.sectionId === 'section:config');
    // A row of another section, selected in the table: its section is the one marked.
    await selectRow('params.sldd', 'Kp');
    await until(() => explorer().selected?.sectionId === 'section:design');
    expect(explorer().selected?.fileId).toBe(tabIdOf('params.sldd'));
  });

  it('Root shows no document: the welcome, no tab active, the inspector empty, the location at Root', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    openRequest({ fileId: null, pin: false });
    await until(welcomeShown);
    expect(document.querySelectorAll('.doc-panel:not([hidden])')).toHaveLength(0);
    expect(docTabs().active).toBe('');
    await until(() => activeTab() === null);
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    expect(inspectorNote().hidden).toBe(false);
    expect(explorer().selected).toEqual({ fileId: null });
    await until(() => locationBar().segments.map((s) => s.label).join() === 'Root');
    expect(document.title).toBe('Data Explorer');
    // A file opened from there shows again.
    openRequest({ fileId: tabIdOf('params.sldd'), pin: false });
    await until(() => !welcomeShown() && docTabs().active === tabIdOf('params.sldd'));
  });

  it("a file's menu saves it, saves it elsewhere, or closes it, whichever tab is active", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const menu = document.querySelector('dex-context-menu')!;
    let shown: string[] = [];
    const show = menu.show.bind(menu);
    menu.show = (x, y, items) => ((shown = items.filter((i) => !i.separator).map((i) => i.label)), show(x, y, items));
    const ask = (label: string) =>
      explorer().dispatchEvent(new CustomEvent('dex-explorer-menu', { detail: { fileId: tabIdOf(label), x: 10, y: 20 }, bubbles: true, composed: true }));
    ask('params.sldd');
    expect(shown).toEqual(['Save', 'Save As…', 'Close']);
    choose('save');
    await until(() => dirtyTabs().length === 0);
    expect(savedTo(page.main, 'params.sldd')).toBeTruthy();
    // The active tab is the MAT-file's; the menu closes the dictionary's.
    ask('params.sldd');
    choose('close-tab');
    await until(() => tabNames().join() === 'ParamMat.mat');
    // A choice that comes after the menu closed is nobody's.
    ask('ParamMat.mat');
    menu.close();
    choose('close-tab');
    await settled();
    expect(tabNames()).toEqual(['ParamMat.mat']);
  });
});
