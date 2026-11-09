// Copyright 2026 The MathWorks, Inc.
//
// The Folder view's tree: the workspace folder as a file browser shows it, one level at a time,
// with each data file's references under it as the index's hierarchy draws them.
//
// TWO LISTINGS MEET HERE. The index (FolderHierarchy) reads every data file of the folder once and
// groups them by directory, and under a group lists only the files nothing else there references:
// the rest are reached through what references them. The Folder view lists each folder's entries
// (FolderReader.entries) as its row opens, every folder, data file and other file of it. So a
// folder row's rows are its entries, a data file the hierarchy's own row for that file (rowOf: the
// row it is at a group's top, a file only ever referenced too) with its references under it, a
// folder a folder row of its own, and any other file a dimmed row that opens nothing. Under a data
// file the rows are the hierarchy's, each saying what it is to the file above it.
//
// KEYS FOLLOW THE TREE, NOT THE HIERARCHY. A row's key is its parent's key, a `/`, and one encoded
// part of its own, the rule connectHierarchy walks a key back down by; and the same row has the
// same key on every call, so a tree keeps what was open. So each row of the hierarchy's that this
// draws is a copy keyed under the row it is drawn under, and kept beside the row it copies, which
// is what its own rows are asked of.
//
// A host that lists no entries (an older one: its `entries` answers null) leaves the tree the
// hierarchy's, row for row, so an app on such a host shows what it showed before.
//
// It assumes what serveFolder's hosts do: the index lists each file under `sourceUri(path)`, the
// path as the entries name it (listedFiles), so a data entry and the hierarchy's row of it are
// matched by that uri.
//
// DOM-free.
import { sourceKind } from 'data-explorer-core';
import { basename } from '../ids/pathUtil.js';
import { sourceUri, uriPath } from '../source/sourceUri.js';
import { sortEntries } from './folderEntries.js';
import { fileIconOf } from './folderHierarchy.js';
// The icon of a row of another file: a plain document.
const OTHER_ICON = 'documentList';
// A folder's row: a plain folder, as a file browser draws one. The hierarchy's own group of a
// folder's data files keeps the Simulink folder (`simulink_folder`), as the extension's tree has it.
const FOLDER_ICON = 'folder';
const messageOf = (err) => (err instanceof Error ? err.message : String(err));
// One encoded part of a key, after its parent's key: never a raw `/`, so a key splits into its rows.
const part = (local) => `/${encodeURIComponent(local)}`;
/** The uri a folder's files begin with, and a `/`: sourceUri's spelling, with no `/` of its own at the end. */
function folderUriOf(dir) {
    return sourceUri(dir).replace(/\/$/, '');
}
/**
 * What a data file the index has no row for draws as, in the graph's vocabulary (SourceType, as
 * graphSources.ts maps core's sourceKind); null for a file core does not read, which the host
 * called data all the same. Every SourceKind by name, so a kind core adds fails to compile here.
 */
function fileKindOf(path) {
    switch (sourceKind(path)) {
        case 'model':
            return 'model';
        case 'mat':
            return 'mat';
        case 'sldd':
            return 'sldd';
        case 'prj':
            return 'project';
        case null:
            return null;
    }
}
/**
 * What a reference row is to the row it is under, in words: only what the graph says. A model's
 * own rows are the models it references (and its External Data, which is no reference); under
 * External Data, its dictionaries and MAT-files; under a dictionary, the dictionaries it
 * references. A reference no file answers is a model's or a dictionary's by where it is, and
 * under External Data could be either kind, so it says nothing there.
 */
