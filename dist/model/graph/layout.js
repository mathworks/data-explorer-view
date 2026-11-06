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
// Between rows of a tree, and between boxes side by side in one.
const ROW_GAP = 44;
const SIBLING_GAP = 30;
// The gap between the two columns is as wide as its lanes need: a data link's lane LINK_LANE from
// the next, all of them over 60% of the gap (the usages share the middle half of it), within the
// bounds. The prototype's 300 was room for 22 links; fifteen files draw 13.
const LINK_LANE = 8;
const MIN_COLUMN_GAP = 120;
const MAX_COLUMN_GAP = 300;
// The indented layout's: between the rows of one tree, between one tree and the next in a column,
// and between the columns a long column wraps into; how far right of its referrer a file it
// references is drawn, and how far in from the referrer's left edge the line down to it runs; and
// the lanes round the outside of a column that a reference to a file drawn under another referrer
// takes, the first this far out from the column and the rest a step further each.
const INDENTED_ROW_GAP = 16;
const TREE_GAP = 24;
const WRAP_GAP = 40;
const INDENT = 24;
const TRUNK = 12;
const LANE_PAD = 10;
const LANE_STEP = 4;
// The canvas a long indented column is wrapped for: about the app shell's centre in a 1440 by 900
// window, a fixed one and not the element's own. The layout is the model's and knows no pane, and
// a wrap that followed the pane would move every box as the window was resized. And how much
// larger a wrap must let the picture be drawn there for it to be worth what it costs: an edge to a
// box of a second run passes under the boxes of the first.
const WRAP_WIDTH = 900;
const WRAP_HEIGHT = 600;
const WRAP_GAIN = 1.2;
// How many of the column's widest boxes wide a row of trees side by side may be before the next
// tree starts a row of its own under them: the models' column, and the data files'. Ten files
// referencing nothing were ten roots in one row, and a fit to the window made every box unreadable.
const MODEL_COLUMNS = 3;
const DATA_COLUMNS = 2;
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
 * The items that show, as the prototype showed them: all of an open box's, and of any other box those
 * a usage edge joins to an item of an open box. So a model opened onto its blocks shows, in each data
 * file they read, the variables they read and no others, and a dictionary opened shows, in each
 * model, the blocks that read it.
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
// --- The tree layout ----------------------------------------------------------------------
/**
 * One column's files as trees of their references: each tree's root, and the files each file is
 * drawn over. The prototype's walk, kept as it was: the roots are the files nothing references, in
 * order (the first file when every file is referenced, in a cycle); a depth-first walk from each; a
 * file is drawn once, under the first file to reach it; and a file no root reaches starts a tree of
 * its own.
 */
function treesOf(ids, edges) {
    const inTree = new Set(ids);
    const children = new Map(ids.map((id) => [id, []]));
    const referenced = new Set();
    for (const e of edges) {
        if (!inTree.has(e.from) || !inTree.has(e.to) || e.from === e.to)
            continue;
        children.get(e.from).push(e.to);
        referenced.add(e.to);
    }
    const starts = ids.filter((id) => !referenced.has(id));
    if (starts.length === 0 && ids.length > 0)
        starts.push(ids[0]);
    const roots = [];
    const under = new Map();
    const depth = new Map();
    const visit = (id, d) => {
        depth.set(id, d);
        const placed = [];
        under.set(id, placed);
        // Visited is asked as each child comes up, not before the loop: a child an earlier sibling's
        // subtree reached is that subtree's, and this file is centred over the children it placed.
        for (const kid of children.get(id)) {
            if (depth.has(kid))
                continue;
            placed.push(kid);
            visit(kid, d + 1);
        }
    };
    for (const id of [...starts, ...ids]) {
        if (depth.has(id))
            continue;
        roots.push(id);
        visit(id, 0);
    }
    return { roots, under, depth };
}
/**
 * Lay one column's trees out from `x0`, `y0`, tidily: each file's subtree as wide as the file, or
 * as its children's subtrees side by side SIBLING_GAP apart if that is wider; the children of a
 * file side by side under it, the file centred over them (within its own subtree); each tree's rows
 * as tall as their tallest box. Trees sit side by side in the order given until the next would
 * take the row past `columns` boxes `widest` wide, when it starts a row of its own under
 * them (a tree wider than that alone keeps its whole width: what wraps is trees, never the boxes of
 * one). Answers the bottom of the lowest box, or `y0` for none.
 *
 * Where the prototype gave every file a slot as wide as the column's widest box, each file here
 * takes what it needs: fifteen files' models drew 1040 pixels wide where they had drawn 1140.
 *
 * No two boxes of one row of one tree share any of the width: a file is within its own subtree's
 * span, and the subtrees of one row are side by side. A row of trees is as tall as its tallest tree.
 */
