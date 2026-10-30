// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/transfer.ts at c73da3c. The extension keeps its own
// copy until its editors move onto view's sources; keep the two alike (view's CI reports a vscode
// commit to that file). One difference: TransferRefused is core's (v1.53.0), not a class of its
// own, since core's paste rules (refuseDisallowedPaste) throw it, and the policy below tells a
// refusal by it.
//
// What a paste or a drop MEANS, said once for every editable table.
//
// A paste is a drop whose source register is the clipboard rather than the drag register:
// both carry N entries, each with the section it was taken from, a document they came from,
// and whether that document is to lose them. Each provider used to spell the whole of it out
// twice, once per register, and the copies drifted the way this repo keeps finding: a
// same-section move was a no-op for a paste and not for a drop, a cut was cleared after the
// source delete failed but reported as a failed edit, a missing source deleter moved nothing
// and said nothing. So the RULES live here and nothing else does:
//
//   - which register, and when it is let go of: the clipboard only after a cut that landed (or
//     was a no-op), the drag register always, and either only while it still holds what this
//     transfer read — a newer copy or drag written meanwhile is the user's, not ours to clear;
//   - the target, resolved BEFORE anything changes, and a move back into the very section
//     every item came from answered as the no-op it is;
//   - a same-document move made as ONE edit that removes the sources first, so the pasted
//     entries keep their names (`removeFirst`), and a cross-document move made as the paste
//     here and then the delete over there (`deleteFromSource`);
//   - a move of an entry its document cannot tell apart by the selector the delete uses (a
//     dictionary entry with no uuid whose name another section holds) refused before anything
//     changes: a copy of it is fine, a move would take out the wrong original;
//   - what each way of failing says. A refusal that changed nothing (`TransferRefused`) is a
//     message; anything else thrown before the edit landed is the adapter's to repair
//     (`onFailure`); a source delete that fails AFTER the edit landed is neither — the paste
//     happened, so nothing is repaired and the message says exactly what is left to do.
//
// What an edit IS in each format — a WorkspaceEdit painted ahead of its echo, a chunk pushed on
// a custom document's own stack, a session gesture over core's tree — is the adapter's, and
// this module neither knows nor imports any of it. That is also why it is vscode-free: every
// branch above is unit-tested with a fake adapter (test/transfer.test.ts).
import { TransferRefused, entrySelectorOf } from 'data-explorer-core';
import { uriBasename } from '../ids/pathUtil.js';
/**
 * A refusal that changed nothing: a message, and no repair. Core's class, re-exported: core's
 * paste rules throw it, and an adapter does too.
 *
 * Thrown by an adapter (or the policy) only while the document, its model and its rows are all
 * still exactly as they were — the cut stays on the clipboard for another try, and no repaint
 * is spent putting back what was never moved.
 */
export { TransferRefused };
/**
 * Whether moving `contents` onto `sectionName` of `docUri` would change nothing: every item
 * already lives there. The one rule both registers obey, and the one the webview's drop
 * predictor (dropDecision) answers the same way — pinned between the two in
 * multiSelectInvariants.test.ts. With mixed sources it is NOT a no-op: the items from
 * elsewhere really do move, and the ones already there are removed and re-added under the
 * names they had.
 */
export function isNoopMove(contents, docUri, sectionName) {
    return (contents.move &&
        contents.sourceDocUri === docUri &&
        contents.items.every((it) => it.sourceSection === sectionName));
}
/**
 * Paste the clipboard, or drop the drag register, onto `req.rowId` of the adapter's document.
 *
 * Synchronous up to the commit: nothing here awaits before the adapter makes its edit, so the
 * target it resolved and the document it resolved it in are still the ones it edits.
 */
