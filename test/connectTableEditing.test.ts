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

  it("hands Set as Active Configuration to the source's command, with the row it was chosen on", async () => {
    const { source, calls } = pageSource();
    const withSet = { ...source, setActiveConfigSet: (rowId: string) => void calls.push(['setActiveConfigSet', rowId]) };
    const { table, contextMenu } = await mount(withSet, { editing: true });
    table.selectedRowIds = [A];
    rightClick(table, A);
    choose(contextMenu, 'setActiveConfigSet');
    expect(calls).toEqual([['setActiveConfigSet', A]]);
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

describe("connectTable({editing, readOnlyMenu}): a document that cannot be edited keeps the read-only menu", () => {
  const READ_ONLY: TableView = { ...VIEW, editable: false };

  it('gives a view that is not editable Copy Name and Copy Value, through `copy`, then the app items', async () => {
    const copied: string[] = [];
    const { table, contextMenu, shown } = await mount(pageSource(READ_ONLY).source, {
      editing: true,
      readOnlyMenu: true,
      copy: (text) => void copied.push(text),
      menuItems: () => [{ id: 'reveal', label: 'Reveal' }],
    });
    table.selectedRowIds = [A];
    rightClick(table, A);
    expect((shown[0] as { id: string }[]).map((i) => i.id)).toEqual(['copyName', 'copyValue', '', 'reveal']);
    choose(contextMenu, 'copyName');
    await settle(table);
    expect(copied).toEqual(['A']);
  });

  it('does the same for a source that takes no edits', async () => {
    const { table, shown } = await mount(pageSource(VIEW, false).source, { editing: true, readOnlyMenu: true });
    table.selectedRowIds = [A];
    rightClick(table, A);
    expect((shown[0] as { id: string }[]).map((i) => i.id)).toEqual(['copyName', 'copyValue']);
  });

  it('opens no menu on a view that is not editable without the option, as before', async () => {
    const { table, shown } = await mount(pageSource(READ_ONLY).source, { editing: true });
    table.selectedRowIds = [A];
    rightClick(table, A);
    expect(shown).toEqual([]);
  });

  it('leaves an editable view its editing menu', async () => {
    const { table, shown } = await mount(pageSource().source, { editing: true, readOnlyMenu: true });
    table.selectedRowIds = [A];
    rightClick(table, A);
    const ids = (shown[0] as { id: string }[]).map((i) => i.id);
    expect(ids).toContain('cut');
    expect(ids).not.toContain('copyName');
  });
});

describe('connectTable({editing, copyText}): the editing menu copies names and values as text too', () => {
  const ids = (items: unknown) => (items as { id: string }[]).map((i) => i.id);

  it('ends the editing menu with Copy Name and Copy Value, after a separator, before the app items', async () => {
    const plain = await mount(pageSource().source, { editing: true });
    plain.table.selectedRowIds = [A];
    rightClick(plain.table, A);
    const today = ids(plain.shown[0]);
    const { table, shown } = await mount(pageSource().source, {
      editing: true,
      copyText: true,
      menuItems: () => [{ id: 'reveal', label: 'Reveal' }],
    });
    table.selectedRowIds = [A];
    rightClick(table, A);
    expect(ids(shown[0])).toEqual([...today, '', 'copyName', 'copyValue', '', 'reveal']);
  });

  it('copies the selection through `copy`, and a copy that fails is the banner and copyFailed, as read-only', async () => {
    let refuse = false;
    const copied: string[] = [];
    const { table, handle, contextMenu } = await mount(pageSource().source, {
      editing: true,
      copyText: true,
      copy: (text) => (refuse ? Promise.reject(new Error('no clipboard')) : void copied.push(text)),
    });
    const failures: unknown[] = [];
    handle.on('copyFailed', (f) => failures.push(f));
    table.selectedRowIds = [A];
    rightClick(table, A);
    choose(contextMenu, 'copyValue');
    await settle(table);
    expect(copied).toEqual(['1']);
    refuse = true;
    rightClick(table, A);
    choose(contextMenu, 'copyName');
    await settle(table);
    expect(failures).toEqual([{ text: 'A', message: 'no clipboard' }]);
    expect(table.banners.error).toBe('Could not copy to the clipboard: no clipboard');
  });

  it('leaves Cmd/Ctrl+C the entries’ Copy, and the menu exactly as before without the option', async () => {
    const { source, calls } = pageSource();
    const { table, shown } = await mount(source, { editing: true, copyText: true });
    table.selectedRowIds = [A];
    table.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true, composed: true }));
    expect(calls).toEqual([['copy', [A]]]);
    const plain = await mount(pageSource().source, { editing: true });
    plain.table.selectedRowIds = [A];
    rightClick(plain.table, A);
    expect(ids(plain.shown[0])).not.toContain('copyName');
    rightClick(table, A);
    expect(ids(shown[0])).toContain('copyName');
  });
});

