// Copyright 2026 The MathWorks, Inc.
//
// The relationship graph's wiring on its own (connect/graphPane.ts), over a stand-in for the
// element: what the page tests cannot time. The graph is built REBUILD_MS after the first change
// since the last build, once for every change in that time, and only while it is shown; an
// open file's bytes are drawn over the folder's of the same file; a reveal waits for the build it
// needs; a ghost is looked for from the file that references it; a box gone is open no more.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import type { RawSource } from '../../src/model/usage/usageCells.js';
import type { FolderView } from '../../src/widgets/app-shell/connect/folder.js';
import { connectGraphPane, referencedId, REBUILD_MS, type GraphPaneContext, type GraphTab } from '../../src/widgets/app-shell/connect/graphPane.js';
import type { GraphBox, GraphEdgeKind, RelationshipGraph } from '../../src/model/graph/graphTypes.js';
import type { DexRelationshipGraph } from '../../src/widgets/app-shell/modules/dex-relationship-graph.js';

const bytesOf = (name: string) => new Uint8Array(readFileSync(path.join(import.meta.dirname, 'fixtures', name)));
const tabOf = (name: string): GraphTab => ({ path: `/w/${name}`, bytes: bytesOf(name) });
const sourceOf = (name: string, bytes = bytesOf(name)): RawSource => ({ uriString: `file:///w/${name}`, path: `/w/${name}`, bytes: bytes.slice().buffer });

/** The element, as the pane drives it: its properties, its reveal, the events it sends, and how many graphs it was given. */
function stubGraph() {
  let graph: unknown = null;
  const el = Object.assign(new EventTarget(), { expanded: [] as string[], selected: null as string | null, reveal: vi.fn(), builds: 0 });
  Object.defineProperty(el, 'graph', { get: () => graph, set: (g: unknown) => ((graph = g), el.builds++) });
  return el as unknown as DexRelationshipGraph & { reveal: ReturnType<typeof vi.fn>; builds: number };
}

/** A pane over `tabs`, shown while `on.shown`, and what it was asked to do. */
function pane(tabs: GraphTab[], over: Partial<GraphPaneContext> = {}) {
  const el = stubGraph();
  const on = { shown: true };
  const context: GraphPaneContext = {
    tabs: () => tabs,
    folder: () => undefined,
    shown: () => on.shown,
    open: vi.fn(),
    notOpen: vi.fn(),
    failed: vi.fn(),
    ...over,
  };
  return { el, on, context, pane: connectGraphPane(el, context) };
}

const labels = (el: DexRelationshipGraph) => (el.graph?.boxes ?? []).map((b) => (b.ghost ? `ghost ${b.ref}` : b.label));
const pause = () => vi.advanceTimersByTimeAsync(REBUILD_MS);

beforeEach(() => void vi.useFakeTimers());
afterEach(() => void vi.useRealTimers());

