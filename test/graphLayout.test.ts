// Copyright 2026 The MathWorks, Inc.
//
// Where the relationship graph's boxes, items and edges are drawn (src/model/graph/layout.ts), a
// port of the prototype's two-column layout: models on the left as a tree of their references,
// dictionaries on the right as a tree of theirs, MAT-files under them, and orthogonal edges through
// the gap between the two; and the same columns as indented trees, the 'indented' layout.
//
// What is pinned is what a reader relies on, as invariants rather than pixels: no box over another
// (the prototype placed rows by a collapsed box's height, so an open box covered the row under it),
// every item inside its box and clear of the others, every edge starting
// on the thing it leaves and ending on the thing it reaches, every segment horizontal or vertical,
// and the same graph laid out the same way twice. They are checked, in both layouts, over the
// fixtures' graphs and over generated ones big enough to have every shape: reference trees with
// shared children and cycles, ghosts, open and closed boxes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildRelationshipGraph } from '../src/model/graph/relationshipGraph.js';
import type { GraphBox, GraphEdge, GraphEdgeKind, GraphItem, RelationshipGraph } from '../src/model/graph/graphTypes.js';
import { BOX_HEADER, layoutGraph, type GraphLayout, type GraphLayoutStyle, type GraphRect } from '../src/model/graph/layout.js';
import type { RawSource } from '../src/model/usage/usageCells.js';

const ROOT = process.cwd();
function file(dir: string, name: string): RawSource {
  const b = readFileSync(join(ROOT, dir, name));
  return { uriString: `mem:///w/${name}`, path: `/w/${name}`, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
}

const CASEREFS = 'test-integration/fixtures/caserefs';
const FIXTURES = 'test/fixtures';
const caseRefs = (): RelationshipGraph =>
  buildRelationshipGraph(['caseRefs.slx', 'CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd', 'CaseBp.mat'].map((n) => file(CASEREFS, n)));
const shadowWs = (): RelationshipGraph =>
  buildRelationshipGraph([file(FIXTURES, 'shadow_ws.slx'), file(FIXTURES, 'params.sldd'), file(FIXTURES, 'model_with_refs.slx')]);

const STYLES: readonly GraphLayoutStyle[] = ['tree', 'indented'];
const withItems = (g: RelationshipGraph): Set<string> => new Set(g.boxes.filter((b) => b.items.length > 0).map((b) => b.id));
const right = (r: GraphRect): number => r.x + r.width;
const bottom = (r: GraphRect): number => r.y + r.height;
const overlap = (a: GraphRect, b: GraphRect): boolean =>
  a.x < right(b) && b.x < right(a) && a.y < bottom(b) && b.y < bottom(a);
const inside = (inner: GraphRect, outer: GraphRect): boolean =>
  inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);
const EPS = 1e-6;
const between = (v: number, lo: number, hi: number): boolean => v >= lo - EPS && v <= hi + EPS;
const onBoundary = (p: { x: number; y: number }, r: GraphRect): boolean =>
  ((Math.abs(p.x - r.x) < EPS || Math.abs(p.x - right(r)) < EPS) && between(p.y, r.y, bottom(r))) ||
  ((Math.abs(p.y - r.y) < EPS || Math.abs(p.y - bottom(r)) < EPS) && between(p.x, r.x, right(r)));

/**
 * The items each box shows, as the prototype showed them: every item of an open box; of any other box, those a
 * usage edge joins to an item of an open box (a dictionary shows the variables an open model's
 * blocks read, and a model the blocks that read an open dictionary's variables).
 */
function shownBy(g: RelationshipGraph, expanded: ReadonlySet<string>): Set<string> {
  const boxOf = new Map(g.boxes.flatMap((b) => b.items.map((i) => [i.id, b.id] as const)));
  const shown = new Set(g.boxes.filter((b) => expanded.has(b.id)).flatMap((b) => b.items.map((i) => i.id)));
  for (const e of g.edges) {
    const [from, to] = [boxOf.get(e.from), boxOf.get(e.to)];
    if (!from || !to || from === to) continue;
    if (expanded.has(from)) shown.add(e.to);
    if (expanded.has(to)) shown.add(e.from);
  }
  return shown;
}