// The editing half swallows the cell editor's gestures (a double-click, and Enter on the grid) in
// the capture phase, before they reach the table's own handlers, where the document may not be
// edited. Only those: Enter in a field of the table's is that field's, and the search box commits a
// search with it. Swallowed there too, every read-only view had a search box that did nothing. Ported
// from data-explorer-vscode test/readonlyEditorGate.test.ts at 632f6e0, which drove it through its
// table-main.ts.
describe('the shipped gate keeps a read-only view searchable', () => {
  const SLX = (editable: boolean): TableView => ({
    docUri: 'file:///fx/m.slx',
    rows: [
      { ID: 's', parent: null, Name: { label: 'Model Elements' } } as any,
      { ID: 'b', parent: 's', Name: { label: 'ChainGain' } } as any,
    ],
    columns: ['Name', 'Value', 'DataType'],
    columnLabels: { Name: 'Name', Value: 'Value', DataType: 'Data Type' },
    columnGroups: {},
    editable,
  });
  const gridOf = (table: any) => table.shadowRoot.querySelector('[role="treegrid"]') as HTMLElement;

  /** Type a search and commit it with a real Enter, from inside the search bar's shadow root. */
  async function searchFor(table: any, text: string): Promise<void> {
    const bar = table.shadowRoot.querySelector('dex-filter-bar');
    const input = bar.shadowRoot.querySelector('.filter-input') as HTMLInputElement;
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true }));
    await bar.updateComplete;
    await table.updateComplete;
  }

  /** How many of `type` reach the grid itself, dispatched on it. */
  function reaching(table: any, type: string, event: () => Event): number {
    let reached = 0;
    const grid = gridOf(table);
    grid.addEventListener(type, () => reached++);
    grid.dispatchEvent(event());
    return reached;
  }
  const enter = () => new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, composed: true });
  const dblclick = () => new MouseEvent('dblclick', { bubbles: true, composed: true });

  it('read-only: Enter in the search box commits the search', async () => {
    const { table } = await mount(pageSource(SLX(false)).source, { editing: true });
    await searchFor(table, 'ChainGain');
    expect(table._filterText).toBe('ChainGain');
    expect(table._getVisibleRows().map((r: { ID: string }) => r.ID)).toEqual(['s', 'b']);
  });

  it('editable: Enter in the search box commits the search too', async () => {
    // The two must agree. The gate is about the GRID, and the box is not the grid.
    const { table } = await mount(pageSource(SLX(true)).source, { editing: true });
    await searchFor(table, 'ChainGain');
    expect(table._filterText).toBe('ChainGain');
  });

  it('read-only: Enter on the grid is still swallowed before the cell editor sees it', async () => {
    const { table } = await mount(pageSource(SLX(false)).source, { editing: true });
    expect(reaching(table, 'keydown', enter)).toBe(0);
  });

  it('editable: Enter on the grid still reaches it, so a cell can be opened', async () => {
    const { table } = await mount(pageSource(SLX(true)).source, { editing: true });
    expect(reaching(table, 'keydown', enter)).toBe(1);
  });

  it('a double-click on the grid is swallowed where the document is read-only, and reaches it where it may be edited', async () => {
    const readOnly = await mount(pageSource(SLX(false)).source, { editing: true });
    expect(reaching(readOnly.table, 'dblclick', dblclick)).toBe(0);
    const editable = await mount(pageSource(SLX(true)).source, { editing: true });
    expect(reaching(editable.table, 'dblclick', dblclick)).toBe(1);
  });
});

