// Copyright 2026 The MathWorks, Inc.
//
// Data files fetched from web addresses: which addresses the browser host takes, what it fetches
// for each, and the fetch. An address may come from a link anyone wrote (`?url=`), so the rules are
// fixed here rather than left to each page:
//
// - Only `https:`, or the page's own origin (which is how a page serves its samples in development,
//   over `http://localhost`). A file fetched over plain http could be changed on the way, and a
//   `file:`, `data:` or `javascript:` address is no server's file at all.
// - No user name or password in the address: the address is what a link to the file writes back,
//   so whatever it holds goes to everyone the link is shared with. (A GitHub file page's raw
//   address is built from its path alone, so a token there would not even be sent: the file would
//   open, and the token go out in its links.)
// - Only a file this app opens: a dictionary, a model or a MAT-file. A project is refused too: its
//   page reads the folder around it, which a single address does not give. A name is the address's
//   last part decoded, so one with an escaped slash in it (`%2F`, `%5C`) is refused: the page's
//   paths would take it for a folder.
// - A file page is a page, the file shown in a web page of the site's, and its raw file is what is
//   meant. github.com's `/<owner>/<repo>/blob/<ref>/<path>` (and its `/raw/`, which redirects there)
//   is fetched from raw.githubusercontent.com, which answers any page with
//   `Access-Control-Allow-Origin: *`. A forge's `/-/blob/<ref>/<path>` link, on any host (a
//   company's own among them), is fetched from `/-/raw/<ref>/<path>` on that host: the rewrite goes
//   by the link's form, which no other site's path has. GitHub Enterprise is not rewritten: its
//   `/blob/` cannot be told from any other site's path.
// - No credentials: the fetch sends no cookies, so a link to a private file is refused by its server
//   rather than read with the cookies of whoever opens the link, and no referrer, since the page's
//   address can hold the other files' addresses.
// - A size cap and a time limit, both over the fetch and the read together: a file larger than the
//   page should hold, or a server that never finishes answering, would otherwise leave the tab
//   waiting with nothing said.
// - A browser lets a page read another origin's file only if that server says it may (CORS), and
//   it says nothing to the page of a refusal: a CORS refusal, a name that does not resolve and a
//   Content-Security-Policy refusal are one TypeError alike. That error is said as CORS, the cause
//   a user can do something about, unless the browser says it is offline.
//
// DOM types only: the browser host's, and nothing here draws.
import { isGraphPath } from 'data-explorer-core';
/** The most bytes a file fetched from a web address may have: 64 MB. */
export const URL_SIZE_LIMIT = 64 * 1024 * 1024;
/** How long a fetch and its read may take together, in milliseconds, before it is given up. */
export const URL_TIMEOUT_MS = 30_000;
// github.com's file page and raw link: owner, repo, then the ref and the path (a ref may hold a slash).
const GITHUB_FILE = /^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/;
// A forge's `/-/blob/` link: the project's path (its groups may nest), then the ref and the path.
const DASH_BLOB = /^(\/.+?)\/-\/blob\/(.+)$/;
/** What is fetched for `url`: the raw file behind a GitHub file page or a forge's `/-/blob/` link, else `url` with no fragment. */
function rawOf(url) {
    const github = url.hostname === 'github.com' ? GITHUB_FILE.exec(url.pathname) : null;
    // The page's query and fragment are the page's (`?raw=true`, `#L3`), not the raw file's.
    if (github)
        return `https://raw.githubusercontent.com/${github[1]}/${github[2]}/${github[3]}`;
    const dashBlob = DASH_BLOB.exec(url.pathname);
    if (dashBlob)
        return `${url.origin}${dashBlob[1]}/-/raw/${dashBlob[2]}`;
    const fetched = new URL(url.href);
    fetched.hash = '';
    return fetched.href;
}
/** The last part of `url`'s path, decoded; as written when it is no valid escape. */
function nameOf(url) {
    const { pathname } = new URL(url);
    const last = pathname.slice(pathname.lastIndexOf('/') + 1);
    try {
        return decodeURIComponent(last);
    }
    catch {
        return last;
    }
}
/**
 * `given` (what the user typed, or a `?url=` value) as the address to fetch, or why it is not
 * fetched: an address that is not `https:` (unless it is on `origin`, the page's own), one with a
 * user name or password in it, and one that names no file this app opens, are refused. GitHub's
 * file pages and a forge's `/-/blob/` links are rewritten to their raw files.
 */
