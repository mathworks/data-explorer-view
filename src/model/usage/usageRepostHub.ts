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
import { createUsageRepostBus, repostsUsageOn, type UsageRepostTimers } from './usageRepost.js';

/**
 * The app's watch on the folder: until disposed, it calls `changed` with the path of each file
 * created in it or deleted from it (`/`-separated). Any file: the hub keeps the models.
 */
export type WatchModelSet = (changed: (path: string) => void) => { dispose(): void };

/** How a hub watches, and what a change drops. */
export interface UsageRepostHubOptions {
  watch: WatchModelSet;
  /** The usage graphs a change drops before the reposts read them: the app's UsageGraphs. */
  graphs?: { invalidate(): void };
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
  subscribe(repost: () => void, busy?: () => boolean): { dispose(): void };
}

/** A repost hub over the app's watch. */
export function createUsageRepostHub(options: UsageRepostHubOptions): UsageRepostHub {
  let live: { bus: ReturnType<typeof createUsageRepostBus>; watch: { dispose(): void }; tables: number } | null = null;

  const start = () => {
    const bus = createUsageRepostBus(options.delayMs, options.timers);
    const watch = options.watch((path) => {
      if (!repostsUsageOn(path)) return;
      // Dropped here, before the repost is owed, so that what it reads is the folder as it is.
      // Cheap: the per-file summaries survive it (see UsageGraphs.invalidate).
      options.graphs?.invalidate();
      bus.schedule();
    });
    return { bus, watch, tables: 0 };
  };

  return {
    subscribe(repost, busy) {
      live ??= start();
      const owner = live;
      owner.tables++;
      const sub = owner.bus.subscribe(repost, busy);
      let disposed = false;
      return {
        dispose() {
          if (disposed) return;
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
  };
}
