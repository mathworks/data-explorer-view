// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A connected table's `dropReplacing`: the drag in flight copied onto a row of its document, the
// entries it names taken out first in the same edit (the source's `dropReplacing`), for a compare's
// Copy to Right of a changed entry. It is judged and settled as the handle's `drop` is
// (test/connectTableDropOn.test.ts): the table's own prediction first, then the source's promise and
// a task, and with no drag in flight there is nothing to drop. A source without the command takes no
// replacing copy, and says so in the words an app shows, rather than making a plain copy (which would
// paste the entry beside the one it was to replace, as `Kp1`).
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { DexTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';
import { createWorkspace, sourceUri, type EditableTableSource, type TableSource, type TreeTableRow, type Workspace } from '../src/model/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

let handles: TableHandle[] = [];
let workspaces: Workspace[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
  document.body.replaceChildren();
});

const settle = async (table?: any) => {
  for (let i = 0; i < 6; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table?.updateComplete;
  }
};

const PARAMS = new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', 'params.sldd')));

/** One editing workspace with params.sldd open twice, as a compare's two sides: a under /a/, b under /b/. */
async function twoSides() {
  const ws = createWorkspace({ editing: true });
  workspaces.push(ws);
  const a = await ws.open(PARAMS, 'params.sldd', sourceUri('/a/params.sldd'));
  const b = await ws.open(PARAMS, 'params.sldd', sourceUri('/b/params.sldd'));
  await a.table.open();
  a.table.opened?.();
  return { at: a.table as EditableTableSource, bt: b.table as EditableTableSource };
}

/** The same source, without `dropReplacing`: every other member handed on to it. */
function withoutReplacing(source: EditableTableSource): EditableTableSource {
  const names = ['open', 'children', 'matrix', 'inspect', 'raw', 'subscribe', 'opened', 'edit', 'copy', 'cut', 'delete', 'paste', 'addChild', 'addEntry', 'undo', 'redo', 'dragStart', 'dragEnd', 'drop', 'requestEditText'];
  const out: Record<string, unknown> = {};
  for (const name of names) if (typeof (source as any)[name] === 'function') out[name] = (...args: unknown[]) => (source as any)[name](...args);
  Object.defineProperty(out, 'history', { get: () => source.history });
  return out as unknown as EditableTableSource;
}

async function mount(source: TableSource) {
  const table = document.createElement('dex-tree-table') as DexTreeTable;
  document.body.append(table);
  const handle = connectTable(table, source, { editing: true });
  handles.push(handle);
  await settle(table);
  return { table, handle };
}

const rowNamed = (rows: readonly TreeTableRow[], label: string): TreeTableRow => rows.find((row) => row.Name.label === label)!;

describe("the handle's dropReplacing", () => {
  it('copies the drag in flight over the entries it names, in one edit', async () => {
    const { at, bt } = await twoSides();
    const { table, handle } = await mount(bt);
    const bKp = rowNamed(table.rows, 'Kp');
    await bt.edit({ rowId: bKp.ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle(table);
    at.dragStart([rowNamed((await at.open()).rows, 'Kp').ID]);
    await settle(table);
    const result = await handle.dropReplacing('section:design', [bKp.ID]);
    at.dragEnd();
    await settle(table);
    expect(result).toEqual({ dropped: true, count: 1 });
    const names = table.rows.filter((row) => row.parent === 'section:design').map((row) => row.Name.label);
    expect(names.sort()).toEqual(['Ki', 'Kp', 'Uo']);
    expect(rowNamed(table.rows, 'Kp').Value).toBe('1');
  });

  it('is refused by a source that takes no replacing copy', async () => {
    const { at, bt } = await twoSides();
    const { table, handle } = await mount(withoutReplacing(bt));
    at.dragStart([rowNamed((await at.open()).rows, 'Kp').ID]);
    await settle(table);
    const result = await handle.dropReplacing('section:design', [rowNamed(table.rows, 'Kp').ID]);
    at.dragEnd();
    expect(result).toEqual({ dropped: false, count: 1, reason: 'params.sldd does not replace entries.' });
    await settle(table);
    // Nothing was pasted beside it.
    expect(table.rows.filter((row) => row.parent === 'section:design').map((row) => row.Name.label)).toEqual(['Kp', 'Uo', 'Ki']);
  });

  it('drops nothing with no drag in flight', async () => {
    const { bt } = await twoSides();
    const { table, handle } = await mount(bt);
    expect(await handle.dropReplacing('section:design', [rowNamed(table.rows, 'Kp').ID])).toEqual({ dropped: false, count: 0 });
  });
});
