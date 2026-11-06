// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-relationship-graph>: the app shell's graph of how the open models, dictionaries and
// MAT-files connect, as the prototype's relationship graph draws it. What it draws comes from the
// model (relationshipGraph.ts builds the graph, layout.ts places it), so what is pinned here is the widget's half: that it draws what the layout
// placed, that a click highlights what the clicked thing reaches and says so, that a double-click
// and Enter ask to open, that a box's toggle asks to show or hide its items and changes nothing
// itself, that a box opened is zoomed to with what it reaches and the rest dimmed, that hovering an
// item traces it and hovering an edge fades the others, and that zoom, pan, fit and reveal move the
// view. Over the caserefs fixture's real graph: a model linked to three dictionaries, one of them
// through another, and a MAT-file.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DexRelationshipGraph,
  defineRelationshipGraph,
  type GraphExpandDetail,
  type GraphOpenDetail,
  type GraphSelectedDetail,
} from '../src/widgets/app-shell/modules/dex-relationship-graph.js';
import { buildRelationshipGraph } from '../src/model/graph/relationshipGraph.js';
import type { RelationshipGraph } from '../src/model/graph/graphTypes.js';
import { layoutGraph } from '../src/model/graph/layout.js';
import { readModuleGraph, runtimeEdges } from './tools/moduleGraph.js';
import { THEME_SETS } from './tools/cssTokens.js';

beforeAll(() => defineRelationshipGraph());
afterEach(() => document.body.replaceChildren());

const ROOT = process.cwd();
const DIR = 'test-integration/fixtures/caserefs';
const NAMES = ['caseRefs.slx', 'CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd', 'CaseBp.mat'];
const graphOf = (names: string[] = NAMES): RelationshipGraph =>
  buildRelationshipGraph(
    names.map((n) => {
      const b = readFileSync(join(ROOT, DIR, n));
      return { uriString: `mem:///w/${n}`, path: `/w/${n}`, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
    }),
  );
const GRAPH = graphOf();
const idOf = (label: string): string => GRAPH.boxes.find((b) => b.label === label)!.id;
// Every box with items, open: the picture the tests about items are drawn over.
const ALL = GRAPH.boxes.filter((b) => b.items.length > 0).map((b) => b.id);
const openAll = (el: DexRelationshipGraph): void => void (el.expanded = ALL);
const itemIdOf = (box: string, name: string): string => GRAPH.boxes.find((b) => b.label === box)!.items.find((i) => i.name === name)!.id;

async function graph(g: RelationshipGraph | null = GRAPH, setup?: (el: DexRelationshipGraph) => void): Promise<DexRelationshipGraph> {
  const el = document.createElement('dex-relationship-graph');
  el.graph = g;
  setup?.(el);
  document.body.append(el);
  await el.updateComplete;
  return el;
}

const sr = (el: DexRelationshipGraph): ShadowRoot => el.shadowRoot!;
const boxEl = (el: DexRelationshipGraph, id: string): HTMLElement =>
  [...sr(el).querySelectorAll<HTMLElement>('.box')].find((b) => b.dataset.id === id)!;
const itemEl = (el: DexRelationshipGraph, id: string): HTMLElement =>
  [...sr(el).querySelectorAll<HTMLElement>('.item')].find((b) => b.dataset.id === id)!;
const labels = (el: DexRelationshipGraph): string[] => [...sr(el).querySelectorAll('.box .label')].map((l) => l.textContent!);
const dimmed = (el: DexRelationshipGraph): string[] =>
  [...sr(el).querySelectorAll<HTMLElement>('.box.dim')].map((b) => GRAPH.boxes.find((x) => x.id === b.dataset.id)!.label);
const canvas = (el: DexRelationshipGraph): HTMLElement => sr(el).querySelector<HTMLElement>('.canvas')!;
const button = (el: DexRelationshipGraph, label: string): HTMLButtonElement =>
  sr(el).querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;

/** The view's transform, as the world element carries it. */
function view(el: DexRelationshipGraph): { x: number; y: number; scale: number } {
  const t = sr(el).querySelector<HTMLElement>('.world')!.style.transform;
  const m = /translate\((-?[\d.e+-]+)px, (-?[\d.e+-]+)px\) scale\(([\d.e+-]+)\)/.exec(t);
  if (!m) throw new Error(`no transform in "${t}"`);
  return { x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) };
}

/** Give the canvas a size, which happy-dom lays nothing out to give it. */
function sized(el: DexRelationshipGraph, width: number, height: number): void {
  Object.defineProperty(canvas(el), 'clientWidth', { configurable: true, get: () => width });
  Object.defineProperty(canvas(el), 'clientHeight', { configurable: true, get: () => height });
}

// The details of each `name` the document hears during each test of the describe block that asks:
// emptied before each test, and the listener taken off after it.
function heard<K extends 'dex-graph-selected' | 'dex-graph-open' | 'dex-graph-expand'>(name: K) {
  const got: unknown[] = [];
  const listener = (e: Event) => got.push((e as CustomEvent).detail);
  beforeEach(() => {
    got.length = 0;
    document.addEventListener(name, listener);
  });
  afterEach(() => document.removeEventListener(name, listener));
  return got as (K extends 'dex-graph-selected' ? GraphSelectedDetail : K extends 'dex-graph-open' ? GraphOpenDetail : GraphExpandDetail)[];
}

// A press, move or release of the primary button: `buttons` says it is held, as a browser says it
// on a press and every move until the release.
const pointer = (type: string, target: Element, x: number, y: number, buttons = type === 'pointerup' ? 0 : 1) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons }));
const key = (el: DexRelationshipGraph, k: string) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
  canvas(el).dispatchEvent(e);
  return e;
};

