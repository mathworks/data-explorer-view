import { LitElement, type PropertyValues } from 'lit';
import { type RelationshipGraph } from '../../../model/graph/graphTypes.js';
import { type GraphLayoutStyle } from '../../../model/graph/layout.js';
/** What `dex-graph-selected` carries: the box or item now selected, or null for none. */
export interface GraphSelectedDetail {
    /** A box's id (a file's uri, for a file given) or an item's; null when the selection was cleared. */
    id: string | null;
}
/**
 * What `dex-graph-open` carries: the file to open, and the row in it to reveal; or, for a file
 * referenced and not open (a ghost), the reference to find it by.
 */
export interface GraphOpenDetail {
    /** The file's uri; empty for a ghost, which is no file the app has. */
    uri: string;
    /** For an item, the name its file's table selects it by (`GraphItem.revealName`); absent for a box. */
    name?: string;
    /**
     * For a ghost, its reference as the referencing file wrote it (`GraphBox.ref`), for the app to
     * resolve as it resolves a link to a file. It may find nothing; what then is the app's to say.
     */
    ref?: string;
}
/** What `dex-graph-expand` carries: the box whose items to show or hide. */
export interface GraphExpandDetail {
    /** The box. */
    id: string;
    /** True to show its items, false to hide them. */
    expanded: boolean;
}
/**
 * How the open models, dictionaries and MAT-files connect: the models on the left as a tree of
 * their references, the data files on the right, each a box of its kind's colour, a file referenced
 * and not open dashed, and the edges between them. Every box starts closed. An open box lists the
 * blocks and variables that take part, a model's workspace variables under a divider, and every
 * other box the items of its own those reach (a model open shows, in a dictionary, the variables
 * its blocks read), with an edge from each block to each variable it reads, labelled with the block
 * parameter. The edges run under the boxes; what the selection reaches is drawn over them. The
 * graph comes from `buildRelationshipGraph`; where it is drawn, from `layoutGraph`.
 *
 * A click on a box or an item selects it (`dex-graph-selected`), and lights it and what its edges
 * reach, dimming the rest; a click on the background clears it. A double-click asks to open the
 * file (`dex-graph-open`), at the item's row for an item, and a ghost by the reference that names
 * it, for the app to look for. A box's − or + asks to hide or show its
 * items (`dex-graph-expand`); the app answers by setting `expanded`. A box so opened is zoomed to
 * with the files it reaches, the rest dimmed, as the prototype's expand did, until it is closed,
 * Escape is pressed or the background clicked; a double-click on the background asks to close
 * every box and fits the graph. The pointer on an item traces what it is joined to, as a selection
 * of it would; on an edge, it fades the others. The wheel, the + and − buttons and a drag of the
 * background zoom and pan; the fit button and fit() show the whole graph, reveal() brings one box
 * or item to the middle, and zoomToReach() one and what it reaches. A Legend, closed at first,
 * names the kinds.
 *
 * The keyboard: the canvas is one stop of the tab order; the arrows move the selection to the
 * nearest box that way, Enter opens the selected box or item, Space shows or hides the selected
 * box's items, Escape clears the selection and the dimming of a box opened, + and − zoom and 0
 * fits.
 *
 * @tagname dex-relationship-graph
 */
