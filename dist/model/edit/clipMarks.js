// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/clipMarks.ts at c73da3c, with the clipboard passed in
// (a Registers', createRegisters) rather than read from the extension's module-level one. The
// extension keeps its own copy until its editors move onto view's sources; keep the two alike
// (view's CI reports a vscode commit to that file).
//
// Which rows of a document carry the clipboard's mark, and which of them a clipboard broadcast
// moves — said once for every editable table.
//
// A cut or a copy makes no document edit, yet its source rows must gain the cut (dimmed) or
// copied (dashed) affordance, and lose it when the clipboard moves on. So every open table is
// asked to repaint on every clipboard broadcast, and each repaints only the entries the mark it
// last painted and the mark the clipboard holds now name between them; a broadcast that changes
// neither — the usual case, the mark belonging to another document — costs it nothing. Each
// table keeps only what is its own: how to find an entry by (section, name), and what a repaint
// of it is.
import { clipMarkKey, splitClipMarkKey } from '../rows/rowStamp.js';
/**
 * The mark the rows of `docUri` should carry: every entry the clipboard holds from that
 * document, each keyed by its OWN source section (a multi-row cut can span sections, so one
 * shared section would dim the wrong rows; a MAT-file's variables carry '', its one section).
 * Undefined when the clipboard is empty or its entries came from another document.
 *
 * A table asks it for its whole paint and for every entry-scoped repaint alike, so a cut
 * affordance renders the same way whichever one painted it: one that appeared or vanished
 * depending on which repaint the user happened to trigger would be a bug visible only after an
 * edit.
 */
export function clipMarkOfDoc(registers, docUri) {
    const clip = registers.getClipboard();
    if (!clip || clip.sourceDocUri !== docUri)
        return undefined;
    const keys = new Set();
    for (const it of clip.items) {
        const name = it.payload.name;
        if (typeof name === 'string' && name)
            keys.add(clipMarkKey(it.sourceSection, name));
    }
    return keys.size ? { keys, mode: clip.mode } : undefined;
}
// Order-independent: the same entries marked in a different order is the SAME mark, and
// repainting for it would be a repaint the user's rows do not need.
function markKey(mark) {
    return mark ? JSON.stringify([mark.mode, [...mark.keys].sort()]) : '';
}
/** Whether two marks dim and dash exactly the same entries the same way. */
export function sameClipMark(a, b) {
    return markKey(a) === markKey(b);
}
/**
 * The entries whose rows a move from the `painted` mark to the `next` one repaints, or null
 * when the two are the same mark and nothing need be repainted.
 *
 * Every entry either mark names: the ones losing the affordance and the ones gaining it. A key
 * in both is listed once, as is an entry a copy re-takes as a cut. An entry that is no longer in
 * the document is the caller's to skip: its rows are already gone (a cut+paste moves the very
 * entry that held the mark), so there is nothing left to un-dim.
 */
export function clipMarkChange(painted, next) {
    if (sameClipMark(painted, next))
        return null;
    const keys = new Set([...(painted?.keys ?? []), ...(next?.keys ?? [])]);
    return [...keys].map(splitClipMarkKey);
}
