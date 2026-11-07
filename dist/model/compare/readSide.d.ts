import type { PropertyGroup } from '../inspector/piBuilder.js';
import type { TableSource, TableView } from '../source/tableSource.js';
import type { TreeTableRow } from '../rows/tableRow.js';
/** One side of a compare: every row of a document (none held back), and its table's columns. */
export interface DiffSide {
    /** Its uri (TableView.docUri). */
    docUri: string;
    /** Every row, parents before children; none `_lazy` (readDiffSide asked `children` for them). */
    rows: readonly TreeTableRow[];
    /** Its table's column keys, in their default order (TableView.columns). */
    columns: readonly string[];
    /** Each column's heading (TableView.columnLabels). */
    columnLabels: Readonly<Record<string, string>>;
    /**
     * Each entry's inspector page (TableSource.inspect's groups), by the entry's row id: read with
     * `properties`. An entry is a row right under a section heading, or a top-level row of a document
     * with no sections (a MAT-file's variable).
     */
    pages?: ReadonlyMap<string, readonly PropertyGroup[]>;
    /** `properties` was asked, and the side has more entries than `maxPages`: no page was read. */
    pagesSkipped?: true;
}
/** How readDiffSide reads a side. */
export interface ReadSideOptions {
    /** Read each entry's inspector page (DiffSide.pages), for DiffOptions.properties. Default false. */
    properties?: boolean;
    /**
     * The rows to start from instead of asking `open()`: what a connected table shows now (its
     * handle's `view` and its table's `rows`, the entries repainted and the children fetched since),
     * so a compare in a page reads the rows on screen. Default: `open()`'s.
     */
    shown?: {
        view: TableView;
        rows: readonly TreeTableRow[];
    };
    /**
     * The most rows a side may hold once every held-back row is fetched; past it readDiffSide rejects
     * with "<file> has more than <n> rows to compare." Default 1,000,000.
     */
    maxRows?: number;
    /** With `properties`: the most entries whose pages are read; a side with more reads none (`pagesSkipped`). Default 5,000. */
    maxPages?: number;
}
/**
 * Every row of the document `source` shows: `open()`'s (or `shown`'s) rows, then for each row held
 * back (`_lazy`) none of whose children are among them, `children()` once, the rows it answers that
 * are held back in turn; each such row then carries no `_lazy`. With `properties`, each entry's
 * `inspect()` page. Rejects as `open()` does (the table's banner text) and past `maxRows`. DOM-free:
 * runs wherever a TableSource does.
 */
export declare function readDiffSide(source: TableSource, options?: ReadSideOptions): Promise<DiffSide>;
