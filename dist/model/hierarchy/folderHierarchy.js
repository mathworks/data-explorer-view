// Copyright 2026 The MathWorks, Inc.
// A folder as its hierarchy shows it: the relationship graph of its files (graphModel.ts), read
// over the shared source cache (graphSources.ts), and every node of it as the row a tree draws.
//
// The VS Code extension's sections tree with VS Code taken out: its SectionsTreeProvider's graph
// cache, rebuild and resolveReference, its health rule, its icon table, and what its getTreeItem
// reads off a node, which is what a HierarchyItem holds. So `<dex-hierarchy>` and the extension's
// native tree draw one folder the same way, and the extension's golden trees (hierarchy.json) are
// the spec this answers to (test/goldens/hierarchy.test.ts). What stays with a host is only what
// its own tree needs: the extension's Uri per row, its command, its decoration query.
//
// DOM-free: an app lists the folder and reads its files (FolderFiles, GraphReader); nothing here
// knows where the files are.
import { newSourceCache } from 'data-explorer-core';
import { srcIdToUriString } from '../ids/srcId.js';
import { isTruncated } from './folderList.js';
import { RelGraph } from './graphModel.js';
import { graphSourcesOf } from './graphSources.js';
// The icon a node draws, by kind. `project` is a safety net: a project marker heads a group,
// so no file row is one today.
const ICON_BY_KIND = {
    model: 'simulink',
    sldd: 'simulink_database',
    mat: 'matlabWorkspaceFile',
    project: 'simulink_project',
    group: 'link_database',
};
/** Every icon id a hierarchy row can name, for the check that each one ships in icons/. */
export const HIERARCHY_ICONS = [
    ...new Set([...Object.values(ICON_BY_KIND), 'simulink_folder', 'typeGeneric']),
];
function iconOf(node) {
    if (node.kind === 'missing')
        return undefined;
    if (node.kind === 'group') {
        if (node.groupKind === 'project')
            return 'simulink_project';
        if (node.groupKind === 'folder')
            return 'simulink_folder';
        return ICON_BY_KIND.group;
    }
    return Object.hasOwn(ICON_BY_KIND, node.kind) ? ICON_BY_KIND[node.kind] : 'typeGeneric';
}
/**
 * The single most severe health state of a file row, or null when it is healthy. A cycle before
 * an unsaved change. `missing` is a kind of node of its own, with no file to be dirty.
 */
export function healthOf(node, dirty) {
    if (node.cycle)
        return 'cycle';
    return dirty ? 'modified' : null;
}
/**
 * A folder's hierarchy: the files it holds, grouped by project and folder, each with the files
 * it references under it, lazily, as rows.
 *
 * The graph is read once and kept: `roots()` and `children()` answer from it until `rebuild()`
 * drops it, for what changes the folder (a file created, deleted or saved). `refresh()` keeps it,
 * for what changes a row and not the folder: a file's unsaved changes, which the graph cannot
 * see because it reads the files as saved. Either tells every subscriber to draw again.
 */
