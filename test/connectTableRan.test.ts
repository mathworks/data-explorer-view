// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The handle's `ran`: an editing menu item's gesture the table handed its source, from the menu, its
// chord, run() (an app's toolbar) or undo()/redo() (an app's Edit menu), with the rows it carried
// and how many it acted on, as the item's label counts them. Told a task later, and not at all where
// the source refused it or failed meanwhile, which a source in the page does as it is called or a
// few promise turns later: so an app's "Copied to clipboard" or "2 entries deleted" is said only of
// what the source did. A disabled item, and a read-only document, hand nothing and tell nothing.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type EditingRun, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { EditableTableSource, TableChange, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const DOC = 'file:///w/d.sldd';
const DESIGN = 'section:design';
const A = 'binedit:file:///w/d.sldd/design/A';
const A_X = 'binedit:file:///w/d.sldd/design/A/x';
const B = 'binedit:file:///w/d.sldd/design/B';
const VIEW: TableView = {
  docUri: DOC,
  rows: [
    { ID: DESIGN, parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: DESIGN, Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true, _canAddChild: true } as any,
    { ID: A_X, parent: A, Name: { label: 'x', editable: true }, Value: '3', _canCopy: true, _canDelete: true } as any,
    { ID: B, parent: DESIGN, Name: { label: 'B', editable: true }, Value: '2', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};
const RULES: TableChange = {
  kind: 'sectionRules',
  docUri: DOC,
  rules: [{ sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] }],
};
const PARAM = { className: 'Simulink.Parameter', arrayClass: 'Simulink.Parameter', kind: 'Parameter', isMatlabVariable: false, isScalarNumeric: false };
const HOLDING_TWO: TableChange = { kind: 'clipboard', state: { canPaste: true, mode: 'copy', items: [PARAM, PARAM] } };

/**
 * A source beside its table: it records each command, and answers one with what `answer` says for
 * it (a refusal, an error), now or a promise turn later.
 */
function pageSource(view: TableView = VIEW) {
  const calls: unknown[][] = [];
  const listeners = new Set<(c: TableChange) => void>();
  const emit = (change: TableChange) => {
    for (const l of [...listeners]) l(change);
  };
  const answer: Record<string, { change: TableChange; later?: boolean }> = {};
  const read: TableSource = {
    open: async () => view,
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: (l) => (listeners.add(l), () => void listeners.delete(l)),
  };
  const command = (name: string) => (...args: unknown[]) => {
    calls.push([name, ...args]);
    const a = answer[name];
    if (!a) return;
    if (a.later) void Promise.resolve().then(() => Promise.resolve()).then(() => emit(a.change));
    else emit(a.change);
  };
  const commands = Object.fromEntries(
    ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
      (name) => [name, command(name)],
    ),
  );
  return { source: { ...read, ...commands } as EditableTableSource, calls, emit, answer };
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

const settle = async (table: any) => {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
};

async function mount(s: TableSource) {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, s, { editing: true, undoChords: true });
  handles.push(handle);
  await settle(table);
  const ran: EditingRun[] = [];
  handle.on('ran', (run) => void ran.push(run));
  return { table, handle, ran };
}

/** A key pressed on the grid. */
const press = (table: HTMLElement, init: KeyboardEventInit) =>
  table.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init }));
/** A choice of the editing menu right-clicked on `rowId`, as a click on its item sends it. */
function choose(table: HTMLElement, rowId: string, actionId: string): void {
  table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId }, bubbles: true, composed: true }));
  document.querySelector('dex-context-menu')!.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId }, bubbles: true, composed: true }));
}
const aTask = () => new Promise((done) => setTimeout(done, 0));

