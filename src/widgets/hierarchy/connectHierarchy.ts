// Copyright 2026 The MathWorks, Inc.
//
// A hierarchy widget that follows a folder. connectHierarchy draws a FolderHierarchy's rows in a
// <dex-hierarchy>, reads the rows under a row as it is opened, and draws again when the folder
// changes (its rebuild()) or a mark does (its refresh()), keeping what was open and selected; a
// chosen row's file is the app's to open.
//
// The VS Code extension draws the same rows in its own native tree, from the same FolderHierarchy;
// this is the half of its tree provider that an app without that tree needs.
import type { FolderHierarchy } from '../../model/hierarchy/folderHierarchy.js';
import type { DexHierarchy, HierarchyEventMap } from './dex-hierarchy.js';

/** How connectHierarchy wires a hierarchy. */
export interface ConnectHierarchyOptions {
  /**
   * What shows while the folder has no rows (it holds no file to show, or could not be read): an
   * element, shown (and the hierarchy hidden, by `hidden`) while there are none; or a function told
   * `true` for none and `false` for rows. Default: the tree just shows no rows.
   */
  empty?: HTMLElement | ((empty: boolean) => void);
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

  const onSelect = (e: HierarchyEventMap['dex-hierarchy-select']): void => {
    const uri = e.detail?.uri;
    if (typeof uri === 'string' && uri !== '') emit('open', uri);
  };

  element.loadChildren = (item) => hierarchy.children(item);
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
