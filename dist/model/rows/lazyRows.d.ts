import type { WarningBanner } from './parseWarnings.js';
/**
 * The rows one request may deliver, unless its top level alone is wider (see
 * levelsThatFit): the names always come, and the budget decides how deep under them.
 *
 * The same number as the payload cap, deliberately: both answer "how much can cross
 * the boundary at once", and the cap is the one that was measured against V8's limit
 * (34.5 MiB and 58 ms to serialize at 100,000 rows). A second, smaller budget here
 * would be a second opinion about the same constraint.
 */
export declare const LAZY_ROW_BUDGET = 100000;
/** One node to build a row for, and whether its children came with it. */
export interface PlannedRow {
    node: any;
    /**
     * True when this node HAS children and none of them is in this delivery. The row
     * gets a twisty that fetches rather than expands (see stampLazy).
     */
    deferred: boolean;
    /**
     * Which of the plan's roots this node descends from (its own index, for a root).
     *
     * Carried because the sectioned builder plans EVERY entry of every section in one
     * call — that is what makes "all the names" one level rather than one level per
     * section — and then has to put each row back under its own section header. The
     * plan is contiguous per root, so this could be re-derived by watching for the next
     * root to come past; an index cannot be subtly wrong about it.
     */
    root: number;
}
export interface RowPlan {
    /** Nodes to build rows for, in depth-first pre-order: every parent before its children. */
    planned: PlannedRow[];
    /** How many of them have children still to fetch. Zero means this is the whole tree. */
    deferred: number;
    /**
     * Roots with no row at all. Always 0: every root is planned, however many there are
     * (see planRows).
     *
     * A top level wider than the budget used to be cut at the budget, and this counted
     * the names that got no row, for the banner and for the table's own note on a fetch
     * (`childRows.truncated`). The field stays so that message keeps its shape.
     */
    truncated: number;
}
/**
 * How many levels of `roots` and their descendants fit in `budget` rows, counting
 * the roots themselves as level 1.
 *
 * Always at least 1: the top level is never truncated, even when it alone exceeds the
 * budget. Then every root is delivered and everything below them is deferred. That
 * happens on the initial build of a file with more names than the budget (the 138 MB
 * bench dictionary has 291,564 entries), and on an expansion of an uncapped cell (core
 * caps numeric and string element expansion at 10,000, cells not at all — see
 * MatlabVariableNode._buildCellChildren). The names come first, so none of them is left
 * without a row; such a payload is bounded by the file rather than by the budget, which
 * is what BinaryEditorProvider's fallback to the cap is for.
 *
 * Counts the next level's WIDTH before materializing it, so a level that does not
 * fit is never built as a list.
 */
export declare function levelsThatFit(roots: any[], budget: number): number;
/**
 * Which nodes to build rows for, and which of them are the frontier.
 *
 * PRE-ORDER, not level order, even though the budget is decided by level. Row order
 * does not decide display order — the webview rebuilds the tree from each row's
 * `parent` — but it does decide every rule that reads the array linearly: rowCap's
 * prefix integrity, the contiguous per-entry run `spliceEntryRows` walks, and the
 * order a reader sees in a test. Pre-order is what all of those already assume, so
 * the budget changes WHICH rows are built and nothing else about them.
 *
 * `budget` of Infinity plans the whole tree with nothing deferred, which is the
 * behaviour every caller had before this existed.
 */
export declare function planRows(roots: any[], budget?: number): RowPlan;
/**
 * Mark a row whose children were held back.
 *
 * The flag's PRESENCE is the decision, exactly like `_matrix`: the table renders a
 * twisty for a row that has no delivered children because of it, and asks the host
 * for those children when the twisty is used. One place spells the field name, so
 * the webview's reader and the host's writer cannot drift.
 */
export declare function stampLazy<T extends object>(row: T, deferred: boolean): T;
/**
 * The banner for a payload that deferred something, folding in whatever the parse
 * already had to say.
 *
 * Says the two things the user cannot work out from the rows in front of them: that
 * the file is not all here, and that the search box only sees what is. The second is
 * the real cost of this design — a filter is applied in the webview, over the rows it
 * holds — and leaving it unsaid would make a search that finds nothing read as a
 * broken table rather than a short one.
 *
 * Unlike rowCapBanner this does NOT name a total, because nothing counted one: the
 * whole point of the plan is to stop walking at the budget. It names the rows that
 * can still grow instead, which is the number the user can act on.
 *
 * Nothing deferred gives the parse's own banner back unchanged — so a file under the
 * budget shows exactly the banner it showed before this existed, or none. That is also
 * what lets `rowCapBanner` compose over this one in the read-only view's fallback
 * (BinaryEditorProvider), where a payload too large to post is cut to the cap: there
 * the cut leads, because rows that are not in the view at all are the bigger news.
 */
export declare function lazyRowsBanner(plan: Pick<RowPlan, 'deferred'> | undefined, parse: WarningBanner | undefined): WarningBanner | undefined;
