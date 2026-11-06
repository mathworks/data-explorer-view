// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The row menu from the keyboard (`keyboardMenu`): Shift+F10 and the ContextMenu key, pressed on the
// grid, send `dex-table-context-menu` for the keyboard's current row, placed under it, as a
// right-click on that row does. Without it a keyboard user had no row menu at all: the grid, not a
// row, holds the focus (rows take none), so the browser's own menu event for those keys named no
// row, which a dictionary's table answers with nothing; and Chromium on macOS sends none.
//
// It is opt-in, so a table that does not ask (the VS Code extension's) keeps the keys as they were,
// the browser's. A field's keys stay the field's: a cell editor's, and the header funnel's, whose
// Shift+F10 opens its own popup through the browser's event.
import { describe, expect, it } from 'vitest';
import { DexTreeTable, defineTreeTable, type TableContextMenuDetail, type TreeTableRow } from '../src/widgets/tree-table/dex-tree-table.js';

defineTreeTable();

const row = (id: string, parent: string | null, name: string, extra: Partial<TreeTableRow> = {}): TreeTableRow => ({
  ID: id,
  parent,
  Name: { label: name, editable: true },
  Value: '1',
  ...extra,
});
const ROWS = [row('section:design', null, 'Design Data'), row('a', 'section:design', 'A'), row('b', 'section:design', 'B'), row('c', 'section:design', 'C')];

async function mount(rows: TreeTableRow[] = ROWS, keyboardMenu = true): Promise<{ table: DexTreeTable; menus: TableContextMenuDetail[] }> {
  const table = new DexTreeTable();
  table.columns = ['Name', 'Value'];
  table.keyboardMenu = keyboardMenu;
  table.expandTopLevel = true;
  document.body.appendChild(table);
  table.rows = rows;
  await table.updateComplete;
  await table.updateComplete;
  const menus: TableContextMenuDetail[] = [];
  table.addEventListener('dex-table-context-menu', (e) => void menus.push(e.detail));
  return { table, menus };
}

