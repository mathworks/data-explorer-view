// Copyright 2026 The MathWorks, Inc.
//
// The relationship graph's wiring on its own (connect/graphPane.ts), over a stand-in for the
// element: what the page tests cannot time. The graph is built a pause (REBUILD_MS) after what it
// is drawn from last changed, once for every change in that pause, and only while it is shown; an
// open file's bytes are drawn over the folder's of the same file; a reveal waits for the build it
// needs; a ghost is looked for from the file that references it; a box gone is open no more.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RawSource } from '../../src/model/usage/usageCells.js';
import type { FolderView } from '../../src/widgets/app-shell/connect/folder.js';
import { connectGraphPane, REBUILD_MS, type GraphPaneContext, type GraphTab } from '../../src/widgets/app-shell/connect/graphPane.js';
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
  it('builds a pause after the last change, once for every change in it, and only while shown', async () => {
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
