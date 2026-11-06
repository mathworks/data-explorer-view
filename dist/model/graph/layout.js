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
const right = (r) => r.x + r.width;
const bottom = (r) => r.y + r.height;
const middle = (r) => r.y + r.height / 2;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hasWorkspace = (box) => box.items.some((i) => i.group === 'workspace');
/** How wide a box is drawn: what its label and all its items need, within the bounds. */
function boxWidth(box) {
    const label = box.label.length * LABEL_CHAR + LABEL_PAD;
    const items = box.items.reduce((w, i) => Math.max(w, i.name.length * ITEM_CHAR + ITEM_PAD), 0);
    const content = items > 0 ? items + 2 * ITEM_INSET + (hasWorkspace(box) ? WS_LANE : 0) : 0;
    return clamp(Math.ceil(Math.max(label, content)), MIN_BOX_WIDTH, MAX_BOX_WIDTH);
}
/** The index of the first workspace item when blocks come before it, else -1: where a divider goes. */
function dividerAt(items) {
    const at = items.findIndex((i) => i.group === 'workspace');
    return at > 0 ? at : -1;
}
/** A box's height: a header alone when it shows no items, else the items it shows under a narrower one. */
function boxHeight(items) {
    const n = items.length;
    if (n === 0)
        return BOX_HEADER;
    return OPEN_HEADER + (n - 1) * ITEM_PITCH + ITEM_HEIGHT + (dividerAt(items) > 0 ? DIVIDER_GAP : 0) + ITEM_INSET;
}
/**
 * The items that show, as ts showed them: all of an open box's, and of any other box those a usage
 * edge joins to an item of an open box. So a model opened onto its blocks shows, in each data file
 * they read, the variables they read and no others (graph-expanded.png: VehicleParams.sldd shows
 * IdleSpeed and MaxSpeed), and a dictionary opened shows, in each model, the blocks that read it.
 * Every item showing, as every box once did, is the picture that struck usage edges through other
 * boxes' items; a closed graph is files and their links alone.
 */
