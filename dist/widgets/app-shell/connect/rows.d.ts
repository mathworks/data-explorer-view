import type { TreeTableRow } from '../../../model/rows/tableRow.js';
/** The row of `rows` whose id is `rowId`: the first, where two have it, as a find would give. */
export declare function rowIn(rows: readonly TreeTableRow[], rowId: string): TreeTableRow | undefined;
/**
 * The top-level section row `rowId` is in (itself, for a section's own row), or none: a row under
 * no section (a MAT-file's variable), one `rows` does not hold, or a parent chain that breaks off
 * or loops.
 */
export declare function sectionOf(rows: readonly TreeTableRow[], rowId: string): string | undefined;
/**
 * The name the relationship graph reveals the row `rowId` by (graphIdOf's `name`, an item's
 * `revealName`): a block's key; else the name of the entry it is in, a field's variable, since the
 * graph draws entries and not what is inside them. None for a section's row, a row `rows` does not
 * hold, or a parent chain that breaks off or loops.
 */
export declare function graphNameOf(rows: readonly TreeTableRow[], rowId: string): string | undefined;
/**
 * The entry the row `rowId` is in (itself, for an entry): its name, and its section's label where
 * it is under one (a MAT-file's variables are under none). None for a section's own row, a row
 * `rows` does not hold, or a parent chain that breaks off or loops.
 */
export declare function entryOf(rows: readonly TreeTableRow[], rowId: string): {
    entry: string;
    section?: string;
} | undefined;
/**
 * The row ShellHandle.openAt selects for `entry`. With `section`: the first top-level entry
 * labelled `entry` under the first section row labelled `section`. Without: selectByName's order
 * (connectTable.ts:517): an entry, then any row, then a row whose `_blockKey` it is; never a
 * section's own row, which is no entry. None for '' or no match.
 */
export declare function rowOfEntry(rows: readonly TreeTableRow[], entry: string, section?: string): TreeTableRow | undefined;
/**
 * The entry a link to the row `rowId` names (Copy Link to Entry), so that openAt (rowOfEntry)
 * selects that row again. A block in a subsystem goes by its key, `{ entry: '8' }`: core lists a
 * model's blocks flat under its section, so the name it shows may be another block's too (a Gain in
 * the root system, one in a subsystem), and a block nested under its subsystem's row would be named
 * by the subsystem. That holds where the key selects the same row (no row is labelled with it).
 * Any other row goes by entryOf: its entry's name, and its section's label where it has one.
 */
export declare function linkedEntryOf(rows: readonly TreeTableRow[], rowId: string): {
    entry: string;
    section?: string;
} | undefined;
