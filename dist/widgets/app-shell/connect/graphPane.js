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
// not found. A box's +/− asks to show or hide its items, which the shell answers by `expanded`. A
// click selects a box (or an item), whose file's page the shell shows in the inspector, and a
// dimmed segment for it in the location bar (`selectedFile`), until the background is clicked.
import { isGraphPath } from 'data-explorer-core';
import { graphFilePage } from '../../../model/inspector/inspectorPages.js';
import { buildRelationshipGraph } from '../../../model/graph/relationshipGraph.js';
import { graphIdOf } from '../../../model/graph/graphTypes.js';
import { buildSectionRowId } from '../../../model/ids/sectionRowId.js';
import { sourceUri } from '../../../model/source/sourceUri.js';
import { graphNameOf, rowIn } from './rows.js';
/**
 * How long after the first change since the last build the graph is built again, in ms: every
 * change in that time is drawn by the one build, and a change during it waits for none of its own
 * (it throttles, it does not wait for the changes to stop).
 */
export const REBUILD_MS = 300;
/**
 * The sections of a model's table whose rows name another file, and the links a row of each is
 * drawn as: what a Show in Graph on one reveals. External Data, a dictionary or a MAT-file the model
 * links; Model References, a model it references.
 */
const REFERENCE_SECTIONS = new Map([
    [buildSectionRowId('dataSources'), new Set(['data-link', 'sldd-ref'])],
    [buildSectionRowId('references'), new Set(['model-ref'])],
]);
/** A file's name in any case, with no extension: a model reference may name its model without one. */
const stemOf = (name) => name.toLowerCase().replace(/\.[^./\\]*$/, '');
/**
 * The box the reference `ref`, a row of the file `uri`'s table in the section `section`, is drawn
 * to: the file it resolves to, or the ghost of the name, at the end of a link of the section's kind
 * from the file's box. By its name in any case, and else by its name without the extension (a model
 * reference may leave it out): `plant.sldd` under External Data is plant.sldd's box, not the model
 * plant.slx's. Null where the file's box has no such link.
 */
