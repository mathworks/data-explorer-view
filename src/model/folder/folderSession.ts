// Copyright 2026 The MathWorks, Inc.
//
// A folder, read once for everything an app shows of it: its hierarchy (FolderHierarchy), the
// usage graphs its tables' Usage column is filled from (UsageGraphs), the names a search finds
// (NameIndex), and the reposts a data table is owed when a model comes or goes (UsageRepostHub).
//
// Each of the four could be made on its own, and then each listed the folder for itself and had
// a reader of its own: two listings per change, and a change told to each in a different way. The
// session holds the one listing and the one source cache they all read through, and turns a
// change into what each needs: a new listing, diffed against the last, then the graphs dropped,
// the names reindexed (or removed) for just the files that changed, the hierarchy rebuilt, and the
// hub owed a repost when a model was created or deleted.
//
// DOM-free: the app lists the folder and reads its files (FolderFiles, the reader); a FolderReader
// across a channel is both, and its onChange is a watch.
import { isGraphPath, newSourceCache, type SourceCache, type SourceFile } from 'data-explorer-core';
import { FolderHierarchy, type FolderFiles } from '../hierarchy/folderHierarchy.js';
import type { GraphReader } from '../hierarchy/graphSources.js';
import { NameIndex } from '../search/nameIndex.js';
import type { NameReader } from '../search/nameScan.js';
import { UsageGraphs } from '../usage/usageGraphs.js';
import { createUsageRepostHub, type UsageRepostHub } from '../usage/usageRepostHub.js';
import type { UsageRepostTimers } from '../usage/usageRepost.js';

/**
 * The app's watch on the folder: until stopped, it calls `changed` for each change, with the uris
 * of the files that changed when it knows them (absent: anything may have). A FolderReader's
 * `onChange` is one; so is any `(listener) => { dispose }`.
 */
export type WatchFolder = (changed: (uris?: readonly string[]) => void) => (() => void) | { dispose(): void };

/** What a folder session reads, and how it hears that the folder changed. */
export interface FolderSessionOptions {
  /** The folder: its supported files, in a stable order (folder order decides which of two same-named files a name means). */
  files: FolderFiles;
  /**
   * The reader for one pass's files: their versions and bytes, a project's store, and, for an app
   * that edits, an open file's unsaved bytes (`dirtyBytes`, which the names prefer and nothing
   * caches). A FolderReader is one, whatever files it is given.
   */
  reader(files: readonly SourceFile[]): GraphReader & Partial<Pick<NameReader, 'dirtyBytes'>>;
  /** The watch that calls `changed()`. Without one, the app calls it. */
  watch?: WatchFolder;
  /** The cache every read goes through. Default: one of its own. */
  cache?: SourceCache;
  /** Whether a file has unsaved changes, which marks its hierarchy rows `modified`. */
  isDirty?(uriString: string): boolean;
  /** The repost hub's trailing window and timers (see createUsageRepostHub). */
  repostDelayMs?: number;
  repostTimers?: UsageRepostTimers;
}

/** A folder, read once for its hierarchy, its Usage and its names. */
export interface FolderSession {
  /** The folder's hierarchy, for a tree (connectHierarchy) and for resolving a link by its rule. */
  readonly hierarchy: FolderHierarchy;
  /** The usage graphs, for a workspace's `usage`. */
  readonly usage: UsageGraphs;
  /** The entry names, for a search (searchEntries). */
  readonly names: NameIndex;
  /** The reposts a data table is owed when a model is created or deleted, for a workspace's `usageReposts`. */
  readonly reposts: UsageRepostHub;
  /** The cache every read goes through. */
  readonly cache: SourceCache;
  /**
   * The folder changed: `uris`, when given, are the files that did (created, deleted or saved);
   * absent, anything may have. Lists the folder once, compares the listing with the last, and
   * brings the four up to date. Calls made while one is running are taken together, as one more
   * listing. Resolves when everything is.
   */
  changed(uris?: readonly string[]): Promise<void>;
  /** Stop: the watch is let go, reposts stop, and a later change does nothing. */
  dispose(): void;
}

/** What one listing changed: by uri. */
interface Diff {
  created: SourceFile[];
  deleted: SourceFile[];
  /** In both listings. */
  kept: SourceFile[];
}

function diff(before: readonly SourceFile[], after: readonly SourceFile[]): Diff {
  const was = new Map(before.map((f) => [f.uriString, f]));
  const now = new Set(after.map((f) => f.uriString));
  return {
    created: after.filter((f) => !was.has(f.uriString)),
    deleted: before.filter((f) => !now.has(f.uriString)),
    kept: after.filter((f) => was.has(f.uriString)),
  };
}

