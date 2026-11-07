// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// This pins the compare's reading of a cell (cellTextOf, in the DOM-free model) to the table's own
// (`<dex-tree-table>`'s _getCellText, what it shows, searches and sorts by).
//
// A compare says two rows differ where their texts differ, and the user then reads the two rows in
// two tables. Were the model's reading another than the table's, a row could be marked changed with
// both cells showing the same text, or two different cells read alike and the row left unmarked.
// The model keeps a copy of its own, as it may not import a widget, so this holds the copy to the
// original over every row and every column of real files of each kind: dictionaries (JSON and
// compressed, objects, buses, nested structs), models (.slx and .mdl) and a MAT-file. Read with no
// folder around them, those files give no cell of some shapes the table reads (a block's parameter
// links come from a folder's usage graph), so it holds the two together over every made-up shape
// compareCellText reads too (compare/cellShapes.ts). Usage is left out: no compare reads it
// (DIFF_SKIPPED_COLUMNS), and its link groups are the table's alone.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cellTextOf } from '../src/model/compare/cellText.js';
import { CELL_SHAPES, rowWith } from './compare/cellShapes.js';
import { COLUMNS } from '../src/model/rows/rowBuilder.js';
import { createWorkspace } from '../src/model/source/workspace.js';
import { sourceUri } from '../src/model/source/sourceUri.js';
import { DexTreeTable, defineTreeTable } from '../src/widgets/tree-table/dex-tree-table.js';

defineTreeTable();

const FIXTURES = join(import.meta.dirname, 'fixtures');
const FILES = [
  'params.sldd',
  'arch.sldd',
  'nested_objects.sldd',
  'object_props_text.sldd',
  'rt_bin.sldd',
  'model_with_refs.slx',
  'legacy_ctrl.mdl',
  'nd_numeric.mat',
];

describe("the compare reads a cell as the table does", () => {
  it.each(FILES)('%s', async (name) => {
    const ws = createWorkspace();
    try {
      const doc = await ws.open(new Uint8Array(readFileSync(join(FIXTURES, name))), name, sourceUri(`/w/${name}`));
      const { rows } = await doc.table.open();
      expect(rows.length).toBeGreaterThan(0);
      const table = new DexTreeTable() as unknown as { _getCellText(row: unknown, col: string): string };
      let read = 0;
      for (const row of rows) {
        for (const col of COLUMNS) {
          if (col === 'UsedBy') continue;
          expect(cellTextOf(row, col), `${row.ID} ${col}`).toBe(table._getCellText(row, col));
          if (cellTextOf(row, col) !== '') read++;
        }
      }
      // Something was read: a file whose every cell is empty would pin nothing.
      expect(read).toBeGreaterThan(0);
    } finally {
      ws.dispose();
    }
  });
});

describe('the compare reads each shape of cell as the table does', () => {
  const table = new DexTreeTable() as unknown as { _getCellText(row: unknown, col: string): string };
  it.each(CELL_SHAPES)('$what', ({ cells, column, text }) => {
    const row = rowWith(cells);
    expect(table._getCellText(row, column)).toBe(text);
    expect(cellTextOf(row, column)).toBe(table._getCellText(row, column));
  });
});
