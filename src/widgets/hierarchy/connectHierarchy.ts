// Copyright 2026 The MathWorks, Inc.
//
// A hierarchy widget that follows a folder. connectHierarchy draws a FolderHierarchy's rows in a
// <dex-hierarchy>, reads the rows under a row as it is opened, and draws again when the folder
// changes (its rebuild()) or a mark does (its refresh()), keeping what was open and selected; a
// chosen row's file is the app's to open, and the app can show the tree a file (reveal()).
//
// The VS Code extension draws the same rows in its own native tree, from the same FolderHierarchy;
// this is the half of its tree provider that an app without that tree needs.
import type { FolderHierarchy, HierarchyItem } from '../../model/hierarchy/folderHierarchy.js';
import type { DexHierarchy, HierarchyEventMap } from './dex-hierarchy.js';

/** How connectHierarchy wires a hierarchy. */
export interface ConnectHierarchyOptions {
  /**
   * What shows while the folder has no rows (it holds no file to show, or could not be read): an
   * element, shown (and the hierarchy hidden, by `hidden`) while there are none; or a function told
   * `true` for none and `false` for rows. Default: the tree just shows no rows.
   */
  empty?: HTMLElement | ((empty: boolean) => void);
  /**
   * Open each top-level row (a folder's own row, each project's) the first time the tree shows
   * it, then leave it as the user leaves it: the tree's `expandTopLevel`, which this sets, as
   * connectTable opens a table's sections. Default false: a folder opens closed (or as the tree's
   * own `expandTopLevel` says).
   */
  expandTopLevel?: boolean;
}

/** How `reveal()` shows a file. */
export interface RevealOptions {
  /**
   * Also send `dex-hierarchy-select` for the row, as a click on it does (so the handle's `open`
   * too), without opening or closing it. Default false: the row is shown and selected, and nothing
   * is sent.
   */
  choose?: boolean;
}

/** What a connected hierarchy tells the app, by name, and what each listener is given. */
export interface HierarchyHandleEventMap {
  /** A row that opens a file was chosen: the file's uri. */
  open: string;
  /** The folder could not be read: why. The tree shows no rows (the `empty` state) until it can. */
  error: string;
}

/** A hierarchy wired to a folder: what connectHierarchy returns. */
export interface HierarchyHandle {
  readonly element: DexHierarchy;
  readonly hierarchy: FolderHierarchy;
  /** Hear an event, until the returned function is called. */
  on<K extends keyof HierarchyHandleEventMap>(type: K, listener: (detail: HierarchyHandleEventMap[K]) => void): () => void;
  /**
   * Show the file `uri` (a uri the folder lists, as the row's `id` holds it) in the tree: open the
   * rows above its row, select it, and scroll it into view (the tree's `revealRow`). For a tree
   * that follows the file the app has open, as an editor's explorer does.
   *
   * Where the file is a row in several places (a dictionary under each model that links it), the
   * selected row stays when it is one of them (the user chose the file there); else the row is
   * the shallowest, and of several at one depth the first from the top (FolderHierarchy's
   * `pathTo`). Resolves true once the row is selected; false, with the tree left as it was, when
   * no row is the file (it is not in the folder, or the folder cannot be read), when a later
   * reveal() overtook this one, or after dispose(). Sends nothing unless `options.choose` says to.
   */
  reveal(uri: string, options?: RevealOptions): Promise<boolean>;
  /** Stop following the folder: the tree keeps what it shows, and still opens rows. */
  dispose(): void;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/**
 * Wire `element` to `hierarchy`: draw its rows now, and again on each of its refreshes and
 * rebuilds, and answer each row the user opens.
 */
export function connectHierarchy(
  element: DexHierarchy,
  hierarchy: FolderHierarchy,
  options: ConnectHierarchyOptions = {},
): HierarchyHandle {
  const listeners: { [K in keyof HierarchyHandleEventMap]: Set<(detail: HierarchyHandleEventMap[K]) => void> } = {
    open: new Set(),
    error: new Set(),
  };
  const emit = <K extends keyof HierarchyHandleEventMap>(type: K, detail: HierarchyHandleEventMap[K]): void => {
    for (const listener of [...listeners[type]]) (listener as (d: HierarchyHandleEventMap[K]) => void)(detail);
  };
  let disposed = false;
  // The last draw asked for: an earlier one answering after it is dropped, so a slow read of the
  // folder as it was cannot paint over the folder as it is.
  let asked = 0;
  // The last reveal asked for, likewise: the file the app has open now, not one it had open.
  let revealing = 0;

  const setEmpty = (isEmpty: boolean): void => {
    const empty = options.empty;
    if (typeof empty === 'function') return empty(isEmpty);
    if (empty) {
      empty.hidden = !isEmpty;
      element.hidden = isEmpty;
    }
  };

  const draw = async (): Promise<void> => {
    const ask = ++asked;
    try {
      const roots = await hierarchy.roots();
      if (disposed || ask !== asked) return;
      element.items = roots;
      setEmpty(roots.length === 0);
    } catch (err) {
      if (disposed || ask !== asked) return;
      element.items = [];
      setEmpty(true);
      emit('error', messageOf(err));
    }
  };

  // The row last selected by a choice or a reveal, and its file.
  let selected: { key: string; uri: string | null } | null = null;
  const onSelect = (e: HierarchyEventMap['dex-hierarchy-select']): void => {
    const uri = e.detail?.uri;
    if (typeof e.detail?.key === 'string') selected = { key: e.detail.key, uri: typeof uri === 'string' ? uri : null };
    if (typeof uri === 'string' && uri !== '') emit('open', uri);
  };

  // The rows from the top level down to the row `key`, if the folder has it now. A key is its
  // parent's key, a `/`, and an encoded part of its own (FolderHierarchy), so its ancestors are
  // its prefixes.
  const rowsTo = async (key: string): Promise<HierarchyItem[] | undefined> => {
    const parts = key.split('/').slice(1);
    const path: HierarchyItem[] = [];
    try {
      let items = await hierarchy.roots();
      for (let i = 0; i < parts.length; i++) {
        const want = `/${parts.slice(0, i + 1).join('/')}`;
        const item = items.find((it) => it.key === want);
        if (!item) return undefined;
        path.push(item);
        if (i < parts.length - 1) items = await hierarchy.children(item);
      }
      return path;
    } catch {
      return undefined;
    }
  };

  element.loadChildren = (item) => hierarchy.children(item);
  if (options.expandTopLevel) element.expandTopLevel = true;
  element.addEventListener('dex-hierarchy-select', onSelect);
  const stop = hierarchy.subscribe(() => void draw());
  void draw();

  return {
    element,
    hierarchy,
    on(type, listener) {
      const set = listeners[type] as Set<typeof listener>;
      set.add(listener);
      return () => void set.delete(listener);
    },
    async reveal(uri, revealOptions = {}) {
      if (disposed) return false;
      const ask = ++revealing;
      // The row selected now, when it is the file's already (the user chose it there): it stays.
      const kept = selected && selected.uri === uri && element.selectedKey === selected.key ? await rowsTo(selected.key) : undefined;
      const path = kept?.[kept.length - 1]?.id === uri ? kept : await hierarchy.pathTo(uri).catch(() => undefined);
      if (disposed || ask !== revealing || !path || path.length === 0) return false;
      selected = { key: path[path.length - 1]!.key, uri };
      element.revealRow(path, revealOptions.choose ? { choose: true } : {});
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      element.removeEventListener('dex-hierarchy-select', onSelect);
      listeners.open.clear();
      listeners.error.clear();
    },
  };
}