/** Every invariant at once, with the edge or box at fault named. */
function checkInvariants(g: RelationshipGraph, expanded: ReadonlySet<string>, layout: GraphLayout): void {
  const boxes = layout.boxes;
  expect(boxes.map((b) => b.id)).toEqual(g.boxes.map((b) => b.id));
  for (let i = 0; i < boxes.length; i++) {
    expect(boxes[i]!.width, boxes[i]!.id).toBeGreaterThan(0);
    for (let j = i + 1; j < boxes.length; j++) {
      expect(overlap(boxes[i]!, boxes[j]!), `${boxes[i]!.id} over ${boxes[j]!.id}`).toBe(false);
    }
  }
  const rects = new Map<string, GraphRect>();
  const shown = shownBy(g, expanded);
  for (const b of boxes) {
    rects.set(b.id, b);
    const box = g.boxes.find((x) => x.id === b.id)!;
    // In the box's own order, whichever of them show.
    expect(b.items.map((i) => i.id), b.id).toEqual(box.items.filter((i) => shown.has(i.id)).map((i) => i.id));
    if (b.items.length === 0) expect(b.height, b.id).toBe(BOX_HEADER);
    for (let i = 0; i < b.items.length; i++) {
      expect(inside(b.items[i]!, b), `${b.items[i]!.id} outside ${b.id}`).toBe(true);
      for (let j = i + 1; j < b.items.length; j++) expect(overlap(b.items[i]!, b.items[j]!)).toBe(false);
      rects.set(b.items[i]!.id, b.items[i]!);
    }
    expect(right(b)).toBeLessThanOrEqual(layout.width);
    expect(bottom(b)).toBeLessThanOrEqual(layout.height);
  }
  // An edge is drawn exactly when both of its ends are.
  const drawn = g.edges.filter((e) => rects.has(e.from) && rects.has(e.to)).map((e) => e.id);
  expect(layout.edges.map((e) => e.id)).toEqual(drawn);
  for (const e of layout.edges) {
    const edge = g.edges.find((x) => x.id === e.id)!;
    expect(e.points.length, e.id).toBeGreaterThanOrEqual(2);
    expect(onBoundary(e.points[0]!, rects.get(edge.from)!), `${e.id} starts off its box`).toBe(true);
    expect(onBoundary(e.points[e.points.length - 1]!, rects.get(edge.to)!), `${e.id} ends off its box`).toBe(true);
    for (let i = 1; i < e.points.length; i++) {
      const [a, b] = [e.points[i - 1]!, e.points[i]!];
      expect(Math.abs(a.x - b.x) < EPS || Math.abs(a.y - b.y) < EPS, `${e.id} segment ${i} is not orthogonal`).toBe(true);
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y), `${e.id} segment ${i} is empty`).toBeGreaterThan(0);
      expect(between(b.x, 0, layout.width) && between(b.y, 0, layout.height), `${e.id} leaves the canvas`).toBe(true);
    }
  }
}

