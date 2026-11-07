// Copyright 2026 The MathWorks, Inc.
//
// What the shell's parts ask, and what connectShell does for each: the toolbar's buttons, the
// welcome's and the command palette's rows (each a ShellCommand); a view the user brought forward;
// the Settings and About buttons; each pane's tab row's select, close, pin and move; the documents'
// area's pane focused, tab dropped and divider moved; the location bar's Back, Forward, Up and
// segments; the Explorer's rows and its files' menus; a tab's menu. Each part names a tab by its
// id, and a request about a tab that has closed since does nothing.

import type { DexAppShell } from '../dex-app-shell.js';
import type { OpenTab } from './documents.js';
import { connectFileMenu } from './fileMenu.js';
import { connectTabMenu } from './tabMenu.js';
import type { ShellParts } from './parts.js';
import type { ShellCommand } from './types.js';
import { SHELL_VIEWS } from './views.js';
import type { Rect } from '../../../model/shell/placement.js';

const COMMANDS: ReadonlySet<string> = new Set<ShellCommand>([
  'new-file', 'open-file', 'open-folder', 'save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut',
  'copy', 'paste', 'delete', 'next-tab', 'previous-tab', 'split-right', 'move-to-other-pane', 'focus-pane-1', 'focus-pane-2', 'focus-filter', 'back', 'forward', 'up', 'settings', 'about',
  'palette', 'show-graph', 'folder-up', 'folder-refresh', 'open-url', 'copy-link', ...SHELL_VIEWS.map((v) => v.command),
]);

/** Whether `id` is a command the shell carries out: what a part sends as one may be anything. */
export function isShellCommand(id: string): id is ShellCommand {
  return COMMANDS.has(id);
}

/** What connectShell does for its parts' requests. */
export interface ShellRequests {
  command(id: ShellCommand): void;
  /** The open tab of a part's id for it. */
  tabOf(id: string): OpenTab | undefined;
  activate(tab: OpenTab): void;
  /** Close `tab`, asking first about unsaved edits. */
  close(tab: OpenTab): void;
  /** The tabs a tab's menu's Close Others would close for `tab`: the others of its own pane. */
  others(tab: OpenTab): readonly OpenTab[];
  /** Close the others of `tab`'s pane, asking once about their unsaved edits, and make `tab` the active one. */
  closeOthers(tab: OpenTab): void;
  /** A tab's menu's Copy Link at `tab`: null for a host that makes no links, else whether it links a file. */
  link(tab: OpenTab): { enabled: boolean } | null;
  /** Copy Link at `tab`'s selection. */
  copyLink(tab: OpenTab): void;
  save(tab: OpenTab, as: boolean): void;
  pin(tab: OpenTab): void;
  /** Move `tab` to `index` of the pane `pane`, its place once moved: along its row, or into the other pane's. */
  move(tab: OpenTab, index: number, pane: number): void;
  /** The pane of a tab row (0 the left), or -1 for none of the panes' rows. */
  paneOfRow(row: EventTarget | null): number;
  /** The user is in the pane `pane` now: a press, or the keyboard's focus, came into it. */
  focusPane(pane: number): void;
  /** `tab` was dropped on the documents of the pane `pane`: move it there, or with `side`, into a new pane on that side. */
  drop(tab: OpenTab, pane: number, side?: 'left' | 'right'): void;
  /** The divider between the panes was moved: the left pane takes `ratio` of the width. */
  resized(ratio: number): void;
  /** Show the Explorer's Root: no document. */
  showRoot(): void;
  /** Go to the location bar's segment `index`. */
  toStep(index: number): void;
  /** Toggle the Settings or About popover beside `anchor`. */
  toggle(id: 'settings' | 'about', anchor: Rect): void;
  /** The user brought the view `view` forward, or opened or closed its side. */
  viewChanged(view: string | null, open: boolean): void;
}

/** Answer `parts`' requests with `on`; returns what stops it. */
export function connectRequests(shell: DexAppShell, parts: ShellParts, on: ShellRequests): () => void {
  const stops: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (e: HTMLElementEventMap[K]) => void): void => {
    target.addEventListener(type, listener);
    stops.push(() => target.removeEventListener(type, listener));
  };
  const asked = (id: string): void => {
    if (isShellCommand(id)) on.command(id);
  };
  // The toolbar, the welcome's buttons, which ask what the toolbar's Open and Folder ask, the Folder
  // view's Open Folder… with no folder shown, and the palette.
  listen(parts.toolbar, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(parts.docs, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(parts.folderPart, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(parts.palette, 'dex-palette-run', (e) => asked(e.detail.id));
  listen(shell, 'dex-shell-view-changed', (e) => on.viewChanged(e.detail.view, e.detail.open));
  listen(shell, 'dex-shell-action', (e) => {
    const { actionId, anchor } = e.detail;
    if (actionId === 'settings' || actionId === 'about') on.toggle(actionId, anchor);
  });
  // The panes' tab rows' requests, heard on the documents' area they are in (a second pane's row
  // comes and goes), each about a tab by its id, from the row of a pane; a move's index is the
  // tab's place once moved, in the row it was dropped on.
  const onTab = <K extends 'dex-tab-select' | 'dex-tab-close' | 'dex-tab-pin' | 'dex-tab-move'>(type: K, act: (tab: OpenTab, e: HTMLElementEventMap[K], pane: number) => void) =>
    listen(parts.docs, type, (e) => {
      const pane = on.paneOfRow(e.target);
      const tab = on.tabOf(e.detail.id);
      if (tab && pane >= 0) act(tab, e, pane);
    });
  onTab('dex-tab-select', (tab) => on.activate(tab));
  onTab('dex-tab-close', (tab) => on.close(tab));
  onTab('dex-tab-pin', (tab) => on.pin(tab));
  onTab('dex-tab-move', (tab, e, pane) => on.move(tab, e.detail.index, pane));
  // The documents' area: the pane the user is in, a tab dropped on a pane's documents, the divider.
  listen(parts.docs, 'dex-pane-focus', (e) => on.focusPane(e.detail.pane));
  listen(parts.docs, 'dex-pane-drop', (e) => {
    const tab = on.tabOf(e.detail.id);
    if (tab) on.drop(tab, e.detail.pane, e.detail.side);
  });
  listen(parts.docs, 'dex-panes-resized', (e) => on.resized(e.detail.ratio));
  listen(parts.location, 'dex-location-go', (e) => {
    const { to } = e.detail;
    if (typeof to === 'number') on.toStep(to);
    else on.command(to);
  });
  listen(parts.explorer, 'dex-explorer-open', (e) => {
    const { fileId, sectionId, pin } = e.detail;
    if (fileId === null) return on.showRoot();
    const tab = on.tabOf(fileId);
    if (!tab) return;
    if (pin) on.pin(tab);
    on.activate(tab);
    if (sectionId !== undefined) tab.handle?.select([sectionId]);
  });
  // A file's menu in the Explorer: Save, Save As and Close for that file.
  stops.push(connectFileMenu(parts.explorer, parts.menu, { tabOf: on.tabOf, save: on.save, close: on.close }));
  // A tab's menu: Close, Close Others and Copy Link for that tab.
  stops.push(
    connectTabMenu(parts.docs, parts.menu, {
      tabOf: on.tabOf,
      others: on.others,
      close: on.close,
      closeOthers: on.closeOthers,
      link: on.link,
      copyLink: on.copyLink,
    }),
  );
  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}