/** A folder session: one listing, one cache, and the four things an app shows of a folder. */
export function createFolderSession(options: FolderSessionOptions): FolderSession {
  const cache = options.cache ?? newSourceCache();
  const reader = options.reader;
  // The listing everything reads: asked once, when first needed, and again on each change.
  let listing: Promise<readonly SourceFile[]> | null = null;
  // The last listing that answered, to diff the next one against.
  let listed: readonly SourceFile[] | null = null;
  let disposed = false;

  const current = (): Promise<readonly SourceFile[]> => {
    if (!listing) {
      const asking = options.files.list();
      listing = asking;
      asking.then(
        (files) => {
          if (listing === asking) listed = files;
        },
        // A listing that failed is not kept: the next ask lists again.
        () => {
          if (listing === asking) listing = null;
        },
      );
    }
    return listing;
  };
  // The kinds a usage graph and a name index read: no projects, which define no variables.
  const graphFiles = async (): Promise<SourceFile[]> => (await current()).filter((f) => isGraphPath(f.path));

  const hierarchy = new FolderHierarchy({
    files: { list: current },
    reader,
    cache,
    ...(options.isDirty ? { isDirty: options.isDirty } : {}),
  });
  const usage = new UsageGraphs({
    // The folder, and nothing an editor holds open beside it.
    inputs: { inputsKey: () => '', candidates: graphFiles, readerFor: reader },
    cache,
  });
  const names = new NameIndex({
    files: { list: graphFiles },
    reader: (files) => {
      const r = reader(files);
      return { ...r, dirtyBytes: r.dirtyBytes ?? (() => null) };
    },
    cache,
  });

  // The hub's watch is the session's own diff: every file created or deleted, which the hub keeps
  // the models of. Held only while a data table is subscribed, as any hub's watch is.
  const modelSet = new Set<(path: string) => void>();
  const reposts = createUsageRepostHub({
    watch: (changed) => {
      modelSet.add(changed);
      return { dispose: () => void modelSet.delete(changed) };
    },
    graphs: usage,
    ...(options.repostDelayMs === undefined ? {} : { delayMs: options.repostDelayMs }),
    ...(options.repostTimers ? { timers: options.repostTimers } : {}),
  });

  // One change at a time; a change asked for while one runs waits, and every change asked for
  // meanwhile is taken together as one more listing (a hint of all of them, or none if any had none).
  let running: Promise<void> | null = null;
  let queued: { uris: Set<string> | null; done: Promise<void>; resolve: () => void } | null = null;

  async function apply(uris: ReadonlySet<string> | null): Promise<void> {
    const before = listed;
    listing = null;
    let after: readonly SourceFile[];
    try {
      after = await current();
    } catch {
      // The folder could not be listed: everything asks again, and says why, on its next query.
      usage.invalidate();
      names.invalidate();
      hierarchy.rebuild();
      return;
    }
    if (disposed) return;
    usage.invalidate();
    if (!before) {
      // Nothing was listed before: nothing to tell apart, so everything reads afresh.
      names.invalidate();
      hierarchy.rebuild();
      return;
    }
    const { created, deleted, kept } = diff(before, after);
    // The names: a file gone is removed, a file new or saved is read again. Without a hint of
    // which files were saved, every name is read again, through the cache (a stat a file).
    for (const file of deleted) names.remove(file.uriString);
    if (uris) {
      const saved = kept.filter((f) => uris.has(f.uriString));
      await Promise.all([...created, ...saved].filter((f) => isGraphPath(f.path)).map((f) => names.reindex(f)));
    } else {
      names.invalidate();
    }
    hierarchy.rebuild();
    // A model created or deleted can change what a data file's Usage column says.
    for (const file of [...created, ...deleted]) for (const listener of [...modelSet]) listener(file.path);
  }

  function changed(uris?: readonly string[]): Promise<void> {
    if (disposed) return Promise.resolve();
    if (!running) {
      running = apply(uris ? new Set(uris) : null).finally(() => {
        running = null;
        const next = queued;
        queued = null;
        if (next) void changed(next.uris ? [...next.uris] : undefined).then(next.resolve);
      });
      return running;
    }
    if (!queued) {
      let resolve!: () => void;
      const done = new Promise<void>((r) => (resolve = r));
      queued = { uris: new Set(), done, resolve };
    }
    if (!uris) queued.uris = null;
    else if (queued.uris) for (const uri of uris) queued.uris.add(uri);
    return queued.done;
  }

  const watching = options.watch?.((uris) => void changed(uris));

  return {
    hierarchy,
    usage,
    names,
    reposts,
    cache,
    changed,
    dispose() {
      if (disposed) return;
      disposed = true;
      if (typeof watching === 'function') watching();
      else watching?.dispose();
      reposts.dispose();
      modelSet.clear();
      queued?.resolve();
      queued = null;
    },
  };
}