function relationOf(parent, row) {
    if (parent.kind === 'model')
        return row.kind === 'model' || row.kind === 'missing' ? 'model reference' : undefined;
    if (parent.kind === 'sldd')
        return row.kind === 'sldd' || row.kind === 'missing' ? 'referenced dictionary' : undefined;
    if (parent.kind === 'group' && parent.groupKind === 'external-data') {
        if (row.kind === 'sldd')
            return 'data dictionary';
        if (row.kind === 'mat')
            return 'MAT-file';
    }
    return undefined;
}
/**
 * The workspace folder as the Folder view draws it: its folders and files, a level at a time,
 * merged with the index's hierarchy (FolderHierarchy), which this reads and never changes.
 *
 * ```ts
 * const tree = new FolderTree({ hierarchy, entries: (dir) => folder.entries(dir), root });
 * ```
 */
export class FolderTree {
    constructor(options) {
        // The index's failure last told (indexFailed), until the index is read again: the same one is not told twice.
        this.toldFailure = null;
        // Whether the host lists entries, from its first answer for the root: a host does not start or
        // stop. And that answer, until the root's row first opens, which draws it rather than list the
        // root a second time.
        this.lists = null;
        this.firstRoot = null;
        // This tree's folder rows, each by the path its entries are listed by.
        this.folders = new WeakMap();
        // This tree's copies of the hierarchy's rows, each by the row it copies, which its rows are asked of.
        this.copies = new WeakMap();
        this.hierarchy = options.hierarchy;
        this.entries = (dir) => options.entries(dir);
        this.root = options.root;
        this.indexFailed = options.indexFailed;
    }
    /**
     * The root's own row (as FolderHierarchy.roots), its path set; and after it, when the index's
     * listing was cut short, the hierarchy's row that says so, or when it could not be read, a row
     * that says why (the folder's entries are drawn all the same, its data files as plain rows). For
     * a host that lists no entries, the hierarchy's roots, and its failure.
     */
    async roots() {
        const [lists, index] = await Promise.all([this.listsEntries(), settled(this.hierarchy.roots())]);
        if (!lists) {
            if ('failed' in index)
                throw index.failed;
            return index.rows;
        }
        // An index that cannot be read leaves the root's row, with no project's look, and a row after
        // it that says so: not a failure of the tree, whose rows are the folder's entries still.
        const top = 'rows' in index ? index.rows : [];
        // Keyed by its whole path, where a folder under it is keyed by its name: another root of the
        // same name is another tree.
        const root = this.folderRow({ name: basename(this.root) || this.root, path: this.root, kind: 'folder' }, part(`dir:${this.root}`), top);
        if ('failed' in index)
            return [root, this.unindexed(index.failed)];
        this.toldFailure = null;
        return [root, ...top.filter((item) => item.kind === 'notice')];
    }
    // The row that says the index could not be read, as the hierarchy's says it was cut short; and
    // the failure told, once.
    unindexed(err) {
        const why = messageOf(err);
        if (why !== this.toldFailure) {
            this.toldFailure = why;
            this.indexFailed?.(err);
        }
        return {
            label: `The folder's data files could not be read: ${why}`,
            kind: 'notice',
            collapsible: 'none',
            tooltip: 'Used By, the graph and Search have nothing of this folder until they can be read. Read the folder again to try once more.',
            // No folder's or file's key: those are `dir:`, `other:` or a uri.
            key: part('notice:unindexed'),
        };
    }
    /**
     * A folder row: its entries (sortEntries order), each with its `path`.
     *
     * - A data file is the hierarchy's own row for it (FolderHierarchy.rowOf), its references under
     *   it; one the index has no row for (past its cap, or an index that cannot be read) is a plain
     *   row that opens it, with nothing under it; one core does not read is an other file.
     * - A folder is a collapsible folder row of its own (kind `group`, groupKind `folder`, as the
     *   hierarchy's are; key `${parent.key}/dir%3A<name>`), whether or not it holds data. A project's
     *   folder (its marker in it) keeps its own name and takes the project's icon, its name as the
     *   `description` and its marker's `id`, so it opens the project's page.
     * - An other file is a `dimmed` row (kind `other`) with no `id`.
     *
     * A folder that cannot be read answers one `notice` row that says so, with the host's reason.
     * Any other row: the hierarchy's children of the row it copies, keyed under it, a reference
     * row's `relation` set from the edge kind.
     */
    async children(item) {
        const dir = this.folders.get(item);
        if (dir !== undefined)
            return this.folderChildren(item, dir);
        const theirs = this.copies.get(item);
        if (theirs)
            return (await this.hierarchy.children(theirs)).map((row) => this.copy(row, item, theirs, relationOf(theirs, row)));
        // Not a row of this tree's: the hierarchy's own (a host that lists no entries), or a row with
        // nothing under it (another file, a notice), which the hierarchy answers none for.
        return this.hierarchy.children(item);
    }
    /**
     * The row of a file (by uri) along its folders, for revealing the active tab.
     *
     * From the root's row down through the folders that hold the file, to its own row in its own
     * folder: so a file only ever referenced is found where it is, not under what references it.
     * Undefined for a file outside the folder (nothing is listed to know it) or in no folder the host
     * lists. For a host that lists no entries, the hierarchy's pathTo.
     */
    async pathTo(uri) {
        if (!(await this.listsEntries()))
            return this.hierarchy.pathTo(uri);
        const inside = (dir) => uri.startsWith(`${folderUriOf(dir)}/`);
        if (!inside(this.root))
            return undefined;
        const [root] = await this.roots();
        if (!root)
            return undefined;
        const path = [root];
        for (let at = root;;) {
            const rows = await this.children(at);
            // The file's own row, not a project's folder, which has its marker's uri.
            const own = rows.find((row) => row.id === uri && !this.folders.has(row));
            if (own)
                return [...path, own];
            const next = rows.find((row) => {
                const dir = this.folders.get(row);
                return dir !== undefined && inside(dir);
            });
            if (!next)
                return undefined;
            path.push(next);
            at = next;
        }
    }
    listsEntries() {
        if (!this.lists) {
            const first = this.entries(this.root);
            this.firstRoot = first;
            // A root that cannot be read is a host that lists entries: its row says why.
            this.lists = first.then((entries) => entries !== null, () => true);
        }
        return this.lists;
    }
    async folderChildren(parent, dir) {
        // The root's first opening draws the answer roots() asked for; every other, a listing of its own.
        const asked = dir === this.root && this.firstRoot ? this.firstRoot : this.entries(dir);
        if (dir === this.root)
            this.firstRoot = null;
        let listed;
        try {
            listed = await asked;
        }
        catch (err) {
            return [
                {
                    label: `This folder could not be read: ${messageOf(err)}`,
                    kind: 'notice',
                    collapsible: 'none',
                    key: `${parent.key}${part('notice:unreadable')}`,
                },
            ];
        }
        if (listed === null)
            return [];
        const entries = sortEntries(listed);
        // What the index says of this level: its projects, for a folder's row, and each data file's
        // own row, from the graph it holds (nothing is read for them). Not asked for a level of other
        // files alone; and an index that cannot be read (its listing failed) says nothing, so the
        // folder is still drawn, its data files as plain rows, as a file past its cap is.
        const hasFolders = entries.some((e) => e.kind === 'folder');
        const hasData = entries.some((e) => e.kind === 'data');
        let top = [];
        let theirsOf = [];
        try {
            [top, theirsOf] = await Promise.all([
                hasFolders ? this.hierarchy.roots() : [],
                hasData ? Promise.all(entries.map((e) => (e.kind === 'data' ? this.hierarchy.rowOf(sourceUri(e.path)) : undefined))) : [],
            ]);
        }
        catch {
            top = [];
            theirsOf = [];
        }
        return entries.map((entry, i) => {
            if (entry.kind === 'folder')
                return this.folderRow(entry, `${parent.key}${part(`dir:${entry.name}`)}`, top);
            const kind = entry.kind === 'data' ? fileKindOf(entry.path) : null;
            if (kind === null)
                return otherRow(entry, parent.key);
            const uri = sourceUri(entry.path);
            const key = `${parent.key}${part(uri)}`;
            const theirs = theirsOf[i];
            if (!theirs) {
                return { label: entry.name, kind, id: uri, health: null, collapsible: 'none', icon: fileIconOf(kind), key, path: entry.path };
            }
            const own = { ...theirs, key, path: entry.path };
            this.copies.set(own, theirs);
            return own;
        });
    }
    // A folder's row, a plain folder; a project's folder (the hierarchy groups a
    // project by its marker's folder) is the project's row under the folder's own name, so the row
    // reads as the path bar does, with the project's name after it where that is another.
    folderRow(entry, key, top) {
        const folderUri = folderUriOf(entry.path);
        const project = top.find((item) => item.kind === 'group' && item.groupKind === 'project' && item.id !== undefined && item.id.slice(0, item.id.lastIndexOf('/')) === folderUri);
        const row = project
            ? {
                ...project,
                label: entry.name,
                ...(project.label !== entry.name ? { description: project.label } : {}),
                collapsible: 'collapsed',
                key,
                path: entry.path,
            }
            : { label: entry.name, kind: 'group', groupKind: 'folder', collapsible: 'collapsed', icon: FOLDER_ICON, key, path: entry.path };
        this.folders.set(row, entry.path);
        return row;
    }
    // A row of the hierarchy's, drawn under `parent` (this tree's copy of `theirsParent`): keyed
    // under it, by the part the hierarchy keys it by under its own parent.
    copy(row, parent, theirsParent, relation) {
        const path = row.id !== undefined ? this.pathOf(row.id) : undefined;
        const own = {
            ...row,
            key: `${parent.key}${row.key.slice(theirsParent.key.length)}`,
            ...(relation ? { relation } : {}),
            ...(path !== undefined ? { path } : {}),
        };
        this.copies.set(own, row);
        return own;
    }
    // The path of a file of the folder, by its uri, spelled as the root is (its separator, its drive
    // letter's case), so a reference row's path is the one its file's own row has from its entry: a
    // uri reads back with a drive letter lower-cased (uriPath), where the host names it as it is.
    // Undefined for a uri outside the root.
    pathOf(uri) {
        const base = folderUriOf(this.root);
        if (!uri.startsWith(`${base}/`))
            return undefined;
        const sep = this.root.includes('\\') && !this.root.includes('/') ? '\\' : '/';
        const root = this.root.endsWith(sep) ? this.root.slice(0, -1) : this.root;
        return [root, ...uri.slice(base.length + 1).split('/').map(decoded)].join(sep);
    }
}
/**
 * The path of a row's file or folder, for a menu's Reveal and Copy Path: the row's own `path` (every
 * row a FolderTree draws of a folder or a file has one: an entry's, and a reference's spelled as the
 * root is), else its file's read back from its uri (`uriPath(id)`), for a row FolderHierarchy made,
 * which carries none. Undefined for a row of no file (External Data, a notice, an unresolved
 * reference).
 *
 * A uri reads back as the path sourceUri was given for a POSIX path, a page's among them (they start
 * with `/`); a Windows path reads back with its drive letter, and a UNC path with its host,
 * lower-cased, which is why a FolderTree's rows carry their own.
 */
export function rowPath(item) {
    if (item.path !== undefined)
        return item.path;
    return item.id !== undefined ? uriPath(item.id) : undefined;
}
function decoded(part) {
    try {
        return decodeURIComponent(part);
    }
    catch {
        return part;
    }
}
// A promise's outcome as a value, for a pair of asks one of which may fail alone.
function settled(promise) {
    return promise.then((rows) => ({ rows }), (failed) => ({ failed }));
}
// Another file's row: dimmed, a plain document, opening nothing (no `id`), its path kept for the
// menu's Reveal and Copy Path.
function otherRow(entry, parentKey) {
    return {
        label: entry.name,
        kind: 'other',
        dimmed: true,
        collapsible: 'none',
        icon: OTHER_ICON,
        key: `${parentKey}${part(`other:${entry.name}`)}`,
        path: entry.path,
    };
}
