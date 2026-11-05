import type { Session } from 'data-explorer-core';
import { type SectionRule } from '../actions/sectionRules.js';
import { type SavedStatus } from '../rows/matRowBuilder.js';
import type { RowPlan } from '../rows/lazyRows.js';
import { type PlanOptions } from '../rows/rowPlanner.js';
import type { TreeTableRow } from '../rows/tableRow.js';
export interface EngineFile {
    /** What the file is held as, where a save answers no bytes of it: 'a MAT-file'. */
    readonly held: string;
    /**
     * Register `bytes` under `srcId` in `session`: the root registered, and the node whose children
     * are the variables every gesture edits. Throws why the file does not read.
     */
    register(session: Session, srcId: string, bytes: ArrayBuffer, path: string): {
        root: any;
        variables: any;
    };
    /** The section a variable sits in, as the table's ids, the paste rules and the clipboard key it. */
    readonly section: string;
    /** The id core is asked to add a variable to and to paste into (addEntryRefusal, pasteEntries). */
    target(srcId: string, variables: any): string;
    /** The section core's addEntry is asked to add into. */
    readonly addSection: string;
    /**
     * The sections beside the variables that the gallery adds an entry to, by key, each where core
     * says it takes one now: a model's configuration sets (`config`). Absent: none.
     */
    addSections?(root: any): readonly string[];
    /** The rows of the whole table, within `budget`, and what was held back. */
    payload(name: string, root: any, variables: any, budget: number, opts: PlanOptions): {
        rows: TreeTableRow[];
        plan: RowPlan;
    };
    /** The rows of one variable, its own row first: what a repaint of it splices in. */
    variableRows(variable: any, budget: number, saved: SavedStatus, opts: PlanOptions): TreeTableRow[];
    /** Where a paste or a drop into the table lands, and what it admits. */
    rules(root: any, variables: any, label: string): SectionRule[];
    /**
     * Where a paste or a drop onto `rowId` lands, where it is a section beside the variables: its
     * name and the id core is asked to paste into (a model's configuration sets). Absent, or null:
     * the variables (`section`, `target`).
     */
    pasteTarget?(root: any, rowId: string): {
        sectionName: string;
        containerId: string;
    } | null;
    /**
     * The nodes beside the variables that a move into another document takes out of this one, each
     * known by the token its copy carried (a model's configuration sets). Absent: none.
     */
    movedOut?(root: any): readonly any[];
    /** Whether the variables take no edit at all. */
    readOnly(variables: any): boolean;
    /**
     * Why the file takes no edit, for its banner, or undefined. `serialize` is the engine's save, whose
     * refusal says why in core's words.
     */
    readOnlyWhy(name: string, variables: any, serialize: () => Uint8Array): string | undefined;
}
/** A MAT-file: the file's own variables, a table of them alone, one section, the file. */
export declare const MAT_FILE: EngineFile;
