// Copyright 2026 The MathWorks, Inc.
// Where the relationship graph is drawn: a rectangle for each box and each item of an open box,
// and an orthogonal route for each edge. A port of the prototype's BipartiteLayout, which the
// look of the graph (graph-expanded.png, legend-expanded.png) comes from.
//
// TWO COLUMNS. The models on the left, as a tree of their model references: what a model
// references in the row under it, side by side, the model centred over them. The dictionaries on
// the right, as a tree of their references, and the MAT-files stacked under them. A file a model
// links (data-link) and a variable a block reads (param-usage) are reached across the gap between
// the columns, each edge on a lane of its own there so that edges side by side do not merge into
// one line; a block reading its own model's workspace (ws-usage) is routed inside the model's box,
// on the right of its items.
//
// WHAT CHANGED FROM ts, and why each is a change rather than a port:
//
//   - A row is as tall as the tallest box in it. ts put every row a closed box's height below the
//     last, so a model opened onto its blocks covered the models it references (graph-expanded.png
//     shows them under it). No box covers another here, which the tests check over generated graphs.
//   - A box is as wide as its label and ALL its items need, open or closed, so opening a box never
//     moves the boxes beside it sideways. ts sized a box by what it showed.
//   - An item is as wide as its box allows, not as its name: the items line up, and the lane a
//     workspace edge takes on their right is inside the box whatever the names.
//   - A route is a list of corner points rather than SVG path text, so a widget draws it as it
//     likes (the graph widget rounds the corners, as ts's quadratic curves did) and a test can check
//     that it is orthogonal and that it starts and ends on the boxes it joins.
//   - A cycle or a file two files reference is drawn once, under the first referrer to reach it, as
//     ts did; an edge back up the tree or across one row is routed out of the rows rather than
//     through the boxes, which ts's did not try to do.
//
// Widths are estimated from the number of characters, not measured: the model has no DOM to
// measure text with, and the widget draws names with an ellipsis where an estimate was short.
import type { GraphBox, GraphEdge, RelationshipGraph } from './relationshipGraph.js';

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

