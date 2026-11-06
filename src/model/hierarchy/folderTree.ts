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
import { sourceUri } from '../source/sourceUri.js';
import { sortEntries, type FolderEntry } from './folderEntries.js';
import { fileIconOf, type FolderHierarchy, type HierarchyItem } from './folderHierarchy.js';
import type { SourceType } from './graphModel.js';

/** What a FolderTree draws from. */
export interface FolderTreeOptions {
  /** The index's tree (unchanged): data files, their folders, and each file's references. */
  hierarchy: FolderHierarchy;
  /** One level of a folder (FolderReader.entries); null: the host lists none, so the tree is the hierarchy's. */
  entries(dir: string): Promise<readonly FolderEntry[] | null>;
  /** The workspace folder's path (the served root). */
  root: string;
}

// The icon of a row of another file: a plain document.
const OTHER_ICON = 'documentList';
const FOLDER_ICON = 'simulink_folder';

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// One encoded part of a key, after its parent's key: never a raw `/`, so a key splits into its rows.
const part = (local: string): string => `/${encodeURIComponent(local)}`;

/** The uri a folder's files begin with, and a `/`: sourceUri's spelling, with no `/` of its own at the end. */
function folderUriOf(dir: string): string {
  return sourceUri(dir).replace(/\/$/, '');
}

/**
 * What a data file the index has no row for draws as, in the graph's vocabulary (SourceType, as
 * graphSources.ts maps core's sourceKind); null for a file core does not read, which the host
 * called data all the same. Every SourceKind by name, so a kind core adds fails to compile here.
 */
