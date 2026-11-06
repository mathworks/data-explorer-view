// Copyright 2026 The MathWorks, Inc.
//
// What connectShell takes and gives: the host it runs over, the commands it carries out, and the
// handle a page drives it by. One shell runs in an Electron window and in a plain browser page;
// what differs between the two is the host. Electron's preload answers every question with a
// native dialog and the disk; a browser page picks files with an <input type="file">, keeps them
// in memory, and leaves out what it cannot do (a folder, a reveal), so the shell asks its own
// in-page dialogs instead.
//
// Lifted from data-explorer-app src/shared/api.ts at 0983920: the page's half of its `window.dex`
// API, less what the app's own wiring does (its IPC channels, the menu's and the theme's events,
// the folder's port message), which a host now does through the handle.

import type { AboutLine } from '../../../model/shell/about.js';
import type { Theme } from '../../../model/shell/settings.js';

/**
 * A command the shell carries out: a toolbar button's id, a chord's, an explorer menu item's, a
 * command palette row's, and what a native menu asks for through `ShellHandle.command`. `new-file`
 * makes a new data dictionary (ShellHost.newFile; nothing, for a host without it); `palette` opens
 * the command palette; each `show-<view>` brings that view of the shell forward, and `show-graph`
 * goes to the Explorer's Root, where the relationship graph is. The documents split in two panes
 * side by side: `split-right` moves the active tab into a pane on the right (a new one, or the
 * right one there is), `move-to-other-pane` into the other pane (making it, from a lone pane), and
 * `focus-pane-1` and `focus-pane-2` go to the left and the right pane. A file is open in one tab
 * only, so a split moves a tab and never copies it; a pane's only tab makes no new pane.
 */
export type ShellCommand =
  | 'new-file'
  | 'open-file'
  | 'open-folder'
  | 'save'
  | 'save-as'
  | 'save-all'
  | 'close-tab'
  | 'undo'
  | 'redo'
  | 'add-child'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'delete'
  | 'next-tab'
  | 'previous-tab'
  | 'split-right'
  | 'move-to-other-pane'
  | 'focus-pane-1'
  | 'focus-pane-2'
  | 'focus-filter'
  | 'back'
  | 'forward'
  | 'up'
  | 'settings'
  | 'about'
  | 'palette'
  | 'show-explorer'
  | 'show-gallery'
  | 'show-search'
  | 'show-properties'
  | 'show-raw'
  | 'show-terminal'
  | 'show-log'
  | 'show-graph';

/** What to do with unsaved edits of files that are to close. */
export type CloseAnswer = 'save' | 'discard' | 'cancel';

/**
 * What the shell asks of the page it runs in: files to open, their bytes, where saves go, and the
 * questions a host may ask in its own dialogs. Every member is read from the object each time it is
 * needed (the optional ones too: whether there is a Folder button is asked at each repaint, the
 * clipboard at each copy), so a host, or a test, may replace one while the shell runs.
 */
