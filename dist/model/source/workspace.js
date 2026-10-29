// Copyright 2026 The MathWorks, Inc.
//
// The documents a page has open, each read by core in the page, and the table each one shows.
//
// A workspace is one core session and one document registry over it (workspace/SlddModel.ts), so
// a page's documents share what one session shares (a model's Usage counts the others), and two
// workspaces share nothing. The module-level registry the VS Code extension uses is a different
// one: a workspace neither reads nor writes it.
//
// What a document's table answers is what the extension's host sends its table for the same file,
// built by the same functions from the same route (readDocument.ts), read-only.
import { createSession } from 'data-explorer-core';
import { binaryEditSrcId } from '../ids/srcId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { sourceWarnings, warningBanner } from '../rows/parseWarnings.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import { annotateModelViewRows, annotateVariableRows } from '../usage/usageCells.js';
import { DocumentRegistry } from '../workspace/SlddModel.js';
import { docKindOf, readDocument } from './readDocument.js';
import { sourceUri } from './sourceUri.js';
const messageOf = (err) => (err instanceof Error ? err.message : String(err));
/** The bytes as core takes them: an ArrayBuffer holding exactly them. */
function arrayBufferOf(bytes) {
    if (!ArrayBuffer.isView(bytes))
        return bytes;
    const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
    if (whole && bytes.buffer instanceof ArrayBuffer)
        return bytes.buffer;
    return new Uint8Array(bytes).buffer;
}
class InPageDoc {
    constructor(shared, uri, name, kind, bytes) {
        this.shared = shared;
        this.uri = uri;
        this.name = name;
        this.kind = kind;
        this.failure = '';
        this.listeners = new Set();
        this.disposed = false;
        this.read(bytes);
        // A data file's Usage names blocks in the models around it, which come and go; a model's names
        // its own blocks and its own workspace, which no other model changes.
        this.subscribeReposts();
        this.table = {
            open: async () => this.open(),
            children: (rowId) => this.children(rowId),
            matrix: async (nodeId) => this.matrix(nodeId),
            inspect: async (selection) => this.inspect(selection),
            subscribe: (listener) => {
                this.listeners.add(listener);
                return () => void this.listeners.delete(listener);
            },
        };
    }
    async reload(bytes) {
        if (this.disposed)
            throw new Error(`${this.name} is closed.`);
        this.read(arrayBufferOf(bytes));
        if (this.kind === 'project')
            return;
        await this.emitPaint();
    }
    async repaint() {
        if (this.disposed || this.kind === 'project')
            return;
        this.painted = undefined;
        await this.emitPaint();
    }
    // A data file's Usage names blocks in the models around it, which come and go; a model's names
    // its own blocks and its own workspace, which no other model changes.
    get repostsUsage() {
        return this.kind === 'dictionary' || this.kind === 'mat';
    }
    /** Take out the repost subscription the workspace's hub owes this document, in place of any held. */
    subscribeReposts() {
        this.reposts?.dispose();
        this.reposts = this.repostsUsage && !this.disposed ? this.shared.usageReposts?.subscribe(() => void this.repostUsage()) : undefined;
    }
    /** The workspace's usage source changed: a paint made from the last one is not kept. */
    dropPaint() {
        this.painted = undefined;
    }
    /**
     * The folder changed under the Usage column: paint again from the same read, refilled, for a
     * table that is showing it. With none subscribed, the next `open()` paints afresh.
     */
    async repostUsage() {
        if (this.disposed || !this.reading)
            return;
        this.painted = undefined;
        if (this.listeners.size > 0)
            await this.emitPaint();
    }
    /** Tell every subscriber the paint there is now: a `replaceAll`, or the `error` it failed with. */
    async emitPaint() {
        let change;
        try {
            change = { kind: 'replaceAll', view: await this.open() };
        }
        catch (err) {
            change = { kind: 'error', message: messageOf(err) };
        }
        if (this.disposed)
            return;
        for (const listener of [...this.listeners]) {
            try {
                listener(change);
            }
            catch (err) {
                // One listener's failure is its own: the others still hear the change.
                queueMicrotask(() => {
                    throw err;
                });
            }
        }
    }
    dispose() {
        if (this.disposed)
            return;
        this.disposed = true;
        this.reposts?.dispose();
        this.unload();
        this.listeners.clear();
        this.shared.closed(this);
    }
    read(bytes) {
        this.unload();
        this.failure = '';
        if (this.kind === 'project') {
            this.failure = `${this.name} is a project: it opens on a project page, not in a table.`;
            return;
        }
        try {
            this.reading = readDocument(this.shared.registry, this.kind, this.name, this.uri, bytes);
        }
        catch (err) {
            this.failure = messageOf(err);
            this.unload();
        }
    }
    /** Take the current tree out of the session, whichever id a read registered it under. */
    unload() {
        this.reading = undefined;
        this.painted = undefined;
        this.shared.registry.release(this.uri);
        this.shared.registry.release(binaryEditSrcId(this.uri));
    }
    open() {
        if (this.disposed)
            return Promise.reject(new Error(`${this.name} is closed.`));
        const r = this.reading;
        if (!r)
            return Promise.reject(new Error(this.failure));
        this.painted ??= this.paint(r);
        return this.painted;
    }
    async paint(r) {
        let view;
        try {
            const planned = r.planner.payload(r.node, this.shared.budget, r.paint);
            const notice = r.notice();
            const warnings = r.banner(lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(r.node))));
            view = {
                docUri: this.uri,
                rows: planned.rows,
                columns: [...COLUMNS],
                columnLabels: { ...COLUMN_LABELS },
                columnGroups: { ...COLUMN_GROUPS },
                editable: false,
                ...(notice === undefined ? {} : { notice }),
                ...(warnings === undefined ? {} : { warnings }),
            };
        }
        catch (err) {
            throw new Error(r.paintFailed(err));
        }
        await this.fillUsage(view.rows);
        return view;
    }
    /**
     * The Usage column of `rows`, from the workspace's usage graph for this document: a model's
     * block rows take their parameters' sources and its workspace variables their users; every
     * other document's variables take theirs. The rule the extension fills its tables by
     * (usageCells.ts). A graph that cannot be had leaves the cells as the file has them.
     */
    async fillUsage(rows) {
        const usage = this.shared.usage;
        if (!usage || rows.length === 0)
            return;
        try {
            const graph = await usage.graphFor(this.uri);
            if (this.kind === 'model')
                annotateModelViewRows(this.uri, rows, graph);
            else
                annotateVariableRows(this.uri, rows, graph);
        }
        catch {
            /* no graph: the cells keep what the read gave them */
        }
    }
    /** The node a row id names in the current tree, or null. */
    find(nodeId) {
        const r = this.reading;
        if (!r || typeof nodeId !== 'string' || nodeId === '')
            return null;
        try {
            return this.shared.registry.findNode(r.srcId, nodeId);
        }
        catch {
            return null;
        }
    }
    async children(rowId) {
        const r = this.reading;
        const { nodeId, rows, truncated } = childRowsMessage(rowId, this.find(rowId), r?.planner ?? rowPlannerFor(this.name), r?.fetch);
        await this.fillUsage(rows);
        return { nodeId, rows, truncated };
    }
    matrix(nodeId) {
        const { matrix, message } = matrixCellsMessage(nodeId, this.find(nodeId));
        return matrix ? { nodeId, matrix } : { nodeId, message: message ?? 'This value could not be read as a table.' };
    }
    inspect(selection) {
        const rowIds = typeof selection === 'string' ? [selection] : selection;
        let view = { groups: [] };
        // The inspector's own rule for which row a selection shows (the first, unless it is a section
        // heading), with this document's lookup.
        const show = { showNode: (node) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node) }), clear: () => { } };
        new InspectorSelection(show, (_uri, id) => this.find(id)).show(this.uri, rowIds);
        return view;
    }
}
/**
 * A workspace: the documents of a page, read by core in the page.
 *
 * ```ts
 * const ws = createWorkspace();
 * const doc = await ws.open(bytes, 'plant.sldd');
 * const view = await doc.table.open(); // rows, columns, banners
 * ```
 */
