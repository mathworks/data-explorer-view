// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing}) beside its source: the gestures become the source's commands, the
// source's editing changes reach the table, and what is not editing is left as it was. The rules
// themselves are pinned against the VS Code extension's webview in editingTrace.test.ts; these are
// the edges of the option.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type ConnectTableOptions, type TableHandle } from '../src/widgets/tree-table/index.js';
import { defineContextMenu, type DexContextMenu } from '../src/widgets/context-menu/index.js';
import { defineErrorDialog, type DexErrorDialog } from '../src/widgets/error-dialog/index.js';
import type { EditableTableSource, TableChange, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();
defineContextMenu();
defineErrorDialog();

const DOC = 'file:///w/d.sldd';
const A = 'binedit:file:///w/d.sldd/design/A';
const VIEW: TableView = {
  docUri: DOC,
  rows: [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: 'section:design', Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};

/** A source beside its table: it answers with `view`, records every command, and sends what it is told to. */
function pageSource(view: TableView = VIEW, editable = true) {
  const calls: unknown[][] = [];
  const listeners = new Set<(c: TableChange) => void>();
  const read: TableSource = {
    open: async () => view,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
  };
  const record = (name: string) => (...args: unknown[]) => void calls.push([name, ...args]);
  const commands = Object.fromEntries(
    ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
      (name) => [name, record(name)],
    ),
  );
  const source = (editable ? { ...read, ...commands } : read) as EditableTableSource;
  const emit = (change: TableChange) => {
    for (const l of [...listeners]) l(change);
  };
  return { source, calls, emit };
}

async function settle(table: any): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

async function mount(source: TableSource, options: ConnectTableOptions = {}) {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const contextMenu = document.createElement('dex-context-menu') as DexContextMenu;
  document.body.append(contextMenu);
  const shown: unknown[][] = [];
  const show = contextMenu.show.bind(contextMenu);
  contextMenu.show = (x: number, y: number, items: any) => {
    shown.push(items);
    show(x, y, items);
  };
  const handle = connectTable(table, source, { contextMenu, ...options });
  handles.push(handle);
  await settle(table);
  return { table, handle, contextMenu, shown };
}

const rightClick = (table: any, rowId: string | null) =>
  table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { rowId, x: 1, y: 1 } }));
const choose = (menu: DexContextMenu, actionId: string) => menu.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId } }));

describe('connectTable({editing}) beside its source', () => {
  it("hands each gesture to the source's command, and takes its answers", async () => {
    const { source, calls, emit } = pageSource();
    const errorDialog = document.createElement('dex-error-dialog') as DexErrorDialog;
    document.body.append(errorDialog);
    const { table } = await mount(source, { editing: true, errorDialog });
    expect([table.canAdd, table.rowDrag]).toEqual([true, true]);
    table.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: A, columnId: 'Value', oldValue: '1', newValue: '2' } }));
    table.dispatchEvent(new CustomEvent('dex-add-entry', { detail: { section: 'design', className: 'Simulink.Parameter' } }));
    expect(calls).toEqual([
      ['edit', { rowId: A, columnId: 'Value', oldValue: '1', newValue: '2' }],
      ['addEntry', { section: 'design', className: 'Simulink.Parameter', rename: false }],
    ]);
    emit({ kind: 'select', rowIds: [A] });
    emit({ kind: 'refused', title: 'Cannot Delete', reason: 'It stays.' });
    await settle(table);
    expect(table.selectedRowIds).toEqual([A]);
    expect(errorDialog.hasAttribute('open')).toBe(true);
    expect(errorDialog.shadowRoot!.textContent).toContain('It stays.');
  });

  it('wires a source that takes no edits as a read-only document', async () => {
    const { source, calls } = pageSource(VIEW, false);
    const { table, shown } = await mount(source, { editing: true });
    expect([table.canAdd, table.rowDrag]).toEqual([false, false]);
    rightClick(table, A);
    table.dispatchEvent(new CustomEvent('dex-add-entry', { detail: { section: 'design', className: 'X' } }));
    table.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: A, columnId: 'Value', oldValue: '1', newValue: '2' } }));
    expect(shown).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("adds the app's items after the editing menu, and gives their choice to the app", async () => {
    const { source, calls } = pageSource();
    const { table, handle, contextMenu, shown } = await mount(source, {
      editing: true,
      menuItems: () => [{ id: 'reveal', label: 'Reveal' }],
    });
    const actions: unknown[] = [];
    handle.on('action', (a) => void actions.push(a));
    table.selectedRowIds = [A];
    rightClick(table, A);
    const items = shown[0] as { id: string; separator?: boolean }[];
    expect([items.at(-2)?.separator, items.at(-1)?.id]).toEqual([true, 'reveal']);
    expect(items.map((i) => i.id)).toContain('copy');
    expect(handle.menuFor(A)).toEqual(items.slice(0, -2));
    choose(contextMenu, 'reveal');
    rightClick(table, A);
    choose(contextMenu, 'copy');
    expect(actions).toEqual([{ actionId: 'reveal', rowId: A, rowIds: [A] }]);
    expect(calls).toEqual([['copy', [A]]]);
  });

  it('toggles the Add gallery from the handle, as its button does', async () => {
    const { source } = pageSource();
    const { table, handle } = await mount(source, { editing: true });
    let toggled = 0;
    const toggle = table.toggleAddGallery.bind(table);
    table.toggleAddGallery = () => (toggled++, toggle());
    handle.toggleAddGallery();
    expect(toggled).toBe(1);
  });

  it('takes away the dialog it made, and leaves one it was given', async () => {
    const made = await mount(pageSource().source, { editing: true });
    expect(document.querySelectorAll('dex-error-dialog')).toHaveLength(1);
    made.handle.dispose();
    expect(document.querySelectorAll('dex-error-dialog')).toHaveLength(0);
    const given = document.createElement('dex-error-dialog') as DexErrorDialog;
    document.body.append(given);
    const kept = await mount(pageSource().source, { editing: true, errorDialog: given });
    kept.handle.dispose();
    expect(given.isConnected).toBe(true);
  });
});

describe('connectTable without editing', () => {
  it('ignores the editing changes, keeps the read-only menu, and makes no dialog', async () => {
    const { source, calls, emit } = pageSource();
    const { table, handle, shown } = await mount(source);
    emit({ kind: 'select', rowIds: [A] });
    emit({ kind: 'refused', title: 'Cannot Delete', reason: 'It stays.' });
    await settle(table);
    expect(table.selectedRowIds).toEqual([]);
    expect(document.querySelector('dex-error-dialog')).toBeNull();
    table.selectedRowIds = [A];
    rightClick(table, A);
    expect((shown[0] as { id: string }[]).map((i) => i.id)).toEqual(['copyName', 'copyValue']);
    expect(handle.menuFor(A)).toEqual([]);
    table.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: A, columnId: 'Value', oldValue: '1', newValue: '2' } }));
    expect(calls).toEqual([]);
  });
});