/** Where a box is drawn, and its items when it is open. */
export interface BoxLayout extends GraphRect {
  id: string;
  /** Its items, top to bottom; none while it is closed or has none. */
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
export const BOX_HEADER = 44;
/** The band at the top of an open box that its icon, label and collapse button sit in. */
export const OPEN_HEADER = 30;
/** The height of an item. */
export const ITEM_HEIGHT = 22;
// From the top of one item to the top of the next.
const ITEM_PITCH = 24;
// An item's distance from its box's sides, and the last item's from its bottom.
const ITEM_INSET = 10;
// The room the divider between a model's blocks and its workspace variables takes.
const DIVIDER_GAP = 16;
// The extra room on the right of a model's items, for the lanes its workspace edges take.
const WS_LANE = 20;
const MIN_BOX_WIDTH = 80;
const MAX_BOX_WIDTH = 240;
// Between rows of a tree, between boxes side by side in one, and between the two columns.
const ROW_GAP = 44;
const SIBLING_GAP = 30;
const COLUMN_GAP = 300;
// Around the whole picture.
const PADDING = 40;
// The estimate of a label's width: 11px text, and the icon, the margins and the collapse button.
const LABEL_CHAR = 6.6;
const LABEL_PAD = 56;
// The same for an item: 10px text, and its icon and margins.
const ITEM_CHAR = 6;
const ITEM_PAD = 38;

const right = (r: GraphRect): number => r.x + r.width;
const bottom = (r: GraphRect): number => r.y + r.height;
const middle = (r: GraphRect): number => r.y + r.height / 2;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const hasWorkspace = (box: GraphBox): boolean => box.items.some((i) => i.group === 'workspace');

/** How wide a box is drawn: what its label and all its items need, within the bounds. */
function boxWidth(box: GraphBox): number {
  const label = box.label.length * LABEL_CHAR + LABEL_PAD;
  const items = box.items.reduce((w, i) => Math.max(w, i.name.length * ITEM_CHAR + ITEM_PAD), 0);
  const content = items > 0 ? items + 2 * ITEM_INSET + (hasWorkspace(box) ? WS_LANE : 0) : 0;
  return clamp(Math.ceil(Math.max(label, content)), MIN_BOX_WIDTH, MAX_BOX_WIDTH);
}

/** The index of a box's first workspace item when blocks come before it, else -1: where its divider goes. */
function dividerAt(box: GraphBox): number {
  const at = box.items.findIndex((i) => i.group === 'workspace');
  return at > 0 ? at : -1;
}

/** A box's height: a header alone when it is closed or empty, else its items under a narrower one. */
function boxHeight(box: GraphBox, open: boolean): number {
  if (!open) return BOX_HEADER;
  const n = box.items.length;
  return OPEN_HEADER + (n - 1) * ITEM_PITCH + ITEM_HEIGHT + (dividerAt(box) > 0 ? DIVIDER_GAP : 0) + ITEM_INSET;
}

/**
 * Where each node of one column's tree goes: its slot (in box widths, fractional for a node centred
 * over its children) and its depth (its row). ts's tree layout, kept as it was: the roots are the
 * nodes nothing references, in order (the first node when every node is referenced, in a cycle);
 * a depth-first walk gives each leaf the next slot and each other node the middle of its children's;
 * a node is placed once, under the first node to reach it, and a node no root reaches starts a
 * tree of its own.
 *
 * Two nodes of one row never share a slot: the subtrees are walked one after another, so each
 * takes a run of slots of its own, and a node sits within its own subtree's run.
 */
function treeSlots(ids: readonly string[], edges: readonly GraphEdge[]): Map<string, { slot: number; depth: number }> {
  const inTree = new Set(ids);
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const referenced = new Set<string>();
  for (const e of edges) {
    if (!inTree.has(e.from) || !inTree.has(e.to) || e.from === e.to) continue;
    children.get(e.from)!.push(e.to);
    referenced.add(e.to);
  }
  const roots = ids.filter((id) => !referenced.has(id));
  if (roots.length === 0 && ids.length > 0) roots.push(ids[0]!);

  const placed = new Map<string, { slot: number; depth: number }>();
  const visited = new Set<string>();
  let nextLeaf = 0;
  const place = (id: string, depth: number): number => {
    visited.add(id);
    const slots: number[] = [];
    // Visited is asked as each child comes up, not before the loop: a child an earlier sibling's
    // subtree reached is that subtree's, and this node is centred over the children it placed.
    for (const kid of children.get(id)!) if (!visited.has(kid)) slots.push(place(kid, depth + 1));
    const slot = slots.length === 0 ? nextLeaf++ : (Math.min(...slots) + Math.max(...slots)) / 2;
    placed.set(id, { slot, depth });
    return slot;
  };
  for (const root of roots) if (!visited.has(root)) place(root, 0);
  for (const id of ids) if (!visited.has(id)) place(id, 0);
  return placed;
}

/** A box being placed: its graph box, size and, once placed, its rectangle and row. */
interface Placed {
  box: GraphBox;
  open: boolean;
  width: number;
  height: number;
  x: number;
  y: number;
  /** The bottom of its tree row, which an edge across the row passes under; its own bottom off a tree. */
  rowBottom: number;
}

/**
 * Lay one column's tree out from `x0`: each row as tall as its tallest box, each box centred in a
 * slot as wide as the column's widest box. Answers the bottom of the lowest row, or `y0` for none.
 */
function placeTree(nodes: Placed[], edges: readonly GraphEdge[], x0: number, slotWidth: number, y0: number): number {
  const slots = treeSlots(nodes.map((n) => n.box.id), edges);
  const rows: number[] = [];
  for (const n of nodes) {
    const { depth } = slots.get(n.box.id)!;
    rows[depth] = Math.max(rows[depth] ?? 0, n.height);
  }
  const rowTop: number[] = [];
  let y = y0;
  for (let d = 0; d < rows.length; d++) {
    rowTop[d] = y;
    y += rows[d]! + ROW_GAP;
  }
  for (const n of nodes) {
    const { slot, depth } = slots.get(n.box.id)!;
    n.x = x0 + slot * (slotWidth + SIBLING_GAP) + (slotWidth - n.width) / 2;
    n.y = rowTop[depth]!;
    n.rowBottom = rowTop[depth]! + rows[depth]!;
  }
  return rows.length > 0 ? y - ROW_GAP : y0;
}

/** The offsets that spread `n` things `spacing` apart around 0, in order. */
function spread(n: number, spacing: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * spacing);
}

/** Each key's offset, `spacing` apart around 0 among the edges that share its group, in order. */
function staggerBy(ids: readonly string[], groupOf: (id: string) => string | null, spacing: (n: number) => number): Map<string, number> {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const g = groupOf(id);
    if (g !== null) groups.set(g, [...(groups.get(g) ?? []), id]);
  }
  const out = new Map<string, number>();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    spread(members.length, spacing(members.length)).forEach((offset, i) => out.set(members[i]!, offset));
  }
  return out;
}

