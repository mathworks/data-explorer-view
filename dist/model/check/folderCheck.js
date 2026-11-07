// Copyright 2026 The MathWorks, Inc.
//
// A check of a folder: what is wrong in its references and its entries, as the app's command line
// reports it (`data-explorer check <folder>`). Over the same reads a folder session makes, the
// hierarchy's relationship graph (RelGraph, over graphSourcesOf) and the Usage column's index
// (core's planSummaries and buildUsageIndexFromSummaries), through one source cache, so that a
// check says what the Folder view and the Usage column say of the same folder, by their rules, and
// a folder an app already shows is not read twice.
//
// WHAT EACH KIND MEANS, and why it is no more than that:
//
//   unresolved-reference  A model's model reference, data dictionary or other external data, or a
//                         dictionary's referenced dictionary, that no file of the folder answers:
//                         the hierarchy's missing row (RelGraph.resolveFor finds nothing). A block
//                         parameter whose name nothing defines is NOT one. A file reader cannot
//                         tell a base-workspace variable, a function (`zeros`) or a constant (`pi`)
//                         from a missing one, and every model would read as broken.
//   cycle                 Files that reference each other round in a circle (a strongly connected
//                         component of the references, or a file that names itself), once each.
//   unused                An entry no block parameter of a model of the folder names: one whose
//                         Usage cell would be empty (UsageIndex.usagesOf). A dictionary's Design
//                         Data, a MAT-file's variables, a model's workspace. Data types and signals
//                         are skipped (UNUSED_SKIPPED_CLASSES): a model names them where the index
//                         does not look. And a data file no model links, directly or through a
//                         dictionary (core's usageScope), is listed once as not checked, as every
//                         entry of it would be unused and say nothing.
//   shadowed              A model workspace variable whose name the model's data defines too: the
//                         definition core's own resolution order (resolveName) reaches when the
//                         workspace is taken away, which the workspace hides from the model's blocks.
//                         The workspace is its own names, the MAT-file it is kept in and its masks,
//                         as core resolves it: a variable of a workspace kept in a MAT-file hides
//                         what a dictionary defines, and that MAT-file hides nothing of its own.
//   duplicate             A Design Data name two or more dictionaries define where Simulink reads
//                         them together: one dictionary and those it references, directly or not,
//                         or the dictionaries one model links. Two unrelated dictionaries of one
//                         folder that share a name is normal, and is not one.
//
// WHERE TWO DICTIONARIES SHARE A NAME (`params.sldd` here and in a subfolder), the check follows the
// Usage column: core's index keys a dictionary by its basename and the last in folder order wins,
// so a model's reference reads the one the Usage column shows, and its entries' use is counted there.
//
// Every model and data file is also opened, whole, one at a time, in a read-only workspace of its
// own, for its entries' sections and classes (readEntries), and the workspace is closed after it:
// a check of a large folder holds one file's rows at a time. DOM-free.
import { buildUsageIndexFromSummaries, isGraphPath, newSourceCache, planSummaries, resolveName, usageScope, } from 'data-explorer-core';
import { isTruncated } from '../hierarchy/folderList.js';
import { RelGraph } from '../hierarchy/graphModel.js';
import { graphSourcesOf } from '../hierarchy/graphSources.js';
import { basename } from '../ids/pathUtil.js';
import { readEntries } from '../source/entries.js';
import { createWorkspace } from '../source/workspace.js';
/** The kinds, in the order a check lists them. */
export const CHECK_FINDING_KINDS = ['unresolved-reference', 'cycle', 'unused', 'shadowed', 'duplicate'];
/**
 * Classes whose entries are never `unused`: what a model uses by name where core's usage index does
 * not look. Data types are named in a port's or a signal's data type, which core does not read as a
 * block parameter. A Simulink.Signal is resolved by a signal's name.
 */
