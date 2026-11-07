import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { HierarchyMenuDetail } from '../../hierarchy/dex-hierarchy.js';
import type { DexFolderBar, FolderSegment } from '../dex-folder-bar.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import type { FolderView } from './folder.js';
import type { FolderCommands } from './paletteItems.js';
import type { ShellHost } from './types.js';
/**
 * What a folder's segment reads: its name, a trailing separator or not (`/work/plant/` is `plant`);
 * the top of a path by itself (`/`, and a drive as `C:`).
 */
export declare function folderLabel(path: string): string;
/**
 * The path bar's segments for the folder `root`, outermost first: `root` and each folder the host
 * gives above it (`parent`), up to the one it gives none for, or at most MAX_UP folders up. A host
 * with no `parent` has the folder alone; one that answers the folder itself has gone as far as it
 * goes.
 */
export declare function segmentsOf(root: string, parent: ((path: string) => string | null) | undefined): FolderSegment[];
/** What the Folder view's moves and menus are carried out with. */
export interface FolderNavContext {
    host: ShellHost;
    /** The Folder view's part: its line that says what is read. */
    part: DexShellFolder;
    bar: DexFolderBar;
    /** The shared context menu. */
    menu: DexContextMenu;
    /** The folder shown now, if any. */
    folder(): FolderView | undefined;
    /** Whether a tab has the file of `uri` open. */
    isOpen(uri: string): boolean;
    /** Open the file at `path` in a tab kept (no preview), and with `side`, in the pane on the right. */
    open(path: string, side: boolean): void;
    /** Close the tab of the file `uri`, asking first about unsaved edits. */
    close(uri: string): void;
    /** Say something briefly (a toast and the Log). */
    said(text: string): void;
    /** Something could not be done: say so. */
    failed(text: string): void;
}
/** The Folder view's moves, as connectShell drives them. */
export interface FolderNav {
    /** The folder `root` is shown now: the bar's segments, ↑ and ⟳ drawn for it, and a move under way over. */
    shown(root: string): void;
    /** Make the folder above the one shown the workspace folder (↑, the palette's Up One Level). */
    up(): void;
    /** Read the folder shown again (⟳, Read Again), or pick it again for a host whose folder is a snapshot. */
    refresh(): void;
    /** What the palette's folder rows can do now (all but whether there is a Folder view, which is connectShell's to say). */
    commands(): Omit<FolderCommands, 'view'>;
    /** Show the menu of a row the tree asked one for. */
    rowMenu(detail: HierarchyMenuDetail): void;
    dispose(): void;
}
/** Wire the Folder view's bar and menus over `context`. */
export declare function connectFolderNav(context: FolderNavContext): FolderNav;
