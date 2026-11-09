// Copyright 2026 The MathWorks, Inc.
// The Usage column over the files a page has open, for a page that shows no folder: who uses each
// variable of a dictionary or a MAT-file, and where each parameter of a model's blocks comes from,
// answered over the open files and nothing else. A folder's session answers the same question over
// its folder (folderSession.ts); a page holding only the files a user dropped on it or picked one by
// one has these, and asks it of them. The same graphs (UsageGraphs, over core's usage index), by
// the same rules, so a file reads the same in either page; what differs is where the bytes come
// from.
//
// WHAT AN OPEN FILE IS TO THE GRAPH
//
// Its bytes as the page last read or saved them, as a folder's graph reads a file on disk: an
// unsaved edit moves no edge here either (UsageGraphs.invalidate says why that is the right line).
// Each bytes object is a version of its own, so a save or a reload, which hand the tab new bytes,
// is a change, and the same bytes asked about again are not: a repaint or a keystroke rebuilds
// nothing. The files are taken in the order of their uris, which decides which of two same-named
// dictionaries a name means, so moving a tab moves no answer.
//
// A file that is not open is not there, so a model whose dictionary is not open has its
// parameters unresolved in the graph, as a folder that lacks the dictionary answers. A page of open
// files is not a folder that lacks it, though: the dictionary is most likely beside the model,
// unopened. So where a parameter is unresolved (not its workspace's, not a mask's) and the model
// links a dictionary, its cell names that dictionary as the model does, `Gain=Kp (params.sldd)`,
// linked by name (`Kp@params.sldd`), which opens it beside the model, as the prototype linked it.
// Once the dictionary opens, the parameter resolves to it, by its uri. A parameter the model's
// workspace shadows still names the workspace. The graphs themselves (`graphs`) answer as a folder
// session's do: the name is the cell's, not the graph's.
//
// WHEN A COLUMN IS OWED A REPAINT
//
// In a folder, only a model created or deleted moves what a data file's column says, and nothing
// moves a model's own (usageRepostHub.ts). Over the open files, opening a file brings it into the
// others' answers: a model opened names the blocks that read an open dictionary's entries, and a
// dictionary opened is where a model's parameters now resolve. So any change to what is open (a
// file opened, closed, saved or reloaded) can move any open table's column, a model's as much as a
// dictionary's. Rather than work out which, each fill is noted with the files it was answered
// over, and once a burst of changes is over (the reposts' trailing window, so opening ten files
// repaints each one once), every document whose last fill was answered over other files than are
// open now is painted again, once. One never painted is not (its first paint will be fresh), nor
// one closed since; one opened in the burst only if more came after it. A save hands its tab new
// bytes, a new version, so every table filled before it is painted again a window later, whether
// or not the save moved an edge: telling which would mean comparing the file's summaries, and a
// repaint is the cheaper of the two.
//
// connectShell makes one for the shell's workspace; the package's entries do not export it.
import { cheapOne, identifiersIn, isGraphPath, isModelFile, newSourceCache } from 'data-explorer-core';
import { basename } from '../ids/pathUtil.js';
import { UsageGraphs } from './usageGraphs.js';
import { USAGE_REPOST_DEBOUNCE_MS } from './usageRepost.js';
const GLOBAL_TIMERS = {
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle),
};
/** The Usage column over `options.files()`: a UsageSource, and the repaints a change to them owes. */
export function createOpenFilesUsage(options) {
    const delayMs = options.delayMs ?? USAGE_REPOST_DEBOUNCE_MS;
    const timers = options.timers ?? GLOBAL_TIMERS;
    // A version per bytes object, so the same array is the same version however often it is asked
    // about, and an array the page let go takes its version with it.
    const versions = new WeakMap();
    let nextVersion = 0;
    const versionOf = (bytes) => {
        let version = versions.get(bytes);
        if (version === undefined)
            versions.set(bytes, (version = `open:${++nextVersion}`));
        return version;
    };
    // The bytes as an ArrayBuffer holding exactly them, as core's readers answer: the array's own
    // buffer where it is the whole of it, else a copy, made once. Asked only where the cache has no
    // summary of that version, so once per file read or saved.
    const buffers = new WeakMap();
    const bufferOf = (bytes) => {
        if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer)
            return bytes.buffer;
        let copy = buffers.get(bytes);
        if (!copy)
            buffers.set(bytes, (copy = bytes.slice().buffer));
        return copy;
    };
    // The files a graph reads, as they are now: the kinds a usage graph draws (no projects), each
    // uri once, by uri.
    const current = () => {
        const seen = new Set();
        const files = [];
        for (const f of options.files()) {
            if (seen.has(f.uri) || !isGraphPath(f.path))
                continue;
            seen.add(f.uri);
            files.push({ uriString: f.uri, path: f.path, version: versionOf(f.bytes), bytes: f.bytes });
        }
        return files.sort((a, b) => (a.uriString < b.uriString ? -1 : a.uriString > b.uriString ? 1 : 0));
    };
    const keyOf = (files) => files.map((f) => `${f.uriString} ${f.version}`).join('\n');
    // The bytes each file had when it was listed, whatever its tab holds by the read.
    const readerOf = (files) => {
        const held = new Map(files.map((f) => [f.uriString, f]));
        return {
            version: async (file) => held.get(file.uriString)?.version ?? null,
            bytes: async (file) => {
                const f = held.get(file.uriString);
                return f ? bufferOf(f.bytes) : null;
            },
        };
    };
    const graphs = new UsageGraphs({
        inputs: {
            inputsKey: () => keyOf(current()),
            candidates: async () => current(),
            readerFor: (files) => readerOf(files),
        },
        cache: options.cache ?? newSourceCache(),
    });
    // The dictionary the model `file` links, by its name as the model records it (a path cut to its
    // basename), or null for none: core's structure of the model, read through the cache the graphs
    // read, so off the parse they already made.
    async function dictionaryOf(file) {
        try {
            const entry = await cheapOne(graphs.cache, readerOf([file]), file);
            const linked = entry?.cheap.kind === 'model' ? entry.cheap.structure.dataDictionary : null;
            return linked ? basename(linked) : null;
        }
        catch {
            return null;
        }
    }
    // The model `uri`'s graph, its unresolved parameters named after the dictionary it links.
    async function withDictionary(uri, graph) {
        const file = current().find((f) => f.uriString === uri);
        const answer = await graph;
        const dictionary = file && isModelFile(file.path) ? await dictionaryOf(file) : null;
        if (!dictionary)
            return answer;
        return {
            blocksUsing: (sourceUri, varName) => answer.blocksUsing(sourceUri, varName),
            paramLinks(modelUri, blockKey) {
                const links = answer.paramLinks(modelUri, blockKey);
                if (modelUri !== uri)
                    return links;
                // Unresolved is the one origin with no target: a workspace's and a mask's have theirs.
                return links.map((link) => {
                    if (link.linkTarget !== '')
                        return link;
                    const name = identifiersIn(link.paramName)[0];
                    return name ? { ...link, source: dictionary, linkTarget: `${name}@${dictionary}` } : link;
                });
            },
        };
    }
    // The files each document's last fill was answered over (their key), by the document's uri.
    const filled = new Map();
    // The files open when changed() last looked, and the window a change waits out.
    let seen = null;
    let timer;
    let disposed = false;
    function fire() {
        timer = undefined;
        if (disposed)
            return;
        const files = current();
        const key = keyOf(files);
        const open = new Set(files.map((f) => f.uriString));
        const owed = [];
        for (const [uri, at] of filled) {
            if (!open.has(uri))
                filled.delete(uri);
            else if (at !== key) {
                owed.push(uri);
                // Asked for now: the repaint's own fill notes the same key again, and a second burst
                // before it lands does not ask twice.
                filled.set(uri, key);
            }
        }
        if (owed.length > 0)
            options.refill(owed);
    }
    return {
        graphs,
        graphFor(uri) {
            if (!disposed)
                filled.set(uri, keyOf(current()));
            return withDictionary(uri, graphs.graphFor(uri));
        },
        changed() {
            if (disposed)
                return;
            const key = keyOf(current());
            // The window moves only when the files do: a change of anything else (a selection, a paint)
            // does not hold back a repaint owed.
            if (key === seen)
                return;
            seen = key;
            if (![...filled.values()].some((at) => at !== key))
                return;
            if (timer !== undefined)
                timers.clearTimeout(timer);
            timer = timers.setTimeout(fire, delayMs);
        },
        dispose() {
            disposed = true;
            if (timer !== undefined)
                timers.clearTimeout(timer);
            timer = undefined;
            filled.clear();
        },
    };
}
