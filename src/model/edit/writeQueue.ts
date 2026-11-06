// Copyright 2026 The MathWorks, Inc.
//
// The turns a JSON dictionary's edits take at its text: one queue per document (jsonEngine.ts),
// shared by every table of it and by the source half of a cross-document move out of it.
//
// Every edit reads the text (and the tree, which every table of the document shares) when it
// starts and writes at the end, with an await between, over which the tree runs AHEAD of the text
// (the edit paints first). One begun meanwhile reads a text the write in front of it is about to
// move: its offsets are refused, or it finds no span at all for an entry only that write adds. So
// each waits for the one in front of it: none is dropped, one that fails or throws does not hold
// up the next, and each is still its own write (one undo step). An edit asked for `now` with
// nothing in front of it starts in the caller's run, so a cell edit still paints before anything
// else happens. A run that has done its part of the text and only waits on something else (a
// move's paste, waiting on the delete in the other document) lets its turn go early (`release`),
// so two such runs the opposite ways between two documents cannot each wait for the other.
//
// DOM-free, and nothing here knows what a run writes.

/** A run's hold on the queue, let go: the next edit may start. Calling it again does nothing. */
export type Release = () => void;

/** One document's edits, one text state at a time. */
export class WriteQueue {
  /** Settled once the last run asked for has settled or released its turn. Never rejects. */
  private chain: Promise<void> = Promise.resolve();
  /** How many runs hold or wait for a turn. */
  private queued = 0;

  /**
   * Run `run` once every run asked for before it has settled or let its turn go; at once, in this
   * run, when `now` and none holds or waits for one. Answers what `run` answers: a throw, even one
   * before its first await, is the answer's rejection, and the queue goes on. The run is counted
   * before it starts, so one asked for from inside it (a listener of the paint it makes) waits for
   * it. `run` is handed its `release`, to let the next start before it has settled.
   */
  enqueue<T>(run: (release: Release) => Promise<T>, now = false): Promise<T> {
    const ahead = this.chain;
    const atOnce = now && this.queued === 0;
    this.queued++;
    let open!: () => void;
    this.chain = new Promise<void>((resolve) => (open = resolve));
    let holding = true;
    const release: Release = () => {
      if (!holding) return;
      holding = false;
      this.queued--;
      open();
    };
    const start = (): Promise<T> => {
      try {
        return run(release);
      } catch (err) {
        return Promise.reject(err);
      }
    };
    const turn = atOnce ? start() : ahead.then(start);
    turn.then(release, release);
    return turn;
  }
}