export interface ShellHost {
  /**
   * Ask where a new data dictionary is to go, `suggestedName` offered (`untitled.sldd`): resolves to
   * its path, which may hold no file yet, or null when cancelled. The shell opens the path in a tab of
   * its own as a new, empty dictionary with unsaved edits (Workspace.create), and writes it there
   * when the user saves it, through `saveFile`; it does not read it, so a file that is there already
   * is written over by that save. A path the host cannot write may still be answered: its save says
   * why. A host that watches files starts on this path here or at its first `saveFile`: a new file is
   * never read. Absent: the shell offers no New (no button, chord or command).
   *
   * A browser may make the file, or empty the one there, as it is picked (Chromium's save picker
   * does): the browser host then writes a new dictionary there at once. A path a tab has open is not
   * made a new file: the shell reads it, and where the dialog emptied it, writes the tab's copy back.
   */
  newFile?(suggestedName: string): Promise<string | null>;
  /** Show the host's Open File dialog; resolves to the chosen paths (empty when cancelled). */
  pickFiles(): Promise<string[]>;
  /**
   * Show the host's Open Folder dialog. A folder chosen comes back through `ShellHandle.showFolder`
   * with its port. Absent: the host shows no folders, and the shell offers no Folder button.
   */
  pickFolder?(): Promise<void>;
  /** The bytes of a data file the user opened. A rejection is shown in the file's table. */
  readFile(path: string): Promise<Uint8Array>;
  /**
   * Stop watching a file whose tab closed, by the path it was opened with. May be called twice for
   * one path: a tab closed while its file was read is told again once the read lands, since a
   * watcher starts on the read, past the close it heard. A new file's tab (newFile) is told too,
   * though the file was never read, and so is a path newFile answered that the shell does not open
   * (one that is not a dictionary's).
   */
  closeFile?(path: string): void;
  /**
   * Write `bytes` over the open file `path`. `overwritten`: another program wrote the file after
   * the save, so the disk holds its file rather than the one saved. `downloaded`: the bytes were
   * handed to the user as a download rather than written over the file (a browser page with no way
   * to write it): the document is saved all the same, and the shell says the file was downloaded
   * rather than saved. Absent, false.
   */
  saveFile(path: string, bytes: Uint8Array): Promise<{ overwritten: boolean; downloaded?: boolean }>;
  /**
   * Ask where to save the open file `path`, and write `bytes` there. Resolves to the path written
   * (`path` itself, for a Save As onto it), or null when cancelled. `overwritten`, for a Save As onto
   * the file itself, as for saveFile: another program wrote it after the save. Elsewhere, false.
   * `downloaded`, as for saveFile: the bytes went to a download (`path` itself the answer).
   */
  saveFileAs(path: string, bytes: Uint8Array): Promise<{ path: string; overwritten: boolean; downloaded?: boolean } | null>;
  /** Ask whether to save the unsaved edits of the files `names` before they close. Absent: the in-page confirm dialog. */
  confirmClose?(names: string[]): Promise<CloseAnswer>;
  /**
   * The file `name` holds what the shell's document does not: it changed on disk while the document
   * held unsaved edits, or another program wrote over the shell's save of it (saveFile's
   * `overwritten`). Whether to reload it, and lose the edits; false keeps them over the disk's file.
   * Absent: the in-page confirm dialog.
   */
  confirmReload?(name: string): Promise<boolean>;
  /** Whether any open file has unsaved edits: a window's edited mark, and a prompt before it closes. */
  setEdited?(edited: boolean): void;
  /** The window's title. Absent: `document.title`. */
  setTitle?(title: string): void;
  /** Put text on the system clipboard (the table's Copy Name and Copy Value). Absent: `navigator.clipboard`. */
  copyText?(text: string): Promise<void>;
  /** Show a file or folder in the OS file manager: a project page's link to what the shell does not open. */
  reveal?(path: string): Promise<void>;
  /** What a project page calls the file manager `reveal` shows things in ('Finder'). Default by platform. */
  revealIn?: string;
  /**
   * What a tooltip says of the file at `path` (its tab's, its Explorer row's, its location bar
   * segment's): what the path means to the user, for a host whose paths are of its own making (the
   * browser host's: a file's name, or its place in the folder it was shown from); '' for none.
   * Absent: the path itself.
   */
  pathTitle?(path: string): string;
  /**
   * A link to the entry `target` names (the desktop app's `data-explorer://open?…`), for Copy Link
   * to Entry on a document's row menu: the shell puts it on the clipboard (copyText) and says "Link
   * copied". Read at each menu. '' copies nothing. Absent: no such item (a browser page and the
   * VS Code extension show none).
   */
  entryLink?(target: ShellEntryTarget): string;
}

