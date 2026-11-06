// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, svg, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { guard } from 'lit/directives/guard.js';
import { defineElement } from '../../shared/define.js';
import { defineIcon } from '../../shared/dex-icon.js';
import { buttonFocusRingStyles } from '../../shared/focus.styles.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import { styleProps } from '../../shared/styleProps.js';
import { relationshipGraphStyles } from './relationship-graph.styles.js';
import {
  BOX_ICONS,
  type GraphBox,
  type GraphBoxKind,
  type GraphEdge,
  type GraphEdgeKind,
  type GraphItem,
  type RelationshipGraph,
} from '../../../model/graph/graphTypes.js';
import {
  layoutGraph,
  type BoxLayout,
  type EdgeLayout,
  type GraphLayout,
  type GraphLayoutStyle,
  type GraphPoint,
  type GraphRect,
} from '../../../model/graph/layout.js';

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

// The view's bounds, and how far each step moves it: the prototype's numbers.
const MIN_SCALE = 0.3;
// The least a fit, or a zoom onto a reach, shrinks to: a box's 11px label is near 8px there, an
// item's 10px name 7px. A graph bigger than the canvas at this scale shows its top left, and the
// user pans to the rest. At 0.6, the first floor, a label was 6.6px and did not read in the shell
// at 1440 by 900.
const FIT_MIN_SCALE = 0.7;
const MAX_SCALE = 3;
const BUTTON_STEP = 0.2;
// The wheel zooms by a factor of how far it scrolled, e^(-rate * pixels): a wheel's notch of about
// 100 pixels is the prototype's step, and a trackpad's stream of small deltas zooms as smoothly. A wheel that
// counts in lines is taken at 16 pixels a line.
const WHEEL_RATE = 0.0015;
const LINE_PIXELS = 16;
// A press that moves less than this is a click, not a drag.
const DRAG_SLOP = 3;
// A box's border, which the items inside it are placed within.
const BORDER = 2;
// The room left around what a zoom onto a reach shows: the layout's own margin around the graph.
const REACH_MARGIN = 40;
// The corner radius a route's turns are drawn with.
const CORNER = 8;

// The Legend's lines: each colour an edge is drawn in from what core extracts, and what it says. A
// dictionary reference and a data link to a dictionary are near one colour (one in high contrast):
// where they run tells them apart, a reference between dictionaries, a link across the gap.
const LEGEND_LINES: readonly (readonly [string, string])[] = [
  ['model-ref', 'Model Reference'],
  ['sldd-ref', 'Dictionary Reference'],
  ['data-link to-sldd', 'Data Link to Dictionary'],
  ['data-link to-mat', 'Data Link to MAT-File'],
  ['param-usage', 'Parameter Usage'],
  ['ws-usage', 'Workspace Usage'],
];
const BOX_LABELS: Readonly<Record<GraphBoxKind, string>> = { model: 'Model', sldd: 'Dictionary', mat: 'MAT-File' };
// The edges that join two items, whose ends are inside boxes.
const USAGE: ReadonlySet<GraphEdgeKind> = new Set(['param-usage', 'ws-usage']);
// What a box opened reaches along: everything but a model reference. A box is opened to see the
// data its blocks read (or, a data file, the blocks that read it), as the prototype's expand lit
// the files a model links and no other model.
const OPENED: ReadonlySet<GraphEdgeKind> = new Set(['sldd-ref', 'data-link', 'param-usage', 'ws-usage']);

/**
 * The colour an edge is drawn in, as the classes its path and markers carry: its kind's, and a data
 * link's the kind of file it links (a dictionary's green, a MAT-file's sand), as the prototype
 * coloured them. A data link to anything else (no extraction of core's names one) keeps its kind's.
 */
type Paint = GraphEdgeKind | 'data-link to-sldd' | 'data-link to-mat';
const PAINTS: readonly Paint[] = ['model-ref', 'sldd-ref', 'data-link', 'data-link to-sldd', 'data-link to-mat', 'param-usage', 'ws-usage'];
const markerOf = (paint: Paint): string => paint.replace(' ', '-');

/** The view: where the canvas's origin is drawn, and at what scale. */
interface View {
  x: number;
  y: number;
  scale: number;
}

/** What a selection reaches, and so lights: everything else is dimmed. */
interface Reach {
  boxes: Set<string>;
  items: Set<string>;
  edges: Set<string>;
}

/** A view to move to once the canvas has a size: the whole graph, one thing at the middle, or a reach. */
type Pending = 'fit' | { reveal: string } | { zoom: string; opened?: boolean };

/** Names for a screen reader: five of them, then how many more. */
function named(names: readonly string[]): string {
  return names.length > 5 ? `${names.slice(0, 5).join(', ')} and ${names.length - 5} more` : names.join(', ');
}

