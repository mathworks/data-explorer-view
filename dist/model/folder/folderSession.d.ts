import { type SourceCache, type SourceFile } from 'data-explorer-core';
import { FolderHierarchy, type FolderFiles, type HierarchyItem } from '../hierarchy/folderHierarchy.js';
import type { GraphReader } from '../hierarchy/graphSources.js';
import { NameIndex } from '../search/nameIndex.js';
import type { NameReader } from '../search/nameScan.js';
import { UsageGraphs } from '../usage/usageGraphs.js';
import { type UsageRepostHub } from '../usage/usageRepostHub.js';
import type { UsageRepostTimers } from '../usage/usageRepost.js';
/**
 * The app's watch on the folder: until stopped, it calls `changed` for each change, with the uris
 * of the files that changed when it knows them (absent: anything may have). A FolderReader's
 * `onChange` is one; so is any `(listener) => { dispose }`.
 */
export type WatchFolder = (changed: (uris?: readonly string[]) => void) => (() => void) | {
    dispose(): void;
};
/** What a folder session reads, and how it hears that the folder changed. */
export interface FolderSessionOptions {
    /** The folder: its supported files, in a stable order (folder order decides which of two same-named files a name means). */
    files: FolderFiles;
    /**
     * The reader for one pass's files: their versions and bytes, a project's store, and, for an app
     * that edits, an open file's unsaved bytes (`dirtyBytes`, which the names prefer and nothing
     * caches). A FolderReader is one, whatever files it is given.
     */
    reader(files: readonly SourceFile[]): GraphReader & Partial<Pick<NameReader, 'dirtyBytes'>>;
    /** The watch that calls `changed()`. Without one, the app calls it. */
    watch?: WatchFolder;
    /** The cache every read goes through. Default: one of its own. */
    cache?: SourceCache;
    /** Whether a file has unsaved changes, which marks its hierarchy rows `modified`. */
    isDirty?(uriString: string): boolean;
    /** The repost hub's trailing window and timers (see createUsageRepostHub). */
    repostDelayMs?: number;
    repostTimers?: UsageRepostTimers;
}
/**
 * A folder, read once for its hierarchy, its Usage and its names. An app is handed one and does not
 * implement it, so a release may add to it.
 */
export interface FolderSession {
    /** The folder's hierarchy, for a tree (connectHierarchy) and for resolving a link by its rule. */
    readonly hierarchy: FolderHierarchy;
    /** The usage graphs, for a workspace's `usage`. */
    readonly usage: UsageGraphs;
    /** The entry names, for a search (searchEntries). */
    readonly names: NameIndex;
    /** The reposts a data table is owed when a model is created or deleted, for a workspace's `usageReposts`. */
    readonly reposts: UsageRepostHub;
    /** The cache every read goes through. */
    readonly cache: SourceCache;
    /**
     * The folder changed: `uris`, when given, are the files that did (created, deleted or saved);
     * absent, anything may have. Lists the folder once, compares the listing with the last, and
     * brings the four up to date. Calls made while one is running are taken together, as one more
     * listing. Resolves when everything is.
     */
    changed(uris?: readonly string[]): Promise<void>;
    /**
     * Whether the folder's last listing holds the file of `uri`: for an app deciding whether a
     * document it has open is one of the folder's (and so whether its Usage column is filled from
     * the folder). False before the folder has been listed (`listed()` resolves once it has); while
     * a change is being listed, the listing before it.
     */
    has(uri: string): boolean;
    /**
     * Resolves once the folder has been listed, and `has()` answers from that listing: at once when
     * it has been, else when the listing under way, or the one this asks for, answers. Rejects with
     * the error of a listing that failed, and a later call lists again. After `dispose()`, rejects
     * when the folder was never listed. For an app that needs the listing and not the whole
     * hierarchy: a folder reader across a channel answers a project's store only for a file it listed.
     */
    listed(): Promise<void>;
    /**
     * The project row of the folder `folderUri`, as `hierarchy.roots()` draws it: its `id` is the
     * uri of the project's marker (a `.prj`, or a `matlab.toml`), its `label` the project's name.
     * Undefined when no project's marker is in that folder. `folderUri` is spelled as the folder's
     * file uris are (`sourceUri`), with or without a trailing `/`. A folder holds one project; of
     * two markers in one folder, the hierarchy's project is the first listed.
     */
    projectIn(folderUri: string): Promise<HierarchyItem | undefined>;
    /** Stop: the watch is let go, reposts stop, and a later change does nothing. */
    dispose(): void;
}
/** A folder session: one listing, one cache, and the four things an app shows of a folder. */
export declare function createFolderSession(options: FolderSessionOptions): FolderSession;
