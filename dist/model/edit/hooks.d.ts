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
 * a gesture's patches to, and hears every change of, its own and anyone else's. In the page, a
 * string with an undo of its own; in the VS Code extension, the TextDocument, which a text view of
 * the same file edits too, and whose undo is the table's.
 *
 * A change is heard after it is applied, and never during `apply`: as a TextDocument reports one,
 * so a source handles its own writes' echoes the same way in both homes.
 */
export interface TextStore {
    /** The text as it stands. */
    readonly text: string;
    /**
     * Make one gesture's patches ONE edit (one undo step): each patch's offsets are in the text as it
     * stands now, and no two overlap. Resolves with whether the edit landed: false when the text
     * moved under it, which a WorkspaceEdit refuses.
     */
    apply(patches: readonly TextPatch[], label: string): Promise<boolean>;
    /** Hear every change, until the returned function is called: the replacements it made, in the text before it. */
    onChange(listener: (changes: readonly RangeReplacement[]) => void): () => void;
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
