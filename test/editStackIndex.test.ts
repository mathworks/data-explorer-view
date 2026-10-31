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
});
