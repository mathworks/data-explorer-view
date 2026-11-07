import type { TreeTableRow } from '../rows/tableRow.js';
import type { TableSource, TableView } from './tableSource.js';
/** A section of a document and its entries, as its table lists them. */
export interface EntrySection {
    /** Its key, as its heading row's id holds it (`section:design` → 'design'); '' for a MAT-file's variables, which have no heading. */
    key: string;
    /** Its heading as the table reads it ('Design Data'); '' for a MAT-file's. */
    label: string;
    /** Its heading row; absent for a MAT-file's. */
    heading?: TreeTableRow;
    /** Its entries: the rows right under its heading (a MAT-file's top-level rows), in the table's order, those a paint held back included. */
    entries: readonly TreeTableRow[];
}
/**
 * A document's sections and their entries: from `shown` (a view the caller already read) or from
 * `open()`, and for a heading held back (`_lazy`) none of whose rows the paint holds, `children()`
 * once. Nothing below an entry is read. Rejects as `open()` does (the table's banner text). DOM-free.
 */
export declare function readEntries(source: TableSource, shown?: TableView): Promise<EntrySection[]>;
