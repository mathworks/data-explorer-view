// Copyright 2026 The MathWorks, Inc.
// The usage graphs behind the Usage column, one per file being viewed. From the VS Code
// extension's usageGraph.ts, with what is VS Code's (its open tabs, its folder search, its file
// reads) behind UsageInputs.
//
// Resolving "which source does a block's parameter come from" is inherently cross-file: a
// param name is looked up model-workspace -> linked .sldd(s) -> linked .mat(s), first found
// wins (a workspace var SHADOWS a same-named dictionary/MAT var). So a single file cannot
// answer it.
//
// It does not take the whole FOLDER to answer it either, and assuming it did was a
// performance bug: one graph was built over every supported file in the workspace, and
// `summarizeFiles` full-parses every model in what it is given. Opening a 27 KB dictionary
// beside one 13.8 MB model therefore cost 654 ms, and nothing survived the next
// invalidation, so it cost it again. Only a MODEL can originate a usage edge, and a model
// resolves through its own chain — so the files that can change one dictionary's answers are
// the models whose chain reaches it, plus those models' chains. Core's `usageScope` picks that set
// and its `planSummaries` reads it, through the shared source cache, cheaply and once per version.
//
// So there is one graph per file being VIEWED rather than one for the folder. The graphs
// differ in which files they were built over, never in what they say about a file: the scope
// is chosen to give the same answers the whole folder gives, which is what makes it safe and
// is pinned end to end in usageScopeEquality.test.ts.
//
// This module does the bookkeeping and NOTHING else. The reading and caching is core's source
// cache, the graph itself is core's (`buildUsageIndexFromSummaries`, tested there against real
// MATLAB-written files), and the cell shaping is usageCells.ts. All navigation link targets carry
// FULL uriStrings (not basenames), so a click resolves to an exact file even when two same-named
// files exist.
import { newSourceCache, planSummaries } from 'data-explorer-core';
import { annotateModelViewRows, annotateVariableRows, buildUsageGraphFromSummaries, } from './usageCells.js';
/**
 * The usage graph for each file being viewed, built when first asked for and kept until the
 * folder changes (`invalidate()`) or the inputs do (`UsageInputs.inputsKey`). A workspace's
 * `usage` (UsageSource), and the queries and fills a host answers its tables with.
 */
export class UsageGraphs {
    constructor(options) {
        // One graph per file queried, in flight...
        this.graphs = new Map();
        // ...and the same graphs once they exist, reachable WITHOUT an await — see annotateDataRowsNow.
        // Two maps rather than one of pairs because that IS the distinction: a key in `graphs` alone
        // means a build is running, and the synchronous path must not mistake one for an answer.
        // Cleared together.
        this.ready = new Map();
        // The inputs the graphs held were built from (UsageInputs.inputsKey).
        this.builtFrom = null;
        this.inputs = options.inputs;
        this.cache = options.cache ?? newSourceCache();
    }
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
    invalidate() {
        this.graphs.clear();
        this.ready.clear();
        this.builtFrom = null;
    }
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
    ensure(forUri) {
        this.dropIfInputsChanged();
        const hit = this.graphs.get(forUri);
        if (hit)
            return hit;
        // ONE reading of the inputs, both recorded and built from: the key, then the candidates read
        // in the same task (see UsageInputs.inputsKey).
        this.builtFrom = this.inputs.inputsKey();
        const promise = this.build(forUri).then((graph) => {
            // Only if this build is still the current one. An invalidation while it was running
            // cleared `graphs`, and a graph built from files that have since changed must not be
            // published into `ready`, where the synchronous path would answer from it.
            if (this.graphs.get(forUri) === promise)
                this.ready.set(forUri, graph);
            return graph;
        });
        this.graphs.set(forUri, promise);
        // A build that failed is not kept: the next ask builds again.
        promise.catch(() => {
            if (this.graphs.get(forUri) === promise)
                this.graphs.delete(forUri);
        });
        return promise;
    }
    /** The workspace's question (UsageSource): `ensure`. */
    graphFor(uri) {
        return this.ensure(uri);
    }
    /** Blocks that use the variable `varName` of the source at `sourceUri` (a data file, or a model for its own workspace). */
    async blocksUsingVariable(sourceUri, varName) {
        return (await this.ensure(sourceUri)).blocksUsing(sourceUri, varName);
    }
    /**
     * Resolved parameter links for one block of the model at `modelUri`. `blockKey` is the block's
     * SID (its name only for a file written before SIDs existed), never the Name label.
     */
    async paramLinksForBlock(modelUri, blockKey) {
        return (await this.ensure(modelUri)).paramLinks(modelUri, blockKey);
    }
    /**
     * A data view's Usage column (a dictionary's, a MAT-file's): every variable row the graph has an
     * answer for, filled with the blocks that use it (annotateVariableRows).
     */
    async annotateDataRows(sourceUri, rows) {
        return annotateVariableRows(sourceUri, rows, await this.ensure(sourceUri));
    }
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
    annotateDataRowsNow(sourceUri, rows) {
        this.dropIfInputsChanged();
        const graph = this.ready.get(sourceUri);
        if (!graph)
            return false;
        annotateVariableRows(sourceUri, rows, graph);
        return true;
    }
    /**
     * A model view's Usage column: block rows take their resolved parameter links, and the model's
     * own workspace variables the blocks that use them (annotateModelViewRows).
     */
    async annotateModelRows(modelUri, rows) {
        return annotateModelViewRows(modelUri, rows, await this.ensure(modelUri));
    }
    /**
     * Drop the graphs if the inputs they read are not the inputs now.
     *
     * The graphs' inputs are the folder plus whatever else the app reads (an editor's open files),
     * and this is the only thing that knows which inputs those were — so it decides this, rather
     * than an event handler guessing. In an editor a tab going DIRTY fires the same event as one
     * opening, and invalidating on that would throw the graph away after every edit, to rebuild it
     * byte for byte.
     */
    dropIfInputsChanged() {
        if (this.graphs.size > 0 && this.builtFrom !== this.inputs.inputsKey())
            this.invalidate();
    }
    // Everything expensive is in here: which of the candidates can affect `forUri`, reading only
    // those, and re-using what is unchanged (core's planSummaries over the source cache).
    async build(forUri) {
        const files = await this.inputs.candidates();
        return buildUsageGraphFromSummaries(await planSummaries(this.cache, this.inputs.readerFor(files), files, forUri));
    }
}
