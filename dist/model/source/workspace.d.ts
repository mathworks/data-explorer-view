import { type UsageGraph } from '../usage/usageCells.js';
import { type DocKind } from './readDocument.js';
import type { TableSource } from './tableSource.js';
export type { DocKind } from './readDocument.js';
/** How a workspace reads and shows its documents. */
export interface WorkspaceOptions {
    /**
     * How many rows a table's paint (`open()`, and a `replaceAll`) delivers before it holds the rest
     * back, breadth-first, for `children()`: `LAZY_ROW_BUDGET` (100,000) unless set. A row whose
     * children were held back carries `_lazy`. `children()` answers to the default budget whatever
     * this is, as the extension does.
     */
    rowBudget?: number;
    /**
     * Where the Usage column's answers come from: who uses each variable of a dictionary or a
     * MAT-file, and where each parameter of a model's blocks comes from. Every paint and every
     * `children()` answer is filled from the graph it gives for the document's uri, as the VS Code
     * extension fills its tables from the folder around a file. Unset, a table's Usage column holds
     * only what the file itself says (a model's blocks, by name).
     */
    usage?: UsageSource;
    /**
     * When a dictionary's or a MAT-file's Usage column is owed a repaint because a model appeared
     * or went away in the folder: each such document subscribes while it is open, and repaints its
     * table (a `replaceAll`, refilled from `usage`) when told to. A usage repost hub
     * (createUsageRepostHub) over the app's watch on the folder. Unset, a column changes only when
     * its own file does.
     */
    usageReposts?: UsageReposts;
}
/** What a workspace's data documents subscribe to for a Usage repaint: a usage repost hub. */
export interface UsageReposts {
    subscribe(repost: () => void): {
        dispose(): void;
    };
}
/**
 * The usage graphs a workspace fills its tables' Usage column from: one that can answer for a
 * document, given its uri.
 *
 * Over a folder, the graph for a document is core's `planSummaries(cache, reader, files, uri)` —
 * the summaries of just the files that can reach it — through `buildUsageGraphFromSummaries`.
 * The document must be open under the uri the folder lists it by (`sourceUri(path)`), since that
 * is the uri the graph's answers name it by.
 */
export interface UsageSource {
    /** The graph that answers for the document opened under `uri`. A rejection leaves the cells as the file has them. */
    graphFor(uri: string): Promise<UsageGraph>;
}
/** One open document. */
export interface Doc {
    /** The uri it was opened under: its identity in the workspace, and its table's `docUri`. */
    readonly uri: string;
    /** Its file name, as opened (`plant.sldd`). */
    readonly name: string;
    /**
     * What it is. A `'project'` opens on a project page rather than in a table: its `table.open()`
     * rejects, saying so.
     */
    readonly kind: DocKind;
    /** What its table shows, and how it answers. */
    readonly table: TableSource;
    /**
     * The file changed: read `bytes` in place of what it held. The table's subscribers hear the
     * outcome: a `replaceAll` with the new paint, or an `error` saying why the file could not be
     * read (and `open()` then rejects with it).
     */
    reload(bytes: ArrayBuffer | Uint8Array): Promise<void>;
    /** Close it: its tree leaves the session, and its table answers nothing more. */
    dispose(): void;
}
/** The documents a page has open. */
export interface Workspace {
    /**
     * Open the file `name`, whose content is `bytes` (which the workspace keeps: do not write to
     * them afterwards).
     *
     * `uri` is its identity, which every row id embeds; by default `sourceUri('/' + name)`. Pass
     * `sourceUri(path)` of the file's path when two open files may share a name, or to give a file
     * the identity the VS Code extension gives it.
     *
     * Rejects for a file of a kind this package does not open, a uri already open here, or a
     * workspace that is closed. A file that cannot be read still opens: its `table.open()` rejects
     * with what the table's error banner says.
     */
    open(bytes: ArrayBuffer | Uint8Array, name: string, uri?: string): Promise<Doc>;
    /** The open document of `uri`, if there is one. */
    get(uri: string): Doc | undefined;
    /** Close every document and the session they were read into. */
    dispose(): void;
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
export declare function createWorkspace(options?: WorkspaceOptions): Workspace;