function placeColumn(nodes, edges, x0, y0, columns, widest) {
    if (nodes.length === 0)
        return y0;
    const byId = new Map(nodes.map((n) => [n.box.id, n]));
    const { roots, under, depth } = treesOf(nodes.map((n) => n.box.id), edges);
    // Each subtree's width, from its leaves up.
    const span = new Map();
    const spanOf = (id) => {
        const kids = under.get(id);
        const inner = kids.reduce((w, k) => w + spanOf(k), 0) + Math.max(0, kids.length - 1) * SIBLING_GAP;
        const w = Math.max(byId.get(id).width, inner);
        span.set(id, w);
        return w;
    };
    // Each tree's rows, by depth: as tall as their tallest box.
    const treeOf = new Map();
    const rows = roots.map(() => []);
    roots.forEach((root, t) => {
        spanOf(root);
        const walk = (id) => {
            treeOf.set(id, t);
            const d = depth.get(id);
            rows[t][d] = Math.max(rows[t][d] ?? 0, byId.get(id).height);
            for (const k of under.get(id))
                walk(k);
        };
        walk(root);
    });
    const heightOf = (t) => rows[t].reduce((h, r) => h + r + ROW_GAP, -ROW_GAP);
    // The trees into rows of trees: where each starts, across and down.
    const room = columns * (widest + SIBLING_GAP) - SIBLING_GAP;
    const at = roots.map(() => ({ left: 0, top: 0 }));
    let used = 0;
    let top = y0;
    let tallest = 0;
    roots.forEach((root, t) => {
        const w = span.get(root);
        if (used > 0 && used + SIBLING_GAP + w > room) {
            top += tallest + ROW_GAP;
            used = 0;
            tallest = 0;
        }
        at[t] = { left: x0 + (used > 0 ? used + SIBLING_GAP : 0), top };
        used += (used > 0 ? SIBLING_GAP : 0) + w;
        tallest = Math.max(tallest, heightOf(t));
    });
    // Each file within its subtree's span, from `left`: its children's spans centred under it, and
    // it centred over its first and last child, as the prototype centred a file over its children.
    const place = (id, left) => {
        const n = byId.get(id);
        const kids = under.get(id);
        const t = treeOf.get(id);
        const d = depth.get(id);
        const rowTop = at[t].top + rows[t].slice(0, d).reduce((h, r) => h + r + ROW_GAP, 0);
        n.y = rowTop;
        n.rowBottom = rowTop + rows[t][d];
        const own = span.get(id);
        if (kids.length === 0) {
            n.x = left + (own - n.width) / 2;
            return;
        }
        const inner = kids.reduce((w, k) => w + span.get(k), 0) + (kids.length - 1) * SIBLING_GAP;
        let x = left + (own - inner) / 2;
        for (const k of kids) {
            place(k, x);
            x += span.get(k) + SIBLING_GAP;
        }
        const [first, last] = [byId.get(kids[0]), byId.get(kids[kids.length - 1])];
        const centre = (first.x + first.width / 2 + last.x + last.width / 2) / 2;
        n.x = clamp(centre - n.width / 2, left, left + own - n.width);
    };
    roots.forEach((root, t) => place(root, at[t].left));
    return nodes.reduce((low, n) => Math.max(low, n.y + n.height), y0);
}
/**
 * One column's files as trees of their references, each tree its files top to bottom: a file, then
 * the trees of what it references, in the order it references them. The prototype's walk, kept as
 * it was: the roots are the files nothing references, in order (the first file when every file is
 * referenced, in a cycle); a file is drawn once, under the first file to reach it; and a file no
 * root reaches starts a tree of its own.
 */
