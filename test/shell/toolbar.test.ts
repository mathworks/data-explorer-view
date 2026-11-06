// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's toolbar, connected: the buttons toolbarItems lays out, enabled as the active
// document and its table allow and redrawn as those change (a selection, the source's changes, an
// unsaved edit, another tab), and each press carried out as the command it names. A press takes
// no focus, so a cell editor still open is still open: every command first commits it, as Save
// always did. toolbarItems.test.ts pins the rule; this, that the shell follows it.
import { describe, expect, it, vi } from 'vitest';
import type { DexIcon } from '../../src/widgets/shared/dex-icon.js';
import {
  at,
  dirtyTabs,
  docsArea,
  edit,
  enabledItems,
  explorer,
  galleryPanel,
  menuOn,
  choose,
  open,
  rowOf,
  savedTo,
  selectRow,
  selectTab,
  startPage,
  tabNames,
  tableOf,
  textOf,
  toastHost,
  toastTexts,
  toolbar,
  toolbarButton,
  settled,
  until,
  valueIn,
} from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'legacy_ctrl.mdl': 'legacy_ctrl.mdl', 'ParamMat.mat': 'ParamMat.mat' };
const has = (...ids: string[]) => () => ids.every((id) => enabledItems().includes(id));
const lacks = (...ids: string[]) => () => ids.every((id) => !enabledItems().includes(id));

