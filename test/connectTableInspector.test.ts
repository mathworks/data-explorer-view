// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The inspector's feed a connected table gives (its handle), with the two options a shell asks for:
// `inspectorPages` (the file's page while no row is selected, a section heading's, "N selected", and
// a row's Usage links as a group) and `inspectorEditing` (the rows editable where the document
// takes an edit of them, a change written back as a cell edit is, a refusal in the table's dialog).
//
// And without them, the feed the VS Code extension's pages are drawn like: the source asked exactly
// as before (no options), nothing for no row or a section. The extension's own inspector is fed by
// its host and not by this feed; a page app that connects a table and an inspector as the docs say
// sees no change until it asks for these.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTable, defineTreeTable, type ConnectTableOptions, type DexTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import { defineErrorDialog, type DexErrorDialog } from '../src/widgets/error-dialog/index.js';
import { createWorkspace, type InspectorView, type Workspace } from '../src/model/index.js';

defineTreeTable();
defineErrorDialog();

const shellFixture = (name: string) => new Uint8Array(readFileSync(join(import.meta.dirname, 'shell/fixtures', name)));
const uriOf = (name: string) => `file:///work/${name}`;

async function settle(table?: DexTreeTable): Promise<void> {
  for (let i = 0; i < 4; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table?.updateComplete;
  }
}

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const c of cleanups.splice(0)) c();
  document.body.replaceChildren();
});

/** `name` open in a workspace (`editing` as createWorkspace takes it), its table connected with `options`, and the pages its feed sends. */
async function mount(name: string, options: ConnectTableOptions = {}, editing = false, others: string[] = []) {
  const ws: Workspace = createWorkspace({ editing });
  for (const other of others) await ws.open(shellFixture(other), other, uriOf(other));
  const doc = await ws.open(shellFixture(name), name, uriOf(name));
  const table = document.createElement('dex-tree-table');
  const dialog = document.createElement('dex-error-dialog') as DexErrorDialog;
  document.body.append(table, dialog);
  const inspect = vi.spyOn(doc.table, 'inspect');
  const handle: TableHandle = connectTable(table, doc.table, { errorDialog: dialog, ...options });
  const pages: InspectorView[] = [];
  const stop = handle.onPage((page) => pages.push(page));
  cleanups.push(() => (stop(), handle.dispose(), ws.dispose()));
  await settle(table);
  const rowNamed = (label: string) => table.rows.find((r) => r.Name.label === label)!;
  const select = async (...labels: string[]) => {
    const ids = labels.map((l) => (l.startsWith('section:') ? l : rowNamed(l).ID));
    table.selectedRowIds = ids;
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: ids }, bubbles: true, composed: true }));
    await settle(table);
  };
  return { doc, table, dialog, handle, pages, inspect, select, rowNamed, last: () => pages.at(-1) };
}

const titles = (page: InspectorView | undefined) => (page?.groups ?? []).map((g) => g.title);
const row = (page: InspectorView | undefined, name: string) => page?.groups.flatMap((g) => g.properties).find((p) => p.name === name);

describe('without the options', () => {
  it('asks the source as it always has, and sends nothing for no row and an empty page for a section', async () => {
    const { pages, inspect, select } = await mount('params.sldd', { editing: true }, true);
    expect(pages).toEqual([]);
    await select('Kp');
    expect(pages.at(-1)?.rowId).toBeDefined();
    expect(row(pages.at(-1), 'Value')?.editable).toBe(false);
    await select('section:design');
    expect(pages.at(-1)).toEqual({ groups: [] });
    // One argument, as before: no options for a source to read.
    for (const call of inspect.mock.calls) expect(call).toHaveLength(1);
  });

  it('writes no change back: the handle takes no edit', async () => {
    const { handle, doc, rowNamed, table } = await mount('params.sldd', { editing: true }, true);
    const edit = vi.spyOn(doc.table as never as { edit(): void }, 'edit');
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle(table);
    expect(edit).not.toHaveBeenCalled();
  });
});

