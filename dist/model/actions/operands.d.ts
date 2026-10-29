/** The subset of a table row this module reads. */
export interface OperandRow {
    ID: string;
    /** The parent ROW id: a section header (`section:<name>`) for a top-level entry. */
    parent?: string | null;
    _canCopy?: boolean;
    _canDelete?: boolean;
    _canAddChild?: boolean;
}
export interface Operands {
    /**
     * Rows to delete, entries and nested children alike, after subsumption.
     * Order-stable (selection order) and deduped.
     */
    deleteIds: string[];
    /** Owning-entry rows for Copy/Cut, deduped, order-stable. */
    entryIds: string[];
    /** Distinct section header rows the selection's data rows resolve to. */
    sections: string[];
}
/**
 * The section header row one row belongs to, at any depth — or null if the table can't say.
 *
 * A header answers for itself: it is the only paste target an empty section has. A data row
 * answers with its owning ENTRY's parent, which is the walk the HOST does through
 * `findOwningEntry(node).parent` (structuralEdit.resolveSectionForPaste). Mirroring that walk
 * is the point: the menu offers Paste against the section the host will actually paste into,
 * so a Paste on a bus element is offered exactly when the host would accept it. Looking only
 * at the row's immediate parent would refuse it — silently, since a target that cannot be
 * resolved has no reason to show.
 */
export declare function sectionRowIdOf(rowId: string, rows: readonly OperandRow[]): string | null;
/**
 * Resolve a selection into the operands each action acts on.
 *
 * Section headers are dropped: a header is never a row-action operand, though it
 * remains valid as a PASTE TARGET (the only target an empty section has). A
 * selection of headers alone therefore yields no operands, which is what tells the
 * menu builder to show the short section menu.
 */
export declare function resolveOperands(selectedRowIds: readonly string[], rows: readonly OperandRow[]): Operands;
