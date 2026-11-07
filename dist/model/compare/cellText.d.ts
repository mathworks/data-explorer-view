import type { TreeTableRow } from '../rows/tableRow.js';
/**
 * The text `row` shows in `column`, as `<dex-tree-table>` reads it to search and sort: Name its
 * label; a cell its string or its `text`; Data Type with its qualifier (`prefix`), its links' or its
 * parameter links' texts joined as the table joins them; Description '' where the object has none
 * (`_descriptionApplies: false`); anything else '' for no cell. (Usage's link groups are not read:
 * no compare reads that column.)
 */
export declare function cellTextOf(row: TreeTableRow, column: string): string;
/**
 * Whether two cells' texts say the same: the same text, or both MATLAB numeric literals of one
 * shape (a scalar, `[1 2; 3 4]`, `[1, 2, 3]`, `[]`, `Inf`, `NaN`, `1+2i`) whose elements differ by
 * at most `tolerance` (default 0: equal as doubles, so `1` and `1.0` are the same). NaN is NaN;
 * Inf is only Inf of its sign; an element written with more than 15 significant digits is compared
 * by its text (a double would round an int64). Anything that is not such a literal compares as text.
 */
export declare function sameCellText(a: string, b: string, tolerance?: number): boolean;
