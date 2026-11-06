// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// connectTable({editing}) over a source that says where its undo stack stands (its `history`): the
// editing menu's Undo and Redo, the handle's can() and run() for them (an app's toolbar and palette)
// and handle.undo()/redo() (an app's Edit menu) are offered only where there is a step to take back
// or make again, and move with the history as it changes. A source with no history (the VS Code
// extension's, across its channel, whose stack is VS Code's) keeps both offered wherever the
// document may be edited, as before: what the extension shows does not change.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { EditableTableSource, EditHistory, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

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

/** A history a test moves by hand, and tells as a stack does. */
function handHistory(): EditHistory & { set(canUndo: boolean, canRedo: boolean): void } {
  const listeners = new Set<() => void>();
  const h = {
    canUndo: false,
    canRedo: false,
    onChange: (l: () => void) => (listeners.add(l), () => void listeners.delete(l)),
    set(canUndo: boolean, canRedo: boolean) {
      h.canUndo = canUndo;
      h.canRedo = canRedo;
      for (const l of [...listeners]) l();
    },
  };
  return h;
}

/** A source beside its table that records its commands, with `history` if given. */
function source(history?: EditHistory, view: TableView = VIEW) {
  const calls: string[] = [];
  const read: TableSource = {
    open: async () => view,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: () => () => {},
  };
  const commands = Object.fromEntries(
    ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
      (name) => [name, () => void calls.push(name)],
    ),
  );
  const s = { ...read, ...commands, ...(history ? { history } : {}) } as EditableTableSource;
  return { source: s, calls };
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

async function mount(s: TableSource, options = { editing: true, undoChords: true }) {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, s, options);
  handles.push(handle);
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
  return { table, handle };
}

const item = (handle: TableHandle, id: string) => handle.menuFor(A, [A]).find((i) => i.id === id)!;
const chord = (table: HTMLElement, shiftKey = false) =>
  table.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey, bubbles: true, composed: true, cancelable: true }));

describe('a source with a history', () => {
  it('offers neither Undo nor Redo on a document just opened, and runs neither', async () => {
    const { source: s, calls } = source(handHistory());
    const { table, handle } = await mount(s);
    table.selectedRowIds = [A];
    expect(item(handle, 'undo')).toMatchObject({ disabled: true, reason: 'Nothing to undo' });
    expect(item(handle, 'redo')).toMatchObject({ disabled: true, reason: 'Nothing to redo' });
    expect([handle.can('undo'), handle.can('redo')]).toEqual([false, false]);
    expect([handle.run('undo'), handle.run('redo')]).toEqual([false, false]);
    handle.undo();
    handle.redo();
    expect(calls).toEqual([]);
  });

  it('offers each as the history moves, asked anew each time', async () => {
    const history = handHistory();
    const { source: s, calls } = source(history);
    const { handle } = await mount(s);
    history.set(true, false);
    expect([handle.can('undo'), handle.can('redo')]).toEqual([true, false]);
    expect(item(handle, 'undo').disabled).toBe(false);
    expect(handle.run('undo')).toBe(true);
    history.set(false, true);
    expect([handle.can('undo'), handle.can('redo')]).toEqual([false, true]);
    handle.undo();
    handle.redo();
    expect(calls).toEqual(['undo', 'redo']);
  });

  it('spends its chords on the grid still, sending nothing where there is nothing to undo', async () => {
    const history = handHistory();
    const { source: s, calls } = source(history);
    const { table } = await mount(s);
    // The press is the table's either way (as an editor's Cmd+Z on an empty stack is): it does nothing.
    expect(chord(table)).toBe(false);
    expect(calls).toEqual([]);
    history.set(true, false);
    chord(table);
    expect(calls).toEqual(['undo']);
  });

  it('offers neither in a document that may not be edited, whatever the history says', async () => {
    const history = handHistory();
    history.set(true, true);
    const { source: s, calls } = source(history, { ...VIEW, editable: false });
    const { handle } = await mount(s);
    expect([handle.can('undo'), handle.can('redo')]).toEqual([false, false]);
    handle.undo();
    expect(calls).toEqual([]);
  });
});

describe('a source without one (the VS Code extension\'s)', () => {
  it('offers Undo and Redo wherever the document may be edited, and sends them, as before', async () => {
    const { source: s, calls } = source();
    const { table, handle } = await mount(s);
    table.selectedRowIds = [A];
    expect(item(handle, 'undo')).toEqual({ id: 'undo', label: 'Undo', shortcut: expect.any(String), disabled: false });
    expect([handle.can('undo'), handle.can('redo')]).toEqual([true, true]);
    handle.undo();
    handle.redo();
    chord(table);
    expect(calls).toEqual(['undo', 'redo', 'undo']);
  });
});
