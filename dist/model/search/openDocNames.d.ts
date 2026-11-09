import type { TreeTableRow } from '../rows/tableRow.js';
import type { DocKind } from '../source/readDocument.js';
import type { NameRecord } from './nameExtract.js';
/** What a record of an open document carries beyond the index's: none, or its row's cells. */
export interface NamesOfRowsOptions {
    /**
     * Each record also carries what its row shows of the entry, where the row has it: its Value,
     * Data Type and Class cells' text (`value`, `dataType`, `className`), which a ranked search
     * matches on and shows. Default false: the records are exactly the folder index's.
     */
    cells?: boolean;
}
/**
 * The name records of an open document, from the rows its table shows (a TableView's `rows`):
 * the records the folder's index gives the same file (namesFromSldd, namesFromMat, namesFromSlx),
 * each named after `sourceUri`. `kind` is the document's (`Doc.kind`); a project has none. A row
 * with no name gives none, as the index drops an entry with none, and so does a block row with no
 * key, which a search could not reveal. With `cells`, each also carries its row's cells.
 */
export declare function namesOfRows(rows: readonly TreeTableRow[], sourceUri: string, kind: DocKind, options?: NamesOfRowsOptions): NameRecord[];
