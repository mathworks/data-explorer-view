// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// Saving from the shell: the marks a file with unsaved edits wears (its tab, its Explorer row, the
// title, the host's edited mark, the status bar), Save and Save As through the host, and what a
// save that cannot be made says. Ported from data-explorer-app's page test of the same name, the
// app's open files' list now the Explorer, and its title written through the host when it has a
// way to.
import { describe, expect, it } from 'vitest';
import {
  activeTab,
  at,
  dirtyTabs,
  edit,
  errorDialog,
  explorerRowOf,
  open,
  rowOf,
  savedTo,
  settled,
  startPage,
  statusText,
  tabNames,
  tableOf,
  textOf,
  toastTexts,
  until,
  valueIn,
} from './harness.js';

const EDITS = [
  { file: 'params.sldd', row: 'Kp', to: '5', format: 'Data dictionary' },
  { file: 'rt_bin.sldd', row: 'Wheels', to: '6', format: 'Data dictionary' },
  { file: 'ParamMat.mat', row: 'ParamMat', to: '[1 2 3; 4 5 7]', format: 'MAT-file' },
  { file: 'slxcases.slx', row: 'tau', to: '0.5', format: 'Simulink model' },
];
const FILES = Object.fromEntries(EDITS.map((e) => [e.file, e.file]));
/** The Explorer's row of `name` shows the unsaved mark. */
const markedInExplorer = (name: string) => !!explorerRowOf(name)?.querySelector('.dirty');

