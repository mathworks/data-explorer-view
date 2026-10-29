import { type UsageRepostTimers } from './usageRepost.js';
/**
 * The app's watch on the folder: until disposed, it calls `changed` with the path of each file
 * created in it or deleted from it (`/`-separated). Any file: the hub keeps the models.
 */
export type WatchModelSet = (changed: (path: string) => void) => {
    dispose(): void;
};
/** How a hub watches, and what a change drops. */
export interface UsageRepostHubOptions {
    watch: WatchModelSet;
    /** The usage graphs a change drops before the reposts read them: the app's UsageGraphs. */
    graphs?: {
        invalidate(): void;
    };
    /** The trailing window a burst is collapsed into. Default USAGE_REPOST_DEBOUNCE_MS (300 ms). */
    delayMs?: number;
    /** The timers it waits with. Default the global ones. */
    timers?: UsageRepostTimers;
}
/** Reposts for the tables that fill a data file's Usage column, once per burst of models created or deleted. */
export interface UsageRepostHub {
    /**
     * Call `repost` when a model is created or deleted in the folder, once per burst: for a table
     * that fills a DATA file's Usage column (a dictionary's or a MAT-file's). A model's own table
     * needs none: its Usage is its own blocks and its own workspace, which no other model can change
     * (core's `usageScope`). `busy`, when given, is asked at the moment of the repost; while it
     * answers true the repost waits another window (see usageRepost.ts). Dispose it with the table.
     */
    subscribe(repost: () => void, busy?: () => boolean): {
        dispose(): void;
    };
    /** Stop: the watch is let go and a pending repost dropped, and a later subscription hears nothing. */
    dispose(): void;
}
/** A repost hub over the app's watch. */
export declare function createUsageRepostHub(options: UsageRepostHubOptions): UsageRepostHub;
