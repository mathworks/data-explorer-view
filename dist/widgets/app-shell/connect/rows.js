// Copyright 2026 The MathWorks, Inc.
//
// A table's rows by id, for what climbs a selected row's parents: the location bar's path, the
// section the Explorer marks, and the name a relationship graph reveals a row by. DOM-free.
//
// The rows are the table's own array (DexTreeTable.rows), which connectTable replaces whole on
// every change: a whole paint, one entry's repaint, a lazy row's children answered and merged in.
// So the array is what an index is kept for: each is indexed once, as it is first asked, a row
// gone from the next array is gone, and a child merged in later is there as soon as the table has
// it, with nothing to keep in step with the source's changes.
import { isSectionRowId } from '../../../model/ids/sectionRowId.js';
const indexes = new WeakMap();
/** The row of `rows` whose id is `rowId`: the first, where two have it, as a find would give. */
export function rowIn(rows, rowId) {
    let index = indexes.get(rows);
    if (!index) {
        index = new Map();
        for (const row of rows)
            if (!index.has(row.ID))
                index.set(row.ID, row);
        indexes.set(rows, index);
    }
    return index.get(rowId);
}
/**
 * The top-level section row `rowId` is in (itself, for a section's own row), or none: a row under
 * no section (a MAT-file's variable), one `rows` does not hold, or a parent chain that breaks off
 * or loops.
 */
export function sectionOf(rows, rowId) {
    const seen = new Set();
    let row = rowIn(rows, rowId);
    while (row && row.parent !== null) {
        if (seen.has(row.ID))
            return undefined;
        seen.add(row.ID);
        row = rowIn(rows, row.parent);
    }
    return row && isSectionRowId(row.ID) ? row.ID : undefined;
}
/**
 * The name the relationship graph reveals the row `rowId` by (graphIdOf's `name`, an item's
 * `revealName`): a block's key; else the name of the entry it is in, a field's variable, since the
 * graph draws entries and not what is inside them. None for a section's row, a row `rows` does not
 * hold, or a parent chain that breaks off or loops.
 */
export function graphNameOf(rows, rowId) {
    let row = rowIn(rows, rowId);
    if (typeof row?._blockKey === 'string')
        return row._blockKey;
    const seen = new Set();
    while (row && row.parent !== null && !isSectionRowId(row.parent)) {
        if (seen.has(row.ID))
            return undefined;
        seen.add(row.ID);
        row = rowIn(rows, row.parent);
    }
    return row && !isSectionRowId(row.ID) ? row.Name.label : undefined;
}
