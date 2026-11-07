// Copyright 2026 The MathWorks, Inc.
//
// The shell's views, each written once: where it goes, what its activity button says and draws,
// the chord that toggles it (which <dex-app-shell> answers itself, from the view's `shortcut`), and
// the command that brings it forward (the command palette's "Show Explorer"). parts.ts builds a
// `<dex-shell-view>` from each, and the palette lists each, so a view's button, chord and command
// cannot drift apart.
//
// The prototype's layout: the Explorer, the Gallery and Search on the left, the Properties and
// Raw on the right, the Terminal and the Log in the bottom panel; each first one shown at first.
//
// Its chords, but for two a browser will not give up: Raw is Mod+Shift+U, as Mod+Shift+W closes the
// window in Chromium, and no page can prevent it; the Terminal is Ctrl+` on every platform, a
// literal Ctrl as VS Code has it, as Cmd+` switches a Mac's windows.
//
// The Folder view, second on the left beside the Explorer (which keeps the open files), is
// Mod+Shift+K: of the free letters, the one no browser keeps from a page and the app's native menu
// leaves alone. Mod+Shift+J is Chromium's DevTools console on Windows and Linux and its Downloads
// on macOS; Mod+Shift+Y a Mac's Make New Sticky Note service, and Firefox's Downloads elsewhere;
// Mod+Shift+K is only Firefox's Web Console on Windows and Linux, which a page spends, as Show
// Graph's Mod+Shift+H spends a browser's history.
//
// Pure: data alone.

import type { ShellCommand } from './types.js';

/** One view of the shell. */
export interface ShellViewSpec {
  /** Its id, as `<dex-shell-view view>` and the shell's layout name it. */
  view: string;
  side: 'left' | 'right' | 'bottom';
  /** Its button's tooltip and its side's header. */
  label: string;
  /** Its button's icon, which ships in icons/. */
  icon: string;
  /** The chord that shows it, or closes its side when it is shown. */
  chord: string;
  /** The command that brings it forward. */
  command: ShellCommand;
}

/** The shell's views, in the order of their buttons on each side. */
export const SHELL_VIEWS: readonly ShellViewSpec[] = [
  { view: 'explorer', side: 'left', label: 'Explorer', icon: 'filesSB', chord: 'Mod+Shift+E', command: 'show-explorer' },
  { view: 'folder', side: 'left', label: 'Folder', icon: 'folder', chord: 'Mod+Shift+K', command: 'show-folder' },
  { view: 'gallery', side: 'left', label: 'Gallery', icon: 'gridUI', chord: 'Mod+Shift+L', command: 'show-gallery' },
  { view: 'search', side: 'left', label: 'Search', icon: 'find', chord: 'Mod+Shift+F', command: 'show-search' },
  { view: 'properties', side: 'right', label: 'Properties', icon: 'propertyInspectorSB', chord: 'Mod+Shift+I', command: 'show-properties' },
  { view: 'raw', side: 'right', label: 'Raw', icon: 'code', chord: 'Mod+Shift+U', command: 'show-raw' },
  { view: 'terminal', side: 'bottom', label: 'Terminal', icon: 'openTerminal', chord: 'Ctrl+`', command: 'show-terminal' },
  { view: 'log', side: 'bottom', label: 'Log', icon: 'documentList', chord: 'Mod+Shift+D', command: 'show-log' },
];

/** The view a `show-<view>` command brings forward, or none for any other command. */
export function viewOfCommand(command: ShellCommand): ShellViewSpec | undefined {
  return SHELL_VIEWS.find((v) => v.command === command);
}