describe('what it draws', () => {
  it('says what to open when there is nothing to draw, and draws no controls', async () => {
    for (const g of [null, { boxes: [], edges: [] }]) {
      const el = await graph(g);
      expect(sr(el).querySelector('.empty')!.textContent!.trim()).toBe('Open models, dictionaries or MAT-files to see how they connect.');
      expect(sr(el).querySelector('.box')).toBeNull();
      expect(sr(el).querySelector('.zoom')).toBeNull();
      el.remove();
    }
  });

  it('draws a box per file where the layout put it, of its kind, with its icon', async () => {
    const el = await graph(GRAPH, openAll);
    expect(labels(el)).toEqual(NAMES);
    const layout = layoutGraph(GRAPH, new Set(ALL));
    for (const b of layout.boxes) {
      const box = boxEl(el, b.id);
      expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual([`${b.x}px`, `${b.y}px`, `${b.width}px`, `${b.height}px`]);
    }
    expect(boxEl(el, idOf('caseRefs.slx')).classList.contains('model')).toBe(true);
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('mat')).toBe(true);
    expect(boxEl(el, idOf('chained.sldd')).querySelector('dex-icon')!.iconId).toBe('simulink_database');
  });

  it('opens no box at first, as the prototype, and then the boxes `expanded` names, with what they reach in the others', async () => {
    // Closed, a graph is its files and the links between them.
    const el = await graph();
    expect(el.expanded).toEqual([]);
    expect(sr(el).querySelectorAll('.item')).toHaveLength(0);
    expect(sr(el).querySelectorAll('.box.open')).toHaveLength(0);
    const shown = () => [...sr(el).querySelectorAll<HTMLElement>('.item')].map((i) => i.dataset.id);
    // The model open: its blocks, and in each data file only the variable they read, the data
    // files staying closed.
    el.expanded = [idOf('caseRefs.slx')];
    await el.updateComplete;
    expect(shown()).toHaveLength(8);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain1')).textContent!.trim()).toBe('Gain1');
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('open')).toBe(false);
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('partial')).toBe(true);
    // A MAT-file open: its variable, and in the model the block that reads it.
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    expect(shown()).toEqual([itemIdOf('caseRefs.slx', 'Const1'), itemIdOf('CaseBp.mat', 'Bp')]);
  });

  it('draws each edge the layout routes, by kind, and labels a usage with its parameter', async () => {
    const el = await graph(GRAPH, openAll);
    const paths = [...sr(el).querySelectorAll<SVGPathElement>('path.edge')];
    expect(paths).toHaveLength(GRAPH.edges.length);
    const kinds = paths.map((p) => [...p.classList].find((c) => c !== 'edge' && c !== 'dim'));
    expect(kinds.filter((k) => k === 'param-usage')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'data-link')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'sldd-ref')).toHaveLength(1);
    // As the prototype wrote them: the parameter as a property of the block.
    expect([...sr(el).querySelectorAll('text.edge-label')].map((t) => t.textContent).sort()).toEqual(['.Gain', '.Gain', '.Gain', '.Value']);
    // Closed, the usages have no item to reach and are not drawn.
    el.expanded = [];
    await el.updateComplete;
    expect(sr(el).querySelectorAll('path.edge')).toHaveLength(4);
  });

  it('draws a ghost dashed, says it is not open, and gives it no toggle', async () => {
    const el = await graph(graphOf(['caseRefs.slx']));
    const ghost = [...sr(el).querySelectorAll<HTMLElement>('.box.ghost')];
    expect(ghost.map((b) => b.querySelector('.label')!.textContent)).toEqual(['caseparams.sldd', 'EXTRADICT.SLDD', 'CaseBp.MAT']);
    expect(ghost[0]!.title).toContain('not open');
    expect(ghost[0]!.querySelector('.toggle')).toBeNull();
  });

  it('writes no style attribute, so a strict Content-Security-Policy draws it', () => {
    const src = readFileSync(join(ROOT, 'src/widgets/app-shell/modules/dex-relationship-graph.ts'), 'utf8');
    expect(src).not.toMatch(/\sstyle=/);
    expect(src).not.toMatch(/styleMap/);
  });
});

describe('the layout', () => {
  // Two layouts of the same graph: the prototype's top-down trees, the default, and indented trees,
  // which draw a large set narrower. The layout is the model's (layout.ts); the widget draws what it
  // places, and fits the graph afresh when the layout changes, its boxes being elsewhere.
  const placed = (el: DexRelationshipGraph) => [...sr(el).querySelectorAll<HTMLElement>('.box')].map((b) => [b.style.left, b.style.top]);
  const at = (style: 'tree' | 'indented') => layoutGraph(GRAPH, new Set(), style).boxes.map((b) => [`${b.x}px`, `${b.y}px`]);

  it("draws the prototype's trees by default, and indented trees when `layout` says so, by attribute or property", async () => {
    const el = await graph();
    expect(el.layout).toBe('tree');
    expect(placed(el)).toEqual(at('tree'));
    el.setAttribute('layout', 'indented');
    await el.updateComplete;
    expect(el.layout).toBe('indented');
    expect(placed(el)).toEqual(at('indented'));
    el.layout = 'tree';
    await el.updateComplete;
    expect(placed(el)).toEqual(at('tree'));
    // A value it does not know is the default.
    el.setAttribute('layout', 'radial');
    await el.updateComplete;
    expect(placed(el)).toEqual(at('tree'));
  });

  it('fits the graph afresh when the layout changes, and keeps what is open and selected', async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = [idOf('CaseBp.mat')]));
    sized(el, 800, 600);
    el.selected = idOf('CaseBp.mat');
    el.fit();
    button(el, 'Zoom in').click();
    await el.updateComplete;
    el.layout = 'indented';
    await el.updateComplete;
    const fitted = view(el);
    el.fit();
    await el.updateComplete;
    expect(view(el)).toEqual(fitted);
    expect(el.expanded).toEqual([idOf('CaseBp.mat')]);
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('selected')).toBe(true);
  });
});

describe('the layers', () => {
  // Edges between boxes run under them, so a long one passes behind the boxes in its way rather
  // than through their items (the review's render of a large graph, every box open). A usage's two
  // short ends, from its item to its own box's border, are drawn over, so it still visibly leaves
  // its block and reaches its variable; a workspace usage, which never leaves its box, is drawn
  // over whole; and what a selection reaches comes to the top.
  const under = (el: DexRelationshipGraph, kind: string) => sr(el).querySelectorAll(`svg.under path.edge.${kind}`).length;
  const over = (el: DexRelationshipGraph, kind: string) => sr(el).querySelectorAll(`svg.over path.edge.${kind}`).length;

  it('draws every edge between boxes under them, and the two ends of each usage over them', async () => {
    const el = await graph(GRAPH, openAll);
    expect([under(el, 'param-usage'), under(el, 'data-link'), under(el, 'sldd-ref')]).toEqual([4, 3, 1]);
    expect(over(el, 'param-usage')).toBe(0);
    expect(sr(el).querySelectorAll('svg.over path.stub.param-usage')).toHaveLength(8);
    expect(sr(el).querySelectorAll('svg.over text.edge-label')).toHaveLength(4);
  });

  it("draws a workspace usage over its model's box, whole", async () => {
    const files = ['shadow_ws.slx', 'params.sldd'].map((n) => {
      const b = readFileSync(join(ROOT, 'test/fixtures', n));
      return { uriString: `mem:///w/${n}`, path: `/w/${n}`, bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer };
    });
    const g = buildRelationshipGraph(files);
    const el = await graph(g, (e) => (e.expanded = [g.boxes[0]!.id]));
    expect([over(el, 'ws-usage'), under(el, 'ws-usage')]).toEqual([1, 0]);
  });

  it('brings the edges of what is selected to the top, whole', async () => {
    const el = await graph(GRAPH, openAll);
    el.selected = itemIdOf('caseRefs.slx', 'Gain2');
    await el.updateComplete;
    expect([over(el, 'param-usage'), under(el, 'param-usage')]).toEqual([1, 3]);
    el.selected = idOf('caseRefs.slx');
    await el.updateComplete;
    expect([over(el, 'param-usage'), over(el, 'data-link'), under(el, 'sldd-ref')]).toEqual([4, 3, 1]);
  });
});