describe("the handle's ran", () => {
  it('tells Copy and Cut chosen from the menu, a task later, with the entries they carried', async () => {
    const { source, calls } = pageSource();
    const { table, ran } = await mount(source);
    table.selectedRowIds = [A_X, B];
    choose(table, B, 'copy');
    // Told a task later, once the source had the chance to refuse it.
    expect(ran).toEqual([]);
    await aTask();
    // A/x is A's: two entries, A and B.
    expect(ran).toEqual([{ actionId: 'copy', rowIds: [A_X, B], count: 2 }]);
    choose(table, B, 'cut');
    await aTask();
    expect(ran[1]).toEqual({ actionId: 'cut', rowIds: [A_X, B], count: 2 });
    expect(calls.map((c) => c[0])).toEqual(['copy', 'cut']);
  });

  it('tells Delete pressed as its chord, counting the items it deletes', async () => {
    const { source } = pageSource();
    const { table, ran } = await mount(source);
    table.selectedRowIds = [A_X, B];
    press(table, { key: 'Delete' });
    await aTask();
    expect(ran).toEqual([{ actionId: 'delete', rowIds: [A_X, B], count: 2 }]);
  });

  it("tells Paste run for an app's toolbar, counting the entries the clipboard held, at the row it pasted on", async () => {
    const { source, emit } = pageSource();
    const { table, handle, ran } = await mount(source);
    emit(RULES);
    emit(HOLDING_TWO);
    table.selectedRowIds = [B];
    expect(handle.run('paste')).toBe(true);
    await aTask();
    expect(ran).toEqual([{ actionId: 'paste', rowIds: [B], count: 2 }]);
  });

  it('tells Undo and Redo from the Edit menu, carrying no row', async () => {
    const { source } = pageSource();
    const { handle, ran } = await mount(source);
    handle.undo();
    handle.redo();
    await aTask();
    expect(ran).toEqual([
      { actionId: 'undo', rowIds: [], count: 0 },
      { actionId: 'redo', rowIds: [], count: 0 },
    ]);
  });

  it('tells nothing of a gesture the source refused as it was called', async () => {
    const { source, answer } = pageSource();
    const { table, handle, ran } = await mount(source);
    table.selectedRowIds = [B];
    answer.delete = { change: { kind: 'refused', title: 'Cannot Delete', reason: 'no' } };
    handle.run('delete');
    await aTask();
    expect(ran).toEqual([]);
    // And the next gesture, refused by nothing, is told.
    handle.run('cut');
    await aTask();
    expect(ran).toEqual([{ actionId: 'cut', rowIds: [B], count: 1 }]);
  });

  it('tells nothing of a gesture the source failed a few promise turns later, in its banner', async () => {
    const { source, answer } = pageSource();
    const { table, handle, ran } = await mount(source);
    table.selectedRowIds = [B];
    answer.copy = { change: { kind: 'error', message: 'B cannot be copied' }, later: true };
    handle.run('copy');
    await aTask();
    expect(ran).toEqual([]);
    expect(table.banners?.error).toBe('B cannot be copied');
  });

  it('tells nothing of a gesture whose source threw, and lets the throw go on to its caller', async () => {
    const { source } = pageSource();
    (source as any).copy = () => {
      throw new Error('no copy');
    };
    const { table, handle, ran } = await mount(source);
    table.selectedRowIds = [B];
    expect(() => handle.run('copy')).toThrow('no copy');
    await aTask();
    expect(ran).toEqual([]);
  });

  it('tells nothing for an item that is not offered, nor in a document that may not be edited', async () => {
    const { source, calls } = pageSource();
    const { handle, ran } = await mount(source);
    // Nothing selected: no Copy, and nothing in the clipboard to paste.
    expect([handle.run('copy'), handle.run('paste')]).toEqual([false, false]);
    const readOnly = pageSource({ ...VIEW, editable: false });
    const other = await mount(readOnly.source);
    other.table.selectedRowIds = [A];
    other.handle.undo();
    expect(other.handle.run('copy')).toBe(false);
    await aTask();
    expect([ran, other.ran, calls, readOnly.calls]).toEqual([[], [], [], []]);
  });

  it('tells nothing once the handle is disposed', async () => {
    const { source } = pageSource();
    const { table, handle, ran } = await mount(source);
    table.selectedRowIds = [B];
    handle.run('copy');
    handle.dispose();
    await aTask();
    expect(ran).toEqual([]);
  });
});
