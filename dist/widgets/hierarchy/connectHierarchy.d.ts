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
    /** Stop following the folder: the tree keeps what it shows, and still opens rows. */
    dispose(): void;
}
/**
 * Wire `element` to `hierarchy`: draw its rows now, and again on each of its refreshes and
 * rebuilds, and answer each row the user opens.
 */
export declare function connectHierarchy(element: DexHierarchy, hierarchy: FolderHierarchy, options?: ConnectHierarchyOptions): HierarchyHandle;