describe('inspectorPages', () => {
  it("says where the file is as `inspectorFileTitle` has it, and by its path without one", async () => {
    // A browser host's paths are its own making: the shell gives the host's words for the file's.
    const titled = await mount('params.sldd', { inspectorPages: true, inspectorFileTitle: 'plant/params.sldd' });
    expect(row(titled.pages[0], 'File')?.value).toBe('plant/params.sldd');
    document.body.replaceChildren();
    const plain = await mount('params.sldd', { inspectorPages: true });
    expect(row(plain.pages[0], 'File')?.value).toBe('/work/params.sldd');
  });

  it("sends the file's page while no row is selected, from the first, and again as the selection goes", async () => {
    const { pages, select, table } = await mount('params.sldd', { inspectorPages: true });
    expect(pages[0]?.rowId).toBe(uriOf('params.sldd'));
    expect(row(pages[0], 'Name')?.value).toBe('params.sldd');
    await select('Kp');
    expect(row(pages.at(-1), 'Name')?.value).toBe('Kp');
    table.selectedRowIds = [];
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [] }, bubbles: true, composed: true }));
    await settle(table);
    expect(pages.at(-1)?.rowId).toBe(uriOf('params.sldd'));
  });

  it("sends a section heading's page, and several rows' page", async () => {
    const { last, select } = await mount('params.sldd', { inspectorPages: true });
    await select('section:design');
    expect(titles(last())).toEqual(['General', 'Entry Types']);
    await select('Kp', 'Uo');
    expect(titles(last())).toEqual(['2 selected']);
  });

  it("adds the row's Usage links as a group, as its cell has them", async () => {
    const { last, select } = await mount('shadow_ws.slx', { inspectorPages: true });
    // A model's block: core's own cell, one link to the variable its Gain reads.
    await select('WsGain');
    expect(last()?.groups.at(-1)).toEqual({ title: 'Uses', properties: [{ name: 'Gain=Kp', value: '', editable: false, type: 'link', linkTarget: 'Kp@params.sldd' }] });
    // A Model Workspace variable: the blocks that read it.
    await select('Kp');
    expect(last()?.groups.at(-1)?.title).toBe('Used By');
    expect(last()?.groups.at(-1)?.properties.map((p) => p.name)).toEqual(['WsGain']);
  });

  it("sends a new feed listener the file's page at once, with no selection made yet", async () => {
    const { handle } = await mount('params.sldd', { inspectorPages: true });
    const seen: InspectorView[] = [];
    const stop = handle.onPage((page) => seen.push(page));
    await settle();
    stop();
    expect(seen.map((p) => p.rowId)).toEqual([uriOf('params.sldd')]);
  });

  it('sends a new listener the page of the row selected, though a select of that row overtakes it, which sends the others nothing', async () => {
    // As an inspector that follows the table again (back from Root) hears it: its first page is
    // overtaken by the row selected once more, the page the first listener has already.
    const { handle, pages, select, rowNamed } = await mount('params.sldd', { inspectorPages: true });
    await select('Kp');
    const before = pages.length;
    const seen: InspectorView[] = [];
    const stop = handle.onPage((page) => seen.push(page));
    await select('Kp');
    stop();
    expect(seen.map((p) => p.rowId)).toEqual([rowNamed('Kp').ID]);
    // The first listener, which has the page, is sent it no more.
    expect(pages.length).toBe(before);
  });

  it('sends the page again on refreshInspector() where it changed: the file now holds an edit', async () => {
    const { handle, doc, pages, rowNamed, table } = await mount('params.sldd', { inspectorPages: true, editing: true }, true);
    expect(row(pages.at(-1), 'Modified')?.value).toBe('No');
    const count = pages.length;
    handle.refreshInspector();
    await settle(table);
    // The same page is not sent twice.
    expect(pages.length).toBe(count);
    const dirty = new Promise<void>((resolve) => doc.onDirty((d) => d && resolve()));
    (doc.table as never as { edit(e: object): void }).edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await dirty;
    handle.refreshInspector();
    await settle(table);
    expect(row(pages.at(-1), 'Modified')?.value).toBe('Yes');
  });
});

describe('inspectorEditing', () => {
  it('sends rows editable where the document takes an edit, and writes a change back as a cell edit', async () => {
    const { handle, last, select, table, rowNamed } = await mount('params.sldd', { editing: true, inspectorEditing: true }, true);
    await select('Kp');
    expect(row(last(), 'Value')).toMatchObject({ editable: true, key: 'Value' });
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle(table);
    await settle(table);
    expect(table.rows.find((r) => r.Name.label === 'Kp')?.Value).toBe('5');
    expect(row(last(), 'Value')?.value).toBe('5');
  });

  it("shows a refused change in the table's dialog, and sends the page again so its field is put back", async () => {
    const { handle, dialog, pages, select, table, rowNamed } = await mount('params.sldd', { editing: true, inspectorEditing: true }, true);
    await select('Kp');
    const shown = vi.spyOn(dialog, 'show');
    const count = pages.length;
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Name', oldValue: 'Kp', newValue: '1bad name' });
    await settle(table);
    await settle(table);
    expect(shown).toHaveBeenCalledWith(expect.objectContaining({ title: 'Invalid Value', invalidValue: '1bad name' }));
    expect(pages.length).toBeGreaterThan(count);
    expect(row(pages.at(-1), 'Name')?.value).toBe('Kp');
  });

  it('is undone as a cell edit is, one step, and the page follows', async () => {
    const { handle, last, select, table, rowNamed } = await mount('params.sldd', { editing: true, inspectorEditing: true }, true);
    await select('Kp');
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle(table);
    await settle(table);
    expect(row(last(), 'Value')?.value).toBe('5');
    handle.undo();
    await settle(table);
    await settle(table);
    expect(table.rows.find((r) => r.Name.label === 'Kp')?.Value).toBe('1');
    expect(row(last(), 'Value')?.value).toBe('1');
  });

  it("writes the change to its row and shows the next row's page when the selection moves on before it lands", async () => {
    const { handle, last, select, table, rowNamed } = await mount('params.sldd', { editing: true, inspectorEditing: true }, true);
    await select('Kp');
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await select('Uo');
    await settle(table);
    await settle(table);
    expect(table.rows.find((r) => r.Name.label === 'Kp')?.Value).toBe('5');
    expect(row(last(), 'Name')?.value).toBe('Uo');
  });

  it('commitEdit() waits for a change written from the inspector', async () => {
    const { handle, select, table, rowNamed, doc } = await mount('params.sldd', { editing: true, inspectorEditing: true }, true);
    await select('Kp');
    handle.edit({ rowId: rowNamed('Kp').ID, columnId: 'Value', oldValue: '1', newValue: '7' });
    await handle.commitEdit();
    expect(doc.dirty).toBe(true);
    await settle(table);
  });

  it('sends no editable row, and writes nothing, for a document whose view takes no edits', async () => {
    const { handle, last, select, table, rowNamed, doc } = await mount('legacy_ctrl.mdl', { editing: true, inspectorEditing: true }, true);
    const first = table.rows.find((r) => !r.ID.startsWith('section:'))!;
    await select(first.Name.label);
    expect(last()?.groups.flatMap((g) => g.properties).some((p) => p.editable)).toBe(false);
    handle.edit({ rowId: rowNamed(first.Name.label).ID, columnId: 'Name', oldValue: first.Name.label, newValue: 'x' });
    await settle(table);
    expect(doc.dirty).toBe(false);
  });
});
