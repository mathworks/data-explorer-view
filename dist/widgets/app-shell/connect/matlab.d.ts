import type { PropertyGroup } from '../../../model/inspector/piBuilder.js';
import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { InspectorFeed } from '../../../model/source/tableSource.js';
import type { ContextMenuItem } from '../../context-menu/dex-context-menu.js';
import type { PaletteCommand } from '../modules/dex-command-palette.js';
import type { MatlabEvaluation, MatlabStatus, ShellCommand, ShellMatlab } from './types.js';
/** The MATLAB commands a row or a file can take (every `matlab-*` ShellCommand but Connect). */
export type MatlabAction = 'matlab-open' | 'matlab-update-diagram' | 'matlab-evaluate' | 'matlab-to-workspace' | 'matlab-from-workspace' | 'matlab-data-explorer';
/** The six, in the order a menu offers them. */
export declare const MATLAB_ACTIONS: readonly MatlabAction[];
/** Whether `id` is one of the six (a menu item's, or a command's). */
export declare function isMatlabAction(id: string): id is MatlabAction;
/** Whether `id` is one of a MATLAB's commands, Connect to MATLAB… among them, which a palette row or a native menu may send. */
export declare function isMatlabCommand(id: string): id is ShellCommand;
/**
 * What the status bar says of `status`, and its tooltip: nothing while off. A MATLAB busy running
 * something answers once it is done: the bar says so, rather than leave a command that waits for it
 * looking like a link that is gone.
 */
export declare function matlabLabel(status: MatlabStatus | undefined): {
    label: string;
    title: string;
};
/** What a tab's row (or the tab's file, with no row) is to MATLAB. */
export interface MatlabTarget {
    /** The file, by the path its tab was opened with. */
    file: string;
    /** The file's name (`plant.sldd`), and a model's name (`plant`), for what the shell says. */
    fileName: string;
    modelName?: string;
    kind: 'model' | 'dictionary' | 'mat';
    /** The tab holds unsaved edits: MATLAB reads and writes the saved file, so Send and Get wait for a save. */
    dirty: boolean;
    /** The document's uri and the row's id, where the answer of an evaluation is kept. */
    docUri: string;
    rowId?: string;
    /** A block row's path below the model's root (its `_blockPath`). */
    block?: string;
    /** A top-level entry: a dictionary's or a model workspace's (its section's name), a MAT-file's variable (section ''). */
    entry?: {
        name: string;
        section: string;
    };
    /** The row's value as its Value cell shows it, when MATLAB can evaluate it (not empty, not a summary such as `<10x10 double>`). */
    value?: string;
}
/** `tab`'s row `rowId` (null: the file) as MATLAB takes it; undefined for a tab of no model, dictionary or MAT-file (a project), or none read yet. */
export declare function matlabTargetOf(tab: {
    path: string;
    name: string;
    dirty?: boolean;
    doc?: {
        kind: string;
        uri: string;
    };
}, rows: readonly TreeTableRow[], rowId: string | null): MatlabTarget | undefined;
/** One command offered: its label, and why it waits, when it does. */
export interface MatlabOffer {
    id: MatlabAction;
    label: string;
    icon?: string;
    disabled?: boolean;
    reason?: string;
}
/** The label of `id` while `status` holds: a MATLAB with no Data Explorer opens a file in Model Explorer. */
export declare function matlabActionLabel(id: MatlabAction, status: MatlabStatus | undefined): string;
/** What MATLAB offers `target` while `status` holds: nothing unless connected. */
export declare function matlabOffers(status: MatlabStatus | undefined, target: MatlabTarget | undefined): MatlabOffer[];
/** The offers as a menu's items after a separator; none for no offer. */
export declare function matlabMenuItems(offers: readonly MatlabOffer[]): ContextMenuItem[];
/** The palette's MATLAB group: Connect to MATLAB… (where the host has a MATLAB), then the offers. */
export declare function matlabPaletteCommands(hasMatlab: boolean, offers: readonly MatlabOffer[]): PaletteCommand[];
/** What a MATLAB command is carried out with. */
export interface MatlabRunContext {
    matlab: ShellMatlab;
    /** A toast and its Log line (connectShell's `say`). */
    say(level: 'info' | 'warning' | 'error', text: string, ms?: number): void;
    /** A Log line only. */
    log(level: 'info' | 'warning' | 'error', text: string): void;
    /** Keep Evaluate's answer for the target's row, for Properties. */
    evaluated(target: MatlabTarget, answer: MatlabEvaluation): void;
    /** Bring Properties forward (the `show-properties` command). */
    showProperties(): void;
}
/** Carry out `id` on `target`; never rejects (a failure is said). */
export declare function runMatlab(id: MatlabAction, target: MatlabTarget, on: MatlabRunContext): Promise<void>;
/** Evaluate's answers, by document, row and the expression asked. */
export declare class MatlabResults {
    private readonly answers;
    private readonly listeners;
    set(docUri: string, rowId: string, expression: string, answer: MatlabEvaluation): void;
    /** The answer for the row while its value is still `expression`. */
    get(docUri: string, rowId: string, expression: string): MatlabEvaluation | undefined;
    clear(): void;
    /** Hear each set and clear; returns the unsubscribe. */
    on(listener: () => void): () => void;
    private tell;
    private static key;
}
/**
 * Properties' "MATLAB" group for an answer. Its text is MATLAB's display, lines of columns laid out
 * in spaces (a matrix's), and an error's message may run to lines too: both are drawn as written
 * (`multiline`).
 */
export declare function matlabGroup(answer: MatlabEvaluation): PropertyGroup;
/**
 * `feed` with the MATLAB group after the page's own, for a row `answerFor` has an answer for. The
 * last page is sent again when `changed` tells that an answer came or went. matrix and edit pass through.
 */
export declare function withMatlabResults(feed: InspectorFeed, answerFor: (rowId: string) => MatlabEvaluation | undefined, changed: (listener: () => void) => () => void): InspectorFeed;