describe('the fixtures', () => {
  for (const [name, graph] of [['caserefs', caseRefs], ['shadow_ws', shadowWs]] as const) {
    it(`${name}: holds every invariant, open and closed, in both layouts`, () => {
      const g = graph();
      for (const style of STYLES) {
        for (const expanded of [withItems(g), new Set<string>()]) checkInvariants(g, expanded, layoutGraph(g, expanded, style));
      }
    });
  }

  it('puts the models on the left and the data files on the right, the MAT-files under the dictionaries', () => {
    const g = caseRefs();
    const layout = layoutGraph(g, withItems(g));
    const kind = new Map(g.boxes.map((b) => [b.id, b.kind]));
    const models = layout.boxes.filter((b) => kind.get(b.id) === 'model');
    const data = layout.boxes.filter((b) => kind.get(b.id) !== 'model');
    const slddBottom = Math.max(...layout.boxes.filter((b) => kind.get(b.id) === 'sldd').map(bottom));
    for (const m of models) for (const d of data) expect(right(m)).toBeLessThan(d.x);
    for (const mat of layout.boxes.filter((b) => kind.get(b.id) === 'mat')) expect(mat.y).toBeGreaterThan(slddBottom);
  });

  it('draws a dictionary a dictionary references under it, as a tree', () => {
    const g = caseRefs();
    const layout = layoutGraph(g, new Set());
    const at = (label: string) => layout.boxes.find((b) => b.id === g.boxes.find((x) => x.label === label)!.id)!;
    expect(at('chained.sldd').y).toBeGreaterThan(bottom(at('CaseParams.sldd')));
    // The edge between them leaves the bottom of one and reaches the top of the other.
    const ref = layout.edges.find((e) => g.edges.find((x) => x.id === e.id)!.kind === 'sldd-ref')!;
    expect(ref.points[0]!.y).toBe(bottom(at('CaseParams.sldd')));
    expect(ref.points[ref.points.length - 1]!.y).toBe(at('chained.sldd').y);
  });

  it('draws an open box taller, with its items, and leaves out the edges to items it does not show', () => {
    const g = caseRefs();
    const open = layoutGraph(g, withItems(g));
    const closed = layoutGraph(g, new Set());
    const model = g.boxes[0]!.id;
    expect(open.boxes[0]!.height).toBeGreaterThan(closed.boxes[0]!.height);
    expect(open.boxes[0]!.items).toHaveLength(4);
    const kinds = (l: GraphLayout) => l.edges.map((e) => g.edges.find((x) => x.id === e.id)!.kind);
    expect(kinds(open).filter((k) => k === 'param-usage')).toHaveLength(4);
    expect(kinds(closed).filter((k) => k === 'param-usage')).toHaveLength(0);
    // The model open and the data files closed: its blocks show, and in each data file the
    // variables they read and no others, so every usage edge out of the model is drawn.
    const one = layoutGraph(g, new Set([model]));
    expect(one.boxes.map((b) => b.items.length)).toEqual([4, 1, 1, 1, 1]);
    expect(kinds(one).filter((k) => k === 'param-usage')).toHaveLength(4);
    checkInvariants(g, new Set([model]), one);
  });

  it("shows in a closed box only what an open box's edges reach, and the edges between them alone", () => {
    // usageorder: two models read one dictionary. The dictionary open shows its variable and, in
    // each model, the blocks that read it; ctrlA open shows its blocks, the variable they read, and
    // not plantB's block, which reads it too but is in a closed box reached from no open one.
    const g = buildRelationshipGraph(['ctrlA.slx', 'plantB.slx', 'sharedParams.sldd'].map((n) => file('test-integration/fixtures/usageorder', n)));
    const [ctrlA, plantB, shared] = g.boxes.map((b) => b.id);
    const items = (l: GraphLayout) => l.boxes.map((b) => b.items.length);
    const dict = layoutGraph(g, new Set([shared!]));
    expect(items(dict)).toEqual([2, 1, 1]);
    expect(dict.edges.filter((e) => g.edges.find((x) => x.id === e.id)!.kind === 'param-usage')).toHaveLength(3);
    const model = layoutGraph(g, new Set([ctrlA!]));
    expect(items(model)).toEqual([2, 0, 1]);
    expect(model.edges.filter((e) => g.edges.find((x) => x.id === e.id)!.kind === 'param-usage')).toHaveLength(2);
    checkInvariants(g, new Set([shared!]), dict);
    checkInvariants(g, new Set([ctrlA!]), model);
    checkInvariants(g, new Set([plantB!, shared!]), layoutGraph(g, new Set([plantB!, shared!])));
  });

  it("routes a block's edge to its own workspace inside its box, on the items' right", () => {
    const g = shadowWs();
    const layout = layoutGraph(g, withItems(g));
    const model = layout.boxes.find((b) => b.id === g.boxes.find((x) => x.label === 'shadow_ws.slx')!.id)!;
    const ws = layout.edges.find((e) => g.edges.find((x) => x.id === e.id)!.kind === 'ws-usage')!;
    const itemsRight = Math.max(...model.items.map(right));
    for (const p of ws.points) expect(inside({ x: p.x, y: p.y, width: 0, height: 0 }, model)).toBe(true);
    expect(Math.max(...ws.points.map((p) => p.x))).toBeGreaterThan(itemsRight);
    // A divider between the blocks and the workspace variables, in the gap between the two groups.
    const [, wsGain, kp] = model.items;
    expect(model.divider).toBeGreaterThan(bottom(wsGain!));
    expect(model.divider).toBeLessThan(kp!.y);
  });

  it('lays nothing out for nothing', () => {
    expect(layoutGraph({ boxes: [], edges: [] }, new Set())).toEqual({ boxes: [], edges: [], width: 0, height: 0 });
  });

  it('lays the same graph out the same way, and the tree layout when none is named', () => {
    const g = caseRefs();
    for (const style of STYLES) expect(layoutGraph(g, withItems(g), style)).toEqual(layoutGraph(caseRefs(), withItems(g), style));
    expect(layoutGraph(g, withItems(g))).toEqual(layoutGraph(g, withItems(g), 'tree'));
    expect(layoutGraph(g, withItems(g), 'indented')).not.toEqual(layoutGraph(g, withItems(g)));
  });
});

