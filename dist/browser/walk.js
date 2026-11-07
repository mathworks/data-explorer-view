// Copyright 2026 The MathWorks, Inc.
//
// A shown folder's files, over what a browser gives for a folder: a directory handle (Chromium's
// showDirectoryPicker, or a folder dropped there), or the list of files the browser read from it
// when it was picked (an `<input webkitdirectory>`, or a folder dropped in Firefox or Safari). Core's
// `listFolder` walks `node:fs`, behind its Node-only entry, which a page cannot load, so its rules are
// copied here as core v1.58.0 has them: which files count (a name `isSupportedPath` takes, a hidden
// one too), which directories are not entered (a hidden one, `node_modules`, `slprj`), the order
// (code-unit order of the path in the folder, `/` between its parts), and the limit, which keeps the
// first files in that order and says it cut. The order is the rule that matters most and shows
// least: folder order decides which of two same-named dictionaries a name means, so a browser page
// that listed a folder in another order would answer a Usage question differently from the desktop.
// test/browserHost/walk.test.ts lists one folder both ways and compares.
//
// Lifted from data-explorer-app src/web/walk.ts at b13a860 (its friction entry F56 asks core for a
// listing over any filesystem, which would take this file's rules back into core).
import { isSupportedPath } from 'data-explorer-core';
import { entriesOf } from './fsAccess.js';
/** The most files a listing holds unless told otherwise: core's FOLDER_FILE_LIMIT. */
export const FOLDER_FILE_LIMIT = 10_000;
/** The folder's own name. */
export const dirName = (dir) => (dir.kind === 'handle' ? dir.handle.name : dir.root);
/** A directory the listing does not enter: core's skipDirectory. */
export const skipDirectory = (name) => name.startsWith('.') || name === 'node_modules' || name === 'slprj';
/** Code-unit order (JavaScript's `<`): the same on every machine, unlike `localeCompare`. */
export const byCodeUnit = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
/**
 * The supported files of `dir`, by core's listing rules, up to `limit` (FOLDER_FILE_LIMIT by
 * default; a non-negative whole number). Never rejects for the folder's contents: a directory that
 * cannot be read is passed over.
 */
export async function listDirectory(dir, { limit = FOLDER_FILE_LIMIT } = {}) {
    if (!Number.isInteger(limit) || limit < 0) {
        throw new RangeError(`listDirectory: limit must be a non-negative integer, got ${limit}`);
    }
    return dir.kind === 'handle' ? walk(dir.handle, limit) : listPicked(dir.files, limit, dir.truncated === true);
}
/**
 * Core's walk: each directory's entries sorted as their paths will sort (a directory's name with
 * its `/`, a file's bare), depth first, so it can stop at the limit without reading the rest.
 */
async function walk(root, limit) {
    const files = [];
    const sources = new Map();
    let truncated = false;
    // False once the limit is passed, so every level of the walk stops where it is.
    const visit = async (dir, prefix) => {
        const entries = [];
        try {
            for await (const handle of entriesOf(dir)) {
                if (handle.kind === 'directory') {
                    if (!skipDirectory(handle.name))
                        entries.push({ key: `${handle.name}/`, handle });
                }
                else if (isSupportedPath(handle.name)) {
                    entries.push({ key: handle.name, handle });
                }
            }
        }
        catch {
            return true; // a directory that cannot be read is passed over
        }
        entries.sort((a, b) => byCodeUnit(a.key, b.key));
        for (const { key, handle } of entries) {
            if (handle.kind === 'directory') {
                if (!(await visit(handle, prefix + key)))
                    return false;
            }
            else if (files.length === limit) {
                truncated = true;
                return false;
            }
            else {
                files.push(prefix + key);
                sources.set(prefix + key, { kind: 'handle', handle: handle });
            }
        }
        return true;
    };
    await visit(root, '');
    return { files, truncated, sources };
}
/**
 * The folder at `rel` in `dir` (its `/`-separated path there; '' for `dir` itself) as a BrowserDir
 * of its own: for a handle, the handle walked down to it; for a listed folder, the files the
 * browser listed under it, each by its path from it. Rejects, naming it, for a folder `dir` holds
 * none of (a listed folder holds a folder only where it holds a file under it).
 */
export async function subDir(dir, rel) {
    if (rel === '')
        return dir;
    const none = () => new Error(`${dirName(dir)} holds no folder ${rel}.`);
    const parts = rel.split('/');
    if (dir.kind === 'handle') {
        let at = dir.handle;
        try {
            for (const part of parts)
                at = await at.getDirectoryHandle(part);
        }
        catch {
            throw none();
        }
        return { kind: 'handle', handle: at };
    }
    const prefix = `${rel}/`;
    const files = dir.files.filter((f) => f.rel.startsWith(prefix)).map((f) => ({ rel: f.rel.slice(prefix.length), file: f.file }));
    if (files.length === 0)
        throw none();
    return { kind: 'list', root: parts.at(-1), files, ...(dir.truncated ? { truncated: true } : {}) };
}
/**
 * One level of `dir`: its folders and files, every one of them (not only the supported files a
 * listing takes, nor only the directories it enters), but for a hidden one (a name starting with
 * `.`), in no order: the page sorts them. A listed folder's are the folder as it was picked: the
 * folders that hold a file, and the files. A handle's directory that cannot be read rejects.
 */
export async function listLevel(dir) {
    if (dir.kind === 'handle') {
        const out = [];
        for await (const handle of entriesOf(dir.handle)) {
            if (!handle.name.startsWith('.'))
                out.push({ name: handle.name, folder: handle.kind === 'directory' });
        }
        return out;
    }
    const level = new Map();
    for (const { rel } of dir.files) {
        const [name, ...below] = rel.split('/');
        if (!name || name.startsWith('.'))
            continue;
        if (below.length > 0)
            level.set(name, true);
        else if (!level.has(name))
            level.set(name, false);
    }
    return [...level].map(([name, folder]) => ({ name, folder }));
}
/**
 * A listed folder's files. The browser has entered every directory already, so a file under one
 * the walk would not enter is dropped; and the walk's order is code-unit order of the whole paths,
 * so they are sorted as they are. A list the browser's reading cut short (`cut`) is a listing cut
 * short too, though which files it holds is the reading's order, not the walk's.
 */
function listPicked(picked, limit, cut) {
    const byPath = new Map();
    for (const { rel, file } of picked) {
        const parts = rel.split('/');
        const name = parts.at(-1);
        if (name && isSupportedPath(name) && !parts.slice(0, -1).some(skipDirectory))
            byPath.set(rel, file);
    }
    const all = [...byPath.keys()].sort(byCodeUnit);
    const files = all.slice(0, limit);
    return {
        files,
        truncated: cut || all.length > files.length,
        sources: new Map(files.map((rel) => [rel, { kind: 'file', file: byPath.get(rel) }])),
    };
}
