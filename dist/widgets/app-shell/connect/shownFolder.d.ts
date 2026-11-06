import type { DexHierarchy } from '../../hierarchy/dex-hierarchy.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import { type FolderView } from './folder.js';
/** What the shell does with the folder shown. */
export interface ShownFolderActions {
    /** Open the file of `uri`, chosen in the tree or picked in the search; with `name`, on that row. */
    open(uri: string, name?: string): void;
    /** `folder` is the one shown now. */
    shown(folder: FolderView): void;
    /** `folder` changed: `uris` the files it touched, none for anything. */
    changed(folder: FolderView, uris?: readonly string[]): void;
    /** The folder shown could not be read: why, as its note says it. */
    failed?(message: string): void;
}
/** The folder shown in the Explorer, if any, and how to show another. */
export interface ShownFolder {
    /** The folder shown now, or none before the first. */
    readonly current: FolderView | undefined;
    /** Show `root`, read across `port`, in place of the folder shown before. */
    show(root: string, port: MessagePort): void;
    /** Let go of the folder shown and of the search. */
    dispose(): void;
}
/** Show folders in `part`, with `tree` as their tree. */
export declare function connectShownFolder(part: DexShellFolder, tree: DexHierarchy, actions: ShownFolderActions): ShownFolder;
