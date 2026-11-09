import { type SourceCache, type SourceFile } from 'data-explorer-core';
import type { LinkTarget } from '../ids/linkTarget.js';
import { type FolderFileList } from './folderList.js';
import { type GraphNode, type GroupKind, type NodeKind, type SourceType } from './graphModel.js';
import { type GraphReader } from './graphSources.js';
import type { HealthState } from './health.js';
/** A folder's supported files, as the app lists them. */
export interface FolderFiles {
    /**
     * Every supported file in the folder, listed afresh for each build. In a STABLE order: folder
     * order decides which of two same-named files a reference resolves to, so the same folder must
     * list the same way every time (a code-point sort of the paths does).
     *
     * A plain `SourceFile[]` is an answer. One that stopped at a limit says so with `truncated`
     * (FolderFileList; `listedFiles` keeps core's `listFolder` flag), and the hierarchy then ends
     * with a row that says only the first files are shown.
     */
    list(): Promise<FolderFileList>;
}
/** What a FolderHierarchy reads its folder with. */
export interface FolderHierarchyOptions {
    /** The folder. */
    files: FolderFiles;
    /**
     * The reader for one build's files: it answers only for the files it is given, and reads a
     * project's store (GraphReader). Core's `nodeSourceReader(files)` is one, plus a `projectStore`.
     */
    reader(files: readonly SourceFile[]): GraphReader;
    /**
     * The cache the reads go through. Share the one the app's other folder passes read (a usage
     * plan, a name index), so a folder is read once for all of them. Default: one of its own.
     */
    cache?: SourceCache;
    /** Whether a file has unsaved changes, which marks its rows `modified`. Default: none has. */
    isDirty?(uriString: string): boolean;
}
/** One row of a folder's hierarchy, as a tree draws it. */
export interface HierarchyItem {
    /** What the row reads: a file's name, a project's or a folder's, `External Data`, or the name a reference names. */
    label: string;
    /**
     * A file's kind, `group` for a project, a folder or a model's External Data, `missing` for a
     * reference no file answers, or `notice` for the row that says something of the folder rather
     * than being in it (that only its first files are shown). `other` only on a FolderTree's row of
     * a file the app does not open (`dimmed`): FolderHierarchy never makes one.
     */
    kind: NodeKind | 'notice' | 'other';
    /** What a group is (`kind` is `group`). */
    groupKind?: GroupKind;
    /** The uri of the file the row opens: a file's own, a project's marker. None on a row that is no file. */
    id?: string;
    /**
     * A file row's mark: `cycle` when it closes a circular reference, else `modified` when it has
     * unsaved changes, else null. Not on a row that is no file.
     */
    health?: HealthState | null;
    /** `collapsed` when the row has rows under it (`children()` answers them), `none` when it has none. */
    collapsible: 'none' | 'collapsed';
    /** What follows the label: why the row is unlike the others (`unresolved reference`, `↻ circular reference`). */
    description?: string;
    /** More than the label says, for a tooltip. */
    tooltip?: string;
    /** Its icon's id in the package's icons/. None on an unresolved reference, which draws a warning. */
    icon?: string;
    /**
     * The row among its siblings, after its parent's key: the same row has the same key after a
     * rebuild, so a tree keeps what was open.
     */
    key: string;
    /** A file the app does not open (FolderTree's other files): drawn dimmed, opens nothing. */
    dimmed?: boolean;
    /**
     * The row's path in the host's scheme: a folder's (for re-rooting) or a file's (for Reveal and
     * Copy Path). Only on a FolderTree's rows: an entry's path, and a reference's file's spelled as
     * the root is. FolderHierarchy's rows have none: `rowPath(item)` reads a file's from its uri.
     */
    path?: string;
    /** What a reference row is to its parent, in words ("model reference", "data dictionary", "referenced dictionary"). */
    relation?: string;
}
/** Every icon id FolderHierarchy's rows can name, for the check that each one ships in icons/ (a FolderTree's own rows name more: its test checks those). */
export declare const HIERARCHY_ICONS: readonly string[];
/**
 * The icon of a file's row, by its kind: the one table, so a FolderTree's row of a file the graph
 * has no node for (past the index's cap) draws as the graph's row of it would.
 */
