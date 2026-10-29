// Copyright 2026 The MathWorks, Inc.
//
// A folder's files as FolderFiles.list() answers them, and whether the listing was cut short.
//
// An ARRAY that may say it is partial, rather than an object around one: every list() written
// before still answers one (a plain SourceFile[] is a FolderFileList), and every caller still gets
// one to filter and map. The flag is a property of that array, so an array made from it (a
// filter, a slice, a spread) does not carry it, and neither does a structured clone: whoever
// copies a listing reads `truncated` first (FolderHierarchy, serveFolder), and the wire carries
// it as a field of its own.
//
// Import-free at run time but for sourceUri, so a host's entry can hold it (data-explorer-view/serve).
import type { SourceFile } from 'data-explorer-core';
import { sourceUri } from '../source/sourceUri.js';

/** A folder's files, in the folder's order: an array of them, which says when it is not all of them. */
export type FolderFileList = readonly SourceFile[] & {
  /**
   * True when the folder holds more supported files than these: its listing stopped at a limit,
   * keeping its first files. Absent or false: these are all of them.
   */
  readonly truncated?: boolean;
};

/** Whether a folder's listing was cut short (FolderFileList.truncated). */
export function isTruncated(files: readonly SourceFile[]): boolean {
  return (files as FolderFileList).truncated === true;
}

/** `files` as a FolderFileList that says whether it was cut short. */
export function folderFileList(files: readonly SourceFile[], truncated: boolean): FolderFileList {
  return truncated ? Object.assign([...files], { truncated: true }) : [...files];
}

/**
 * The FolderFileList of a listing of paths, each listed under its `sourceUri`: for core's
 * `listFolder` (`data-explorer-core/node/folder`), whose `{ files, truncated }` this keeps.
 *
 * ```ts
 * const files: FolderFiles = { list: async () => listedFiles(await listFolder(root)) };
 * ```
 */
export function listedFiles(listing: { readonly files: readonly string[]; readonly truncated?: boolean }): FolderFileList {
  return folderFileList(
    listing.files.map((path): SourceFile => ({ uriString: sourceUri(path), path })),
    listing.truncated === true,
  );
}