describe('many files nothing references', () => {
  // The gallery's page of ten open files that reference nothing: every model a root, all of them in
  // one row, and a fit to the window shrank the whole row to boxes too small to read. Trees now sit
  // side by side only up to a few columns, then start a row of their own under the last, models on
  // the left and data files on the right as ever.
  const box = (kind: GraphBox['kind'], n: number, label = `${kind}${n}.${kind === 'model' ? 'slx' : kind}`): GraphBox => ({
    id: `mem:///g/${label}`,
    uri: `mem:///g/${label}`,
    kind,
    label,
    ghost: false,
    items: [],
  });
  const lonely = (): RelationshipGraph => ({
    boxes: [
      ...Array.from({ length: 10 }, (_, i) => box('model', i)),
      ...Array.from({ length: 7 }, (_, i) => box('sldd', i)),
      ...Array.from({ length: 3 }, (_, i) => box('mat', i)),
    ],
    edges: [],
  });
  // The boxes of a kind, row by row (top to bottom), each row left to right.
  const rows = (g: RelationshipGraph, l: GraphLayout, kind: GraphBox['kind']): string[][] => {
    const ofKind = l.boxes.filter((b) => g.boxes.find((x) => x.id === b.id)!.kind === kind);
    const ys = [...new Set(ofKind.map((b) => b.y))].sort((a, b) => a - b);
    return ys.map((y) => ofKind.filter((b) => b.y === y).sort((a, b) => a.x - b.x).map((b) => g.boxes.find((x) => x.id === b.id)!.label));
  };

  it('wraps unrelated models into rows of three, and data files into rows of two, in the order given', () => {
    const g = lonely();
    const l = layoutGraph(g, new Set());
    expect(rows(g, l, 'model')).toEqual([
      ['model0.slx', 'model1.slx', 'model2.slx'],
      ['model3.slx', 'model4.slx', 'model5.slx'],
      ['model6.slx', 'model7.slx', 'model8.slx'],
      ['model9.slx'],
    ]);
    expect(rows(g, l, 'sldd')).toEqual([['sldd0.sldd', 'sldd1.sldd'], ['sldd2.sldd', 'sldd3.sldd'], ['sldd4.sldd', 'sldd5.sldd'], ['sldd6.sldd']]);
    expect(rows(g, l, 'mat')).toEqual([['mat0.mat', 'mat1.mat'], ['mat2.mat']]);
    checkInvariants(g, new Set(), l);
  });

  it('keeps the two columns: every model left of every data file, the MAT-files under the dictionaries', () => {
    const g = lonely();
    const l = layoutGraph(g, new Set());
    const kind = new Map(g.boxes.map((b) => [b.id, b.kind]));
    const of = (k: string) => l.boxes.filter((b) => kind.get(b.id) === k);
    const modelsRight = Math.max(...of('model').map(right));
    for (const d of [...of('sldd'), ...of('mat')]) expect(d.x).toBeGreaterThan(modelsRight);
    expect(Math.min(...of('mat').map((b) => b.y))).toBeGreaterThan(Math.max(...of('sldd').map(bottom)));
    // Wider than tall no longer by a row's worth of boxes: three models and two data files across.
    expect(l.width).toBeLessThan(l.height * 3);
  });

  it('wraps between trees, never inside one: a model referencing five keeps them in one row', () => {
    const g = lonely();
    const [a, b, c, d, e, f, h] = g.boxes.map((x) => x.id);
    g.edges = [b, c, d, e, f].map((to) => ({ id: `${a}>${to}`, kind: 'model-ref' as const, from: a!, to: to! }));
    const l = layoutGraph(g, new Set());
    const at = (id: string) => l.boxes.find((x) => x.id === id)!;
    expect(new Set([b, c, d, e, f].map((id) => at(id!).y)).size).toBe(1);
    // The next tree starts a row of its own, under the whole of the wide one.
    expect(at(h!).y).toBeGreaterThan(bottom(at(b!)));
    checkInvariants(g, new Set(), l);
  });
});

describe('the reference trees', () => {
  // Boxes and reference edges by hand: `tree('model', [['A', 'B'], ...])`.
  const tree = (kind: 'model' | 'sldd', refs: [string, string][], names: string[]): RelationshipGraph => ({
    boxes: names.map((n) => ({ id: n, uri: n, kind, label: n, ghost: false, items: [] })),
    edges: refs.map(([from, to]) => ({ id: `${from}>${to}`, kind: kind === 'model' ? 'model-ref' : 'sldd-ref', from, to })),
  });
  const rects = (g: RelationshipGraph) => new Map(layoutGraph(g, new Set()).boxes.map((b) => [b.id, b]));

  it('puts what a file references in the row under it, side by side, the referrer over them', () => {
    const r = rects(tree('model', [['A', 'B'], ['A', 'C'], ['B', 'D']], ['A', 'B', 'C', 'D']));
    expect(r.get('B')!.y).toBe(r.get('C')!.y);
    expect(r.get('B')!.y).toBeGreaterThan(bottom(r.get('A')!));
    expect(r.get('D')!.y).toBeGreaterThan(bottom(r.get('B')!));
    expect(right(r.get('B')!)).toBeLessThan(r.get('C')!.x);
    // Centred over its children, as the prototype did.
    const mid = (b: GraphRect) => b.x + b.width / 2;
    expect(mid(r.get('A')!)).toBeCloseTo((mid(r.get('B')!) + mid(r.get('C')!)) / 2, 6);
  });

  it('draws a file two files reference once, under the first, and a cycle from the first file given', () => {
    const shared = rects(tree('sldd', [['A', 'C'], ['B', 'C']], ['A', 'B', 'C']));
    expect(shared.get('A')!.y).toBe(shared.get('B')!.y);
    expect(shared.get('C')!.y).toBeGreaterThan(bottom(shared.get('A')!));
    const cycle = rects(tree('model', [['A', 'B'], ['B', 'A']], ['A', 'B']));
    expect(cycle.get('B')!.y).toBeGreaterThan(bottom(cycle.get('A')!));
  });

  it('gives each file the width it needs, its children side by side a sibling gap apart, not slots of the widest box', () => {
    // The prototype gave every file a slot as wide as the column's widest box: one long name
    // spread every other file of the column out.
    const g = tree('model', [['A', 'B'], ['A', 'C']], ['A', 'B', 'C', 'AModelWithAVeryLongNameIndeed.slx']);
    const r = rects(g);
    expect(r.get('C')!.x - right(r.get('B')!)).toBeCloseTo(30, 6);
    expect(r.get('AModelWithAVeryLongNameIndeed.slx')!.width).toBeGreaterThan(2 * r.get('B')!.width);
  });

  it('starts the dictionaries at the left edge when there are no models', () => {
    const r = layoutGraph(tree('sldd', [], ['A']), new Set());
    expect(r.boxes[0]!.x).toBeLessThan(100);
  });

  it('gives an open box the row it needs, so the row under it starts below it', () => {
    // The prototype placed rows at a closed box's height, and an open box covered the row under it.
    const g = tree('model', [['A', 'B']], ['A', 'B']);
    g.boxes[0]!.items = Array.from({ length: 6 }, (_, i) => ({ id: `A${i}`, boxId: 'A', name: `b${i}`, revealName: `${i}`, iconId: 'block', group: 'data' as const }));
    const r = new Map(layoutGraph(g, new Set(['A'])).boxes.map((b) => [b.id, b]));
    expect(r.get('B')!.y).toBeGreaterThan(bottom(r.get('A')!));
  });
});

