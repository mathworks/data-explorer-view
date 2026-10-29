import { RowCellPool } from 'data-explorer-core';
import { type RowPlan } from './lazyRows.js';
import { type ClipMark } from './rowStamp.js';
import type { TreeTableRow } from './tableRow.js';
export declare const COLUMNS: string[];
export declare const COLUMN_LABELS: Record<string, string>;
export declare const COLUMN_GROUPS: Record<string, string>;
export declare const PROJECT_COLUMNS: string[];
export declare const PROJECT_COLUMN_LABELS: Record<string, string>;
export { clipMarkKey, splitClipMarkKey, type ClipMark } from './rowStamp.js';
/** The rows for a sectioned tree, plus what the plan held back (for the banner). */
export interface SectionedRows {
    rows: TreeTableRow[];
    plan: RowPlan;
}
/**
 * Rows for a whole sectioned tree (dictionary, model, project), within `budget`.
 *
 * ONE PLAN OVER EVERY ENTRY OF EVERY SECTION, not one plan per section. That is what
 * makes the first level of the plan "every entry name in the file" — the rule this
 * exists to serve is that the NAMES are complete and the deep values may wait, and a
 * per-section plan would instead spend the budget on section 1's depth and leave
 * section 9's entries unnamed. Entries are planned as a flat root list and put back
 * under their own section by `PlannedRow.root`.
 *
 * Section headers are not in the plan — they are structure, not data, and a file whose
 * sections alone exceeded the budget would have nothing worth showing — so the plan is
 * given `budget - sections.length` and the headers are emitted unconditionally. Without
 * that subtraction the levels under the names could take a payload past the budget.
 * The names themselves are never cut: a file with more entries than the budget gets a
 * row for every one of them, with everything under them deferred (see planRows).
 *
 * `budget` of Infinity is the whole tree with nothing deferred, which is what every
 * caller had before this existed.
 */
export declare function buildRowsPlanned(sldd: any, modifiedNames?: Set<string>, clipMark?: ClipMark, budget?: number): SectionedRows;
/** The rows alone, unplanned — the signature every caller that cannot answer a fetch uses. */
export declare function buildRows(sldd: any, modifiedNames?: Set<string>, clipMark?: ClipMark): TreeTableRow[];
/**
 * The rows under one node, within `budget` — the answer to a `requestChildren` on a
 * sectioned source.
 *
 * The same walk as the payload's from a different root, which is the whole reason the
 * per-node work lives in `plannedRow`: a fetched row that came out of a second emitter
 * would differ from its siblings in exactly the ways nothing checks (a missing matrix
 * stamp, an absent capability flag, a twisty that never appears). `entry` is null here
 * because a fetch only ever returns NESTED nodes — the entry row itself was delivered
 * with the payload — so there is no section reparent to do and no entry-only stamp to
 * apply, and passing null says that rather than re-deciding it per row.
 *
 * No pool: a fetch is one node's children merged into a table that already exists, so
 * there is almost nothing to share, and a pool that outlived the call to be reused by
 * the next fetch would pin the whole first build's cells forever.
 *
 * Returns the plan as the payload does. A node with more direct children than a whole
 * delivery holds (core caps numeric and string expansion at 10,000 but builds a cell's
 * children uncapped) gets a row for every child, each deferring its own, by the same
 * rule that gives a payload every name.
 */
export declare function buildChildRows(node: any, budget?: number): SectionedRows;
export declare function buildEntryRows(entry: any, sectionName: string, modifiedNames?: Set<string>, clipMark?: ClipMark, pool?: RowCellPool, budget?: number): TreeTableRow[];
