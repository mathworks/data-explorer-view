/** The two things the inspector is asked to do: PropertiesViewProvider's. */
export interface Inspector {
    showNode(node: unknown, fromUri?: string): void;
    clear(): void;
}
/** A node by its row id in a document's tree, or null: SlddModel's `findNode`. */
export type FindNode = (uriString: string, nodeId: string) => unknown;
export declare class InspectorSelection {
    private readonly inspector;
    private readonly find;
    /** The selection the inspector was last asked to show. */
    private last;
    constructor(inspector: Inspector, find: FindNode);
    /**
     * A table's selection changed: show its first row's node. A section row has no properties,
     * and neither does a row that resolves to nothing, so the inspector is cleared for either.
     */
    show(uriString: string, rowIds: readonly string[]): void;
    /**
     * `uriString`'s tree changed: show the selected node again from the tree as it is now, if the
     * selection is that document's.
     *
     * A node that no longer resolves is left alone, for the table to settle. Its selection names
     * the same row, and the table reports what it does about that row going: a rename selects the
     * row under its new id, a delete selects the next row, and a selection left naming nothing is
     * cleared (table-main's `scheduleVanishedClear`), each through `show`. Clearing here too would
     * blank the inspector between the edit and that report, the flicker the table defers its own
     * clear to avoid.
     *
     * Never throws. A refresh runs inside the editor's repaint, and the binary .sldd editor's undo
     * and redo repaint inside VS Code's own call, after they have changed the document: a node
     * whose rows cannot be built would otherwise fail that undo half-way. The inspector is cleared
     * instead, since it cannot show the node the table now does.
     */
    refresh(uriString: string): void;
    /** The node of the first row of the last selection, or null for none, a section, or one gone. */
    private resolve;
}