function indentedTrees(ids, edges) {
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
    const visited = new Set();
    const trees = [];
    const tree = (root) => {
        const nodes = [];
        const place = (id, depth, parent) => {
            visited.add(id);
            nodes.push({ id, depth, parent });
            // Visited is asked as each child comes up, not before the loop: a child an earlier sibling's
            // tree reached is that tree's.
            for (const kid of children.get(id))
                if (!visited.has(kid))
                    place(kid, depth + 1, id);
        };
        place(root, 0, null);
        trees.push(nodes);
    };
    for (const root of roots)
        if (!visited.has(root))
            tree(root);
    for (const id of ids)
        if (!visited.has(id))
            tree(id);
    return trees;
}
// What a column's trees take, each drawn closed: down, and across with their indents.
const closedHeight = (tree) => tree.length * BOX_HEADER + (tree.length - 1) * INDENTED_ROW_GAP;
const treeWidth = (column, tree) => tree.reduce((w, n) => Math.max(w, n.depth * INDENT + column.nodes.get(n.id).width), 0);
/** The trees in order, into runs no taller than `height` each (a tree taller alone keeps its height). */
function wrap(column, height) {
    const runs = [];
    let used = 0;
    for (const tree of column.trees) {
        const h = closedHeight(tree);
        if (runs.length === 0 || (used > 0 && used + TREE_GAP + h > height)) {
            runs.push([]);
            used = 0;
        }
        runs[runs.length - 1].push(tree);
        used += (used > 0 ? TREE_GAP : 0) + h;
    }
    return runs;
}
/** How wide and tall a column is wrapped at `height`, its boxes closed. */
function extent(column, height) {
    const runs = wrap(column, height);
    const widths = runs.map((run) => run.reduce((w, t) => Math.max(w, treeWidth(column, t)), 0));
    const heights = runs.map((run) => run.reduce((h, t) => h + closedHeight(t), (run.length - 1) * TREE_GAP));
    return { width: widths.reduce((a, w) => a + w, 0) + Math.max(0, runs.length - 1) * WRAP_GAP, height: Math.max(0, ...heights) };
}
/**
 * The height both columns wrap at: of the heights a column's trees can end at, the one whose
 * picture, its boxes closed, a WRAP_WIDTH by WRAP_HEIGHT canvas fits at the largest scale up to its
 * own size, `across` and `down` the room beside and above and below the columns; one run a column
 * unless a wrap draws it WRAP_GAIN times larger. So files that nearly fit at full size keep one run
 * a column, however narrow, and the trees of a large folder are dealt into runs side by side; it is
 * decided by the boxes closed so that opening one never moves another sideways.
 */
function wrapHeight(columns, across, down) {
    const candidates = new Set();
    for (const column of columns) {
        let h = -TREE_GAP;
        for (const tree of column.trees)
            candidates.add((h += TREE_GAP + closedHeight(tree)));
    }
    const scaleAt = (height) => {
        const sizes = columns.map((c) => extent(c, height));
        const width = across + sizes.reduce((w, e) => w + e.width, 0);
        return Math.min(WRAP_WIDTH / width, WRAP_HEIGHT / (down + Math.max(...sizes.map((e) => e.height))), 1);
    };
    // Tallest first, so a tie keeps the fewest runs.
    const heights = [...candidates].sort((a, b) => b - a);
    const whole = scaleAt(heights[0]);
    let [best, bestScale] = [heights[0], whole];
    for (const height of heights.slice(1)) {
        const scale = scaleAt(height);
        if (scale > bestScale + 1e-12)
            [best, bestScale] = [height, scale];
    }
    return bestScale >= whole * WRAP_GAIN ? best : heights[0];
}
/**
 * Lay one column out from `x0`, `y0`, wrapped at `height`: each run of trees a column of its own,
 * left to right; in a run, each file a row, as tall as its box, the rows of a tree INDENTED_ROW_GAP
 * apart and the trees TREE_GAP apart; each file INDENT right of the one it is drawn under. Answers
 * the right edge of the last run, the rightmost, or `x0` for none.
 */