describe('the graph pane', () => {
  it('builds REBUILD_MS after the first change, once for every change in that time, and only while shown', async () => {
    const tabs = [tabOf('shadow_ws.slx')];
    const { el, on, pane: p } = pane(tabs);
    p.refresh();
    await vi.advanceTimersByTimeAsync(REBUILD_MS - 1);
    expect(el.builds).toBe(0);
    tabs.push(tabOf('params.sldd'));
    p.refresh();
    p.refresh();
    await vi.advanceTimersByTimeAsync(1);
    expect(el.builds).toBe(1);
    expect(labels(el)).toEqual(['shadow_ws.slx', 'params.sldd']);
    // Nothing changed: nothing is built.
    p.refresh();
    await pause();
    expect(el.builds).toBe(1);
    // Changed behind a tab: built only once the graph is shown again.
    on.shown = false;
    tabs.pop();
    p.refresh();
    await pause();
    expect(el.builds).toBe(1);
    on.shown = true;
    p.refresh();
    await pause();
    expect(el.builds).toBe(2);
    expect(labels(el)).toEqual(['shadow_ws.slx', 'ghost params.sldd']);
  });

  it("draws an open file's bytes over the folder's, and builds again when the folder changes", async () => {
    // The folder's params.sldd holds no Uo, which the model reads: drawn from the folder, it has no item.
    const changed = new TextDecoder().decode(bytesOf('params.sldd')).replaceAll('"Uo"', '"Uq"');
    let folderFiles = [sourceOf('shadow_ws.slx'), sourceOf('params.sldd', new TextEncoder().encode(changed))];
    const folder = { graphSources: async () => folderFiles } as unknown as FolderView;
    const tabs: GraphTab[] = [];
    const { el, pane: p } = pane(tabs, { folder: () => folder });
    p.stale();
    await pause();
    const items = () => el.graph!.boxes.find((b) => b.label === 'params.sldd')!.items.map((i) => i.name);
    expect(labels(el)).toEqual(['shadow_ws.slx', 'params.sldd']);
    expect(items()).toEqual([]);
    tabs.push(tabOf('params.sldd'));
    p.refresh();
    await pause();
    expect(labels(el)).toEqual(['params.sldd', 'shadow_ws.slx']);
    expect(items()).toEqual(['Uo']);
    folderFiles = [];
    p.stale();
    await pause();
    expect(labels(el)).toEqual(['params.sldd']);
  });

  it('reveals once the graph holds what it names, its box opened for an item', async () => {
    const tabs = [tabOf('params.sldd'), tabOf('shadow_ws.slx')];
    const { el, pane: p } = pane(tabs);
    p.reveal('file:///w/params.sldd', 'Uo');
    expect(el.reveal).not.toHaveBeenCalled();
    await pause();
    const params = el.graph!.boxes.find((b) => b.label === 'params.sldd')!;
    const uo = params.items.find((i) => i.name === 'Uo')!;
    expect(el.reveal).toHaveBeenCalledWith(uo.id);
    expect(el.selected).toBe(uo.id);
    expect(el.expanded).toEqual([params.id]);
    // Up to date: at once; a box, as it is.
    p.reveal('file:///w/shadow_ws.slx');
    expect(el.reveal).toHaveBeenLastCalledWith('file:///w/shadow_ws.slx');
    expect(el.expanded).toEqual([params.id]);
    // A file opened just now, before any refresh: the reveal waits for the graph that draws it.
    tabs.push(tabOf('shared_gain.slx'));
    p.reveal('file:///w/shared_gain.slx');
    expect(el.reveal).toHaveBeenCalledTimes(2);
    await pause();
    expect(el.reveal).toHaveBeenLastCalledWith('file:///w/shared_gain.slx');
  });

  it("shows a model's reference row as the file it names, or its ghost, and any other row as its item", async () => {
    const rows = [
      { ID: 'section:dataSources', parent: null, Name: { label: 'External Data' } },
      { ID: 'ds/params', parent: 'section:dataSources', Name: { label: 'params.sldd' } },
      { ID: 'section:blocks', parent: null, Name: { label: 'Model Elements' } },
      { ID: 'b/2', parent: 'section:blocks', Name: { label: 'DictOnly' }, _blockKey: '2' },
    ] as unknown as TreeTableRow[];
    const tabs = [tabOf('shadow_ws.slx'), tabOf('params.sldd')];
    const { el, pane: p } = pane(tabs);
    p.showRow('file:///w/shadow_ws.slx', rows, 'ds/params');
    await pause();
    expect(el.reveal).toHaveBeenLastCalledWith('file:///w/params.sldd');
    p.showRow('file:///w/shadow_ws.slx', rows, 'b/2');
    expect(el.reveal).toHaveBeenLastCalledWith(el.graph!.boxes[0]!.items.find((i) => i.name === 'DictOnly')!.id);
    p.showRow('file:///w/shadow_ws.slx', rows, null);
    expect(el.reveal).toHaveBeenLastCalledWith('file:///w/shadow_ws.slx');
    // The dictionary closed: the model's reference is its ghost, named as the model spells it.
    tabs.pop();
    p.showRow('file:///w/shadow_ws.slx', rows, 'ds/params');
    await pause();
    const ghost = el.graph!.boxes.find((b) => b.ghost)!;
    expect(ghost.label.toLowerCase()).toBe('params.sldd');
    expect(el.reveal).toHaveBeenLastCalledWith(ghost.id);
  });

  it("reveals a reference row's file by its section's kind of link, and its name before its stem", () => {
    // A model referencing plant.slx and linking plant.sldd and plant.mat: a row of its External
    // Data is a data link's, of its Model References a model reference's.
    const box = (label: string, kind: GraphBox['kind']): GraphBox => ({ id: `file:///w/${label}`, uri: `file:///w/${label}`, kind, label, ghost: false, items: [] });
    const link = (kind: GraphEdgeKind, to: string) => ({ id: `${kind}:${to}`, kind, from: 'file:///w/m.slx', to: `file:///w/${to}` });
    const graph: RelationshipGraph = {
      boxes: [box('m.slx', 'model'), box('plant.slx', 'model'), box('plant.sldd', 'sldd'), box('plant.mat', 'mat')],
      edges: [link('model-ref', 'plant.slx'), link('data-link', 'plant.sldd'), link('data-link', 'plant.mat')],
    };
    expect(referencedId(graph, 'file:///w/m.slx', 'plant.sldd', 'section:dataSources')).toBe('file:///w/plant.sldd');
    expect(referencedId(graph, 'file:///w/m.slx', 'plant.mat', 'section:dataSources')).toBe('file:///w/plant.mat');
    // A name without its extension: the model under Model References, a data file under External Data.
    expect(referencedId(graph, 'file:///w/m.slx', 'plant', 'section:references')).toBe('file:///w/plant.slx');
    expect(referencedId(graph, 'file:///w/m.slx', 'plant', 'section:dataSources')).toBe('file:///w/plant.sldd');
    // A name no link of the section's kind is drawn to, or a row of another section: none.
    expect(referencedId(graph, 'file:///w/m.slx', 'other.sldd', 'section:dataSources')).toBeNull();
    expect(referencedId(graph, 'file:///w/m.slx', 'plant.sldd', 'section:design')).toBeNull();
  });

  it('opens a box or an item, and looks for a ghost from the file that references it', async () => {
    const resolveLink = vi.fn(async (link: { file: string }) => (link.file === 'params.sldd' ? 'file:///d/params.sldd' : null));
    const folder = { graphSources: async () => [], resolveLink } as unknown as FolderView;
    const { el, context, pane: p } = pane([tabOf('shadow_ws.slx')], { folder: () => folder });
    p.refresh();
    await pause();
    const open = (detail: object) => el.dispatchEvent(new CustomEvent('dex-graph-open', { detail }));
    open({ uri: 'file:///w/shadow_ws.slx', name: '2' });
    expect(context.open).toHaveBeenLastCalledWith('file:///w/shadow_ws.slx', '2');
    open({ uri: '', ref: 'params.sldd' });
    await vi.waitFor(() => expect(context.open).toHaveBeenLastCalledWith('file:///d/params.sldd'));
    expect(resolveLink).toHaveBeenCalledWith({ kind: 'file', file: 'params.sldd' }, 'file:///w/shadow_ws.slx');
    // Not found, or no folder to look in: not open.
    resolveLink.mockResolvedValueOnce(null);
    open({ uri: '', ref: 'params.sldd' });
    await vi.waitFor(() => expect(context.notOpen).toHaveBeenCalledWith('params.sldd'));
  });

  it("shows and hides a box's items as it asks, and a box gone is open no more", async () => {
    const tabs = [tabOf('params.sldd'), tabOf('shadow_ws.slx')];
    const { el, pane: p } = pane(tabs);
    p.refresh();
    await pause();
    const expand = (id: string, expanded: boolean) => el.dispatchEvent(new CustomEvent('dex-graph-expand', { detail: { id, expanded } }));
    expand('file:///w/params.sldd', true);
    expand('file:///w/shadow_ws.slx', true);
    expand('file:///w/shadow_ws.slx', false);
    expect(el.expanded).toEqual(['file:///w/params.sldd']);
    tabs.shift();
    p.refresh();
    await pause();
    expect(el.expanded).toEqual([]);
  });

  it('says nothing failed when the folder it was reading is let go for another, and draws the new one', async () => {
    let rejectOld: (err: Error) => void = () => {};
    const old = { graphSources: () => new Promise((_, reject) => (rejectOld = reject)) } as unknown as FolderView;
    const next = { graphSources: async () => [sourceOf('shared_gain.slx')] } as unknown as FolderView;
    let folder = old;
    const { el, context, pane: p } = pane([], { folder: () => folder });
    p.stale();
    await pause();
    // Another folder shown: the old one's reader is closed, which rejects what it was asked.
    folder = next;
    rejectOld(new Error('This folder reader is closed.'));
    p.stale();
    await pause();
    expect(context.failed).not.toHaveBeenCalled();
    expect(labels(el)).toEqual(['shared_gain.slx', 'ghost Params.SLDD']);
  });

  it('builds one graph at a time: a change while one builds is drawn by exactly one more, when it ends', async () => {
    const asked: ((sources: RawSource[]) => void)[] = [];
    const folder = { graphSources: () => new Promise<RawSource[]>((answer) => asked.push(answer)) } as unknown as FolderView;
    const tabs = [tabOf('params.sldd')];
    const { el, pane: p } = pane(tabs, { folder: () => folder });
    p.refresh();
    await pause();
    expect(asked).toHaveLength(1);
    // Two changes while it reads the folder.
    tabs.push(tabOf('shadow_ws.slx'));
    p.refresh();
    await pause();
    p.stale();
    await pause();
    expect(asked).toHaveLength(1);
    asked[0]!([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toHaveLength(2);
    asked[1]!([]);
    await pause();
    expect(asked).toHaveLength(2);
    expect(labels(el)).toEqual(['params.sldd', 'shadow_ws.slx']);
  });

  it('keeps a reveal for the build after one whose folder changed while it ran', async () => {
    const asked: ((sources: RawSource[]) => void)[] = [];
    const folder = { graphSources: () => new Promise<RawSource[]>((answer) => asked.push(answer)) } as unknown as FolderView;
    const { el, pane: p } = pane([tabOf('shadow_ws.slx')], { folder: () => folder });
    p.refresh();
    await pause();
    // A file written into the folder while the build reads it, and asked to be shown.
    p.stale();
    p.reveal('file:///w/shared_gain.slx');
    asked[0]!([]);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.reveal).not.toHaveBeenCalled();
    expect(asked).toHaveLength(2);
    asked[1]!([sourceOf('shared_gain.slx')]);
    await vi.advanceTimersByTimeAsync(0);
    expect(el.reveal).toHaveBeenCalledWith('file:///w/shared_gain.slx');
  });

  it('builds once for a folder shown in place of another mid-build, not again from the pause the change armed', async () => {
    let rejectOld: (err: Error) => void = () => {};
    const old = { graphSources: () => new Promise((_, reject) => (rejectOld = reject)) } as unknown as FolderView;
    const next = { graphSources: vi.fn(async () => [sourceOf('shared_gain.slx')]) } as unknown as FolderView & { graphSources: ReturnType<typeof vi.fn> };
    let folder: FolderView = old;
    const { el, pane: p } = pane([], { folder: () => folder });
    p.stale();
    await pause();
    folder = next;
    p.stale();
    rejectOld(new Error('This folder reader is closed.'));
    await pause();
    await pause();
    expect(next.graphSources).toHaveBeenCalledTimes(1);
    expect(el.builds).toBe(1);
  });

  it('drops a reveal its build could not make, rather than making it on a later build', async () => {
    let refuse = true;
    const folder = { graphSources: async () => (refuse ? Promise.reject(new Error('EACCES')) : []) } as unknown as FolderView;
    const { el, context, pane: p } = pane([tabOf('params.sldd')], { folder: () => folder });
    p.reveal('file:///w/params.sldd');
    await pause();
    expect(context.failed).toHaveBeenCalledTimes(1);
    refuse = false;
    p.stale();
    await pause();
    expect(el.graph).not.toBeNull();
    expect(el.reveal).not.toHaveBeenCalled();
  });

  it('says a graph that could not be built, and builds nothing after dispose', async () => {
    const folder = { graphSources: async () => Promise.reject(new Error('the host went away')) } as unknown as FolderView;
    const { el, context, pane: p } = pane([tabOf('params.sldd')], { folder: () => folder });
    p.refresh();
    await pause();
    expect(context.failed).toHaveBeenCalledWith('Could not draw the graph: the host went away');
    const after = pane([tabOf('params.sldd')]);
    after.pane.refresh();
    after.pane.dispose();
    await pause();
    expect(after.el.graph).toBeNull();
    expect(el.graph).toBeNull();
  });
});
