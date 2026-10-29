import { type RowPlan } from './lazyRows.js';
import { type ClipMark } from './rowStamp.js';
/** Rows for a .mat subtree, plus what the plan held back (for the banner). */
export interface MatRows {
    rows: any[];
    plan: RowPlan;
}
/**
 * How each variable differs from the file as last saved, for the Status column of the editable
 * view (saveMarks.ts): by node, because two variables of a file can share a name. Absent, a row
 * shows core's own status, as the read-only view always has.
 */
export type SavedStatus = ReadonlyMap<unknown, string>;
/**
 * What a MAT-file's rows take on top of the Status column: the stamps a dictionary's rows
 * have had all along (rowStamp.ts), which the editable view passes on every build.
 */
export interface MatStampOptions {
    /**
     * The variables on the host clipboard, for the cut/copied affordance. Keyed ('', name): a
     * MAT-file has no sections, and its clipboard and drag items carry '' as their source
     * section, so the one key spelling serves both formats.
     */
    clipMark?: ClipMark;
    /**
     * Whether a variable travels on the clipboard (`_canCopy` on every row). True from the
     * editable view, whose variables copy, cut, paste and drag as a dictionary's entries do.
     * Absent is false: the read-only view shows no menu, so it reads nothing here.
     */
    canCopy?: boolean;
}
/**
 * Rows for everything under `node`, within `budget`.
 *
 * The whole builder. A `.mat`'s variables ARE its root node's children and a
 * deferred row's children are its node's children, so the initial build and the
 * answer to a `requestChildren` are the same walk from a different node — written
 * once, because this repo's recurring defect is one rule with two implementations.
 * The node's own row is never emitted: at the top there is nothing to show for the
 * file itself, and on an expansion the table already holds the row that was clicked.
 */
export declare function buildMatRowsPlanned(node: any, budget?: number, saved?: SavedStatus, opts?: MatStampOptions): MatRows;
/**
 * The rows of ONE variable, its own row first, within `budget`: what the editable view repaints
 * after an edit of that variable, spliced over the run the table holds (`updateEntryRows`). The
 * same walk as the payload's, from the variable instead of from the file, so a repainted
 * variable's rows are the rows the next whole payload would hold for it — given the same `opts`.
 */
export declare function buildMatVariableRows(variable: any, budget?: number, saved?: SavedStatus, opts?: MatStampOptions): any[];
/** The rows alone, for every caller that cannot answer a fetch and so passes no budget. */
export declare function buildMatRows(matNode: any, budget?: number): any[];
