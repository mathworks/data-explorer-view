// Copyright 2026 The MathWorks, Inc.
//
// A shown folder, served in the page: what an Electron main process does over core's node/folder
// (README, "Serve a folder from Electron's main process"), over a BrowserDir. serveFolder runs on one
// end of a MessageChannel in the page itself, and the shell reads the other end, so the folder's
// hierarchy, Usage, search and project pages work as they do on the desktop. Each listing registers
// the folder's files in WebFiles, so a file the tree opens, or a link the folder resolves, is read
// as a picked file is; and serveFolder answers only for files of its listing, as it does in main. A
// browser says nothing when a folder's files change, so folderLooks tells what changed since the host
// last looked.
//
// Lifted from data-explorer-app src/web/folder.ts at b13a860.
import { mapLimited, MAX_SCAN_BYTES, readProjectStore, scanVersionOf, } from 'data-explorer-core';
import { entryKindOf } from '../model/hierarchy/folderEntries.js';
import { listedFiles } from '../model/hierarchy/folderList.js';
import { portFromMessagePort } from '../model/source/ports.js';
import { serveFolder } from '../model/source/serveFolder.js';
import { sourceUri } from '../model/source/sourceUri.js';
import { entriesOf } from './fsAccess.js';
import { stampOf } from './files.js';
import { byCodeUnit, listDirectory, listLevel, subDir } from './walk.js';
/** The reason a folder the page names is refused: it is not the folder shown, nor one under it. */
const NOT_SHOWN = 'Not a folder of the shown folder.';
/**
 * The `/`-separated path of the folder `path` in the folder shown at `root` ('' for the root): the
 * page's question, so taken as written, nothing resolved. A path not under the root, or that steps
 * out of it or names a folder twice over (a `..` or a `.` segment, an empty one), is refused.
 */
function folderIn(root, path) {
    if (path === root)
        return '';
    if (!path.startsWith(`${root}/`))
        throw new Error(NOT_SHOWN);
    const rel = path.slice(root.length + 1);
    if (rel.split('/').some((part) => part === '' || part === '.' || part === '..'))
        throw new Error(NOT_SHOWN);
    return rel;
}
/**
 * The folder `dir`, shown at `root`, as serveFolder reads it. `limit` caps its listing. Its
 * `entries` are one level of a folder of it (the Folder view's), each at the path its listing
 * would give it: the root, and below it each name, a `/` between.
 */
export function webFolderReads(root, dir, files, limit) {
    const store = storeFs(root, dir);
    return {
        // Only the folder shown and the folders under it: a page names no other (FolderReads.entries).
        async entries(path) {
            const at = await subDir(dir, folderIn(root, path));
            return (await listLevel(at)).map(({ name, folder }) => ({ name, path: `${path}/${name}`, kind: folder ? 'folder' : entryKindOf(name) }));
        },
        files: {
            list: async () => {
                const listing = await listDirectory(dir, limit === undefined ? {} : { limit });
                const paths = listing.files.map((rel) => files.addInFolder(root, rel, listing.sources.get(rel)));
                return listedFiles({ files: paths, truncated: listing.truncated });
            },
        },
        // Core's two rules for a reader (nodeSourceReader): it answers only for the files it was given,
        // and a file past MAX_SCAN_BYTES is refused from its size alone, before it is read.
        reader: (list) => {
            const known = new Set(list.map((f) => f.uriString));
            const stat = (file) => (known.has(file.uriString) ? files.stat(file.path) : Promise.resolve(null));
            return {
                version: async (file) => {
                    const s = await stat(file);
                    return s && scanVersionOf({ mtime: s.lastModified, size: s.size });
                },
                bytes: async (file) => {
                    const s = await stat(file);
                    if (!s || s.size > MAX_SCAN_BYTES)
                        return null;
                    try {
                        // A buffer of its own (WebFiles reads afresh): serveFolder may hand it over.
                        return (await files.bytes(file.path)).buffer;
                    }
                    catch {
                        return null; // gone, or unreadable, since the listing
                    }
                },
                projectStore: (file) => readSortedStore(file.path, store),
            };
        },
    };
}
/**
 * Serve the folder `dir`, shown at `root`, on a channel of the page's own. The bytes are handed
 * over, not copied: the reader keeps none.
 */
