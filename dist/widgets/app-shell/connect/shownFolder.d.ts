import type { DexHierarchy, HierarchyMenuDetail } from '../../hierarchy/dex-hierarchy.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import { type FolderView } from './folder.js';
/** What the shell does with the folder shown. */
export interface ShownFolderActions {
    /** Open the file of `uri`, chosen in the tree; with `name`, on that row. */
    open(uri: string, name?: string): void;
    /** `folder` is the one shown now. */
    shown(folder: FolderView): void;
    /** `folder` changed: `uris` the files it touched, none for anything. */
    changed(folder: FolderView, uris?: readonly string[]): void;
    /** `folder`'s names were read again, after a change (its tree is built again once they are): a search of them is out of date. */
    namesChanged?(folder: FolderView): void;
    /** The folder shown could not be read: why, as its note says it. */
    failed?(message: string): void;
    /** A row's menu was asked for (a right click, Shift+F10 on the row). */
    menu?(detail: HierarchyMenuDetail): void;
    /** The folder's data files could not be read, where its tree shows its entries all the same: why, once. */
    indexFailed?(message: string): void;
}
/** The folder shown in the Folder view, if any, and how to show another. */
export interface ShownFolder {
    /** The folder shown now, or none before the first. */
    readonly current: FolderView | undefined;
    /** Show `root`, read across `port`, in place of the folder shown before. */
    show(root: string, port: MessagePort): void;
    /** Let go of the folder shown. */
    dispose(): void;
}
/** Show folders in `part`, with `tree` as their tree. */
export declare function connectShownFolder(part: DexShellFolder, tree: DexHierarchy, actions: ShownFolderActions): ShownFolder;
