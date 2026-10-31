// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/diskConflict.test.ts at c73da3c: the same cases, run against view's copy
// of its EditStackMirror (src/model/edit/editStack.ts, EditStackIndex); the rest of diskConflict.ts
// stays the extension's, and so do its cases.
//
// The pure half of how the writable binary .sldd view follows its file on disk (V-071):
// when the disk counts as changed, whether the setting asks for the check, when a refused
// save asks the user, and the copy of VS Code's dirty flag that decides between "reload"
// and "keep the edits". The VS Code half is exercised end to end in
// test-integration/suite/binarySlddOutsideChange.test.ts.
import { describe, it, expect } from 'vitest';
import { EditStackIndex as EditStackMirror } from '../src/host/index.js';

/** The index before state ids: a save point by position only, which a save without a state is held to. */
class PositionOnly {
  position = 0;
  savedAt: number | null = 0;
  get dirty() {
    return this.savedAt !== this.position;
  }
  pushed() {
    if (this.savedAt !== null && this.savedAt > this.position) this.savedAt = null;
    this.position++;
  }
  undone() {
    this.position--;
  }
  redone() {
    this.position++;
  }
  saved(at = this.position) {
    this.savedAt = at;
  }
  diverged() {
    this.savedAt = null;
  }
  reverted() {
    this.saved();
  }
}

/**
 * VS Code 1.144's custom-editor model, as far as which edits its undo and redo hand the extension
 * (data-explorer-vscode test/editStackCopy.test.ts, whose model this is): its edit list, its index,
 * and its save point, which a revert puts the index back at, keeping the edits before it.
 */
class VsCodeModel {
  edits: number[] = [];
  current = -1;
  savePoint = -1;
  push(id: number): void {
    this.edits.splice(this.current + 1, this.edits.length - this.current, id);
    this.current = this.edits.length - 1;
  }
  undo(): boolean {
    if (this.current < 0) return false;
    this.current--;
    return true;
  }
  redo(): boolean {
    if (this.current >= this.edits.length - 1) return false;
    this.current++;
    return true;
  }
  save(): void {
    this.savePoint = this.current;
  }
  revert(): boolean {
    if (this.current === this.savePoint) return false;
    this.current = this.savePoint;
    this.edits.splice(this.current + 1, this.edits.length - this.current);
    return true;
  }
}

