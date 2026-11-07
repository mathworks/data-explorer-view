import { type FolderEntry } from './folderEntries.js';
import { type FolderHierarchy, type HierarchyItem } from './folderHierarchy.js';
/** What a FolderTree draws from. */
export interface FolderTreeOptions {
    /** The index's tree (unchanged): data files, their folders, and each file's references. */
    hierarchy: FolderHierarchy;
    /** One level of a folder (FolderReader.entries); null: the host lists none, so the tree is the hierarchy's. */
    entries(dir: string): Promise<readonly FolderEntry[] | null>;
    /** The workspace folder's path (the served root). */
    root: string;
    /**
     * The index could not be read (its listing failed): told once for each failure, not at each draw
     * of it, for an app's log. The tree says so itself, in a row after the root's. Absent: nothing is told.
     */
    indexFailed?(err: unknown): void;
}
/**
 * The workspace folder as the Folder view draws it: its folders and files, a level at a time,
 * merged with the index's hierarchy (FolderHierarchy), which this reads and never changes.
 *
 * ```ts
 * const tree = new FolderTree({ hierarchy, entries: (dir) => folder.entries(dir), root });
 * ```
 */
export declare class FolderTree {
    private readonly hierarchy;
    private readonly entries;
    private readonly root;
    private readonly indexFailed;
    private toldFailure;
    private lists;
    private firstRoot;
    private readonly folders;
    private readonly copies;
    constructor(options: FolderTreeOptions);
    /**
     * The root's own row (as FolderHierarchy.roots), its path set; and after it, when the index's
     * listing was cut short, the hierarchy's row that says so, or when it could not be read, a row
     * that says why (the folder's entries are drawn all the same, its data files as plain rows). For
     * a host that lists no entries, the hierarchy's roots, and its failure.
     */
    roots(): Promise<HierarchyItem[]>;
    private unindexed;
    /**
     * A folder row: its entries (sortEntries order), each with its `path`.
     *
     * - A data file is the hierarchy's own row for it (FolderHierarchy.rowOf), its references under
     *   it; one the index has no row for (past its cap, or an index that cannot be read) is a plain
     *   row that opens it, with nothing under it; one core does not read is an other file.
     * - A folder is a collapsible folder row of its own (kind `group`, groupKind `folder`, as the
     *   hierarchy's are; key `${parent.key}/dir%3A<name>`), whether or not it holds data. A project's
     *   folder (its marker in it) keeps its own name and takes the project's icon, its name as the
     *   `description` and its marker's `id`, so it opens the project's page.
     * - An other file is a `dimmed` row (kind `other`) with no `id`.
     *
     * A folder that cannot be read answers one `notice` row that says so, with the host's reason.
     * Any other row: the hierarchy's children of the row it copies, keyed under it, a reference
     * row's `relation` set from the edge kind.
     */
    children(item: HierarchyItem): Promise<HierarchyItem[]>;
    /**
     * The row of a file (by uri) along its folders, for revealing the active tab.
     *
     * From the root's row down through the folders that hold the file, to its own row in its own
     * folder: so a file only ever referenced is found where it is, not under what references it.
     * Undefined for a file outside the folder (nothing is listed to know it) or in no folder the host
     * lists. For a host that lists no entries, the hierarchy's pathTo.
     */
    pathTo(uri: string): Promise<HierarchyItem[] | undefined>;
    private listsEntries;
    private folderChildren;
    private folderRow;
    private copy;
    private pathOf;
}
/**
 * The path of a row's file or folder, for a menu's Reveal and Copy Path: the row's own `path` (every
 * row a FolderTree draws of a folder or a file has one: an entry's, and a reference's spelled as the
 * root is), else its file's read back from its uri (`uriPath(id)`), for a row FolderHierarchy made,
 * which carries none. Undefined for a row of no file (External Data, a notice, an unresolved
 * reference).
 *
 * A uri reads back as the path sourceUri was given for a POSIX path, a page's among them (they start
 * with `/`); a Windows path reads back with its drive letter, and a UNC path with its host,
 * lower-cased, which is why a FolderTree's rows carry their own.
 */
export declare function rowPath(item: HierarchyItem): string | undefined;