/** A route as SVG path data, its turns rounded as the prototype's curves rounded them. */
function pathOf(points: readonly GraphPoint[]): string {
  const n = (v: number): string => String(Math.round(v * 100) / 100);
  let d = `M${n(points[0]!.x)},${n(points[0]!.y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [a, b, c] = [points[i - 1]!, points[i]!, points[i + 1]!];
    const into = Math.hypot(b.x - a.x, b.y - a.y);
    const out = Math.hypot(c.x - b.x, c.y - b.y);
    const r = Math.min(CORNER, into / 2, out / 2);
    const p = { x: b.x - ((b.x - a.x) / into) * r, y: b.y - ((b.y - a.y) / into) * r };
    const q = { x: b.x + ((c.x - b.x) / out) * r, y: b.y + ((c.y - b.y) / out) * r };
    d += ` L${n(p.x)},${n(p.y)} Q${n(b.x)},${n(b.y)} ${n(q.x)},${n(q.y)}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${n(last.x)},${n(last.y)}`;
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
export class DexRelationshipGraph extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, relationshipGraphStyles];

  /**
   * The graph to draw, from `buildRelationshipGraph`. Null, the default, or one with no boxes,
   * draws a note saying what to open. A new graph whose boxes are other than the last one's is
   * fitted to the canvas; one with the same boxes (rebuilt after an edit) keeps the view.
   */
  @property({ attribute: false }) graph: RelationshipGraph | null = null;
  /**
   * The id of the box or item to select: a box's id (a file's uri, for a file given) or an item's,
   * as `graphIdOf` gives it. It is lit with what its edges reach, and the rest is dimmed. Null, the
   * default, selects nothing. A click changes it and sends `dex-graph-selected`; setting it sends
   * nothing. Attribute `selected`.
   */
  @property({ type: String }) selected: string | null = null;
  /**
   * The ids of the boxes that are open. An open box shows all its items, and each other box the
   * items of its own an open box's edges reach: a model open shows its blocks and, in each data file
   * they read, only the variables they read. None, the default, the graph starts with: the files
   * and the links between them. The app sets it, in answer to `dex-graph-expand`; the element never
   * changes it.
   */
  @property({ attribute: false }) expanded: string[] = [];
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
  @property({ type: String }) layout: GraphLayoutStyle = 'tree';

  @state() private _view: View = { x: 0, y: 0, scale: 1 };
  @state() private _legendOpen = false;
  @state() private _panning = false;
  // The box the user opened last and has not closed, whose reach is lit until Escape or a click on
  // the background: over the selection when it was opened after the selection was made
  // (_openedNewer), else while nothing is selected.
  @state() private _opened: string | null = null;
  @state() private _openedNewer = false;
  // Every box the user opened, oldest first, while it stays open and in the graph: closing the last
  // gives the lighting back to the one before. Emptied by Escape and a click on the background.
  private _openedStack: string[] = [];
  // The item under the pointer, whose connections are lit while it is there, over any selection.
  // Each enter and leave draws the world again (24 ms and 13 ms on a 230-box graph, every box
  // open); a requestAnimationFrame throttle of _hoverItem is the next step if that grows.
  @state() private _hoverItem: string | null = null;
  // Whether an edge is under the pointer: the others fade (the stylesheet's :hover picks it out).
  @state() private _hoverEdge = false;

  // Derived from `graph` and `expanded` before each draw that changed them.
  private _layout: GraphLayout | null = null;
  private _rects = new Map<string, GraphRect>();
  private _boxes = new Map<string, GraphBox>();
  private _items = new Map<string, GraphItem>();
  private _edges = new Map<string, GraphEdge>();
  private _boxLayouts = new Map<string, BoxLayout>();
  // The element id each box and item is drawn with, for aria-activedescendant.
  private _domIds = new Map<string, string>();
  // The boxes the view was last fitted to, so a rebuilt graph of the same files keeps the view.
  private _fittedTo = '';
  // A fit, a reveal or a zoom asked for before the canvas had a size, done when it has one.
  private _pending: Pending | null = null;
  // The boxes open at the last draw: one open now and not then was opened.
  private _wasOpen = new Set<string>();
  // A press on the background, until it is let go: a drag pans, a click clears the selection.
  private _press: { x: number; y: number; view: View; moved: boolean } | null = null;
  private _resize: ResizeObserver | null = null;
  // An object, so its `passive: false` reaches addEventListener: a wheel that zooms must be able to
  // stop the page from scrolling.
  private readonly _wheel = { handleEvent: (e: WheelEvent) => this._onWheel(e), passive: false };

  override connectedCallback(): void {
    super.connectedCallback();
    // Where there is no ResizeObserver (a test's DOM), a pending fit waits for the next draw that
    // finds a size; a page has one, and the element getting its first size is what this waits for.
    // The host and not the canvas, which is drawn anew when the graph empties or fills: the canvas
    // covers the host exactly.
    if (typeof ResizeObserver !== 'undefined') {
      this._resize = new ResizeObserver(() => this._applyPending());
      this._resize.observe(this);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    this._resize = null;
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    // Whether boxes were drawn before this, of these files: only then is a box newly open one the
    // user opened, rather than one the graph came with.
    let watch = this._layout !== null;
    if (changed.has('graph') || changed.has('expanded') || changed.has('layout')) this._relayout();
    // Another layout, after the first draw: every box is elsewhere, so the view is fitted afresh
    // (over a fit still waiting, and not over a reveal or a zoom the app asked for with it).
    if (changed.has('layout') && changed.get('layout') !== undefined && (this._pending === null || this._pending === 'fit')) {
      this._pending = 'fit';
    }
    if (changed.has('graph')) {
      const boxes = this._boxIds();
      // A reveal the app asked for with the new graph wins over the fit the new graph would get.
      if (boxes !== this._fittedTo && boxes !== '[]') {
        this._fittedTo = boxes;
        this._pending ??= 'fit';
        watch = false;
      }
    }
    // A box opened with a change of the selection is the app's doing (a Show in Graph sets both), not
    // the user's: it is not taken as opened. A change of the selection on its own is newer than the
    // box opened before it, and lights over it.
    const selection = changed.has('selected');
    if (selection) this._openedNewer = false;
    if (changed.has('graph') || changed.has('expanded')) this._noteOpened(watch && !selection);
    // A size known before the draw (the canvas is drawn already): the fit is done in this update.
    if (this._pending && this._size().width > 0) this._doPending();
  }

  // The box opened since the last draw, if one was: it is what is lit, newer than the selection,
  // and the view moves onto it and what it reaches, unless the app asked for a view of its own with
  // the change. One that closes, or leaves the graph, is let go, and the one opened before it is
  // lit again.
  private _noteOpened(watch: boolean): void {
    const open = new Set([...this._expanded()].filter((id) => this._boxes.has(id)));
    const opened = watch ? [...open].filter((id) => !this._wasOpen.has(id)) : [];
    this._wasOpen = open;
    this._openedStack = [...this._openedStack.filter((id) => open.has(id) && !opened.includes(id)), ...opened];
    this._opened = this._openedStack[this._openedStack.length - 1] ?? null;
    if (opened.length > 0) {
      this._openedNewer = true;
      // Over a fit still waiting for a size, which would show the graph as it was before.
      if (this._pending === null || this._pending === 'fit') this._pending = { zoom: this._opened!, opened: true };
    }
  }

  // No box's reach lit: every box the user opened let go.
  private _letGo(): void {
    this._openedStack = [];
    this._opened = null;
    this._openedNewer = false;
  }

  private _relayout(): void {
    this._reaches = new Map();
    const graph = this._graph();
    this._boxes = new Map(graph.boxes.map((b) => [b.id, b]));
    this._items = new Map(graph.boxes.flatMap((b) => b.items.map((i) => [i.id, i] as const)));
    this._edges = new Map(graph.edges.map((e) => [e.id, e]));
    if (graph.boxes.length === 0) {
      this._layout = null;
      this._rects = new Map();
      this._boxLayouts = new Map();
      this._domIds = new Map();
      return;
    }
    this._layout = layoutGraph(graph, this._expanded(), this.layout === 'indented' ? 'indented' : 'tree');
    this._boxLayouts = new Map(this._layout.boxes.map((b) => [b.id, b]));
    this._rects = new Map<string, GraphRect>();
    this._domIds = new Map();
    this._layout.boxes.forEach((b, i) => {
      this._rects.set(b.id, b);
      this._domIds.set(b.id, `box-${i}`);
      b.items.forEach((item, j) => {
        this._rects.set(item.id, item);
        this._domIds.set(item.id, `item-${i}-${j}`);
      });
    });
  }

  private _graph(): RelationshipGraph {
    const g = this.graph;
    return g && Array.isArray(g.boxes) && Array.isArray(g.edges) ? g : { boxes: [], edges: [] };
  }

  private _boxIds(): string {
    return JSON.stringify(this._graph().boxes.map((b) => b.id));
  }

  private _canvas(): HTMLElement | null {
    return this.renderRoot?.querySelector<HTMLElement>('.canvas') ?? null;
  }

  private _size(): { width: number; height: number } {
    const canvas = this._canvas();
    return { width: canvas?.clientWidth ?? 0, height: canvas?.clientHeight ?? 0 };
  }

  private _applyPending(): void {
    if (this._pending && this._size().width > 0) this._doPending();
  }

  private _doPending(): void {
    const pending = this._pending;
    this._pending = null;
    if (pending === 'fit') this._fitNow();
    else if (pending && 'reveal' in pending) this._revealNow(pending.reveal);
    else if (pending) this._zoomNow(pending.zoom, pending.opened ? OPENED : null);
  }

  /**
   * Scales and moves the view so the whole graph shows, centred, at no more than its own size and
   * no less than 0.7 of it: a graph bigger than that shows from its top left, to pan from.
   * Called with a draw to come (just after `graph` or `expanded` was set), it fits what that draw
   * lays out; before the element has a size (not on the page yet, or hidden), once it has one.
   */
  fit(): void {
    if (this.isUpdatePending) this._pending = 'fit';
    else this._fitNow();
  }

  /**
   * Moves the view so the box or item `id` is at the middle of the canvas, at the scale it has; an
   * item of a closed box brings its box. Changes neither the selection nor which boxes are open:
   * an app revealing a row sets `selected` (and `expanded`) too, and may call this straight after,
   * since with a draw to come it reveals where that draw puts the row. An id the graph does not
   * hold moves nothing.
   */
  reveal(id: string): void {
    if (this.isUpdatePending) this._pending = { reveal: id };
    else this._revealNow(id);
  }

  /**
   * Zooms the view onto the box or item `id` and what a selection of it lights (it, what its edges
   * reach, and their boxes), centred, at no more than their own size and no less than the least a
   * fit shrinks to; where they do not fit at that, the box or item itself is kept in view, its top
   * left first. For an app's "Show in Graph", which sets `selected` (and `expanded`) too and may call
   * this straight after: with a draw to come, it zooms onto where that draw puts them. Changes
   * neither the selection nor which boxes are open; an id the graph does not hold moves nothing.
   */
  zoomToReach(id: string): void {
    if (this.isUpdatePending) this._pending = { zoom: id };
    else this._zoomNow(id, null);
  }

  private _fitNow(): void {
    const { width, height } = this._size();
    const layout = this._layout;
    if (!layout) return;
    if (width === 0 || height === 0) {
      this._pending = 'fit';
      return;
    }
    // Done, so what was waiting for a size (the first fit of this graph) is not done over it.
    this._pending = null;
    // The layout's own margin is the room left around it.
    const scale = Math.max(FIT_MIN_SCALE, Math.min(width / layout.width, height / layout.height, 1));
    // Centred along each side the graph fits, and from its start along a side it does not.
    const along = (room: number, size: number): number => Math.max(0, (room - size * scale) / 2);
    this._view = { x: along(width, layout.width), y: along(height, layout.height), scale };
  }

  // The view onto `id` and its reach along `kinds` (every kind for null).
  private _zoomNow(id: string, kinds: ReadonlySet<GraphEdgeKind> | null): void {
    const own = this._rects.get(id) ?? this._rects.get(this._items.get(id)?.boxId ?? '');
    const reach = this._reachFrom(id, kinds);
    if (!own || !reach) return;
    const { width, height } = this._size();
    if (width === 0 || height === 0) {
      this._pending = kinds ? { zoom: id, opened: true } : { zoom: id };
      return;
    }
    this._pending = null;
    // The boxes it lights, each drawn whole; an item's own box among them.
    const rects = [...reach.boxes].flatMap((b) => this._rects.get(b) ?? []);
    const left = Math.min(...rects.map((r) => r.x)) - REACH_MARGIN;
    const top = Math.min(...rects.map((r) => r.y)) - REACH_MARGIN;
    const right = Math.max(...rects.map((r) => r.x + r.width)) + REACH_MARGIN;
    const bottom = Math.max(...rects.map((r) => r.y + r.height)) + REACH_MARGIN;
    const scale = Math.max(FIT_MIN_SCALE, Math.min(width / (right - left), height / (bottom - top), 1));
    let x = width / 2 - ((left + right) / 2) * scale;
    let y = height / 2 - ((top + bottom) / 2) * scale;
    // Too big to show whole at the least scale: the thing itself in view, its top left winning.
    const at = (v: number, start: number, size: number, room: number): number => {
      const end = v + (start + size) * scale;
      if (end > room) v -= end - room;
      const begin = v + start * scale;
      return begin < 0 ? v - begin : v;
    };
    x = at(x, own.x, own.width, width);
    y = at(y, own.y, own.height, height);
    this._view = { x, y, scale };
  }

  private _revealNow(id: string): void {
    const rect = this._rects.get(id) ?? this._rects.get(this._items.get(id)?.boxId ?? '');
    if (!rect) return;
    const { width, height } = this._size();
    if (width === 0 || height === 0) {
      this._pending = { reveal: id };
      return;
    }
    this._pending = null;
    const { scale } = this._view;
    this._view = { scale, x: width / 2 - (rect.x + rect.width / 2) * scale, y: height / 2 - (rect.y + rect.height / 2) * scale };
  }

  // --- The view -----------------------------------------------------------------------------

  // A scale within the bounds, unless the view is already beyond one (a fit of a large graph is
  // below the least): then a step only goes back toward them.
  private _bounded(next: number): number {
    const now = this._view.scale;
    return Math.max(Math.min(MIN_SCALE, now), Math.min(Math.max(MAX_SCALE, now), next));
  }

  // Zoom about a point of the canvas, which stays where it is on screen.
  private _zoomAt(mx: number, my: number, next: number): void {
    const { x, y, scale } = this._view;
    const s = this._bounded(next);
    this._pending = null;
    this._view = { scale: s, x: mx - ((mx - x) * s) / scale, y: my - ((my - y) * s) / scale };
  }

  private _zoomBy(step: number): void {
    const { width, height } = this._size();
    this._zoomAt(width / 2, height / 2, this._view.scale + step);
  }

  private _onWheel(e: WheelEvent): void {
    // A scroll that is not up or down (a trackpad's sideways one) zooms nothing, so it is left to
    // the page.
    if (!this._layout || e.deltaY === 0) return;
    e.preventDefault();
    const pixels = e.deltaY * (e.deltaMode === 1 ? LINE_PIXELS : e.deltaMode === 2 ? this._size().height || 1 : 1);
    const box = this._canvas()!.getBoundingClientRect();
    this._zoomAt(e.clientX - box.left, e.clientY - box.top, this._view.scale * Math.exp(-pixels * WHEEL_RATE));
  }

  // A press on the background starts a pan; one on a box is the box's (its click), and the zoom
  // buttons and the legend are outside the canvas.
  private _onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 || !this._layout) return;
    const target = e.target as Element | null;
    if (target?.closest?.('.box')) return;
    this._press = { x: e.clientX, y: e.clientY, view: this._view, moved: false };
    try {
      this._canvas()?.setPointerCapture(e.pointerId);
    } catch {
      /* no pointer to capture (a synthetic event): the moves still come to the canvas */
    }
  }

  private _onPointerMove(e: PointerEvent): void {
    const press = this._press;
    if (!press) return;
    // The button is up and no release came (let go outside the window, say): the drag is over.
    if (!(e.buttons & 1)) {
      this._endPress();
      return;
    }
    const [dx, dy] = [e.clientX - press.x, e.clientY - press.y];
    if (!press.moved && Math.abs(dx) <= DRAG_SLOP && Math.abs(dy) <= DRAG_SLOP) return;
    press.moved = true;
    this._panning = true;
    this._pending = null;
    this._view = { ...press.view, x: press.view.x + dx, y: press.view.y + dy };
  }

  private _onPointerUp(): void {
    const press = this._press;
    this._press = null;
    this._panning = false;
    // A press let go where it was is a click on the background: it clears the selection, and lets
    // the box opened last go.
    if (press && !press.moved) this._clear();
  }

  // Nothing selected, and no box's reach lit. True when there was something to clear.
  private _clear(): boolean {
    const had = this.selected !== null || this._opened !== null;
    this._letGo();
    if (this.selected !== null) this._select(null);
    return had;
  }

  // A double-click on the background: every box asked closed, as the prototype's collapsed them
  // all, and the whole graph fitted. On a box it is the box's (it opens the file).
  private _onDblClick(e: MouseEvent): void {
    if ((e.target as Element | null)?.closest?.('.box') || !this._layout) return;
    this._letGo();
    for (const id of this._expanded()) {
      if (!this._boxes.has(id)) continue;
      const detail: GraphExpandDetail = { id, expanded: false };
      this.dispatchEvent(new CustomEvent<GraphExpandDetail>('dex-graph-expand', { detail, bubbles: true, composed: true }));
    }
    this.fit();
  }

  // What the pointer is over, while no drag is on: an item is traced, an edge fades the others.
  private _onPointerOver(e: PointerEvent): void {
    if (this._press) return;
    const target = e.target as Element | null;
    const item = target?.closest?.<HTMLElement>('.item');
    const id = item?.dataset.id ?? null;
    if (id !== this._hoverItem) this._hoverItem = id;
    const edge = !item && !!target?.closest?.('svg.under path.edge');
    if (edge !== this._hoverEdge) this._hoverEdge = edge;
  }

  private _onPointerLeave(): void {
    this._hoverItem = null;
    this._hoverEdge = false;
  }

  // A drag the pointer left without a release of its own (cancelled, or its capture taken away):
  // over, and no click.
  private _endPress(): void {
    this._press = null;
    this._panning = false;
  }

  // --- Choosing -----------------------------------------------------------------------------

  private _select(id: string | null): void {
    this.selected = id;
    this.dispatchEvent(new CustomEvent<GraphSelectedDetail>('dex-graph-selected', { detail: { id }, bubbles: true, composed: true }));
  }

  private _open(id: string): void {
    const item = this._items.get(id);
    const box = this._boxes.get(item ? item.boxId : id);
    if (!box) return;
    // A ghost is no file the app has, so it is asked for by its reference, which the app may find
    // (in the folder, say) or not; one with no reference to give asks for nothing.
    if (box.ghost || !box.uri) {
      if (box.ref) this._send({ uri: '', ref: box.ref });
      return;
    }
    this._send(item ? { uri: box.uri, name: item.revealName } : { uri: box.uri });
  }

  private _send(detail: GraphOpenDetail): void {
    this.dispatchEvent(new CustomEvent<GraphOpenDetail>('dex-graph-open', { detail, bubbles: true, composed: true }));
  }

  private _expanded(): Set<string> {
    return new Set(Array.isArray(this.expanded) ? this.expanded : []);
  }

  // Open, as `expanded` says: a box showing what an open box reaches is not open, and its + opens it.
  private _isOpen(id: string): boolean {
    return this._expanded().has(id);
  }

  private _toggle(id: string): void {
    const box = this._boxes.get(id);
    if (!box || box.items.length === 0) return;
    const detail: GraphExpandDetail = { id, expanded: !this._isOpen(id) };
    this.dispatchEvent(new CustomEvent<GraphExpandDetail>('dex-graph-expand', { detail, bubbles: true, composed: true }));
  }

  // Each reach asked for since the last layout, so a draw that only moves the view, or a pointer
  // going back and forth over one item, does not walk the edges again; and the same Reach each
  // time, which the world's guard compares.
  private _reaches = new Map<string, Reach | null>();

  private _reachFrom(id: string | null, kinds: ReadonlySet<GraphEdgeKind> | null): Reach | null {
    if (!id) return null;
    const key = `${kinds ? 'opened' : 'all'}:${id}`;
    if (!this._reaches.has(key)) this._reaches.set(key, this._reachNow(id, kinds));
    return this._reaches.get(key)!;
  }

  // What is lit now: the item under the pointer; else the box opened last when it is newer than the
  // selection; else the selection, and with none the box opened last.
  private _lit(): Reach | null {
    const hover = this._reachFrom(this._hoverItem, null);
    if (hover) return hover;
    const opened = this._reachFrom(this._opened, OPENED);
    const selection = this._reachFrom(this.selected, null);
    return this._openedNewer ? (opened ?? selection) : (selection ?? opened);
  }

  /**
   * What `id` lights: it, what its edges (of `kinds`, every kind for null) reach and those things'
   * boxes. Null for an id the graph does not hold.
   */
  private _reachNow(id: string, kinds: ReadonlySet<GraphEdgeKind> | null): Reach | null {
    const box = this._boxes.get(id);
    const item = this._items.get(id);
    if (!box && !item) return null;
    const reach: Reach = { boxes: new Set(), items: new Set(), edges: new Set() };
    // The things whose edges count: a box and all its items, or an item alone. Edges are read off
    // the graph, not the layout, so a closed box still lights what its variables are read by.
    const ends = new Set<string>();
    if (box) {
      reach.boxes.add(box.id);
      ends.add(box.id);
      for (const i of box.items) {
        reach.items.add(i.id);
        ends.add(i.id);
      }
    } else {
      reach.items.add(item!.id);
      reach.boxes.add(item!.boxId);
      ends.add(item!.id);
    }
    const add = (other: string): void => {
      const reached = this._items.get(other);
      if (reached) {
        reach.items.add(reached.id);
        reach.boxes.add(reached.boxId);
      } else reach.boxes.add(other);
    };
    for (const e of this._graph().edges) {
      if (kinds && !kinds.has(e.kind)) continue;
      if (ends.has(e.from)) add(e.to);
      else if (ends.has(e.to)) add(e.from);
      else continue;
      reach.edges.add(e.id);
    }
    return reach;
  }

  // --- The keyboard -------------------------------------------------------------------------

  private _onKeydown(e: KeyboardEvent): void {
    // A chord is the app's, never a move in the graph; a key on a button inside it (a box's toggle,
    // focused by a click) is the button's, which Space and Enter press, but for Escape, which a
    // button has no use for and which ends the dimming of the box just opened by that click.
    if (e.altKey || e.ctrlKey || e.metaKey || !this._layout) return;
    if (e.key !== 'Escape' && (e.target as Element | null)?.closest?.('button')) return;
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight':
        this._step(e.key);
        break;
      case 'Enter':
        if (this.selected) this._open(this.selected);
        break;
      case ' ': {
        const id = this.selected;
        const boxId = id ? (this._items.get(id)?.boxId ?? id) : null;
        if (boxId) this._toggle(boxId);
        break;
      }
      case '+':
      case '=':
        this._zoomBy(BUTTON_STEP);
        break;
      case '-':
      case '_':
        this._zoomBy(-BUTTON_STEP);
        break;
      case '0':
        this.fit();
        break;
      case 'Escape':
        // Nothing to clear: the key is the app's.
        if (!this._clear()) return;
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // The nearest box the arrow's way, from the selected box (or the box of the selected item); the
  // first box when nothing is selected. That way is wholly past the selected box's side, so in an
  // indented column of boxes of unlike widths Left and Right leave the column and Up and Down go
  // along it. Nearest by distance along the arrow, with distance across it counted double, so a box
  // in line wins over a nearer one off to the side.
  private _step(key: string): void {
    const boxes = this._layout!.boxes;
    const at = this.selected ? this._boxLayouts.get(this._items.get(this.selected)?.boxId ?? this.selected) : undefined;
    if (!at) {
      if (boxes[0]) this._choose(boxes[0].id);
      return;
    }
    const centre = (r: GraphRect): GraphPoint => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
    const from = centre(at);
    const [along, across] =
      key === 'ArrowRight' ? [(p: GraphPoint) => p.x - from.x, (p: GraphPoint) => p.y - from.y]
      : key === 'ArrowLeft' ? [(p: GraphPoint) => from.x - p.x, (p: GraphPoint) => p.y - from.y]
      : key === 'ArrowDown' ? [(p: GraphPoint) => p.y - from.y, (p: GraphPoint) => p.x - from.x]
      : [(p: GraphPoint) => from.y - p.y, (p: GraphPoint) => p.x - from.x];
    let best: BoxLayout | null = null;
    let bestScore = Infinity;
    const past = (b: GraphRect): boolean =>
      key === 'ArrowRight' ? b.x >= at.x + at.width
      : key === 'ArrowLeft' ? b.x + b.width <= at.x
      : key === 'ArrowDown' ? b.y >= at.y + at.height
      : b.y + b.height <= at.y;
    for (const b of boxes) {
      if (b.id === at.id || !past(b)) continue;
      const c = centre(b);
      const score = along(c) + 2 * Math.abs(across(c));
      if (score < bestScore) [best, bestScore] = [b, score];
    }
    if (best) this._choose(best.id);
  }

  // A selection the keyboard made: said, and brought into view if it is out of it.
  private _choose(id: string): void {
    this._select(id);
    const rect = this._rects.get(id);
    const { width, height } = this._size();
    if (!rect || width === 0) return;
    const { x, y, scale } = this._view;
    const [left, top] = [x + rect.x * scale, y + rect.y * scale];
    if (left < 0 || top < 0 || left + rect.width * scale > width || top + rect.height * scale > height) this._revealNow(id);
  }

  // --- Drawing ------------------------------------------------------------------------------

  // What a screen reader hears of what is lit: the selection, the thing and what its edges link it
  // to, which is what the dimming shows a sighted reader, five of them by name, then how many more;
  // or the box opened last and what it reaches, when that is what is lit. Never the item under the
  // pointer: a pointer crossing the graph would talk over everything.
  private _status(): string {
    if (this._openedNewer && this._opened) return this._openedStatus();
    const id = this.selected;
    const reach = this._reachFrom(id, null);
    if (!id || !reach) return this._openedStatus();
    const item = this._items.get(id);
    const box = this._boxes.get(item ? item.boxId : id);
    if (!box) return '';
    const itemName = (i: GraphItem) => `${i.name} in ${this._boxes.get(i.boxId)?.label ?? ''}`;
    const linked = item
      ? [...reach.items].filter((x) => x !== id).map((x) => itemName(this._items.get(x)!))
      : [...reach.boxes].filter((x) => x !== id).map((x) => this._boxes.get(x)?.label ?? '');
    const said = item ? `Selected ${itemName(item)}.` : `Selected ${box.label}, ${BOX_LABELS[box.kind] ?? box.kind}${box.ghost ? ', not open' : ''}.`;
    if (linked.length === 0) return said;
    return `${said} Linked to ${named(linked)}.`;
  }

  private _openedStatus(): string {
    const id = this._opened;
    const reach = this._reachFrom(id, OPENED);
    const box = id ? this._boxes.get(id) : undefined;
    if (!reach || !box) return '';
    const linked = [...reach.boxes].filter((x) => x !== id).map((x) => this._boxes.get(x)?.label ?? '');
    return linked.length === 0 ? `Showing ${box.label}.` : `Showing ${box.label} and what it reaches: ${named(linked)}.`;
  }

  // THE LAYERS. An edge between two boxes runs UNDER the boxes, so one that has to pass a box on
  // its way passes behind it, not through its items: with every item of a large graph shown, usages
  // drawn over the boxes struck through row after row of other boxes' items. Over the boxes go only
  // what joins a thing to its own box, and what the selection reaches:
  //
  //   - a usage's two ends, each from its item to its own box's border (a stub), with the dot, the
  //     arrowhead and the parameter's label, so it still visibly leaves its block and reaches its
  //     variable;
  //   - a workspace usage whole, which never leaves its model's box and under it would not show;
  //   - every edge the selection reaches, whole, so what it is joined to is drawn on top.
  private _onTop(edge: GraphEdge, reach: Reach | null): boolean {
    return edge.kind === 'ws-usage' || (reach !== null && reach.edges.has(edge.id));
  }

  private _dim(edge: GraphEdge, reach: Reach | null): string {
    return reach !== null && !reach.edges.has(edge.id) ? ' dim' : '';
  }

  private _paint(edge: GraphEdge): Paint {
    if (edge.kind !== 'data-link') return edge.kind;
    const kind = this._boxes.get(edge.to)?.kind;
    return kind === 'mat' ? 'data-link to-mat' : kind === 'sldd' ? 'data-link to-sldd' : 'data-link';
  }

  private _renderUnder(edges: readonly EdgeLayout[], reach: Reach | null) {
    return edges.map((e) => {
      const edge = this._edges.get(e.id);
      if (!edge || this._onTop(edge, reach)) return nothing;
      // A usage's dot and arrowhead are inside the boxes, so its stubs over them carry them.
      const ends = !USAGE.has(edge.kind);
      const paint = this._paint(edge);
      return svg`<path
        class="edge ${paint}${this._dim(edge, reach)}"
        d=${pathOf(e.points)}
        marker-start=${ends ? `url(#dex-graph-dot-${markerOf(paint)})` : nothing}
        marker-end=${ends ? `url(#dex-graph-arrow-${markerOf(paint)})` : nothing}
      ></path>`;
    });
  }

  private _renderOver(edges: readonly EdgeLayout[], reach: Reach | null) {
    return edges.map((e) => {
      const edge = this._edges.get(e.id);
      if (!edge) return nothing;
      const dim = this._dim(edge, reach);
      const start = e.points[0]!;
      // The parameter as a property of the block (`.Gain`), as the prototype wrote it.
      const label =
        edge.label && !dim ? svg`<text class="edge-label" x=${start.x + 4} y=${start.y - 3}>.${edge.label}</text>` : nothing;
      if (this._onTop(edge, reach)) {
        const paint = markerOf(this._paint(edge));
        return svg`<path
          class="edge ${this._paint(edge)}${dim}"
          d=${pathOf(e.points)}
          marker-start="url(#dex-graph-dot-${paint})"
          marker-end="url(#dex-graph-arrow-${paint})"
        ></path>${label}`;
      }
      if (!USAGE.has(edge.kind)) return nothing;
      const from = this._stub(e.points, 'start', edge.from);
      const to = this._stub(e.points, 'end', edge.to);
      return svg`
        ${from ? svg`<path class="stub ${edge.kind}${dim}" d=${pathOf(from)} marker-start="url(#dex-graph-dot-${edge.kind})"></path>` : nothing}
        ${to ? svg`<path class="stub ${edge.kind}${dim}" d=${pathOf(to)} marker-end="url(#dex-graph-arrow-${edge.kind})"></path>` : nothing}
        ${label}
      `;
    });
  }

  // The part of a route inside the box of the item at one of its ends: from the item to where the
  // route's first (or last) segment crosses that box's border, or the whole segment when it does
  // not leave the box. Null for an end that is no item.
  private _stub(points: readonly GraphPoint[], end: 'start' | 'end', id: string): GraphPoint[] | null {
    const box = this._rects.get(this._items.get(id)?.boxId ?? '');
    if (!box || points.length < 2) return null;
    const n = points.length;
    const [at, next] = end === 'start' ? [points[0]!, points[1]!] : [points[n - 1]!, points[n - 2]!];
    const x = next.x > at.x ? Math.min(next.x, box.x + box.width) : Math.max(next.x, box.x);
    const y = next.y > at.y ? Math.min(next.y, box.y + box.height) : Math.max(next.y, box.y);
    const border = { x: next.x === at.x ? at.x : x, y: next.y === at.y ? at.y : y };
    return end === 'start' ? [at, border] : [border, at];
  }

  // A dot where an edge leaves and an arrowhead where it arrives, one pair per colour an edge is
  // drawn in, filled with it by the same class rule as the edge.
  private _markers() {
    return svg`<defs>${PAINTS.map(
      (paint) => svg`
        <marker id="dex-graph-dot-${markerOf(paint)}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
          <circle class=${paint} cx="5" cy="5" r="4"></circle>
        </marker>
        <marker id="dex-graph-arrow-${markerOf(paint)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path class=${paint} d="M0,1 L9,5 L0,9 Z"></path>
        </marker>
      `,
    )}</defs>`;
  }

  private _renderBox(b: BoxLayout, reach: Reach | null) {
    const box = this._boxes.get(b.id)!;
    const open = this._isOpen(b.id) && box.items.length > 0;
    const classes = [
      'box',
      box.kind,
      box.ghost ? 'ghost' : '',
      open ? 'open' : '',
      // Not open, and showing the items an open box reaches.
      !open && b.items.length > 0 ? 'partial' : '',
      this.selected === b.id ? 'selected' : '',
      reach && !reach.boxes.has(b.id) ? 'dim' : '',
    ].filter(Boolean).join(' ');
    const kind = BOX_LABELS[box.kind] ?? box.kind;
    const count = box.items.length;
    const name = `${box.label}, ${kind}${box.ghost ? ', not open' : ''}${count ? `, ${count} item${count === 1 ? '' : 's'}` : ''}`;
    return html`
      <div
        class=${classes}
        id=${this._domIds.get(b.id)!}
        data-id=${b.id}
        role="group"
        aria-label=${name}
        title=${box.ghost ? `${box.label} (not open)` : box.label}
        ${styleProps({ left: `${b.x}px`, top: `${b.y}px`, width: `${b.width}px`, height: `${b.height}px` })}
        @click=${() => this._select(b.id)}
        @dblclick=${() => this._open(b.id)}
      >
        <div class="head">
          <dex-icon .iconId=${BOX_ICONS[box.kind] ?? ''} size="16"></dex-icon>
          <span class="label">${box.label}</span>
          ${count > 0
            ? html`<button
                class="toggle"
                tabindex="-1"
                aria-expanded=${String(open)}
                aria-label=${open ? `Hide the items of ${box.label}` : `Show the items of ${box.label}`}
                title=${open ? 'Hide items' : 'Show items'}
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this._toggle(b.id);
                }}
                @dblclick=${(e: Event) => e.stopPropagation()}
              >${open ? '−' : '+'}</button>`
            : nothing}
        </div>
        ${b.divider !== undefined
          ? html`<div class="divider" aria-hidden="true" ${styleProps({ top: `${b.divider - b.y - BORDER}px` })}><span>workspace</span></div>`
          : nothing}
        ${b.items.map((r) => {
          const item = this._items.get(r.id)!;
          const itemClasses = [
            'item',
            item.group === 'workspace' ? 'workspace' : '',
            this.selected === r.id ? 'selected' : '',
            reach && reach.boxes.has(b.id) && !reach.items.has(r.id) ? 'dim' : '',
          ].filter(Boolean).join(' ');
          return html`
            <div
              class=${itemClasses}
              id=${this._domIds.get(r.id)!}
              data-id=${r.id}
              role="group"
              aria-label=${item.name}
              title=${item.name}
              ${styleProps({
                left: `${r.x - b.x - BORDER}px`,
                top: `${r.y - b.y - BORDER}px`,
                width: `${r.width}px`,
                height: `${r.height}px`,
              })}
              @click=${(e: Event) => {
                e.stopPropagation();
                this._select(r.id);
              }}
              @dblclick=${(e: Event) => {
                e.stopPropagation();
                this._open(r.id);
              }}
            >
              <dex-icon .iconId=${item.iconId} size="14"></dex-icon>
              <span class="name">${item.name}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  private _renderLegend() {
    const open = this._legendOpen;
    return html`
      <div class="legend">
        <button
          class="legend-toggle"
          aria-expanded=${String(open)}
          aria-controls="legend"
          @click=${() => (this._legendOpen = !open)}
        >Legend</button>
        <ul class="legend-content" id="legend" ?hidden=${!open}>
          ${LEGEND_LINES.map(([paint, label]) => html`<li><span class="swatch line ${paint}"></span>${label}</li>`)}
          ${(['model', 'sldd', 'mat'] as const).map((kind) => html`<li><span class="swatch file ${kind}"></span>${BOX_LABELS[kind]}</li>`)}
          <li><span class="swatch file ghost"></span>Not Open</li>
        </ul>
      </div>
    `;
  }

  // The graph itself: the edges under the boxes, the boxes, and what goes over them. Drawn again
  // only when the layout or the selection changes (the guard in render): a pan or a zoom moves the
  // world's transform and nothing in it, so a drag over a large graph does not build every route's
  // path on every step.
  private _renderWorld(layout: GraphLayout, reach: Reach | null) {
    return html`
      <svg class="edges under" width=${layout.width} height=${layout.height} aria-hidden="true">
        ${this._markers()} ${this._renderUnder(layout.edges, reach)}
      </svg>
      ${layout.boxes.map((b) => this._renderBox(b, reach))}
      <svg class="edges over" width=${layout.width} height=${layout.height} aria-hidden="true">
        ${this._renderOver(layout.edges, reach)}
      </svg>
    `;
  }

  override render() {
    const layout = this._layout;
    if (!layout) {
      return html`
        <div class="canvas">
          <div class="empty">Open models, dictionaries or MAT-files to see how they connect.</div>
        </div>
      `;
    }
    const reach = this._lit();
    const { x, y, scale } = this._view;
    const active = this.selected ? this._domIds.get(this.selected) ?? this._domIds.get(this._items.get(this.selected)?.boxId ?? '') : undefined;
    return html`
      <div
        class="canvas ${this._panning ? 'panning' : ''}"
        tabindex="0"
        role="application"
        aria-roledescription="graph"
        aria-label="Relationship graph"
        aria-activedescendant=${active ?? nothing}
        @keydown=${this._onKeydown}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._endPress}
        @lostpointercapture=${this._endPress}
        @pointerover=${this._onPointerOver}
        @pointerleave=${this._onPointerLeave}
        @dblclick=${this._onDblClick}
        @wheel=${this._wheel}
      >
        <div
          class="world ${this._hoverEdge ? 'edge-hover' : ''}"
          ${styleProps({
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${x}px, ${y}px) scale(${scale})`,
          })}
        >
          ${guard([layout, this.selected, reach], () => this._renderWorld(layout, reach))}
        </div>
      </div>
      <div class="zoom" role="group" aria-label="Zoom">
        <button aria-label="Zoom in" title="Zoom in" @click=${() => this._zoomBy(BUTTON_STEP)}>+</button>
        <button aria-label="Zoom out" title="Zoom out" @click=${() => this._zoomBy(-BUTTON_STEP)}>−</button>
        <button aria-label="Fit to view" title="Fit to view" @click=${() => this.fit()}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M1 5V1h4M9 1h4v4M13 9v4H9M5 13H1V9" fill="none" stroke="currentColor" stroke-width="1.5"></path>
          </svg>
        </button>
      </div>
      ${this._renderLegend()}
      <div class="sr-only" role="status" aria-live="polite">${this._status()}</div>
    `;
  }
}

/** Registers the widget as `<dex-relationship-graph>`, or under `tag`, and the `<dex-icon>` its boxes draw. */
export function defineRelationshipGraph(tag = 'dex-relationship-graph'): void {
  defineIcon();
  defineElement(tag, DexRelationshipGraph);
}

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
  interface HTMLElementEventMap extends RelationshipGraphEventMap {}
  interface DocumentEventMap extends RelationshipGraphEventMap {}
  interface WindowEventMap extends RelationshipGraphEventMap {}
}