describe('the gap between the columns', () => {
  // As wide as the data links' lanes need, 8px apart over 60% of it, between 120 and 300: the
  // prototype's 300 was room for 22 links, and with fifteen files it pushed the data files off a
  // 1440 by 900 window's graph.
  const linked = (links: number): RelationshipGraph => ({
    boxes: [
      { id: 'm', uri: 'm', kind: 'model', label: 'm.slx', ghost: false, items: [] },
      ...Array.from({ length: links }, (_, i) => ({ id: `d${i}`, uri: `d${i}`, kind: 'sldd' as const, label: `d${i}.sldd`, ghost: false, items: [] })),
    ],
    edges: Array.from({ length: links }, (_, i) => ({ id: `m>d${i}`, kind: 'data-link' as const, from: 'm', to: `d${i}` })),
  });
  const gapOf = (g: RelationshipGraph, expanded = new Set<string>(), style: GraphLayoutStyle = 'tree'): number => {
    const l = layoutGraph(g, expanded, style);
    const model = l.boxes.find((b) => b.id === 'm')!;
    return Math.min(...l.boxes.filter((b) => b.id !== 'm').map((b) => b.x)) - right(model);
  };

  it('is as wide as the lanes of its data links need, within bounds, in both layouts', () => {
    for (const style of STYLES) {
      expect(gapOf(linked(2), new Set(), style)).toBe(120);
      expect(gapOf(linked(13), new Set(), style)).toBe(Math.ceil((13 * 8) / 0.6));
      expect(gapOf(linked(40), new Set(), style)).toBe(300);
    }
  });

  it('stays as wide whichever boxes are open, so opening one never moves the data files sideways', () => {
    const g = caseRefs();
    for (const style of STYLES) {
      const closed = layoutGraph(g, new Set(), style);
      const open = layoutGraph(g, withItems(g), style);
      expect(open.boxes.map((b) => b.x)).toEqual(closed.boxes.map((b) => b.x));
    }
  });
});