function placeIndented(column, x0, y0, height) {
    let x = x0;
    let right = x0;
    for (const run of wrap(column, height)) {
        let y = y0;
        let width = 0;
        run.forEach((tree, t) => {
            if (t > 0)
                y += TREE_GAP;
            tree.forEach((n, i) => {
                const placed = column.nodes.get(n.id);
                if (i > 0)
                    y += INDENTED_ROW_GAP;
                placed.x = x + n.depth * INDENT;
                placed.y = y;
                y += placed.height;
                placed.rowBottom = y;
                width = Math.max(width, n.depth * INDENT + placed.width);
            });
        });
        right = x + width;
        x = right + WRAP_GAP;
    }
    return right;
}
// --- Both -------------------------------------------------------------------------------
// The widest of some boxes, no narrower than the least a box is.
const widestOf = (ns) => ns.reduce((w, n) => Math.max(w, n.width), MIN_BOX_WIDTH);
/** The gap between the columns for `links` data links: a lane each, LINK_LANE apart over 60% of it. */
function columnGap(links) {
    return clamp(Math.ceil((links * LINK_LANE) / 0.6), MIN_COLUMN_GAP, MAX_COLUMN_GAP);
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
 * The tree layout's columns: each column's trees top-down (placeColumn), the models on the left,
 * the data files right of them `gap` away, the MAT-files under the dictionaries. Answers the
 * middle of the gap.
 */
function placeTrees(nodes, kindOf, gap) {
    const models = nodes.filter((n) => n.box.kind === 'model');
    const sldds = nodes.filter((n) => n.box.kind !== 'model' && n.box.kind !== 'mat');
    const mats = nodes.filter((n) => n.box.kind === 'mat');
    placeColumn(models, kindOf('model-ref'), PADDING, PADDING, MODEL_COLUMNS, widestOf(models));
    const leftRight = models.reduce((r, n) => Math.max(r, n.x + n.width), 0);
    const rightX = models.length > 0 ? leftRight + gap : PADDING;
    // The data files' rows wrap at the width of both kinds' widest box, so the MAT-files' rows are as
    // wide as the dictionaries'.
    const dataWidest = widestOf([...sldds, ...mats]);
    const slddBottom = placeColumn(sldds, kindOf('sldd-ref'), rightX, PADDING, DATA_COLUMNS, dataWidest);
    // The MAT-files under the dictionaries, each a tree of one, wrapped as they are.
    placeColumn(mats, [], rightX, sldds.length > 0 ? slddBottom + ROW_GAP : PADDING, DATA_COLUMNS, dataWidest);
    return models.length > 0 ? (leftRight + rightX) / 2 : rightX - gap / 2;
}
/**
 * The indented layout's columns: the models' trees, and the dictionaries' then each MAT-file a tree
 * of one, each column wrapped at the one height (wrapHeight), the data files `gap` right of the
 * models. A reference that is not the one a file is drawn under takes a lane round the outside of
 * its column: the models' on their left, the data files' on their right, where no other edge runs.
 * Answers the middle of the gap, and those lanes by edge.
 */
function placeIndentedColumns(nodes, kindOf, gap) {
    const byId = new Map(nodes.map((n) => [n.box.id, n]));
    const idsOf = (test) => nodes.filter((n) => test(n.box.kind)).map((n) => n.box.id);
    const models = { trees: indentedTrees(idsOf((k) => k === 'model'), kindOf('model-ref')), nodes: byId };
    const data = {
        trees: [
            ...indentedTrees(idsOf((k) => k !== 'model' && k !== 'mat'), kindOf('sldd-ref')),
            ...idsOf((k) => k === 'mat').map((id) => [{ id, depth: 0, parent: null }]),
        ],
        nodes: byId,
    };
    const parentOf = new Map([...models.trees, ...data.trees].flat().map((n) => [n.id, n.parent]));
    const offTree = (kind) => kindOf(kind).filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to && parentOf.get(e.to) !== e.from);
    const leftLanes = offTree('model-ref');
    const rightLanes = offTree('sldd-ref');
    const room = (n) => (n > 0 ? LANE_PAD + (n - 1) * LANE_STEP : 0);
    const columns = [models, data].filter((c) => c.trees.length > 0);
    const across = 2 * PADDING + room(leftLanes.length) + room(rightLanes.length) + (columns.length > 1 ? gap : 0);
    const height = wrapHeight(columns, across, 2 * PADDING);
    const modelsX = PADDING + room(leftLanes.length);
    const leftRight = placeIndented(models, modelsX, PADDING, height);
    const rightX = models.trees.length > 0 ? leftRight + gap : PADDING;
    const dataRight = placeIndented(data, rightX, PADDING, height);
    const lanes = new Map();
    leftLanes.forEach((e, k) => lanes.set(e.id, { x: modelsX - LANE_PAD - k * LANE_STEP, side: 'left' }));
    rightLanes.forEach((e, k) => lanes.set(e.id, { x: dataRight + LANE_PAD + k * LANE_STEP, side: 'right' }));
    return { gapCenter: models.trees.length > 0 ? (leftRight + rightX) / 2 : rightX - gap / 2, lanes };
}
/**
 * The layout of `graph` with the boxes `expanded` names open: each shows its items, and each other
 * box the items of its own those reach (shownItems), in the `style` given ('tree', the default, or
 * 'indented'). Pure: the same graph, open boxes and style give the same layout.
 */
