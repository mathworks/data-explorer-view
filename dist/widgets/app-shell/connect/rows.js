// Copyright 2026 The MathWorks, Inc.
//
// A table's rows by id, for what climbs a selected row's parents: the location bar's path, the
// section the Explorer marks, and the name a relationship graph reveals a row by. And an entry as a
// link from outside the shell names it (ShellHandle.openAt, a link copied from a row): by its name
// and its section's label, in words a mail or a ticket carries, rather than by a row id. DOM-free.
//
// The rows are the table's own array (DexTreeTable.rows), which connectTable replaces whole on
// every change: a whole paint, one entry's repaint, a lazy row's children answered and merged in.
// So the array is what an index is kept for: each is indexed once, as it is first asked, a row
// gone from the next array is gone, and a child merged in later is there as soon as the table has
// it, with nothing to keep in step with the source's changes.
import { isEntryRow, isSectionRowId } from '../../../model/ids/sectionRowId.js';
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
/**
 * The entry the row `rowId` is in (itself, for an entry): its name, and its section's label where
 * it is under one (a MAT-file's variables are under none). None for a section's own row, a row
 * `rows` does not hold, or a parent chain that breaks off or loops.
 */
export function entryOf(rows, rowId) {
    const seen = new Set();
    let row = rowIn(rows, rowId);
    while (row && !isEntryRow(row)) {
        // No parent and no entry: a section's own row, which names no entry.
        if (row.parent === null || seen.has(row.ID))
            return undefined;
        seen.add(row.ID);
        row = rowIn(rows, row.parent);
    }
    if (!row)
        return undefined;
    if (row.parent === null)
        return { entry: row.Name.label };
    // Under a section the table does not hold: no label to name it by, as a chain broken off.
    const section = rowIn(rows, row.parent);
    return section ? { entry: row.Name.label, section: section.Name.label } : undefined;
}
/**
 * The row ShellHandle.openAt selects for `entry`. With `section`: the first top-level entry
 * labelled `entry` under the first section row labelled `section`. Without: selectByName's order
 * (connectTable.ts:517): an entry, then any row, then a row whose `_blockKey` it is; never a
 * section's own row, which is no entry. None for '' or no match.
 */
export function rowOfEntry(rows, entry, section) {
    if (entry === '')
        return undefined;
    const named = (r) => r.Name?.label === entry && !isSectionRowId(r.ID);
    // A section names where the entry is: a row nested in one, of the same name, is not what it means.
    if (section) {
        const heading = rows.find((r) => isSectionRowId(r.ID) && r.Name?.label === section);
        return heading ? rows.find((r) => r.parent === heading.ID && named(r)) : undefined;
    }
    return rows.find((r) => named(r) && isEntryRow(r)) ?? rows.find(named) ?? rows.find((r) => r._blockKey === entry && !isSectionRowId(r.ID));
}
/**
 * The entry a link to the row `rowId` names (Copy Link to Entry), so that openAt (rowOfEntry)
 * selects that row again. A block in a subsystem goes by its key, `{ entry: '8' }`: core lists a
 * model's blocks flat under its section, so the name it shows may be another block's too (a Gain in
 * the root system, one in a subsystem), and a block nested under its subsystem's row would be named
 * by the subsystem. That holds where the key selects the same row (no row is labelled with it).
 * Any other row goes by entryOf: its entry's name, and its section's label where it has one.
 */
export function linkedEntryOf(rows, rowId) {
    const row = rowIn(rows, rowId);
    const key = row?._blockKey;
    const inSubsystem = !!row && (!!row._systemPath || !isEntryRow(row));
    if (inSubsystem && typeof key === 'string' && key !== '' && rowOfEntry(rows, key)?.ID === rowId)
        return { entry: key };
    return entryOf(rows, rowId);
}
