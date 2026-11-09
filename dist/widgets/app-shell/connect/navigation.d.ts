import { type LocationStep, type ShellPlace } from './location.js';
/** What the navigation asks of the shell. */
export interface NavigationMoves {
    /** Where the user is now: the active tab and its selection's first row, or Root. */
    here(): ShellPlace;
    /** Show `place`: its tab, and its row (or the file itself), or Root for no tab. False, and nothing shown, for a tab that is gone. */
    show(place: ShellPlace): boolean;
}
/** Back, Forward and Up, and the location bar's segments, over the places the user visits. */
export declare class ShellNavigation {
    private readonly moves;
    private readonly history;
    private quiet;
    private steps;
    private upTo;
    constructor(moves: NavigationMoves);
    /** There is a place to go back to. */
    get canBack(): boolean;
    /** There is a place to go forward to: only after a Back, until the next place visited. */
    get canForward(): boolean;
    /** Up goes somewhere: the location bar's current place is inside another. */
    get canUp(): boolean;
    /** The user is where `here()` says now (a tab shown, a row selected): a visit, unless a move of the shell's is under way. */
    visit(): void;
    /** Run `move`, whose arrivals are the shell's own and no visits (a tab that only stands in, while another replaces it). */
    quietly<T>(move: () => T): T;
    /** What the location bar draws now (locationOf's answer): its segments, each a place, and the place Up goes to. */
    located(at: {
        segments: readonly LocationStep[];
        up: ShellPlace | null;
    }): void;
    back(): void;
    forward(): void;
    up(): void;
    /**
     * Go to the location bar's segment `index`. The one counting a selection of several rows is where
     * the user is, which a press leaves as it is: going to its place would select the first row alone.
     */
    toStep(index: number): void;
    /** Forget the places of the tab `tabId`, which closed: Back must not land on one. */
    forget(tabId: string): void;
    private goTo;
}