export function urlTargetOf(given, origin) {
    given = given.trim();
    let parsed;
    try {
        // No base: a relative address is no address to share.
        parsed = new URL(given);
    }
    catch {
        return { problem: `${given} is not a web address.` };
    }
    const own = parsed.protocol === 'http:' && parsed.origin === origin;
    if (parsed.protocol !== 'https:' && !own)
        return { problem: `${given} is not an https: address.` };
    if (parsed.username || parsed.password)
        return { problem: `${given} holds a user name or password, which a link must not.` };
    const url = rawOf(parsed);
    const name = nameOf(url);
    if (/[/\\]/.test(name))
        return { problem: `${given} names a file with a slash in its name.` };
    if (!isGraphPath(name))
        return { problem: `${given} is not a file this app opens (.sldd, .slx, .mdl, .mat).` };
    return { given, url, name, group: new URL('.', url).href };
}
const MB = 1024 * 1024;
/** `limit` as a sentence says it: in MB when it is whole ones (the cap is), else in bytes. */
const sizeText = (limit) => (limit >= MB && limit % MB === 0 ? `${limit / MB} MB` : `${limit} bytes`);
/** Whether a `content-type` is a web page's, which a file page or a sign-in page answers. */
const isWebPage = (type) => type?.split(';')[0].trim().toLowerCase() === 'text/html';
/** Let go of a body that will not be read, so the browser can drop the connection. */
function drop(response) {
    response.body?.cancel().catch(() => undefined);
}
/**
 * A promise that rejects as `signal` aborts, and never settles otherwise; and `stop`, which takes
 * its listener off the signal once the race it is in is over.
 */
function abortOf(signal) {
    let onAbort = () => undefined;
    const aborted = new Promise((_, reject) => {
        onAbort = () => reject(signal.reason);
    });
    signal.addEventListener('abort', onAbort, { once: true });
    return { aborted, stop: () => signal.removeEventListener('abort', onAbort) };
}
/**
 * Every byte of `response`'s body, refused past `limit`, and given up when `signal` aborts. A
 * response's body is aborted with its fetch in a browser; a body that is not (a test's, a service
 * worker's) is cancelled here, so a read waiting on it ends either way.
 */
async function readAll(response, limit, signal) {
    // Aborted already, no abort is heard again: a read would wait on a body nothing cancels.
    signal.throwIfAborted();
    if (!response.body) {
        const whole = new Uint8Array(await response.arrayBuffer());
        if (whole.length > limit)
            throw new Error(`the file is larger than ${sizeText(limit)}`);
        return whole;
    }
    const reader = response.body.getReader();
    const stop = () => void reader.cancel().catch(() => undefined);
    signal.addEventListener('abort', stop);
    try {
        const chunks = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            // A read the abort's cancel ended reads as done: it is no end of the file.
            if (signal.aborted)
                throw new Error('aborted');
            if (done)
                break;
            total += value.length;
            if (total > limit) {
                stop();
                throw new Error(`the file is larger than ${sizeText(limit)}`);
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(total);
        let at = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, at);
            at += chunk.length;
        }
        return bytes;
    }
    finally {
        signal.removeEventListener('abort', stop);
    }
}
/**
 * The bytes of the file at `target.url`, fetched with no credentials, following redirects, with
 * no referrer. Rejects with an Error whose message ends the sentence "<given> could not be
 * fetched: …".
 */
export async function fetchUrlBytes(target, deps) {
    const limit = deps.limit ?? URL_SIZE_LIMIT;
    const timeoutMs = deps.timeoutMs ?? URL_TIMEOUT_MS;
    // One time for the fetch and the read: the timeout's abort ends whichever is under way, and the
    // flag tells its abort from any other error.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
    }, timeoutMs);
    // Whether the server answered: a TypeError before it did is the request refused (CORS, say).
    let answered = false;
    // Called as a plain function: a window's fetch called as a method of `deps` would throw.
    const { fetch } = deps;
    const abort = abortOf(controller.signal);
    try {
        const asked = fetch(target.url, {
            credentials: 'omit',
            redirect: 'follow',
            mode: 'cors',
            referrerPolicy: 'no-referrer',
            signal: controller.signal,
        });
        // A fetch that does not heed its signal (a page's own, a test's) is given up all the same, and
        // an answer that comes after is let go.
        asked.then((late) => controller.signal.aborted && drop(late), () => undefined);
        const response = await Promise.race([asked, abort.aborted]);
        answered = true;
        if (!response.ok) {
            drop(response);
            throw new Error(`${response.status} ${response.statusText}`.trim());
        }
        if (isWebPage(response.headers.get('content-type'))) {
            drop(response);
            throw new Error('the server answered with a web page');
        }
        // A length the server declares is refused before a byte is read.
        if (Number(response.headers.get('content-length')) > limit) {
            drop(response);
            throw new Error(`the file is larger than ${sizeText(limit)}`);
        }
        return await readAll(response, limit, controller.signal);
    }
    catch (err) {
        if (timedOut)
            throw new Error(`the server did not answer within ${timeoutMs / 1000} s`);
        if (err instanceof TypeError && deps.online?.() === false)
            throw new Error('the browser is offline');
        if (err instanceof TypeError && !answered)
            throw new Error("that server doesn't let pages read its files (CORS)");
        throw err instanceof Error ? err : new Error(String(err));
    }
    finally {
        clearTimeout(timer);
        abort.stop();
    }
}
