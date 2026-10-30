import type { TransferTarget } from './transfer.js';
export declare function resolveSectionForPaste(model: any, node: any, rowId: string): any;
/**
 * Where a paste or a drop lands in a dictionary (transfer.ts): the section, and the model it is
 * live in. The model travels with it because the JSON view re-parses whenever its tree is not in
 * step with the text, so asking for "the model" twice can hand back two trees — the section has to
 * be used in the one it was found in.
 */
export interface SectionTarget extends TransferTarget {
    model: any;
    section: any;
}
/**
 * The target a paste or drop onto `rowId` lands in, or null. One answer for both dictionary
 * formats, resolved before anything changes — and by NAME from then on: a same-document move that
 * has to re-read its model after removing the sources finds the section again by its name
 * (`sectionByName`), never through the row, which may have been one of the entries it moved.
 */
export declare function sectionTarget(model: any, node: any, rowId: string): SectionTarget | null;