export declare function fileIconOf(kind: SourceType): string;
/**
 * The single most severe health state of a file row, or null when it is healthy. A cycle before
 * an unsaved change. `missing` is a kind of node of its own, with no file to be dirty.
 */
export declare function healthOf(node: GraphNode, dirty: boolean): HealthState | null;
/**
 * A folder's hierarchy: the files it holds, grouped by project and folder, each with the files
 * it references under it, lazily, as rows.
 *
 * The graph is read once and kept: `roots()` and `children()` answer from it until `rebuild()`
 * drops it, for what changes the folder (a file created, deleted or saved). `refresh()` keeps it,
 * for what changes a row and not the folder: a file's unsaved changes, which the graph cannot
 * see because it reads the files as saved. Either tells every subscriber to draw again.
 */
export declare class FolderHierarchy {
    private readonly options;
    private graph;
    private readonly cutAt;
    /** The cache its reads go through: hand it to the app's other folder passes (UsageGraphs), to read the folder once. */
    readonly cache: SourceCache;
    private readonly nodes;
    private readonly listeners;
    constructor(options: FolderHierarchyOptions);
    /**
     * The top level: a row per project, then per folder, each by name; and last, when the folder's
     * listing was cut short (FolderFileList.truncated), a `notice` row that says only its first
     * files are shown.
     */
    roots(): Promise<HierarchyItem[]>;
    /**
     * The rows under `item`, from the graph as it is now: an item from before a rebuild answers
     * what its file holds today. An item this hierarchy did not make has none.
     */
    children(item: HierarchyItem): Promise<HierarchyItem[]>;
    /**
     * The file a bare name means when `referrerUri` names it, by the rule this hierarchy draws with:
     * the copy in the referrer's own project or folder, else the first match in the folder. A link
     * resolved through this opens the file the hierarchy shows under the referrer.
     */
    resolveReference(ref: string, referrerUri: string): Promise<string | undefined>;
    /**
     * The file a link in the document `fromUri` opens, where the link names it by a bare file name
     * (as a model records the models and dictionaries it links, `params.sldd` or
     * `Kp@params.sldd`): resolveReference's answer, the file this hierarchy shows under `fromUri`
     * for that name. Undefined for a link that names its file by a uri or a path, which means that
     * file, and for a name no file of the folder has.
     *
     * What connectTable's `resolveLink` asks, so a table's links open the files the tree shows:
     * `resolveLink: (link, fromUri) => hierarchy.resolveLink(link, fromUri)`.
     */
    resolveLink(link: LinkTarget, fromUri: string): Promise<string | undefined>;
    /**
     * The rows from the top level down to a row whose file is `uri` (its `id`), that row last; or
     * undefined when no row is (the file is not in the folder). A file can be a row in several
     * places, under each file that references it, and in its own folder's group when nothing there
     * references it; the row this finds is the shallowest, and of several at one depth the first as
     * the tree draws them, from the top. Each file's references are read once, however many rows it
     * is. For a tree to show a file (connectHierarchy's `reveal`).
     */
    pathTo(uri: string): Promise<HierarchyItem[] | undefined>;
    /**
     * The row of the file `uri` as the top of its own expansion: the row a group lists it as when
     * nothing there references it, whether or not something does. Collapsible by its references,
     * marked as such a row is (unsaved; no cycle, which only a repeat under it closes), and keyed as
     * a row of the top level, `/` and its uri encoded. Undefined for a uri no file of the folder
     * has, and for a project's marker, which heads its group and is no file row.
     *
     * For a tree that draws every file in its own folder rather than under what references it
     * (FolderTree), which keys the row again under its own; its rows are this hierarchy's
     * children(), from the graph as it is then. Answered from the graph there is: no listing, no read.
     */
    rowOf(uri: string): Promise<HierarchyItem | undefined>;
    /** Draw the rows again from the graph there is: for a file's unsaved changes. */
    refresh(): void;
    /** Read the folder again, for what changes it: a file created, deleted or saved. */
    rebuild(): void;
    /** Hear every refresh() and rebuild(), until the returned function is called. */
    subscribe(listener: () => void): () => void;
    private ensureGraph;
    private buildGraph;
    private itemsOf;
    private itemOf;
}
