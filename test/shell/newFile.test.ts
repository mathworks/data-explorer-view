// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// New, connected: the toolbar's New, Mod+N, the palette's New Data Dictionary… and a native menu's
// `new-file` ask the host where a new data dictionary is to go (ShellHost.newFile), offering a name
// no open tab has, and open it there in a tab of its own: a new, empty dictionary, which no file
// holds yet, so it is unsaved from the start (its tab's ●, the title, the status bar, the window's
// edited mark) and its first Save writes it, the bytes MATLAB writes for a new dictionary. Nothing is
// read from the path. A cancel does nothing, a dialog that fails says why, a path the shell cannot
// make a dictionary at says so, and a host without newFile offers no New at all.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import {
  at,
  activeTab,
  dirtyTabs,
  open,
  palette,
  savedTo,
  settled,
  startPage,
  statusText,
  tabNames,
  tableOf,
  toastTexts,
  toolbar,
  until,
  type Page,
} from './harness.js';

afterEach(() => Reflect.deleteProperty(navigator, 'platform'));

const MATLAB_NEW = new Uint8Array(readFileSync(path.join(import.meta.dirname, '../newFile/fixtures/created_r2027a.sldd')));

/** A page whose host makes new files: each New is answered by the next of `answers` (a path, null, or an error). */
function newFilePage(answers: (string | null | Error)[], files: Record<string, string> = {}): { page: Page; asked: string[] } {
  const asked: string[] = [];
  const page = startPage(files);
  page.host.newFile = async (suggested) => {
    asked.push(suggested);
    const answer = answers.shift() ?? null;
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { page, asked };
}

/** The new file `name`'s table, once its sections are painted. */
async function newTable(name: string) {
  await until(() => (tableOf(name)?.rows.length ?? 0) > 0);
  return tableOf(name)!;
}

describe('New', () => {
  it('asks the host where, offering untitled.sldd, and opens a new dictionary there, unsaved from the start', async () => {
    const { page, asked } = newFilePage([at('untitled.sldd')]);
    page.command('new-file');
    const table = await newTable('untitled.sldd');
    expect(asked).toEqual(['untitled.sldd']);
    // Its sections, and no entry: a new dictionary.
    expect(table.rows.map((r) => r.Name?.label)).toEqual(['Design Data', 'Architectural Data', 'Configurations', 'Other Data']);
    expect(tabNames()).toEqual(['untitled.sldd']);
    expect(activeTab()?.textContent).toContain('untitled.sldd');
    expect(dirtyTabs()).toEqual(['untitled.sldd']);
    expect(document.title).toBe('● untitled.sldd — Data Explorer');
    expect(statusText()).toBe('Data dictionary · Modified');
    expect(page.main.edited.at(-1)).toBe(true);
    // Nothing is read from where it goes, which may hold nothing yet.
    expect(page.main.reads).toEqual([]);
    // The toolbar has New first, with a host that makes files; Save is the one to press now.
    expect(toolbar().items[0]).toMatchObject({ id: 'new-file', label: 'New', disabled: false });
    expect(toolbar().items.find((i) => i.id === 'save')).toMatchObject({ icon: 'unsaved', disabled: false });
  });

  it("is saved where the host said, as MATLAB's own new dictionary, and is then clean", async () => {
    const { page } = newFilePage([at('plant.sldd')]);
    page.command('new-file');
    await newTable('plant.sldd');
    page.command('save');
    await until(() => dirtyTabs().length === 0);
    expect(savedTo(page.main, 'plant.sldd')).toEqual(MATLAB_NEW);
    expect(toastTexts()).toContain('Saved plant.sldd');
    expect(document.title).toBe('plant.sldd — Data Explorer');
    expect(page.main.edited.at(-1)).toBe(false);
  });

  it('offers a name no open tab has, as Simulink names a new model', async () => {
    const { page, asked } = newFilePage([at('untitled.sldd'), at('untitled1.sldd'), null]);
    page.command('new-file');
    await newTable('untitled.sldd');
    page.command('new-file');
    await newTable('untitled1.sldd');
    page.command('new-file');
    await until(() => asked.length === 3);
    expect(asked).toEqual(['untitled.sldd', 'untitled1.sldd', 'untitled2.sldd']);
    expect(tabNames()).toEqual(['untitled.sldd', 'untitled1.sldd']);
  });

  it('cancelled, opens nothing and says nothing', async () => {
    const { page, asked } = newFilePage([null]);
    page.command('new-file');
    await until(() => asked.length === 1);
    await settled();
    expect(tabNames()).toEqual([]);
    expect(toastTexts()).toEqual([]);
  });

  it("says why the host's dialog could not be shown, and nothing of one the user cancelled", async () => {
    const cancelled = Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' });
    const { page } = newFilePage([cancelled, new Error('the dialog is not allowed here')]);
    page.command('new-file');
    await settled();
    expect(toastTexts()).toEqual([]);
    page.command('new-file');
    await until(() => toastTexts().length > 0);
    expect(toastTexts()).toEqual(['Could not make a new file: the dialog is not allowed here']);
    expect(tabNames()).toEqual([]);
  });

  it('makes no dictionary at a path that is not one, nor over a file open in a tab', async () => {
    const { page } = newFilePage([at('notes.mat'), at('params.sldd')], { 'params.sldd': 'params.sldd' });
    await open(page, 'params.sldd');
    page.command('new-file');
    await until(() => toastTexts().length === 1);
    expect(toastTexts()).toEqual(['Could not make notes.mat: a new file is a data dictionary, whose name ends in .sldd.']);
    page.command('new-file');
    await until(() => toastTexts().length === 2);
    expect(toastTexts()[1]).toBe('Could not make params.sldd: it is open in a tab. Close the tab first.');
    expect(tabNames()).toEqual(['params.sldd']);
    expect(dirtyTabs()).toEqual([]);
  });

  it('asks before a new file closes unsaved, as any unsaved file', async () => {
    const { page } = newFilePage([at('untitled.sldd')]);
    page.command('new-file');
    await newTable('untitled.sldd');
    page.main.closeAnswers.push('discard');
    page.command('close-tab');
    await until(() => tabNames().length === 0);
    expect(page.main.closeAsked).toEqual([['untitled.sldd']]);
    expect(page.main.saves).toEqual([]);
  });

  it('runs on Mod+N, and from the palette, where it is New Data Dictionary…', async () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });
    const { page, asked } = newFilePage([null, null]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true }));
    await until(() => asked.length === 1);
    let shown: PaletteCommand[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((shown = commands), show(commands));
    page.command('palette');
    expect(shown[0]).toMatchObject({ id: 'new-file', label: 'New Data Dictionary…', category: 'File', shortcut: 'Ctrl+N' });
    palette().dispatchEvent(new CustomEvent('dex-palette-run', { detail: { id: 'new-file' }, bubbles: true, composed: true }));
    await until(() => asked.length === 2);
  });

  it('is not offered by a host that makes no file: no button, no palette row, and the command does nothing', async () => {
    const page = startPage();
    expect(toolbar().items.map((i) => i.id)).not.toContain('new-file');
    let shown: PaletteCommand[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((shown = commands), show(commands));
    page.command('palette');
    expect(shown.map((c) => c.id)).not.toContain('new-file');
    palette().close();
    page.command('new-file');
    await settled();
    expect(tabNames()).toEqual([]);
    expect(toastTexts()).toEqual([]);
  });
});
