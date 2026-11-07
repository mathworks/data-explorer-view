import type { FolderEntry } from '../hierarchy/folderEntries.js';
import type { FolderHierarchyOptions } from '../hierarchy/folderHierarchy.js';
import type { TablePort } from './wire.js';
/**
 * A folder and how to read it: the `files` and the `reader` a FolderHierarchy is given, and for
 * a tree of every entry (FolderTree) its folders one level at a time. Served from where the files
 * are (serveFolder), or given to a FolderHierarchy beside them.
 */
export type FolderReads = Pick<FolderHierarchyOptions, 'files' | 'reader'> & {
    /**
     * One level of `dir`. Absent: the served folder answers a `list` with a `dir` with `refused`.
     *
     * `dir` is the page's, not trusted: list only a folder this host serves, and throw for any
     * other, with the reason the page's call rejects with. A folder that cannot be read throws too
     * (its permissions, gone). The order is the host's own: the page sorts (sortEntries).
     *
     * Containment is easy to get wrong. A `..` segment (`/w/models/../../etc`) climbs out of a path
     * that starts with the root; a prefix test without the separator lets `/w-other` pass as inside
     * `/w`; a symbolic link inside the root names a folder outside it, which a test of the path
     * alone never sees. The safe form: answer only the root itself or a folder this host returned
     * as an entry (a set of the paths it answered with), each realpath'd as it is answered, and
     * compare a realpath'd `dir` against that set; never resolve or join the page's path to decide.
     */
    entries?(dir: string): Promise<readonly FolderEntry[]>;
};
/** How serveFolder answers. */
export interface ServeFolderOptions {
    /**
     * Hand a file's bytes over rather than copy them: `port.postMessage` is called with the bytes'
     * ArrayBuffer in a transfer list, its second argument, as a worker's or a `MessagePort`'s
     * postMessage takes one, and the reader's buffer is left detached. Only for such a port (not a
     * window's postMessage, whose second argument is an origin, nor Electron's `MessagePortMain`,
     * which transfers only ports), and a reader that keeps none of the buffers it answers. Default
     * false: the bytes are copied.
     */
    transfer?: boolean;
}
/** A folder being served: what serveFolder returns. */
export interface FolderServer {
    /**
     * Say the folder changed (a file created, deleted or saved): the page's folderReader tells its
     * `onChange` listeners, for its hierarchy to read the folder again. `uris`, when the host knows
     * them, are the files the change touched, as the listing names them (`sourceUri(path)`): a hint
     * that does not say how each changed (wire.ts FolderChangedMessage). Absent: something changed.
     * Each call is one message, as it is made: a watcher's burst is the host's to gather (core's
     * `watchFolder` reports one burst once).
     */
    changed(uris?: readonly string[]): void;
    /** Stop answering. Reads still going are not answered. */
    dispose(): void;
}
/**
 * Answer the page's end of `port` (folderReader) from `folder`, until `dispose()`:
 *
 * - `list` with the folder's files, `folder.files.list()`, which this keeps as the listing, with
 *   `folder.reader(files)` its reader, and `truncated` when the listing says it was cut short;
 * - `list` with a `dir` with what `folder.entries` lists of that folder, in `entries`, each
 *   entry's name, path and kind alone, and kept as no listing; or `refused` when the folder lists
 *   no entries or `dir` is not a string;
 * - `version`, `bytes` and `projectStore` with what that reader answers for the file of the
 *   listing whose uriString is the question's `uri`, exactly, given the listing's own SourceFile;
 * - every other question about a file `refused`, with nothing read: a uri the listing does not
 *   hold (outside the folder, with `..`, a look-alike prefix, another scheme or spelling), none,
 *   one asked before any listing, an `ask` the wire does not have;
 * - a throw or a rejection with its message, for the page's call to reject with.
 *
 * The page is not trusted: what reaches the reader is only ever a file the folder listed, so a
 * reader that trusts its caller's SourceFile (core's reads its `path`) is never handed the page's.
 * A project store is whatever the reader's `projectStore` answers for a listed file, which need
 * not be a project's marker: a reader decides which files have a store, and one that reads the
 * folder beside any file it is given lets the page read that much. A folder's entries are the
 * names `folder.entries` lists for a folder the page names, which is the host's to refuse
 * (FolderReads.entries): no file is read for them.
 *
 * `changed(uris?)` says the folder changed. Any other message is left alone, for whatever else
 * listens on the port (a table's, for one).
 *
 * In Electron's main process, over a `MessageChannelMain` port given to the page (README, "Serve a
 * folder from Electron's main process"):
 * ```ts
 * const served = serveFolder(
 *   { files: { list: async () => listedFiles(await listFolder(root)) }, reader },
 *   portFromMainPort(port1),
 * );
 * watchFolder(root, (paths) => served.changed(paths?.map(sourceUri))); // core's node/folder
 * ```
 */
export declare function serveFolder(folder: FolderReads, port: TablePort, options?: ServeFolderOptions): FolderServer;
