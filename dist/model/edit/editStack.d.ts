import type { Edit, EditIndex, EditSink } from './hooks.js';
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
export declare class EditStackIndex implements EditIndex {
    /** How many edits are applied: VS Code's `_currentEditIndex + 1`. */
    private position;
    /** The position that matches the file on disk, or `null` once that state is unreachable. */
    private savedAt;
    private fromBackup;
    /** How many times the stack has moved: see `moves`. */
    private moved;
    /** The state at each position, by id: a push makes a new one, which undo and redo keep. See `state`. */
    private readonly states;
    private nextState;
    constructor(fromBackup?: boolean);
    get dirty(): boolean;
    /** A new edit, which discards any redo tail. */
    pushed(): void;
    undone(): void;
    redone(): void;
    /** Where the stack is now, for a save to hand back to `saved` once its write lands. */
    here(): number;
    /**
     * Which state of the stack is here now, for a save to hand back to `saved` beside `here()`. The
     * position alone cannot say whether the document a save wrote is still there: an undo and then a
     * new edit put the stack back at it, over another document.
     */
    state(): number;
    /**
     * How many times the stack has moved (an edit, an undo, a redo, a revert), for a save to tell
     * whether the document it wrote is still the one it holds. The position alone cannot say: an
     * undo and then a new edit put it back where it was, over another document.
     */
    get moves(): number;
    /**
     * What was applied at `at` is what is on disk: a save succeeded.
     *
     * `at` is the position when the save READ the document, not when its write finished. An edit
     * can land while the write is in flight, and the file does not have it: an edit after `at` stays
     * unsaved, which is the safe direction. With `state` (`state()` when the save read it), a save
     * whose state an undo and a new edit have since replaced leaves no position the file.
     */
    saved(at?: number, state?: number): void;
    /**
     * The file changed on disk and the document kept what it holds instead (Doc.keepOver): no state
     * of the stack is the file any more, so it is dirty until a save of it lands or a revert. The
     * document did not move, so `moves` does not either: a save begun before is still of it.
     */
    diverged(): void;
    /**
     * The document now holds what is on disk: a revert, or a reload. Only the distance between the
     * current position and the save point matters, so the save point moves to the current position.
     */
    reverted(): void;
}
/**
 * An undo stack in the page: each pushed edit is a step, undone and redone in stack order, and a
 * push drops the steps undone after the last one, as an editor's stack does. Its `undo()` and
 * `redo()` do nothing at either end of it.
 */
export declare class EditStack implements EditSink {
    private readonly edits;
    /** How many of `edits` are applied. */
    private applied;
    push(edit: Edit): void;
    undo(): void;
    redo(): void;
    /** Whether there is a step to undo, and one to redo. */
    get canUndo(): boolean;
    get canRedo(): boolean;
    /** What the next undo and redo would take back and make again, by label. */
    get undoLabel(): string | undefined;
    get redoLabel(): string | undefined;
    /** Forget every step: the document now holds something no step was made on (a reload). */
    clear(): void;
}