describe('choosing', () => {
  const selected = heard('dex-graph-selected');

  it('selects a box on a click, says so, and dims what it does not reach', async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = []));
    boxEl(el, idOf('chained.sldd')).click();
    await el.updateComplete;
    expect(selected).toEqual([{ id: idOf('chained.sldd') }]);
    expect(el.selected).toBe(idOf('chained.sldd'));
    expect(boxEl(el, idOf('chained.sldd')).classList.contains('selected')).toBe(true);
    // chained.sldd is referenced by CaseParams.sldd, and a block of caseRefs.slx reads its
    // variable: closed, that edge is not drawn, and the model is still what the dictionary reaches.
    expect(dimmed(el)).toEqual(['ExtraDict.sldd', 'CaseBp.mat']);
  });

  it("lights a selected box's items, the items its edges reach and their boxes", async () => {
    const el = await graph(GRAPH, openAll);
    boxEl(el, idOf('CaseBp.mat')).click();
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Const1')).classList.contains('dim')).toBe(false);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain1')).classList.contains('dim')).toBe(true);
  });

  it('selects an item on a click, not its box, and lights only what it reaches', async () => {
    const el = await graph(GRAPH, openAll);
    itemEl(el, itemIdOf('caseRefs.slx', 'Gain2')).click();
    await el.updateComplete;
    expect(selected).toEqual([{ id: itemIdOf('caseRefs.slx', 'Gain2') }]);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain2')).classList.contains('selected')).toBe(true);
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'ExtraDict.sldd', 'CaseBp.mat']);
    expect(itemEl(el, itemIdOf('chained.sldd', 'ChainedVar')).classList.contains('dim')).toBe(false);
    const lit = [...sr(el).querySelectorAll('path.edge:not(.dim)')];
    expect(lit).toHaveLength(1);
    expect(lit[0]!.classList.contains('param-usage')).toBe(true);
  });

  it('clears the selection on a click on the background, and not on a drag of it', async () => {
    const el = await graph(GRAPH, (e) => (e.selected = idOf('CaseBp.mat')));
    pointer('pointerdown', canvas(el), 10, 10);
    pointer('pointermove', canvas(el), 60, 40);
    pointer('pointerup', canvas(el), 60, 40);
    await el.updateComplete;
    expect(selected).toEqual([]);
    expect(el.selected).toBe(idOf('CaseBp.mat'));
    pointer('pointerdown', canvas(el), 10, 10);
    pointer('pointerup', canvas(el), 11, 10);
    await el.updateComplete;
    expect(selected).toEqual([{ id: null }]);
    expect(el.selected).toBeNull();
    expect(dimmed(el)).toEqual([]);
  });

  it('highlights what the app selects, and says nothing', async () => {
    const el = await graph(GRAPH, openAll);
    el.selected = itemIdOf('CaseBp.mat', 'Bp');
    await el.updateComplete;
    expect(itemEl(el, itemIdOf('CaseBp.mat', 'Bp')).classList.contains('selected')).toBe(true);
    expect(selected).toEqual([]);
    // An id the graph does not hold dims nothing.
    el.selected = 'mem:///w/gone.sldd';
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
  });
});

describe('opening and the toggle', () => {
  const opened = heard('dex-graph-open');
  const expand = heard('dex-graph-expand');
  const selected = heard('dex-graph-selected');

  it('asks to open a box on a double-click, and an item by the name its table reveals it by', async () => {
    const el = await graph(GRAPH, openAll);
    boxEl(el, idOf('chained.sldd')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    itemEl(el, itemIdOf('caseRefs.slx', 'Gain3')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(opened).toEqual([{ uri: 'mem:///w/chained.sldd' }, { uri: 'mem:///w/caseRefs.slx', name: '3' }]);
  });

  it('asks to open a ghost by the name its reference spells, with no uri, for the app to resolve as a link', async () => {
    const g = graphOf(['caseRefs.slx']);
    const el = await graph(g);
    sr(el).querySelector('.box.ghost')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    el.selected = g.boxes.find((b) => b.label === 'CaseBp.MAT')!.id;
    await el.updateComplete;
    key(el, 'Enter');
    expect(opened).toEqual([
      { uri: '', ref: 'caseparams.sldd' },
      { uri: '', ref: 'CaseBp.MAT' },
    ]);
  });

  it('asks nothing for a ghost with no reference to give', async () => {
    const ghost = { id: '["ghost"]', uri: '', kind: 'sldd' as const, label: 'x.sldd', ghost: true, items: [] };
    const el = await graph({ boxes: [ghost], edges: [] });
    sr(el).querySelector('.box.ghost')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(opened).toEqual([]);
  });

  it("asks to hide an open box's items and to show a closed one's, and changes neither itself", async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = [idOf('caseRefs.slx')]));
    const toggle = (label: string) => boxEl(el, idOf(label)).querySelector<HTMLButtonElement>('.toggle')!;
    expect(toggle('caseRefs.slx').getAttribute('aria-expanded')).toBe('true');
    expect(toggle('CaseBp.mat').getAttribute('aria-expanded')).toBe('false');
    toggle('caseRefs.slx').click();
    toggle('CaseBp.mat').click();
    await el.updateComplete;
    expect(expand).toEqual([
      { id: idOf('caseRefs.slx'), expanded: false },
      // Showing what the open model reaches is not being open: its + still opens it whole.
      { id: idOf('CaseBp.mat'), expanded: true },
    ]);
    expect(sr(el).querySelectorAll('.item')).toHaveLength(8);
    // A toggle is not a click on its box.
    expect(selected).toEqual([]);
    // A box with no items has none.
    const lone = await graph({ boxes: [{ id: 'mem:///w/a.sldd', uri: 'mem:///w/a.sldd', kind: 'sldd', label: 'a.sldd', ghost: false, items: [] }], edges: [] });
    expect(sr(lone).querySelector('.toggle')).toBeNull();
  });
});

