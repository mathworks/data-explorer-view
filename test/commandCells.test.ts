// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The command window edits exactly the cells the table would. `set` and `<name> = <value>` decide
// whether a cell can be edited with cellEditor (src/model/shell/commands.ts), which restates the
// tree table's _cellEditTarget in the model, since the model cannot load a widget; the table draws
// that answer as the `cell-editable` class on the cell. Two copies of one rule drift, so this holds
// them together over real views (dictionaries with objects, structs, enums and buses, a MAT-file, a
// model): every row of each drawn in a table, and every cell's class compared with cellEditor.
//
// The rows are drawn flat (each at the top level, no section headings), so that every one is on
// screen without expanding it: whether a cell has an editor does not depend on where its row is.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { cellEditor } from '../src/model/shell/commands.js';
import { createWorkspace, isSectionRowId, type TableView, type TreeTableRow } from '../src/model/index.js';
import { DexTreeTable, defineTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

async function viewOf(path: string): Promise<TableView> {
  const ws = createWorkspace({ editing: true });
  try {
    const doc = await ws.open(readFileSync(path), path.split('/').pop()!);
    return await doc.table.open();
  } finally {
    ws.dispose();
  }
}

// The rows a view's table would show, flat, and a table to draw them in. The table draws a window
// of its rows (virtual scrolling), so they are given to it a few at a time (CHUNK).
const CHUNK = 10;

async function mounted(view: TableView): Promise<DexTreeTable> {
  const table = new DexTreeTable();
  table.columns = view.columns;
  document.body.append(table);
  // Every column shown, the ones a table hides by default too.
  (table as any)._hiddenColumns = new Set<string>();
  return table;
}

async function draw(table: DexTreeTable, rows: TreeTableRow[]): Promise<void> {
  table.rows = rows;
  table.requestUpdate();
  await table.updateComplete;
}

describe("cellEditor answers as the table's cells are drawn", () => {
  it.each([
    'test/fixtures/object_props_text.sldd',
    'test/fixtures/nested_objects.sldd',
    'test/fixtures/arch.sldd',
    'test/fixtures/mcos/all.sldd',
    'test/fixtures/nd_numeric.mat',
    'test/fixtures/mcos/mcosfix.slx',
  ])('%s', async (path) => {
    const view = await viewOf(path);
    const rows = view.rows.filter((r) => !isSectionRowId(r.ID)).map((r) => ({ ...r, parent: null }));
    const table = await mounted(view);
    try {
      let cells = 0;
      let editable = 0;
      for (let at = 0; at < rows.length; at += CHUNK) {
        const chunk = rows.slice(at, at + CHUNK);
        await draw(table, chunk);
        for (const row of chunk) {
          const tr = table.shadowRoot!.querySelector(`tr[data-row-id="${CSS.escape(row.ID)}"]`);
          expect(tr, row.ID).not.toBeNull();
          for (const column of view.columns) {
            const td = tr!.querySelector(`td.col-${column}`);
            if (!td) continue;
            cells++;
            const drawnEditable = td.classList.contains('cell-editable');
            if (drawnEditable) editable++;
            expect(cellEditor(row, column) !== null, `${row.ID} ${column}`).toBe(drawnEditable);
          }
        }
      }
      // A table that drew no cell, or none editable, would agree with anything.
      expect(cells).toBeGreaterThan(rows.length);
      expect(editable).toBeGreaterThan(0);
    } finally {
      table.remove();
    }
  });
});
