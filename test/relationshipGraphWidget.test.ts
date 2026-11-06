// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// <dex-relationship-graph>: the app shell's graph of how the open models, dictionaries and
// MAT-files connect, as the prototype's relationship graph draws it (graph-expanded.png,
// legend-expanded.png). What it draws comes from the model (relationshipGraph.ts builds the graph,
// layout.ts places it), so what is pinned here is the widget's half: that it draws what the layout
// placed, that a click highlights what the clicked thing reaches and says so, that a double-click
// and Enter ask to open, that a box's toggle asks to show or hide its items and changes nothing
// itself, and that zoom, pan, fit and reveal move the view. Over the caserefs fixture's real graph:
// a model linked to three dictionaries, one of them through another, and a MAT-file.
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  DexRelationshipGraph,
  defineRelationshipGraph,
  type GraphExpandDetail,
  type GraphOpenDetail,
  type GraphSelectedDetail,
} from '../src/widgets/app-shell/modules/dex-relationship-graph.js';
import { buildRelationshipGraph, type RelationshipGraph } from '../src/model/graph/relationshipGraph.js';
import { layoutGraph } from '../src/model/graph/layout.js';

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

const pointer = (type: string, target: Element, x: number, y: number) =>
  target.dispatchEvent(new MouseEvent(type, { bubbles: true, composed: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
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
    const el = await graph();
    expect(labels(el)).toEqual(NAMES);
    const layout = layoutGraph(GRAPH, new Set(GRAPH.boxes.filter((b) => b.items.length).map((b) => b.id)));
    for (const b of layout.boxes) {
      const box = boxEl(el, b.id);
      expect([box.style.left, box.style.top, box.style.width, box.style.height]).toEqual([`${b.x}px`, `${b.y}px`, `${b.width}px`, `${b.height}px`]);
    }
    expect(boxEl(el, idOf('caseRefs.slx')).classList.contains('model')).toBe(true);
    expect(boxEl(el, idOf('CaseBp.mat')).classList.contains('mat')).toBe(true);
    expect(boxEl(el, idOf('chained.sldd')).querySelector('dex-icon')!.iconId).toBe('simulink_database');
  });

  it('opens every box with items by default, and only those `expanded` names once it is set', async () => {
    const el = await graph();
    expect(sr(el).querySelectorAll('.item')).toHaveLength(8);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain1')).textContent!.trim()).toBe('Gain1');
    el.expanded = [idOf('CaseBp.mat')];
    await el.updateComplete;
    expect([...sr(el).querySelectorAll<HTMLElement>('.item')].map((i) => i.dataset.id)).toEqual([itemIdOf('CaseBp.mat', 'Bp')]);
    el.expanded = [];
    await el.updateComplete;
    expect(sr(el).querySelectorAll('.item')).toHaveLength(0);
  });

  it('draws each edge the layout routes, by kind, and labels a usage with its parameter', async () => {
    const el = await graph();
    const paths = [...sr(el).querySelectorAll<SVGPathElement>('path.edge')];
    expect(paths).toHaveLength(GRAPH.edges.length);
    const kinds = paths.map((p) => [...p.classList].find((c) => c !== 'edge' && c !== 'dim'));
    expect(kinds.filter((k) => k === 'param-usage')).toHaveLength(4);
    expect(kinds.filter((k) => k === 'data-link')).toHaveLength(3);
    expect(kinds.filter((k) => k === 'sldd-ref')).toHaveLength(1);
    expect([...sr(el).querySelectorAll('text.edge-label')].map((t) => t.textContent).sort()).toEqual(['Gain', 'Gain', 'Gain', 'Value']);
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
    const el = await graph();
    boxEl(el, idOf('CaseBp.mat')).click();
    await el.updateComplete;
    expect(dimmed(el)).toEqual(['CaseParams.sldd', 'chained.sldd', 'ExtraDict.sldd']);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Const1')).classList.contains('dim')).toBe(false);
    expect(itemEl(el, itemIdOf('caseRefs.slx', 'Gain1')).classList.contains('dim')).toBe(true);
  });

  it('selects an item on a click, not its box, and lights only what it reaches', async () => {
    const el = await graph();
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
    const el = await graph();
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
    const el = await graph();
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
      { id: idOf('CaseBp.mat'), expanded: true },
    ]);
    expect(sr(el).querySelectorAll('.item')).toHaveLength(4);
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
    expect(after.scale).toBeGreaterThan(before.scale);
    // The canvas point under (200, 100) is the same before and after.
    expect((200 - after.x) / after.scale).toBeCloseTo((200 - before.x) / before.scale, 6);
    expect((100 - after.y) / after.scale).toBeCloseTo((100 - before.y) / before.scale, 6);
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
    sized(el, 500, 300);
    const layout = layoutGraph(GRAPH, new Set(GRAPH.boxes.filter((b) => b.items.length).map((b) => b.id)));
    for (const fit of [() => el.fit(), () => button(el, 'Fit to view').click()]) {
      button(el, 'Zoom in').click();
      fit();
      await el.updateComplete;
      const v = view(el);
      expect(v.scale).toBeLessThanOrEqual(1);
      expect(v.x).toBeGreaterThanOrEqual(0);
      expect(v.y).toBeGreaterThanOrEqual(0);
      expect(v.x + layout.width * v.scale).toBeLessThanOrEqual(500 + 1e-6);
      expect(v.y + layout.height * v.scale).toBeLessThanOrEqual(300 + 1e-6);
    }
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
    const box = layoutGraph(GRAPH, new Set(GRAPH.boxes.filter((b) => b.items.length).map((b) => b.id))).boxes.find((b) => b.id === idOf('chained.sldd'))!;
    const v = view(el);
    expect(v.x + (box.x + box.width / 2) * v.scale).toBeCloseTo(400, 6);
    expect(v.y + (box.y + box.height / 2) * v.scale).toBeCloseTo(300, 6);
  });

  it('reveals a box or an item at the middle of the canvas', async () => {
    const el = await graph();
    sized(el, 800, 600);
    const layout = layoutGraph(GRAPH, new Set(GRAPH.boxes.filter((b) => b.items.length).map((b) => b.id)));
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
    for (const b of sr(el).querySelectorAll<HTMLButtonElement>('.box button')) expect(b.tabIndex).toBe(-1);
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

  it('opens the selected box with Enter, and shows or hides its items with Space', async () => {
    const el = await graph(GRAPH, (e) => (e.selected = idOf('caseRefs.slx')));
    expect(key(el, 'Enter').defaultPrevented).toBe(true);
    key(el, ' ');
    expect(opened).toEqual([{ uri: 'mem:///w/caseRefs.slx' }]);
    expect(expand).toEqual([{ id: idOf('caseRefs.slx'), expanded: false }]);
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
    expect(sr(el).querySelector('.legend-content')).toBeNull();
    toggle.click();
    await el.updateComplete;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect([...sr(el).querySelectorAll('.legend-content li')].map((li) => li.textContent!.trim())).toEqual([
      'Model Reference',
      'Dictionary Reference',
      'Data Link',
      'Parameter Usage',
      'Workspace Usage',
      'Model',
      'Dictionary',
      'MAT-File',
      'Not Open',
    ]);
    toggle.click();
    await el.updateComplete;
    expect(sr(el).querySelector('.legend-content')).toBeNull();
  });
});

describe('defining', () => {
  it('registers under its default tag, and is the class the tag names', () => {
    expect(customElements.get('dex-relationship-graph')).toBe(DexRelationshipGraph);
    expect(customElements.get('dex-icon')).toBeDefined();
  });
});
