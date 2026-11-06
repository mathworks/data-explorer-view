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

import type { Theme } from '../../../model/shell/settings.js';

/**
 * A command the shell carries out: a toolbar button's id, a chord's, an explorer menu item's, a
 * command palette row's, and what a native menu asks for through `ShellHandle.command`. `palette`
 * opens the command palette; each `show-<view>` brings that view of the shell forward, and
 * `show-graph` goes to the Explorer's Root, where the relationship graph is.
 */
export type ShellCommand =
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
   * watcher starts on the read, past the close it heard.
   */
  closeFile?(path: string): void;
  /**
   * Write `bytes` over the open file `path`. `overwritten`: another program wrote the file after
   * the save, so the disk holds its file rather than the one saved.
   */
  saveFile(path: string, bytes: Uint8Array): Promise<{ overwritten: boolean }>;
  /**
   * Ask where to save the open file `path`, and write `bytes` there. Resolves to the path written
   * (`path` itself, for a Save As onto it), or null when cancelled. `overwritten`, for a Save As onto
   * the file itself, as for saveFile: another program wrote it after the save. Elsewhere, false.
   */
  saveFileAs(path: string, bytes: Uint8Array): Promise<{ path: string; overwritten: boolean } | null>;
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
}

/** How connectShell builds the app. */
export interface ConnectShellOptions {
  /** The page the shell runs in. */
  host: ShellHost;
  /** The app's name: the toolbar's label, the window title's end, and the About panel's heading. Default 'Data Explorer'. */
  appName?: string;
  /** The About panel's lines, under its heading. Default none. */
  about?: { label: string; value: string }[];
  /**
   * The prefix of what the shell keeps in localStorage. Default 'dex-shell': the settings under
   * `${key}:settings`, each file's column choices under `${key}:<its uri>`, and the layout under
   * the shell's own `storage-key`, which is set to `${key}:layout` when the shell has none.
   */
  storageKey?: string;
  /** The system's theme, for the Auto setting. Default the page's media queries (`systemThemeFromMedia`). */
  systemTheme?: { now(): Theme; on(listener: (theme: Theme) => void): () => void };
  /**
   * The host has a native menu that owns the File and Edit chords (Electron's): the shell then
   * answers only those a native menu cannot (Back, Forward, Up, Save All and Settings).
   */
  nativeMenu?: boolean;
}

/** A connected shell: what a host drives it by. */
export interface ShellHandle {
  /** Open these files, in order, each in a tab of its own (kept, not a preview): the last named ends up active. */
  openPaths(paths: readonly string[]): Promise<void>;
  /** Show `root`, read across `port` (serveFolder's other end), in the Explorer, in place of a folder shown before. */
  showFolder(root: string, port: MessagePort): void;
  /** An open file changed on disk: a clean tab takes the change, a tab with unsaved edits asks first. */
  fileChanged(path: string): void;
  /** Carry out a command, as its toolbar button or chord does. */
  command(id: ShellCommand): void;
  /**
   * The window is to close: settle every unsaved edit (ask, then save or discard), and resolve to
   * whether it may close. Nothing closes here; the host closes the window on true.
   */
  requestClose(): Promise<boolean>;
  /** Take the app down: every document closed, the shell's children and overlays removed, every listener gone. */
  dispose(): void;
}