export function referencedId(graph, uri, ref, section) {
    const kinds = REFERENCE_SECTIONS.get(section);
    const from = graph.boxes.find((b) => !b.ghost && b.uri === uri);
    if (!kinds || !from)
        return null;
    const linked = graph.edges
        .filter((edge) => edge.from === from.id && kinds.has(edge.kind))
        .flatMap((edge) => graph.boxes.filter((b) => b.id === edge.to));
    const named = ref.toLowerCase();
    return (linked.find((b) => b.label.toLowerCase() === named) ?? linked.find((b) => stemOf(b.label) === stemOf(ref)))?.id ?? null;
}
const message = (err) => (err instanceof Error ? err.message : String(err));
/** The open files the graph draws: the tabs of a kind it reads that hold their bytes. */
function openFiles(tabs) {
    return tabs.flatMap((t) => (t.bytes && isGraphPath(t.path) ? [{ uri: sourceUri(t.path), path: t.path, bytes: t.bytes }] : []));
}
/** The bytes as their own ArrayBuffer, which a RawSource holds. */
const bufferOf = (bytes) => (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer);
/** Wire `el` to the open tabs and the folder. */
export function connectGraphPane(el, context) {
    let outOfDate = true;
    // The open files the last build drew, or a refresh saw since: one other than these is a change.
    let seen = [];
    let timer;
    let building = false;
    // What to reveal once the graph holds it: an item by `name`, a reference by `ref` (a row of the
    // table's `section`), else the box.
    let pendingReveal = null;
    let disposed = false;
    const check = () => {
        const files = openFiles(context.tabs());
        if (files.length === seen.length && files.every((f, i) => f.uri === seen[i].uri && f.bytes === seen[i].bytes))
            return;
        seen = files;
        outOfDate = true;
    };
    const showRevealed = (graph) => {
        if (!pendingReveal || !graph)
            return;
        const { uri, name, ref } = pendingReveal;
        const referenced = ref === undefined ? null : referencedId(graph, uri, ref.name, ref.section);
        const id = referenced ?? graphIdOf(graph, uri, name);
        pendingReveal = null;
        if (!id)
            return;
        // An item is drawn in its box only while the box is open. A file's own box is opened onto its
        // items too, as the prototype's Show in Graph opened a model onto its blocks and what they read;
        // the file a reference row names is shown as it is, being where the reference leads.
        const box = graph.boxes.find((b) => b.items.some((i) => i.id === id)) ??
            (referenced === null ? graph.boxes.find((b) => b.id === id && b.items.length > 0) : undefined);
        if (box && !el.expanded.includes(box.id))
            el.expanded = [...el.expanded, box.id];
        el.selected = id;
        // The view onto it and what it reaches, as its selection lights them, rather than onto it alone
        // at whatever scale the view had.
        el.zoomToReach(id);
        context.selected?.();
    };
    // One build at a time: asked for while one runs, the graph is out of date, and is built once more
    // when that one ends. A build of a folder that was let go for another meanwhile draws nothing and
    // says nothing (its reader is closed, which rejects what it was asked): the next one draws the
    // folder shown now.
    async function build() {
        if (building) {
            outOfDate = true;
            return;
        }
        building = true;
        outOfDate = false;
        const shownFolder = context.folder();
        try {
            const folder = (await shownFolder?.graphSources()) ?? [];
            if (disposed)
                return;
            if (context.folder() !== shownFolder) {
                outOfDate = true;
                return;
            }
            // The open files as they are once the folder answered, an open file's bytes over the folder's.
            seen = openFiles(context.tabs());
            const open = seen.map((f) => ({ uriString: f.uri, path: f.path, bytes: bufferOf(f.bytes) }));
            const opened = new Set(open.map((s) => s.uriString));
            const graph = buildRelationshipGraph([...open, ...folder.filter((s) => !opened.has(s.uriString))]);
            el.graph = graph;
            // A box gone from the graph is open no more.
            const ids = new Set(graph.boxes.map((b) => b.id));
            if (el.expanded.some((id) => !ids.has(id)))
                el.expanded = el.expanded.filter((id) => ids.has(id));
            // What is selected is drawn anew: its page may say other things of it.
            if (el.selected !== null)
                context.selected?.();
            // Its inputs changed while it ran (the folder): the build after it, which draws them, reveals.
            if (!outOfDate)
                showRevealed(graph);
        }
        catch (err) {
            if (disposed)
                return;
            if (context.folder() !== shownFolder) {
                outOfDate = true;
                return;
            }
            // What it was to reveal is not shown by a later build, long after it was asked for.
            pendingReveal = null;
            context.failed(`Could not draw the graph: ${message(err)}`);
        }
        finally {
            building = false;
            if (!disposed && outOfDate && context.shown())
                void build();
        }
    }
    const revealWhenDrawn = (what) => {
        pendingReveal = what;
        check();
        // Out of date, or being built: the reveal waits for the build. Else it is the graph there is.
        if (outOfDate)
            schedule();
        else if (!building && timer === undefined)
            showRevealed(el.graph);
    };
    const schedule = () => {
        if (timer !== undefined || disposed || !context.shown())
            return;
        timer = setTimeout(() => {
            timer = undefined;
            // Nothing to build where a build since (the one after a build the change ran into) drew it.
            if (!disposed && outOfDate && context.shown())
                void build();
        }, REBUILD_MS);
    };
    // A file by the name `ref` a file of the graph references it by, looked for as a link to it would
    // be, through the folder, from `fromUri`: by default the file that wrote the reference, a box with
    // an edge to its ghost.
    const openRef = (ref, fromUri) => {
        const graph = el.graph;
        const ghost = graph?.boxes.find((b) => b.ghost && b.ref === ref);
        const from = graph?.edges.find((edge) => edge.to === ghost?.id)?.from;
        const referrer = fromUri ?? graph?.boxes.find((b) => b.id === from)?.uri ?? '';
        const folder = context.folder();
        void Promise.resolve(folder?.resolveLink({ kind: 'file', file: ref }, referrer)).then((found) => (found ? context.open(found) : context.notOpen(ref)), () => context.notOpen(ref));
    };
    const onOpen = (e) => {
        const { uri, name, ref } = e.detail;
        if (uri)
            return context.open(uri, name);
        if (ref)
            openRef(ref);
    };
    const onSelected = () => context.selected?.();
    const onExpand = (e) => {
        const { id, expanded } = e.detail;
        const rest = el.expanded.filter((x) => x !== id);
        el.expanded = expanded ? [...rest, id] : rest;
    };
    el.addEventListener('dex-graph-open', onOpen);
    el.addEventListener('dex-graph-expand', onExpand);
    el.addEventListener('dex-graph-selected', onSelected);
    // The selected file's page, kept while what it is drawn from is as it was: the graph, the
    // selection, and the open tabs with their unsaved state.
    let page = null;
    const selectedFile = () => {
        const graph = el.graph;
        const selected = el.selected;
        const tabs = context.tabs();
        const open = tabs.map((t) => `${sourceUri(t.path)}${t.dirty ? '*' : ''}`).join('|');
        if (page && page.graph === graph && page.selected === selected && page.open === open)
            return page.file;
        const state = (uri) => {
            const tab = tabs.find((t) => sourceUri(t.path) === uri);
            return tab ? { dirty: !!tab.dirty } : undefined;
        };
        const file = graph && selected !== null ? graphFilePage(graph, selected, state) : null;
        page = { graph, selected, open, file };
        return file;
    };
    return {
        stale() {
            outOfDate = true;
            schedule();
        },
        refresh() {
            check();
            if (outOfDate)
                schedule();
        },
        reveal(uri, name) {
            revealWhenDrawn({ uri, ...(name === undefined ? {} : { name }) });
        },
        showRow(uri, rows, rowId) {
            const row = rowId === null ? undefined : rowIn(rows, rowId);
            if (row?.parent && REFERENCE_SECTIONS.has(row.parent))
                return revealWhenDrawn({ uri, ref: { name: row.Name.label, section: row.parent } });
            const name = rowId === null ? undefined : graphNameOf(rows, rowId);
            revealWhenDrawn({ uri, ...(name === undefined ? {} : { name }) });
        },
        selectedFile,
        openSelected() {
            const box = selectedFile()?.box;
            if (box && !box.ghost)
                context.open(box.uri);
            else if (box?.ref)
                openRef(box.ref);
        },
        openLink(target) {
            const box = el.graph?.boxes.find((b) => !b.ghost && b.uri === target);
            if (box)
                return context.open(box.uri);
            const from = selectedFile()?.box;
            openRef(target, from && !from.ghost ? from.uri : undefined);
        },
        setLayout(layout) {
            el.layout = layout;
        },
        dispose() {
            disposed = true;
            if (timer !== undefined)
                clearTimeout(timer);
            el.removeEventListener('dex-graph-open', onOpen);
            el.removeEventListener('dex-graph-expand', onExpand);
            el.removeEventListener('dex-graph-selected', onSelected);
        },
    };
}
