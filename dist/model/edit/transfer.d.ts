import { type EntrySelector } from 'data-explorer-core';
/** One entry a transfer carries: what to paste, and the section it was taken from. */
export interface TransferItem {
    payload: Record<string, unknown>;
    /** The section the entry was taken from. `''` for a MAT-file, whose one section has no name. */
    sourceSection: string;
    /**
     * Another entry of its document answers to the selector a move would delete it by
     * (structuralEdit's registerItemsOf), so a move of it is refused: the delete could take the
     * other one. A copy of it is a copy like any other.
     */
    sharedName?: boolean;
    /**
     * Who the entry was when it was taken, for a source whose selector cannot say: an opaque token
     * its document handed out (a MAT-file's variable has a name and no uuid, so a cut of `x`, then
     * a delete of `x` and an Add of another `x`, would otherwise have the paste take out the new
     * one). Carried to that document's deleter (SourceSelector.origin) and read by nothing else.
     */
    origin?: object;
}
/**
 * What a cross-document move asks the source document to remove: the entry's selector, and its
 * origin token where it was taken with one (TransferItem.origin).
 */
export interface SourceSelector extends EntrySelector {
    origin?: object;
}
/** What a register held when the transfer read it. */
export interface TransferContents {
    items: readonly TransferItem[];
    /** The document the items were taken from. */
    sourceDocUri: string | undefined;
    /** The source is to lose them: a cut, or a drop in move mode. */
    move: boolean;
}
/**
 * Where a transfer's items come from, and how it lets go of them.
 *
 * Read ONCE, at the start; `clear` empties it only if it still holds what that read returned,
 * so a copy or a drag the user started while this transfer was awaiting its write survives it.
 * `clear` and `broadcast` are separate because a cut is consumed the moment its paste lands —
 * a second Paste arriving while the source delete is still in flight must find the clipboard
 * empty — while the tables are told once that delete is done, so a source row is not un-dimmed
 * a moment before it disappears. See transferRegisters.ts for the two real registers.
 */
export interface TransferRegister {
    /** `'clipboard'` for a paste, `'drag'` for a drop; decides when the register is cleared. */
    readonly kind: 'clipboard' | 'drag';
    /** What the register holds, or null when it is empty. */
    read(): TransferContents | null;
    /** Empty the register, if it still holds what `read` returned. */
    clear(): void;
    /** Tell every open table what the register now holds. */
    broadcast(): void;
}
/** Where a transfer lands. Adapters extend it with whatever their commit needs (a live section, a model). */
export interface TransferTarget {
    /** The section the entries go into, spelled as items spell `sourceSection`. */
    sectionName: string;
}
/** What a transfer asks its adapter to make, as ONE edit — one undo step. */
export interface TransferCommit<T extends TransferTarget> {
    target: T;
    /** The entries to paste, in register order. The adapter clones what it keeps. */
    payloads: Record<string, unknown>[];
    /**
     * The entries to take out of THIS document first, in the same edit, so the pasted ones keep
     * their names (a source still standing in the namespace would push its copy to `Name1`).
     * Non-empty only for a same-document move.
     */
    removeFirst: EntrySelector[];
    /** What the edit is called, for an undo stack that names its steps. */
    label: TransferLabel;
}
export type TransferLabel = 'Paste' | 'Move' | 'Copy';
/**
 * One document's half of a transfer: the format-specific parts, as a provider-local closure.
 *
 * Created per transfer, so it may keep that transfer's own state (whether it has painted yet,
 * say) for `onFailure` to read.
 */
export interface TransferAdapter<T extends TransferTarget = TransferTarget> {
    /** This document's uri: what a register's `sourceDocUri` is compared with. */
    readonly docUri: string;
    /**
     * False for a document that cannot remove-and-paste in one edit because it never has to: a
     * MAT-file is one section, so a same-file move is always the same-section no-op. Should the
     * policy ever need it anyway, the transfer is refused rather than made as something else.
     * Default true.
     */
    readonly takesRemoveFirst?: boolean;
    /**
     * A precondition checked before the register is read — the JSON view's mid-edit gate. Reports
     * its own refusal and answers false to stop the transfer.
     */
    guard?(): boolean;
    /**
     * The target the row names (`''` = the document itself), or null when it names none. Must
     * change nothing. May throw TransferRefused.
     */
    resolveTarget(rowId: string): T | null;
    /**
     * Refuse, BEFORE anything changes, what the target will not take — by throwing TransferRefused.
     * Asked after the no-op check: entries already in the target are not re-judged by it.
     */
    validate?(target: T, payloads: readonly Record<string, unknown>[]): void;
    /** Make the edit. Throws TransferRefused only when it has changed nothing. */
    commit(plan: TransferCommit<T>): Promise<void> | void;
    /** Something other than TransferRefused was thrown before the edit landed: repair, and say so. */
    onFailure(err: unknown): void;
    /** Show `message` in this document's view. */
    report(message: string): void;
}
/**
 * What a source deleter did. `removed: false` is not an exception because the caller has
 * nothing to repair: the paste already landed, and the user has to be told what is left.
 */
