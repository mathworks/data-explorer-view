import type { PropertyGroup } from '../../../model/inspector/piBuilder.js';
import { type GraphBox, type RelationshipGraph } from '../../../model/graph/graphTypes.js';
import type { GraphLayoutStyle } from '../../../model/graph/layout.js';
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
    /** Whether it holds unsaved edits, which its box's page says. */
    dirty?: boolean;
}
/** The file of the box selected in the graph (or of the selected item's box), and its page for the inspector. */
export interface SelectedFile {
    box: GraphBox;
    groups: PropertyGroup[];
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
    /**
     * What the graph has selected changed, or was drawn again: a click on a box, an item or the
     * background, an arrow key, a reveal, a build. For the shell to show `selectedFile()` again.
     */
    selected?(): void;
}
/** The graph pane, as connectShell drives it. */
export interface GraphPane {
    /** The folder shown, or its files, changed: build again, REBUILD_MS after the first change, when the graph is shown. */
    stale(): void;
    /** Something changed (a tab, Root shown): build again, REBUILD_MS after the first change, if the graph is shown and out of date. */
    refresh(): void;
    /**
     * Select the box of the file `uri`, or its item `name`, once the graph holds it, its box opened
     * onto its items, and zoom onto it and what it reaches.
     */
    reveal(uri: string, name?: string): void;
    /**
     * Select and zoom onto what the row `rowId` of the file `uri` stands for, and what it reaches,
     * `rows` its table's: for a row of a model's External Data or Model References, the file it names
     * (its box, or its ghost, as it is); for another row, its item (graphNameOf: a block by its key,
     * anything in a variable by the variable) in its box opened, else the file's box opened; for
     * none, the file's box opened. For a table's Show in Graph.
     */
    showRow(uri: string, rows: readonly TreeTableRow[], rowId: string | null): void;
    /**
     * The file of the box selected (or of the selected item's box), with its page, or null for none:
     * the same object until the graph, the selection or a tab's state changes.
     */
    selectedFile(): SelectedFile | null;
    /** Open the selected box's file, as a double-click on the box does. */
    openSelected(): void;
    /**
     * Open the file a link on the selected file's page names: a box's file by its uri, or a file
     * referenced by `target`, its name, looked for from the selected file as a ghost is.
     */
    openLink(target: string): void;
    /**
     * Draw the graph in `layout`: 'tree', the prototype's top-down trees (the element's default), or
     * 'indented'. For a setting to choose; the element lays the graph out again and fits it.
     */
    setLayout(layout: GraphLayoutStyle): void;
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