export function layoutGraph(graph, expanded, style = 'tree') {
    if (graph.boxes.length === 0)
        return { boxes: [], edges: [], width: 0, height: 0 };
    const shown = shownItems(graph, expanded);
    const nodes = graph.boxes.map((box) => {
        const items = box.items.filter((i) => shown.has(i.id));
        return { box, items, width: boxWidth(box), height: boxHeight(items), x: 0, y: 0, rowBottom: 0 };
    });
    // The left column, then the right one beside it (at the left edge when there are no models), the
    // gap between them as wide as the data links' lanes need. Decided by the graph, not by what shows,
    // so opening a box never moves the data files sideways.
    const kindOf = (kind) => graph.edges.filter((e) => e.kind === kind);
    const gap = columnGap(kindOf('data-link').length);
    const indented = style === 'indented' ? placeIndentedColumns(nodes, kindOf, gap) : null;
    const gapCenter = indented ? indented.gapCenter : placeTrees(nodes, kindOf, gap);
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
        gapCenter,
        gap,
        lanes: indented?.lanes ?? null,
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
 * The routes, in the order given. Each kind as the prototype routed it:
 *
 *   - a reference (model-ref, sldd-ref), in the tree layout, leaves the bottom middle of the
 *     referrer and reaches the top middle of what it references, turning in the gap over the
 *     target's row; one back up the tree leaves the top and reaches the bottom, and one across a row
 *     passes under the row. In the indented layout, one to a file drawn under its referrer leaves the
 *     referrer's bottom near its left edge, runs down and reaches the file's left side by its label,
 *     as a file tree's lines do; any other leaves its side and reaches the file's on a lane of its
 *     own round the outside of the column;
 *   - a data-link leaves its model's side and reaches its file's, on a lane of its own in the gap
 *     between the columns, at a port spread along each box's side so that two edges of one box do
 *     not leave at one point;
 *   - a param-usage likewise from the block's right to the variable's left, the edges of one item
 *     spread along it;
 *   - a ws-usage from the block's right to the variable's right, on a lane in the box's own margin.
 */
function routeEdges(edges, at) {
    const { rects, rowBottom, boxOf, gapCenter, gap, lanes: outside } = at;
    const rect = (id) => rects.get(id);
    const byId = new Map(edges.map((e) => [e.id, e]));
    const of = (...kinds) => edges.filter((e) => kinds.includes(e.kind));
    const links = of('data-link');
    const params = of('param-usage');
    const items = of('param-usage', 'ws-usage');
    // A lane in the gap for each cross-column edge: the data links over 60% of it, the usages over half.
    const lane = new Map();
    const lanes = (list, most, share) => spread(list.length, Math.min(most, (gap * share) / Math.max(list.length, 1))).forEach((o, i) => lane.set(list[i].id, gapCenter + o));
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
    // The prototype's stagger of the links whose boxes start on one row, so their level runs do not
    // coincide.
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
                if (outside)
                    return { id: e.id, points: reference(s, t, outside.get(e.id)) };
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
// Where a reference reaches a box, and leaves one by its side: by its label, the middle of a closed
// box and of an open one's header.
const headY = (r) => r.y + (r.height === BOX_HEADER ? BOX_HEADER : OPEN_HEADER) / 2;
/**
 * A reference's route from `s` to `t` in the indented layout. Along the tree (no `lane`): down from
 * `s`'s bottom, TRUNK in from its left edge, to the level of `t`'s label, and right to `t`'s left
 * side, which is INDENT in from `s`'s. Round the outside: from the side of `s` to the lane, along
 * it, and to the same side of `t`, each at its label.
 */
function reference(s, t, lane) {
    if (!lane) {
        const x = s.x + TRUNK;
        return route([{ x, y: bottom(s) }, { x, y: headY(t) }, { x: t.x, y: headY(t) }]);
    }
    const [sx, tx] = lane.side === 'left' ? [s.x, t.x] : [right(s), right(t)];
    return route([{ x: sx, y: headY(s) }, { x: lane.x, y: headY(s) }, { x: lane.x, y: headY(t) }, { x: tx, y: headY(t) }]);
}