function shownItems(graph, expanded) {
    const boxOf = new Map();
    const shown = new Set();
    for (const box of graph.boxes) {
        for (const item of box.items) {
            boxOf.set(item.id, box.id);
            if (expanded.has(box.id))
                shown.add(item.id);
        }
    }
    for (const e of graph.edges) {
        const [from, to] = [boxOf.get(e.from), boxOf.get(e.to)];
        if (!from || !to || from === to)
            continue;
        if (expanded.has(from))
            shown.add(e.to);
        if (expanded.has(to))
            shown.add(e.from);
    }
    return shown;
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
function treeSlots(ids, edges) {
    const inTree = new Set(ids);
    const children = new Map(ids.map((id) => [id, []]));
    const referenced = new Set();
    for (const e of edges) {
        if (!inTree.has(e.from) || !inTree.has(e.to) || e.from === e.to)
            continue;
        children.get(e.from).push(e.to);
        referenced.add(e.to);
    }
    const roots = ids.filter((id) => !referenced.has(id));
    if (roots.length === 0 && ids.length > 0)
        roots.push(ids[0]);
    const placed = new Map();
    const visited = new Set();
    let nextLeaf = 0;
    const place = (id, depth) => {
        visited.add(id);
        const slots = [];
        // Visited is asked as each child comes up, not before the loop: a child an earlier sibling's
        // subtree reached is that subtree's, and this node is centred over the children it placed.
        for (const kid of children.get(id))
            if (!visited.has(kid))
                slots.push(place(kid, depth + 1));
        const slot = slots.length === 0 ? nextLeaf++ : (Math.min(...slots) + Math.max(...slots)) / 2;
        placed.set(id, { slot, depth });
        return slot;
    };
    for (const root of roots)
        if (!visited.has(root))
            place(root, 0);
    for (const id of ids)
        if (!visited.has(id))
            place(id, 0);
    return placed;
}
/**
 * Lay one column's tree out from `x0`: each row as tall as its tallest box, each box centred in a
 * slot as wide as the column's widest box. Answers the bottom of the lowest row, or `y0` for none.
 */
function placeTree(nodes, edges, x0, slotWidth, y0) {
    const slots = treeSlots(nodes.map((n) => n.box.id), edges);
    const rows = [];
    for (const n of nodes) {
        const { depth } = slots.get(n.box.id);
        rows[depth] = Math.max(rows[depth] ?? 0, n.height);
    }
    const rowTop = [];
    let y = y0;
    for (let d = 0; d < rows.length; d++) {
        rowTop[d] = y;
        y += rows[d] + ROW_GAP;
    }
    for (const n of nodes) {
        const { slot, depth } = slots.get(n.box.id);
        n.x = x0 + slot * (slotWidth + SIBLING_GAP) + (slotWidth - n.width) / 2;
        n.y = rowTop[depth];
        n.rowBottom = rowTop[depth] + rows[depth];
    }
    return rows.length > 0 ? y - ROW_GAP : y0;
}
/** The offsets that spread `n` things `spacing` apart around 0, in order. */
function spread(n, spacing) {
    return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * spacing);
}
/** Each key's offset, `spacing` apart around 0 among the edges that share its group, in order. */
function staggerBy(ids, groupOf, spacing) {
    const groups = new Map();
    for (const id of ids) {
        const g = groupOf(id);
        if (g !== null)
            groups.set(g, [...(groups.get(g) ?? []), id]);
    }
    const out = new Map();
    for (const members of groups.values()) {
        if (members.length < 2)
            continue;
        spread(members.length, spacing(members.length)).forEach((offset, i) => out.set(members[i], offset));
    }
    return out;
}
/** Corner points with repeats dropped: a lane that falls on an end adds no segment. */
function route(points) {
    return points.filter((p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y);
}
/**
 * The layout of `graph` with the boxes `expanded` names open: each shows its items, and each other
 * box the items of its own those reach (shownItems). Pure: the same graph and the same open boxes
 * give the same layout.
 */
export function layoutGraph(graph, expanded) {
    if (graph.boxes.length === 0)
        return { boxes: [], edges: [], width: 0, height: 0 };
    const shown = shownItems(graph, expanded);
    const nodes = graph.boxes.map((box) => {
        const items = box.items.filter((i) => shown.has(i.id));
        return { box, items, width: boxWidth(box), height: boxHeight(items), x: 0, y: 0, rowBottom: 0 };
    });
    const models = nodes.filter((n) => n.box.kind === 'model');
    const sldds = nodes.filter((n) => n.box.kind !== 'model' && n.box.kind !== 'mat');
    const mats = nodes.filter((n) => n.box.kind === 'mat');
    const widest = (ns) => ns.reduce((w, n) => Math.max(w, n.width), MIN_BOX_WIDTH);
    // The left column, then the right one beside it (at the left edge when there are no models).
    const kindOf = (kind) => graph.edges.filter((e) => e.kind === kind);
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
    const rects = new Map();
    const rowBottom = new Map();
    const boxOf = new Map();
    const boxes = nodes.map((n) => {
        const layout = { id: n.box.id, x: n.x, y: n.y, width: n.width, height: n.height, items: [] };
        rects.set(n.box.id, layout);
        rowBottom.set(n.box.id, n.rowBottom);
        if (n.items.length === 0)
            return layout;
        const at = dividerAt(n.items);
        const itemWidth = n.width - 2 * ITEM_INSET - (hasWorkspace(n.box) ? WS_LANE : 0);
        layout.items = n.items.map((item, i) => {
            const r = {
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
        if (at > 0)
            layout.divider = (bottom(layout.items[at - 1]) + layout.items[at].y) / 2;
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
function routeEdges(edges, at) {
    const { rects, rowBottom, boxOf, gapCenter } = at;
    const rect = (id) => rects.get(id);
    const byId = new Map(edges.map((e) => [e.id, e]));
    const of = (...kinds) => edges.filter((e) => kinds.includes(e.kind));
    const links = of('data-link');
    const params = of('param-usage');
    const items = of('param-usage', 'ws-usage');
    // A lane in the gap for each cross-column edge: the data links over 60% of it, the usages over half.
    const lane = new Map();
    const lanes = (list, most, share) => spread(list.length, Math.min(most, (COLUMN_GAP * share) / Math.max(list.length, 1))).forEach((o, i) => lane.set(list[i].id, gapCenter + o));
    lanes(links, 16, 0.6);
    lanes(params, 12, 0.5);
    // A data link's ports: a box's outgoing links spread down its side in the order of where they
    // go, its incoming in the order of where they come from, so they do not cross at the box.
    const portY = new Map();
    const ports = (side) => {
        const byBox = new Map();
        for (const e of links)
            byBox.set(e[side], [...(byBox.get(e[side]) ?? []), e]);
        const out = new Map();
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
    const rowOf = (side) => (id) => String(Math.round(rect(byId.get(id)[side]).y));
    const fromRow = staggerBy(links.map((e) => e.id), rowOf('from'), () => 4);
    const toRow = staggerBy(links.map((e) => e.id), rowOf('to'), () => 4);
    for (const e of links) {
        const [s, t] = [rect(e.from), rect(e.to)];
        portY.set(e.id, {
            from: clamp(fromPorts.get(e.id) + (fromRow.get(e.id) ?? 0), s.y + 2, bottom(s) - 2),
            to: clamp(toPorts.get(e.id) + (toRow.get(e.id) ?? 0), t.y + 2, bottom(t) - 2),
        });
    }
    // An item's edges, spread along its height, out of one item and into one.
    const itemSpacing = (n) => Math.min(3, (ITEM_HEIGHT - 4) / (n - 1));
    const outOf = staggerBy(items.map((e) => e.id), (id) => byId.get(id).from, itemSpacing);
    const into = staggerBy(items.map((e) => e.id), (id) => byId.get(id).to, itemSpacing);
    for (const e of items) {
        portY.set(e.id, { from: middle(rect(e.from)) + (outOf.get(e.id) ?? 0), to: middle(rect(e.to)) + (into.get(e.id) ?? 0) });
    }
    // A box's workspace edges each take a lane of their own in its margin.
    const wsLane = new Map();
    const wsCount = new Map();
    for (const e of of('ws-usage')) {
        const box = boxOf.get(e.from) ?? e.from;
        const k = wsCount.get(box) ?? 0;
        wsCount.set(box, k + 1);
        wsLane.set(e.id, Math.max(right(rect(e.from)), right(rect(e.to))) + 6 + 3 * (k % 4));
    }
    return edges.map((e) => {
        const [s, t] = [rect(e.from), rect(e.to)];
        switch (e.kind) {
            case 'model-ref':
            case 'sldd-ref':
                return { id: e.id, points: vertical(s, t, rowBottom.get(e.from) ?? bottom(s), rowBottom.get(e.to) ?? bottom(t)) };
            case 'ws-usage': {
                const { from, to } = portY.get(e.id);
                const x = wsLane.get(e.id);
                return { id: e.id, points: route([{ x: right(s), y: from }, { x, y: from }, { x, y: to }, { x: right(t), y: to }]) };
            }
            default: {
                const { from, to } = portY.get(e.id);
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
function across(s, sy, t, ty, x) {
    let sx;
    let tx;
    if (right(s) <= t.x || right(t) <= s.x) {
        [sx, tx] = right(s) <= t.x ? [right(s), t.x] : [s.x, right(t)];
        if (!(x > Math.min(sx, tx) && x < Math.max(sx, tx)))
            x = (sx + tx) / 2;
    }
    else {
        [sx, tx] = [right(s), right(t)];
        x = Math.max(sx, tx) + 12;
    }
    if (Math.abs(sy - ty) < 2 && sy >= t.y && sy <= bottom(t))
        return route([{ x: sx, y: sy }, { x: tx, y: sy }]);
    return route([{ x: sx, y: sy }, { x, y: sy }, { x, y: ty }, { x: tx, y: ty }]);
}
/**
 * A route between two boxes of one tree: down from the bottom middle of `s` to the top middle of
 * `t` below it, turning just over `t`'s row; up from the top of `s` to the bottom of `t` above it,
 * turning just over `s`'s row; and, between two boxes of one row, from the bottom of one to the
 * bottom of the other, passing under the row. `sRow` and `tRow` are the bottoms of their rows.
 */
function vertical(s, t, sRow, tRow) {
    const sx = s.x + s.width / 2;
    let tx = t.x + t.width / 2;
    // Ends within a pixel of each other side to side are joined straight, if the line still lands on `t`.
    const straight = Math.abs(sx - tx) < 1 && sx >= t.x && sx <= right(t);
    if (straight)
        tx = sx;
    let from;
    let to;
    let y;
    if (t.y >= bottom(s)) {
        [from, to] = [{ x: sx, y: bottom(s) }, { x: tx, y: t.y }];
        y = t.y - bottom(s) >= ROW_GAP ? t.y - ROW_GAP / 2 : (bottom(s) + t.y) / 2;
    }
    else if (bottom(t) <= s.y) {
        [from, to] = [{ x: sx, y: s.y }, { x: tx, y: bottom(t) }];
        y = s.y - bottom(t) >= ROW_GAP ? s.y - ROW_GAP / 2 : (bottom(t) + s.y) / 2;
    }
    else {
        [from, to] = [{ x: sx, y: bottom(s) }, { x: tx, y: bottom(t) }];
        return route([from, { x: sx, y: Math.max(sRow, tRow) + ROW_GAP / 2 }, { x: tx, y: Math.max(sRow, tRow) + ROW_GAP / 2 }, to]);
    }
    if (straight)
        return route([from, to]);
    return route([from, { x: sx, y }, { x: tx, y }, to]);
}
