import type { ContextMenuItem } from '../context-menu/dex-context-menu.js';
import { type DragItem, type DropTarget } from '../../model/actions/dropDecision.js';
import { type OperandRow } from '../../model/actions/operands.js';
export interface MenuRow extends OperandRow {
    /** The Name cell, whose `label` is the display name a label quotes. */
    Name?: {
        label?: string;
    } | string;
}
export interface ClipboardState {
    canPaste: boolean;
    mode: 'cut' | 'copy' | null;
    /**
     * What the clipboard holds, payload-free — the same facts dragDescriptor() posts.
     *
     * Here so the menu can run the target's allow-check itself. Without it Paste was
     * enabled on any non-empty clipboard and the host errored at paste time; with it,
     * the menu and a dragover answer "can this land here" from one function.
     */
    items: DragItem[];
    /**
     * The document the entries were copied or cut from, when the host says (with each item's
     * `sectionName`). With both, a cut pasted back into the section it came from is known to be
     * the no-op it is (isNoopMove); without them Paste stays offered and the host no-ops it.
     */
    sourceDocUri?: string;
}
/**
 * The section a paste would land in — a DropTarget minus the parts paste cannot use.
 * `sectionName` ('' for a MAT-file) is what tells a cut pasted back where it came from.
 */
export type PasteTarget = Pick<DropTarget, 'sectionLabel' | 'isDerived' | 'allowedTypes'> & {
    sectionName?: string;
};
/**
 * Everything the menu is built from. A bag rather than positional arguments because
 * seven of them read as noise at the call site, and because both triggers (right-click
 * and keyboard) have to pass the same thing.
 */
export interface MenuInput {
    /** Every row the table holds — operand resolution walks `parent` through them. */
    rows: readonly MenuRow[];
    selectedRowIds: readonly string[];
    /** The right-clicked row (menu) or last-clicked row (keyboard); the paste target. */
    anchorRowId: string | null;
    clipboard: ClipboardState;
    editable: boolean;
    hasTextView: boolean;
    /** The anchor's section rule, or null when it cannot be resolved. */
    pasteTarget: PasteTarget | null;
    /** This document's uri, which a cut's `sourceDocUri` is compared with. */
    docUri?: string;
}
export type ShortcutAction = 'copy' | 'cut' | 'paste' | 'delete';
export declare function resolveShortcutAction(e: KeyboardEvent): ShortcutAction | null;
/**
 * Whether a right-click should open the context menu at all. Read-only
 * documents get NO menu — the read-only byte-backed view has no copy/paste/
 * mutation handlers, so an all-disabled menu would be dead UI.
 */
export declare function shouldShowContextMenu(editable: boolean): boolean;
/**
 * Whether a double-click / Enter should open the inline cell editor. Gated on
 * the document-level flag only: read-only documents never open the editor,
 * regardless of any per-row `editable` flag (which is a coloring signal).
 */
export declare function shouldOpenCellEditor(editable: boolean): boolean;
/**
 * Build the right-click context menu for the CURRENT SELECTION.
 *
 * Pure and synchronous: enablement comes from the host-computed row flags, the cached
 * clipboard state, the target section's rules, and whether the document is editable —
 * no round-trip. Two things it deliberately does NOT decide: which rows are operands
 * (resolveOperands does, so the keyboard cannot diverge) and whether a payload may land
 * in a section (dropDecision.rejectReason does, so a Paste offered here is a drop the
 * hover feedback would allow).
 *
 * GROUPS, THEN JOIN. The items are built as groups and the separators are put between
 * whatever groups survive. A section header's menu — Paste, then Undo/Redo — then falls
 * out of dropping the two empty groups, with no case of its own; so does the binary
 * format's missing "Location in Text". Managing separators by hand is how a menu ends
 * up with two in a row or one at the bottom, and that is exactly what this shape makes
 * impossible.
 */
export declare function buildContextMenuItems(input: MenuInput): ContextMenuItem[];
