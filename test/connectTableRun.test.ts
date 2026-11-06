// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The handle's can(actionId) and run(actionId): an app's toolbar (Undo, Redo, Add Child, Cut, Copy,
// Paste, Delete) does exactly what the editing menu's item of that name does for the current
// selection, and is enabled exactly when that item is. They take the path the Cut/Copy/Paste/Delete
// chords take (the menu for the selection, anchored at its first row, asked for the item), so a
// toolbar button, its chord and its menu item cannot disagree; a document that may not be edited,
// and a table wired without `editing`, offer none of them.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type ConnectTableOptions, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { EditableTableSource, TableChange, TableSource, TableView } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const DOC = 'file:///w/d.sldd';
const DESIGN = 'section:design';
const A = 'binedit:file:///w/d.sldd/design/A';
const B = 'binedit:file:///w/d.sldd/design/B';
/** An editable JSON dictionary's Design Data: two entries, A of which takes a child. */
const VIEW: TableView = {
  docUri: DOC,
  rows: [
    { ID: DESIGN, parent: null, Name: { label: 'Design Data' } } as any,
    { ID: A, parent: DESIGN, Name: { label: 'A', editable: true }, Value: '1', _canCopy: true, _canDelete: true, _canAddChild: true } as any,
    { ID: B, parent: DESIGN, Name: { label: 'B', editable: true }, Value: '2', _canCopy: true, _canDelete: true } as any,
  ],
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
};
/** The rule the dictionary's host sends behind its rows: Design Data takes a Parameter. */
const RULES: TableChange = {
  kind: 'sectionRules',
  docUri: DOC,
  rules: [{ sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: ['Simulink.Parameter'] }],
};
const PARAM = { className: 'Simulink.Parameter', arrayClass: 'Simulink.Parameter', kind: 'Parameter', isMatlabVariable: false, isScalarNumeric: false };
/** The clipboard holding one copied Parameter, as the host says it. */
const HOLDING: TableChange = { kind: 'clipboard', state: { canPaste: true, mode: 'copy', items: [PARAM] } };

/** The editing menu's own items, every one a toolbar could stand for. */
const EDITING_ACTIONS = ['undo', 'redo', 'copy', 'cut', 'paste', 'delete', 'addChild', 'locateInText', 'setActiveConfigSet'];

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

async function mount(source: TableSource, options: ConnectTableOptions = { editing: true }) {
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, source, options);
  handles.push(handle);
  await settle(table);
  return { table, handle };
}

/** Whether the editing menu for `selection`, anchored at its first row as a chord's is, has `actionId` enabled. */
const enabledInMenu = (handle: TableHandle, selection: string[], actionId: string): boolean => {
  const item = handle.menuFor(selection[0] ?? null, selection).find((i) => i.id === actionId);
  return !!item && !item.disabled;
};

