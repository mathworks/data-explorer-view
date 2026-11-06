// Copyright 2026 The MathWorks, Inc.
//
// The relationship graph's wiring: <dex-relationship-graph>, which the Explorer's Root shows in the
// center while files are open, drawn from every open file's bytes (what the host read, and after a
// save what was saved, as the tabs keep them) and the shown folder's files, read through the
// folder's reader. Built again whenever that may have changed: a tab whose bytes are other than the
// last build's (a file opened, closed, saved or reloaded), a folder shown or changed (`stale`). Only
// while it is shown, since each build lists the folder and asks each file's version (reading again
// the files whose version moved): a graph that went out of date behind a tab is built as Root is
// shown again.
//
// What the graph asks: a double-click opens a box's file, or an item's on its row (the shell opens
// it as a preview); a ghost, a file referenced and not open, is looked for as a link to it would
// be, through the folder, from the file that references it, and said not to be open where it is
// not found. A box's +/− asks to show or hide its items, which the shell answers by `expanded`.

import { isGraphPath } from 'data-explorer-core';
import { buildRelationshipGraph } from '../../../model/graph/relationshipGraph.js';
import { graphIdOf, type RelationshipGraph } from '../../../model/graph/graphTypes.js';
import { sourceUri } from '../../../model/source/sourceUri.js';
import type { RawSource } from '../../../model/usage/usageCells.js';
import type { DexRelationshipGraph } from '../modules/dex-relationship-graph.js';
import type { FolderView } from './folder.js';

/** How long what the graph is drawn from must be still before it is built again, in ms. */
export const REBUILD_MS = 300;

/** A tab, as the graph draws it: its file, and the bytes the file holds as the shell last read or wrote them. */
export interface GraphTab {
  path: string;
  bytes?: Uint8Array;
}

/** What the graph is drawn from, and what its requests do. */
export interface GraphPaneContext {
  /** The open tabs, in their order. */
  tabs(): readonly GraphTab[];
  /** The folder shown now, if any. */
  folder(): FolderView | undefined;
  /** Whether the graph is on screen: Root, with files open. */
  shown(): boolean;
  /** Open the file of `uri`, as a preview, on the row `name` names, if it names one. */
  open(uri: string, name?: string): void;
  /** Say that the file `ref` names is not open, and was not found. */
  notOpen(ref: string): void;
  /** Say that the graph could not be built: why. */
  failed(message: string): void;
}

/** The graph pane, as connectShell drives it. */
export interface GraphPane {
  /** The folder shown, or its files, changed: build again, after a pause, when the graph is shown. */
  stale(): void;
  /** Something changed (a tab, Root shown): build again, after a pause, if the graph is shown and out of date. */
  refresh(): void;
  /** Select and bring forward the box of the file `uri`, or its item `name` (opening its box), once the graph holds it. */
  reveal(uri: string, name?: string): void;
  dispose(): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The open files the graph draws: the tabs of a kind it reads that hold their bytes. */
function openFiles(tabs: readonly GraphTab[]): { uri: string; path: string; bytes: Uint8Array }[] {
  return tabs.flatMap((t) => (t.bytes && isGraphPath(t.path) ? [{ uri: sourceUri(t.path), path: t.path, bytes: t.bytes }] : []));
}

/** The bytes as their own ArrayBuffer, which a RawSource holds. */
const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer) as ArrayBuffer;

