import { type FolderReads } from '../model/source/serveFolder.js';
import { type WebFiles } from './files.js';
import { type BrowserDir } from './walk.js';
/**
 * The folder `dir`, shown at `root`, as serveFolder reads it. `limit` caps its listing. Its
 * `entries` are one level of a folder of it (the Folder view's), each at the path its listing
 * would give it: the root, and below it each name, a `/` between.
 */
export declare function webFolderReads(root: string, dir: BrowserDir, files: WebFiles, limit?: number): FolderReads;
/** A folder served in the page: what serveWebFolder returns. */
export interface WebFolderServer {
    /** The end of the channel the shell's showFolder reads the folder from. */
    port: MessagePort;
    /** Say the folder changed, `uris` the files that did (as the listing names them): serveFolder's changed. */
    changed(uris?: readonly string[]): void;
    /** Stop serving, and close this end of the channel. */
    close(): void;
}
/**
 * Serve the folder `dir`, shown at `root`, on a channel of the page's own. The bytes are handed
 * over, not copied: the reader keeps none.
 */
export declare function serveWebFolder(root: string, dir: BrowserDir, files: WebFiles, limit?: number): WebFolderServer;
/**
 * Look at the folder `dir`, shown at `root`, again: the files created, deleted or written (another
 * `lastModified:size`) since the last look, by their uris as the listing names them. The first look
 * only learns the folder. A listed folder's files are the folder as it was picked, and a look at
 * them finds nothing.
 */
export declare function folderLooks(root: string, dir: BrowserDir, limit?: number): () => Promise<string[]>;