function fileKindOf(path: string): SourceType | null {
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
function relationOf(parent: HierarchyItem, row: HierarchyItem): string | undefined {
  if (parent.kind === 'model') return row.kind === 'model' || row.kind === 'missing' ? 'model reference' : undefined;
  if (parent.kind === 'sldd') return row.kind === 'sldd' || row.kind === 'missing' ? 'referenced dictionary' : undefined;
  if (parent.kind === 'group' && parent.groupKind === 'external-data') {
    if (row.kind === 'sldd') return 'data dictionary';
    if (row.kind === 'mat') return 'MAT-file';
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
  private readonly hierarchy: FolderHierarchy;
  private readonly entries: (dir: string) => Promise<readonly FolderEntry[] | null>;
  private readonly root: string;
  // Whether the host lists entries, from its first answer for the root: a host does not start or
  // stop. And that answer, until the root's row first opens, which draws it rather than list the
  // root a second time.
  private lists: Promise<boolean> | null = null;
  private firstRoot: Promise<readonly FolderEntry[] | null> | null = null;
  // This tree's folder rows, each by the path its entries are listed by.
  private readonly folders = new WeakMap<HierarchyItem, string>();
  // This tree's copies of the hierarchy's rows, each by the row it copies, which its rows are asked of.
  private readonly copies = new WeakMap<HierarchyItem, HierarchyItem>();

  constructor(options: FolderTreeOptions) {
    this.hierarchy = options.hierarchy;
    this.entries = (dir) => options.entries(dir);
    this.root = options.root;
  }

  /**
   * The root's own row (as FolderHierarchy.roots), its path set; and after it, when the index's
   * listing was cut short, the hierarchy's row that says so. For a host that lists no entries,
   * the hierarchy's roots.
   */
  async roots(): Promise<HierarchyItem[]> {
    const [lists, index] = await Promise.all([this.listsEntries(), settled(this.hierarchy.roots())]);
    if (!lists) {
      if ('failed' in index) throw index.failed;
      return index.rows;
    }
    // An index that cannot be read leaves the root's row, with no project's look and no notice.
    const top = 'rows' in index ? index.rows : [];
    // Keyed by its whole path, where a folder under it is keyed by its name: another root of the
    // same name is another tree.
    const root = this.folderRow({ name: basename(this.root) || this.root, path: this.root, kind: 'folder' }, part(`dir:${this.root}`), top);
    return [root, ...top.filter((item) => item.kind === 'notice')];
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
  async children(item: HierarchyItem): Promise<HierarchyItem[]> {
    const dir = this.folders.get(item);
    if (dir !== undefined) return this.folderChildren(item, dir);
    const theirs = this.copies.get(item);
    if (theirs) return (await this.hierarchy.children(theirs)).map((row) => this.copy(row, item, theirs, relationOf(theirs, row)));
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
  async pathTo(uri: string): Promise<HierarchyItem[] | undefined> {
    if (!(await this.listsEntries())) return this.hierarchy.pathTo(uri);
    const inside = (dir: string): boolean => uri.startsWith(`${folderUriOf(dir)}/`);
    if (!inside(this.root)) return undefined;
    const [root] = await this.roots();
    if (!root) return undefined;
    const path = [root];
    for (let at = root; ; ) {
      const rows = await this.children(at);
      // The file's own row, not a project's folder, which has its marker's uri.
      const own = rows.find((row) => row.id === uri && !this.folders.has(row));
      if (own) return [...path, own];
      const next = rows.find((row) => {
        const dir = this.folders.get(row);
        return dir !== undefined && inside(dir);
      });
      if (!next) return undefined;
      path.push(next);
      at = next;
    }
  }

  private listsEntries(): Promise<boolean> {
    if (!this.lists) {
      const first = this.entries(this.root);
      this.firstRoot = first;
      // A root that cannot be read is a host that lists entries: its row says why.
      this.lists = first.then(
        (entries) => entries !== null,
        () => true,
      );
    }
    return this.lists;
  }

  private async folderChildren(parent: HierarchyItem, dir: string): Promise<HierarchyItem[]> {
    // The root's first opening draws the answer roots() asked for; every other, a listing of its own.
    const asked = dir === this.root && this.firstRoot ? this.firstRoot : this.entries(dir);
    if (dir === this.root) this.firstRoot = null;
    let listed: readonly FolderEntry[] | null;
    try {
      listed = await asked;
    } catch (err) {
      return [
        {
          label: `This folder could not be read: ${messageOf(err)}`,
          kind: 'notice',
          collapsible: 'none',
          key: `${parent.key}${part('notice:unreadable')}`,
        },
      ];
    }
    if (listed === null) return [];
    const entries = sortEntries(listed);
    // What the index says of this level: its projects, for a folder's row, and each data file's
    // own row, from the graph it holds (nothing is read for them). Not asked for a level of other
    // files alone; and an index that cannot be read (its listing failed) says nothing, so the
    // folder is still drawn, its data files as plain rows, as a file past its cap is.
    const hasFolders = entries.some((e) => e.kind === 'folder');
    const hasData = entries.some((e) => e.kind === 'data');
    let top: readonly HierarchyItem[] = [];
    let theirsOf: readonly (HierarchyItem | undefined)[] = [];
    try {
      [top, theirsOf] = await Promise.all([
        hasFolders ? this.hierarchy.roots() : [],
        hasData ? Promise.all(entries.map((e) => (e.kind === 'data' ? this.hierarchy.rowOf(sourceUri(e.path)) : undefined))) : [],
      ]);
    } catch {
      top = [];
      theirsOf = [];
    }
    return entries.map((entry, i) => {
      if (entry.kind === 'folder') return this.folderRow(entry, `${parent.key}${part(`dir:${entry.name}`)}`, top);
      const kind = entry.kind === 'data' ? fileKindOf(entry.path) : null;
      if (kind === null) return otherRow(entry, parent.key);
      const uri = sourceUri(entry.path);
      const key = `${parent.key}${part(uri)}`;
      const theirs = theirsOf[i];
      if (!theirs) {
        return { label: entry.name, kind, id: uri, health: null, collapsible: 'none', icon: fileIconOf(kind), key, path: entry.path };
      }
      const own: HierarchyItem = { ...theirs, key, path: entry.path };
      this.copies.set(own, theirs);
      return own;
    });
  }

  // A folder's row, as the hierarchy draws a folder; a project's folder (the hierarchy groups a
  // project by its marker's folder) is the project's row under the folder's own name, so the row
  // reads as the path bar does, with the project's name after it where that is another.
  private folderRow(entry: FolderEntry, key: string, top: readonly HierarchyItem[]): HierarchyItem {
    const folderUri = folderUriOf(entry.path);
    const project = top.find(
      (item) => item.kind === 'group' && item.groupKind === 'project' && item.id !== undefined && item.id.slice(0, item.id.lastIndexOf('/')) === folderUri,
    );
    const row: HierarchyItem = project
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
  private copy(row: HierarchyItem, parent: HierarchyItem, theirsParent: HierarchyItem, relation: string | undefined): HierarchyItem {
    const own: HierarchyItem = { ...row, key: `${parent.key}${row.key.slice(theirsParent.key.length)}`, ...(relation ? { relation } : {}) };
    this.copies.set(own, row);
    return own;
  }
}

// A promise's outcome as a value, for a pair of asks one of which may fail alone.
function settled<T>(promise: Promise<T>): Promise<{ rows: T } | { failed: unknown }> {
  return promise.then(
    (rows) => ({ rows }),
    (failed: unknown) => ({ failed }),
  );
}

// Another file's row: dimmed, a plain document, opening nothing (no `id`), its path kept for the
// menu's Reveal and Copy Path.
function otherRow(entry: FolderEntry, parentKey: string): HierarchyItem {
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
