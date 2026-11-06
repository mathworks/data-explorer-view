/** Back/forward over places; `T` compared by `same`. */
export declare class NavHistory<T> {
    private readonly same;
    private readonly limit;
    /** Every place still remembered, oldest first. */
    private places;
    /** Where `current` is in `places`, or -1 while there is none. */
    private index;
    /**
     * @param same Whether two places are the same place.
     * @param limit The most places remembered; past it the oldest is forgotten. At least 1.
     */
    constructor(same: (a: T, b: T) => boolean, limit?: number);
    /** The place shown now, or `undefined` before the first visit (or after a prune that kept none). */
    get current(): T | undefined;
    /** Whether there is a place to go back to. */
    get canBack(): boolean;
    /** Whether there is a place to go forward to: only after a Back, until the next new place. */
    get canForward(): boolean;
    /**
     * A new place: drops the forward list; the same place as current is not pushed twice.
     *
     * Arriving on the place already shown (a click on the node that is selected, or the shell
     * reporting where Back just went) is not a step: pushed, it would make the next Back seem to do
     * nothing. Nor does it drop the forward list, since nothing new was visited.
     */
    visit(place: T): void;
    /** Step back: the place now current, or `undefined` (and no move) when there is none before it. */
    back(): T | undefined;
    /** Step forward: the place now current, or `undefined` (and no move) when there is none after it. */
    forward(): T | undefined;
    /**
     * Forget places `keep` says no to (a closed tab's), keeping the current index sensible.
     *
     * The current place stays current when it is kept. When it is not, the place before it becomes
     * current (where the person came from, as when a browser tab's page is gone), or, with none
     * before it, the place after it. Two places the prune leaves side by side that are the same
     * place (a, b, a with b's tab closed) become one, for the same reason `visit` does not push the
     * current place twice.
     */
    prune(keep: (place: T) => boolean): void;
}
