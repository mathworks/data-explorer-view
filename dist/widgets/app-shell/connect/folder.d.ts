import { type FolderSession } from '../../../model/folder/folderSession.js';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import type { ProjectStore } from '../../../model/hierarchy/graphSources.js';
import type { RawSource } from '../../../model/usage/usageCells.js';
import type { DexHierarchy, HierarchyMenuDetail, RowMark } from '../../hierarchy/dex-hierarchy.js';
/** A folder shown in a tree, read across its port: what the shell asks of it. */
export interface FolderView {
    /** The folder's path, as the host named it. */
    readonly root: string;
    /** Its session: the hierarchy, the Usage graphs and the names its search reads. */
    readonly session: FolderSession;
    /** Whether the folder's last listing holds the file of `uri`. */
    lists(uri: string): boolean;
    /** The uri of the file a link opens by the tree's rule, or none. */
    resolveLink(link: LinkTarget, fromUri: string): Promise<string | null | undefined>;
    /** Select the row of the file `uri`, opening the rows above it. */
    reveal(uri: string): void;
    /** Mark each file's rows as its tab stands, by its uri (the tree's `marks`). */
    setMarks(marks: ReadonlyMap<string, RowMark>): void;
    /**
     * Read the folder again (⟳): its listing, so the index takes what changed, and every open row's
     * entries, which no listing of data files says changed (a note written into it).
     */
    readAgain(): Promise<void>;
    /** The store of the project whose marker is `uri`, once the folder is listed; null for a file it does not list. */
    projectStore(uri: string): Promise<ProjectStore | null>;
    /** The marker (its uri) of the project in the folder `dir`, if the folder holds one. */
    projectIn(dir: string): Promise<string | undefined>;
    /**
     * The folder's files a relationship graph draws (core's `isGraphPath`), listed afresh: a file whose
     * version is the one last read is kept as it was read, the rest are read now; one that cannot be
     * read is left out.
     */
    graphSources(): Promise<RawSource[]>;
    /** Hear the folder change: `uris` the files it touched, none for anything. */
    onChange(listener: (uris?: readonly string[]) => void): () => void;
    /** Stop: the tree hears nothing more, and the port is closed. */
    dispose(): void;
}
/**
 * Show the folder `root`, read across `port`, in `tree`; a chosen file's uri goes to `open`, and a
 * row's menu asked for (a right click, Shift+F10) to `menu`.
 */
export declare function showFolder(tree: DexHierarchy, root: string, port: MessagePort, options: {
    empty: HTMLElement | ((empty: boolean) => void);
    open: (uri: string) => void;
    error: (message: string) => void;
    menu?: (detail: HierarchyMenuDetail) => void;
    /** The index could not be read, where the tree shows the folder's entries all the same (its row says so): why, once. */
    indexFailed?: (message: string) => void;
}): FolderView;
