import { type SourceCache, type SourceFile, type SourceReader } from 'data-explorer-core';
import type { UsageSource } from '../source/workspace.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import { type BlockLink, type ParamLink, type UsageGraph } from './usageCells.js';
/** What the usage graphs are built from, as an app supplies it. */
export interface UsageInputs {
    /**
     * What the graphs read beyond the folder on disk, as one comparable string: in an editor, the
     * files open in it (sorted, so the same files in another order are the same inputs). When it
     * answers something other than it did for the graphs held, they are all dropped. A folder alone
     * answers `''`.
     *
     * Asked in the same task as `candidates()`, just before it, so the two describe one reading of
     * the inputs: `candidates()` must read what this describes before its first await.
     */
    inputsKey(): string;
    /**
     * The files a graph is built over: the folder's (the kinds a usage graph reads, core's
     * `isGraphPath`: no projects), then any open file not among them, each once, in folder order —
     * which decides which of two same-named dictionaries a name resolves to, so a file must not
     * change it by being open.
     */
    candidates(): Promise<readonly SourceFile[]>;
    /** The reader for one build's files: it answers only for them. */
    readerFor(files: readonly SourceFile[]): SourceReader;
}
/** What a UsageGraphs reads with. */
export interface UsageGraphsOptions {
    inputs: UsageInputs;
    /**
     * The cache the reads go through. Share the one the app's other folder passes read (its
     * FolderHierarchy's, a name index's), so a folder is read once for all of them. Default: one of
     * its own.
     */
    cache?: SourceCache;
}
/**
 * The usage graph for each file being viewed, built when first asked for and kept until the
 * folder changes (`invalidate()`) or the inputs do (`UsageInputs.inputsKey`). A workspace's
 * `usage` (UsageSource), and the queries and fills a host answers its tables with.
 */
export declare class UsageGraphs implements UsageSource {
    /** The cache its reads go through. */
    readonly cache: SourceCache;
    private readonly inputs;
    private readonly graphs;
    private readonly ready;
    private builtFrom;
    constructor(options: UsageGraphsOptions);
    /**
     * Drop every graph; the next query rebuilds the ones it needs.
     *
     * For when the FOLDER changes — a supported file created, deleted, or saved, or a folder
     * added. NOT on a keystroke: a graph is built from the files on disk, so an unsaved edit cannot
     * move an edge in it.
     *
     * Much cheaper than the name suggests, and deliberately so. The per-file summaries in the
     * source cache are keyed by content version and SURVIVE this, so a rebuild re-stats the
     * candidates, re-reads only the file that actually changed, and refills the edge maps — it does
     * not re-parse the folder. Which is what makes throwing all the graphs away on any change the
     * right trade instead of an incremental-merge problem.
     */
    invalidate(): void;
    /**
     * The graph that can answer for the file at `forUri`, building it if needed.
     *
     * Keyed by that uri because the SCOPE is: a graph built for one dictionary read the models that
     * reach that dictionary, and is not entitled to answer for a file it therefore never
     * summarised.
     *
     * Every query below reaches this itself, so a caller only needs it to PREBUILD — which is what
     * `annotateDataRowsNow` requires, since it cannot await.
     */
    ensure(forUri: string): Promise<UsageGraph>;
    /** The workspace's question (UsageSource): `ensure`. */
    graphFor(uri: string): Promise<UsageGraph>;
    /** Blocks that use the variable `varName` of the source at `sourceUri` (a data file, or a model for its own workspace). */
    blocksUsingVariable(sourceUri: string, varName: string): Promise<BlockLink[]>;
    /**
     * Resolved parameter links for one block of the model at `modelUri`. `blockKey` is the block's
     * SID (its name only for a file written before SIDs existed), never the Name label.
     */
    paramLinksForBlock(modelUri: string, blockKey: string): Promise<ParamLink[]>;
    /**
     * A data view's Usage column (a dictionary's, a MAT-file's): every variable row the graph has an
     * answer for, filled with the blocks that use it (annotateVariableRows).
     */
    annotateDataRows(sourceUri: string, rows: TreeTableRow[]): Promise<boolean>;
    /**
     * The same fill, without the await — or false if it cannot be done that way.
     *
     * For a caller that cannot afford a promise: a repaint posted from a promise callback waits for
     * the next yield, and a host that paints a long synchronous scan BEFORE its next yield would show
     * it that much later. After the first query there is nothing left to wait for, so this fills from
     * the built graph, and answers false while there is none, which is the caller's cue to take the
     * slow path.
     *
     * The graph asked for is `sourceUri`'s own, never "whichever one is built": another file's
     * graph was scoped to that file and may not have summarised the models that use this one, so
     * answering from it would silently empty cells that do have usages.
     */
    annotateDataRowsNow(sourceUri: string, rows: TreeTableRow[]): boolean;
    /**
     * A model view's Usage column: block rows take their resolved parameter links, and the model's
     * own workspace variables the blocks that use them (annotateModelViewRows).
     */
    annotateModelRows(modelUri: string, rows: TreeTableRow[]): Promise<boolean>;
    /**
     * Drop the graphs if the inputs they read are not the inputs now.
     *
     * The graphs' inputs are the folder plus whatever else the app reads (an editor's open files),
     * and this is the only thing that knows which inputs those were — so it decides this, rather
     * than an event handler guessing. In an editor a tab going DIRTY fires the same event as one
     * opening, and invalidating on that would throw the graph away after every edit, to rebuild it
     * byte for byte.
     */
    private dropIfInputsChanged;
    private build;
}
