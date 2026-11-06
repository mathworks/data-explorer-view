import type { TreeTableRow } from '../rows/tableRow.js';
import type { DocKind } from '../source/readDocument.js';
import type { NameRecord } from './nameExtract.js';
/**
 * The name records of an open document, from the rows its table shows (a TableView's `rows`):
 * the records the folder's index gives the same file (namesFromSldd, namesFromMat, namesFromSlx),
 * each named after `sourceUri`. `kind` is the document's (`Doc.kind`); a project has none. A row
 * with no name gives none, as the index drops an entry with none, and so does a block row with no
 * key, which a search could not reveal.
 */
export declare function namesOfRows(rows: readonly TreeTableRow[], sourceUri: string, kind: DocKind): NameRecord[];
