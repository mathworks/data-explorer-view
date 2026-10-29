/** The one method of a webview this needs. */
export interface PostTarget {
    postMessage(message: unknown): PromiseLike<boolean>;
}
/**
 * Post a payload; on failure, post the error banner instead.
 *
 * Returns whether the payload itself went out, for a caller that has follow-up work
 * only a delivered payload makes sense of (a selection to drain, a grid to reopen).
 *
 * `what` names the file, because the sentence the user reads has to say which tab
 * failed — the view it appears in may not be the one they were last looking at.
 *
 * A failure to deliver the FALLBACK is swallowed: it means the webview is gone (a
 * closed tab, a disposed panel), there is nothing left to tell, and an unhandled
 * rejection thrown from the handler of an unhandled rejection is how a reported bug
 * becomes two.
 */
export declare function postOrReport(webview: PostTarget, payload: unknown, what: string): Promise<boolean>;
/**
 * Post a payload; if it cannot be posted, post the smaller one `fallback` builds instead,
 * and report only if that fails too.
 *
 * For the read-only table, whose payload holds every name in the file (lazyRows.ts) and so
 * is bounded by the file rather than by the row cap. A JSON dictionary near the reader's
 * 512 MB limit is about a million rows of about 500 bytes each, which `JSON.stringify` cannot
 * serialize. Without this that file would show the error banner where the cap used to show
 * its first 100,000 rows; with it, the view still shows them, under the cap's banner.
 *
 * `fallback` is called only on a failure, so the common case builds nothing. It answers
 * `undefined` when there is nothing smaller to offer, and then the first failure is reported:
 * the same payload again would fail the same way. True when either payload went out.
 */
export declare function postOrFallback(webview: PostTarget, payload: unknown, fallback: () => unknown, what: string): Promise<boolean>;