describe('the toolbar', () => {
  it('is the shell\'s toolbar row, named for the app, with Folder only for a host that shows folders', async () => {
    startPage(FILES, { appName: 'Plant Data' });
    await until(() => toolbar().items.length > 0);
    expect(toolbar().slot).toBe('toolbar');
    expect(toolbar().label).toBe('Plant Data');
    expect(toolbar().items.map((i) => i.id)).toContain('open-folder');
    expect(enabledItems()).toEqual(['open-file', 'open-folder']);
  });

  it('has no Folder for a host without one, and has it once the host does', async () => {
    const page = startPage(FILES, { without: ['pickFolder'] });
    await until(() => toolbar().items.length > 0);
    expect(toolbar().items.map((i) => i.id)).not.toContain('open-folder');
    expect(docsArea().canOpenFolder).toBe(false);
    page.host.pickFolder = async () => undefined;
    await open(page, 'params.sldd');
    await until(() => toolbar().items.some((i) => i.id === 'open-folder'));
    expect(docsArea().canOpenFolder).toBe(true);
  });

  it("enables Save As and Close for a document the page edits, Save and Save All once it has unsaved edits, and follows the active tab", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(has('save-as', 'close-tab'));
    expect(enabledItems()).not.toContain('save');
    await edit('params.sldd', 'Kp', '5');
    await until(has('save', 'save-all', 'undo'));
    // A .mdl, active, has nothing to save; Save All still has the dictionary.
    await open(page, 'legacy_ctrl.mdl');
    await until(lacks('save', 'save-as', 'undo'));
    expect(enabledItems()).toEqual(expect.arrayContaining(['save-all', 'close-tab']));
  });

  it('draws an unsaved Save in its colours on the Minimal toolbar, where every other icon is one colour', async () => {
    // The blue floppy and the grey one are one shape: in one colour they would be the same glyph.
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const saveIcon = () => toolbarButton('Save')!.querySelector<DexIcon>('dex-icon')!;
    await until(() => toolbarButton('Save')?.querySelector('dex-icon') != null);
    expect([toolbar().mono, saveIcon().iconId, saveIcon().mono]).toEqual([true, 'saved', true]);
    await edit('params.sldd', 'Kp', '5');
    await until(() => saveIcon().iconId === 'unsaved');
    expect(saveIcon().mono).toBe(false);
    const others = [...toolbar().shadowRoot!.querySelectorAll<DexIcon>('dex-icon')].filter((i) => i !== saveIcon());
    expect(others.length).toBeGreaterThan(5);
    expect(others.every((i) => i.mono)).toBe(true);
  });

  it("is drawn, with the Explorer and the Gallery, from a table's first paint, before any selection or change", async () => {
    const page = startPage(FILES);
    // What the toolbar and the rest show the moment a file is open and painted, asked once, not waited for.
    const opened = async (file: string) => {
      await open(page, file);
      await settled();
      return { enabled: enabledItems(), sections: explorer().files.find((f) => f.label === file)?.sections?.length ?? 0 };
    };
    const dictionary = await opened('params.sldd');
    expect(dictionary.enabled).toContain('save-as');
    expect(['copy', 'cut', 'delete', 'add-child', 'save'].filter((id) => dictionary.enabled.includes(id))).toEqual([]);
    expect(dictionary.sections).toBeGreaterThan(0);
    // A model kept for viewing only: no change follows its paint, which is all there is to draw from.
    const model = await opened('legacy_ctrl.mdl');
    expect(['copy', 'delete', 'add-child', 'save', 'save-as'].filter((id) => model.enabled.includes(id))).toEqual([]);
    expect(model.sections).toBeGreaterThan(0);
    expect(galleryPanel().note).toBe('legacy_ctrl.mdl takes no edits.');
    // Copy and Delete once a row is selected, as its menu has them.
    selectTab('params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(has('copy', 'delete'));
  });

  it("enables the editing buttons as the active table's menu would, as the selection and the clipboard move", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    await until(lacks('cut', 'copy', 'delete'));
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(has('cut', 'copy', 'delete'));
    expect(enabledItems()).not.toContain('paste');
    // A row copied, by the menu: Paste can now go where the selection is.
    await menuOn('ParamMat.mat', 'ParamMat');
    choose('copy');
    await until(has('paste'));
  });

  it('carries out a press: Save writes the active document', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(has('save'));
    toolbarButton('Save')!.click();
    await until(() => dirtyTabs().length === 0);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kp')).toBe('5');
  });

  it('Open asks the host for files and opens them, the last one active', async () => {
    const page = startPage(FILES);
    page.main.picks.push([at('params.sldd'), at('ParamMat.mat')]);
    await until(() => !!toolbarButton('Open'));
    toolbarButton('Open')!.click();
    await until(() => tabNames().length === 2);
    expect(tabNames()).toEqual(['params.sldd', 'ParamMat.mat']);
    toolbarButton('Folder')!.click();
    await until(() => page.main.folderPicks === 1);
  });

  it("Open and Folder say, in a toast, why the host's dialog failed; a dialog the user cancelled says nothing", async () => {
    const page = startPage(FILES);
    const refused = (name: string, text: string) => Object.assign(new Error(text), { name });
    page.host.pickFiles = () => Promise.reject(refused('SecurityError', 'The page may not open a file picker now.'));
    page.host.pickFolder = () => Promise.reject(refused('NotAllowedError', 'Folders are not allowed here.'));
    page.command('open-file');
    page.command('open-folder');
    await until(() => toastTexts().length === 2);
    expect(toastTexts()).toEqual(['Could not open a file: The page may not open a file picker now.', 'Could not open a folder: Folders are not allowed here.']);
    expect(toastHost().shadowRoot!.querySelectorAll('.toast.error')).toHaveLength(2);
    toastHost().clear();
    page.host.pickFiles = () => Promise.reject(refused('AbortError', 'The user aborted a request.'));
    page.command('open-file');
    await settled();
    expect(toastTexts()).toEqual([]);
  });

  it("Copy, Paste and Delete run the active table's own items on its selection", async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    await selectRow('params.sldd', 'Kp');
    await until(has('copy'));
    toolbarButton('Copy')!.click();
    // Pasted beside the MAT-file's variable, in the other tab.
    await selectTab('ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(has('paste'));
    toolbarButton('Paste')!.click();
    expect(textOf(await rowOf('ParamMat.mat', 'Kp'))).toBe('1');
    await selectRow('ParamMat.mat', 'Kp');
    await until(has('delete'));
    toolbarButton('Delete')!.click();
    await until(() => !tableOf('ParamMat.mat')!.rows.some((r) => r.Name?.label === 'Kp'));
    expect(dirtyTabs()).toEqual(['ParamMat.mat']);
  });

  it('Cut takes the row out of its file once it is pasted', async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    await selectRow('params.sldd', 'Uo');
    await until(has('cut'));
    toolbarButton('Cut')!.click();
    await selectTab('ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(has('paste'));
    toolbarButton('Paste')!.click();
    expect(textOf(await rowOf('ParamMat.mat', 'Uo'))).toBe('2');
    await until(() => !tableOf('params.sldd')!.rows.some((r) => r.Name?.label === 'Uo'));
  });

  it('Add Child adds a field to the selected struct', async () => {
    const page = startPage({ 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'rt_bin.sldd');
    const specs = await selectRow('rt_bin.sldd', 'Specs');
    const children = () => tableOf('rt_bin.sldd')!.rows.filter((r) => r.parent === specs.ID).length;
    const before = children();
    await until(has('add-child'));
    toolbarButton('Add Child')!.click();
    await until(() => children() > before);
    expect(dirtyTabs()).toEqual(['rt_bin.sldd']);
  });

  it('Undo and Redo take back the active document\'s edit and make it again', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(has('undo'));
    toolbarButton('Undo')!.click();
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '1');
    await until(has('redo'));
    toolbarButton('Redo')!.click();
    await until(() => textOf(tableOf('params.sldd')!.rows.find((r) => r.Name?.label === 'Kp')) === '5');
  });

  it('commits a cell editor still open before it acts: Save takes what was typed, Close asks about it', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const table = tableOf('params.sldd')!;
    expect(table.beginRename((await rowOf('params.sldd', 'Kp')).ID)).toBe(true);
    await table.updateComplete;
    table.shadowRoot!.querySelector<HTMLInputElement>('.edit-input')!.value = 'Kd';
    page.main.closeAnswers.push('save');
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    expect(page.main.closeAsked).toEqual([['params.sldd']]);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kd')).toBe('1');
  });

  describe('commits a cell editor still open before the press acts', () => {
    /** Open the Name editor on `row` of `file` and type `text` in it, uncommitted. */
    async function typing(file: string, row: string, text: string): Promise<void> {
      const table = tableOf(file)!;
      expect(table.beginRename((await rowOf(file, row)).ID)).toBe(true);
      await table.updateComplete;
      table.shadowRoot!.querySelector<HTMLInputElement>('.edit-input')!.value = text;
    }
    const names = (file: string) => tableOf(file)!.rows.map((r) => r.Name?.label);

    it('Copy copies the row as renamed', async () => {
      const page = startPage(FILES);
      await open(page, 'ParamMat.mat', 'params.sldd');
      await selectRow('params.sldd', 'Kp');
      await until(has('copy'));
      await typing('params.sldd', 'Kp', 'Kd');
      toolbarButton('Copy')!.click();
      await until(() => names('params.sldd').includes('Kd'));
      await selectTab('ParamMat.mat');
      await selectRow('ParamMat.mat', 'ParamMat');
      await until(has('paste'));
      toolbarButton('Paste')!.click();
      await until(() => names('ParamMat.mat').includes('Kd'));
      expect(names('ParamMat.mat')).not.toContain('Kp');
    });

    it('Delete deletes the row as renamed, so Undo brings that back', async () => {
      const page = startPage(FILES);
      await open(page, 'params.sldd');
      await selectRow('params.sldd', 'Uo');
      await until(has('delete'));
      await typing('params.sldd', 'Uo', 'Uo2');
      toolbarButton('Delete')!.click();
      await until(() => !names('params.sldd').some((n) => n === 'Uo' || n === 'Uo2'));
      page.command('undo');
      await until(() => names('params.sldd').includes('Uo2'));
    });

    it('Undo, with the focus not in the editor, takes back what it held', async () => {
      const page = startPage(FILES);
      await open(page, 'params.sldd');
      // An edit before it, so that Undo is offered at all: a file just opened has nothing to undo.
      await edit('params.sldd', 'Uo', '7');
      await until(has('undo'));
      // An editor open without the focus, as one is after the focus moved on in a browser that
      // sends no blur (a press on the toolbar takes none).
      const focus = vi.spyOn(HTMLElement.prototype, 'focus').mockImplementation(() => {});
      await typing('params.sldd', 'Kp', 'Kd');
      focus.mockRestore();
      toolbarButton('Undo')!.click();
      await until(() => !tableOf('params.sldd')!.shadowRoot!.querySelector('.edit-input'));
      await until(has('redo'));
      // The rename the editor held is taken back, and the edit before it stays.
      expect(names('params.sldd')).toContain('Kp');
      expect(textOf(await rowOf('params.sldd', 'Uo'))).toBe('7');
      page.command('redo');
      await until(() => names('params.sldd').includes('Kd'));
    });
  });

  it('is compact when the settings say so', async () => {
    localStorage.setItem('dex-shell:settings', JSON.stringify({ theme: 'light', toolbar: 'compact' }));
    startPage(FILES);
    await until(() => toolbar().compact);
  });
});