export interface SourceDeleteResult {
    removed: boolean;
    /** Why not, as the tail of "…could not be removed: <reason>". Absent when removed. */
    reason?: string;
    /**
     * Not removed because the original is no longer in its document — deleted since it was taken,
     * and its name since given to another entry, which the deleter left alone. Nothing is left for
     * the user to remove, so the message asks nothing of them: the entry that holds the name now
     * is not the original, and removing it by hand would lose it.
     */
    gone?: boolean;
}
export interface TransferDeps {
    /** Take the moved entries out of the document they came from (editorHub.deleteFromSource). */
    deleteFromSource(sourceDocUri: string, selectors: SourceSelector[]): Promise<SourceDeleteResult>;
    /**
     * Say something the user must not miss, somewhere that stays until they dismiss it (the
     * providers use `vscode.window.showWarningMessage`). Used for one thing: a move that landed
     * here but left its original behind. The view's banner says it too, but the next row update
     * clears a banner, and a duplicate the user never learned of is the outcome this exists for.
     */
    warn?(message: string): void;
}
export interface TransferRequest {
    /**
     * The row pasted or dropped on — a section header row for an empty section, or `''` for the
     * document itself (a whole-file document such as a MAT-file, whose empty table has no row to
     * aim at). Passed to the adapter as it is: `''` is a target to resolve, not a missing one.
     */
    rowId: string;
}
/**
 * A refusal that changed nothing: a message, and no repair.
 *
 * Thrown by an adapter (or the policy) only while the document, its model and its rows are all
 * still exactly as they were — the cut stays on the clipboard for another try, and no repaint
 * is spent putting back what was never moved.
 */
export declare class TransferRefused extends Error {
    constructor(message: string);
}
/** How a transfer ended. Callers need not read it; it is what the policy's branches are tested by. */
export type TransferOutcome = {
    kind: 'guarded';
} | {
    kind: 'empty';
} | {
    kind: 'no-target';
} | {
    kind: 'noop';
} | {
    kind: 'refused';
    message: string;
} | {
    kind: 'failed';
    error: unknown;
}
/** Landed. `sourceKept` is the message reported when a move's source delete did not happen. */
 | {
    kind: 'done';
    sourceKept?: string;
};
/**
 * Whether moving `contents` onto `sectionName` of `docUri` would change nothing: every item
 * already lives there. The one rule both registers obey, and the one the webview's drop
 * predictor (dropDecision) answers the same way — pinned between the two in
 * multiSelectInvariants.test.ts. With mixed sources it is NOT a no-op: the items from
 * elsewhere really do move, and the ones already there are removed and re-added under the
 * names they had.
 */
export declare function isNoopMove(contents: TransferContents, docUri: string, sectionName: string): boolean;
/**
 * Paste the clipboard, or drop the drag register, onto `req.rowId` of the adapter's document.
 *
 * Synchronous up to the commit: nothing here awaits before the adapter makes its edit, so the
 * target it resolved and the document it resolved it in are still the ones it edits.
 */
export declare function runTransfer<T extends TransferTarget>(req: TransferRequest, register: TransferRegister, adapter: TransferAdapter<T>, deps: TransferDeps): Promise<TransferOutcome>;
/**
 * Why an entry that shares its name in its document cannot be cut or moved, naming it and the
 * document: the move would take its original out by that name, and could take the other one.
 * Said where a cut is refused (clipboardAction) and where a move-mode drop is (above), in the
 * same words, because it is the same rule.
 */
export declare function sharedNameRefusal(verb: 'cut' | 'move', name: string, sourceDocUri: string | undefined): string;
/**
 * "Pasted here, but the original in a.sldd could not be removed: <reason>. Remove it there by
 * hand." — accurate about both halves: the paste DID land, and nothing was rolled back. Or, where
 * the original is `gone` (SourceDeleteResult.gone), "Pasted here; the original in a.mat is no
 * longer there to remove: <reason>." — asking nothing, since what holds its name now is not it.
 */
export declare function sourceKeptMessage(isPaste: boolean, sourceDocUri: string | undefined, count: number, reason: string | undefined, gone?: boolean): string;
/** The file name a uri string ends in, decoded, for a message. */
export declare function fileNameOf(uriString: string): string;