export const UNUSED_SKIPPED_CLASSES = [
    'Simulink.AliasType',
    'Simulink.Bus',
    'Simulink.ConnectionBus',
    'Simulink.NumericType',
    'Simulink.Signal',
    'Simulink.ValueType',
    'Simulink.data.dictionary.EnumTypeDefinition',
];
/** The section of each kind of file whose entries a check looks at; a project's are none. */
const KEPT_SECTION = { dictionary: 'design', model: 'workspace', mat: '', project: undefined };
const SKIPPED = new Set(UNUSED_SKIPPED_CLASSES);
/** Code-unit order, JavaScript's `<`, as core's listFolder sorts: what every list of uris and names here is sorted by. */
const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const messageOf = (err) => (err instanceof Error ? err.message : String(err));
/**
 * Check a folder: its files' references (the hierarchy's graph), and their entries against the
 * usage index (the Usage column's). Every data file and model is also opened, whole, one at a
 * time, in a read-only workspace of its own, for its entries' sections and classes. Rejects only
 * when the listing does; a file that does not read is `unreadable`.
 */
export async function checkFolder(options) {
    const listing = await options.files.list();
    const reader = options.reader(listing);
    const cache = options.cache ?? newSourceCache();
    const sources = await graphSourcesOf(cache, reader, listing);
    const graph = new RelGraph(sources);
    const graphFiles = listing.filter((f) => isGraphPath(f.path));
    const summaries = await planSummaries(cache, reader, graphFiles, null);
    const index = buildUsageIndexFromSummaries(summaries);
    const { kept, unreadable } = await readKept(reader, graphFiles);
    // Who reaches each data file: the models usageScope finds for it, as the Usage column's graph
    // for that file is planned. A project resolves nothing, and is in no chain.
    const chains = sources.flatMap((s) => {
        const at = { uriString: s.uriString, path: s.path };
        if (s.type === 'model')
            return [{ ...at, kind: 'model', chain: [...(s.dataDictionary ? [s.dataDictionary] : []), ...s.dataSources] }];
        if (s.type === 'sldd')
            return [{ ...at, kind: 'sldd', chain: [...s.slddRefs] }];
        if (s.type === 'mat')
            return [{ ...at, kind: 'mat', chain: [] }];
        return [];
    });
    // A data file is in some model's scope exactly when that model is in the file's (usageScope
    // keeps the files of each model's chain), so the models' scopes, asked once each, are every
    // file reached: one call per model rather than one per data file, each of which walks every
    // model's chain again.
    const models = chains.filter((c) => c.kind === 'model').map((c) => c.uriString);
    const reachedSet = new Set(models.flatMap((m) => usageScope(m, chains)));
    const reached = (uri) => reachedSet.has(uri);
    const notChecked = [];
    const unused = [];
    for (const file of graphFiles) {
        const held = kept.get(file.uriString);
        if (!held)
            continue;
        if (held.kind !== 'model' && !reached(file.uriString)) {
            notChecked.push(file.uriString);
            continue;
        }
        for (const entry of held.entries) {
            if (!entry.name || SKIPPED.has(entry.className))
                continue;
            if (index.usagesOf(file.uriString, entry.name).length === 0)
                unused.push({ kind: 'unused', file: file.uriString, section: held.section, entry: entry.name });
        }
    }
    return {
        findings: [
            ...unresolvedReferences(sources, graph),
            ...cycles(sources, graph),
            ...unused,
            ...shadowed(index.models, summaries),
            ...duplicates(sources, graph, kept),
        ],
        notChecked,
        unreadable,
        files: listing.length,
        truncated: isTruncated(listing),
    };
}
/**
 * Each file's entries a check looks at, read one file at a time in a workspace of its own, closed
 * after it; and the files that did not read, and why, in folder order.
 */
