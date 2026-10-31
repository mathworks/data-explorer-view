import type { TextStore } from './hooks.js';
/** A TextStore of the page's own, and what only its owner does to it: save it, and read it from the disk again. */
export interface PageTextStore extends TextStore {
    /**
     * The text at `version` is the file on disk. If the store is still at that version it turns clean
     * at once (heard, and on `onSave`); otherwise it is dirty until the next save (see the header). At
     * once, unlike an edit: a save is of a text that has already landed, and an edit still on its way
     * lands after it.
     */
    saved(version: number): void;
    /**
     * Hold `text`, what the file holds now, with an empty undo stack and nothing unsaved: one change
     * of what differs, heard as every change is, and none for the text it already holds. Resolves
     * once it has landed.
     */
    reset(text: string): Promise<void>;
    /**
     * The file changed and the text was kept instead (Doc.keepOver): no state of the undo stack is the
     * file any more, so the store is dirty until the next save or reset, heard as a save's change is.
     */
    diverged(): void;
}
/**
 * A store of `text`, as read from its file: clean, at version 1. A listener's throw goes to
 * `report` (by default the console).
 */
export declare function createTextStore(text: string, report?: (err: unknown) => void): PageTextStore;