/** Corner points with repeats dropped: a lane that falls on an end adds no segment. */
function route(points: GraphPoint[]): GraphPoint[] {
  return points.filter((p, i) => i === 0 || p.x !== points[i - 1]!.x || p.y !== points[i - 1]!.y);
}

/**
 * The layout of `graph` with the boxes `expanded` names open (a box with no items draws closed
 * whatever it says). Pure: the same graph and the same open boxes give the same layout.
 */
export function layoutGraph(graph: RelationshipGraph, expanded: ReadonlySet<string>): GraphLayout {
  if (graph.boxes.length === 0) return { boxes: [], edges: [], width: 0, height: 0 };

  const nodes: Placed[] = graph.boxes.map((box) => {
    const open = expanded.has(box.id) && box.items.length > 0;
    return { box, open, width: boxWidth(box), height: boxHeight(box, open), x: 0, y: 0, rowBottom: 0 };
  });
  const models = nodes.filter((n) => n.box.kind === 'model');
  const sldds = nodes.filter((n) => n.box.kind !== 'model' && n.box.kind !== 'mat');
  const mats = nodes.filter((n) => n.box.kind === 'mat');
  const widest = (ns: Placed[]): number => ns.reduce((w, n) => Math.max(w, n.width), MIN_BOX_WIDTH);

  // The left column, then the right one beside it (at the left edge when there are no models).
  const kindOf = (kind: GraphEdge['kind']) => graph.edges.filter((e) => e.kind === kind);
  placeTree(models, kindOf('model-ref'), PADDING, widest(models), PADDING);
  const leftRight = models.reduce((r, n) => Math.max(r, n.x + n.width), 0);
  const rightX = models.length > 0 ? leftRight + COLUMN_GAP : PADDING;
  const rightSlot = widest([...sldds, ...mats]);
  let matY = placeTree(sldds, kindOf('sldd-ref'), rightX, rightSlot, PADDING);
  matY = sldds.length > 0 ? matY + ROW_GAP : PADDING;
  for (const n of mats) {
    n.x = rightX + (rightSlot - n.width) / 2;
    n.y = matY;
    n.rowBottom = matY + n.height;
    matY += n.height + ROW_GAP;
  }

  // The boxes and their items, and every drawn thing's rectangle by id, for the routes.
  const rects = new Map<string, GraphRect>();
  const rowBottom = new Map<string, number>();
  const boxOf = new Map<string, string>();
  const boxes: BoxLayout[] = nodes.map((n) => {
    const layout: BoxLayout = { id: n.box.id, x: n.x, y: n.y, width: n.width, height: n.height, items: [] };
    rects.set(n.box.id, layout);
    rowBottom.set(n.box.id, n.rowBottom);
    if (!n.open) return layout;
    const at = dividerAt(n.box);
    const itemWidth = n.width - 2 * ITEM_INSET - (hasWorkspace(n.box) ? WS_LANE : 0);
    layout.items = n.box.items.map((item, i) => {
      const r: ItemLayout = {
        id: item.id,
        x: n.x + ITEM_INSET,
        y: n.y + OPEN_HEADER + i * ITEM_PITCH + (at > 0 && i >= at ? DIVIDER_GAP : 0),
        width: itemWidth,
        height: ITEM_HEIGHT,
      };
      rects.set(item.id, r);
      boxOf.set(item.id, n.box.id);
      return r;
    });
    if (at > 0) layout.divider = (bottom(layout.items[at - 1]!) + layout.items[at]!.y) / 2;
    return layout;
  });

  const edges = routeEdges(graph.edges.filter((e) => rects.has(e.from) && rects.has(e.to)), {
    rects,
    rowBottom,
    boxOf,
    gapCenter: models.length > 0 ? (leftRight + rightX) / 2 : rightX - COLUMN_GAP / 2,
  });

  // The canvas: everything drawn, with the margin on the right and at the bottom too.
  let width = 0;
  let height = 0;
  for (const b of boxes) {
    width = Math.max(width, right(b));
    height = Math.max(height, bottom(b));
  }
  for (const e of edges) {
    for (const p of e.points) {
      width = Math.max(width, p.x);
      height = Math.max(height, p.y);
    }
  }
  return { boxes, edges, width: width + PADDING, height: height + PADDING };
}

