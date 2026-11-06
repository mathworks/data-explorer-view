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
