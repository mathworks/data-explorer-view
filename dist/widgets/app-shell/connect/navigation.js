// Copyright 2026 The MathWorks, Inc.
//
// Where the user has been and can go: Back and Forward over the places visited (a tab shown, a row
// selected in it, Root), Up, and the location bar's segments. DOM-free: the shell does the moves
// (`show`) and says where the user is (`here`); this decides where a request goes and what counts
// as a visit.
//
// A move the shell makes passes through other places on its way: a tab is shown, which arrives at
// the row it had selected, before the row asked for is selected. Those are the shell's own steps,
// no visits: pushed, the first of them would drop the places ahead of a Back, and Forward would
// have nowhere to go. So every move runs `quietly`, and only a request that goes somewhere new (Up,
// a segment) visits where it went.
import { NavHistory } from '../../../model/shell/navHistory.js';
import { samePlace } from './location.js';
/** Back, Forward and Up, and the location bar's segments, over the places the user visits. */
export class ShellNavigation {
    constructor(moves) {
        this.moves = moves;
        this.history = new NavHistory(samePlace);
        // How many moves of the shell's are under way: their arrivals are no visits.
        this.quiet = 0;
        this.steps = [];
        this.upTo = null;
    }
    /** There is a place to go back to. */
    get canBack() {
        return this.history.canBack;
    }
    /** There is a place to go forward to: only after a Back, until the next place visited. */
    get canForward() {
        return this.history.canForward;
    }
    /** Up goes somewhere: the location bar's current place is inside another. */
    get canUp() {
        return this.upTo !== null;
    }
    /** The user is where `here()` says now (a tab shown, a row selected): a visit, unless a move of the shell's is under way. */
    visit() {
        if (this.quiet === 0)
            this.history.visit(this.moves.here());
    }
    /** Run `move`, whose arrivals are the shell's own and no visits (a tab that only stands in, while another replaces it). */
    quietly(move) {
        this.quiet++;
        try {
            return move();
        }
        finally {
            this.quiet--;
        }
    }
    /** What the location bar draws now (locationOf's answer): its segments, each a place, and the place Up goes to. */
    located(at) {
        this.steps = at.segments;
        this.upTo = at.up;
    }
    back() {
        const place = this.history.back();
        if (place)
            this.quietly(() => this.moves.show(place));
    }
    forward() {
        const place = this.history.forward();
        if (place)
            this.quietly(() => this.moves.show(place));
    }
    up() {
        if (this.upTo)
            this.goTo(this.upTo);
    }
    /**
     * Go to the location bar's segment `index`. The one counting a selection of several rows is where
     * the user is, which a press leaves as it is: going to its place would select the first row alone.
     */
    toStep(index) {
        const step = this.steps[index];
        if (step && !step.selection)
            this.goTo(step.place);
    }
    /** Forget the places of the tab `tabId`, which closed: Back must not land on one. */
    forget(tabId) {
        this.history.prune((place) => place.tabId !== tabId);
    }
    goTo(place) {
        if (this.quietly(() => this.moves.show(place)))
            this.history.visit(place);
    }
}
