import { type FileSummaries } from 'data-explorer-core';
export interface RawSource {
    uriString: string;
    path: string;
    bytes: ArrayBuffer;
}
export interface BlockLink {
    blockName: string;
    blockPath: string;
    modelName: string;
    modelUri: string;
    linkTarget: string;
}
export interface ParamLink {
    property: string;
    paramName: string;
    source: string;
    linkTarget: string;
}
/**
 * The graph over the files an app read, as the two questions the table asks of it.
 *
 * Immutable, so there is no cache inside it to go stale: whoever holds one drops the whole
 * thing when a file of the folder changes and builds another.
 */
export interface UsageGraph {
    /** Blocks that use `varName` in the source at `sourceUri` (a data file, or a model for its own workspace). */
    blocksUsing(sourceUri: string, varName: string): BlockLink[];
    /**
     * Resolved parameter links for one block of the model at `modelUri`, keyed by the
     * block's KEY — its SID, falling back to its name only for a file written before
     * SIDs existed. Not the Name label: a label is unique only within one system, and
     * a nameless block's label is the synthetic `<SID: 65>`.
     */
    paramLinks(modelUri: string, blockKey: string): ParamLink[];
}
/**
 * Build the graph from files a caller has already read.
 *
 * The srcId core answers with is our uriString, so every link target below carries a
 * FULL uri and a click resolves to an exact file even when two same-named files exist.
 * The filename is the PATH, because that is what core dispatches the kind on — and it
 * is the path rather than the uri because a uri can carry a `?query` that no test
 * should have to know about.
 */
export declare function buildUsageGraph(files: RawSource[]): UsageGraph;
/**
 * The same graph, over summaries a caller kept rather than bytes it just read.
 *
 * This is the path a document takes (core's `planSummaries`): summarising a file is what a usage
 * index costs, so the source cache keeps each file's summary and rebuilds only the edge maps when
 * its query scope changes. Core owns both halves — `summarizeFiles` and
 * `buildUsageIndexFromSummaries` — so this is the same index by the same rules, entered a
 * step later. The equality of the two entrances is pinned in usageEndToEnd.test.ts.
 */
export declare function buildUsageGraphFromSummaries(summaries: FileSummaries): UsageGraph;
/**
 * Fill the Usage cell of every variable row this workspace graph has an answer for.
 * Shared by the data view (.sldd/.mat entries) and the model view's
 * model-workspace-variable rows, so one engine settles the column in both.
 *
 * OVERWRITES a cell that is already there, which is the whole point and was the bug:
 * a row arrives from `node.toRow()` carrying core's own `UsedBy`, and that answer comes
 * from core's SESSION — the models whose editor tab happened to be resolved in this
 * window — in a shape that names the block and not the model. So whether a dictionary
 * entry read `AFRConst, AFRCheck` or
 * `AFR(EngineLoop), AFRMonitor(EngineLoop), MixTarget(EngineLoop), AFRConst(FuelPath),
 * AFRCheck(FuelPath)` depended on which models the user had opened — and merely
 * CLICKING a Usage link registered the model it pointed at, degrading the very cell it
 * was clicked from for as long as that model stayed registered. Two engines answering one
 * column is the defect; this makes the workspace graph the one that does.
 *
 * A row the graph has nothing for is LEFT ALONE rather than emptied: absence here is not a
 * claim that a variable is unused — the same rule core's `_usedByCell` applies. This used to
 * keep one more answer than the graph has: a model opened from outside the workspace and
 * since closed, which is neither found on disk nor an open tab, but whose registration the
 * session kept for the life of the window. A closed tab now releases its registration
 * (SlddModel's view count), so that credit goes when the model's tab does, and what the
 * session can still add is what an open tab registered — which the graph reads as well.
 */
export declare function annotateVariableRows(sourceUri: string, rows: {
    Name?: {
        label?: string;
    };
    UsedBy?: unknown;
}[], graph: UsageGraph): boolean;
/**
 * Fill the Usage column of a MODEL view's rows: block rows take their resolved parameter
 * links (`Gain=Kp (dict.sldd)`), and the model-workspace variable rows go through
 * `annotateVariableRows` above, so a variable's usage reads the same everywhere — bar the
 * `(model)` qualifier, which a usage inside the open model has no work for.
 *
 * Lives here, beside `annotateVariableRows`, because it is a policy worth testing over
 * real bytes: whoever fills a table (the extension's usageGraph.ts, usageFill.ts) only awaits
 * the graph and calls this.
 *
 * A block row is joined by its `_blockKey` — the block's SID, which core's
 * `ModelBlockNode.toRow` publishes for exactly this purpose — and NEVER by the Name
 * label. A label is unique only inside one system, so two `Gain` blocks in different
 * subsystems would take each other's parameters; and a block Simulink recorded with no
 * name at all (SID 65 of a shipped Simulink demo model, whose `Name` attribute is a
 * lone line break) has the synthetic label `<SID: 65>`, which matches no block in core's
 * index and left the cell empty. Unlike a variable row, a block row IS emptied when the
 * graph has nothing for it: the row came from this same model's parse, so the graph has
 * seen the block, and "no parameters resolved" is an answer about it rather than a gap in
 * what was read.
 */
export declare function annotateModelViewRows(modelUri: string, rows: {
    Name?: {
        label?: string;
    };
    UsedBy?: unknown;
    _isBlockRow?: boolean;
    _blockKey?: string;
}[], graph: UsageGraph): boolean;
