// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Closing with unsaved edits: a tab, and the window (or Quit, requestClose), ask first, through
// the host's prompt or, for a host with none, the shell's own confirm dialog, and do as the answer
// says. Ported from data-explorer-app's page test of the same name; the in-page dialog is new.
import { describe, expect, it } from 'vitest';
import {
  activeTab,
  at,
  changedOutside,
  confirmButton,
  confirmDialog,
  dirtyTabs,
  edit,
  errorDialog,
  open,
  savedTo,
  settled,
  startPage,
  tabNames,
  tableOf,
  until,
  valueIn,
} from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat' };

describe('closing a tab', () => {
  it('with nothing unsaved, closes without asking', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    expect(page.main.closeAsked).toEqual([]);
  });

  it("with unsaved edits, asks about that file: Cancel keeps it, Don't Save closes it unwritten", async () => {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.main.closeAnswers.push('cancel');
    // The tab's own × button.
    activeTab()!.querySelector<HTMLElement>('.close')!.click();
    await settled();
    expect(page.main.closeAsked).toEqual([['params.sldd']]);
    expect(tabNames()).toEqual(['ParamMat.mat', 'params.sldd']);

    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    expect(page.main.saves).toEqual([]);
    expect(page.main.edited.at(-1)).toBe(false);
  });

  it('with unsaved edits, Save writes them and then closes it; a save that fails keeps it open', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    page.main.failSave = 'The disk is full.';
    page.main.closeAnswers.push('save');
    page.command('close-tab');
    await until(() => errorDialog().hasAttribute('open'));
    expect(tabNames()).toEqual(['params.sldd']);
    errorDialog().close();

    page.main.failSave = undefined;
    page.main.closeAnswers.push('save');
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kp')).toBe('5');
  });
});

describe('closing a tab, for a host with no prompt of its own', () => {
  it("asks in the shell's confirm dialog: Cancel keeps it, Don't Save closes it, Save writes it first", async () => {
    const page = startPage({ ...FILES, 'rt_bin.sldd': 'rt_bin.sldd' }, { without: ['confirmClose'] });
    await open(page, 'params.sldd', 'rt_bin.sldd');
    await edit('rt_bin.sldd', 'Wheels', '6');
    await until(() => dirtyTabs().length === 1);
    page.command('close-tab');
    await until(() => confirmDialog().hasAttribute('open'));
    expect(confirmDialog().shadowRoot!.textContent).toContain('Do you want to save the changes you made to rt_bin.sldd?');
    (await confirmButton('Cancel')).click();
    await settled();
    expect(tabNames()).toEqual(['params.sldd', 'rt_bin.sldd']);

    page.command('close-tab');
    (await confirmButton('Save')).click();
    await until(() => tabNames().length === 1);
    expect(await valueIn(savedTo(page.main, 'rt_bin.sldd')!, 'rt_bin.sldd', 'Wheels')).toBe('6');

    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('close-tab');
    (await confirmButton("Don't Save")).click();
    await until(() => tabNames().length === 0);
    expect(savedTo(page.main, 'params.sldd')).toBeUndefined();
  });
});

