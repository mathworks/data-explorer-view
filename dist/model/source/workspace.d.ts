import { type UsageGraph } from '../usage/usageCells.js';
import type { Notify } from '../edit/hooks.js';
import { type Registers } from '../edit/registers.js';
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
    /**
     * Edit in the page what the page can edit: a MAT-file and a compressed (zip) dictionary, for
     * now. Its table is then an EditableTableSource (connectTable's `editing` wires a table to it),
     * its edits go on an undo stack of its own, and it saves through the Doc's `serialize` and
     * `saved`. Default false: every document is read-only, as before.
     */
    editing?: boolean;
    /**
     * With `editing`: the clipboard and drag register the workspace's documents share (and the
     * deleters a move between them asks), for a page that shares one with other workspaces.
     * Default: one of the workspace's own (createRegisters).
     */
    registers?: Registers;
    /**
     * With `editing`: where a document says what its table does not show — a move that left its
     * original behind, an undo of an edit made before a reload, an undo that failed. Default:
     * nowhere.
     */
    notify?: Notify;
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
/**
 * One open document. An app is handed one and does not implement it, so a release may add to it.
 */
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
    /** What its table shows, and how it answers. An EditableTableSource where `editable`. */
    readonly table: TableSource;
    /**
     * Whether the page edits it (a MAT-file or a compressed dictionary, in a workspace made with
     * `editing`): its table takes edits, and it saves through `serialize` and `saved`. Whether a given
     * file can be edited is its view's `editable` (a MAT-file laid out in a way a save could not keep
     * opens read-only).
     */
    readonly editable: boolean;
    /** Whether it holds edits its file does not: false for a document the page does not edit. */
    readonly dirty: boolean;
    /** Hear `dirty` change, until the returned function is called. */
    onDirty(listener: (dirty: boolean) => void): () => void;
    /**
     * Start a save: the bytes to write, read synchronously, so that they are the document as the
     * save was asked for, and `at`, which `saved` (or `notSaved`) is handed once they are written
     * (or are not). Throws why it cannot be written (core's refusal, in its words), and for a
     * document the page does not edit.
     */
    serialize(): {
        bytes: Uint8Array;
        at: SaveToken;
    };
    /** The bytes of the save `at` began are on disk: it is clean as of then, and its Status column moves. */
    saved(at: SaveToken): void;
    /** The bytes of the save `at` began were never written: nothing about the document moves. */
    notSaved(at: SaveToken): void;
    /**
     * The file changed: read `bytes` in place of what it held. The table's subscribers hear the
     * outcome: a `replaceAll` with the new paint, or an `error` saying why the file could not be
     * read (and `open()` then rejects with it).
     */
    reload(bytes: ArrayBuffer | Uint8Array): Promise<void>;
    /**
     * Paint the table again from the read it has, refilled from the workspace's `usage`: its
     * subscribers hear a `replaceAll` (or the `error` the paint failed with). For what changed the
     * Usage column and not the file, as a usage source that appeared (`setUsage`). A project, which
     * opens on a page, has no table to paint.
     */
    repaint(): Promise<void>;
    /** Close it: its tree leaves the session, and its table answers nothing more. */
    dispose(): void;
}
/** What `Doc.serialize` hands back with its bytes, for `saved`: which save of the document they are. */
export interface SaveToken {
    readonly at: number;
}
/**
 * The documents a page has open. An app is handed one and does not implement it, so a release may
 * add to it.
 */
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
    /**
     * Fill the Usage column from `usage` from now on, and repaint from `usageReposts` (both as
     * `createWorkspace` takes them; leaving one out means none): for a workspace that outlives a
     * folder, or a usage source that comes after the documents. Every paint reads the source, a
     * model's block parameters as much as a dictionary's users, so every open document's table that
     * has a subscriber is painted again, refilled (`replaceAll`): dictionaries, MAT-files and models;
     * one with none is refilled at its next paint. A project has no table. The repost subscriptions
     * move to the new hub, and stay a dictionary's and a MAT-file's alone, as the hub's rule has it.
     * Resolves when the repaints are done.
     */
    setUsage(usage?: UsageSource, usageReposts?: UsageReposts): Promise<void>;
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