describe('the indented layout: many files', () => {
  // The gallery's page of open files that reference nothing, and a folder of sixty: every file a
  // tree of its own. A column that fits a window at full size is one column, top to bottom in the
  // order given; a column too long for that is dealt into columns of its own, side by side, whole
  // trees each.
  const box = (kind: GraphBox['kind'], n: number, label = `${kind}${n}.${kind === 'model' ? 'slx' : kind}`): GraphBox => ({
    id: `mem:///g/${label}`,
    uri: `mem:///g/${label}`,
    kind,
    label,
    ghost: false,
    items: [],
  });
  const lonely = (models = 10, sldds = 7, mats = 3): RelationshipGraph => ({
    boxes: [
      ...Array.from({ length: models }, (_, i) => box('model', i)),
      ...Array.from({ length: sldds }, (_, i) => box('sldd', i)),
      ...Array.from({ length: mats }, (_, i) => box('mat', i)),
    ],
    edges: [],
  });
  // The boxes of some kinds, column by column (left to right), each top to bottom.
  const columns = (g: RelationshipGraph, l: GraphLayout, kinds: GraphBox['kind'][]): string[][] => {
    const of = l.boxes.filter((b) => kinds.includes(g.boxes.find((x) => x.id === b.id)!.kind));
    const xs = [...new Set(of.map((b) => b.x))].sort((a, b) => a - b);
    return xs.map((x) => of.filter((b) => b.x === x).sort((a, b) => a.y - b.y).map((b) => g.boxes.find((x) => x.id === b.id)!.label));
  };
  const kindOf = (g: RelationshipGraph) => new Map(g.boxes.map((b) => [b.id, b.kind]));

  it('draws as many as fit a window at full size in one column of each kind, in the order given, the MAT-files under the dictionaries', () => {
    const g = lonely(6, 4, 2);
    const l = layoutGraph(g, new Set(), 'indented');
    expect(columns(g, l, ['model'])).toEqual([Array.from({ length: 6 }, (_, i) => `model${i}.slx`)]);
    expect(columns(g, l, ['sldd', 'mat'])).toEqual([['sldd0.sldd', 'sldd1.sldd', 'sldd2.sldd', 'sldd3.sldd', 'mat0.mat', 'mat1.mat']]);
    checkInvariants(g, new Set(), l);
  });

  it('deals a long column into columns side by side, in the order given, as near the shape of a window as it can', () => {
    const g = lonely(30, 25, 5);
    const l = layoutGraph(g, new Set(), 'indented');
    const models = columns(g, l, ['model']);
    expect(models.length).toBeGreaterThan(1);
    expect(models.flat()).toEqual(Array.from({ length: 30 }, (_, i) => `model${i}.slx`));
    expect(columns(g, l, ['sldd', 'mat']).length).toBeGreaterThan(1);
    // Neither a tall strip nor a wide one.
    expect(l.width).toBeGreaterThan(l.height);
    expect(l.width).toBeLessThan(l.height * 3);
    checkInvariants(g, new Set(), l);
  });

  it('keeps the two columns: every model left of every data file', () => {
    for (const g of [lonely(), lonely(30, 25, 5)]) {
      const l = layoutGraph(g, new Set(), 'indented');
      const kind = kindOf(g);
      const of = (k: string) => l.boxes.filter((b) => kind.get(b.id) === k);
      const modelsRight = Math.max(...of('model').map(right));
      for (const d of [...of('sldd'), ...of('mat')]) expect(d.x).toBeGreaterThan(modelsRight);
    }
  });

  it('deals whole trees, never the files of one: a model referencing five keeps them under it', () => {
    const g = lonely(30, 25, 5);
    const [a, b, c, d, e, f] = g.boxes.map((x) => x.id);
    g.edges = [b, c, d, e, f].map((to) => ({ id: `${a}>${to}`, kind: 'model-ref' as const, from: a!, to: to! }));
    const l = layoutGraph(g, new Set(), 'indented');
    const at = (id: string) => l.boxes.find((x) => x.id === id)!;
    for (const id of [b, c, d, e, f]) {
      expect(at(id!).x).toBe(at(a!).x + 24);
      expect(at(id!).y).toBeGreaterThan(bottom(at(a!)));
    }
    checkInvariants(g, new Set(), l);
  });

  it('wraps by the boxes closed, so a box opened moves no box sideways, only the rows under it down', () => {
    const g = lonely(30, 25, 5);
    for (const b of g.boxes.filter((x) => x.kind === 'model').slice(0, 6)) {
      b.items = Array.from({ length: 12 }, (_, i) => ({ id: `${b.id}#${i}`, boxId: b.id, name: `Block${i}`, revealName: `${i}`, iconId: 'block', group: 'data' as const }));
    }
    const open = new Set(g.boxes.filter((b) => b.items.length > 0).map((b) => b.id));
    const closed = layoutGraph(g, new Set(), 'indented');
    const opened = layoutGraph(g, open, 'indented');
    expect(opened.boxes.map((b) => b.x)).toEqual(closed.boxes.map((b) => b.x));
    for (let i = 0; i < closed.boxes.length; i++) expect(opened.boxes[i]!.y).toBeGreaterThanOrEqual(closed.boxes[i]!.y);
    checkInvariants(g, open, opened);
  });
});

