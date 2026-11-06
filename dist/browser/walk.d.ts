import type { BrowserSource } from './files.js';
/** A file of a folder the browser listed when it was picked, by its `/`-separated path in the folder. */
export interface ListedFile {
    /** The file's path in the folder, the folder's own name not included: `sub/plant.sldd`. */
    rel: string;
    /** The file, as the browser gave it then: a reference that reads what the file holds now, if the browser lets it. */
    file: File;
}
/**
 * A folder the user picked: a handle to read it through, as it is each time it is read; or the
 * files the browser listed in it then, which a look at the folder later cannot add to.
 */
export type BrowserDir = {
    kind: 'handle';
    handle: FileSystemDirectoryHandle;
} | {
    kind: 'list';
    /** The folder's own name. */
    root: string;
    files: readonly ListedFile[];
    /** The browser's reading of the folder stopped at a limit (a dropped folder's): it holds more than `files`. */
    truncated?: boolean;
};
/** The most files a listing holds unless told otherwise: core's FOLDER_FILE_LIMIT. */
export declare const FOLDER_FILE_LIMIT = 10000;
/** A folder's supported files, as listDirectory finds them. */
export interface WebListing {
    /** The supported files by their `/`-separated path in the folder, in the listing's order. */
    files: string[];
    /** True when the folder holds more supported files than `files`. */
    truncated: boolean;
    /** What reads each of `files`. */
    sources: ReadonlyMap<string, BrowserSource>;
}
/** The folder's own name. */
export declare const dirName: (dir: BrowserDir) => string;
/** A directory the listing does not enter: core's skipDirectory. */
export declare const skipDirectory: (name: string) => boolean;
/** Code-unit order (JavaScript's `<`): the same on every machine, unlike `localeCompare`. */
export declare const byCodeUnit: (a: string, b: string) => number;
/**
 * The supported files of `dir`, by core's listing rules, up to `limit` (FOLDER_FILE_LIMIT by
 * default; a non-negative whole number). Never rejects for the folder's contents: a directory that
 * cannot be read is passed over.
 */
export declare function listDirectory(dir: BrowserDir, { limit }?: {
    limit?: number;
}): Promise<WebListing>;
