import { type FilePickers } from './fsAccess.js';
import type { WebFiles } from './files.js';
/** The window and document a save is made in. */
export interface SaveDeps {
    /** Where the save picker is looked for. */
    window: FilePickers;
    /** Where a download's link is made, when there is no save picker. */
    document: Document;
}
/** How long a download's URL is kept: the browser reads it after the click, not during it. */
export declare const REVOKE_MS = 60000;
/** Write `bytes` over the open file `path`, in place. */
export declare function saveFile(files: WebFiles, path: string, bytes: Uint8Array): Promise<{
    overwritten: boolean;
}>;
/**
 * Write the open file `path`'s `bytes` where the user says, a file of its own kind: the path
 * written (`path` itself for a Save As onto it), or null when the user cancels. With no save picker
 * the bytes are downloaded, and the answer is `path`: the user has the file, so the document is saved.
 */
export declare function saveFileAs(files: WebFiles, path: string, bytes: Uint8Array, deps: SaveDeps): Promise<{
    path: string;
    overwritten: boolean;
} | null>;
/**
 * Hand `bytes` to the browser as a download named `name`: Save As with no save picker, and the Save
 * of a new file the page keeps (newFile.ts).
 */
export declare function download(document: Document, name: string, bytes: Uint8Array): void;
