import { type RawView } from './rawView.js';
/**
 * What the Raw pane says for a row whose raw form core refused to write (its XML, its record): not
 * NO_RAW_DATA, which is a row that has none, so that a failure does not pass for an empty answer.
 */
export declare const RAW_NOT_WRITTEN = "This row's raw form could not be written.";
/**
 * A document's tree, as `rawOfRow` reads it: a read-only document's (source/workspace.ts), or an
 * editing engine's view's (edit/jsonView.ts, edit/binaryView.ts, edit/matEngine.ts), each of which
 * answers `TableSource.raw` through it.
 */
export interface RawTree {
    /**
     * The document's root node, as the document stands now: the tree its table's rows are of. Asked
     * first, so a source that builds its tree when asked (an edited JSON dictionary's, from its text)
     * has built it before `find` is. A throw is no tree, and nothing to show.
     */
    root(): unknown;
    /** The ids that name the file itself: its uri, and the srcId its tree is registered under. */
    readonly fileIds: readonly string[];
    /** The node a row id names in the tree, or null. */
    find(rowId: string): unknown;
}
/** How a row's raw form is asked for: `TableSource.raw`'s options. */
export interface RawOptions {
    /**
     * The record a save writes, as JSON, in place of the bytes a MAT-file's or a Model Workspace's
     * variable was read from: what the command window's json prints, where the Raw pane dumps the
     * bytes. A variable of more than HEX_LIMIT bytes, whose record would run to many times their
     * size, and one whose record core will not write, still answer the bytes. Default false.
     */
    record?: boolean;
}
/**
 * The raw form of the row `rowId` of the document `tree` is of, for the Raw pane: see the head
 * of this file for each kind of row. Nothing to show for a row that is not there (NO_RAW_DATA),
 * and RAW_NOT_WRITTEN where core throws as it writes one.
 */
export declare function rawOfRow(tree: RawTree, rowId: string, options?: RawOptions): RawView;