const grid = (table: DexTreeTable) => (table as any)._container as HTMLElement;
/** A key pressed on `target` (the grid unless said), and whether its default was left to the browser. */
function key(target: HTMLElement, type: 'keydown' | 'keyup', init: KeyboardEventInit): boolean {
  return target.dispatchEvent(new KeyboardEvent(type, { bubbles: true, composed: true, cancelable: true, ...init }));
}
const SHIFT_F10 = { key: 'F10', shiftKey: true };
const MENU_KEY = { key: 'ContextMenu' };
/** Give the row `id` the box it is drawn in. */
function place(table: DexTreeTable, id: string, box: { left: number; top: number; bottom: number }): void {
  const tr = [...table.shadowRoot!.querySelectorAll<HTMLElement>('tr[data-row-id]')].find((r) => r.getAttribute('data-row-id') === id)!;
  tr.getBoundingClientRect = () => ({ ...box, right: box.left + 400, width: 400, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect;
}
function placeGrid(table: DexTreeTable, box: { left: number; top: number; bottom: number }): void {
  grid(table).getBoundingClientRect = () => ({ ...box, right: box.left + 600, width: 600, height: box.bottom - box.top, x: box.left, y: box.top, toJSON: () => ({}) }) as DOMRect;
}

describe('keyboardMenu: the row menu from the keyboard', () => {
  it('opens on Shift+F10 for the selected row, under it, and spends the key', async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['b'];
    await table.updateComplete;
    placeGrid(table, { left: 10, top: 100, bottom: 700 });
    place(table, 'b', { left: 10, top: 150, bottom: 172 });
    expect(key(grid(table), 'keydown', SHIFT_F10)).toBe(false);
    expect(menus).toEqual([{ x: 10, y: 172, rowId: 'b', keyboard: true }]);
    expect(table.selectedRowIds).toEqual(['b']);
  });

  it('opens on the ContextMenu key too, and spends its keyup, which is when Windows sends its own', async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    expect(key(grid(table), 'keydown', MENU_KEY)).toBe(false);
    expect(key(grid(table), 'keyup', MENU_KEY)).toBe(false);
    expect(menus.map((m) => m.rowId)).toEqual(['a']);
  });

  it("is for the keyboard's row: the one the arrows moved to", async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['a'];
    (table as any)._lastClickedId = 'a';
    await table.updateComplete;
    // Ctrl+ArrowDown adds the next row and moves the keyboard to it.
    key(grid(table), 'keydown', { key: 'ArrowDown', ctrlKey: true });
    await table.updateComplete;
    key(grid(table), 'keydown', SHIFT_F10);
    expect(table.selectedRowIds).toEqual(['a', 'b']);
    expect(menus.map((m) => m.rowId)).toEqual(['b']);
  });

  it('keeps a row half scrolled out of the grid with its menu inside the grid', async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['c'];
    await table.updateComplete;
    placeGrid(table, { left: 10, top: 100, bottom: 300 });
    place(table, 'c', { left: 10, top: 290, bottom: 312 });
    key(grid(table), 'keydown', SHIFT_F10);
    expect(menus).toEqual([{ x: 10, y: 300, rowId: 'c', keyboard: true }]);
  });

  it('with no row selected, is the menu of the space under the rows, at the top of the grid', async () => {
    const { table, menus } = await mount();
    placeGrid(table, { left: 10, top: 100, bottom: 700 });
    key(grid(table), 'keydown', SHIFT_F10);
    expect(menus).toEqual([{ x: 10, y: 100, rowId: null, keyboard: true }]);
  });

  it('on an empty table, is the menu of its "No data", as a right-click there is', async () => {
    const { table, menus } = await mount([]);
    const empty = table.shadowRoot!.querySelector<HTMLElement>('.empty-state')!;
    expect(empty).not.toBeNull();
    expect(key(empty, 'keydown', SHIFT_F10)).toBe(false);
    expect(menus.map((m) => m.rowId)).toEqual([null]);
  });

  it('opens in a read-only table, whose right-click sends the event too', async () => {
    const { table, menus } = await mount();
    table.readonly = true;
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    key(grid(table), 'keydown', SHIFT_F10);
    expect(menus.map((m) => m.rowId)).toEqual(['a']);
  });

  it('leaves the keys with other modifiers, and every other key, to the browser', async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    expect(key(grid(table), 'keydown', { key: 'F10', shiftKey: true, ctrlKey: true })).toBe(true);
    expect(key(grid(table), 'keydown', { key: 'F10' })).toBe(true);
    expect(key(grid(table), 'keydown', { key: 'ContextMenu', altKey: true })).toBe(true);
    expect(menus).toEqual([]);
  });

  it("leaves a field's keys to it: a cell editor's, and the header funnel's own popup", async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    const funnel = table.shadowRoot!.querySelector<HTMLElement>('.th-filter')!;
    expect(key(funnel, 'keydown', SHIFT_F10)).toBe(true);
    expect(table.beginRename('a')).toBe(true);
    await table.updateComplete;
    const input = table.shadowRoot!.querySelector<HTMLElement>('.edit-input')!;
    expect(key(input, 'keydown', SHIFT_F10)).toBe(true);
    expect(key(input, 'keyup', MENU_KEY)).toBe(true);
    expect(menus).toEqual([]);
  });

  it('is off by default: both keys are the browser\'s, as they always were', async () => {
    const { table, menus } = await mount(ROWS, false);
    table.selectedRowIds = ['a'];
    await table.updateComplete;
    expect(table.keyboardMenu).toBe(false);
    expect(key(grid(table), 'keydown', SHIFT_F10)).toBe(true);
    expect(key(grid(table), 'keydown', MENU_KEY)).toBe(true);
    expect(key(grid(table), 'keyup', MENU_KEY)).toBe(true);
    expect(menus).toEqual([]);
  });

  it('says a menu is the keyboard\'s, which a right-click\'s is not', async () => {
    const { table, menus } = await mount();
    const tr = [...table.shadowRoot!.querySelectorAll<HTMLElement>('tr[data-row-id]')].find((r) => r.getAttribute('data-row-id') === 'a')!;
    tr.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true, clientX: 5, clientY: 6 }));
    expect(menus).toHaveLength(1);
    expect(menus[0]).toMatchObject({ x: 5, y: 6, rowId: 'a' });
    expect(menus[0].keyboard).toBeUndefined();
  });

  it('names no row the table no longer shows: the arrows\' row gone, the selection\'s last shown one', async () => {
    const { table, menus } = await mount();
    table.selectedRowIds = ['a'];
    (table as any)._lastClickedId = 'a';
    await table.updateComplete;
    // Shift+ArrowDown takes the keyboard to b, and the selection over a and b.
    key(grid(table), 'keydown', { key: 'ArrowDown', shiftKey: true });
    expect(table.selectedRowIds).toEqual(['a', 'b']);
    // b goes (a delete repainted the rows), the selection still naming it.
    table.rows = ROWS.filter((r) => r.ID !== 'b');
    await table.updateComplete;
    const selected: string[][] = [];
    table.addEventListener('dex-row-selected', (e) => void selected.push(e.detail.rowIds));
    key(grid(table), 'keydown', SHIFT_F10);
    expect(menus.map((m) => m.rowId)).toEqual(['a']);
    // a was selected already: nothing selected anew, least of all the row that is gone.
    expect(selected).toEqual([]);
    // No selected row shown at all: the space under the rows.
    table.rows = ROWS.filter((r) => r.ID !== 'a' && r.ID !== 'b');
    await table.updateComplete;
    key(grid(table), 'keydown', SHIFT_F10);
    expect(menus.map((m) => m.rowId)).toEqual(['a', null]);
    expect(selected).toEqual([]);
  });

  it('says its keys on the grid, and on an empty table, for assistive tech; not where it is off', async () => {
    const on = await mount();
    expect(grid(on.table).getAttribute('aria-keyshortcuts')).toBe('Shift+F10 ContextMenu');
    const empty = await mount([]);
    expect(empty.table.shadowRoot!.querySelector('.empty-state')!.getAttribute('aria-keyshortcuts')).toBe('Shift+F10 ContextMenu');
    const off = await mount(ROWS, false);
    expect(grid(off.table).hasAttribute('aria-keyshortcuts')).toBe(false);
  });

  it('is set by the keyboard-menu attribute', async () => {
    const table = document.createElement('dex-tree-table') as DexTreeTable;
    table.setAttribute('keyboard-menu', '');
    expect(table.keyboardMenu).toBe(true);
  });
});