describe('the view', () => {
  it('zooms in and out with its buttons, within bounds', async () => {
    const el = await graph();
    sized(el, 800, 600);
    const before = view(el).scale;
    button(el, 'Zoom in').click();
    await el.updateComplete;
    expect(view(el).scale).toBeCloseTo(before + 0.2, 6);
    for (let i = 0; i < 30; i++) button(el, 'Zoom in').click();
    await el.updateComplete;
    expect(view(el).scale).toBe(3);
    for (let i = 0; i < 30; i++) button(el, 'Zoom out').click();
    await el.updateComplete;
    expect(view(el).scale).toBeCloseTo(0.3, 6);
  });

  it('zooms with the wheel about the pointer, and keeps the point under it still', async () => {
    const el = await graph();
    sized(el, 800, 600);
    const before = view(el);
    const wheel = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true, composed: true });
    // happy-dom's WheelEvent takes no pointer position; a browser's always has one.
    Object.defineProperties(wheel, { clientX: { value: 200 }, clientY: { value: 100 } });
    canvas(el).dispatchEvent(wheel);
    await el.updateComplete;
    const after = view(el);
    expect(wheel.defaultPrevented).toBe(true);
    // By a factor of the distance scrolled, so a trackpad's many small steps zoom as smoothly as a
    // wheel's few large ones add up to.
    expect(after.scale / before.scale).toBeCloseTo(Math.exp(100 * 0.0015), 6);
    // The canvas point under (200, 100) is the same before and after.
    expect((200 - after.x) / after.scale).toBeCloseTo((200 - before.x) / before.scale, 6);
    expect((100 - after.y) / after.scale).toBeCloseTo((100 - before.y) / before.scale, 6);
  });

  it('zooms a trackpad a little at a time, by lines as by pixels, and takes no scroll that zooms nothing', async () => {
    const el = await graph();
    sized(el, 800, 600);
    const wheel = (init: WheelEventInit, mode = 0): WheelEvent => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, ...init });
      Object.defineProperties(e, { clientX: { value: 0 }, clientY: { value: 0 }, deltaMode: { value: mode } });
      canvas(el).dispatchEvent(e);
      return e;
    };
    const before = view(el).scale;
    wheel({ deltaY: -4 });
    await el.updateComplete;
    expect(view(el).scale / before).toBeCloseTo(Math.exp(4 * 0.0015), 6);
    const step = view(el).scale;
    wheel({ deltaY: 3 }, 1);
    await el.updateComplete;
    expect(view(el).scale / step).toBeCloseTo(Math.exp(-3 * 16 * 0.0015), 6);
    // A sideways scroll: nothing to zoom, so the page keeps it.
    const sideways = wheel({ deltaX: 30, deltaY: 0 });
    await el.updateComplete;
    expect(sideways.defaultPrevented).toBe(false);
    expect(view(el).scale / step).toBeCloseTo(Math.exp(-3 * 16 * 0.0015), 6);
  });

  it('ends a drag when the pointer is let go anywhere: capture lost, or a move with the button up', async () => {
    const el = await graph();
    const start = view(el);
    pointer('pointerdown', canvas(el), 100, 100);
    pointer('pointermove', canvas(el), 120, 100);
    canvas(el).dispatchEvent(new Event('lostpointercapture', { bubbles: true, composed: true }));
    pointer('pointermove', canvas(el), 200, 100);
    await el.updateComplete;
    expect(view(el).x).toBe(start.x + 20);
    expect(canvas(el).classList.contains('panning')).toBe(false);
    // Released outside the window, where the release never came: the next move says the button is up.
    pointer('pointerdown', canvas(el), 100, 100);
    pointer('pointermove', canvas(el), 110, 100);
    pointer('pointermove', canvas(el), 150, 100, 0);
    pointer('pointermove', canvas(el), 190, 100);
    await el.updateComplete;
    expect(view(el).x).toBe(start.x + 30);
  });

  it('moves the view without drawing the graph again', async () => {
    // A pan or a zoom changes one transform. Drawing the boxes and building every edge's path again
    // on each step of a drag is what made a large graph stutter.
    const el = await graph(GRAPH, openAll);
    sized(el, 800, 600);
    const proto = DexRelationshipGraph.prototype as unknown as Record<string, () => unknown>;
    const spies = ['_renderUnder', '_renderOver', '_renderBox'].map((name) => vi.spyOn(proto, name));
    try {
      pointer('pointerdown', canvas(el), 100, 100);
      pointer('pointermove', canvas(el), 140, 120);
      await el.updateComplete;
      pointer('pointermove', canvas(el), 160, 130);
      pointer('pointerup', canvas(el), 160, 130);
      await el.updateComplete;
      button(el, 'Zoom in').click();
      await el.updateComplete;
      expect(view(el).x).not.toBe(0);
      for (const spy of spies) expect(spy).not.toHaveBeenCalled();
      // A selection does draw it again: what is lit changes.
      el.selected = idOf('CaseBp.mat');
      await el.updateComplete;
      expect(spies[0]).toHaveBeenCalled();
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it('pans with a drag of the background', async () => {
    const el = await graph();
    const before = view(el);
    pointer('pointerdown', canvas(el), 100, 100);
    pointer('pointermove', canvas(el), 140, 70);
    pointer('pointerup', canvas(el), 140, 70);
    await el.updateComplete;
    expect(view(el)).toEqual({ x: before.x + 40, y: before.y - 30, scale: before.scale });
  });

  it('fits the whole graph in the canvas, from its button or fit()', async () => {
    const el = await graph();
    sized(el, 1000, 600);
    const layout = layoutGraph(GRAPH, new Set());
    for (const fit of [() => el.fit(), () => button(el, 'Fit to view').click()]) {
      button(el, 'Zoom in').click();
      fit();
      await el.updateComplete;
      const v = view(el);
      expect(v.scale).toBeLessThanOrEqual(1);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + layout.width * v.scale).toBeLessThanOrEqual(1000 + 1e-6);
      expect(v.y + layout.height * v.scale).toBeLessThanOrEqual(600 + 1e-6);
    }
  });

  it('fits no smaller than a scale its boxes can be read at, and then shows the top left to pan from', async () => {
    // The gallery's ten unrelated files fitted into a small pane: shrunk to fit, the boxes were
    // unreadable. A fit stops at 0.7, where a box's 11px label is still near 8px, and what does not
    // fit then starts at the top left.
    const lone = (i: number): RelationshipGraph['boxes'][number] => ({
      id: `mem:///w/m${i}.slx`,
      uri: `mem:///w/m${i}.slx`,
      kind: 'model',
      label: `LongModelName${i}.slx`,
      ghost: false,
      items: [],
    });
    const el = await graph({ boxes: Array.from({ length: 10 }, (_, i) => lone(i)), edges: [] });
    sized(el, 300, 200);
    el.fit();
    await el.updateComplete;
    expect(view(el)).toEqual({ x: 0, y: 0, scale: 0.7 });
    // A pane wide enough at that scale and too short: centred across, from the top down.
    const layout = layoutGraph(el.graph!, new Set());
    sized(el, Math.ceil(layout.width * 0.7) + 100, 200);
    el.fit();
    await el.updateComplete;
    expect(view(el).scale).toBe(0.7);
    expect(view(el).x).toBeCloseTo((Math.ceil(layout.width * 0.7) + 100 - layout.width * 0.7) / 2, 6);
    expect(view(el).y).toBe(0);
  });

  it('fits a graph that fits at its own size at its own size: the layout has its margin', async () => {
    const el = await graph();
    const layout = layoutGraph(GRAPH, new Set());
    sized(el, Math.ceil(layout.width), Math.ceil(layout.height));
    el.fit();
    await el.updateComplete;
    expect(view(el).scale).toBe(1);
  });

  it('fits a graph it is first given once it has a size', async () => {
    const el = await graph(null);
    sized(el, 500, 300);
    el.graph = GRAPH;
    await el.updateComplete;
    await new Promise((done) => setTimeout(done, 0));
    expect(view(el).scale).toBeLessThan(1);
  });

  it('keeps the view over a graph rebuilt from the same files, and fits one of other files', async () => {
    const el = await graph();
    sized(el, 500, 300);
    el.fit();
    button(el, 'Zoom in').click();
    await el.updateComplete;
    const zoomed = view(el);
    el.graph = graphOf();
    await el.updateComplete;
    expect(view(el)).toEqual(zoomed);
    el.graph = graphOf(['caseRefs.slx', 'CaseBp.mat']);
    await el.updateComplete;
    expect(view(el).scale).not.toBe(zoomed.scale);
  });

  it('reveals, straight after a graph is set, where that graph puts the box', async () => {
    const el = await graph(graphOf(['CaseBp.mat']));
    sized(el, 800, 600);
    el.graph = GRAPH;
    el.reveal(idOf('chained.sldd'));
    await el.updateComplete;
    const box = layoutGraph(GRAPH, new Set()).boxes.find((b) => b.id === idOf('chained.sldd'))!;
    const v = view(el);
    expect(v.x + (box.x + box.width / 2) * v.scale).toBeCloseTo(400, 6);
    expect(v.y + (box.y + box.height / 2) * v.scale).toBeCloseTo(300, 6);
  });

  it('reveals a box or an item at the middle of the canvas', async () => {
    const el = await graph(GRAPH, openAll);
    sized(el, 800, 600);
    const layout = layoutGraph(GRAPH, new Set(ALL));
    for (const id of [idOf('CaseBp.mat'), itemIdOf('caseRefs.slx', 'Gain1')]) {
      el.reveal(id);
      await el.updateComplete;
      const r = [...layout.boxes, ...layout.boxes.flatMap((b) => b.items)].find((x) => x.id === id)!;
      const v = view(el);
      expect(v.x + (r.x + r.width / 2) * v.scale).toBeCloseTo(400, 6);
      expect(v.y + (r.y + r.height / 2) * v.scale).toBeCloseTo(300, 6);
    }
    // An item of a closed box reveals its box.
    el.expanded = [];
    await el.updateComplete;
    el.reveal(itemIdOf('CaseBp.mat', 'Bp'));
    await el.updateComplete;
    const box = layoutGraph(GRAPH, new Set()).boxes.find((b) => b.id === idOf('CaseBp.mat'))!;
    const v = view(el);
    expect(v.x + (box.x + box.width / 2) * v.scale).toBeCloseTo(400, 6);
  });
});

