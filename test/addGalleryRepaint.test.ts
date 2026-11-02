// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// What the Add gallery offers follows each whole paint (connectTable({editing}), editingWire.ts):
// a MAT-file's view names the classes its host lists (`add: {classes}`), and a later paint that
// names none, a dictionary's, gives the gallery its whole catalog back rather than keeping the
// MAT-file's few. Ported from data-explorer-vscode test/matTableWiring.test.ts at 632f6e0, which
// sent the two paints as `setRows` messages through its webview entry (table-main.ts); here they
// are open()'s answer and a replaceAll from a source beside the table.
import { afterEach, describe, expect, it } from 'vitest';
import { allTiles } from '../src/model/ids/addCatalog.js';
import type { EditableTableSource, TableChange, TableView } from '../src/model/index.js';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

// What a host says a MAT-file takes: a subset, in core's order, so the gallery's order is the
// catalog's and not this list's; and `string`, which core lists and the gallery leaves out
// (MAT_OMITTED: typing one into a variable's Value makes one).
const CLASSES = ['Simulink.Bus', 'string', 'MatlabVariable', 'Simulink.Parameter', 'MatlabStruct'];
const IN_CATALOG_ORDER = ['MatlabVariable', 'MatlabStruct', 'Simulink.Parameter', 'Simulink.Bus'];

const rowsOf = () => [
  { ID: 'm/x', parent: null, Name: { label: 'x', editable: true }, Value: '1', _canDelete: true, _canCopy: true } as any,
  { ID: 'm/y', parent: null, Name: { label: 'y', editable: true }, Value: '2', _canDelete: true, _canCopy: true } as any,
];

const view = (docUri: string, extra: Partial<TableView> = {}): TableView => ({
  docUri,
  rows: rowsOf(),
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  columnGroups: {},
  editable: true,
  ...extra,
});

/** An editable source that answers with `first`, and sends what it is told to. */
function pageSource(first: TableView) {
  const listeners = new Set<(c: TableChange) => void>();
  const ignore = () => {};
  const source = {
    open: async () => first,
    children: async (nodeId: string) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId: string) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: (l: (c: TableChange) => void) => (listeners.add(l), () => void listeners.delete(l)),
    ...Object.fromEntries(
      ['edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'].map(
        (name) => [name, ignore],
      ),
    ),
  } as unknown as EditableTableSource;
  const emit = (change: TableChange) => {
    for (const l of [...listeners]) l(change);
  };
  return { source, emit };
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

describe('the Add gallery across whole paints', () => {
  const popover = (table: any) => table.shadowRoot.querySelector('dex-add-gallery');
  const tilesOf = (table: any): HTMLElement[] => [...popover(table).shadowRoot.querySelectorAll('.tile')] as HTMLElement[];
  const openGallery = async (table: any) => {
    table.toggleAddGallery();
    await table.updateComplete;
    await popover(table).updateComplete;
  };
  const closeGallery = async (table: any) => {
    if (popover(table)) table.toggleAddGallery();
    await table.updateComplete;
  };

  it("a dictionary's table, told no classes, offers its whole gallery again", async () => {
    const { source, emit } = pageSource(view('file:///fx/d.mat', { add: { classes: CLASSES } }));
    const table = document.createElement('dex-tree-table') as any;
    document.body.append(table);
    handles.push(connectTable(table, source, { editing: true }));
    await settle(table);
    // The MAT-file's gallery first, so the whole one below is a catalog given BACK, not one
    // that was never narrowed.
    await openGallery(table);
    expect(tilesOf(table).map((t) => t.dataset.className)).toEqual(IN_CATALOG_ORDER);
    await closeGallery(table);

    emit({ kind: 'replaceAll', view: view('file:///fx/d.sldd') });
    await settle(table);
    await openGallery(table);
    expect(tilesOf(table).map((t) => `${t.dataset.section} ${t.dataset.className}`)).toEqual(allTiles().map((t) => `${t.section} ${t.className}`));
    await closeGallery(table);
  });
});
