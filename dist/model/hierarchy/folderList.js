import { sourceUri } from '../source/sourceUri.js';
/** Whether a folder's listing was cut short (FolderFileList.truncated). */
export function isTruncated(files) {
    return files.truncated === true;
}
/** `files` as a FolderFileList that says whether it was cut short. */
export function folderFileList(files, truncated) {
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
export function listedFiles(listing) {
    return folderFileList(listing.files.map((path) => ({ uriString: sourceUri(path), path })), listing.truncated === true);
}
