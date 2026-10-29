import type { FolderHierarchy } from '../../model/hierarchy/folderHierarchy.js';
import type { DexHierarchy } from './dex-hierarchy.js';
/** How connectHierarchy wires a hierarchy. */
export interface ConnectHierarchyOptions {
    /**
     * What shows while the folder has no rows (it holds no file to show, or could not be read): an
     * element, shown (and the hierarchy hidden, by `hidden`) while there are none; or a function told
     * `true` for none and `false` for rows. Default: the tree just shows no rows.
     */
    empty?: HTMLElement | ((empty: boolean) => void);
    /**
     * Open each top-level row (a folder's own row, each project's) the first time the tree shows
     * it, then leave it as the user leaves it: the tree's `expandTopLevel`, which this sets, as
     * connectTable opens a table's sections. Default false: a folder opens closed (or as the tree's
     * own `expandTopLevel` says).
     */
    expandTopLevel?: boolean;
}
/** How `reveal()` shows a file. */
export interface RevealOptions {
    /**
     * Also send `dex-hierarchy-select` for the row, as a click on it does (so the handle's `open`
     * too), without opening or closing it. Default false: the row is shown and selected, and nothing
     * is sent.
     */
    choose?: boolean;
}
/** What a connected hierarchy tells the app, by name, and what each listener is given. */
export interface HierarchyHandleEventMap {
    /** A row that opens a file was chosen: the file's uri. */
    open: string;
    /** The folder could not be read: why. The tree shows no rows (the `empty` state) until it can. */
    error: string;
}
/** A hierarchy wired to a folder: what connectHierarchy returns. */
export interface HierarchyHandle {
    readonly element: DexHierarchy;
    readonly hierarchy: FolderHierarchy;
    /** Hear an event, until the returned function is called. */
    on<K extends keyof HierarchyHandleEventMap>(type: K, listener: (detail: HierarchyHandleEventMap[K]) => void): () => void;
    /**
     * Show the file `uri` (a uri the folder lists, as the row's `id` holds it) in the tree: open the
     * rows above its row, select it, and scroll it into view (the tree's `revealRow`). For a tree
     * that follows the file the app has open, as an editor's explorer does.
     *
     * Where the file is a row in several places (a dictionary under each model that links it), the
     * selected row stays when it is one of them (the user chose the file there); else the row is
     * the shallowest, and of several at one depth the first from the top (FolderHierarchy's
     * `pathTo`). Resolves true once the row is selected; false, with the tree left as it was, when
     * no row is the file (it is not in the folder, or the folder cannot be read), when a later
     * reveal() overtook this one, or after dispose(). Sends nothing unless `options.choose` says to.
     */
    reveal(uri: string, options?: RevealOptions): Promise<boolean>;
    /** Stop following the folder: the tree keeps what it shows, and still opens rows. */
    dispose(): void;
}
/**
 * Wire `element` to `hierarchy`: draw its rows now, and again on each of its refreshes and
 * rebuilds, and answer each row the user opens.
 */
export declare function connectHierarchy(element: DexHierarchy, hierarchy: FolderHierarchy, options?: ConnectHierarchyOptions): HierarchyHandle;
