import type { WebFiles } from './files.js';
/** How often the open files are looked at while the page is shown, in milliseconds. */
export declare const POLL_MS = 2000;
/** The open files a browser host watches: what watchOpenFiles returns. */
export interface OpenFileWatch {
    /** Watch `path`, known by `stamp` (the version the page read), or by what the next look sees. */
    watch(path: string, stamp?: string | null): void;
    /** Stop watching `path`: its tab closed. */
    unwatch(path: string): void;
    /** The page starts writing `path`: what a look sees until this write's `ownWrite` is no change. */
    saving(path: string): void;
    /** The page's write of `path` left it as `stamp` (null: it failed, or wrote elsewhere), which is no change. */
    ownWrite(path: string, stamp: string | null): void;
    /** Stop looking at every file. */
    dispose(): void;
}
/** Look at the open files of `files` every POLL_MS while `document` is shown; a changed one goes to `onChanged`. */
export declare function watchOpenFiles(files: WebFiles, onChanged: (path: string) => void, deps: {
    document: Pick<Document, 'visibilityState'>;
}): OpenFileWatch;