/** Wire `el` to the open tabs and the folder. */
export function connectGraphPane(el: DexRelationshipGraph, context: GraphPaneContext): GraphPane {
  let outOfDate = true;
  // The open files the last build drew, or a refresh saw since: one other than these is a change.
  let seen: ReturnType<typeof openFiles> = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let building = false;
  let pendingReveal: { uri: string; name?: string } | null = null;
  let disposed = false;

  const check = (): void => {
    const files = openFiles(context.tabs());
    if (files.length === seen.length && files.every((f, i) => f.uri === seen[i]!.uri && f.bytes === seen[i]!.bytes)) return;
    seen = files;
    outOfDate = true;
  };

  const showRevealed = (graph: RelationshipGraph | null): void => {
    if (!pendingReveal || !graph) return;
    const id = graphIdOf(graph, pendingReveal.uri, pendingReveal.name);
    pendingReveal = null;
    if (!id) return;
    // An item is drawn in its box only while the box is open.
    const box = graph.boxes.find((b) => b.items.some((i) => i.id === id));
    if (box && !el.expanded.includes(box.id)) el.expanded = [...el.expanded, box.id];
    el.selected = id;
    el.reveal(id);
  };

  // One build at a time: asked for while one runs, the graph is out of date, and is built once more
  // when that one ends. A build of a folder that was let go for another meanwhile draws nothing and
  // says nothing (its reader is closed, which rejects what it was asked): the next one draws the
  // folder shown now.
  async function build(): Promise<void> {
    if (building) {
      outOfDate = true;
      return;
    }
    building = true;
    outOfDate = false;
    const shownFolder = context.folder();
    try {
      const folder = (await shownFolder?.graphSources()) ?? [];
      if (disposed) return;
      if (context.folder() !== shownFolder) {
        outOfDate = true;
        return;
      }
      // The open files as they are once the folder answered, an open file's bytes over the folder's.
      seen = openFiles(context.tabs());
      const open: RawSource[] = seen.map((f) => ({ uriString: f.uri, path: f.path, bytes: bufferOf(f.bytes) }));
      const opened = new Set(open.map((s) => s.uriString));
      const graph = buildRelationshipGraph([...open, ...folder.filter((s) => !opened.has(s.uriString))]);
      el.graph = graph;
      // A box gone from the graph is open no more.
      const ids = new Set(graph.boxes.map((b) => b.id));
      if (el.expanded.some((id) => !ids.has(id))) el.expanded = el.expanded.filter((id) => ids.has(id));
      showRevealed(graph);
    } catch (err) {
      if (disposed) return;
      if (context.folder() !== shownFolder) {
        outOfDate = true;
        return;
      }
      // What it was to reveal is not shown by a later build, long after it was asked for.
      pendingReveal = null;
      context.failed(`Could not draw the graph: ${message(err)}`);
    } finally {
      building = false;
      if (!disposed && outOfDate && context.shown()) void build();
    }
  }

  const schedule = (): void => {
    if (timer !== undefined || disposed || !context.shown()) return;
    timer = setTimeout(() => {
      timer = undefined;
      if (!disposed && context.shown()) void build();
    }, REBUILD_MS);
  };

  const onOpen = (e: CustomEvent<{ uri: string; name?: string; ref?: string }>): void => {
    const { uri, name, ref } = e.detail;
    if (uri) return context.open(uri, name);
    if (!ref) return;
    // Looked for from the file that wrote the reference: a box with an edge to the ghost.
    const graph = el.graph;
    const ghost = graph?.boxes.find((b) => b.ghost && b.ref === ref);
    const from = graph?.edges.find((edge) => edge.to === ghost?.id)?.from;
    const fromUri = graph?.boxes.find((b) => b.id === from)?.uri ?? '';
    const folder = context.folder();
    void Promise.resolve(folder?.resolveLink({ kind: 'file', file: ref }, fromUri)).then(
      (found) => (found ? context.open(found) : context.notOpen(ref)),
      () => context.notOpen(ref),
    );
  };
  const onExpand = (e: CustomEvent<{ id: string; expanded: boolean }>): void => {
    const { id, expanded } = e.detail;
    const rest = el.expanded.filter((x) => x !== id);
    el.expanded = expanded ? [...rest, id] : rest;
  };
  el.addEventListener('dex-graph-open', onOpen);
  el.addEventListener('dex-graph-expand', onExpand);

  return {
    stale() {
      outOfDate = true;
      schedule();
    },
    refresh() {
      check();
      if (outOfDate) schedule();
    },
    reveal(uri, name) {
      pendingReveal = { uri, ...(name === undefined ? {} : { name }) };
      check();
      // Out of date, or being built: the reveal waits for the build. Else it is the graph there is.
      if (outOfDate) schedule();
      else if (!building && timer === undefined) showRevealed(el.graph);
    },
    dispose() {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      el.removeEventListener('dex-graph-open', onOpen);
      el.removeEventListener('dex-graph-expand', onExpand);
    },
  };
}
