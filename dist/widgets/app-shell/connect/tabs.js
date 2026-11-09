// Copyright 2026 The MathWorks, Inc.
//
// The open tabs and which one is active. DOM-free (TabList); ShellTab names the widgets a tab holds.
//
// Lifted from data-explorer-app src/renderer/ui/tabList.ts at 0983920. Two additions the shell's
// parts need: `move`, for a tab the row's drag put elsewhere (dex-tab-move), and `deactivate`, for
// the Explorer's Root, which shows no document while files are open.
/** The open tabs, in order, and which one is active. DOM-free. */
export class TabList {
    constructor() {
        this.list = [];
        this.current = -1;
    }
    /** The tabs, in the order of the row. */
    get items() {
        return this.list;
    }
    /** The active tab, or none (nothing open, or the Explorer's Root). */
    get active() {
        return this.list[this.current];
    }
    /** Where the active tab is in `items`, or -1 for none. */
    get activeIndex() {
        return this.current;
    }
    /** The first tab `pred` holds for. */
    find(pred) {
        return this.list.find(pred);
    }
    /** Add at the end and make it active. */
    add(item) {
        this.list.push(item);
        this.current = this.list.length - 1;
    }
    /** Make `item` the active tab; whether it was not already (false too for a tab not in the list). */
    activate(item) {
        const i = this.list.indexOf(item);
        if (i < 0 || i === this.current)
            return false;
        this.current = i;
        return true;
    }
    /** Make none active (the Explorer's Root), keeping every tab; whether one was. */
    deactivate() {
        if (this.current < 0)
            return false;
        this.current = -1;
        return true;
    }
    /** Remove; the tab to its right becomes active, or the new last one. */
    remove(item) {
        const i = this.list.indexOf(item);
        if (i < 0)
            return false;
        this.list.splice(i, 1);
        if (this.list.length === 0)
            this.current = -1;
        else if (i < this.current || this.current >= this.list.length)
            this.current--;
        return true;
    }
    /**
     * Move `item` so that it is at `index` once moved: taken out, then put in at `index`, as
     * `dex-tab-move` means it (clamped to the row). The active tab stays the active tab. Whether
     * anything moved.
     */
    move(item, index) {
        const from = this.list.indexOf(item);
        if (from < 0)
            return false;
        const to = Math.max(0, Math.min(this.list.length - 1, Math.floor(index)));
        if (to === from)
            return false;
        const active = this.active;
        this.list.splice(from, 1);
        this.list.splice(to, 0, item);
        if (active !== undefined)
            this.current = this.list.indexOf(active);
        return true;
    }
    /**
     * Move the active tab by `step`, wrapping around; from none active, forward to the first and back
     * to the last. Whether the active tab changed: with one tab, active, there is nowhere to go.
     */
    cycle(step) {
        const n = this.list.length;
        if (n === 0)
            return false;
        const was = this.current;
        if (this.current < 0)
            this.current = step > 0 ? 0 : n - 1;
        else
            this.current = (((this.current + step) % n) + n) % n;
        return this.current !== was;
    }
}