async function readKept(reader, files) {
    const kept = new Map();
    const unreadable = [];
    for (const file of files) {
        const ws = createWorkspace();
        try {
            const bytes = await reader.bytes(file);
            if (bytes === null) {
                unreadable.push({ file: file.uriString, message: 'It could not be read.' });
                continue;
            }
            const doc = await ws.open(bytes, basename(file.path), file.uriString);
            const sections = await readEntries(doc.table);
            const section = KEPT_SECTION[doc.kind];
            if (section === undefined)
                continue;
            const rows = sections.find((s) => s.key === section)?.entries ?? [];
            kept.set(file.uriString, {
                kind: doc.kind,
                section,
                entries: rows.map((row) => ({ name: row.Name?.label ?? '', className: typeof row.Class === 'string' ? row.Class : '' })),
            });
        }
        catch (err) {
            unreadable.push({ file: file.uriString, message: messageOf(err) });
        }
        finally {
            ws.dispose();
        }
    }
    return { kept, unreadable };
}
/** A file's references, each with how it names its target, in the order a check lists them. */
function referencesOf(s) {
    return [
        ...s.modelRefs.map((reference) => ({ relation: 'model reference', reference })),
        ...(s.dataDictionary ? [{ relation: 'data dictionary', reference: s.dataDictionary }] : []),
        ...s.dataSources.map((reference) => ({ relation: 'external data', reference })),
        ...s.slddRefs.map((reference) => ({ relation: 'referenced dictionary', reference })),
    ];
}
/** The references no file of the folder answers, in folder order and then each file's order. */
function unresolvedReferences(sources, graph) {
    const out = [];
    for (const s of sources) {
        for (const { relation, reference } of referencesOf(s)) {
            if (graph.resolveFor(reference, s.uriString).length === 0)
                out.push({ kind: 'unresolved-reference', file: s.uriString, relation, reference });
        }
    }
    return out;
}
/**
 * The circles the references make: one finding per strongly connected component of two or more
 * files, or of one that names itself, as the shortest circle through its first file by uri. By the
 * hierarchy's resolution (resolveFor), so a circle is one the Folder view would mark.
 */
function cycles(sources, graph) {
    const edges = new Map();
    for (const s of sources) {
        const targets = new Set();
        for (const { reference } of referencesOf(s))
            for (const t of graph.resolveFor(reference, s.uriString))
                targets.add(t);
        edges.set(s.uriString, [...targets]);
    }
    const out = [];
    for (const component of stronglyConnected(sources.map((s) => s.uriString), edges)) {
        const first = [...component].sort(byCodeUnit)[0];
        if (component.length < 2 && !edges.get(first).includes(first))
            continue;
        out.push({ kind: 'cycle', files: shortestCircle(first, new Set(component), edges) });
    }
    return out.sort((a, b) => byCodeUnit(a.files[0], b.files[0]));
}
/**
 * The strongly connected components of a graph (Tarjan's), walked with a stack of its own rather
 * than by recursion, so that a chain of thousands of dictionaries cannot overflow the call stack.
 */
function stronglyConnected(nodes, edges) {
    const order = new Map();
    const low = new Map();
    const onStack = new Set();
    const stack = [];
    const components = [];
    const visit = (node) => {
        order.set(node, order.size);
        low.set(node, order.get(node));
        stack.push(node);
        onStack.add(node);
    };
    for (const root of nodes) {
        if (order.has(root))
            continue;
        visit(root);
        // Each frame is a node and how many of its edges the walk has followed.
        const frames = [{ node: root, edge: 0 }];
        while (frames.length > 0) {
            const frame = frames[frames.length - 1];
            const out = edges.get(frame.node) ?? [];
            if (frame.edge < out.length) {
                const to = out[frame.edge++];
                if (!order.has(to)) {
                    visit(to);
                    frames.push({ node: to, edge: 0 });
                }
                else if (onStack.has(to)) {
                    low.set(frame.node, Math.min(low.get(frame.node), order.get(to)));
                }
                continue;
            }
            frames.pop();
            const parent = frames[frames.length - 1];
            if (parent)
                low.set(parent.node, Math.min(low.get(parent.node), low.get(frame.node)));
            if (low.get(frame.node) !== order.get(frame.node))
                continue;
            const component = [];
            let member;
            do {
                member = stack.pop();
                onStack.delete(member);
                component.push(member);
            } while (member !== frame.node);
            components.push(component);
        }
    }
    return components;
}
/**
 * The shortest circle from `first` back to it within `members`, its first file again at the end:
 * a breadth-first search over the members' edges, each file's neighbours in its edges' order, so
 * that of two circles of one length the one found first is the one its references give first.
 */