describe('can(actionId) and run(actionId) on an editable dictionary', () => {
  it('offer no Copy, Cut or Delete with nothing selected, and do nothing', async () => {
    const { source, calls } = pageSource();
    const { handle } = await mount(source);
    for (const id of ['copy', 'cut', 'delete', 'addChild']) {
      expect(handle.can(id), id).toBe(false);
      expect(handle.run(id), id).toBe(false);
    }
    expect(calls).toEqual([]);
  });

  it('offer Copy, Cut and Delete for a selected entry, and Copy sends the selection to the source', async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source);
    table.selectedRowIds = [A];
    expect([handle.can('copy'), handle.can('cut'), handle.can('delete'), handle.can('addChild')]).toEqual([true, true, true, true]);
    expect(handle.run('copy')).toBe(true);
    expect(calls).toEqual([['copy', [A]]]);
  });

  it('send Cut and Delete with the whole selection, and Add Child with the one row it adds to', async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source);
    table.selectedRowIds = [A, B];
    expect(handle.run('cut')).toBe(true);
    expect(handle.run('delete')).toBe(true);
    // Add Child takes a single item, as its menu item says.
    expect(handle.can('addChild')).toBe(false);
    expect(handle.run('addChild')).toBe(false);
    table.selectedRowIds = [A];
    expect(handle.run('addChild')).toBe(true);
    expect(calls).toEqual([
      ['cut', [A, B]],
      ['delete', [A, B]],
      ['addChild', A],
    ]);
  });

  it('refuse Paste on an empty clipboard, and call nothing', async () => {
    const { source, calls, emit } = pageSource();
    const { table, handle } = await mount(source);
    emit(RULES);
    table.selectedRowIds = [A];
    expect(handle.can('paste')).toBe(false);
    expect(handle.run('paste')).toBe(false);
    expect(calls).toEqual([]);
  });

  it("paste what the clipboard holds into the first selected row's section, as Cmd/Ctrl+V does", async () => {
    const { source, calls, emit } = pageSource();
    const { table, handle } = await mount(source);
    emit(RULES);
    emit(HOLDING);
    table.selectedRowIds = [B, A];
    expect(handle.can('paste')).toBe(true);
    expect(handle.run('paste')).toBe(true);
    expect(calls).toEqual([['paste', B]]);
  });

  it('offer no Copy for a selected section, whose menu has none, but Undo and Redo still', async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source);
    table.selectedRowIds = [DESIGN];
    expect(handle.menuFor(DESIGN).map((i) => i.id)).not.toContain('copy');
    expect([handle.can('copy'), handle.can('cut'), handle.can('delete')]).toEqual([false, false, false]);
    expect(handle.run('copy')).toBe(false);
    expect(calls).toEqual([]);
    expect([handle.can('undo'), handle.can('redo')]).toEqual([true, true]);
  });

  it("follow the Undo and Redo items' disabled flag, and send them as those items do", async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source);
    for (const selection of [[], [A], [DESIGN]]) {
      table.selectedRowIds = selection;
      for (const id of ['undo', 'redo']) expect(handle.can(id), `${id} ${selection}`).toBe(enabledInMenu(handle, selection, id));
    }
    expect([handle.can('undo'), handle.run('undo'), handle.run('redo')]).toEqual([true, true, true]);
    expect(calls).toEqual([['undo'], ['redo']]);
  });

  it('agree with the menu for every item, in every selection', async () => {
    const { source, emit } = pageSource();
    const { table, handle } = await mount(source);
    emit(RULES);
    emit(HOLDING);
    for (const selection of [[], [A], [B], [A, B], [DESIGN], [DESIGN, A]]) {
      table.selectedRowIds = selection;
      for (const id of EDITING_ACTIONS) expect(handle.can(id), `${id} [${selection}]`).toBe(enabledInMenu(handle, selection, id));
    }
  });

  it('agree with the chords: Cmd/Ctrl+C, X, V and Delete are taken exactly where `can` says', async () => {
    const { source, emit } = pageSource();
    const { table, handle } = await mount(source);
    emit(RULES);
    emit(HOLDING);
    const chords: [string, KeyboardEventInit][] = [
      ['copy', { key: 'c', ctrlKey: true }],
      ['cut', { key: 'x', ctrlKey: true }],
      ['paste', { key: 'v', ctrlKey: true }],
      ['delete', { key: 'Delete' }],
    ];
    for (const selection of [[], [A], [A, B], [DESIGN]]) {
      table.selectedRowIds = selection;
      for (const [id, init] of chords) {
        const can = handle.can(id);
        const ev = new KeyboardEvent('keydown', { bubbles: true, composed: true, cancelable: true, ...init });
        table.dispatchEvent(ev);
        expect(ev.defaultPrevented, `${id} [${selection}]`).toBe(can);
      }
    }
  });

  it("run none of the app's own items, nor an id the menu does not have", async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source, { editing: true, copyText: true, menuItems: () => [{ id: 'reveal', label: 'Reveal' }] });
    const actions: unknown[] = [];
    handle.on('action', (a) => void actions.push(a));
    table.selectedRowIds = [A];
    for (const id of ['reveal', 'copyName', 'copyValue', 'nonsense']) {
      expect(handle.can(id), id).toBe(false);
      expect(handle.run(id), id).toBe(false);
    }
    expect([calls, actions]).toEqual([[], []]);
  });
});

describe('can(actionId) and run(actionId) where nothing may be edited', () => {
  it('offer nothing on a document whose view is not editable', async () => {
    const { source, calls, emit } = pageSource({ ...VIEW, editable: false });
    const { table, handle } = await mount(source, { editing: true, readOnlyMenu: true });
    emit(HOLDING);
    for (const selection of [[], [A], [DESIGN]]) {
      table.selectedRowIds = selection;
      for (const id of EDITING_ACTIONS) {
        expect(handle.can(id), `${id} [${selection}]`).toBe(false);
        expect(handle.run(id), `${id} [${selection}]`).toBe(false);
      }
    }
    expect(calls).toEqual([]);
  });

  it('offer nothing for a source that takes no edits', async () => {
    const { source } = pageSource(VIEW, false);
    const { table, handle } = await mount(source);
    table.selectedRowIds = [A];
    for (const id of EDITING_ACTIONS) {
      expect(handle.can(id), id).toBe(false);
      expect(handle.run(id), id).toBe(false);
    }
  });

  it('offer nothing without `editing`', async () => {
    const { source, calls } = pageSource();
    const { table, handle } = await mount(source, {});
    table.selectedRowIds = [A];
    for (const id of EDITING_ACTIONS) {
      expect(handle.can(id), id).toBe(false);
      expect(handle.run(id), id).toBe(false);
    }
    expect(calls).toEqual([]);
  });
});
