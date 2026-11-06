// Copyright 2026 The MathWorks, Inc.
//
// What the shell's parts ask, and what connectShell does for each: the toolbar's buttons, the
// welcome's and the command palette's rows (each a ShellCommand); a view the user brought forward;
// the Settings and About buttons; the tab row's select, close, pin and move; the location bar's
// Back, Forward, Up and segments; the Explorer's rows and its files' menus. Each part names a tab by
// its id, and a request about a tab that has closed since does nothing.

import type { DexAppShell } from '../dex-app-shell.js';
import type { OpenTab } from './documents.js';
import { connectFileMenu } from './fileMenu.js';
import type { ShellParts } from './parts.js';
import type { ShellCommand } from './types.js';
import { SHELL_VIEWS } from './views.js';
import type { Rect } from '../../../model/shell/placement.js';

const COMMANDS: ReadonlySet<string> = new Set<ShellCommand>([
  'open-file', 'open-folder', 'save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut', 'copy',
  'paste', 'delete', 'next-tab', 'previous-tab', 'focus-filter', 'back', 'forward', 'up', 'settings', 'about', 'palette',
  'show-graph', ...SHELL_VIEWS.map((v) => v.command),
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
  save(tab: OpenTab, as: boolean): void;
  pin(tab: OpenTab): void;
  /** Move `tab` to `index`, its place once moved. */
  move(tab: OpenTab, index: number): void;
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
  // The toolbar, the welcome's buttons, which ask what the toolbar's Open and Folder ask, and the palette.
  listen(parts.toolbar, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(parts.docs, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(parts.palette, 'dex-palette-run', (e) => asked(e.detail.id));
  listen(shell, 'dex-shell-view-changed', (e) => on.viewChanged(e.detail.view, e.detail.open));
  listen(shell, 'dex-shell-action', (e) => {
    const { actionId, anchor } = e.detail;
    if (actionId === 'settings' || actionId === 'about') on.toggle(actionId, anchor);
  });
  // The tab row's requests, each about a tab by its id; a move's index is the tab's place once moved.
  const onTab = <K extends 'dex-tab-select' | 'dex-tab-close' | 'dex-tab-pin' | 'dex-tab-move'>(type: K, act: (tab: OpenTab, e: HTMLElementEventMap[K]) => void) =>
    listen(parts.strip, type, (e) => {
      const tab = on.tabOf(e.detail.id);
      if (tab) act(tab, e);
    });
  onTab('dex-tab-select', (tab) => on.activate(tab));
  onTab('dex-tab-close', (tab) => on.close(tab));
  onTab('dex-tab-pin', (tab) => on.pin(tab));
  onTab('dex-tab-move', (tab, e) => on.move(tab, e.detail.index));
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
  return () => {
    for (const stop of stops.splice(0)) stop();
  };
}