/** How connectShell builds the app. */
export interface ConnectShellOptions {
  /** The page the shell runs in. */
  host: ShellHost;
  /** The app's name: the toolbar's label, the window title's end, and the About panel's heading. Default 'Data Explorer'. */
  appName?: string;
  /**
   * The About panel's lines, under its heading: each a label and its value, and the heading of the
   * section it is in, if any (`{ label: 'data-explorer-view', value: VIEW_VERSION, section: 'Built on' }`).
   * Default none.
   */
  about?: AboutLine[];
  /**
   * The prefix of what the shell keeps in localStorage. Default 'dex-shell': the settings under
   * `${key}:settings`, each file's column choices under `${key}:<its uri>`, and the layout under
   * the shell's own `storage-key`, which is set to `${key}:layout` when the shell has none.
   */
  storageKey?: string;
  /**
   * The system's theme, for the Auto setting, for a host that can be asked it now and told of its
   * changes. Default the page's media queries (`systemThemeFromMedia`). A host that hears it only
   * after connecting tells it with `ShellHandle.setSystemTheme`.
   */
  systemTheme?: { now(): Theme; on(listener: (theme: Theme) => void): () => void };
  /**
   * The host has a native menu that owns the File and Edit chords (Electron's): the shell then
   * answers only those a native menu cannot (Back, Forward, Up, Save All and Settings).
   */
  nativeMenu?: boolean;
}

/** What a page tells the user through the shell (ShellHandle.notify): a toast, and its line in the Log. */
export interface ShellNotice {
  /**
   * How much it matters, as the Log's levels: 'info' goes by itself after a few seconds; a
   * 'warning' or an 'error' stays until its × is pressed, since it has to be read. Default 'info'.
   */
  level?: 'info' | 'warning' | 'error';
  /** What it says, as text (a line break in it starts a new line). Empty, it says nothing, and nothing is shown. */
  text: string;
}

/** Where in a file a link from outside points (ShellHandle.openAt): an entry by its name, in a section by its label. */
export interface OpenAtTarget {
  /** The entry to select: its Name as the table shows it (`Kp`), or a block's key. Absent or '': none; the file opens as openPaths opens it. */
  entry?: string;
  /** The label of the section the entry is in, as its row in the table reads (`Design Data`, `Model Workspace`). Absent or '': any. */
  section?: string;
}

/** An entry of a file, as a link names it: the file's path, the entry's name, and its section's label where it has one. */
export interface ShellEntryTarget {
  path: string;
  entry: string;
  section?: string;
}

/** A connected shell: what a host drives it by. */
export interface ShellHandle {
  /** Open these files, in order, each in a tab of its own (kept, not a preview): the last named ends up active. */
  openPaths(paths: readonly string[]): Promise<void>;
  /**
   * Open the file at `path` in a tab of its own (kept, as openPaths keeps one), or go to its tab,
   * then select the entry `at` names once the table has its rows: with `section`, the first
   * top-level entry of that name under the section row of that label; without, as a link selects
   * (an entry, then any row but a section's, then a block by its key). An entry the file has none
   * of: the file stays open, and a toast says "No entry named Kp" (" in Model Elements" with a
   * section). A file with no table (a project's page, a file that could not be read, which its tab
   * says) selects nothing and says nothing more. Never rejects: what fails is said in the window.
   */
  openAt(path: string, at?: OpenAtTarget): Promise<void>;
  /** Show `root`, read across `port` (serveFolder's other end), in the Explorer, in place of a folder shown before. */
  showFolder(root: string, port: MessagePort): void;
  /** An open file changed on disk: a clean tab takes the change, a tab with unsaved edits asks first. */
  fileChanged(path: string): void;
  /** Carry out a command, as its toolbar button or chord does. */
  command(id: ShellCommand): void;
  /**
   * Tell the user something of the page's own (a file it fetched that could not be, a drop it could
   * not read): a toast in the window's corner, and the same line in the Log, which keeps what a
   * toast lets go by.
   */
  notify(notice: ShellNotice): void;
  /**
   * The system's theme is `theme`, for the Settings' Auto: for a host that hears the theme rather
   * than asks for it (Electron's nativeTheme, told to the page over IPC once the page is up, then on
   * each change). Auto draws the page in it at once; a theme the user chose stays. From the first
   * call the shell follows what the host tells, and no longer the `systemTheme` source it was
   * connected with (the page's media queries by default), so the two never take turns.
   */
  setSystemTheme(theme: Theme): void;
  /**
   * The window is to close: settle every unsaved edit (ask, then save or discard), and resolve to
   * whether it may close. Nothing closes here; the host closes the window on true.
   */
  requestClose(): Promise<boolean>;
  /** Take the app down: every document closed, the shell's children and overlays removed, every listener gone. */
  dispose(): void;
}
