import { type ClipMark } from './rowBuilder.js';
import { type SavedStatus } from './matRowBuilder.js';
import type { RowPlan } from './lazyRows.js';
/** What the payload needs beyond the tree — the stamps only the host can answer. */
export interface PlanOptions {
    /** Entry names that differ from the last save, for the Modified column. */
    modifiedNames?: Set<string>;
    /**
     * Entries on the host clipboard, for the cut/copied affordance — keyed (section, name) by
     * both planners, with '' for the section of a MAT-file's variable, which has none.
     */
    clipMark?: ClipMark;
    /**
     * A MAT-file's variables that differ from the last save, for its Status column: the
     * editable view's answer (saveMarks.ts), by node. The sectioned builder's `modifiedNames`
     * is the same question for a dictionary.
     */
    savedStatus?: SavedStatus;
    /**
     * Whether a MAT-file's variables travel on the clipboard (`_canCopy`): true from the editable
     * view, absent (false) from the read-only one, which shows no menu. A dictionary's entries
     * always do, so the sectioned planner reads nothing here.
     */
    canCopy?: boolean;
}
export interface RowPlanner {
    /**
     * The whole table for `node`, planned to `budget`. The plan comes back so the caller
     * can say what it held back (`lazyRowsBanner`).
     */
    payload(node: any, budget: number, opts?: PlanOptions): {
        rows: any[];
        plan: RowPlan;
    };
    /**
     * The rows under one node, for a `requestChildren`. The same shape as `payload`,
     * including the plan: a fetch can lose names too (a node whose own children outnumber
     * a whole delivery), and the half that reports that must not depend on which path the
     * rows came down. `opts` is the payload's, so a fetched row is stamped as its siblings
     * were (a MAT-file's `canCopy`); the sectioned planner needs nothing from it.
     */
    children(node: any, budget: number, opts?: PlanOptions): {
        rows: any[];
        plan: RowPlan;
    };
}
/**
 * The planner for a file, by name.
 *
 * One branch, on the one distinction that matters to row shape: whether the tree has a
 * section layer. `.sldd`, `.slx`, `.mdl` and `.prj` all do and all share a planner —
 * they already shared `buildRows`, and giving each its own here would invent three
 * chances to drift where there is one rule.
 */
export declare function rowPlannerFor(name: string): RowPlanner;
