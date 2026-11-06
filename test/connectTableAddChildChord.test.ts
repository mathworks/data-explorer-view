// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing, addChildChord}): '+' on the grid adds a child to the selected row, as the
// editing menu's Add Child does, and only where that item is enabled (one row selected, a row that
// takes children, a document that may be edited); the menu then labels the item with it. A '+'
// typed in a field of the table's (the search box, a column filter, a cell editor) is the field's,
// and types itself. Only where asked: the VS Code extension wires no such chord, and its table
// must go on taking '+' as it always has, as nothing at all.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type ConnectTableOptions, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { EditableTableSource, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const A = 'u/design/A';
const B = 'u/design/B';
/** A dictionary's Design Data: A takes a child (a struct), B does not. */
const VIEW: TableView = {
  docUri: 'file:///w/d.sldd',
  rows: [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: 'section:design', Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true, _canAddChild: true } as any,
    { ID: B, parent: 'section:design', Name: { label: 'B', editable: true }, Value: '2', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};

/** A source that answers with `view` and records every command it is given, with its row. */
function recordingSource(view: TableView = VIEW): { source: EditableTableSource; calls: unknown[][] } {
  const calls: unknown[][] = [];
  const read: TableSource = {
    open: async () => view,
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

async function mount(source: TableSource, options: ConnectTableOptions = {}): Promise<{ table: any; handle: TableHandle }> {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, source, options);
  handles.push(handle);
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
  return { table, handle };
}

/** A key pressed on the grid (the table element itself), or in `target`. */
function press(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init });
  target.dispatchEvent(ev);
  return ev;
}

describe("connectTable({editing, addChildChord}) answers '+' with Add Child", () => {
  it("adds a child to the selected row, the '+' typed with Shift or without (a US layout's, the keypad's)", async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, addChildChord: true });
    table.selectedRowIds = [A];
    const plus = press(table, { key: '+', code: 'Equal', shiftKey: true });
    press(table, { key: '+', code: 'NumpadAdd' });
    expect(calls).toEqual([
      ['addChild', A],
      ['addChild', A],
    ]);
    expect(plus.defaultPrevented).toBe(true);
  });

  it('answers it where the menu offers Add Child, and lets the key through where it does not', async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, addChildChord: true });
    // Nothing selected, a row that takes no children, two rows: the item is greyed each time.
    const none = press(table, { key: '+' });
    table.selectedRowIds = [B];
    press(table, { key: '+' });
    table.selectedRowIds = [A, B];
    press(table, { key: '+' });
    expect(calls).toEqual([]);
    expect(none.defaultPrevented).toBe(false);
    // A document that may not be edited has no menu to ask.
    const readOnly = recordingSource({ ...VIEW, editable: false });
    const other = await mount(readOnly.source, { editing: true, addChildChord: true });
    other.table.selectedRowIds = [A];
    press(other.table, { key: '+' });
    expect(readOnly.calls).toEqual([]);
  });

  it("leaves '+' to a field, which types it, and a '+' held with Cmd, Ctrl or Alt to whoever takes that chord", async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, addChildChord: true });
    table.selectedRowIds = [A];
    const field = document.createElement('input');
    table.append(field);
    const typed = press(field, { key: '+', shiftKey: true });
    const zoom = press(table, { key: '+', metaKey: true });
    press(table, { key: '+', ctrlKey: true });
    press(table, { key: '+', altKey: true });
    expect(calls).toEqual([]);
    expect([typed.defaultPrevented, zoom.defaultPrevented]).toEqual([false, false]);
  });

  it('adds one child for a held key, not one for each repeat', async () => {
    const { source, calls } = recordingSource();
    const { table } = await mount(source, { editing: true, addChildChord: true });
    table.selectedRowIds = [A];
    press(table, { key: '+' });
    const held = press(table, { key: '+', repeat: true });
    expect(calls).toEqual([['addChild', A]]);
    expect(held.defaultPrevented).toBe(true);
  });

  it("labels the menu's Add Child with it", async () => {
    const { source } = recordingSource();
    const { handle } = await mount(source, { editing: true, addChildChord: true });
    expect(handle.menuFor(A, [A]).find((i) => i.id === 'addChild')?.shortcut).toBe('+');
  });

  it('answers no chord, and labels none, without the option, as the VS Code extension wires it', async () => {
    const { source, calls } = recordingSource();
    const { table, handle } = await mount(source, { editing: true });
    table.selectedRowIds = [A];
    const plus = press(table, { key: '+' });
    expect(calls).toEqual([]);
    expect(plus.defaultPrevented).toBe(false);
    expect(handle.menuFor(A, [A]).find((i) => i.id === 'addChild')?.shortcut).toBeUndefined();
  });
});
