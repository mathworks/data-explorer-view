import { type Session } from 'data-explorer-core';
import type { ClipboardMode } from '../source/wire.js';
import type { ClipboardItem, DragRegisterItem, Registers } from './registers.js';
/** The part of core's session a snapshot asks. */
export type SnapshotSession = Pick<Session, 'copyRefusal' | 'findNodeById' | 'getDataSource'>;
export interface CopyDeps {
    /** Core's session, which the entries are asked of (copyRefusal) and resolved in. */
    session: SnapshotSession;
    /** The registers the copy or the drag lands in. */
    registers: Pick<Registers, 'setClipboard' | 'setDrag' | 'clearDrag'>;
    /**
     * Bring this format's model up to date with its live content. Called ONCE per
     * copy, however many rows it covers: a JSON dictionary re-parses its text here,
     * which is ~190 ms on a real customer dictionary — per row it would be per row.
     */
    refresh: () => void;
    /** Resolve a row id against the refreshed model. */
    findNode: (rowId: string) => any;
    /** Say a failure in the owning table. Only ever used for failures. */
    post: (message: {
        type: 'error';
        message: string;
    }) => void;
    /** Fan the register's new state out to every live table (the registers' broadcast). */
    broadcast: () => void;
    /**
     * The token this document's deleter will tell an entry by when a move takes it out later, for
     * a document whose selectors cannot (a MAT-file's: a name and no uuid). Absent for a
     * dictionary, whose uuid already does.
     */
    originOf?: (entry: any) => object | undefined;
}
/**
 * A copy, a cut or a drag refused before anything reached its register: an entry that cannot
 * travel (core's copyRefusal). The message names the entry and is shown as it is, never behind
 * a "Failed to" prefix: it is a reason, not a failure.
 */
export declare class CopyRefused extends Error {
    constructor(message: string);
}
/**
 * The section an entry is carried from, as its register item spells `sourceSection`: its
 * section's name in a dictionary, and WHOLE_FILE_SECTION for an entry with no section between
 * it and its document — a MAT-file's variable, whose parent is the file's own source node. That
 * node's name is the srcId it was registered under, which no section rule spells, so a copied
 * variable recorded under it would make no same-file move a no-op and dim no row.
 *
 * Told by the session, not by the node's class: a parent the session holds as a source IS the
 * document. A detached entry, or one whose section has no name, is '' as it always was.
 */
export declare function sourceSectionOf(session: Pick<Session, 'getDataSource'>, entry: any): string;
/**
 * Snapshot the rows a drag started on into the drag-register shape: the same walk, dedupe and
 * refusal as a copy, so "if you can cut/copy you can drag". Each item keeps its OWN source
 * section: a multi-row drag can span sections, and whether a move is a no-op depends on every
 * item's section.
 */
export declare function buildDragSnapshot(session: SnapshotSession, rowIds: unknown, findNode: (rowId: string) => any, originOf?: (entry: any) => object | undefined): {
    items: DragRegisterItem[];
};
/**
 * Snapshot the rows a copy/cut acts on into the clipboard shape: the same walk and the same
 * dedupe as buildDragSnapshot. Each item keeps its OWN source section: a cut is lazy, so the
 * source deletion at paste time must find each entry where it actually lives.
 */
export declare function buildClipboardSnapshot(session: SnapshotSession, rowIds: unknown, findNode: (rowId: string) => any, originOf?: (entry: any) => object | undefined): ClipboardItem[];
/**
 * Snapshot every entry the rows resolve to onto the clipboard in `mode`.
 *
 * Rows are deduped by owning entry, so selecting a bus and two of its elements copies ONE bus.
 * `uriString` is recorded with the payloads because a cut is LAZY — the source delete is deferred
 * to paste time, and the paste may land in a different document, so the clipboard must remember
 * which document to delete from.
 *
 * Returns whether anything reached the clipboard. Callers do not need the result (every failure
 * has already been said in the table); it exists so the outcome is assertable.
 */
export declare function copyEntriesToClipboard(rowIds: readonly string[], mode: ClipboardMode, uriString: string, deps: CopyDeps): boolean;
/**
 * Snapshot every entry the dragged rows resolve to into the drag register, and tell every open
 * table, so each can predict the drop on dragover. A refused or failed start leaves no drag behind
 * and says why. Returns whether anything is being dragged, for the tests.
 */
export declare function dragEntries(rowIds: readonly string[], uriString: string, deps: CopyDeps): boolean;