// The editing menu and its chords are one rule: a chord builds the menu for the selection, reads
// its item, and does exactly what choosing that item does, on the same rows, so the two cannot
// disagree. Ported as behaviour from data-explorer-vscode test/multiSelectInvariants.test.ts › the
// keyboard cannot disagree with the menu, at 632f6e0, which read it off this repository's compiled
// editingWire.js.
describe('the keyboard cannot disagree with the menu', () => {
  const D = 'binedit:file:///w/d.sldd';
  // E is a struct in Design Data: f carries no copy flag of its own, g may not leave it, and z is
  // two levels down. K may not be deleted. V is in Architectural Data, which takes Bus objects only.
  const E = `${D}/design/E`;
  const F = `${E}/f`;
  const G = `${E}/g`;
  const S = `${E}/s`;
  const Z = `${S}/z`;
  const K = `${D}/design/K`;
  const V = `${D}/arch/V`;
  const X = `${V}/x`;
  const ROWS = [
    { ID: 'section:design', parent: null, Name: { label: 'Design Data' } },
    { ID: E, parent: 'section:design', Name: { label: 'E', editable: true }, Value: '<1x1 struct>', _canCopy: true, _canDelete: true, _canAddChild: true },
    { ID: F, parent: E, Name: { label: 'f', editable: true }, Value: '1', _canDelete: true },
    { ID: G, parent: E, Name: { label: 'g', editable: true }, Value: '2', _canDelete: false },
    { ID: S, parent: E, Name: { label: 's', editable: true }, Value: '<1x1 struct>', _canDelete: true },
    { ID: Z, parent: S, Name: { label: 'z', editable: true }, Value: '3', _canDelete: true },
    { ID: K, parent: 'section:design', Name: { label: 'K', editable: true }, Value: '4', _canCopy: true, _canDelete: false },
    { ID: 'section:arch', parent: null, Name: { label: 'Architectural Data' } },
    { ID: V, parent: 'section:arch', Name: { label: 'V', editable: true }, Value: '', _canCopy: true, _canDelete: true },
    { ID: X, parent: V, Name: { label: 'x', editable: true }, Value: 'double', _canDelete: true },
  ] as any[];
  const STRUCTS: TableView = { ...VIEW, docUri: 'file:///w/d.sldd', rows: ROWS };
  const param = { className: 'Simulink.Parameter', arrayClass: '', kind: 'Parameter', isMatlabVariable: true, isScalarNumeric: true };

  /** The dictionary, its sections' rules, a copied Parameter on the clipboard, and a text view. */
  async function editingTable() {
    const { source, calls, emit } = pageSource(STRUCTS);
    const mounted = await mount(source, {
      editing: true,
      textView: { available: true, locate: (rowId) => void calls.push(['locateInText', rowId]) },
    });
    emit({
      kind: 'sectionRules',
      docUri: 'file:///w/d.sldd',
      rules: [
        { sectionName: 'design', sectionLabel: 'Design Data', isDerived: false, allowedTypes: [] },
        { sectionName: 'arch', sectionLabel: 'Architectural Data', isDerived: true, allowedTypes: ['Simulink.Bus'] },
      ],
    });
    emit({ kind: 'clipboard', state: { canPaste: true, mode: 'copy', sourceDocUri: 'file:///w/d.sldd', items: [{ sectionName: 'design', ...param }] } });
    return { ...mounted, calls };
  }
  const CHORDS = {
    copy: { key: 'c', ctrlKey: true },
    cut: { key: 'x', ctrlKey: true },
    paste: { key: 'v', ctrlKey: true },
    delete: { key: 'Delete' },
    locateInText: { key: 'l', ctrlKey: true },
  };
  type Chord = keyof typeof CHORDS;
  /** Press the chord for `action` on the table: whether the table took the key. */
  const press = (table: any, action: Chord): boolean => {
    const e = new KeyboardEvent('keydown', { ...CHORDS[action], bubbles: true, cancelable: true, composed: true });
    table.dispatchEvent(e);
    return e.defaultPrevented;
  };

  it('builds the menu in exactly one place: a right-click, the handle and a chord read the same items', async () => {
    const { table, handle, contextMenu, shown, calls } = await editingTable();
    for (const selection of [[E], [F], [G], [Z], [K], [E, K], [X], ['section:design']]) {
      const anchor = selection[0];
      table.selectedRowIds = selection;
      rightClick(table, anchor);
      const menu = handle.menuFor(anchor);
      expect(shown.at(-1), `the menu on ${selection}`).toEqual(menu);
      for (const action of Object.keys(CHORDS) as Chord[]) {
        const item = menu.find((i) => i.id === action);
        const enabled = !!item && !item.disabled;
        // What choosing the item does, where it can be chosen; nothing where it cannot.
        calls.length = 0;
        if (enabled) {
          rightClick(table, anchor);
          choose(contextMenu, action);
        }
        const chosen = calls.splice(0);
        expect(press(table, action), `${action} on ${selection}`).toBe(enabled);
        expect(calls, `${action} on ${selection}`).toEqual(chosen);
      }
    }
  });

  it('gates every chord on the item that chord would click: disabled or absent, it does nothing and lets the key through', async () => {
    const { table, handle, calls } = await editingTable();
    const refused: [string[], Chord][] = [
      [[K], 'delete'], // K may not be deleted
      [[K], 'cut'], // nor cut, which deletes it
      [[G], 'delete'], // g may not leave its struct
      [[X], 'paste'], // Architectural Data takes no Parameter
      [[E, K], 'locateInText'], // two rows are not one place in the text
      [['section:design'], 'copy'], // a section is never copied: no item at all
      [['section:design'], 'delete'],
    ];
    for (const [selection, action] of refused) {
      table.selectedRowIds = selection;
      const item = handle.menuFor(selection[0]).find((i) => i.id === action);
      expect(!item || !!item.disabled, `${action} on ${selection} is not offered`).toBe(true);
      calls.length = 0;
      expect(press(table, action), `${action} on ${selection}`).toBe(false);
      expect(calls, `${action} on ${selection}`).toEqual([]);
    }
    table.selectedRowIds = [E];
    expect(press(table, 'copy')).toBe(true);
    expect(calls).toEqual([['copy', [E]]]);
  });

  it("re-derives no capability of its own: Copy and Cut read the entry's flags, Delete the row's", async () => {
    // A struct's field is copied and cut as its entry is (Cut is a copy and a deferred delete of the
    // entry), and deleted as the field is: a chord reading the selected row's own flags would refuse
    // Cmd+C on f, which carries no copy flag, and Cmd+X on g, which may not leave its struct.
    const { table, calls } = await editingTable();
    table.selectedRowIds = [F];
    expect(press(table, 'copy')).toBe(true);
    table.selectedRowIds = [G];
    expect(press(table, 'cut')).toBe(true);
    expect(press(table, 'delete')).toBe(false);
    table.selectedRowIds = [F];
    expect(press(table, 'delete')).toBe(true);
    expect(calls).toEqual([
      ['copy', [F]],
      ['cut', [G]],
      ['delete', [F]],
    ]);
  });

  it("resolves a paste target through its entry's section, at any depth, never the row's own parent", async () => {
    // A nested row's section is a walk up the whole chain to its entry's. Read off the row's
    // immediate parent instead, it is no section at all, and Paste greys out on a child that the
    // host would have taken, with no reason shown.
    const { table, handle, calls } = await editingTable();
    table.selectedRowIds = [Z];
    expect(handle.menuFor(Z).find((i) => i.id === 'paste')?.disabled).toBeFalsy();
    expect(press(table, 'paste')).toBe(true);
    expect(calls).toEqual([['paste', Z]]);
    // And the walk finds the section that refuses, too.
    table.selectedRowIds = [X];
    expect(handle.menuFor(X).find((i) => i.id === 'paste')).toMatchObject({ disabled: true, reason: 'Parameter cannot be in Architectural Data' });
    expect(press(table, 'paste')).toBe(false);
    expect(calls).toEqual([['paste', Z]]);
  });
});
