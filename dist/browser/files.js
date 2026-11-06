// Copyright 2026 The MathWorks, Inc.
//
// The files a browser page has, each under a path the page makes up, as the shell names files. A
// browser hands out no paths, only handles (Chromium's pickers and drops) and File objects (a file
// input, a drop in Firefox or Safari), so a path here means nothing on disk: `/files/<n>/<name>`
// for a file of the n-th pick (or drop), and `<root>/<rel>` for a file of a shown folder, whose root
// is `/<folder name>`. The shell keeps the path a file opened under as its tab's, links resolve
// beside it, and connectShell hands it back to the host for every read and save; so the registry
// is where a path turns back into something that reads.
//
// Lifted from data-explorer-app src/web/files.ts at b13a860.
import { dirName } from './walk.js';
const nameOf = (path) => path.slice(path.lastIndexOf('/') + 1);
/** The two folders are one: two handles to one directory. Two lists of Files are never told to be. */
async function sameDir(a, b) {
    if (a.kind !== 'handle' || b.kind !== 'handle')
        return false;
    return a.handle.isSameEntry(b.handle);
}
/**
 * When the file of `source` was last written and how long it is, without reading it: a handle's as
 * of now, a File's as it was picked. Null for bytes the page holds, or a handle whose file is gone.
 */
export async function statOf(source) {
    if (source.kind === 'bytes')
        return null;
    try {
        const file = source.kind === 'file' ? source.file : await source.handle.getFile();
        return { lastModified: file.lastModified, size: file.size };
    }
    catch {
        return null;
    }
}
/** The version of `source` a change shows in, `lastModified:size`, or null (statOf). */
export async function stampOf(source) {
    const s = await statOf(source);
    return s && `${s.lastModified}:${s.size}`;
}
/**
 * The browser host's registry of the files a page has, by the paths the page made for them. One per
 * host, inside it: an app sees only `host.files` (BrowserFiles: addPicked, get and has), so the path
 * scheme, the folder roots and the reads stay the host's to change.
 */
export class WebFiles {
    constructor() {
        this.entries = new Map();
        this.folders = new Map();
        this.picks = 0;
    }
    /** A file picked on its own: `/files/<n>/<name>`, so two `a.sldd` from two picks differ. */
    async addPicked(name, source) {
        return (await this.addPick([{ name, source }]))[0];
    }
    /**
     * The files of one pick, beside each other in its folder `/files/<n>/` as they were on disk, so a
     * model's link to a dictionary picked with it, which names it alone, finds it. A name the pick
     * already has (files dropped from two folders) starts the next pick's folder. A handle to a file
     * the page has a path for already (picked before, or in a shown folder) keeps that path, so the
     * file opens in the tab it has; Files cannot be told apart, and each takes a path of its own.
     */
    async addPick(picked) {
        let n;
        const names = new Set();
        const paths = [];
        for (const { name, source } of picked) {
            const known = source.kind === 'handle' ? await this.pathOf(source.handle) : undefined;
            if (known) {
                paths.push(known);
                continue;
            }
            if (n === undefined || names.has(name)) {
                n = ++this.picks;
                names.clear();
            }
            names.add(name);
            const path = `/files/${n}/${name}`;
            this.entries.set(path, { name, source });
            paths.push(path);
        }
        return paths;
    }
    /** The path of a file read through a handle to the file `handle` is to, if the page has one. */
    async pathOf(handle) {
        // One file has one name: only the files of that name are asked about.
        for (const [path, { name, source }] of this.entries) {
            if (name === handle.name && source.kind === 'handle' && (await source.handle.isSameEntry(handle)))
                return path;
        }
        return undefined;
    }
    /**
     * The root a shown folder takes: `/<name>`, or `/<name> (2)` and on when another folder of that
     * name took it before, so a tab open on a file of one never reads or saves the other's. The same
     * directory shown again takes its root back, and its files their paths.
     */
    async folderRoot(dir) {
        const name = dirName(dir);
        for (let n = 1;; n++) {
            const root = n === 1 ? `/${name}` : `/${name} (${n})`;
            // `/files` is the picks'.
            if (root === '/files')
                continue;
            const taken = this.folders.get(root);
            if (!taken || (await sameDir(taken, dir))) {
                this.folders.set(root, dir);
                return root;
            }
        }
    }
    /** A file of the folder shown at `root`, by its `/`-separated path `rel` in it. */
    addInFolder(root, rel, source) {
        const path = `${root}/${rel}`;
        this.entries.set(path, { name: nameOf(rel), source });
        return path;
    }
    /** The file at `path`, or undefined for a path the page never made. */
    get(path) {
        return this.entries.get(path);
    }
    /** Whether the page made `path`. */
    has(path) {
        return this.entries.has(path);
    }
    /**
     * Read `path` from what holds it now, into a buffer of its own that nothing here keeps. A path the
     * page never made rejects, as a missing file does; a File written since it was picked says to open
     * the file again, which gives the browser's leave to read it as it is now.
     */
    async bytes(path) {
        const file = this.entries.get(path);
        if (!file)
            throw new Error(`ENOENT: no such file or directory, open '${path}'`);
        const { source } = file;
        if (source.kind === 'bytes')
            return source.bytes.slice();
        if (source.kind === 'handle')
            return new Uint8Array(await (await source.handle.getFile()).arrayBuffer());
        try {
            return new Uint8Array(await source.file.arrayBuffer());
        }
        catch (err) {
            if (err?.name === 'NotReadableError') {
                throw new Error(`${file.name} changed since it was picked: open it again.`);
            }
            throw err;
        }
    }
    /** statOf the file at `path`; null for a path the page never made. */
    async stat(path) {
        const source = this.entries.get(path)?.source;
        return source ? statOf(source) : null;
    }
    /** stampOf the file at `path`; null for a path the page never made. */
    async stamp(path) {
        const source = this.entries.get(path)?.source;
        return source ? stampOf(source) : null;
    }
    /** Read `path` from `source` from now on, under the name it has (or its path's last part). */
    replace(path, source) {
        this.entries.set(path, { name: this.entries.get(path)?.name ?? nameOf(path), source });
    }
}