export class FolderHierarchy {
    constructor(options) {
        this.options = options;
        this.graph = null;
        // How many files a graph was built from, for a graph whose listing was cut short.
        this.cutAt = new WeakMap();
        this.nodes = new WeakMap();
        this.listeners = new Set();
        this.cache = options.cache ?? newSourceCache();
    }
    /**
     * The top level: a row per project, then per folder, each by name; and last, when the folder's
     * listing was cut short (FolderFileList.truncated), a `notice` row that says only its first
     * files are shown.
     */
    async roots() {
        const graph = await this.ensureGraph();
        const items = this.itemsOf(graph.roots(), '');
        const cut = this.cutAt.get(graph);
        if (cut !== undefined)
            items.push(truncatedNotice(cut));
        return items;
    }
    /**
     * The rows under `item`, from the graph as it is now: an item from before a rebuild answers
     * what its file holds today. An item this hierarchy did not make has none.
     */
    async children(item) {
        const node = this.nodes.get(item);
        if (!node)
            return [];
        const graph = await this.ensureGraph();
        return this.itemsOf(graph.children(node), item.key);
    }
    /**
     * The file a bare name means when `referrerUri` names it, by the rule this hierarchy draws with:
     * the copy in the referrer's own project or folder, else the first match in the folder. A link
     * resolved through this opens the file the hierarchy shows under the referrer.
     */
    async resolveReference(ref, referrerUri) {
        return (await this.ensureGraph()).resolveFor(ref, referrerUri)[0];
    }
    /**
     * The file a link in the document `fromUri` opens, where the link names it by a bare file name
     * (as a model records the models and dictionaries it links, `params.sldd` or
     * `Kp@params.sldd`): resolveReference's answer, the file this hierarchy shows under `fromUri`
     * for that name. Undefined for a link that names its file by a uri or a path, which means that
     * file, and for a name no file of the folder has.
     *
     * What connectTable's `resolveLink` asks, so a table's links open the files the tree shows:
     * `resolveLink: (link, fromUri) => hierarchy.resolveLink(link, fromUri)`.
     */
    async resolveLink(link, fromUri) {
        const name = srcIdToUriString(link.kind === 'file' ? link.file : link.source);
        if (name === '' || name.includes('/') || name.includes('\\'))
            return undefined;
        return this.resolveReference(name, fromUri);
    }
    /**
     * The rows from the top level down to a row whose file is `uri` (its `id`), that row last; or
     * undefined when no row is (the file is not in the folder). A file can be a row in several
     * places, under each file that references it, and in its own folder's group when nothing there
     * references it; the row this finds is the shallowest, and of several at one depth the first as
     * the tree draws them, from the top. Each file's references are read once, however many rows it
     * is. For a tree to show a file (connectHierarchy's `reveal`).
     */
    async pathTo(uri) {
        const pathOf = (step) => {
            const path = [];
            for (let at = step; at; at = at.up)
                path.unshift(at.item);
            return path;
        };
        // A file's rows hold the same files wherever it is a row, so only the first is searched: a
        // later one finds nothing the first does not find as high or higher.
        const searched = new Set();
        let level = (await this.roots()).map((item) => ({ item, up: null }));
        while (level.length > 0) {
            const found = level.find((step) => step.item.id === uri);
            if (found)
                return pathOf(found);
            const next = [];
            for (const step of level) {
                const { item } = step;
                if (item.collapsible !== 'collapsed')
                    continue;
                if (item.kind !== 'group' && item.id !== undefined) {
                    if (searched.has(item.id))
                        continue;
                    searched.add(item.id);
                }
                for (const child of await this.children(item))
                    next.push({ item: child, up: step });
            }
            level = next;
        }
        return undefined;
    }
    /** Draw the rows again from the graph there is: for a file's unsaved changes. */
    refresh() {
        for (const listener of [...this.listeners])
            listener();
    }
    /** Read the folder again, for what changes it: a file created, deleted or saved. */
    rebuild() {
        this.graph = null;
        this.refresh();
    }
    /** Hear every refresh() and rebuild(), until the returned function is called. */
    subscribe(listener) {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    }
    ensureGraph() {
        if (!this.graph) {
            const building = this.buildGraph();
            this.graph = building;
            // A build that failed is not kept: the next ask reads the folder again.
            building.catch(() => {
                if (this.graph === building)
                    this.graph = null;
            });
        }
        return this.graph;
    }
    // Through the SHARED source cache, so this pass and a usage plan's or a name index's are one
    // pass over the same artifacts: a build after a save reads the saved file and `stat`s the rest.
    async buildGraph() {
        const files = await this.options.files.list();
        const graph = new RelGraph(await graphSourcesOf(this.cache, this.options.reader(files), files));
        if (isTruncated(files))
            this.cutAt.set(graph, files.length);
        return graph;
    }
    itemsOf(nodes, parentKey) {
        const seen = new Map();
        return nodes.map((node) => {
            const local = localKey(node);
            const repeat = (seen.get(local) ?? 0) + 1;
            seen.set(local, repeat);
            const key = `${parentKey}/${encodeURIComponent(repeat > 1 ? `${local}#${repeat}` : local)}`;
            const item = this.itemOf(node, key);
            this.nodes.set(item, node);
            return item;
        });
    }
    // What the extension's getTreeItem draws for a node, field by field.
    itemOf(node, key) {
        const { label } = node;
        if (node.kind === 'missing') {
            return {
                label,
                kind: node.kind,
                collapsible: 'none',
                description: 'unresolved reference',
                tooltip: `Referenced file "${label}" was not found in the workspace.`,
                key,
            };
        }
        if (node.kind === 'group') {
            // A project group IS a file, its marker, so it opens like any other row (to the project
            // page) and keeps its twisty: the members and the page are two views of one project.
            const opens = node.groupKind === 'project' && node.uriString;
            return {
                label,
                kind: node.kind,
                groupKind: node.groupKind,
                ...(opens ? { id: node.uriString } : {}),
                collapsible: node.hasChildren ? 'collapsed' : 'none',
                ...(opens ? { tooltip: `Open the project page for "${label}".` } : {}),
                icon: iconOf(node),
                key,
            };
        }
        // A cycle row is drawn but never expanded: from its top-level occurrence it is.
        const dirty = !!node.uriString && (this.options.isDirty?.(node.uriString) ?? false);
        return {
            label,
            kind: node.kind,
            id: node.uriString,
            health: healthOf(node, dirty),
            collapsible: node.cycle || !node.hasChildren ? 'none' : 'collapsed',
            ...(node.cycle
                ? {
                    description: '↻ circular reference',
                    tooltip: `"${label}" is part of a circular reference chain; expand it from its top-level occurrence.`,
                }
                : {}),
            icon: iconOf(node),
            key,
        };
    }
}
/** The row that ends a folder whose listing stopped at `count` files. */
function truncatedNotice(count) {
    const n = count.toLocaleString('en-US');
    return {
        label: count === 1 ? 'Only the first file is shown' : `Only the first ${n} files are shown`,
        kind: 'notice',
        collapsible: 'none',
        tooltip: `This folder holds more data files than the ${n} listed. Open a folder inside it to see the rest.`,
        // No group's or file's key: those are `project:`, `folder:`, `external-data:` or a uri.
        key: `/${encodeURIComponent('notice:truncated')}`,
    };
}
// Who a node is among its siblings: its file, or its group's directory, or its kind and label.
function localKey(node) {
    if (node.kind === 'group' && node.groupKind !== 'external-data')
        return `${node.groupKind}:${node.groupKey ?? node.label}`;
    if (node.kind === 'group')
        return `external-data:${node.label}`;
    return node.uriString ?? `${node.kind}:${node.label}`;
}
