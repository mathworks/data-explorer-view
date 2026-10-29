import type { FolderHierarchyOptions } from '../hierarchy/folderHierarchy.js';
import type { TablePort } from './wire.js';
/**
 * A folder and how to read it: the `files` and the `reader` a FolderHierarchy is given. Served
 * from where the files are (serveFolder), or given to a FolderHierarchy beside them.
 */
export type FolderReads = Pick<FolderHierarchyOptions, 'files' | 'reader'>;
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
     * `onChange` listeners, for its hierarchy to read the folder again.
     */
    changed(): void;
    /** Stop answering. Reads still going are not answered. */
    dispose(): void;
}
/**
 * Answer the page's end of `port` (folderReader) from `folder`, until `dispose()`:
 *
 * - `list` with the folder's files, `folder.files.list()`, which this keeps as the listing, with
 *   `folder.reader(files)` its reader;
 * - `version`, `bytes` and `projectStore` with what that reader answers for the file of the
 *   listing the question names, or null for one it does not hold;
 * - a throw or a rejection with its message, for the page's call to reject with.
 *
 * `changed()` says the folder changed. Any other message is left alone, for whatever else listens
 * on the port (a table's, for one).
 *
 * In Electron's main process, over a `MessageChannelMain` port given to the page:
 * ```ts
 * const served = serveFolder({ files, reader }, {
 *   postMessage: (message) => port.postMessage(message),
 *   onMessage: (listener) => {
 *     const hear = (e: Electron.MessageEvent) => listener(e.data);
 *     port.on('message', hear);
 *     port.start();
 *     return () => port.off('message', hear);
 *   },
 * });
 * watcher.on('change', () => served.changed());
 * ```
 */
export declare function serveFolder(folder: FolderReads, port: TablePort, options?: ServeFolderOptions): FolderServer;
