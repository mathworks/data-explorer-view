// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What the shell says of the active document's editing, as the prototype said it:
//  - Undo and Redo (the toolbar's buttons, the palette's rows, the table's menu) are offered only
//    where the document has an edit to take back or make again, not on a file just opened;
//  - Save's icon is the unsaved one while the active file holds unsaved edits;
//  - Copy, Cut, Paste and Delete say what they did in a toast (and the Log), from the toolbar, a
//    chord or the menu alike, and nothing where they did nothing;
//  - Shift+F10 and the ContextMenu key on a table open the menu of its selected row.
import { describe, expect, it, vi } from 'vitest';
import type { Toast } from '../../src/widgets/app-shell/dex-toast-host.js';
import type { PaletteCommand } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { LogEntry } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import {
  choose,
  dirtyTabs,
  edit,
  enabledItems,
  logPanel,
  menuOn,
  open,
  palette,
  rowOf,
  selectRow,
  selectTab,
  startPage,
  tableOf,
  textOf,
  toastHost,
  toolbar,
  toolbarButton,
  until,
} from './harness.js';

const FILES = { 'params.sldd': 'params.sldd', 'ParamMat.mat': 'ParamMat.mat', 'rt_bin.sldd': 'rt_bin.sldd' };
const has = (...ids: string[]) => () => ids.every((id) => enabledItems().includes(id));
const lacks = (...ids: string[]) => () => ids.every((id) => !enabledItems().includes(id));
const saveIcon = () => toolbar().items.find((i) => i.id === 'save')?.icon;

/** What the toast host is shown, from now on. */
function shownToasts(): Toast[] {
  const shown: Toast[] = [];
  const show = toastHost().show.bind(toastHost());
  vi.spyOn(toastHost(), 'show').mockImplementation((toast) => (shown.push(toast), show(toast)));
  return shown;
}
const said = (shown: Toast[]) => shown.map((t) => t.message);
/** The lines the log panel is given from now on, as `level message`. */
function logged(): string[] {
  const lines: string[] = [];
  const append = logPanel().appendEntry.bind(logPanel());
  logPanel().appendEntry = (entry: LogEntry) => (lines.push(`${entry.level} ${entry.message}`), append(entry));
  return lines;
}
const press = (name: string, init: KeyboardEventInit) =>
  tableOf(name)!.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init }));

describe('Undo and Redo, by what the active document can undo', () => {
  it('are offered on no file just opened: not on the toolbar, in the palette, nor in the menu', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(has('save-as', 'close-tab'));
    expect(enabledItems()).not.toContain('undo');
    expect(enabledItems()).not.toContain('redo');
    const items = await menuOn('params.sldd', 'Kp');
    expect(items.filter((i) => i.id === 'undo' || i.id === 'redo')).toEqual([
      { id: 'undo', label: 'Undo', disabled: true },
      { id: 'redo', label: 'Redo', disabled: true },
    ]);
    // The palette's rows are the toolbar's, as it opens.
    let rows: PaletteCommand[] = [];
    const show = palette().show.bind(palette());
    palette().show = (commands) => ((rows = commands), show(commands));
    page.command('palette');
    expect(rows.filter((c) => c.id === 'undo' || c.id === 'redo').map((c) => !!c.disabled)).toEqual([true, true]);
  });

  it.each(['params.sldd', 'rt_bin.sldd', 'ParamMat.mat'])('%s: Undo after an edit, Redo after its undo, and neither once undone and redone away', async (file) => {
    const page = startPage(FILES);
    await open(page, file);
    const [row, to] = file === 'ParamMat.mat' ? ['ParamMat', '[1 2 3; 4 5 7]'] : file === 'rt_bin.sldd' ? ['Wheels', '6'] : ['Kp', '5'];
    await until(lacks('undo', 'redo'));
    await edit(file, row, to);
    await until(has('undo'));
    expect(enabledItems()).not.toContain('redo');
    toolbarButton('Undo')!.click();
    await until(has('redo'));
    await until(lacks('undo'));
    expect(dirtyTabs()).toEqual([]);
    toolbarButton('Redo')!.click();
    await until(has('undo'));
    await until(lacks('redo'));
    expect(textOf(await rowOf(file, row))).toBe(to);
  });
});

