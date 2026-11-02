// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// After an add: the host's `beginRename` opens the name editor on the entry it just created, and
// closing a pinned run leaves the selection the last add made. Driven through connectTable({editing})
// across a channel (messageSource over a plain port), as an extension's table webview is.
//
// The rename has an ordering hazard. `selectRows` and `beginRename` are two messages riding beside
// a repaint, and nothing in the table may assume which arrives first, so a rename asked for before
// its row exists must be held, and then must actually happen when the row lands. The failure if it
// is not held is silent: the entry is created and selected, the editor never opens, and the user
// is left renaming it by hand.
import { afterEach, describe, expect, it } from 'vitest';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { messageSource, type TablePort } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

const DOC = 'file:///fx/d.sldd';
const SECTION_ROW = 'section:design';

// Two rows shaped like a real dictionary: the section header an insert is placed against, and one
// entry with a renameable Name (core sets `editable` from nameEditable).
const GAIN = { ID: 'doc/design/gain', parent: SECTION_ROW, Name: { label: 'gain', editable: true }, Value: '5' };
const rowsOf = () => [{ ID: SECTION_ROW, parent: null, Name: { label: 'Design Data' } }, { ...GAIN }];
const setRows = (rows: unknown[] = rowsOf(), editable = true) => ({
  type: 'setRows',
  docUri: DOC,
  rows,
  columns: ['Name', 'Value'],
  columnLabels: { Name: 'Name', Value: 'Value' },
  editable,
});
const added = (name: string) => ({ ID: `doc/design/${name}`, parent: SECTION_ROW, Name: { label: name, editable: true }, Value: '0' });

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

/** A table connected to a host that is the test, painted with the two rows. */
async function mount() {
  const posted: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const port: TablePort = {
    postMessage: (m) => void posted.push(m),
    onMessage: (listener) => ((hear = listener), () => (hear = () => {})),
  };
  const table = document.createElement('dex-tree-table') as any;
  document.body.append(table);
  const handle = connectTable(table, messageSource(port), { editing: true });
  handles.push(handle);
  // The selection the app is told of: the Property Inspector follows it.
  const selected: string[][] = [];
  handle.on('select', (rowIds) => void selected.push(rowIds));
  // `say` delivers a message as the host posts it; `send` also lets the table draw what it did.
  const say = (m: unknown) => hear(m);
  const send = async (m: unknown) => {
    say(m);
    await settle(table);
  };
  await send(setRows());
  posted.length = 0;
  const editingCell = () => table._editingCell ?? null;
  const editorInput = () => table.shadowRoot.querySelector('.edit-input') as HTMLInputElement | null;
  return { table, handle, posted, selected, say, send, editingCell, editorInput };
}

describe('beginRename opens the name editor on the new entry', () => {
  it('holds the request until the row arrives, then opens it', async () => {
    // The host posts the repaint and then the rename, but the table must not depend on that: a
    // resync, a queued message or a future host change could reverse it, and the symptom would be
    // an editor that silently never opens.
    const { posted, send, editingCell, editorInput } = await mount();
    const row = added('Param');
    await send({ type: 'beginRename', rowId: row.ID });
    expect(editingCell()).toBeNull();
    // No whole-table request either: holding is the answer, not degrading.
    expect(posted.filter((m) => m.type === 'ready')).toEqual([]);

    await send({ type: 'insertEntryRows', sectionRowId: SECTION_ROW, rows: [row] });
    expect(editingCell()).toMatchObject({ rowId: row.ID, columnId: 'Name' });
    expect(editorInput()?.value).toBe('Param');
  });

  it('does not reopen on the next repaint once it has been answered', async () => {
    // The request is consumed, not remembered. After an undo the same id can name a different
    // entry, and an editor opening on it unasked would be an edit the user did not start.
    const { table, send, editingCell } = await mount();
    await send({ type: 'beginRename', rowId: GAIN.ID });
    expect(editingCell()).not.toBeNull();
    table._editingCell = null; // as an Escape in the editor would
    await table.updateComplete;

    await send(setRows());
    expect(editingCell()).toBeNull();
    // Nor on a repaint of the one entry, which keeps every other wait (a whole one drops them).
    await send({ type: 'updateEntryRows', entryRowId: GAIN.ID, rows: [{ ...GAIN }] });
    expect(editingCell()).toBeNull();
  });

  it('a whole repaint that drops the renamed row closes its editor; one that keeps it does not', async () => {
    // Ruling V-037 (b). The entry being renamed is undone, or deleted from the text view, and the
    // repaint no longer carries it: the editor closes rather than stay open over a row that is not
    // there, which left the table deaf to the keyboard.
    const { send, editingCell, editorInput } = await mount();
    await send({ type: 'beginRename', rowId: GAIN.ID });
    expect(editingCell()).toMatchObject({ rowId: GAIN.ID, columnId: 'Name' });

    await send(setRows(rowsOf().filter((r) => r.ID !== GAIN.ID)));
    expect(editingCell()).toBeNull();
    expect(editorInput()).toBeNull();

    // The background repaint (a save) carries the row again: the editor stays open, with what
    // was typed in it.
    await send(setRows());
    await send({ type: 'beginRename', rowId: GAIN.ID });
    editorInput()!.value = 'gainTyped';
    await send(setRows());
    expect(editingCell()).toMatchObject({ rowId: GAIN.ID, columnId: 'Name' });
    expect(editorInput()?.value).toBe('gainTyped');
  });

  it('opens nothing for a row the table does not hold a renameable name for', async () => {
    // The table decides, through the same path a double-click goes through: a section header has
    // no editable Name, so there is no editor to open and no request left pending either.
    const { send, editingCell } = await mount();
    await send({ type: 'beginRename', rowId: SECTION_ROW });
    expect(editingCell()).toBeNull();

    await send({ type: 'insertEntryRows', sectionRowId: SECTION_ROW, rows: [] });
    expect(editingCell()).toBeNull();
  });

  it('ignores a rowId that is not a string rather than holding forever', async () => {
    const { send, editingCell } = await mount();
    await send({ type: 'beginRename', rowId: undefined });
    await send({ type: 'insertEntryRows', sectionRowId: SECTION_ROW, rows: [] });
    expect(editingCell()).toBeNull();
  });
});

