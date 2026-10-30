/**
 * A copy of the dirty flag VS Code computes for a custom document from its own edit stack: a
 * current index and a save point in a list of edits. A document is dirty when the two differ, or
 * when it was restored from a backup and has not been saved or reverted since. It moves the same
 * way, driven by the same events: an edit pushed, an undo or redo, a save, and a revert.
 *
 * One case is deliberately different from VS Code, in the safe direction. A new edit discards the
 * redo tail, and the save point can be inside that tail (save, undo, then edit). VS Code leaves
 * its save-point index where it was, so enough further edits bring the current index back to it,
 * and VS Code then calls the document clean although its text has never been saved. Here the save
 * point becomes unreachable instead: the document stays dirty until it is saved or reverted.
 */
export class EditStackIndex {
    constructor(fromBackup = false) {
        /** How many edits are applied: VS Code's `_currentEditIndex + 1`. */
        this.position = 0;
        /** The position that matches the file on disk, or `null` once that state is unreachable. */
        this.savedAt = 0;
        /** How many times the stack has moved: see `moves`. */
        this.moved = 0;
        this.fromBackup = fromBackup;
    }
    get dirty() {
        return this.fromBackup || this.savedAt !== this.position;
    }
    /** A new edit, which discards any redo tail. */
    pushed() {
        if (this.savedAt !== null && this.savedAt > this.position)
            this.savedAt = null;
        this.position++;
        this.moved++;
    }
    undone() {
        this.position--;
        this.moved++;
    }
    redone() {
        this.position++;
        this.moved++;
    }
    /** Where the stack is now, for a save to hand back to `saved` once its write lands. */
    here() {
        return this.position;
    }
    /**
     * How many times the stack has moved (an edit, an undo, a redo, a revert), for a save to tell
     * whether the document it wrote is still the one it holds. The position alone cannot say: an
     * undo and then a new edit put it back where it was, over another document.
     */
    get moves() {
        return this.moved;
    }
    /**
     * What was applied at `at` is what is on disk: a save succeeded.
     *
     * `at` is the position when the save READ the document, not when its write finished. An edit
     * can land while the write is in flight, and the file does not have it: an edit after `at` stays
     * unsaved, which is the safe direction.
     */
    saved(at = this.position) {
        this.savedAt = at;
        this.fromBackup = false;
    }
    /**
     * The document now holds what is on disk: a revert, or a reload. Only the distance between the
     * current position and the save point matters, so the save point moves to the current position.
     */
    reverted() {
        this.saved();
        this.moved++;
    }
}
/**
 * An undo stack in the page: each pushed edit is a step, undone and redone in stack order, and a
 * push drops the steps undone after the last one, as an editor's stack does. Its `undo()` and
 * `redo()` do nothing at either end of it.
 */
export class EditStack {
    constructor() {
        this.edits = [];
        /** How many of `edits` are applied. */
        this.applied = 0;
    }
    push(edit) {
        this.edits.length = this.applied;
        this.edits.push(edit);
        this.applied++;
    }
    undo() {
        if (this.applied === 0)
            return;
        this.applied--;
        this.edits[this.applied].undo();
    }
    redo() {
        if (this.applied === this.edits.length)
            return;
        this.edits[this.applied].redo();
        this.applied++;
    }
    /** Whether there is a step to undo, and one to redo. */
    get canUndo() {
        return this.applied > 0;
    }
    get canRedo() {
        return this.applied < this.edits.length;
    }
    /** What the next undo and redo would take back and make again, by label. */
    get undoLabel() {
        return this.edits[this.applied - 1]?.label;
    }
    get redoLabel() {
        return this.edits[this.applied]?.label;
    }
    /** Forget every step: the document now holds something no step was made on (a reload). */
    clear() {
        this.edits.length = 0;
        this.applied = 0;
    }
}
