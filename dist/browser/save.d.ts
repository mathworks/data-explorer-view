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
/** How a save in a browser ended: ShellHost's answer, `downloaded` where the bytes were handed to the browser as a download. */
export interface WebSaved {
    overwritten: boolean;
    downloaded?: true;
}
/**
 * Write `bytes` over the open file `path`, in place, or, for a file the page has no handle to, hand
 * them to the browser as a download under its name (made in `document`), which the page then holds
 * as the file.
 */
export declare function saveFile(files: WebFiles, path: string, bytes: Uint8Array, document: Document): Promise<WebSaved>;
/**
 * Write the open file `path`'s `bytes` where the user says, a file of its own kind: the path
 * written (`path` itself for a Save As onto it), or null when the user cancels. With no save picker
 * the bytes are downloaded, as a Save of a file with no handle is, and the answer is `path`: the
 * user has the file, so the document is saved.
 */
export declare function saveFileAs(files: WebFiles, path: string, bytes: Uint8Array, deps: SaveDeps): Promise<({
    path: string;
} & WebSaved) | null>;
/** Hand `bytes` to the browser as a download named `name`. */
export declare function download(document: Document, name: string, bytes: Uint8Array): void;
