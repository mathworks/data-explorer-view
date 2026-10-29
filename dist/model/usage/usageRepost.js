// Copyright 2026 The MathWorks, Inc.
// When an open data tab reposts its Usage column because a model appeared or went away. From the
// VS Code extension's usageRepost.ts; usageRepostHub.ts adds the counting lifecycle around it.
//
// A data file's Usage cell names the blocks that read each of its variables, and only a model can
// add or remove such a block (core's `usageScope`). So a model created or deleted in the
// folder is the event that can leave an open dictionary's column wrong, and the usage graph
// being dropped (UsageGraphs.invalidate) was not enough on its own: the graph is rebuilt
// on the next QUERY, and an open tab asks only when it reposts — from its own file's watcher or
// its own edits. Until then it kept showing the edges of a folder that no longer existed.
//
// Two things keep the repost affordable, and both are decided here. One repost per tab per BURST:
// a branch switch can create or delete hundreds of models at once, and each repost rebuilds the
// tab's rows and its usage graph, so the window is trailing and every change inside it moves it.
// And only for a model (`repostsUsageOn`): nothing else can change what a Usage cell says, and
// most of what a burst touches is not a model.
//
// The timers are injected, so the timing is unit-tested over fake timers; the watcher that feeds
// it is the app's (usageRepostHub.ts's WatchModelSet).
import { basenameOf, isModelFile } from 'data-explorer-core';
/** The trailing window a burst of model creates and deletes is collapsed into. */
export const USAGE_REPOST_DEBOUNCE_MS = 300;
/**
 * How many windows a busy tab is waited for before it is reposted anyway.
 *
 * A busy tab is one with a write in flight (see `subscribe`). Its flag is cleared by the write's
 * change event, and a write that fires none leaves it set until the next change — so an unbounded
 * wait could leave the column stale for as long. Ten windows is three seconds, well past the
 * ~200 ms a write takes even on a large dictionary.
 */
export const USAGE_REPOST_MAX_WAITS = 10;
// Resolved at CALL time rather than captured, so the timers in force when a repost is scheduled
// are the ones used — which is also what lets a test's fake timers stand in for them.
const GLOBAL_TIMERS = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
};
export function createUsageRepostBus(delayMs = USAGE_REPOST_DEBOUNCE_MS, timers = GLOBAL_TIMERS) {
    const subscribers = new Set();
    // The tabs owed a repost. Only those open when the change happened: a tab resolved after it
    // builds its first rows from the graph the change already dropped, so that post is the fresh
    // one, and a second would only repeat it.
    const due = new Set();
    let timer;
    let disposed = false;
    const arm = () => {
        if (timer !== undefined)
            timers.clearTimeout(timer);
        timer = timers.setTimeout(fire, delayMs);
    };
    function fire() {
        timer = undefined;
        for (const sub of [...due]) {
            // Closed while the window was open, or by an earlier tab's repost in this same loop.
            if (!subscribers.has(sub)) {
                due.delete(sub);
                continue;
            }
            if (sub.busy?.() && sub.waits < USAGE_REPOST_MAX_WAITS) {
                sub.waits++;
                continue;
            }
            due.delete(sub);
            sub.waits = 0;
            try {
                sub.repost();
            }
            catch {
                // One tab that cannot repost is no reason to leave the others stale. Each provider's
                // repost reports its own failure in its own view.
            }
        }
        if (due.size > 0 && !disposed)
            arm();
    }
    return {
        schedule() {
            if (disposed)
                return;
            for (const sub of subscribers)
                due.add(sub);
            if (due.size > 0)
                arm();
        },
        subscribe(repost, busy) {
            const sub = { repost, busy, waits: 0 };
            if (!disposed)
                subscribers.add(sub);
            return {
                dispose() {
                    subscribers.delete(sub);
                    due.delete(sub);
                    if (due.size === 0 && timer !== undefined) {
                        timers.clearTimeout(timer);
                        timer = undefined;
                    }
                },
            };
        },
        dispose() {
            disposed = true;
            if (timer !== undefined)
                timers.clearTimeout(timer);
            timer = undefined;
            subscribers.clear();
            due.clear();
        },
    };
}
/**
 * True if a file created or deleted at `path` can change an open tab's Usage column: a model.
 *
 * Core's predicate, on the last path segment, because it is core's question (fileKinds) and a
 * second copy is how `Model.SLX` once went missing from one consumer and not another.
 */
export function repostsUsageOn(path) {
    return isModelFile(basenameOf(path));
}
