// Copyright 2026 The MathWorks, Inc.
//
// The app shell's back/forward history: the places a person has been (a tab, and where in it), in
// order, with Back and Forward stepping over them as a browser's buttons do. The shell's location
// bar asks it whether each button is enabled and where a click goes; the shell tells it each place
// that is shown, and which places a closed tab took with it.
//
// It is the prototype's NavigationService (src/core/NavigationService.ts) without the store it
// listened to: a list and a cursor, a new place after Back dropping the places ahead, and the
// place already shown never pushed a second time. Two rules are this package's own. The list is
// capped, so a long session does not grow it without bound. And it can forget places, since a tab
// here can close: Back must not land on a place that no longer exists.
//
// Generic over the place, compared by the caller's `same` rather than by identity, because a place
// is plain data rebuilt on every change (a fresh object for the same tab and node is the same place).

/** Back/forward over places; `T` compared by `same`. */
export class NavHistory<T> {
  private readonly same: (a: T, b: T) => boolean;
  private readonly limit: number;
  /** Every place still remembered, oldest first. */
  private places: T[] = [];
  /** Where `current` is in `places`, or -1 while there is none. */
  private index = -1;

  /**
   * @param same Whether two places are the same place.
   * @param limit The most places remembered; past it the oldest is forgotten. At least 1.
   */
  constructor(same: (a: T, b: T) => boolean, limit = 100) {
    this.same = same;
    this.limit = Math.max(1, Math.floor(limit));
  }

  /** The place shown now, or `undefined` before the first visit (or after a prune that kept none). */
  get current(): T | undefined {
    return this.index < 0 ? undefined : this.places[this.index];
  }

  /** Whether there is a place to go back to. */
  get canBack(): boolean {
    return this.index > 0;
  }

  /** Whether there is a place to go forward to: only after a Back, until the next new place. */
  get canForward(): boolean {
    return this.index < this.places.length - 1;
  }

  /**
   * A new place: drops the forward list; the same place as current is not pushed twice.
   *
   * Arriving on the place already shown (a click on the node that is selected, or the shell
   * reporting where Back just went) is not a step: pushed, it would make the next Back seem to do
   * nothing. Nor does it drop the forward list, since nothing new was visited.
   */
  visit(place: T): void {
    const current = this.current;
    if (current !== undefined && this.same(current, place)) return;
    this.places = this.places.slice(0, this.index + 1);
    this.places.push(place);
    if (this.places.length > this.limit) this.places.splice(0, this.places.length - this.limit);
    this.index = this.places.length - 1;
  }

  /** Step back: the place now current, or `undefined` (and no move) when there is none before it. */
  back(): T | undefined {
    if (!this.canBack) return undefined;
    this.index--;
    return this.current;
  }

  /** Step forward: the place now current, or `undefined` (and no move) when there is none after it. */
  forward(): T | undefined {
    if (!this.canForward) return undefined;
    this.index++;
    return this.current;
  }

  /**
   * Forget places `keep` says no to (a closed tab's), keeping the current index sensible.
   *
   * The current place stays current when it is kept. When it is not, the place before it becomes
   * current (where the person came from, as when a browser tab's page is gone), or, with none
   * before it, the place after it. Two places the prune leaves side by side that are the same
   * place (a, b, a with b's tab closed) become one, for the same reason `visit` does not push the
   * current place twice.
   */
  prune(keep: (place: T) => boolean): void {
    const kept: T[] = [];
    let index = -1;
    this.places.forEach((place, at) => {
      if (!keep(place)) return;
      const last = kept[kept.length - 1];
      if (last === undefined || !this.same(last, place)) kept.push(place);
      // The last place kept at or before the old current: the current one, or the nearest before it.
      if (at <= this.index) index = kept.length - 1;
    });
    this.places = kept;
    this.index = index < 0 && kept.length > 0 ? 0 : index;
  }
}