/** What the routes are drawn between. */
interface RouteContext {
  /** Every drawn box's and item's rectangle, by id. */
  rects: Map<string, GraphRect>;
  /** The bottom of each box's row. */
  rowBottom: Map<string, number>;
  /** The box each drawn item is in. */
  boxOf: Map<string, string>;
  /** The middle of the gap between the columns. */
  gapCenter: number;
}

/**
 * The routes, in the order given. Each kind as ts routed it:
 *
 *   - a reference (model-ref, sldd-ref) leaves the bottom middle of the referrer and reaches the top
 *     middle of what it references, turning in the gap over the target's row; one back up the tree
 *     leaves the top and reaches the bottom, and one across a row passes under the row;
 *   - a data-link leaves its model's side and reaches its file's, on a lane of its own in the gap
 *     between the columns, at a port spread along each box's side so that two edges of one box do
 *     not leave at one point;
 *   - a param-usage likewise from the block's right to the variable's left, the edges of one item
 *     spread along it;
 *   - a ws-usage from the block's right to the variable's right, on a lane in the box's own margin.
 */
function routeEdges(edges: readonly GraphEdge[], at: RouteContext): EdgeLayout[] {
  const { rects, rowBottom, boxOf, gapCenter } = at;
  const rect = (id: string): GraphRect => rects.get(id)!;
  const byId = new Map(edges.map((e) => [e.id, e]));
  const of = (...kinds: GraphEdge['kind'][]) => edges.filter((e) => kinds.includes(e.kind));
  const links = of('data-link');
  const params = of('param-usage');
  const items = of('param-usage', 'ws-usage');

  // A lane in the gap for each cross-column edge: the data links over 60% of it, the usages over half.
  const lane = new Map<string, number>();
  const lanes = (list: GraphEdge[], most: number, share: number): void =>
    spread(list.length, Math.min(most, (COLUMN_GAP * share) / Math.max(list.length, 1))).forEach((o, i) =>
      lane.set(list[i]!.id, gapCenter + o),
    );
  lanes(links, 16, 0.6);
  lanes(params, 12, 0.5);

  // A data link's ports: a box's outgoing links spread down its side in the order of where they
  // go, its incoming in the order of where they come from, so they do not cross at the box.
  const portY = new Map<string, { from: number; to: number }>();
  const ports = (side: 'from' | 'to'): Map<string, number> => {
    const byBox = new Map<string, GraphEdge[]>();
    for (const e of links) byBox.set(e[side], [...(byBox.get(e[side]) ?? []), e]);
    const out = new Map<string, number>();
    for (const [boxId, list] of byBox) {
      const other = side === 'from' ? 'to' : 'from';
      list.sort((a, b) => rect(a[other]).y - rect(b[other]).y);
      const r = rect(boxId);
      const step = list.length > 1 ? (r.height - 16) / (list.length - 1) : 0;
      list.forEach((e, i) => out.set(e.id, list.length > 1 ? r.y + 8 + i * step : middle(r)));
    }
    return out;
  };
  const fromPorts = ports('from');
  const toPorts = ports('to');
  // ts's stagger of the links whose boxes start on one row, so their level runs do not coincide.
  const rowOf = (side: 'from' | 'to') => (id: string) => String(Math.round(rect(byId.get(id)![side]).y));
  const fromRow = staggerBy(links.map((e) => e.id), rowOf('from'), () => 4);
  const toRow = staggerBy(links.map((e) => e.id), rowOf('to'), () => 4);
  for (const e of links) {
    const [s, t] = [rect(e.from), rect(e.to)];
    portY.set(e.id, {
      from: clamp(fromPorts.get(e.id)! + (fromRow.get(e.id) ?? 0), s.y + 2, bottom(s) - 2),
      to: clamp(toPorts.get(e.id)! + (toRow.get(e.id) ?? 0), t.y + 2, bottom(t) - 2),
    });
  }

  // An item's edges, spread along its height, out of one item and into one.
  const itemSpacing = (n: number): number => Math.min(3, (ITEM_HEIGHT - 4) / (n - 1));
  const outOf = staggerBy(items.map((e) => e.id), (id) => byId.get(id)!.from, itemSpacing);
  const into = staggerBy(items.map((e) => e.id), (id) => byId.get(id)!.to, itemSpacing);
  for (const e of items) {
    portY.set(e.id, { from: middle(rect(e.from)) + (outOf.get(e.id) ?? 0), to: middle(rect(e.to)) + (into.get(e.id) ?? 0) });
  }

  // A box's workspace edges each take a lane of their own in its margin.
  const wsLane = new Map<string, number>();
  const wsCount = new Map<string, number>();
  for (const e of of('ws-usage')) {
    const box = boxOf.get(e.from) ?? e.from;
    const k = wsCount.get(box) ?? 0;
    wsCount.set(box, k + 1);
    wsLane.set(e.id, Math.max(right(rect(e.from)), right(rect(e.to))) + 6 + 3 * (k % 4));
  }

  return edges.map((e): EdgeLayout => {
    const [s, t] = [rect(e.from), rect(e.to)];
    switch (e.kind) {
      case 'model-ref':
      case 'sldd-ref':
        return { id: e.id, points: vertical(s, t, rowBottom.get(e.from) ?? bottom(s), rowBottom.get(e.to) ?? bottom(t)) };
      case 'ws-usage': {
        const { from, to } = portY.get(e.id)!;
        const x = wsLane.get(e.id)!;
        return { id: e.id, points: route([{ x: right(s), y: from }, { x, y: from }, { x, y: to }, { x: right(t), y: to }]) };
      }
      default: {
        const { from, to } = portY.get(e.id)!;
        return { id: e.id, points: across(s, from, t, to, lane.get(e.id) ?? gapCenter) };
      }
    }
  });
}

