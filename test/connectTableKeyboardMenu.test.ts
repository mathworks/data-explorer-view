// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable and a menu the keyboard opened (the table's `keyboardMenu`): the menu takes the
// keyboard at once, so the arrows move along its items and not along the rows under it, Enter acts
// on the row the menu was opened for, and Escape or a choice gives the keyboard back to the grid.
// Before, the keyboard stayed on the grid: the first ArrowDown both entered the menu and moved the
// selection to the next row, Enter then copied (or deleted) that row, and the focus ended on the
// page's body. A right-click's menu takes the keyboard only when an arrow does, as it always did.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { DexTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';
import type { EditableTableSource, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const DOC = 'file:///w/d.sldd';
const A = 'binedit:file:///w/d.sldd/design/A';
const B = 'binedit:file:///w/d.sldd/design/B';
const VIEW: TableView = {
  docUri: DOC,
  rows: [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: 'section:design', Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true } as any,
    { ID: B, parent: 'section:design', Name: { label: 'B', editable: true }, Value: '2', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};

function source() {
  const calls: unknown[][] = [];
  const read: TableSource = {
    open: async () => VIEW,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: () => () => {},
  };
  const commands = Object.fromEntries(
    ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
      (name) => [name, (...args: unknown[]) => void calls.push([name, ...args])],
    ),
  );
  return { source: { ...read, ...commands } as EditableTableSource, calls };
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
// The element with the focus, read from the top (happy-dom throws reading the activeElement of a
// shadow root the focus is not in).
const deepActive = (): Element | null => {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
};
/** A key pressed where the focus is, as a person presses it. */
const press = (key: string, init: KeyboardEventInit = {}) =>
  deepActive()!.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true, ...init }));
const menu = () => document.querySelector('dex-context-menu')!;
const focusedItem = () => deepActive()?.closest('.item')?.querySelector('.item-label')?.textContent;

async function mount(): Promise<{ table: DexTreeTable; grid: HTMLElement; calls: unknown[][] }> {
  const { source: s, calls } = source();
  const table = document.createElement('dex-tree-table');
  table.keyboardMenu = true;
  document.body.append(table);
  handles.push(connectTable(table, s, { editing: true }));
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
  table.selectedRowIds = [A];
  await table.updateComplete;
  const grid = table.shadowRoot!.querySelector<HTMLElement>('.table-container')!;
  grid.focus();
  return { table, grid, calls };
}

/** Shift+F10 on the grid, and the menu drawn and listening. */
async function openByKey(): Promise<void> {
  press('F10', { shiftKey: true });
  await menu().updateComplete;
  await frame();
  await menu().updateComplete;
}

describe('a menu the keyboard opened', () => {
  it('takes the keyboard: ArrowDown moves along it, not the selection, and Enter acts on the row it was opened for', async () => {
    const { table, grid, calls } = await mount();
    await openByKey();
    expect(menu().hasAttribute('open')).toBe(true);
    expect(focusedItem()).toBe('Copy "A"');
    press('ArrowDown');
    await menu().updateComplete;
    expect(focusedItem()).toBe('Cut "A"');
    expect(table.selectedRowIds).toEqual([A]);
    press('Enter');
    expect(calls).toEqual([['cut', [A]]]);
    expect(menu().hasAttribute('open')).toBe(false);
    // The keyboard is the grid's again.
    expect(deepActive()).toBe(grid);
  });

  it('gives the keyboard back to the grid on Escape, with the selection as it was', async () => {
    const { table, grid, calls } = await mount();
    await openByKey();
    press('Escape');
    expect(menu().hasAttribute('open')).toBe(false);
    expect(deepActive()).toBe(grid);
    expect(table.selectedRowIds).toEqual([A]);
    // The grid's arrows are the grid's again.
    press('ArrowDown');
    expect(table.selectedRowIds).toEqual([B]);
    expect(calls).toEqual([]);
  });

  it("opened by the ContextMenu key, spends that key's keyup where the keyboard now is, so Windows opens no menu of its own", async () => {
    const { grid } = await mount();
    press('ContextMenu');
    await menu().updateComplete;
    // The keyup comes before the menu's frame, and lands in the menu, which has the keyboard now.
    expect(focusedItem()).toBe('Copy "A"');
    const keyup = new KeyboardEvent('keyup', { key: 'ContextMenu', bubbles: true, composed: true, cancelable: true });
    deepActive()!.dispatchEvent(keyup);
    expect(keyup.defaultPrevented).toBe(true);
    await frame();
    // The browser's own menu event, should one come anyway, is spent too, and the menu stays.
    const native = new MouseEvent('contextmenu', { bubbles: true, composed: true, cancelable: true });
    deepActive()!.dispatchEvent(native);
    expect(native.defaultPrevented).toBe(true);
    expect(menu().hasAttribute('open')).toBe(true);
    press('Escape');
    expect(deepActive()).toBe(grid);
  });

  it("a right-click's menu leaves the keyboard where it is, as it always did", async () => {
    const { table, grid } = await mount();
    table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: A }, bubbles: true, composed: true }));
    await menu().updateComplete;
    await frame();
    expect(menu().hasAttribute('open')).toBe(true);
    expect(deepActive()).toBe(grid);
  });
});
