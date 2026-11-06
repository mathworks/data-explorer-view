// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, svg, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
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
} from '../../../model/graph/relationshipGraph.js';
import {
  layoutGraph,
  type BoxLayout,
  type EdgeLayout,
  type GraphLayout,
  type GraphPoint,
  type GraphRect,
} from '../../../model/graph/layout.js';

/** What `dex-graph-selected` carries: the box or item now selected, or null for none. */
export interface GraphSelectedDetail {
  /** A box's id (a file's uri, for a file given) or an item's; null when the selection was cleared. */
  id: string | null;
}

/** What `dex-graph-open` carries: the file to open, and the row in it to reveal. */
export interface GraphOpenDetail {
  /** The file's uri. */
  uri: string;
  /** For an item, the name its file's table selects it by (`GraphItem.revealName`); absent for a box. */
  name?: string;
}

/** What `dex-graph-expand` carries: the box whose items to show or hide. */
export interface GraphExpandDetail {
  /** The box. */
  id: string;
  /** True to show its items, false to hide them. */
  expanded: boolean;
}

// The view's bounds, and how far each step moves it: ts's numbers.
const MIN_SCALE = 0.3;
const MAX_SCALE = 3;
const BUTTON_STEP = 0.2;
const WHEEL_STEP = 0.1;
// A press that moves less than this is a click, not a drag.
const DRAG_SLOP = 3;
// A box's border, which the items inside it are placed within.
const BORDER = 2;
// The corner radius a route's turns are drawn with.
const CORNER = 8;

const EDGE_KINDS: readonly GraphEdgeKind[] = ['model-ref', 'sldd-ref', 'data-link', 'param-usage', 'ws-usage'];
const EDGE_LABELS: Readonly<Record<GraphEdgeKind, string>> = {
  'model-ref': 'Model Reference',
  'sldd-ref': 'Dictionary Reference',
  'data-link': 'Data Link',
  'param-usage': 'Parameter Usage',
  'ws-usage': 'Workspace Usage',
};
const BOX_LABELS: Readonly<Record<GraphBoxKind, string>> = { model: 'Model', sldd: 'Dictionary', mat: 'MAT-File' };
// A usage is drawn over the boxes, since it joins items inside them; a reference and a data link
// under them, since they join boxes and would otherwise cross the boxes beside them.
const OVER: ReadonlySet<GraphEdgeKind> = new Set(['param-usage', 'ws-usage']);

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