// The rectangles a view shows whole: each inside the canvas at the view's scale.
function inView(el: DexRelationshipGraph, rects: readonly { x: number; y: number; width: number; height: number }[], w: number, h: number): boolean {
  const v = view(el);
  return rects.every(
    (r) => v.x + r.x * v.scale >= -1e-6 && v.y + r.y * v.scale >= -1e-6 && v.x + (r.x + r.width) * v.scale <= w + 1e-6 && v.y + (r.y + r.height) * v.scale <= h + 1e-6,
  );
}

// The middle of the rectangles' union, on screen.
function middleOf(el: DexRelationshipGraph, rects: readonly { x: number; y: number; width: number; height: number }[]): { x: number; y: number } {
  const v = view(el);
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { x: v.x + ((left + right) / 2) * v.scale, y: v.y + ((top + bottom) / 2) * v.scale };
}

const boxRects = (expanded: string[], ids: string[]) => {
  const layout = layoutGraph(GRAPH, new Set(expanded));
  return ids.map((id) => layout.boxes.find((b) => b.id === id)!);
};

describe('a box opened', () => {
  // The prototype's expand: the view moves onto the box and the files it reaches, and every other
  // box is dimmed, so with fifteen files the one opened is what is looked at. Opened is newly in
  // `expanded`, which the app sets in answer to the box's +: the boxes open when the graph is first
  // drawn are not, and are not zoomed to.
  const selected = heard('dex-graph-selected');

  it('is zoomed to with the files it reaches, and dims the rest', async () => {
    const el = await graph();
    sized(el, 800, 600);
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    // The MAT-file is linked by the model, and a block of the model reads its variable.
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    const rects = boxRects([idOf('CaseBp.mat')], [idOf('CaseBp.mat'), idOf('caseRefs.slx')]);
    expect(inView(el, rects, 800, 600)).toBe(true);
    const mid = middleOf(el, rects);
    expect(mid.x).toBeCloseTo(400, 6);
    expect(mid.y).toBeCloseTo(300, 6);
    expect(view(el).scale).toBeLessThanOrEqual(1);
    // Opening a box selects nothing.
    expect(selected).toEqual([]);
    expect(el.selected).toBeNull();
  });

  it('reaches a dictionary a reference away through what reads it, and not the models a model references', async () => {
    // chained.sldd is referenced by CaseParams.sldd and read by a block of the model.
    const el = await graph();
    el.expanded = [idOf('chained.sldd')];
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['ExtraDict.sldd', 'CaseBp.mat']);
    // A model opened lights the data it links, not the model it references: what is opened is
    // looked at for the data its blocks read.
    const b = readFileSync(join(ROOT, 'test/fixtures/model_with_refs.slx'));
    const g = buildRelationshipGraph([{ uriString: 'mem:///w/model_with_refs.slx', path: '/w/model_with_refs.slx', bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }]);
    const refs = await graph(g);
    refs.expanded = ['mem:///w/model_with_refs.slx'];
    await refs.updateComplete;
    const dim = [...sr(refs).querySelectorAll<HTMLElement>('.box.dim')].map((x) => g.boxes.find((y) => y.id === x.dataset.id)!.label);
    expect(dim).toEqual(['plant.slx']);
  });

  it('is not what the graph was first drawn with, nor what a rebuilt graph keeps open', async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = [idOf('CaseBp.mat')]));
    expect(dimmed(el)).toEqual([]);
    el.graph = graphOf();
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
  });

  it('stops dimming when it is closed, on Escape, and on a click on the background', async () => {
    const el = await graph();
    const open = async () => {
      el.expanded = [];
      await el.updateComplete;
      el.expanded = [idOf('CaseBp.mat')];
      await el.updateComplete;
      expect(dimmed(el)).toHaveLength(3);
    };
    await open();
    el.expanded = [];
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
    await open();
    expect(key(el, 'Escape').defaultPrevented).toBe(true);
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
    await open();
    pointer('pointerdown', canvas(el), 10, 10);
    pointer('pointerup', canvas(el), 10, 10);
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
    // Nothing to stop, Escape is the app's.
    expect(key(el, 'Escape').defaultPrevented).toBe(false);
    expect(selected).toEqual([]);
  });

  it("stops dimming on Escape from the box's toggle, which a click on it leaves focused", async () => {
    const el = await graph();
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    const toggle = boxEl(el, idOf('CaseBp.mat')).querySelector<HTMLButtonElement>('.toggle')!;
    const e = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
    toggle.dispatchEvent(e);
    await el.updateComplete;
    expect(e.defaultPrevented).toBe(true);
    expect(dimmed(el)).toEqual([]);
  });

  it('lights over a selection made before it, and says so; a selection made after lights again', async () => {
    // The review's case: SubChassis selected, then PowerTrain's + pressed. The + selects nothing,
    // so the selection stays and sends nothing; what is newer is what is lit.
    const el = await graph();
    const status = () => sr(el).querySelector('[role="status"]')!.textContent!.trim();
    boxEl(el, idOf('ExtraDict.sldd')).click();
    await el.updateComplete;
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('dim')).toBe(false);
    expect(status()).toBe('Showing CaseBp.mat and what it reaches: caseRefs.slx.');
    expect(el.selected).toBe(idOf('ExtraDict.sldd'));
    expect(selected).toEqual([{ id: idOf('ExtraDict.sldd') }]);
    // A box chosen after: the selection is newer.
    boxEl(el, idOf('CaseParams.sldd')).click();
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['ExtraDict.sldd', 'CaseBp.mat']);
    expect(status()).toContain('Selected CaseParams.sldd');
  });

  it('takes a box opened with a selection, as a Show in Graph opens one, as no box opened', async () => {
    const el = await graph();
    el.expanded = [idOf('CaseBp.mat')];
    el.selected = itemIdOf('CaseBp.mat', 'Bp');
    await el.updateComplete;
    // The selection's reach: the variable, its block, and their boxes.
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    // The app lets the selection go: nothing is lit, the box being no box the user opened.
    el.selected = null;
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
    expect(sr(el).querySelector('[role="status"]')!.textContent!.trim()).toBe('');
  });

  it('gives the lighting back to the box opened before when the last one is closed', async () => {
    const el = await graph();
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    el.expanded = [idOf('CaseBp.mat'), idOf('chained.sldd')];
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['ExtraDict.sldd', 'CaseBp.mat']);
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    // Escape lets them all go: closing one after that lights none.
    key(el, 'Escape');
    el.expanded = [];
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
  });

  it('lights the box opened before only over a selection older than it, when the last one is closed', async () => {
    // Open CaseBp.mat, select ExtraDict.sldd, open chained.sldd, close it: CaseBp.mat was opened
    // before the selection was made, so the selection lights, and is what is said.
    const el = await graph();
    const status = () => sr(el).querySelector('[role="status"]')!.textContent!.trim();
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    boxEl(el, idOf('ExtraDict.sldd')).click();
    await el.updateComplete;
    el.expanded = [idOf('CaseBp.mat'), idOf('chained.sldd')];
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['ExtraDict.sldd', 'CaseBp.mat']);
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    // What ExtraDict.sldd reaches: the model that links it.
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'CaseBp.mat']);
    expect(status()).toContain('Selected ExtraDict.sldd');
    // The selection let go by the app: the box still open, opened by the user, lights again.
    el.selected = null;
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
  });

  it('lets a box go that leaves the graph while it is lit, and lights the one opened before', async () => {
    const el = await graph();
    el.expanded = [idOf('chained.sldd')];
    await el.updateComplete;
    el.expanded = [idOf('chained.sldd'), idOf('CaseBp.mat')];
    await el.updateComplete;
    // The MAT-file closed in the app: the graph is built without it, `expanded` not yet told.
    el.graph = graphOf(NAMES.filter((n) => n !== 'CaseBp.mat'));
    await el.updateComplete;
    const dim = [...sr(el).querySelectorAll<HTMLElement>('.box.dim')].map((b) => el.graph!.boxes.find((x) => x.id === b.dataset.id)!.label);
    // chained.sldd's reach; the MAT-file is a ghost now, the model still naming it.
    expect(dim).toEqual(['ExtraDict.sldd', 'CaseBp.MAT']);
    expect(sr(el).querySelector('[role="status"]')!.textContent!.trim()).toContain('Showing chained.sldd');
  });

  it('gives way to a selection, which lights what it reaches instead', async () => {
    const el = await graph();
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    boxEl(el, idOf('ExtraDict.sldd')).click();
    await el.updateComplete;
    // What ExtraDict.sldd reaches: the model that links it.
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'CaseBp.mat']);
    // Escape clears the selection too, and says so.
    key(el, 'Escape');
    await el.updateComplete;
    expect(selected.at(-1)).toEqual({ id: null });
    expect(dimmed(el)).toEqual([]);
  });

  it('says what it reaches, for a reader who does not see the dimming', async () => {
    const el = await graph();
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    expect(sr(el).querySelector('[role="status"]')!.textContent!.trim()).toBe('Showing CaseBp.mat and what it reaches: caseRefs.slx.');
  });
});

