import { type RelationshipGraph } from '../../../model/graph/graphTypes.js';
import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { DexRelationshipGraph } from '../modules/dex-relationship-graph.js';
import type { FolderView } from './folder.js';
/**
 * How long after the first change since the last build the graph is built again, in ms: every
 * change in that time is drawn by the one build, and a change during it waits for none of its own
 * (it throttles, it does not wait for the changes to stop).
 */
export declare const REBUILD_MS = 300;
/** A tab, as the graph draws it: its file, and the bytes the file holds as the shell last read or wrote them. */
export interface GraphTab {
    path: string;
    bytes?: Uint8Array;
}
/** What the graph is drawn from, and what its requests do. */
export interface GraphPaneContext {
    /** The open tabs, in their order. */
    tabs(): readonly GraphTab[];
    /** The folder shown now, if any. */
    folder(): FolderView | undefined;
    /** Whether the graph is on screen: Root, with files open. */
    shown(): boolean;
    /** Open the file of `uri`, as a preview, on the row `name` names, if it names one. */
    open(uri: string, name?: string): void;
    /** Say that the file `ref` names is not open, and was not found. */
    notOpen(ref: string): void;
    /** Say that the graph could not be built: why. */
    failed(message: string): void;
}
/** The graph pane, as connectShell drives it. */
export interface GraphPane {
    /** The folder shown, or its files, changed: build again, REBUILD_MS after the first change, when the graph is shown. */
    stale(): void;
    /** Something changed (a tab, Root shown): build again, REBUILD_MS after the first change, if the graph is shown and out of date. */
    refresh(): void;
    /** Select and bring forward the box of the file `uri`, or its item `name` (opening its box), once the graph holds it. */
    reveal(uri: string, name?: string): void;
    /**
     * Select and bring forward what the row `rowId` of the file `uri` stands for, `rows` its table's:
     * for a row of a model's External Data or Model References, the file it names (its box, or its
     * ghost); for another row, its item (graphNameOf: a block by its key, anything in a variable by
     * the variable), else the file's box; for none, the file's box. For a table's Show in Graph.
     */
    showRow(uri: string, rows: readonly TreeTableRow[], rowId: string | null): void;
    dispose(): void;
}
/**
 * The box the reference `ref`, a row of the file `uri`'s table in the section `section`, is drawn
 * to: the file it resolves to, or the ghost of the name, at the end of a link of the section's kind
 * from the file's box. By its name in any case, and else by its name without the extension (a model
 * reference may leave it out): `plant.sldd` under External Data is plant.sldd's box, not the model
 * plant.slx's. Null where the file's box has no such link.
 */
export declare function referencedId(graph: RelationshipGraph, uri: string, ref: string, section: string): string | null;
/** Wire `el` to the open tabs and the folder. */
export declare function connectGraphPane(el: DexRelationshipGraph, context: GraphPaneContext): GraphPane;
