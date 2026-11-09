/** What a folder row lists: a folder, a file the app opens, or any other file (drawn dimmed). */
export type FolderEntryKind = 'folder' | 'data' | 'other';
/** One entry of a folder, one level down. `path` is in the host's path scheme (as SourceFile.path). */
export interface FolderEntry {
    /** Its name in its folder: what its row reads. */
    name: string;
    /** Where it is, as the host names it: a folder's for listing it in turn, a file's for opening it. */
    path: string;
    kind: FolderEntryKind;
}
/**
 * Folders first, then files; each by name, case-insensitively, then by code point (stable). The
 * code point decides between names that differ only in case (`A.slx` before `a.slx`), so a host
 * whose readdir answers in its own order gives one order every time, and a path decides between
 * two entries of one name (which no folder holds, but a host may send). A new array: the one given
 * is left as it was.
 */
export declare function sortEntries(entries: readonly FolderEntry[]): FolderEntry[];
/** 'data' for a path core opens (isSupportedPath from data-explorer-core), else 'other'. */
export declare function entryKindOf(path: string): 'data' | 'other';
