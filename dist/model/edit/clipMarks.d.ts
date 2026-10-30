import { type ClipMark } from '../rows/rowStamp.js';
import type { Registers } from './registers.js';
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
export declare function clipMarkOfDoc(registers: Pick<Registers, 'getClipboard'>, docUri: string): ClipMark | undefined;
/** Whether two marks dim and dash exactly the same entries the same way. */
export declare function sameClipMark(a: ClipMark | undefined, b: ClipMark | undefined): boolean;
/** One entry a mark names: the half-keys of rowStamp's clipMarkKey. */
export interface MarkedEntry {
    section: string;
    name: string;
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
export declare function clipMarkChange(painted: ClipMark | undefined, next: ClipMark | undefined): MarkedEntry[] | null;
