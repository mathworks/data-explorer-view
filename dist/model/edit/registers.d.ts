import type { DropFacts } from '../actions/dropFacts.js';
import type { ClipboardStatus } from '../source/tableSource.js';
import type { ClipboardMode, DragDescriptor } from '../source/wire.js';
import type { SourceDeleteResult, SourceSelector, TransferRegister } from './transfer.js';
/** One copied/cut entry: what to paste, where it came from, and what it looks like. */
export interface ClipboardItem extends DropFacts {
    payload: Record<string, unknown>;
    sourceSection: string;
    /** Its document's token for the entry as it was taken, for that document's deleter (transfer.ts). */
    origin?: object;
}
/** What the clipboard holds. */
export interface ClipboardEntry {
    items: ClipboardItem[];
    mode: ClipboardMode;
    sourceDocUri?: string;
}
export interface DragRegisterItem extends DropFacts {
    payload: Record<string, unknown>;
    sourceSection: string;
    /** Its document's token for the entry as it was taken, for that document's deleter (transfer.ts). */
    origin?: object;
}
/** What the drag register holds. */
export interface DragEntry {
    sourceDocUri: string;
    items: DragRegisterItem[];
}
/**
 * What a cross-document move asks the source document to remove: a name, or a selector with the
 * origin token its document handed out when the entry was taken, if it did (transfer.ts).
 */
export type DeleteTarget = string | SourceSelector;
/**
 * How one open document removes named entries from ITSELF, in its own format.
 *
 * It answers rather than reports. A deleter runs on behalf of ANOTHER document's paste or drop,
 * so the view it would post to is not the one the user is looking at — it may be a background
 * tab, or a panel already disposed, whose postMessage throws. The transfer that asked
 * (transfer.ts) reports the answer on its own view, which is the one where the gesture happened.
 */
export type SourceDeleter = (targets: DeleteTarget[]) => Promise<SourceDeleteResult> | SourceDeleteResult;
/**
 * A deleter's reason when nothing in its document answers to the names it was given any more:
 * renamed or deleted since the cut. One spelling for every format, because it is one fact.
 */
export declare const NOT_FOUND_REASON = "nothing in it answers to that name any more";
/** What the clipboard holds, as a broadcast tells it: a ClipboardStatus that always says where each entry came from. */
export interface ClipboardBroadcast extends ClipboardStatus {
    sourceDocUri: string | undefined;
    items: (DropFacts & {
        sectionName: string;
    })[];
}
/**
 * Who hears a broadcast: a table's end, told what the clipboard holds (and, for a lazy cut, to
 * repaint the rows its mark moves between) and what drag is in flight.
 */
export interface RegisterListener {
    clipboard?(state: ClipboardBroadcast): void;
    drag?(descriptor: DragDescriptor | null): void;
}
/** The registers a window's editable documents share. Every member is a plain function, so it can be passed on its own. */
export interface Registers {
    /**
     * Replace the clipboard with `items`.
     *
     * An empty list clears it rather than storing an empty register: a copy that resolved
     * no entries would otherwise leave Paste enabled with nothing behind it.
     */
    setClipboard(items: ClipboardItem[], mode: ClipboardMode, sourceDocUri?: string): void;
    getClipboard(): ClipboardEntry | null;
    clearClipboard(): void;
    canPaste(): boolean;
    /**
     * Public state told to every table so it can build its menu synchronously.
     *
     * `items` is the payload-FREE strip, exactly as `dragDescriptor()` strips the drag
     * register: a table needs the drop facts to predict whether a paste may land here
     * (dropDecision), and must never be shipped the entry records.
     *
     * Where the cut came from travels too — the document, and each item's section, in the
     * shape the drag descriptor spells them (`docUri` there, `sectionName` per item) — so the
     * menu can say what the host decides (transfer.ts's isNoopMove): a cut pasted back into the
     * section every item came from, in the document it came from, does nothing, and a Paste
     * offered over it would be a menu item that does nothing when clicked.
     */
    clipboardState(): ClipboardBroadcast;
    setDrag(sourceDocUri: string, items: DragRegisterItem[]): void;
    getDrag(): DragEntry | null;
    clearDrag(): void;
    /** The payload-free descriptor told to every table for live drag feedback. */
    dragDescriptor(): DragDescriptor | null;
    /**
     * The clipboard as a paste reads it — at the moment the paste starts, not when the message
     * arrived, so a second Paste queued behind a cut's paste finds the clipboard that cut left.
     * Clears the clipboard only while it still holds what that read returned. `broadcast` defaults
     * to `broadcastClipboardState`.
     */
    clipboardRegister(broadcast?: () => void): TransferRegister;
    /**
     * The drag register as a drop reads it — captured NOW, when the drop message arrives.
     *
     * A drop is followed at once by its source's `dragEnd`, which clears the register. A source
     * that queues its structural edits (the JSON view does, so two of them cannot interleave around
     * one write) would otherwise run the drop after that and find nothing to drop. `broadcast`
     * defaults to `broadcastDragState`.
     */
    dragRegister(mode: 'copy' | 'move', broadcast?: () => void): TransferRegister;
    /** How the document `uriString` removes entries from itself, for a move out of it. */
    registerSourceDeleter(uriString: string, fn: SourceDeleter): void;
    unregisterSourceDeleter(uriString: string): void;
    /**
     * Complete the source-delete half of a cross-document move, and say whether it happened.
     *
     * During a drag the source view is open (closing it ends the drag), so its deleter is here. A
     * CUT is different: it is lazy, so its source may have been closed between the cut and the
     * paste, and then there is no deleter — and no format-appropriate way to edit the file — so the
     * original stays where it is: an answer the caller reports.
     *
     * A deleter that throws still throws: the caller (transfer.ts) turns that into the same report.
     */
    deleteFromSource(uriString: string, targets: DeleteTarget[]): Promise<SourceDeleteResult>;
    /** Hear every broadcast, until the returned function is called. */
    listen(listener: RegisterListener): () => void;
    /**
     * Tell every listener what the clipboard now holds. Each is reached on its own terms: one that
     * throws — a panel disposed under the loop, a model that will not read — costs that table its
     * update and nobody else theirs.
     */
    broadcastClipboardState(): void;
    /** Tell every listener the drag in flight (or null when it ends), each on its own terms. */
    broadcastDragState(): void;
}
/**
 * Run one listener's half of a broadcast, keeping whatever it throws — now or, for a post that
 * answers a promise, later as a rejection — from reaching the loop that serves every other one.
 * An engine's own listener runs each half of its answer through it too, as editorHub reaches a view.
 */
export declare function reach(run: () => unknown): void;
/** A window's registers, all empty. */
export declare function createRegisters(): Registers;