// Ruling V-038 (b): closing a pinned gallery does NOT select the run it added. Each add selects its
// own new entry, so the last one is what stays selected, and closing changes nothing. The pin's
// tooltip promises no more (addGalleryWidget.test.ts, 'the pin promises only what it does'). Here
// so that building the run selection later is a deliberate change to this test, and not a tooltip
// and a behaviour that drift apart again.
describe('closing a pinned run', () => {
  const popover = (table: any) => table.shadowRoot.querySelector('dex-add-gallery') as any;
  const tileOf = (g: any, className: string) =>
    [...g.shadowRoot.querySelectorAll('.tile')].find((t: any) => t.dataset.className === className) as HTMLElement;
  const addButton = (table: any) => table.shadowRoot.querySelector('.add-button') as HTMLElement;

  const closers: [string, (g: any, table: any, handle: TableHandle) => void][] = [
    [
      'the popover’s Escape',
      (g) =>
        tileOf(g, 'Simulink.Parameter').dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true }),
        ),
    ],
    ['the Add button', (_, table) => addButton(table).click()],
    ['the accelerator', (_, __, handle) => handle.toggleAddGallery()],
  ];

  it.each(closers)('leaves the last entry selected, closed by %s, and opens no editor', async (_, close) => {
    const { table, handle, posted, selected, say, send, editingCell } = await mount();
    table.selectedRowIds = [];
    addButton(table).click();
    await table.updateComplete;
    const g = popover(table);
    await g.updateComplete;
    const pin = g.shadowRoot.querySelector('.gallery-pin input') as HTMLInputElement;
    pin.checked = true;
    pin.dispatchEvent(new Event('change', { bubbles: true }));
    await table.updateComplete;

    // Two tile clicks, each answered as a host answers an add: the new entry's rows, then
    // `selectRows` naming that one entry. No `beginRename`, because a pinned add asks for none.
    const run = [added('Param'), added('Param1')];
    for (const row of run) {
      tileOf(g, 'Simulink.Parameter').click();
      say({ type: 'insertEntryRows', sectionRowId: SECTION_ROW, rows: [row] });
      await send({ type: 'selectRows', rowIds: [row.ID] });
    }
    expect(posted.filter((m) => m.type === 'addEntry').map((m) => m.rename)).toEqual([false, false]);
    expect(popover(table)).not.toBeNull();
    expect(table.selectedRowIds).toEqual(['doc/design/Param1']);
    expect(selected).toEqual([['doc/design/Param'], ['doc/design/Param1']]);

    close(g, table, handle);
    await settle(table);
    expect(popover(table)).toBeNull();
    // The run is not selected: only the entry the last add selected is.
    expect(table.selectedRowIds).toEqual(['doc/design/Param1']);
    expect(editingCell()).toBeNull();
    // And the app is told of no new selection, so the Property Inspector stays put.
    expect(selected).toEqual([['doc/design/Param'], ['doc/design/Param1']]);
  });
});