describe("Save's icon", () => {
  it('is the unsaved one while the active file holds unsaved edits, and the saved one again once saved', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    await until(() => saveIcon() === 'saved');
    await edit('params.sldd', 'Kp', '5');
    await until(() => saveIcon() === 'unsaved');
    page.command('save');
    await until(() => saveIcon() === 'saved');
  });
});

describe('what Copy, Cut, Paste and Delete say', () => {
  it('Copy from the menu, Cut from the toolbar, Paste as its chord: each a toast, and a line of the Log', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd', 'ParamMat.mat');
    const shown = shownToasts();
    const lines = logged();
    await selectTab('params.sldd');
    await menuOn('params.sldd', 'Kp');
    choose('copy');
    await until(() => shown.length === 1);
    expect(shown[0]).toEqual({ level: 'info', message: 'Copied to clipboard', ms: 2000 });
    await selectRow('params.sldd', 'Uo');
    await until(has('cut'));
    toolbarButton('Cut')!.click();
    await until(() => shown.length === 2);
    expect(shown[1].message).toBe('Cut to clipboard');
    // Into the MAT-file, the other tab: Uo leaves the dictionary for it.
    await selectTab('ParamMat.mat');
    await selectRow('ParamMat.mat', 'ParamMat');
    await until(has('paste'));
    expect(press('ParamMat.mat', { key: 'v', metaKey: true, ctrlKey: true })).toBe(false);
    await until(() => shown.length === 3);
    expect(said(shown)).toEqual(['Copied to clipboard', 'Cut to clipboard', 'Pasted']);
    await rowOf('ParamMat.mat', 'Uo');
    expect(lines).toEqual(expect.arrayContaining(['info Copied to clipboard', 'info Cut to clipboard', 'info Pasted']));
  });

  it('Delete counts the entries it deleted: one, then two', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const shown = shownToasts();
    await selectRow('params.sldd', 'Kp');
    await until(has('delete'));
    toolbarButton('Delete')!.click();
    await until(() => shown.length === 1);
    expect(shown[0]).toEqual({ level: 'info', message: 'Entry deleted', ms: 2000 });
    const a = await rowOf('params.sldd', 'Uo');
    const b = await rowOf('params.sldd', 'Ki');
    const table = tableOf('params.sldd')!;
    table.selectedRowIds = [a.ID, b.ID];
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [a.ID, b.ID] }, bubbles: true, composed: true }));
    press('params.sldd', { key: 'Delete' });
    await until(() => shown.length === 2);
    expect(shown[1].message).toBe('2 entries deleted');
  });

  it('says nothing where nothing was done: a press with nothing selected', async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const shown = shownToasts();
    page.command('copy');
    page.command('delete');
    page.command('paste');
    await new Promise((r) => setTimeout(r, 30));
    expect(shown).toEqual([]);
  });
});

describe('the row menu from the keyboard', () => {
  it("Shift+F10 on a table opens its selected row's menu, the right-click's", async () => {
    const page = startPage(FILES);
    await open(page, 'params.sldd');
    const menu = document.querySelector('dex-context-menu')!;
    const shown: string[][] = [];
    const show = menu.show.bind(menu);
    menu.show = (x, y, items) => (shown.push(items.filter((i) => !i.separator).map((i) => i.id)), show(x, y, items));
    await selectRow('params.sldd', 'Kp');
    const grid = tableOf('params.sldd')!.shadowRoot!.querySelector<HTMLElement>('.table-container')!;
    const e = new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true, composed: true, cancelable: true });
    grid.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true);
    expect(shown).toHaveLength(1);
    expect(shown[0]).toEqual(expect.arrayContaining(['copy', 'cut', 'paste', 'delete', 'undo', 'redo', 'showInGraph']));
    expect(tableOf('params.sldd')!.keyboardMenu).toBe(true);
  });
});