/**
 * A route from one side of `s` to a side of `t`, through a vertical lane at `x`: from the right of
 * `s` to the left of `t` when `t` is to its right (and the other way round), and round the right of
 * both when the two overlap side to side. A lane not between the two ends is moved to their middle,
 * so a route never runs past its target and back. Ends within two pixels of level are joined level.
 */
function across(s: GraphRect, sy: number, t: GraphRect, ty: number, x: number): GraphPoint[] {
  let sx: number;
  let tx: number;
  if (right(s) <= t.x || right(t) <= s.x) {
    [sx, tx] = right(s) <= t.x ? [right(s), t.x] : [s.x, right(t)];
    if (!(x > Math.min(sx, tx) && x < Math.max(sx, tx))) x = (sx + tx) / 2;
  } else {
    [sx, tx] = [right(s), right(t)];
    x = Math.max(sx, tx) + 12;
  }
  if (Math.abs(sy - ty) < 2 && sy >= t.y && sy <= bottom(t)) return route([{ x: sx, y: sy }, { x: tx, y: sy }]);
  return route([{ x: sx, y: sy }, { x, y: sy }, { x, y: ty }, { x: tx, y: ty }]);
}

/**
 * A route between two boxes of one tree: down from the bottom middle of `s` to the top middle of
 * `t` below it, turning just over `t`'s row; up from the top of `s` to the bottom of `t` above it,
 * turning just over `s`'s row; and, between two boxes of one row, from the bottom of one to the
 * bottom of the other, passing under the row. `sRow` and `tRow` are the bottoms of their rows.
 */
function vertical(s: GraphRect, t: GraphRect, sRow: number, tRow: number): GraphPoint[] {
  const sx = s.x + s.width / 2;
  let tx = t.x + t.width / 2;
  // Ends within a pixel of each other side to side are joined straight, if the line still lands on `t`.
  const straight = Math.abs(sx - tx) < 1 && sx >= t.x && sx <= right(t);
  if (straight) tx = sx;
  let from: GraphPoint;
  let to: GraphPoint;
  let y: number;
  if (t.y >= bottom(s)) {
    [from, to] = [{ x: sx, y: bottom(s) }, { x: tx, y: t.y }];
    y = t.y - bottom(s) >= ROW_GAP ? t.y - ROW_GAP / 2 : (bottom(s) + t.y) / 2;
  } else if (bottom(t) <= s.y) {
    [from, to] = [{ x: sx, y: s.y }, { x: tx, y: bottom(t) }];
    y = s.y - bottom(t) >= ROW_GAP ? s.y - ROW_GAP / 2 : (bottom(t) + s.y) / 2;
  } else {
    [from, to] = [{ x: sx, y: bottom(s) }, { x: tx, y: bottom(t) }];
    return route([from, { x: sx, y: Math.max(sRow, tRow) + ROW_GAP / 2 }, { x: tx, y: Math.max(sRow, tRow) + ROW_GAP / 2 }, to]);
  }
  if (straight) return route([from, to]);
  return route([from, { x: sx, y }, { x: tx, y }, to]);
}