/** A route as SVG path data, its turns rounded as ts's quadratic curves rounded them. */
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
 * How the open models, dictionaries and MAT-files connect, as the prototype's relationship graph
 * draws it: the models on the left as a tree of their references, the data files on the right,
 * each a box of its kind's colour, a file referenced and not open dashed, and the edges between
 * them. An open box lists the blocks and variables that take part, a model's workspace variables
 * under a divider, with an edge from each block to each variable it reads, labelled with the
 * block parameter. The graph comes from `buildRelationshipGraph`; where it is drawn, from
 * `layoutGraph`.
 *
 * A click on a box or an item selects it (`dex-graph-selected`), and lights it and what its edges
 * reach, dimming the rest; a click on the background clears it. A double-click asks to open the
 * file (`dex-graph-open`), at the item's row for an item. A box's − or + asks to hide or show its
 * items (`dex-graph-expand`); the app answers by setting `expanded`. The wheel, the + and − buttons
 * and a drag of the background zoom and pan; the fit button and fit() show the whole graph, and
 * reveal() brings one box or item to the middle. A Legend, closed at first, names the kinds.
 *
 * The keyboard: the canvas is one stop of the tab order; the arrows move the selection to the
 * nearest box that way, Enter opens the selected box or item, Space shows or hides the selected
 * box's items, + and − zoom and 0 fits.
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
   * The ids of the boxes whose items show. Null, the default, shows every box's that has any. The
   * app sets it, in answer to `dex-graph-expand`; the element never changes it.
   */
  @property({ attribute: false }) expanded: string[] | null = null;

  @state() private _view: View = { x: 0, y: 0, scale: 1 };
  @state() private _legendOpen = false;
  @state() private _panning = false;

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
  // A fit or a reveal asked for before the canvas had a size, done when it has one.
  private _pending: { reveal: string } | 'fit' | null = null;
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
    if (changed.has('graph') || changed.has('expanded')) this._relayout();
    if (changed.has('graph')) {
      const boxes = this._boxIds();
      // A reveal the app asked for with the new graph wins over the fit the new graph would get.
      if (boxes !== this._fittedTo && boxes !== '[]') {
        this._fittedTo = boxes;
        this._pending ??= 'fit';
      }
    }
    // A size known before the draw (the canvas is drawn already): the fit is done in this update.
    if (this._pending && this._size().width > 0) this._doPending();
  }

  private _relayout(): void {
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
    const open = Array.isArray(this.expanded) ? this.expanded : graph.boxes.filter((b) => b.items.length > 0).map((b) => b.id);
    this._layout = layoutGraph(graph, new Set(open));
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
    else if (pending) this._revealNow(pending.reveal);
  }

  /**
   * Scales and moves the view so the whole graph shows, centred, at no more than its own size.
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
    const scale = Math.min(width / layout.width, height / layout.height, 1) * 0.9;
    this._view = { x: (width - layout.width * scale) / 2, y: (height - layout.height * scale) / 2, scale };
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
    if (!this._layout) return;
    e.preventDefault();
    const box = this._canvas()!.getBoundingClientRect();
    this._zoomAt(e.clientX - box.left, e.clientY - box.top, this._view.scale + (e.deltaY > 0 ? -WHEEL_STEP : WHEEL_STEP));
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
    // A press let go where it was is a click on the background: it clears the selection.
    if (press && !press.moved && this.selected !== null) this._select(null);
  }

  private _onPointerCancel(): void {
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
    // A ghost is no file the app has: there is nothing to open.
    if (!box || box.ghost || !box.uri) return;
    const detail: GraphOpenDetail = item ? { uri: box.uri, name: item.revealName } : { uri: box.uri };
    this.dispatchEvent(new CustomEvent<GraphOpenDetail>('dex-graph-open', { detail, bubbles: true, composed: true }));
  }

  private _isOpen(id: string): boolean {
    return (this._boxLayouts.get(id)?.items.length ?? 0) > 0;
  }

  private _toggle(id: string): void {
    const box = this._boxes.get(id);
    if (!box || box.items.length === 0) return;
    const detail: GraphExpandDetail = { id, expanded: !this._isOpen(id) };
    this.dispatchEvent(new CustomEvent<GraphExpandDetail>('dex-graph-expand', { detail, bubbles: true, composed: true }));
  }

  /** What the selection lights: it, what its edges reach and those things' boxes. Null for none. */
  private _reach(): Reach | null {
    const id = this.selected;
    if (!id) return null;
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
      if (ends.has(e.from)) add(e.to);
      else if (ends.has(e.to)) add(e.from);
      else continue;
      reach.edges.add(e.id);
    }
    return reach;
  }

  // --- The keyboard -------------------------------------------------------------------------

  private _onKeydown(e: KeyboardEvent): void {
    // A chord is the app's, never a move in the graph.
    if (e.altKey || e.ctrlKey || e.metaKey || !this._layout) return;
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
      default:
        return;
    }
    e.preventDefault();
  }

  // The nearest box the arrow's way, from the selected box (or the box of the selected item); the
  // first box when nothing is selected. Nearest by distance along the arrow, with distance across
  // it counted double, so a box in line wins over a nearer one off to the side.
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
    for (const b of boxes) {
      if (b.id === at.id) continue;
      const c = centre(b);
      if (along(c) <= 1) continue;
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

  private _status(): string {
    const id = this.selected;
    if (!id) return '';
    const item = this._items.get(id);
    if (item) return `Selected ${item.name} in ${this._boxes.get(item.boxId)?.label ?? ''}`;
    const box = this._boxes.get(id);
    return box ? `Selected ${box.label}, ${BOX_LABELS[box.kind] ?? box.kind}${box.ghost ? ', not open' : ''}` : '';
  }

  private _renderEdges(edges: readonly EdgeLayout[], reach: Reach | null, over: boolean) {
    return edges.map((e) => {
      const edge = this._edges.get(e.id);
      if (!edge || OVER.has(edge.kind) !== over) return nothing;
      const dim = reach !== null && !reach.edges.has(e.id) ? ' dim' : '';
      const start = e.points[0]!;
      return svg`
        <path
          class="edge ${edge.kind}${dim}"
          d=${pathOf(e.points)}
          marker-start="url(#dex-graph-dot-${edge.kind})"
          marker-end="url(#dex-graph-arrow-${edge.kind})"
        ></path>
        ${over && edge.label && !dim
          ? svg`<text class="edge-label ${edge.kind}" x=${start.x + 4} y=${start.y - 3}>${edge.label}</text>`
          : nothing}
      `;
    });
  }

  // A dot where an edge leaves and an arrowhead where it arrives, one pair per kind, filled with
  // the kind's colour by the same class rule as the edge.
  private _markers() {
    return svg`<defs>${EDGE_KINDS.map(
      (kind) => svg`
        <marker id="dex-graph-dot-${kind}" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5">
          <circle class=${kind} cx="5" cy="5" r="4"></circle>
        </marker>
        <marker id="dex-graph-arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path class=${kind} d="M0,1 L9,5 L0,9 Z"></path>
        </marker>
      `,
    )}</defs>`;
  }

  private _renderBox(b: BoxLayout, reach: Reach | null) {
    const box = this._boxes.get(b.id)!;
    const open = b.items.length > 0;
    const classes = [
      'box',
      box.kind,
      box.ghost ? 'ghost' : '',
      open ? 'open' : '',
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
        ${open
          ? html`<ul class="legend-content" id="legend">
              ${EDGE_KINDS.map((kind) => html`<li><span class="swatch line ${kind}"></span>${EDGE_LABELS[kind]}</li>`)}
              ${(['model', 'sldd', 'mat'] as const).map((kind) => html`<li><span class="swatch box ${kind}"></span>${BOX_LABELS[kind]}</li>`)}
              <li><span class="swatch box ghost"></span>Not Open</li>
            </ul>`
          : nothing}
      </div>
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
    const reach = this._reach();
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
        @pointercancel=${this._onPointerCancel}
        @wheel=${this._wheel}
      >
        <div
          class="world"
          ${styleProps({
            width: `${layout.width}px`,
            height: `${layout.height}px`,
            transform: `translate(${x}px, ${y}px) scale(${scale})`,
          })}
        >
          <svg class="edges under" width=${layout.width} height=${layout.height} aria-hidden="true">
            ${this._markers()} ${this._renderEdges(layout.edges, reach, false)}
          </svg>
          ${layout.boxes.map((b) => this._renderBox(b, reach))}
          <svg class="edges over" width=${layout.width} height=${layout.height} aria-hidden="true">
            ${this._renderEdges(layout.edges, reach, true)}
          </svg>
        </div>
      </div>
      <div class="zoom" role="toolbar" aria-label="Zoom" aria-orientation="vertical">
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
  /** Open this file, at this row: a box or an item was double-clicked, or Enter pressed on it. A request. */
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
