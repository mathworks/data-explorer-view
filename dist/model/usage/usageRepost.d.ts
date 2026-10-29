/** The trailing window a burst of model creates and deletes is collapsed into. */
export declare const USAGE_REPOST_DEBOUNCE_MS = 300;
/**
 * How many windows a busy tab is waited for before it is reposted anyway.
 *
 * A busy tab is one with a write in flight (see `subscribe`). Its flag is cleared by the write's
 * change event, and a write that fires none leaves it set until the next change — so an unbounded
 * wait could leave the column stale for as long. Ten windows is three seconds, well past the
 * ~200 ms a write takes even on a large dictionary.
 */
export declare const USAGE_REPOST_MAX_WAITS = 10;
export interface UsageRepostTimers {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
}
export interface UsageRepostBus {
    /** A model was created or deleted: owe every open tab one repost, once the burst is over. */
    schedule(): void;
    /**
     * Repost this tab when a model is created or deleted. `busy`, when given, is asked at the
     * moment of the repost; while it answers true the tab is asked again one window later, up to
     * USAGE_REPOST_MAX_WAITS windows.
     */
    subscribe(repost: () => void, busy?: () => boolean): {
        dispose(): void;
    };
    /** Drop every tab and any pending repost; later changes are ignored. */
    dispose(): void;
}
export declare function createUsageRepostBus(delayMs?: number, timers?: UsageRepostTimers): UsageRepostBus;
/**
 * True if a file created or deleted at `path` can change an open tab's Usage column: a model.
 *
 * Core's predicate, on the last path segment, because it is core's question (fileKinds) and a
 * second copy is how `Model.SLX` once went missing from one consumer and not another.
 */
export declare function repostsUsageOn(path: string): boolean;
