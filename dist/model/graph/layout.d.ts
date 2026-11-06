import type { RelationshipGraph } from './graphTypes.js';
/** A point of the canvas, in its own coordinates. */
export interface GraphPoint {
    x: number;
    y: number;
}
/** A rectangle of the canvas. */
export interface GraphRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
/** Where an item is drawn: inside its box. */
export interface ItemLayout extends GraphRect {
    id: string;
}
/** Where a box is drawn, and the items it shows. */
export interface BoxLayout extends GraphRect {
    id: string;
    /** The items it shows, top to bottom: all of an open box's, of another those an open box reaches. */
    items: ItemLayout[];
    /** Where the line between a model's blocks and its workspace variables is drawn, when it shows both. */
    divider?: number;
}
/** The route of an edge: its corners, from the end it leaves to the end it reaches. */
export interface EdgeLayout {
    id: string;
    /** At least two; every segment horizontal or vertical. The first is on the edge of what it leaves. */
    points: GraphPoint[];
}
/** The whole picture. */
export interface GraphLayout {
    /** Every box of the graph, in the graph's order. */
    boxes: BoxLayout[];
    /** Every edge whose two ends are drawn, in the graph's order: an edge to an item of a closed box is not. */
    edges: EdgeLayout[];
    /** The canvas the boxes and routes fit on, with a margin; 0 by 0 for no boxes. */
    width: number;
    height: number;
}
/** The height of a closed box, or of a box with no items: its icon and label. */
export declare const BOX_HEADER = 44;
/** The band at the top of an open box that its icon, label and collapse button sit in. */
export declare const OPEN_HEADER = 30;
/** The height of an item. */
export declare const ITEM_HEIGHT = 22;
/**
 * The layout of `graph` with the boxes `expanded` names open: each shows its items, and each other
 * box the items of its own those reach (shownItems). Pure: the same graph and the same open boxes
 * give the same layout.
 */
export declare function layoutGraph(graph: RelationshipGraph, expanded: ReadonlySet<string>): GraphLayout;
