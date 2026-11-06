// Copyright 2026 The MathWorks, Inc.
//
// A table's rows by id, for what climbs a selected row's parents: the location bar's path and the
// section the Explorer marks. DOM-free.
//
// The rows are the table's own array (DexTreeTable.rows), which connectTable replaces whole on
// every change: a whole paint, one entry's repaint, a lazy row's children answered and merged in.
// So the array is what an index is kept for: each is indexed once, as it is first asked, a row
// gone from the next array is gone, and a child merged in later is there as soon as the table has
// it, with nothing to keep in step with the source's changes.

import { isSectionRowId } from '../../../model/ids/sectionRowId.js';
import type { TreeTableRow } from '../../../model/rows/tableRow.js';

const indexes = new WeakMap<readonly TreeTableRow[], Map<string, TreeTableRow>>();

/** The row of `rows` whose id is `rowId`: the first, where two have it, as a find would give. */
export function rowIn(rows: readonly TreeTableRow[], rowId: string): TreeTableRow | undefined {
  let index = indexes.get(rows);
  if (!index) {
    index = new Map();
    for (const row of rows) if (!index.has(row.ID)) index.set(row.ID, row);
    indexes.set(rows, index);
  }
  return index.get(rowId);
}

/**
 * The top-level section row `rowId` is in (itself, for a section's own row), or none: a row under
 * no section (a MAT-file's variable), one `rows` does not hold, or a parent chain that breaks off
 * or loops.
 */
export function sectionOf(rows: readonly TreeTableRow[], rowId: string): string | undefined {
  const seen = new Set<string>();
  let row = rowIn(rows, rowId);
  while (row && row.parent !== null) {
    if (seen.has(row.ID)) return undefined;
    seen.add(row.ID);
    row = rowIn(rows, row.parent);
  }
  return row && isSectionRowId(row.ID) ? row.ID : undefined;
}
