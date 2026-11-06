// Copyright 2026 The MathWorks, Inc.
//
// The folder in the Explorer, as the shell shows one and then another in its place: the folder's
// part (its title, its note) and its tree filled from the folder read across its port (folder.ts's
// showFolder), its name search, and what listens to the folder, let go of with it. connectShell says
// what a chosen file and a change mean (a tab opened, the documents' Usage and project pages
// painted again); this keeps the folder's own half.
//
// Lifted from data-explorer-app src/renderer/app.ts at 0983920 (its showFolder and its search's
// install), where the note and the title were elements of index.html.

import type { DexHierarchy } from '../../hierarchy/dex-hierarchy.js';
import type { DexShellFolder } from './dex-shell-folder.js';
import { showFolder, type FolderView } from './folder.js';
import { installSearch } from './folderSearch.js';

/** What the shell does with the folder shown. */
export interface ShownFolderActions {
  /** Open the file of `uri`, chosen in the tree or picked in the search; with `name`, on that row. */
  open(uri: string, name?: string): void;
  /** `folder` is the one shown now. */
  shown(folder: FolderView): void;
  /** `folder` changed: `uris` the files it touched, none for anything. */
  changed(folder: FolderView, uris?: readonly string[]): void;
  /** The folder shown could not be read: why, as its note says it. */
  failed?(message: string): void;
}

/** The folder shown in the Explorer, if any, and how to show another. */
export interface ShownFolder {
  /** The folder shown now, or none before the first. */
  readonly current: FolderView | undefined;
  /** Show `root`, read across `port`, in place of the folder shown before. */
  show(root: string, port: MessagePort): void;
  /** Let go of the folder shown and of the search. */
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
  const search = installSearch(part.searchInput, part.searchResults, tree, () => folder?.session.names, (uri, name) => actions.open(uri, name));

  return {
    get current() {
      return folder;
    },
    show(root, port) {
      drop();
      part.hidden = false;
      part.root = root;
      part.note = '';
      let note = 'No data files in this folder.';
      const shown = showFolder(tree, root, port, {
        empty: (isEmpty) => (part.note = isEmpty ? note : ''),
        open: (uri) => actions.open(uri),
        error: (text) => {
          note = `This folder could not be read: ${text}`;
          part.note = note;
          actions.failed?.(text);
        },
      });
      folder = shown;
      // The search reads the folder's names again each time the folder takes a change: its tree is
      // built again once its names are read again.
      stops = [shown.onChange((uris) => actions.changed(shown, uris)), shown.session.hierarchy.subscribe(() => search.reset())];
      search.reset();
      actions.shown(shown);
    },
    dispose() {
      drop();
      search.dispose();
    },
  };
}
