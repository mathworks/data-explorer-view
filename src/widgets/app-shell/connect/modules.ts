// Copyright 2026 The MathWorks, Inc.
//
// The modules' views, wired to the shell: Raw (rawPane.ts), Search (searchPane.ts), the Gallery
// (galleryPane.ts) and the Terminal (terminal.ts), each over the active tab, the open tabs and the
// folder shown as connectShell has them; and the views' showing, by their commands and as the user
// shows them. connectShell calls refresh() whenever what they show may have moved, and its Save
// waits for idle(), the Terminal's lines run so far.
//
// The Log and the command palette are not here: every part of the shell writes to the Log, and the
// palette runs the shell's commands, so both are connectShell's own.

import { namesOfRows } from '../../../model/search/openDocNames.js';
import { isEditable } from '../../../model/source/tableSource.js';
import type { DexAppShell } from '../dex-app-shell.js';
import { copyText, type OpenTab } from './documents.js';
import type { FolderView } from './folder.js';
import { connectGalleryPane } from './galleryPane.js';
import type { ShellParts } from './parts.js';
import { connectRawPane } from './rawPane.js';
import { rowIn } from './rows.js';
import { connectSearchPane } from './searchPane.js';
import { connectTerminal } from './terminal.js';
import type { ShellHost } from './types.js';
import { SHELL_VIEWS } from './views.js';

/** What the modules read of the shell, and do through it. */
export interface ModulesContext {
  shell: DexAppShell;
  parts: ShellParts;
  host: ShellHost;
  /** The active tab, or none at Root. */
  active(): OpenTab | undefined;
  /** Every open tab, in the row's order. */
  tabs(): readonly OpenTab[];
  /** The folder shown, if any. */
  folder(): FolderView | undefined;
  /** Open the file of `uri` as a preview, on the row `name` names, if it names one. */
  openOn(uri: string, name?: string): void;
  /** Save `tab` for the Terminal's `save`: what to say, or a rejection saying why not. */
  save(tab: OpenTab): Promise<string>;
  /** Something could not be done: say so (a toast, and the Log). */
  failed(message: string): void;
  /** Ask for a refresh, a microtask from now. */
  later(): void;
}

/** The modules, as connectShell drives them. */
export interface Modules {
  /** Show each module as the active tab, its selection and the folder are now. */
  refresh(): void;
  /** Bring the view `view` forward; Search's and the Terminal's box takes the keyboard. */
  show(view: string): void;
  /** The user brought `view` forward (its button, its chord): its box takes the keyboard. */
  shown(view: string): void;
  /** Settles once the Terminal's lines run so far have. */
  idle(): Promise<void>;
  /** Say what Search covers: the open files, and the folder `folderName` if one is shown. */
  scope(folderName: string | null): void;
  dispose(): void;
}

/** Wire the modules' views of `context.parts`. */
export function connectModules(context: ModulesContext): Modules {
  const { shell, parts, host } = context;

  /** Whether the view `id` is on screen: the one its side shows, on a side that is open. */
  const onScreen = (id: string): boolean => {
    const side = SHELL_VIEWS.find((v) => v.view === id)?.side;
    return !!side && shell.layout[side].open && shell.layout[side].view === id;
  };
  // A view with a box of its own (Search, the Terminal) gives it the keyboard once the shell has
  // drawn the side it shows the view on: a box in a side not drawn yet (one that was closed) is in
  // no slot, and takes no focus. The shell then leaves a focus that is in the view where it is,
  // rather than moving it to the view's first control. Asked twice in one change (the command,
  // then the change it made), the box is focused once; the last view asked for is the one.
  let focusing: string | null = null;
  let disposed = false;
  const focusBox = (view: string): void => {
    const pending = focusing !== null;
    focusing = view;
    if (pending) return;
    void shell.updateComplete.then(() => {
      const view = focusing;
      focusing = null;
      if (disposed || !view || !onScreen(view)) return;
      if (view === 'search') parts.search.focusInput();
      else if (view === 'terminal') parts.terminal.focusInput();
    });
  };

  // Raw: what the active document's file holds for the selected row, or for the file itself.
  const raw = connectRawPane(parts.raw, {
    target() {
      const tab = context.active();
      const doc = tab?.doc;
      if (!tab || !doc) return null;
      const answer = doc.table.raw?.bind(doc.table);
      const rowId = tab.selection[0];
      // The row's name, or the file's for its own summary.
      const label = (rowId === undefined ? undefined : rowIn(tab.table?.rows ?? [], rowId)?.Name.label) ?? tab.name;
      return { key: tab.id, ...(answer ? { raw: answer } : {}), rowId: rowId ?? doc.uri, label };
    },
    shown: () => onScreen('raw'),
    copy: (text) => copyText(host, text),
    failed: context.failed,
  });

  // Search: the open files' names, read off their tables' rows with what each row shows of its
  // entry (its value and its type), and the folder's index.
  const search = connectSearchPane(parts.search, {
    openRecords: () => context.tabs().flatMap((t) => (t.doc && t.table ? namesOfRows(t.table.rows, t.doc.uri, t.doc.kind, { cells: true }) : [])),
    folderNames: () => context.folder()?.session.names,
    open: (uri, name) => context.openOn(uri, name),
    failed: context.failed,
  });
  search.scope(null);

  // Gallery: the Add gallery's tiles for the active file, a tile adding one entry to it.
  const gallery = connectGalleryPane(parts.gallery, {
    target() {
      const tab = context.active();
      if (!tab) return null;
      const doc = tab.doc;
      const handle = tab.handle;
      if (!doc || !handle) return { name: tab.name, view: undefined, editable: false, add: () => {} };
      const source = doc.table;
      const editable = doc.editable && !!handle.view?.editable && isEditable(source);
      return {
        name: tab.name,
        view: handle.view,
        editable,
        // Painted, and still taking no entry: a .mdl, a file kept for viewing only.
        ...(handle.view && !editable ? { note: `${tab.name} takes no edits.` } : {}),
        // What a cell editor or an inspector field still open holds is the document's before the add.
        add: async (entry) => {
          context.parts.inspector.commit();
          await handle.commitEdit();
          if (isEditable(source)) source.addEntry(entry);
        },
      };
    },
    failed: context.failed,
  });

  // Terminal: the command window's lines, run one after another over the active document.
  const terminal = connectTerminal(parts.terminal, { active: context.active, tabs: context.tabs, save: context.save });

  return {
    refresh() {
      raw.refresh();
      gallery.refresh();
    },
    show(view) {
      shell.showView(view);
      focusBox(view);
    },
    shown: focusBox,
    idle: () => terminal.idle(),
    scope: (folderName) => search.scope(folderName),
    dispose() {
      disposed = true;
      raw.dispose();
      search.dispose();
      gallery.dispose();
      terminal.dispose();
    },
  };
}