export async function runTransfer(req, register, adapter, deps) {
    try {
        return await transfer(req, register, adapter, deps);
    }
    finally {
        // A drop ends the drag whatever became of it. Cleared only on success, a refused drop left
        // every table predicting a drop that had already been tried, until the source view's
        // dragEnd came round to clear it.
        if (register.kind === 'drag') {
            register.clear();
            register.broadcast();
        }
    }
}
async function transfer(req, register, adapter, deps) {
    const isPaste = register.kind === 'clipboard';
    if (adapter.guard && !adapter.guard())
        return { kind: 'guarded' };
    const contents = register.read();
    if (!contents || contents.items.length === 0) {
        adapter.report(isPaste ? 'Nothing to paste — the clipboard is empty.' : 'Nothing to drop.');
        return { kind: 'empty' };
    }
    let target;
    try {
        target = adapter.resolveTarget(req.rowId);
        if (!target) {
            adapter.report('Could not resolve the target section.');
            return { kind: 'no-target' };
        }
        // A move back into the section every item came from. The clipboard's cut is spent on it
        // (the mark goes, as it would after any paste); the drag register goes in the finally.
        if (isNoopMove(contents, adapter.docUri, target.sectionName)) {
            if (isPaste) {
                register.clear();
                register.broadcast();
            }
            return { kind: 'noop' };
        }
    }
    catch (err) {
        return refusedOrFailed(err, adapter);
    }
    const sameDoc = contents.sourceDocUri === adapter.docUri;
    // Selectors, not names: an entry's name is unique only within its namespace, and a .sldd
    // holds several, so deleting by name alone could take a same-named entry out of another
    // section (core's entrySelector.ts). Nameless payloads name nothing to delete.
    const selectors = contents.items
        .map((it) => (it.origin ? { ...entrySelectorOf(it.payload), origin: it.origin } : entrySelectorOf(it.payload)))
        .filter((s) => s.name.length > 0);
    const removeFirst = contents.move && sameDoc ? selectors : [];
    const label = isPaste ? 'Paste' : contents.move ? 'Move' : 'Copy';
    try {
        const shared = contents.move ? contents.items.find((it) => it.sharedName) : undefined;
        if (shared) {
            throw new TransferRefused(sharedNameRefusal(isPaste ? 'cut' : 'move', String(shared.payload.name ?? ''), contents.sourceDocUri));
        }
        if (removeFirst.length > 0 && adapter.takesRemoveFirst === false) {
            throw new TransferRefused(`Cannot move entries within ${fileNameOf(adapter.docUri)}.`);
        }
        const payloads = contents.items.map((it) => it.payload);
        adapter.validate?.(target, payloads);
        await adapter.commit({ target, payloads, removeFirst, label });
    }
    catch (err) {
        return refusedOrFailed(err, adapter);
    }
    // Landed. Everything below is the source's half of a cross-document move, and none of it
    // may undo or repaint what just happened here.
    if (!contents.move)
        return { kind: 'done' };
    // Consumed by the paste that just landed, whatever the source delete does next: a cut left
    // live would paste the same entries a second time. Cleared BEFORE the delete is awaited, so
    // a second Paste arriving meanwhile finds nothing to paste rather than this cut again.
    if (isPaste)
        register.clear();
    try {
        if (sameDoc || selectors.length === 0)
            return { kind: 'done' };
        const result = await sourceDelete(contents.sourceDocUri, selectors, deps);
        if (result.removed)
            return { kind: 'done' };
        const message = sourceKeptMessage(isPaste, contents.sourceDocUri, selectors.length, result.reason, result.gone === true);
        adapter.report(message);
        deps.warn?.(message);
        return { kind: 'done', sourceKept: message };
    }
    finally {
        if (isPaste)
            register.broadcast();
    }
}
// The source delete, with every way it can fail turned into a result: the caller's answer to all
// of them is the same message.
async function sourceDelete(sourceDocUri, selectors, deps) {
    if (!sourceDocUri)
        return { removed: false, reason: 'nothing says which file it came from' };
    try {
        return await deps.deleteFromSource(sourceDocUri, selectors);
    }
    catch (err) {
        return { removed: false, reason: err?.message || String(err) };
    }
}
function refusedOrFailed(err, adapter) {
    if (err instanceof TransferRefused) {
        adapter.report(err.message);
        return { kind: 'refused', message: err.message };
    }
    adapter.onFailure(err);
    return { kind: 'failed', error: err };
}
/**
 * Why an entry that shares its name in its document cannot be cut or moved, naming it and the
 * document: the move would take its original out by that name, and could take the other one.
 * Said where a cut is refused (clipboardAction) and where a move-mode drop is (above), in the
 * same words, because it is the same rule.
 */
export function sharedNameRefusal(verb, name, sourceDocUri) {
    const where = sourceDocUri ? fileNameOf(sourceDocUri) : 'its file';
    return `Cannot ${verb} "${name}": ${where} holds more than one "${name}", and a move takes its original out by name. Copy it instead.`;
}
/**
 * "Pasted here, but the original in a.sldd could not be removed: <reason>. Remove it there by
 * hand." — accurate about both halves: the paste DID land, and nothing was rolled back. Or, where
 * the original is `gone` (SourceDeleteResult.gone), "Pasted here; the original in a.mat is no
 * longer there to remove: <reason>." — asking nothing, since what holds its name now is not it.
 */
export function sourceKeptMessage(isPaste, sourceDocUri, count, reason, gone = false) {
    const what = count === 1 ? 'the original' : 'the originals';
    const where = sourceDocUri ? ` in ${fileNameOf(sourceDocUri)}` : '';
    const why = (reason ?? 'the source did not say why').replace(/[.\s]+$/, '');
    const verb = isPaste ? 'Pasted' : 'Moved';
    // Nothing to remove by hand: what holds the original's name there now is something else.
    if (gone)
        return `${verb} here; ${what}${where} ${count === 1 ? 'is' : 'are'} no longer there to remove: ${why}.`;
    return `${verb} here, but ${what}${where} could not be removed: ${why}. Remove ${count === 1 ? 'it' : 'them'} there by hand.`;
}
/** The file name a uri string ends in, decoded, for a message. */
export function fileNameOf(uriString) {
    const raw = uriBasename(uriString);
    try {
        return decodeURIComponent(raw) || raw;
    }
    catch {
        return raw;
    }
}