describe('a double-click on the background', () => {
  const expand = heard('dex-graph-expand');
  const opened = heard('dex-graph-open');

  it('asks to close every open box, and fits the whole graph', async () => {
    const el = await graph();
    sized(el, 1000, 600);
    // The app answers each request, as the shell's graph pane does.
    el.addEventListener('dex-graph-expand', (e) => {
      const { id, expanded } = e.detail;
      el.expanded = expanded ? [...el.expanded, id] : el.expanded.filter((x) => x !== id);
    });
    el.expanded = [idOf('caseRefs.slx'), idOf('CaseBp.mat')];
    await el.updateComplete;
    canvas(el).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(expand).toEqual([
      { id: idOf('caseRefs.slx'), expanded: false },
      { id: idOf('CaseBp.mat'), expanded: false },
    ]);
    expect(el.expanded).toEqual([]);
    expect(dimmed(el)).toEqual([]);
    // Fitted, as the fit button fits it.
    const fitted = view(el);
    el.fit();
    await el.updateComplete;
    expect(view(el)).toEqual(fitted);
    expect(inView(el, layoutGraph(GRAPH, new Set()).boxes, 1000, 600)).toBe(true);
    expect(opened).toEqual([]);
  });

  it('on a box opens its file, and closes nothing', async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = [idOf('caseRefs.slx')]));
    boxEl(el, idOf('CaseBp.mat')).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true }));
    expect(expand).toEqual([]);
    expect(opened).toEqual([{ uri: 'mem:///w/CaseBp.mat' }]);
  });
});

describe('zoomToReach', () => {
  it('zooms onto a box or an item and what a selection of it lights', async () => {
    const el = await graph(GRAPH, openAll);
    sized(el, 800, 600);
    const layout = layoutGraph(GRAPH, new Set(ALL));
    const rect = (id: string) => layout.boxes.find((b) => b.id === id)!;
    // Gain2 reads ChainedVar: its model's box and the dictionary's.
    el.zoomToReach(itemIdOf('caseRefs.slx', 'Gain2'));
    await el.updateComplete;
    const rects = [rect(idOf('caseRefs.slx')), rect(idOf('chained.sldd'))];
    expect(inView(el, rects, 800, 600)).toBe(true);
    expect(middleOf(el, rects).x).toBeCloseTo(400, 6);
    // It moves the view only: the app selects.
    expect(el.selected).toBeNull();
    expect(dimmed(el)).toEqual([]);
  });

  it('keeps the thing itself in view where what it reaches is too big to read at the least scale', async () => {
    const el = await graph(GRAPH, openAll);
    sized(el, 200, 150);
    el.zoomToReach(idOf('caseRefs.slx'));
    await el.updateComplete;
    const box = layoutGraph(GRAPH, new Set(ALL)).boxes.find((b) => b.id === idOf('caseRefs.slx'))!;
    const v = view(el);
    expect(v.scale).toBeGreaterThan(0.5);
    // Its top left, at least, where the box is bigger than the canvas.
    expect(v.x + box.x * v.scale).toBeGreaterThanOrEqual(-1e-6);
    expect(v.y + box.y * v.scale).toBeGreaterThanOrEqual(-1e-6);
    expect(v.x + box.x * v.scale).toBeLessThan(200);
  });

  it('waits for a draw to come, and for a size, and moves nothing for an id the graph does not hold', async () => {
    const el = await graph(graphOf(['CaseBp.mat']));
    sized(el, 800, 600);
    el.graph = GRAPH;
    el.zoomToReach(idOf('chained.sldd'));
    await el.updateComplete;
    const rects = boxRects([], [idOf('chained.sldd'), idOf('CaseParams.sldd'), idOf('caseRefs.slx')]);
    expect(middleOf(el, rects).x).toBeCloseTo(400, 6);
    const before = view(el);
    el.zoomToReach('mem:///w/gone.sldd');
    await el.updateComplete;
    expect(view(el)).toEqual(before);
  });
});

