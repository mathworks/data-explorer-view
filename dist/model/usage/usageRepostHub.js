// Copyright 2026 The MathWorks, Inc.
// The repost bus's lifecycle (usageRepost.ts): the watch that tells it a model was created or
// deleted, held only while a table that fills a data file's Usage column is open. From the VS
// Code extension's usageRepostWatch.ts, with its watcher behind WatchModelSet.
//
// The watch is created by the first subscription and disposed with the last, together with any
// repost still pending, so an app with no such table open pays nothing for it. And everything
// from the change to the repost is one module's: the change drops the usage graphs first, so what
// the repost reads does not depend on another listener having run before it.
//
// Create and delete only. A model CHANGED on disk can move a usage edge too (MATLAB saving it with
// a new dictionary link, or a block reading a different variable), and does not repost an open
// data table yet.
import { createUsageRepostBus, repostsUsageOn } from './usageRepost.js';
/** A repost hub over the app's watch. */
export function createUsageRepostHub(options) {
    let live = null;
    let stopped = false;
    const start = () => {
        const bus = createUsageRepostBus(options.delayMs, options.timers);
        const watch = options.watch((path) => {
            if (!repostsUsageOn(path))
                return;
            // Dropped here, before the repost is owed, so that what it reads is the folder as it is.
            // Cheap: the per-file summaries survive it (see UsageGraphs.invalidate).
            options.graphs?.invalidate();
            bus.schedule();
        });
        return { bus, watch, tables: 0 };
    };
    return {
        subscribe(repost, busy) {
            if (stopped)
                return { dispose() { } };
            live ??= start();
            const owner = live;
            owner.tables++;
            const sub = owner.bus.subscribe(repost, busy);
            let disposed = false;
            return {
                dispose() {
                    if (disposed)
                        return;
                    disposed = true;
                    sub.dispose();
                    owner.tables--;
                    if (owner.tables === 0 && live === owner) {
                        owner.bus.dispose();
                        owner.watch.dispose();
                        live = null;
                    }
                },
            };
        },
        dispose() {
            stopped = true;
            live?.bus.dispose();
            live?.watch.dispose();
            live = null;
        },
    };
}