describe('closing the window, or quitting', () => {
  it('with nothing unsaved, closes without asking', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closedWindow).toEqual([true]);
    expect(page.main.closeAsked).toEqual([]);
  });

  it('asks once about every file with unsaved edits: Cancel keeps the window, Save All writes each and closes it', async () => {
    const page = startPage({ ...FILES, 'rt_bin.sldd': 'rt_bin.sldd' });
    await open(page, 'params.sldd', 'rt_bin.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 2);
    page.main.closeAnswers.push('cancel');
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closeAsked).toEqual([['params.sldd', 'ParamMat.mat']]);
    expect(page.main.closedWindow).toEqual([false]);

    page.main.closeAnswers.push('save');
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 2);
    expect(page.main.closedWindow).toEqual([false, true]);
    expect(page.main.saves.map((s) => s.path)).toEqual([at('params.sldd'), at('ParamMat.mat')]);
    expect(await valueIn(savedTo(page.main, 'ParamMat.mat')!, 'ParamMat.mat', 'ParamMat')).toBe('[1 2 3; 4 5 7]');
  });

  it('a save that fails while closing keeps the window open', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    page.main.failSave = 'The disk is full.';
    page.main.closeAnswers.push('save');
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closedWindow).toEqual([false]);
    expect(tableOf('params.sldd')).toBeTruthy();
  });

  it("Don't Save closes it, writing nothing", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    page.main.closeAnswers.push('discard');
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closedWindow).toEqual([true]);
    expect(page.main.saves).toEqual([]);
  });

  it('for a host with no prompt of its own, asks once in the confirm dialog, naming every unsaved file', async () => {
    const page = startPage(FILES, { without: ['confirmClose'] });
    await open(page, 'params.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 2);
    page.closeWindow();
    await until(() => confirmDialog().hasAttribute('open'));
    expect(confirmDialog().shadowRoot!.textContent).toContain('params.sldd\nParamMat.mat');
    (await confirmButton('Save All')).click();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closedWindow).toEqual([true]);
    expect(page.main.saves.map((s) => s.path)).toEqual([at('params.sldd'), at('ParamMat.mat')]);
  });
});

describe('closing with Save, when another program writes over the save', () => {
  /** A page whose next save the host answers as written over by another program's Kp `value`. */
  async function overwritten(value: string) {
    const page = startPage(FILES);
    await open(page, 'ParamMat.mat', 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    const x = await changedOutside(page.main.files.get(at('params.sldd'))!, 'params.sldd', 'Kp', value);
    page.host.saveFile = async (p) => (page.main.files.set(p, x), { overwritten: true });
    page.main.closeAnswers.push('save');
    return page;
  }

  it("Keep My Edits keeps the tab open, unsaved; Reload lets it close on the other program's file", async () => {
    const page = await overwritten('7');
    page.main.reloadAnswers.push(false);
    page.command('close-tab');
    await until(() => page.main.reloadAsked.length === 1);
    await settled(50);
    expect(tabNames()).toEqual(['ParamMat.mat', 'params.sldd']);
    expect(dirtyTabs()).toEqual(['params.sldd']);

    page.main.closeAnswers.push('save');
    page.main.reloadAnswers.push(true);
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    expect(page.main.reloadAsked).toEqual(['params.sldd', 'params.sldd']);
  });

  it('Keep My Edits keeps the window open', async () => {
    const page = await overwritten('7');
    page.main.reloadAnswers.push(false);
    page.closeWindow();
    await until(() => page.main.closedWindow.length === 1);
    expect(page.main.closedWindow).toEqual([false]);
    await until(() => dirtyTabs().length === 1);
    expect(dirtyTabs()).toEqual(['params.sldd']);
  });

  it('a file gone after the save, kept, stays unsaved, so closing asks again', async () => {
    const page = await overwritten('7');
    page.host.saveFile = async (p) => (page.main.files.delete(p), { overwritten: true });
    page.main.reloadAnswers.push(false);
    page.command('close-tab');
    await until(() => page.main.reloadAsked.length === 1);
    await until(() => dirtyTabs().length === 1);
    expect(tabNames()).toEqual(['ParamMat.mat', 'params.sldd']);
    expect(tableOf('params.sldd')!.banners?.error).toMatch(/^Failed to read params\.sldd again/);
    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    expect(page.main.closeAsked).toEqual([['params.sldd'], ['params.sldd']]);
  });

  it('Reload over a file gone after the save leaves the document unsaved, so closing asks again', async () => {
    const page = await overwritten('7');
    page.host.saveFile = async (p) => (page.main.files.delete(p), { overwritten: true });
    page.main.reloadAnswers.push(true);
    page.command('close-tab');
    await until(() => page.main.reloadAsked.length === 1);
    await until(() => dirtyTabs().length === 1);
    expect(tabNames()).toEqual(['ParamMat.mat', 'params.sldd']);
    expect(tableOf('params.sldd')!.banners?.error).toMatch(/^Failed to reload params\.sldd/);
    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    expect(page.main.closeAsked).toEqual([['params.sldd'], ['params.sldd']]);
  });
});