describe('EditStackMirror: VS Code’s dirty flag for a custom document', () => {
  it('starts clean, and dirty when restored from a hot-exit backup', () => {
    expect(new EditStackMirror().dirty).toBe(false);
    expect(new EditStackMirror(true).dirty).toBe(true);
  });

  it('an edit dirties; undoing it back to the save point cleans; redo dirties again', () => {
    const m = new EditStackMirror();
    m.pushed();
    expect(m.dirty).toBe(true);
    m.undone();
    expect(m.dirty).toBe(false);
    m.redone();
    expect(m.dirty).toBe(true);
  });

  it('a save moves the save point to where the stack is', () => {
    const m = new EditStackMirror();
    m.pushed();
    m.pushed();
    m.saved();
    expect(m.dirty).toBe(false);
    m.undone();
    expect(m.dirty, 'undo past the save point is unsaved').toBe(true);
    m.redone();
    expect(m.dirty, 'and redo back to it is saved again').toBe(false);
  });

  it('a save clears the backup’s dirtiness, and so does a revert', () => {
    const saved = new EditStackMirror(true);
    saved.saved();
    expect(saved.dirty).toBe(false);
    const reverted = new EditStackMirror(true);
    reverted.reverted();
    expect(reverted.dirty).toBe(false);
  });

  it('a revert is clean wherever the stack was, and the next undo is unsaved', () => {
    const m = new EditStackMirror();
    m.pushed();
    m.saved();
    m.pushed();
    m.pushed();
    m.reverted();
    expect(m.dirty).toBe(false);
    m.undone();
    expect(m.dirty).toBe(true);
  });

  it('an edit after undoing past the save point makes the save point unreachable', () => {
    // Save at 2, undo to 1, edit (2 again, but a different 2), edit (3). VS Code’s index
    // arithmetic would call the stack clean after one more undo, back at index 2. It is not:
    // that text was never saved.
    const m = new EditStackMirror();
    m.pushed();
    m.pushed();
    m.saved();
    m.undone();
    m.pushed();
    expect(m.dirty).toBe(true);
    m.pushed();
    m.undone();
    expect(m.dirty, 'same depth as the save, different text').toBe(true);
    m.undone();
    m.undone();
    expect(m.dirty, 'not even back at the start, which was never saved either').toBe(true);
    m.saved();
    expect(m.dirty, 'until the next save').toBe(false);
  });

  it('an edit that lands while a save is writing stays unsaved', () => {
    const m = new EditStackMirror();
    m.pushed();
    const at = m.here();
    m.pushed(); // arrives on the save's await
    m.saved(at);
    expect(m.dirty, 'the file has the first edit, not the second').toBe(true);
    m.undone();
    expect(m.dirty).toBe(false);
  });

  it('counts every move of the stack, which a position that comes back cannot tell, and no save', () => {
    const m = new EditStackMirror();
    m.pushed();
    const at = m.here();
    const moves = m.moves;
    m.undone();
    m.pushed();
    expect(m.here(), 'back where it was').toBe(at);
    expect(m.moves).toBe(moves + 2);
    m.redone();
    m.reverted();
    expect(m.moves).toBe(moves + 4);
    m.saved();
    expect(m.moves, 'a save moves the save point, not the stack').toBe(moves + 4);
  });

  it('an edit after an undo that stayed at or above the save point keeps it reachable', () => {
    const m = new EditStackMirror();
    m.pushed();
    m.saved();
    m.pushed();
    m.undone();
    m.pushed();
    expect(m.dirty).toBe(true);
    m.undone();
    expect(m.dirty, 'the save point was not in the discarded tail').toBe(false);
  });

  it('a save whose state an undo and a new edit replaced leaves no position the file; undo and redo keep a state', () => {
    const m = new EditStackMirror();
    m.pushed();
    const at = m.here();
    const state = m.state();
    m.undone();
    m.pushed(); // back at `at`, over another document, while the save was writing
    expect(m.here()).toBe(at);
    m.saved(at, state);
    expect(m.dirty, 'the file holds the edit undone, not the new one').toBe(true);
    m.undone();
    expect(m.dirty, 'nor the start, which the save wrote over').toBe(true);
    m.redone();
    const again = m.state();
    m.undone();
    m.redone();
    m.saved(m.here(), again);
    expect(m.dirty, 'an undo and a redo put the same state back').toBe(false);
  });

  it('diverged: no position is the file any more, until a save lands or a revert, and the stack did not move', () => {
    const m = new EditStackMirror();
    m.pushed();
    const moves = m.moves;
    m.diverged();
    expect(m.dirty).toBe(true);
    expect(m.moves, 'the document did not move').toBe(moves);
    m.undone();
    expect(m.dirty, 'undone to where the file was').toBe(true);
    m.redone();
    m.saved();
    expect(m.dirty).toBe(false);
    m.diverged();
    m.reverted();
    expect(m.dirty, 'a revert holds the disk again').toBe(false);
  });

  it('follows a stack that moves below where it started, as VS Code\'s does after a revert', () => {
    // VS Code's revert puts its index back at its own save point and keeps the edits before it, so its
    // undo can take the copy below its start (the extension's EditStackCopy, over this class).
    const m = new EditStackMirror();
    m.pushed();
    m.saved();
    m.reverted();
    m.undone();
    m.undone();
    m.undone();
    expect(m.here()).toBe(-2);
    // A position no push reached has a state too, which a save can hand back.
    const low = m.state();
    m.saved(m.here(), low);
    expect(m.dirty).toBe(false);
    m.pushed();
    expect(m.dirty).toBe(true);
    const at = m.here();
    const state = m.state();
    m.saved(at, state);
    expect(m.dirty).toBe(false);
    m.undone();
    m.pushed();
    m.saved(at, state);
    expect(m.dirty, 'the state that save read was replaced').toBe(true);
    // A push drops the states above it, even where a redo then takes the index (a host's stack can).
    const n = new EditStackMirror();
    n.pushed();
    n.pushed();
    const top = n.here();
    const topState = n.state();
    n.undone();
    n.undone();
    n.pushed();
    n.redone();
    expect(n.here()).toBe(top);
    n.saved(top, topState);
    expect(n.dirty, 'the push dropped the state that save read').toBe(true);
    // And a state first asked for where no push reached is replaced as any other: below the start,
    // and above every push.
    const below = new EditStackMirror();
    below.undone();
    below.undone();
    const lowAt = below.here();
    const lowState = below.state();
    below.undone();
    below.pushed();
    below.saved(lowAt, lowState);
    expect(below.dirty, 'the push replaced the state below the start').toBe(true);
    const above = new EditStackMirror();
    above.pushed();
    above.redone();
    above.redone();
    const highAt = above.here();
    const highState = above.state();
    above.undone();
    above.undone();
    above.pushed();
    above.redone();
    above.saved(highAt, highState);
    expect(above.dirty, 'the push dropped the state above every push').toBe(true);
  });

  it('without a state, as the extension calls saved(), reads dirty exactly as the position alone does, wherever the stack goes', () => {
    const OPS = ['pushed', 'undone', 'redone', 'saved', 'diverged', 'reverted'] as const;
    let sequences = 0;
    const walk = (ops: (typeof OPS)[number][]): void => {
      if (ops.length < 7) {
        for (const op of OPS) walk([...ops, op]);
        return;
      }
      sequences++;
      const m = new EditStackMirror();
      const p = new PositionOnly();
      for (const op of ops) {
        m[op]();
        p[op]();
        if (m.dirty !== p.dirty) expect.fail(`${ops.join(', ')}: dirty ${m.dirty}, by position ${p.dirty}`);
      }
    };
    walk([]);
    expect(sequences).toBe(6 ** 7);
  });

  it("as the extension's EditStackCopy drives it, over every sequence of eight of VS Code's pushes, undos, redos, saves and reverts", () => {
    // EditStackCopy (data-explorer-vscode src/host/settledSave.ts) extends this class. Its calls on it:
    // `pushed()` as an edit goes on VS Code's stack; `undone()` and `redone()` when VS Code's undo or
    // redo hands the document an edit; `saved(here())` once a save's write lands; `reverted()` when
    // VS Code reverts. A revert puts VS Code's index back at its save point and keeps the edits before
    // it, so the undos after one can take this index below where it started.
    const OPS = ['push', 'undo', 'redo', 'save', 'revert'] as const;
    let sequences = 0;
    let below = 0;
    const walk = (ops: (typeof OPS)[number][]): void => {
      if (ops.length < 8) {
        for (const op of OPS) walk([...ops, op]);
        return;
      }
      sequences++;
      const vscode = new VsCodeModel();
      const m = new EditStackMirror();
      const p = new PositionOnly();
      let next = 1;
      for (const op of ops) {
        if (op === 'push') {
          m.pushed();
          p.pushed();
          vscode.push(next++);
        } else if (op === 'undo' ? vscode.undo() : op === 'redo' ? vscode.redo() : false) {
          m[op === 'undo' ? 'undone' : 'redone']();
          p[op === 'undo' ? 'undone' : 'redone']();
        } else if (op === 'save') {
          vscode.save();
          m.saved(m.here());
          p.saved(p.position);
        } else if (op === 'revert' && vscode.revert()) {
          m.reverted();
          p.reverted();
        }
        if (m.here() < 0) below++;
        if (m.dirty !== p.dirty) expect.fail(`${ops.join(', ')}: dirty ${m.dirty}, by position ${p.dirty}`);
      }
    };
    walk([]);
    expect(sequences).toBe(5 ** 8);
    expect(below, 'the sequences take the index below where it started').toBeGreaterThan(0);
  });
});