function shortestCircle(first, members, edges) {
    const parent = new Map([[first, null]]);
    const queue = [first];
    for (let i = 0; i < queue.length; i++) {
        const at = queue[i];
        for (const to of edges.get(at) ?? []) {
            if (to === first) {
                const path = [];
                for (let n = at; n !== null; n = parent.get(n) ?? null)
                    path.push(n);
                return [...path.reverse(), first];
            }
            if (!members.has(to) || parent.has(to))
                continue;
            parent.set(to, at);
            queue.push(to);
        }
    }
    // Not reached: every member of a component of two or more lies on a circle through each other.
    return [first, first];
}
/**
 * The workspace variables that hide a definition of the model's data: each name of a model's
 * workspace (its own names, then those of the MAT-file it is kept in that it does not name itself)
 * resolved, by core's own order, over the model with its workspace taken out (its names, the
 * MAT-file it is kept in, and its masks), so that a hit is the definition the blocks would read were
 * the workspace not there.
 */
function shadowed(models, summaries) {
    const out = [];
    for (const model of models) {
        const { workspaceMatRef, ...rest } = model;
        // The workspace's MAT-file is out of the MAT-files too, where a model also lists it: it is the
        // workspace, and what it defines is what the workspace defines.
        const bare = { ...rest, workspaceNames: new Set(), masks: [], matRefs: rest.matRefs.filter((ref) => ref !== workspaceMatRef) };
        // The MAT-file's names as core resolves them: by its basename, the last of that name in folder order.
        const matNames = workspaceMatRef ? (summaries.matByName.get(workspaceMatRef)?.names ?? []) : [];
        // A name the workspace and its MAT-file both define is one variable of the workspace: once.
        const names = [...model.workspaceNames, ...[...matNames].filter((name) => !model.workspaceNames.has(name))];
        for (const name of names) {
            const hit = resolveName(bare, name, summaries.slddByName, summaries.matByName);
            if (hit)
                out.push({ kind: 'shadowed', model: model.srcId, variable: name, hidden: hit.srcId });
        }
    }
    return out;
}
/**
 * The Design Data names two or more dictionaries of one scope define. A scope is the dictionaries
 * Simulink reads together: each dictionary with those it references, transitively, in folder
 * order, then the dictionaries each model links, with theirs. A name defined by the same files is
 * one finding, whichever scopes find it; the findings are sorted by name, then by their files.
 */
function duplicates(sources, graph, kept) {
    const byUri = new Map(sources.map((s) => [s.uriString, s]));
    const isDictionary = (uri) => byUri.get(uri)?.type === 'sldd';
    // `starts`, the dictionaries among them, and every dictionary their references reach, each once.
    const closure = (starts) => {
        const queue = [];
        const seen = new Set();
        const add = (uri) => {
            if (!isDictionary(uri) || seen.has(uri))
                return;
            seen.add(uri);
            queue.push(uri);
        };
        starts.forEach(add);
        for (let i = 0; i < queue.length; i++) {
            for (const ref of byUri.get(queue[i]).slddRefs)
                graph.resolveFor(ref, queue[i]).forEach(add);
        }
        return queue;
    };
    const linked = (s) => [...(s.dataDictionary ? [s.dataDictionary] : []), ...s.dataSources].flatMap((ref) => graph.resolveFor(ref, s.uriString));
    const scopes = [
        ...sources.filter((s) => s.type === 'sldd').map((s) => closure([s.uriString])),
        ...sources.filter((s) => s.type === 'model').map((s) => closure(linked(s))),
    ];
    const found = new Map();
    for (const scope of scopes) {
        const read = scope.filter((uri) => kept.has(uri));
        if (read.length < 2)
            continue;
        const definers = new Map();
        for (const uri of read) {
            for (const { name } of kept.get(uri).entries) {
                if (!name)
                    continue;
                const files = definers.get(name);
                if (!files)
                    definers.set(name, [uri]);
                // Once per dictionary, which may hold a name twice: the last file added is this one.
                else if (files[files.length - 1] !== uri)
                    files.push(uri);
            }
        }
        for (const [entry, files] of definers) {
            if (files.length < 2)
                continue;
            const sorted = [...files].sort(byCodeUnit);
            const key = `${entry}\n${sorted.join('\n')}`;
            if (!found.has(key))
                found.set(key, { kind: 'duplicate', entry, files: sorted });
        }
    }
    return [...found.values()].sort((a, b) => byCodeUnit(a.entry, b.entry) || byCodeUnit(a.files.join('\n'), b.files.join('\n')));
}
