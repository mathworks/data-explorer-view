// Copyright 2026 The MathWorks, Inc.
//
// The in-page undo stack: where an editable source's edits go when nothing like VS Code holds them
// (hooks.ts, EditSink), and the save point measured against it (EditIndex).
//
// The index is copied from data-explorer-vscode src/host/diskConflict.ts at c73da3c (its
// EditStackMirror, which copies VS Code's own dirty flag). The extension keeps its own copy until
// its editors move onto view's sources; keep the two alike (view's CI reports a vscode commit to
// that file). The stack around it is this package's: what VS Code's edit list is to the extension.
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
export class EditStackIndex implements EditIndex {
  /** How many edits are applied: VS Code's `_currentEditIndex + 1`. */
  private position = 0;
  /** The position that matches the file on disk, or `null` once that state is unreachable. */
  private savedAt: number | null = 0;
  private fromBackup: boolean;
  /** How many times the stack has moved: see `moves`. */
  private moved = 0;

  constructor(fromBackup = false) {
    this.fromBackup = fromBackup;
  }

  get dirty(): boolean {
    return this.fromBackup || this.savedAt !== this.position;
  }

  /** A new edit, which discards any redo tail. */
  pushed(): void {
    if (this.savedAt !== null && this.savedAt > this.position) this.savedAt = null;
    this.position++;
    this.moved++;
  }

  undone(): void {
    this.position--;
    this.moved++;
  }

  redone(): void {
    this.position++;
    this.moved++;
  }

  /** Where the stack is now, for a save to hand back to `saved` once its write lands. */
  here(): number {
    return this.position;
  }

  /**
   * How many times the stack has moved (an edit, an undo, a redo, a revert), for a save to tell
   * whether the document it wrote is still the one it holds. The position alone cannot say: an
   * undo and then a new edit put it back where it was, over another document.
   */
  get moves(): number {
    return this.moved;
  }

  /**
   * What was applied at `at` is what is on disk: a save succeeded.
   *
   * `at` is the position when the save READ the document, not when its write finished. An edit
   * can land while the write is in flight, and the file does not have it: an edit after `at` stays
   * unsaved, which is the safe direction.
   */
  saved(at: number = this.position): void {
    this.savedAt = at;
    this.fromBackup = false;
  }

  /**
   * The file changed on disk and the document kept what it holds instead (Doc.keepOver): no state
   * of the stack is the file any more, so it is dirty until a save of it lands or a revert. The
   * document did not move, so `moves` does not either: a save begun before is still of it.
   */
  diverged(): void {
    this.savedAt = null;
  }

  /**
   * The document now holds what is on disk: a revert, or a reload. Only the distance between the
   * current position and the save point matters, so the save point moves to the current position.
   */
  reverted(): void {
    this.saved();
    this.moved++;
  }
}

/**
 * An undo stack in the page: each pushed edit is a step, undone and redone in stack order, and a
 * push drops the steps undone after the last one, as an editor's stack does. Its `undo()` and
 * `redo()` do nothing at either end of it.
 */
export class EditStack implements EditSink {
  private readonly edits: Edit[] = [];
  /** How many of `edits` are applied. */
  private applied = 0;

  push(edit: Edit): void {
    this.edits.length = this.applied;
    this.edits.push(edit);
    this.applied++;
  }

  undo(): void {
    if (this.applied === 0) return;
    this.applied--;
    this.edits[this.applied].undo();
  }

  redo(): void {
    if (this.applied === this.edits.length) return;
    this.edits[this.applied].redo();
    this.applied++;
  }

  /** Whether there is a step to undo, and one to redo. */
  get canUndo(): boolean {
    return this.applied > 0;
  }
  get canRedo(): boolean {
    return this.applied < this.edits.length;
  }

  /** What the next undo and redo would take back and make again, by label. */
  get undoLabel(): string | undefined {
    return this.edits[this.applied - 1]?.label;
  }
  get redoLabel(): string | undefined {
    return this.edits[this.applied]?.label;
  }

  /** Forget every step: the document now holds something no step was made on (a reload). */
  clear(): void {
    this.edits.length = 0;
    this.applied = 0;
  }
}
