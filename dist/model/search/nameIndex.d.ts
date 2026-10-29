import { type SourceCache, type SourceFile } from 'data-explorer-core';
import type { FolderFiles } from '../hierarchy/folderHierarchy.js';
import type { NameRecord } from './nameExtract.js';
import { type NameReader } from './nameScan.js';
/** What a NameIndex reads its folder with. */
export interface NameIndexOptions {
    /** The folder's files a name index reads: the kinds a usage graph reads (core's `isGraphPath`), no projects. */
    files: FolderFiles;
    /**
     * The reader for one pass's files: it answers only for them, and gives an open file's unsaved
     * bytes (`dirtyBytes`), which the index prefers over the file on disk and caches nowhere.
     */
    reader(files: readonly SourceFile[]): NameReader;
    /**
     * The cache the reads go through. Share the one the app's other folder passes read (its
     * FolderHierarchy's, its UsageGraphs'), so a folder is read once for all of them. Default: one
     * of its own.
     */
    cache?: SourceCache;
}
/** A folder's entry names: every dictionary entry, MAT-file variable, model-workspace variable and block. */
export declare class NameIndex {
    /** The cache its reads go through. */
    readonly cache: SourceCache;
    private readonly options;
    private index;
    private building;
    constructor(options: NameIndexOptions);
    /** Drop the whole index; the next query reads the folder again. For a change a targeted reindex does not cover. */
    invalidate(): void;
    /**
     * Build the index if it is not built (once, however many ask at once). Resolves once there is
     * an index: a build an invalidate() dropped while it ran publishes nothing, so a caller that was
     * waiting on it waits on the build after it.
     */
    ensure(): Promise<void>;
    /** Every name record of the folder, file by file, each occurrence its own. */
    list(): Promise<NameRecord[]>;
    /**
     * Read `file` again and replace its bucket: for a file saved, or edited (its unsaved bytes,
     * through the reader's `dirtyBytes`). Before the first build this does nothing — an index built
     * off a single file would give incomplete answers, so the first query does the full scan.
     */
    reindex(file: SourceFile): Promise<void>;
    /** Drop one file's bucket (the file was deleted). Safe before the build. */
    remove(uriString: string): void;
    private build;
}
