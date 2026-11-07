/** The most bytes a file fetched from a web address may have: 64 MB. */
export declare const URL_SIZE_LIMIT: number;
/** How long a fetch and its read may take together, in milliseconds, before it is given up. */
export declare const URL_TIMEOUT_MS = 30000;
/** A web address the page fetches a data file from. */
export interface UrlTarget {
    /** The address as given, trimmed: what a link writes back, and what a message names. */
    given: string;
    /** What is fetched: `given` without its fragment, or for a GitHub file page or a forge's `/-/blob/` link the raw file behind it. */
    url: string;
    /** The file's name: the last part of `url`'s path, decoded. */
    name: string;
    /** The group its file joins (BrowserFiles.addToGroup): `url`'s folder, `new URL('.', url).href`, so files of one repo folder find each other. */
    group: string;
}
/**
 * `given` (what the user typed, or a `?url=` value) as the address to fetch, or why it is not
 * fetched: an address that is not `https:` (unless it is on `origin`, the page's own), one with a
 * user name or password in it, and one that names no file this app opens, are refused. GitHub's
 * file pages and a forge's `/-/blob/` links are rewritten to their raw files.
 */
export declare function urlTargetOf(given: string, origin: string): UrlTarget | {
    problem: string;
};
/** What fetchUrlBytes runs over. */
export interface UrlFetchDeps {
    /** The page's fetch (called as a plain function, so a default must be wrapped: `(u, i) => fetch(u, i)`). */
    fetch: (url: string, init: RequestInit) => Promise<Response>;
    /** Whether the browser says it is online (`navigator.onLine`). Absent: online. */
    online?: () => boolean;
    /** Default URL_TIMEOUT_MS. */
    timeoutMs?: number;
    /** Default URL_SIZE_LIMIT. */
    limit?: number;
}
/**
 * The bytes of the file at `target.url`, fetched with no credentials, following redirects, with
 * no referrer. Rejects with an Error whose message ends the sentence "<given> could not be
 * fetched: …".
 */
export declare function fetchUrlBytes(target: UrlTarget, deps: UrlFetchDeps): Promise<Uint8Array<ArrayBuffer>>;
