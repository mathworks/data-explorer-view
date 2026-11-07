// Copyright 2026 The MathWorks, Inc.
//
// The workspace folder, as the shell shows one and then another in its place: the Folder view's
// part (its root, its note) and its tree filled from the folder read across its port (folder.ts's
// showFolder), and what listens to the folder, let go of with it. connectShell says what a chosen
// file and a change mean (a tab opened, the documents' Usage and project pages painted again, the
// Search view asked again); this keeps the folder's own half.
//
// Lifted from data-explorer-app src/renderer/app.ts at 0983920 (its showFolder), where the note
// and the title were elements of index.html, and the folder had a search box of its own, which the
// Search view stands for here.

import type { DexHierarchy, HierarchyMenuDetail } from '../../hierarchy/dex-hierarchy.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import { showFolder, type FolderView } from './folder.js';

/** What the shell does with the folder shown. */
export interface ShownFolderActions {
  /** Open the file of `uri`, chosen in the tree; with `name`, on that row. */
  open(uri: string, name?: string): void;
  /** `folder` is the one shown now. */
  shown(folder: FolderView): void;
  /** `folder` changed: `uris` the files it touched, none for anything. */
  changed(folder: FolderView, uris?: readonly string[]): void;
  /** `folder`'s names were read again, after a change (its tree is built again once they are): a search of them is out of date. */
  namesChanged?(folder: FolderView): void;
  /** The folder shown could not be read: why, as its note says it. */
  failed?(message: string): void;
  /** A row's menu was asked for (a right click, Shift+F10 on the row). */
  menu?(detail: HierarchyMenuDetail): void;
  /** The folder's data files could not be read, where its tree shows its entries all the same: why, once. */
  indexFailed?(message: string): void;
}

/** The folder shown in the Folder view, if any, and how to show another. */
export interface ShownFolder {
  /** The folder shown now, or none before the first. */
  readonly current: FolderView | undefined;
  /** Show `root`, read across `port`, in place of the folder shown before. */
  show(root: string, port: MessagePort): void;
  /** Let go of the folder shown. */
  dispose(): void;
}

/** Show folders in `part`, with `tree` as their tree. */
export function connectShownFolder(part: DexShellFolder, tree: DexHierarchy, actions: ShownFolderActions): ShownFolder {
  let folder: FolderView | undefined;
  // What listens to the folder shown: let go of with it, when another is shown or the shell goes.
  let stops: (() => void)[] = [];
  const drop = (): void => {
    for (const stop of stops) stop();
    stops = [];
    folder?.dispose();
    folder = undefined;
  };

  return {
    get current() {
      return folder;
    },
    show(root, port) {
      drop();
      part.root = root;
      part.note = '';
      part.status = '';
      let note = 'No data files in this folder.';
      const shown = showFolder(tree, root, port, {
        empty: (isEmpty) => (part.note = isEmpty ? note : ''),
        open: (uri) => actions.open(uri),
        error: (text) => {
          note = `This folder could not be read: ${text}`;
          part.note = note;
          actions.failed?.(text);
        },
        menu: (detail) => actions.menu?.(detail),
        indexFailed: (text) => actions.indexFailed?.(text),
      });
      folder = shown;
      // The folder's names are read again each time it takes a change: its tree is built again
      // once they are, which is when a search of them is asked again.
      stops = [shown.onChange((uris) => actions.changed(shown, uris)), shown.session.hierarchy.subscribe(() => actions.namesChanged?.(shown))];
      actions.shown(shown);
    },
    dispose() {
      drop();
    },
  };
}
