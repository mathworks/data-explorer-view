import { type SourceCache, type SourceFile } from 'data-explorer-core';
import { FolderHierarchy, type FolderFiles } from '../hierarchy/folderHierarchy.js';
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
/** A folder, read once for its hierarchy, its Usage and its names. */
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
    /** Stop: the watch is let go, reposts stop, and a later change does nothing. */
    dispose(): void;
}
/** A folder session: one listing, one cache, and the four things an app shows of a folder. */
export declare function createFolderSession(options: FolderSessionOptions): FolderSession;