describe('unsaved edits and Save', () => {
  it.each(EDITS)("$file: an edit marks the tab, the Explorer's row, the title, the status bar and the window, until Save writes it", async (e) => {
    const page = startPage(FILES);
    await open(page, e.file);
    expect(page.main.edited.at(-1)).toBe(false);
    await until(() => statusText() === e.format);
    await edit(e.file, e.row, e.to);
    await until(() => dirtyTabs().includes(e.file) && markedInExplorer(e.file));
    expect(activeTab()?.querySelector('.dot')?.textContent).toBe('●');
    expect(document.title).toBe(`● ${e.file} — Data Explorer`);
    expect(statusText()).toBe(`${e.format} · Modified`);
    expect(page.main.edited.at(-1)).toBe(true);

    page.command('save');
    await until(() => dirtyTabs().length === 0 && !markedInExplorer(e.file));
    expect(await valueIn(savedTo(page.main, e.file)!, e.file, e.row)).toBe(e.to);
    expect(document.title).toBe(`${e.file} — Data Explorer`);
    expect(statusText()).toBe(e.format);
    expect(page.main.edited.at(-1)).toBe(false);
  });

  it('a host with a title of its own is given the title, and the app name it is connected with', async () => {
    const titles: string[] = [];
    const page = startPage({ 'params.sldd': 'params.sldd' }, { appName: 'Plant Data' });
    page.host.setTitle = (t) => void titles.push(t);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    await until(() => titles.at(-1) === '● params.sldd — Plant Data');
    page.command('save');
    await until(() => titles.at(-1) === 'params.sldd — Plant Data');
  });

  it('Save says so in a toast that goes by itself; a save with nothing to write says nothing', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    page.command('save');
    await settled();
    expect(toastTexts()).toEqual([]);
    await edit('params.sldd', 'Kp', '5');
    await until(() => dirtyTabs().length === 1);
    page.command('save');
    await until(() => toastTexts().includes('Saved params.sldd'));
  });

  it('Save, and closing, take what a cell editor still open holds', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    const type = async (file: string, row: string, text: string) => {
      const table = tableOf(file)!;
      expect(table.beginRename((await rowOf(file, row)).ID)).toBe(true);
      await table.updateComplete;
      const input = table.shadowRoot!.querySelector<HTMLInputElement>('.edit-input')!;
      input.value = text;
    };
    // Typed, not committed, then Save.
    await type('ParamMat.mat', 'ParamMat', 'Gains');
    page.command('save');
    await until(() => !!savedTo(page.main, 'ParamMat.mat'));
    expect(await valueIn(savedTo(page.main, 'ParamMat.mat')!, 'ParamMat.mat', 'Gains')).toBe('[1 2 3; 4 5 6]');
    expect(dirtyTabs()).toEqual([]);
    // Typed, not committed, then the tab is closed: it asks, and Save writes it. The Explorer's
    // row of the dictionary makes its tab the active one.
    explorerRowOf('params.sldd')!.click();
    await until(() => !!activeTab()?.textContent?.includes('params.sldd'));
    await type('params.sldd', 'Kp', 'Kd');
    page.main.closeAnswers.push('save');
    page.command('close-tab');
    await until(() => tabNames().length === 1);
    expect(page.main.closeAsked).toEqual([['params.sldd']]);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kd')).toBe('1');
  });

  it('Save writes nothing for a clean document or a .mdl', async () => {
    const page = startPage({ 'params.sldd': 'params.sldd', 'legacy_ctrl.mdl': 'legacy_ctrl.mdl' });
    await open(page, 'params.sldd', 'legacy_ctrl.mdl');
    // The model is active: neither Save nor Save As has anything to write. The commands act on the
    // tab active when they are given, whatever is active by the time they are carried out.
    page.main.saveAs.push(at('copy.mdl'));
    page.command('save');
    page.command('save-as');
    explorerRowOf('params.sldd')!.click();
    await until(() => !!activeTab()?.textContent?.includes('params.sldd'));
    page.command('save');
    await settled(50);
    expect(page.main.saves).toEqual([]);
    expect(page.main.saveAs).toEqual([at('copy.mdl')]);
  });

  it('Save As of a .slx kept for viewing only says why it cannot be saved, and asks for no path', async () => {
    const page = startPage({ 'shared_gain.slx': 'shared_gain.slx' });
    await open(page, 'shared_gain.slx');
    page.main.saveAs.push(at('copy.slx'));
    page.command('save');
    page.command('save-as');
    const dialog = errorDialog();
    await until(() => dialog.hasAttribute('open'));
    expect(dialog.shadowRoot!.textContent).toContain('Could Not Save shared_gain.slx');
    expect(dialog.shadowRoot!.textContent).toContain('it holds no "[Content_Types].xml"');
    expect(page.main.saves).toEqual([]);
    expect(page.main.saveAs).toEqual([at('copy.slx')]);
  });

  it('Save As elsewhere writes the copy and the tab shows it; the file it came from keeps its bytes', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const before = page.main.files.get(at('params.sldd'))!.slice();
    await edit('params.sldd', 'Kp', '5');
    page.main.saveAs.push(at('copy.sldd'));
    page.command('save-as');
    await until(() => tabNames().includes('copy.sldd'));
    expect(tabNames()).toEqual(['copy.sldd']);
    expect(page.main.files.get(at('params.sldd'))).toEqual(before);
    expect(textOf(await rowOf('copy.sldd', 'Kp'))).toBe('5');
    expect(dirtyTabs()).toEqual([]);
  });

  it('Save As onto the file itself is a save; a cancelled one writes nothing and leaves it unsaved', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    page.main.saveAs.push(null);
    page.command('save-as');
    await settled();
    expect(page.main.saves).toEqual([]);
    await until(() => dirtyTabs().length === 1);
    expect(dirtyTabs()).toEqual(['params.sldd']);
    page.main.saveAs.push(at('params.sldd'));
    page.command('save-as');
    await until(() => dirtyTabs().length === 0);
    expect(tabNames()).toEqual(['params.sldd']);
    expect(await valueIn(savedTo(page.main, 'params.sldd')!, 'params.sldd', 'Kp')).toBe('5');
  });

  it('a save the host cannot make shows why in the error dialog, and the edit stays unsaved', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await edit('params.sldd', 'Kp', '5');
    page.main.failSave = 'Cannot save "params.sldd": the file is read-only. Nothing was written.';
    page.command('save');
    const dialog = errorDialog();
    await until(() => dialog.hasAttribute('open'));
    expect(dialog.shadowRoot!.textContent).toContain('Could Not Save params.sldd');
    expect(dialog.shadowRoot!.textContent).toContain('the file is read-only');
    await until(() => dirtyTabs().length === 1);
    expect(dirtyTabs()).toEqual(['params.sldd']);
    // It saves once the host can write it.
    dialog.close();
    page.main.failSave = undefined;
    page.command('save');
    await until(() => dirtyTabs().length === 0);
  });

  it('Save As of a MAT-file kept for viewing only writes a copy of its bytes, which the tab then shows', async () => {
    const page = startPage({ 'viewing_only.mat': 'viewing_only.mat' });
    await open(page, 'viewing_only.mat');
    page.main.saveAs.push(at('copy.mat'));
    page.command('save-as');
    await until(() => tabNames().includes('copy.mat'));
    expect(page.main.files.get(at('copy.mat'))).toEqual(page.main.files.get(at('viewing_only.mat')));
    await until(() => !!tableOf('copy.mat')?.banners?.notice);
  });

  it('Save All writes every file with unsaved edits, and only those', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'rt_bin.sldd', 'ParamMat.mat');
    await edit('params.sldd', 'Kp', '5');
    await edit('ParamMat.mat', 'ParamMat', '[1 2 3; 4 5 7]');
    await until(() => dirtyTabs().length === 2);
    page.command('save-all');
    await until(() => dirtyTabs().length === 0);
    expect(page.main.saves.map((s) => s.path)).toEqual([at('params.sldd'), at('ParamMat.mat')]);
  });
});