describe('hovering', () => {
  const over = (target: Element) => target.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, composed: true }));

  it("traces an item's connections while the pointer is on it, and gives back what was lit after", async () => {
    const el = await graph(GRAPH, openAll);
    el.selected = idOf('CaseBp.mat');
    await el.updateComplete;
    const selectedDims = dimmed(el);
    over(itemEl(el, itemIdOf('caseRefs.slx', 'Gain2')).querySelector('.name')!);
    await el.updateComplete;
    // As a selection of the item would light it: its block, its variable, and their boxes.
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'ExtraDict.sldd', 'CaseBp.mat']);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain1')).classList.contains('dim')).toBe(true);
    expect(sr(el).querySelectorAll('svg.over path.edge.param-usage')).toHaveLength(1);
    // Off the item, onto its box: the selection's again. Hovering changes no selection.
    over(boxEl(el, idOf('caseRefs.slx')));
    await el.updateComplete;
    expect(dimmed(el)).toEqual(selectedDims);
    expect(el.selected).toBe(idOf('CaseBp.mat'));
    // And off the canvas.
    over(itemEl(el, itemIdOf('caseRefs.slx', 'Gain2')));
    await el.updateComplete;
    canvas(el).dispatchEvent(new MouseEvent('pointerleave'));
    await el.updateComplete;
    expect(dimmed(el)).toEqual(selectedDims);
  });

  it('fades the other edges while one is hovered', async () => {
    const el = await graph(GRAPH, openAll);
    const world = () => sr(el).querySelector('.world')!;
    over(sr(el).querySelector('svg.under path.edge.data-link')!);
    await el.updateComplete;
    expect(world().classList.contains('edge-hover')).toBe(true);
    over(canvas(el));
    await el.updateComplete;
    expect(world().classList.contains('edge-hover')).toBe(false);
    // The fading is the stylesheet's: every edge but the one under the pointer.
    const css = readFileSync(join(ROOT, 'src/widgets/app-shell/modules/relationship-graph.styles.ts'), 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.world.edge-hover .under path.edge:not(:hover)');
  });

  it('traces nothing while the background is dragged', async () => {
    const el = await graph(GRAPH, openAll);
    pointer('pointerdown', canvas(el), 10, 10);
    over(itemEl(el, itemIdOf('caseRefs.slx', 'Gain2')));
    await el.updateComplete;
    expect(dimmed(el)).toEqual([]);
    pointer('pointerup', canvas(el), 10, 10);
  });
});

