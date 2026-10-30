// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/saveMarks.ts at c73da3c. The extension keeps its own
// copy until its editors move onto view's sources; keep the two alike (view's CI reports a vscode
// commit to that file).
//
// Which variables of an open MAT-file differ from the file as last saved, for the Status column.
//
// Core marks a variable `Modified` at its first edit (`New` when it was added) and never clears
// the mark: the mark is what tells a save to write the variable fresh instead of as the bytes it
// was read from, so it has to outlive the save, and the MAT-file editor keeps its tree across
// saves (see matEngine.ts). The column asks something else, "is this what the file on disk
// holds", which a mark kept since the file was opened answers wrongly from the first save on.
//
// So the answer is kept here, beside the edit stack (VS Code's, or the page's). Each edit says
// which variables it touched, whether it is applied now, and whether it was applied when the file
// was last saved. A variable differs from the saved file when an edit that touched it has moved
// since: applied now and not then (an edit made since the save, or the redo of one undone before
// it), or the other way round (an undo past the save, or an edit undone and then dropped from the
// stack by a newer one). Two edits that cancel each other out still mark it. Only a comparison of
// values could tell, and a mark too many is the safe side.
//
// A variable can also be put in another's place: core retypes a variable whose Value is typed as
// another class (a string over a double, a number over a string) by swapping in a new variable of
// its name, which the session announces as the delete of the one and the add of the other. The
// file holds the one it replaced, so the replacement is Modified, not New, unless the variable it
// replaced is New itself (`replacementsIn`).
//
// DOM-free, so that the rule is unit-tested (test/saveMarks.test.ts).
// HOW MUCH IS HELD. The rule above is over every edit of the session, as any of them can differ
// from the file again while VS Code can still undo or redo it. An edit that does not differ now
// (applied as it was at the save) adds nothing to the answer, though, so each save lets go of
// those, and whatever moves one again holds it again, in its place: its own undo or redo, or a
// save that held it otherwise. What is held is then the edits since the last save, and those
// undone past it, not every edit since the file was opened; and an edit VS Code dropped from its
// stack is no longer kept here, with the variables it touched, by nothing but this list.
//
// One more rule keeps the answer the one the whole list gives: a save in flight answers for every
// edit made before it was taken, and holds only those that were held then. So a save that commits
// first, and moves an edit another save in flight does not hold, tells that one how the edit
// stood before (`commit`). test/saveMarks.test.ts runs the two against random histories, with
// saves that overlap, fail and commit out of order.
export class SaveMarks {
    constructor() {
        /** The edits that differ from the saved file, or may, in the order they were made. */
        this.entries = [];
        this.seq = 0;
        this.epoch = 0;
        /** The snapshots taken and not yet committed or released. */
        this.inFlight = new Set();
    }
    /**
     * An edit was made, touching `touched`, of which `added` it added (a variable that joined the
     * file, which the column calls New until the file is saved with it), and `replaced` it put in
     * another's place (`replacementsIn`), which is not one it added. An edit is never applied at the
     * save before it, so it starts moved.
     */
    push(touched, added = [], replaced = new Map()) {
        const joined = new Set([...added].filter((node) => !replaced.has(node)));
        const entry = {
            touched: new Set(touched),
            added: joined,
            replaced,
            applied: true,
            atSave: false,
            seq: this.seq++,
            epoch: this.epoch,
            held: true,
        };
        this.entries.push(entry);
        return {
            undone: () => {
                entry.applied = false;
                this.hold(entry);
            },
            redone: () => {
                entry.applied = true;
                this.hold(entry);
            },
        };
    }
    /**
     * What a save is about to write: taken when the document is serialized, and committed only once
     * the bytes are on disk. An edit that lands while the write is in flight is not in those bytes,
     * and an undo that lands then does not take its edit out of them.
     */
    snapshot() {
        const snapshot = { applied: new Map(this.entries.map((e) => [e, e.applied])), takenAt: this.seq };
        this.inFlight.add(snapshot);
        return snapshot;
    }
    /** The save of `snapshot` is on disk: what it held is what every later edit is measured from. */
    commit(snapshot) {
        const taken = snapshot;
        // One taken before the last `clear`, or released, is of no save of this tree.
        if (this.inFlight.delete(taken)) {
            for (const [entry, applied] of taken.applied) {
                if (entry.epoch !== this.epoch)
                    continue;
                if (entry.atSave !== applied) {
                    // A save in flight that does not hold this edit, though it was made before it, was
                    // taken while the edit was not held: applied as at the save then, which is about to move.
                    for (const other of this.inFlight) {
                        if (entry.seq < other.takenAt && !other.applied.has(entry))
                            other.applied.set(entry, entry.atSave);
                    }
                    entry.atSave = applied;
                }
                this.hold(entry);
            }
        }
        for (const entry of this.entries)
            entry.held = entry.applied !== entry.atSave;
        this.entries = this.entries.filter((e) => e.held);
    }
    /** The save of `snapshot` wrote nothing: it is never committed. */
    release(snapshot) {
        this.inFlight.delete(snapshot);
    }
    /**
     * The document was replaced by what the disk holds (a revert, or a reload of an outside
     * change): nothing in it differs from the file any more, and no edit made before belongs to
     * the tree it now holds.
     */
    clear() {
        this.entries = [];
        this.inFlight.clear();
        this.epoch++;
    }
    /** How many edits are held (see HOW MUCH IS HELD), for the suite to bound. */
    get held() {
        return this.entries.length;
    }
    /** Hold `entry` again, in its place, if it moved since it was let go. */
    hold(entry) {
        if (entry.held || entry.epoch !== this.epoch || entry.applied === entry.atSave)
            return;
        entry.held = true;
        let at = this.entries.length;
        while (at > 0 && this.entries[at - 1].seq > entry.seq)
            at--;
        this.entries.splice(at, 0, entry);
    }
    /** Every variable that differs from the saved file, and how. */
    marks() {
        const marks = new Map();
        for (const entry of this.entries) {
            if (entry.applied === entry.atSave)
                continue;
            for (const node of entry.touched) {
                // New only while the edit that added it is applied and was not at the save: anything
                // else that touches it, before or after, is an edit of a variable the file holds.
                const added = entry.applied && entry.added.has(node);
                if (added)
                    marks.set(node, 'New');
                else if (!marks.has(node))
                    marks.set(node, 'Modified');
            }
        }
        // A replacement is New where the variable it replaced is: one added since the save, and so
        // not in the file either. In the order the edits were made, so that a variable typed over
        // twice follows the first replacement to the variable that was added.
        for (const entry of this.entries) {
            if (!entry.applied || entry.atSave)
                continue;
            for (const [node, was] of entry.replaced)
                if (marks.get(was) === 'New')
                    marks.set(node, 'New');
        }
        return marks;
    }
}
/**
 * Which of the variables a gesture added are put in the place of another: one whose id (the
 * file's and its name) is a variable's that the gesture took out of the file (`before`, the
 * variables before it, by id; `inFile`, whether one is still in it). Core's retype is the one
 * gesture that does both, and the replacement it makes is of the name of the one it swaps out.
 */
export function replacementsIn(before, added, idOf, inFile) {
    const gone = new Map();
    for (const [node, id] of before)
        if (!inFile(node))
            gone.set(id, node);
    const replaced = new Map();
    if (gone.size === 0)
        return replaced;
    for (const node of added) {
        const was = gone.get(idOf(node));
        if (was !== undefined && was !== node)
            replaced.set(node, was);
    }
    return replaced;
}