export function serveWebFolder(root, dir, files, limit) {
    const channel = new MessageChannel();
    const served = serveFolder(webFolderReads(root, dir, files, limit), portFromMessagePort(channel.port1), { transfer: true });
    return {
        port: channel.port2,
        changed: (uris) => served.changed(uris),
        close() {
            served.dispose();
            channel.port1.close();
        },
    };
}
/**
 * Look at the folder `dir`, shown at `root`, again: the files created, deleted or written (another
 * `lastModified:size`) since the last look, by their uris as the listing names them. The first look
 * only learns the folder. A listed folder's files are the folder as it was picked, and a look at
 * them finds nothing.
 */
export function folderLooks(root, dir, limit) {
    let seen;
    return async () => {
        if (dir.kind !== 'handle')
            return [];
        const listing = await listDirectory(dir, limit === undefined ? {} : { limit });
        const stamps = await mapLimited(listing.files, (rel) => stampOf(listing.sources.get(rel)));
        const now = new Map(listing.files.map((rel, i) => [rel, stamps[i]]));
        const before = seen;
        seen = now;
        if (!before)
            return [];
        const touched = listing.files.filter((rel) => before.get(rel) !== now.get(rel));
        for (const rel of before.keys())
            if (!now.has(rel))
                touched.push(rel);
        return touched.map((rel) => sourceUri(`${root}/${rel}`));
    };
}
/**
 * readProjectStore over the folder, sorted by key as core's readProjectStoreFromDisk sorts it: a
 * directory lists in the browser's order, not the project's.
 */
async function readSortedStore(markerPath, fs) {
    const store = await readProjectStore(markerPath, fs);
    return Object.fromEntries(Object.entries(store).sort(([a], [b]) => byCodeUnit(a, b)));
}
const missing = (path) => new Error(`ENOENT: no such file or directory, '${path}'`);
/** The parts of `path` under `root`; none for `root` itself. A path outside the folder is missing. */
function partsIn(root, path) {
    if (path === root)
        return [];
    if (!path.startsWith(`${root}/`))
        throw missing(path);
    return path.slice(root.length + 1).split('/');
}
/** The StoreFs a project's store is read through, over the folder's own paths (`root/...`). */
function storeFs(root, dir) {
    if (dir.kind === 'handle') {
        const dirAt = async (parts) => {
            let at = dir.handle;
            for (const part of parts)
                at = await at.getDirectoryHandle(part);
            return at;
        };
        return {
            async readText(path) {
                const parts = partsIn(root, path);
                const name = parts.pop();
                if (!name)
                    throw missing(path);
                return (await (await (await dirAt(parts)).getFileHandle(name)).getFile()).text();
            },
            async list(path) {
                const entries = [];
                for await (const handle of entriesOf(await dirAt(partsIn(root, path)))) {
                    entries.push({ name: handle.name, type: handle.kind === 'directory' ? 'directory' : 'file' });
                }
                return entries;
            },
        };
    }
    // The list holds files only: a directory is the start of their paths.
    let byPath;
    const picked = () => (byPath ??= new Map(dir.files.map(({ rel, file }) => [rel, file])));
    return {
        async readText(path) {
            const file = picked().get(partsIn(root, path).join('/'));
            if (!file)
                throw missing(path);
            return file.text();
        },
        async list(path) {
            const parts = partsIn(root, path);
            const prefix = parts.length ? `${parts.join('/')}/` : '';
            const entries = new Map();
            for (const rel of picked().keys()) {
                if (!rel.startsWith(prefix))
                    continue;
                const [name, ...below] = rel.slice(prefix.length).split('/');
                entries.set(name, below.length ? 'directory' : 'file');
            }
            if (entries.size === 0)
                throw missing(path);
            return [...entries].map(([name, type]) => ({ name, type }));
        },
    };
}
