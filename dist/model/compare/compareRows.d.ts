import type { TreeTableRow } from '../rows/tableRow.js';
import type { DocumentDiff, RowDiff, SectionDiff } from './diff.js';
/** A line's mark on one side: the shape DiffMark has in <dex-tree-table> (C5), which takes it as it is. */
export interface SideMark {
    kind: 'added' | 'removed' | 'changed' | 'gap';
    /** With 'changed': the compared column keys whose cells differ. */
    columns?: readonly string[];
}
/** One line of a compare, the same on both sides: a section's heading or a row. */
export interface CompareLine {
    /** Its rows' ID on both sides: 'section:<key>' for a heading, 'line:' + RowDiff.key for a row. */
    id: string;
    /** The line it is under; null at the top. */
    parent: string | null;
    /** Its section's key. */
    section: string;
    /** For a row: its diff. */
    row?: RowDiff;
    /** For a heading: its section's diff. */
    heading?: SectionDiff;
    /** For a row: the id of its entry's line (its own, for an entry). */
    entry?: string;
    /** It differs itself: a row's status, a heading's status, is not 'same'. */
    differs: boolean;
    /** A line under it differs. */
    differsBelow: boolean;
}
/** What one table of the compare is given. */
export interface CompareSideRows {
    /** One row per line, in line order: a copy of this side's row where it has one, a gap row where not. */
    rows: TreeTableRow[];
    /** Each marked line's mark on this side, by line id. */
    marks: Map<string, SideMark>;
}
/** A diff laid out for the compare's two tables: its lines, each table's rows and marks, the changes, and the lines to open. */
export interface CompareRows {
    /** Every line drawn, parents before children, in the diff's order. */
    lines: CompareLine[];
    /** Each line by its id, for a selected or expanded row of either table. */
    byId: ReadonlyMap<string, CompareLine>;
    /** What the left table is given: a's side. */
    left: CompareSideRows;
    /** What the right table is given: b's side. */
    right: CompareSideRows;
    /** The ids of the lines that differ, in line order: what Next Change steps through. */
    changes: string[];
    /** The ids of every line a differing line is under: what to open so that every difference shows. */
    opened: string[];
}
/** How compareRows lays a diff out. */
export interface CompareRowsOptions {
    /** Leave out a line with no difference in or under it, a heading too. Default true. */
    onlyDifferences?: boolean;
}
/** Lay a diff out as the compare's lines: both tables' rows, their marks, the changes in order, and the lines to open. */
export declare function compareRows(diff: DocumentDiff, options?: CompareRowsOptions): CompareRows;
