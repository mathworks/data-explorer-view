// Copyright 2026 The MathWorks, Inc.
//
// Watching open files in a browser: a page hears of no change on disk, so the files it reads
// through a handle are looked at every POLL_MS while the page is shown, by their `lastModified:size`
// stamp. A File keeps the lastModified and size it was picked with, so it is not looked at. The
// page's own saves are no change: a file being saved is left alone, and the stamp its save left is
// the one it is known by, as a desktop host's watcher keeps each save's stamp (view's README, "Edit
// a file"). A look begun before a save, which may have read the file mid-write, reports nothing.
//
// Lifted from data-explorer-app src/web/watch.ts at b13a860.

import type { WebFiles } from './files.js';

/** How often the open files are looked at while the page is shown, in milliseconds. */
export const POLL_MS = 2000;

/** The open files a browser host watches: what watchOpenFiles returns. */
export interface OpenFileWatch {
  /** Watch `path`, known by `stamp` (the version the page read), or by what the next look sees. */
  watch(path: string, stamp?: string | null): void;
  /** Stop watching `path`: its tab closed. */
  unwatch(path: string): void;
  /** Whether `path` is watched: a tab has it open. */
  has(path: string): boolean;
  /** The page starts writing `path`: what a look sees until this write's `ownWrite` is no change. */
  saving(path: string): void;
  /** The page's write of `path` left it as `stamp` (null: it failed, or wrote elsewhere), which is no change. */
  ownWrite(path: string, stamp: string | null): void;
  /** Stop looking at every file. */
  dispose(): void;
}

interface Watched {
  /** The stamp last seen; undefined until the first look. */
  seen: string | null | undefined;
  /** Counts the saves and reads since, so a look begun before one does not report what it saw. */
  turn: number;
  /** The page's writes of the file under way: one may begin before another ends (Save, then Save As). */
  saving: number;
}

/** Look at the open files of `files` every POLL_MS while `document` is shown; a changed one goes to `onChanged`. */
export function watchOpenFiles(
  files: WebFiles,
  onChanged: (path: string) => void,
  deps: { document: Pick<Document, 'visibilityState'> },
): OpenFileWatch {
  const watched = new Map<string, Watched>();
  let looking = false;

  async function look(path: string, w: Watched): Promise<void> {
    if (w.saving || files.get(path)?.source.kind !== 'handle') return;
    const turn = w.turn;
    const stamp = await files.stamp(path);
    // Unwatched, saved or read again meanwhile: what this look saw is no news.
    if (watched.get(path) !== w || w.turn !== turn) return;
    const seen = w.seen;
    w.seen = stamp;
    if (seen === undefined || stamp === seen) return;
    try {
      onChanged(path);
    } catch (err) {
      // The other files are still told, and the next look goes on.
      console.error(`Telling the page that ${path} changed failed:`, err);
    }
  }

  // A look at every file at once, and none begun while one is still going.
  const timer = setInterval(() => {
    if (looking || deps.document.visibilityState !== 'visible') return;
    looking = true;
    void Promise.all([...watched].map(([path, w]) => look(path, w))).finally(() => (looking = false));
  }, POLL_MS);

  return {
    watch(path, stamp) {
      const w = watched.get(path);
      if (!w) watched.set(path, { seen: stamp, turn: 0, saving: 0 });
      else if (stamp !== undefined) {
        w.seen = stamp;
        w.turn++;
      }
    },
    unwatch: (path) => void watched.delete(path),
    has: (path) => watched.has(path),
    saving(path) {
      const w = watched.get(path);
      if (!w) return;
      w.saving++;
      w.turn++;
    },
    ownWrite(path, stamp) {
      const w = watched.get(path);
      if (!w) return;
      w.saving = Math.max(0, w.saving - 1);
      w.turn++;
      if (stamp !== null) w.seen = stamp;
    },
    dispose() {
      clearInterval(timer);
      watched.clear();
    },
  };
}