describe('the indented layout: the reference trees', () => {
  it('draws caserefs\' dictionary a dictionary references under it, a step right, as a tree', () => {
    const g = caseRefs();
    const layout = layoutGraph(g, new Set(), 'indented');
    const at = (label: string) => layout.boxes.find((b) => b.id === g.boxes.find((x) => x.label === label)!.id)!;
    expect(at('chained.sldd').y).toBeGreaterThan(bottom(at('CaseParams.sldd')));
    expect(at('chained.sldd').x).toBeGreaterThan(at('CaseParams.sldd').x);
    // The edge between them leaves the bottom of one, near its left edge, and reaches the left side
    // of the other, as a file tree's line does.
    const ref = layout.edges.find((e) => g.edges.find((x) => x.id === e.id)!.kind === 'sldd-ref')!;
    expect(ref.points[0]!.y).toBe(bottom(at('CaseParams.sldd')));
    expect(ref.points[0]!.x).toBeLessThan(at('chained.sldd').x);
    expect(ref.points[ref.points.length - 1]!.x).toBe(at('chained.sldd').x);
  });

  // Boxes and reference edges by hand: `tree('model', [['A', 'B'], ...])`.
  const tree = (kind: 'model' | 'sldd', refs: [string, string][], names: string[]): RelationshipGraph => ({
    boxes: names.map((n) => ({ id: n, uri: n, kind, label: n, ghost: false, items: [] })),
    edges: refs.map(([from, to]) => ({ id: `${from}>${to}`, kind: kind === 'model' ? 'model-ref' : 'sldd-ref', from, to })),
  });
  const rects = (g: RelationshipGraph) => new Map(layoutGraph(g, new Set(), 'indented').boxes.map((b) => [b.id, b]));

  it('puts what a file references in the rows under it, a step right of it, its own references under each', () => {
    const g = tree('model', [['A', 'B'], ['A', 'C'], ['B', 'D']], ['A', 'B', 'C', 'D']);
    const r = rects(g);
    // A, then B and what B references, then C: a file tree's order.
    const order = ['A', 'B', 'D', 'C'];
    for (let i = 1; i < order.length; i++) expect(r.get(order[i]!)!.y).toBeGreaterThan(bottom(r.get(order[i - 1]!)!));
    expect(r.get('B')!.x).toBe(r.get('A')!.x + 24);
    expect(r.get('C')!.x).toBe(r.get('B')!.x);
    expect(r.get('D')!.x).toBe(r.get('B')!.x + 24);
    // Each edge down the left of its referrer, into the left side of what it references.
    const l = layoutGraph(g, new Set(), 'indented');
    const ac = l.edges.find((e) => e.id === 'A>C')!;
    expect(ac.points[0]).toEqual({ x: r.get('A')!.x + 12, y: bottom(r.get('A')!) });
    expect(ac.points.at(-1)!.x).toBe(r.get('C')!.x);
    expect(ac.points.at(-1)!.y).toBe(r.get('C')!.y + r.get('C')!.height / 2);
    checkInvariants(g, new Set(), l);
  });

  it('draws a file two files reference once, under the first, and the other reference round the column', () => {
    const g = tree('sldd', [['A', 'C'], ['B', 'C']], ['A', 'B', 'C']);
    const shared = rects(g);
    expect(shared.get('C')!.y).toBeGreaterThan(bottom(shared.get('A')!));
    expect(shared.get('B')!.y).toBeGreaterThan(bottom(shared.get('C')!));
    // A dictionary's, round its right, past every box.
    const l = layoutGraph(g, new Set(), 'indented');
    const bc = l.edges.find((e) => e.id === 'B>C')!;
    const outside = Math.max(...l.boxes.map(right));
    expect(Math.max(...bc.points.map((p) => p.x))).toBeGreaterThan(outside);
    expect(bc.points[0]!.x).toBe(right(shared.get('B')!));
    expect(bc.points.at(-1)!.x).toBe(right(shared.get('C')!));
    checkInvariants(g, new Set(), l);
  });

  it("draws a cycle from the first file given, and a model's reference back up it round the left of the models", () => {
    const g = tree('model', [['A', 'B'], ['B', 'A']], ['A', 'B']);
    const cycle = rects(g);
    expect(cycle.get('B')!.y).toBeGreaterThan(bottom(cycle.get('A')!));
    const l = layoutGraph(g, new Set(), 'indented');
    const ba = l.edges.find((e) => e.id === 'B>A')!;
    const inside = Math.min(...l.boxes.map((b) => b.x));
    expect(Math.min(...ba.points.map((p) => p.x))).toBeLessThan(inside);
    expect(Math.min(...ba.points.map((p) => p.x))).toBeGreaterThan(0);
    checkInvariants(g, new Set(), l);
  });

  it('starts the dictionaries at the left edge when there are no models', () => {
    const r = layoutGraph(tree('sldd', [], ['A']), new Set(), 'indented');
    expect(r.boxes[0]!.x).toBeLessThan(100);
  });

  it('gives an open box the row it needs, so the row under it starts below it', () => {
    // The prototype placed rows at a closed box's height, and an open box covered the row under it.
    const g = tree('model', [['A', 'B']], ['A', 'B']);
    g.boxes[0]!.items = Array.from({ length: 6 }, (_, i) => ({ id: `A${i}`, boxId: 'A', name: `b${i}`, revealName: `${i}`, iconId: 'block', group: 'data' as const }));
    const r = new Map(layoutGraph(g, new Set(['A']), 'indented').boxes.map((b) => [b.id, b]));
    expect(r.get('B')!.y).toBeGreaterThan(bottom(r.get('A')!));
  });
});

// --- Generated graphs --------------------------------------------------------------------------

/** A small deterministic generator, so a failing graph is the same graph on the next run. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
}

/**
 * A graph with every shape the builder can produce: models referencing models (shared children and
 * cycles included), dictionaries referencing dictionaries, MAT-files, ghosts, names long enough to
 * reach the widest box, blocks reading variables of several files, and workspace variables.
 */
