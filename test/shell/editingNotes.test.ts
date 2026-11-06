// Copyright 2026 The MathWorks, Inc.
//
// What the shell says of an editing gesture a table ran (connect/editingNotes.ts): the prototype's
// words for Copy, Cut, Paste and Delete, Delete counting the entries, and nothing for a gesture
// that did nothing or that the table shows for itself. editingState.test.ts holds the shell to
// saying them, from the toolbar, a chord and the menu.
import { describe, expect, it } from 'vitest';
import { ranNote } from '../../src/widgets/app-shell/connect/editingNotes.js';

const note = (actionId: string, count: number) => ranNote({ actionId, rowIds: [], count });

describe('ranNote', () => {
  it("says Copy, Cut and Paste in the prototype's words", () => {
    expect([note('copy', 1), note('copy', 3), note('cut', 2), note('paste', 1), note('paste', 4)]).toEqual([
      'Copied to clipboard',
      'Copied to clipboard',
      'Cut to clipboard',
      'Pasted',
      'Pasted',
    ]);
  });

  it('counts the entries Delete took', () => {
    expect([note('delete', 1), note('delete', 2), note('delete', 12)]).toEqual(['Entry deleted', '2 entries deleted', '12 entries deleted']);
  });

  it('says nothing of a Paste or a Delete of nothing, nor of the gestures the table shows for itself', () => {
    expect([note('paste', 0), note('delete', 0)]).toEqual([undefined, undefined]);
    for (const id of ['undo', 'redo', 'addChild', 'locateInText', 'setActiveConfigSet']) expect(note(id, 1), id).toBeUndefined();
  });
});