export function createWorkspace(options = {}) {
    const budget = options.rowBudget ?? LAZY_ROW_BUDGET;
    if (!(budget >= 1))
        throw new RangeError(`rowBudget must be at least 1, not ${String(options.rowBudget)}.`);
    const session = createSession();
    const docs = new Map();
    const shared = {
        registry: new DocumentRegistry(session),
        budget,
        usage: options.usage,
        usageReposts: options.usageReposts,
        closed: (doc) => {
            if (docs.get(doc.uri) === doc)
                docs.delete(doc.uri);
        },
    };
    let disposed = false;
    return {
        async open(bytes, name, uri) {
            if (disposed)
                throw new Error('This workspace is closed.');
            const id = uri ?? sourceUri(`/${name}`);
            const kind = docKindOf(name);
            if (!kind) {
                throw new Error(`${name} is not a file this workspace opens: it opens data dictionaries (.sldd), models (.slx, .mdl), MAT-files (.mat) and projects.`);
            }
            if (docs.has(id))
                throw new Error(`${id} is already open in this workspace.`);
            const doc = new InPageDoc(shared, id, name, kind, arrayBufferOf(bytes));
            docs.set(id, doc);
            return doc;
        },
        get: (uri) => docs.get(uri),
        async setUsage(usage, usageReposts) {
            if (disposed)
                return;
            shared.usage = usage;
            shared.usageReposts = usageReposts;
            const open = [...docs.values()];
            for (const doc of open) {
                doc.subscribeReposts();
                doc.dropPaint();
            }
            await Promise.all(open.filter((doc) => doc.repostsUsage).map((doc) => doc.repaint()));
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            for (const doc of [...docs.values()])
                doc.dispose();
            session.removeAll();
        },
    };
}