function generated(seed: number): RelationshipGraph {
  const rand = lcg(seed);
  const pick = <T>(xs: T[]): T => xs[Math.floor(rand() * xs.length)]!;
  const boxes: GraphBox[] = [];
  const edges: GraphEdge[] = [];
  const edge = (kind: GraphEdgeKind, from: string, to: string, label?: string): void => {
    const id = JSON.stringify([kind, from, to]);
    if (from !== to && !edges.some((e) => e.id === id)) edges.push({ id, kind, from, to, ...(label ? { label } : {}) });
  };
  const name = (prefix: string, i: number): string => `${prefix}${i}${'x'.repeat(Math.floor(rand() * 3) ** 3 * 2)}`;
  const counts = { model: 2 + Math.floor(rand() * 7), sldd: 1 + Math.floor(rand() * 6), mat: Math.floor(rand() * 3) };
  for (const kind of ['model', 'sldd', 'mat'] as const) {
    for (let i = 0; i < counts[kind]; i++) {
      const ghost = rand() < 0.15;
      const id = ghost ? JSON.stringify(['ghost', kind, `${kind}${i}`]) : `mem:///g/${kind}${i}`;
      boxes.push({ id, uri: ghost ? '' : id, kind, label: `${name(kind, i)}.${kind}`, ghost, items: [] });
    }
  }
  const of = (kind: string) => boxes.filter((b) => b.kind === kind);
  for (const m of of('model')) {
    for (let k = 0; k < 2; k++) if (rand() < 0.5) edge('model-ref', m.id, pick(of('model')).id);
    for (const d of [...of('sldd'), ...of('mat')]) if (rand() < 0.35) edge('data-link', m.id, d.id);
  }
  for (const d of of('sldd')) if (rand() < 0.5) edge('sldd-ref', d.id, pick(of('sldd')).id);
  const variable = (box: GraphBox, group: 'data' | 'workspace', n: number): GraphItem => {
    const item: GraphItem = { id: JSON.stringify([box.id, group, `v${n}`]), boxId: box.id, name: name('var', n), revealName: `v${n}`, iconId: 'wsDefault', group };
    box.items.push(item);
    return item;
  };
  const data = [...of('sldd'), ...of('mat')].filter((b) => !b.ghost);
  const vars = data.flatMap((b) => Array.from({ length: Math.floor(rand() * 4) }, (_, n) => variable(b, 'data', n)));
  for (const m of of('model').filter((b) => !b.ghost)) {
    const blocks: GraphItem[] = Array.from({ length: Math.floor(rand() * 5) }, (_, n) => {
      const block: GraphItem = { id: JSON.stringify([m.id, 'block', `${n}`]), boxId: m.id, name: name('Block', n), revealName: `${n}`, iconId: 'block', group: 'data' };
      m.items.push(block);
      return block;
    });
    const ws = rand() < 0.5 ? Array.from({ length: 1 + Math.floor(rand() * 3) }, (_, n) => variable(m, 'workspace', n)) : [];
    for (const b of blocks) {
      for (let k = 0; k < 3; k++) {
        if (vars.length > 0 && rand() < 0.6) edge('param-usage', b.id, pick(vars).id, 'Value');
        if (ws.length > 0 && rand() < 0.4) edge('ws-usage', b.id, pick(ws).id, 'Gain');
      }
    }
  }
  return { boxes, edges };
}

describe('generated graphs', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i + 1);

  it.each(seeds)('seed %i holds every invariant, open and closed, in both layouts', (seed) => {
    const g = generated(seed);
    for (const style of STYLES) {
      for (const expanded of [withItems(g), new Set<string>(), new Set(g.boxes.filter((_, i) => i % 2 === 0).map((b) => b.id))]) {
        checkInvariants(g, expanded, layoutGraph(g, expanded, style));
      }
    }
  });

  it('meets cycles, shared children and ghosts among them', () => {
    // So the invariants above are known to have been checked over the shapes that broke the prototype.
    const shapes = { cycle: 0, shared: 0, ghost: 0, workspace: 0 };
    for (const seed of seeds) {
      const g = generated(seed);
      const refs = g.edges.filter((e) => e.kind === 'model-ref' || e.kind === 'sldd-ref');
      if (refs.some((e) => refs.some((f) => f.from === e.to && f.to === e.from))) shapes.cycle++;
      const into = new Map<string, number>();
      for (const e of refs) into.set(e.to, (into.get(e.to) ?? 0) + 1);
      if ([...into.values()].some((n) => n > 1)) shapes.shared++;
      if (g.boxes.some((b) => b.ghost)) shapes.ghost++;
      if (g.edges.some((e) => e.kind === 'ws-usage')) shapes.workspace++;
    }
    for (const [shape, n] of Object.entries(shapes)) expect(n, shape).toBeGreaterThan(3);
  });

  it('is deterministic', () => {
    for (const seed of [3, 17, 42]) {
      const g = generated(seed);
      for (const style of STYLES) expect(layoutGraph(generated(seed), withItems(g), style)).toEqual(layoutGraph(g, withItems(g), style));
    }
  });
});
