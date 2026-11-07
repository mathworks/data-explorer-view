import type { TreeTableRow } from '../rows/tableRow.js';
import type { DiffSide } from './readSide.js';
/** How a row or an entry stands: only in b, only in a, in both with a difference, in both alike. */
export type DiffStatus = 'added' | 'removed' | 'changed' | 'same';
/** One difference of a row: a column its table shows, or (with `properties`) a property of its inspector page. */
export interface PropertyDiff {
    /** The column's key ('Value', 'DataType', 'Min', …), or `inspector:<group>/<name>` for an inspector property. */
    column: string;
    /** What the user reads it as: the column's heading ('Data Type'), or the property's name ('StopTime'). */
    label: string;
    /** An inspector property's group title ('Solver'); absent for a column. */
    group?: string;
    /** Its text in a (cellTextOf, or the page's value); '' where a has none. */
    before: string;
    /** Its text in b; '' where b has none. */
    after: string;
}
/** A row of either document, matched with the other's by its section and its name path. */
export interface RowDiff {
    /**
     * Unique in the diff, and the same in a diff of the two documents after an edit while the row's
     * path holds: for a view to key its lines by. Only `[A-Za-z0-9%~/._!*'()-]`.
     */
    key: string;
    /** The names it is matched by, from its entry down: each row's Name, a block's path (`Controller/Gain`). */
    path: readonly string[];
    /** Its own cells' (and with `properties` an entry's page's) standing; a difference under it is `changedBelow`. */
    status: DiffStatus;
    /** Its row in a; absent for an added row. */
    a?: TreeTableRow;
    /** Its row in b; absent for a removed row. */
    b?: TreeTableRow;
    /** What differs, columns first in DocumentDiff.columns' order, then page properties; empty unless `changed`. */
    properties: readonly PropertyDiff[];
    /** The rows under it, matched the same way, in the same order rule. */
    children: readonly RowDiff[];
    /** Whether a row under it is not `same`. */
    changedBelow: boolean;
    /**
     * An array whose Value is a summary (`<1x20000 double>`, `_hasEditText`) on either side with fewer
     * element rows under it than elements (core makes at most 10,000): compared only as far as its rows go.
     */
    partial?: true;
}
/** Entries counted: a row right under a section heading, or a top-level row of a document with no sections. */
export interface DiffCounts {
    added: number;
    removed: number;
    /** In both, the entry's own cells or a row under it differing. */
    changed: number;
    same: number;
}
/** A section of either document, matched by its key. */
export interface SectionDiff {
    /** Its key, as its heading row's id holds it (`section:design` → 'design'); '' for a MAT-file's variables, which have no heading. */
    key: string;
    /** Its heading as the table reads it ('Design Data'); '' for a MAT-file's. */
    label: string;
    /** 'added': only b has the heading; 'removed': only a; 'same': both (whatever its rows hold). */
    status: 'added' | 'removed' | 'same';
    /** Its heading row in a, if a has one. */
    a?: TreeTableRow;
    /** Its heading row in b, if b has one. */
    b?: TreeTableRow;
    /** Its entries, each with the rows under it. */
    rows: readonly RowDiff[];
    counts: DiffCounts;
}
/** Two documents compared: the result of diffSides, diffDocuments and diffFiles. */
export interface DocumentDiff {
    /** a's uri (DiffSide.docUri). */
    a: string;
    /** b's uri. */
    b: string;
    /** The column keys compared, a's order then b's own (DiffOptions.columns, or every column but DIFF_SKIPPED_COLUMNS). */
    columns: readonly string[];
    /** Each compared column's heading, a's over b's. */
    columnLabels: Readonly<Record<string, string>>;
    /** Whether entries' pages were compared: asked (`properties`) and read on both sides. */
    propertiesCompared: boolean;
    /** The sections, a's order, b's own after their nearest preceding match (the row order rule). */
    sections: readonly SectionDiff[];
    /** Every section's counts, summed. */
    counts: DiffCounts;
}
/** How two sides are compared. */
export interface DiffOptions {
    /** The column keys compared. Default: every column either side's table has, but DIFF_SKIPPED_COLUMNS. */
    columns?: readonly string[];
    /** Compare entries' inspector pages too (the sides must be read with `properties`); a property a compared column shows is not compared twice. Default false. */
    properties?: boolean;
    /** Two numbers this close are the same (sameCellText). Default 0. */
    tolerance?: number;
    /** Only the sections whose key or label is one of these, ignoring case (the CLI's `--section`). Default every one. */
    sections?: readonly string[];
}
/** What a compare does not compare by default: the key (Name), what the folder says (Usage), what a save says (Status), what the class says (Kind), and the stamps every edit rewrites. */
export declare const DIFF_SKIPPED_COLUMNS: readonly string[];
/** Compare two read sides. Synchronous and pure: the same sides give the same diff. */
export declare function diffSides(a: DiffSide, b: DiffSide, options?: DiffOptions): DocumentDiff;
/** "3 changed, 1 added, 2 removed": the counts that are not 0, in that order; "No differences" for none. */
export declare function diffSummary(counts: DiffCounts): string;