describe('what the edges say', () => {
  it('colours a data link by the kind of file it links: a dictionary green, a MAT-file sand', async () => {
    const el = await graph();
    const links = [...sr(el).querySelectorAll<SVGPathElement>('path.edge.data-link')];
    const to = (p: SVGPathElement) => [...p.classList].find((c) => c.startsWith('to-'));
    expect(links.map(to)).toEqual(['to-sldd', 'to-sldd', 'to-mat']);
    // Each with markers of its own colour.
    expect(links.map((p) => p.getAttribute('marker-end'))).toEqual([
      'url(#dex-graph-arrow-data-link-to-sldd)',
      'url(#dex-graph-arrow-data-link-to-sldd)',
      'url(#dex-graph-arrow-data-link-to-mat)',
    ]);
    expect(sr(el).querySelector('#dex-graph-arrow-data-link-to-mat path')!.getAttribute('class')).toBe('data-link to-mat');
    // In the colours of the boxes they reach: no token of their own.
    const css = readFileSync(join(ROOT, 'src/widgets/app-shell/modules/relationship-graph.styles.ts'), 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.data-link.to-sldd { stroke: var(--dex-graph-sldd-border, #6a8c7a); fill: var(--dex-graph-sldd-border, #6a8c7a); }');
    expect(css).toContain('.data-link.to-mat { stroke: var(--dex-graph-mat-border, #918267); fill: var(--dex-graph-mat-border, #918267); }');
  });
});

describe('the keyboard', () => {
  const selected = heard('dex-graph-selected');
  const opened = heard('dex-graph-open');
  const expand = heard('dex-graph-expand');

  it('is one stop of the tab order, the canvas, named, pointing at what is selected', async () => {
    const el = await graph(GRAPH, (e) => (e.selected = idOf('CaseBp.mat')));
    expect(canvas(el).tabIndex).toBe(0);
    expect(canvas(el).getAttribute('aria-label')).toBe('Relationship graph');
    const active = canvas(el).getAttribute('aria-activedescendant')!;
    expect(sr(el).querySelector(`#${active}`)).toBe(boxEl(el, idOf('CaseBp.mat')));
    expect(sr(el).querySelector('[role="status"]')!.textContent).toContain('CaseBp.mat');
    // A group with a name, not a toolbar: it has none of a toolbar's arrow-key behaviour.
    expect(sr(el).querySelector('.zoom')!.getAttribute('role')).toBe('group');
    expect(sr(el).querySelector('.zoom')!.getAttribute('aria-label')).toBe('Zoom');
    for (const b of sr(el).querySelectorAll<HTMLButtonElement>('.box button')) expect(b.tabIndex).toBe(-1);
  });

  it('says what is selected and what it links to', async () => {
    const el = await graph(GRAPH, openAll);
    const status = () => sr(el).querySelector('[role="status"]')!.textContent!.trim();
    el.selected = idOf('CaseBp.mat');
    await el.updateComplete;
    expect(status()).toBe('Selected CaseBp.mat, MAT-File. Linked to caseRefs.slx.');
    el.selected = itemIdOf('caseRefs.slx', 'Gain2');
    await el.updateComplete;
    expect(status()).toBe('Selected Gain2 in caseRefs.slx. Linked to ChainedVar in chained.sldd.');
    el.selected = idOf('caseRefs.slx');
    await el.updateComplete;
    expect(status()).toBe('Selected caseRefs.slx, Model. Linked to CaseParams.sldd, ExtraDict.sldd, CaseBp.mat, chained.sldd.');
  });

  it('leaves the keys of a button inside it to the button', async () => {
    const el = await graph(GRAPH, (e) => (e.selected = idOf('CaseBp.mat')));
    const toggle = boxEl(el, idOf('CaseBp.mat')).querySelector<HTMLButtonElement>('.toggle')!;
    for (const k of [' ', 'Enter', 'ArrowDown']) {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, composed: true, cancelable: true });
      toggle.dispatchEvent(e);
      expect(e.defaultPrevented, k).toBe(false);
    }
    expect([opened, expand, selected]).toEqual([[], [], []]);
  });

  it('moves the selection between boxes with the arrows, starting at the first', async () => {
    const el = await graph(GRAPH, (e) => (e.expanded = []));
    key(el, 'ArrowDown');
    expect(selected.at(-1)).toEqual({ id: idOf('caseRefs.slx') });
    key(el, 'ArrowRight');
    expect(selected.at(-1)).toEqual({ id: idOf('CaseParams.sldd') });
    key(el, 'ArrowRight');
    expect(selected.at(-1)).toEqual({ id: idOf('ExtraDict.sldd') });
    key(el, 'ArrowLeft');
    expect(selected.at(-1)).toEqual({ id: idOf('CaseParams.sldd') });
    key(el, 'ArrowDown');
    expect(selected.at(-1)).toEqual({ id: idOf('chained.sldd') });
    key(el, 'ArrowDown');
    expect(selected.at(-1)).toEqual({ id: idOf('CaseBp.mat') });
    // Nothing further down: the selection stays, and nothing is said.
    const said = selected.length;
    key(el, 'ArrowDown');
    expect(selected.length).toBe(said);
    expect(el.selected).toBe(idOf('CaseBp.mat'));
  });

  it('moves along an indented column with Up and Down, and between the columns with Left and Right', async () => {
    // Indented, the data files are one column: CaseParams.sldd, chained.sldd a step right under it,
    // ExtraDict.sldd, the MAT-file. Left from a box of unlike width goes to the model, not to the box
    // under it whose middle is a little to the left.
    const el = await graph(GRAPH, (e) => ((e.expanded = []), (e.layout = 'indented')));
    key(el, 'ArrowDown');
    key(el, 'ArrowRight');
    expect(selected.at(-1)).toEqual({ id: idOf('CaseParams.sldd') });
    key(el, 'ArrowDown');
    expect(selected.at(-1)).toEqual({ id: idOf('chained.sldd') });
    key(el, 'ArrowDown');
    expect(selected.at(-1)).toEqual({ id: idOf('ExtraDict.sldd') });
    key(el, 'ArrowLeft');
    expect(selected.at(-1)).toEqual({ id: idOf('caseRefs.slx') });
  });

  it('opens the selected box with Enter, and shows or hides its items with Space', async () => {
    const el = await graph(GRAPH, (e) => (e.selected = idOf('caseRefs.slx')));
    expect(key(el, 'Enter').defaultPrevented).toBe(true);
    key(el, ' ');
    expect(opened).toEqual([{ uri: 'mem:///w/caseRefs.slx' }]);
    expect(expand).toEqual([{ id: idOf('caseRefs.slx'), expanded: true }]);
  });

  it('zooms with + and -', async () => {
    const el = await graph();
    sized(el, 800, 600);
    const before = view(el).scale;
    key(el, '+');
    await el.updateComplete;
    expect(view(el).scale).toBeCloseTo(before + 0.2, 6);
    key(el, '-');
    key(el, '-');
    await el.updateComplete;
    expect(view(el).scale).toBeCloseTo(before - 0.2, 6);
  });

  it('leaves a chord to the app', async () => {
    const el = await graph();
    const e = new KeyboardEvent('keydown', { key: 'ArrowDown', ctrlKey: true, bubbles: true, composed: true, cancelable: true });
    canvas(el).dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
    expect(selected).toEqual([]);
  });
});

describe('the legend', () => {
  it('is closed at first, and opens onto every kind of edge and box', async () => {
    const el = await graph();
    const toggle = sr(el).querySelector<HTMLButtonElement>('.legend button')!;
    expect(toggle.textContent!.trim()).toBe('Legend');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    // There while closed, so the toggle's aria-controls names an element: hidden.
    const list = sr(el).querySelector<HTMLElement>('.legend-content')!;
    expect(list.id).toBe(toggle.getAttribute('aria-controls'));
    expect(list.hidden).toBe(true);
    toggle.click();
    await el.updateComplete;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(list.hidden).toBe(false);
    expect([...sr(el).querySelectorAll('.legend-content li')].map((li) => li.textContent!.trim())).toEqual([
      'Model Reference',
      'Dictionary Reference',
      'Data Link to Dictionary',
      'Data Link to MAT-File',
      'Parameter Usage',
      'Workspace Usage',
      'Model',
      'Dictionary',
      'MAT-File',
      'Not Open',
    ]);
    toggle.click();
    await el.updateComplete;
    expect(list.hidden).toBe(true);
  });
});

describe('contrast, in every theme', () => {
  // WCAG 2's contrast ratio. A line or a box's border is a graphical object, 3:1 against what it
  // is drawn on; a label is text, 4.5:1. The light set's first values (the prototype's muted palette) were
  // 1.9 to 2.9 against the canvas, and the dark set's ghost label was 3.9 on a dark box.
  const channel = (v: number): number => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const luminance = (hex: string): number => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
    const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(full.slice(i, i + 2), 16) / 255));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: string, b: string): number => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
  };
  const KINDS = ['model', 'sldd', 'mat'];
  const EDGES = ['model-ref', 'sldd-ref', 'data-link', 'param-usage', 'ws-usage'];

  for (const [name, set] of Object.entries(THEME_SETS)) {
    const get = (token: string): string => {
      const v = set.get(token);
      if (!v || !/^#[0-9a-f]{3,6}$/i.test(v)) throw new Error(`${name} ${token} is ${v}, not a colour this test reads`);
      return v;
    };
    const canvas = get('--dex-bg-tertiary');

    it(`${name}: every edge, box border and selected border at 3:1 against the canvas`, () => {
      const lines = [...EDGES.map((e) => `--dex-graph-edge-${e}`), ...KINDS.flatMap((k) => [`--dex-graph-${k}-border`, `--dex-graph-${k}-selected`])];
      for (const token of lines) expect(ratio(get(token), canvas), `${name} ${token}`).toBeGreaterThanOrEqual(3);
    });

    it(`${name}: a box's label, a ghost's, and an edge's at 4.5:1 against what they are on`, () => {
      for (const k of KINDS) {
        const bg = get(`--dex-graph-${k}-bg`);
        expect(ratio(get('--dex-color-text'), bg), `${name} label on ${k}`).toBeGreaterThanOrEqual(4.5);
        expect(ratio(get('--dex-graph-ghost-fg'), bg), `${name} ghost label on ${k}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(ratio(get('--dex-color-text-secondary'), canvas), `${name} edge label`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("inks a ghost's label with its own token, and an edge's label as text", () => {
    const css = readFileSync(join(ROOT, 'src/widgets/app-shell/modules/relationship-graph.styles.ts'), 'utf8').replace(/\s+/g, ' ');
    expect(css).toContain('.box.ghost .label { color: var(--dex-graph-ghost-fg, #666); }');
    expect(css).toMatch(/text\.edge-label \{ font-size: 8px; fill: var\(--dex-color-text-secondary, #555\); \}/);
  });
});

describe('what it loads', () => {
  it("reaches neither the builder nor core: an app that draws a graph it was handed bundles no parser", () => {
    const graph = readModuleGraph(join(ROOT, 'src'));
    const edges = runtimeEdges(graph);
    const loaded = new Set(['widgets/app-shell/modules/dex-relationship-graph.ts']);
    for (let grew = true; grew; ) {
      grew = false;
      for (const e of edges) if (loaded.has(e.from) && !loaded.has(e.to)) grew = loaded.add(e.to).size > 0;
    }
    expect(loaded).toContain('model/graph/graphTypes.ts');
    expect(loaded).toContain('model/graph/layout.ts');
    expect(loaded).not.toContain('model/graph/relationshipGraph.ts');
    const core = graph.edges.filter((e) => loaded.has(e.from) && !e.typeOnly && e.specifier.startsWith('data-explorer-core'));
    expect(core.map((e) => `${e.from}:${e.line}`)).toEqual([]);
  });
});

describe('defining', () => {
  it('registers under its default tag, and is the class the tag names', () => {
    expect(customElements.get('dex-relationship-graph')).toBe(DexRelationshipGraph);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
