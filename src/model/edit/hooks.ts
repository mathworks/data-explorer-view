// Copyright 2026 The MathWorks, Inc.
//
// What an editable source is given rather than decides: where its edits go to be undone, where a
// save point is kept, the text it keeps as the truth, and where it says what the table cannot.
// Each has two homes. In the page, view's own (an undo stack, a string); in the VS Code extension,
// the editor's (a custom document's edit events and VS Code's undo, a TextDocument and its
// WorkspaceEdits, a notification). A source written against these serves both, so moving the
// extension's editors onto view's sources is wiring and not a redesign.
//
// Registers (the clipboard and the drag register, shared by every document of a window) are the
// fifth, and are in registers.ts.
//
// Types only.
import type { TextPatch } from 'data-explorer-core';

/** One gesture's edit, as an undo stack keeps it: what it is called, and how to take it back and make it again. */
export interface Edit {
  /** What the edit is called where a stack names its steps: `Edit Value`, `Delete`, `Paste`, … */
  label: string;
  undo(): void;
  redo(): void;
}

/**
 * Where a source's edits go, ONE per gesture, however much the gesture changed. In the page, a
 * stack of its own; in the VS Code extension, the custom document's edit event
 * (`onDidChangeCustomDocument`), with `undo` and `redo` its `undo` and `redo` commands, so the
 * table's Undo and the editor's are one stack.
 */
export interface EditSink {
  /** Keep `edit` as the newest step, dropping whatever was undone after the last one. */
  push(edit: Edit): void;
  /** Undo the newest step there is. */
  undo(): void;
  /** Redo the step undone last. */
  redo(): void;
}

/**
 * Where an edit stack stands, and which of its positions is the file on disk: the save point a
 * save moves, and what makes a document dirty. The shape of the VS Code extension's
 * EditStackMirror, which copies VS Code's own; in the page, the stack's own.
 */
export interface EditIndex {
  /** Whether the document differs from the file: not at the save point, or restored from a backup. */
  readonly dirty: boolean;
  /** A new edit, which drops any redo tail (and with it a save point that was in it). */
  pushed(): void;
  undone(): void;
  redone(): void;
  /** Where the stack is now, for a save to hand back to `saved` once its write lands. */
  here(): number;
  /**
   * How many times the stack has moved (an edit, an undo, a redo, a revert), for a save to tell
   * whether the document it wrote is still the one it holds. The position alone cannot: an undo
   * and then a new edit put it back where it was, over another document.
   */
  readonly moves: number;
  /** What was applied at `at` (where the save READ the document, by default now) is the file on disk. */
  saved(at?: number): void;
  /** The document now holds the file on disk again: a revert, or a reload. */
  reverted(): void;
}

/** One replacement of a text, as a change reports it: `rangeLength` characters at `rangeOffset` became `text`. */
export interface RangeReplacement {
  /** Offset in the text BEFORE the change. */
  rangeOffset: number;
  /** How many characters of the old text the replacement covered. */
  rangeLength: number;
  /** The text that replaced them. */
  text: string;
}

/**
 * The text of a document whose text is the truth (a JSON dictionary): what a source reads, writes
 * a gesture's patches to, undoes and redoes, and hears every change of, its own and anyone else's.
 * In the page, a string with an undo stack of its own (createTextStore); in the VS Code extension,
 * the TextDocument, which a text view of the same file edits too, and whose undo is the table's.
 *
 * It behaves as a TextDocument does, because the JSON engine's rules are the extension's, written
 * against one:
 *  - an edit lands, and is heard, after `apply` returns, and before its promise resolves; until it
 *    lands, `text` and `version` are what they were;
 *  - every change is heard: an edit, an undo or a redo (`reason`), another writer's;
 *  - `dirty`, read while a change is heard, is what it was before that change; when the change
 *    moved it, a change with no replacements follows, read with the new value. A save that turns
 *    it clean is heard as one of those, and on `onSave`.
 */
export interface TextStore {
  /** The text as it stands. */
  readonly text: string;
  /** Moved by every change: what a reading of `text` is a reading of. */
  readonly version: number;
  /** Whether the text differs from the file it was read from or last saved to. */
  readonly dirty: boolean;
  /**
   * Make these patches ONE edit (one undo step): each patch's offsets are in the text as it stands
   * now, and no two overlap. Resolves with whether the edit landed: false when the text moved
   * under it, which a WorkspaceEdit refuses, or when two patches overlap.
   */
  apply(patches: readonly TextPatch[], label?: string): Promise<boolean>;
  /** Undo the newest edit there is, as the editor's Undo does. */
  undo(): void;
  /** Redo the edit undone last. */
  redo(): void;
  /** Hear every change, until the returned function is called. */
  onChange(listener: (change: TextStoreChange) => void): () => void;
  /** Hear every save of the text, until the returned function is called. */
  onSave(listener: () => void): () => void;
}

/** One change of a TextStore, as a TextDocument's change event reports it. */
export interface TextStoreChange {
  /**
   * The replacements it made, each in the text before it, from the end of the text backwards (as
   * a TextDocument lists them). None for a change of `dirty` alone.
   */
  readonly changes: readonly RangeReplacement[];
  /** An undo or a redo; absent for any other change. */
  readonly reason?: 'undo' | 'redo';
}

/**
 * Something the user must not miss, said somewhere the table is not: that a move left its
 * original behind, that an edit could not be undone, that the backup is older than the edits.
 * In the VS Code extension a warning or an error notification, or the status bar for `ms`.
 */
export interface Notice {
  level: 'warning' | 'error' | 'status';
  message: string;
  /** For `status`: how long it shows, in milliseconds. */
  ms?: number;
}

/** Where a source says a Notice. */
export type Notify = (notice: Notice) => void;
