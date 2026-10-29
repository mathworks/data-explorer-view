import type { SourceFile } from 'data-explorer-core';
/** A folder's files, in the folder's order: an array of them, which says when it is not all of them. */
export type FolderFileList = readonly SourceFile[] & {
    /**
     * True when the folder holds more supported files than these: its listing stopped at a limit,
     * keeping its first files. Absent or false: these are all of them.
     */
    readonly truncated?: boolean;
};
/** Whether a folder's listing was cut short (FolderFileList.truncated). */
export declare function isTruncated(files: readonly SourceFile[]): boolean;
/** `files` as a FolderFileList that says whether it was cut short. */
export declare function folderFileList(files: readonly SourceFile[], truncated: boolean): FolderFileList;
/**
 * The FolderFileList of a listing of paths, each listed under its `sourceUri`: for core's
 * `listFolder` (`data-explorer-core/node/folder`), whose `{ files, truncated }` this keeps.
 *
 * ```ts
 * const files: FolderFiles = { list: async () => listedFiles(await listFolder(root)) };
 * ```
 */
export declare function listedFiles(listing: {
    readonly files: readonly string[];
    readonly truncated?: boolean;
}): FolderFileList;
