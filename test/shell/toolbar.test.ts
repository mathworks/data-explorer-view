// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The shell's toolbar, connected: the buttons toolbarItems lays out, enabled as the active
// document and its table allow and redrawn as those change (a selection, the source's changes, an
// unsaved edit, another tab), and each press carried out as the command it names. A press takes
// no focus, so a cell editor still open is still open: every command first commits it, as Save
// always did. toolbarItems.test.ts pins the rule; this, that the shell follows it.
import { describe, expect, it } from 'vitest';
import {
  at,
  dirtyTabs,
  edit,
  enabledItems,
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
  toolbar,
  toolbarButton,
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

  it('has no Folder for a host without one', async () => {
    startPage(FILES, { without: ['pickFolder'] });
    await until(() => toolbar().items.length > 0);
    expect(toolbar().items.map((i) => i.id)).not.toContain('open-folder');
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

  it('is compact when the settings say so', async () => {
    localStorage.setItem('dex-shell:settings', JSON.stringify({ theme: 'light', toolbar: 'compact' }));
    startPage(FILES);
    await until(() => toolbar().compact);
  });
});