export declare class DexRelationshipGraph extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The graph to draw, from `buildRelationshipGraph`. Null, the default, or one with no boxes,
     * draws a note saying what to open. A new graph whose boxes are other than the last one's is
     * fitted to the canvas; one with the same boxes (rebuilt after an edit) keeps the view.
     */
    graph: RelationshipGraph | null;
    /**
     * The id of the box or item to select: a box's id (a file's uri, for a file given) or an item's,
     * as `graphIdOf` gives it. It is lit with what its edges reach, and the rest is dimmed. Null, the
     * default, selects nothing. A click changes it and sends `dex-graph-selected`; setting it sends
     * nothing. Attribute `selected`.
     */
    selected: string | null;
    /**
     * The ids of the boxes that are open. An open box shows all its items, and each other box the
     * items of its own an open box's edges reach: a model open shows its blocks and, in each data file
     * they read, only the variables they read. None, the default, the graph starts with: the files
     * and the links between them. The app sets it, in answer to `dex-graph-expand`; the element never
     * changes it.
     */
    expanded: string[];
    /**
     * How the graph is laid out. 'tree', the default, is the prototype's: two columns of top-down
     * trees, what a file references side by side in the row under it. 'indented' draws each column
     * as a file tree, one box a row, what a file references in the rows under it a step to the right,
     * which draws a large set of files narrower and so at a larger scale: fifteen files that fit a
     * 1440 by 900 window's shell at 0.7 in trees fit it at 1.0 indented. A long indented column is
     * dealt into columns side by side for a fixed 900 by 600 canvas, not for the element's size. A
     * change fits the graph afresh, its boxes being elsewhere; what is open and selected stays. A
     * value it does not know is 'tree'. Attribute `layout`.
     */
    layout: GraphLayoutStyle;
    private _view;
    private _legendOpen;
    private _panning;
    private _opened;
    private _openedStack;
    private _stamp;
    private _selectedAt;
    private _hoverItem;
    private _hoverEdge;
    private _layout;
    private _rects;
    private _boxes;
    private _items;
    private _edges;
    private _boxLayouts;
    private _domIds;
    private _fittedTo;
    private _pending;
    private _wasOpen;
    private _press;
    private _resize;
    private _focusWhenDrawn;
    private readonly _focusMoved;
    private readonly _wheel;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    private _noteOpened;
    private _letGo;
    private get _openedNewer();
    private _relayout;
    private _graph;
    private _boxIds;
    private _canvas;
    private _size;
    private _applyPending;
    private _doPending;
    /**
     * Scales and moves the view so the whole graph shows, centred, at no more than its own size and
     * no less than 0.7 of it: a graph bigger than that shows from its top left, to pan from.
     * Called with a draw to come (just after `graph` or `expanded` was set), it fits what that draw
     * lays out; before the element has a size (not on the page yet, or hidden), once it has one.
     */
    fit(): void;
    /**
     * Gives the keyboard to the canvas, where the arrow keys go from box to box: at once, or, while
     * there is no graph to draw yet (`graph` null: an app still building it), once there is. Not if
     * the focus has gone anywhere in the page meanwhile, even if it is back on the body by then, nor
     * if the graph comes with nothing to draw: then the request is forgotten.
     */
    focus(options?: FocusOptions): void;
    protected updated(): void;
    private _forgetFocus;
    private _focusableCanvas;
    /**
     * Moves the view so the box or item `id` is at the middle of the canvas, at the scale it has; an
     * item of a closed box brings its box. Changes neither the selection nor which boxes are open:
     * an app revealing a row sets `selected` (and `expanded`) too, and may call this straight after,
     * since with a draw to come it reveals where that draw puts the row. An id the graph does not
     * hold moves nothing.
     */
    reveal(id: string): void;
    /**
     * Zooms the view onto the box or item `id` and what a selection of it lights (it, what its edges
     * reach, and their boxes), centred, at no more than their own size and no less than the least a
     * fit shrinks to; where they do not fit at that, the box or item itself is kept in view, its top
     * left first. For an app's "Show in Graph", which sets `selected` (and `expanded`) too and may call
     * this straight after: with a draw to come, it zooms onto where that draw puts them. Changes
     * neither the selection nor which boxes are open; an id the graph does not hold moves nothing.
     */
    zoomToReach(id: string): void;
    private _fitNow;
    private _zoomNow;
    private _revealNow;
    private _bounded;
    private _zoomAt;
    private _zoomBy;
    private _onWheel;
    private _onPointerDown;
    private _onPointerMove;
    private _onPointerUp;
    private _clear;
    private _onDblClick;
    private _onPointerOver;
    private _onPointerLeave;
    private _endPress;
    private _select;
    private _open;
    private _send;
    private _expanded;
    private _isOpen;
    private _toggle;
    private _reaches;
    private _reachFrom;
    private _lit;
    /**
     * What `id` lights: it, what its edges (of `kinds`, every kind for null) reach and those things'
     * boxes. Null for an id the graph does not hold.
     */
    private _reachNow;
    private _onKeydown;
    private _step;
    private _choose;
    private _status;
    private _openedStatus;
    private _onTop;
    private _dim;
    private _paint;
    private _renderUnder;
    private _renderOver;
    private _stub;
    private _markers;
    private _renderBox;
    private _renderLegend;
    private _renderWorld;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-relationship-graph>`, or under `tag`, and the `<dex-icon>` its boxes draw. */
export declare function defineRelationshipGraph(tag?: string): void;
/**
 * The events `<dex-relationship-graph>` sends, by name. They bubble and are composed, so they reach
 * the document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface RelationshipGraphEventMap {
    /**
     * A box or an item was clicked, or chosen with an arrow key, and is now `selected`; or the
     * background was clicked and nothing is (`id` null). Sent again each time one is chosen.
     */
    'dex-graph-selected': CustomEvent<GraphSelectedDetail>;
    /**
     * Open this file, at this row: a box or an item was double-clicked, or Enter pressed on it. For a
     * ghost, `uri` is empty and `ref` names the file to look for. A request.
     */
    'dex-graph-open': CustomEvent<GraphOpenDetail>;
    /**
     * Show or hide this box's items: its − or + was pressed, or Space on it. A request: set `expanded`
     * to include the box, or to leave it out. The graph changes nothing itself.
     */
    'dex-graph-expand': CustomEvent<GraphExpandDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-relationship-graph': DexRelationshipGraph;
    }
    interface HTMLElementEventMap extends RelationshipGraphEventMap {
    }
    interface DocumentEventMap extends RelationshipGraphEventMap {
    }
    interface WindowEventMap extends RelationshipGraphEventMap {
    }
}
