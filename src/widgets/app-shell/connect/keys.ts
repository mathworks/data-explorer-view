// Copyright 2026 The MathWorks, Inc.
//
// The shell's keyboard chords, each written once (the toolbar's tooltips read the same text), and
// the one window listener that answers them.
//
// The Electron app bound these in its native menu (data-explorer-app src/main/menu.ts at 0983920:
// CmdOrCtrl+O, +Shift+O, +S, +Shift+S, +W, +Z, Shift+CmdOrCtrl+Z, CmdOrCtrl+F, Ctrl+Tab,
// Ctrl+Shift+Tab); a browser page has no such menu, so the shell answers them itself, along with
// the shell's own (New, Save All, Back, Forward, Up, Settings, the command palette, as the
// prototype had them, and Root's graph). New is a File menu's item, CmdOrCtrl+N, in an app with a
// native menu, as Open is. The chords of the shell's views (Mod+Shift+E and the rest, views.ts) are
// <dex-app-shell>'s, which answers each view's `shortcut` itself, with a native menu or without.
// A host with a native menu says so, and then the menu fires its chords through the handle and the
// shell answers only the ones a native menu does not have: a second answer would save twice.
//
// Heard on the window, in the bubble phase, after every widget: a widget that takes a key for
// itself (a table's Cmd/Ctrl+Z and Cmd/Ctrl+F, the shell's own view chords) prevents its default,
// and a press already spent is left alone. A press typed into a field (the search box, a cell
// editor, a column filter, read off the composed path as the table reads it) is the field's,
// but for New, Open and Save, which an editor answers wherever the caret is. A field is one that
// takes text (shared/textField.ts): a chord on a checkbox outside a table is the shell's.
//
// Undo and Redo are the native Edit menu's in Electron, and a browser page has none: here they
// undo the active document from wherever the focus is but two places. In a field they are left
// to the browser, which undoes the field's typing, as the app's Edit > Undo did with execCommand;
// and in a table they are the table's (connectTable's undoChords), which answers them where its
// document takes edits and knows when it does not: answered here too, a press would undo twice,
// or undo a document whose table chose not to.

import { matchesChord, parseChord, type Chord } from '../../../model/shell/chords.js';
import { isMacPlatform } from '../../shared/dragMode.js';
import { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import { isTextField } from '../../shared/textField.js';
import type { ShellCommand } from './types.js';

/** One chord of the shell's. */
export interface ShellChord {
  /** The chord, as the model's chords are written ('Mod+Shift+S'). */
  chord: string;
  /** What it does. */
  command: ShellCommand;
  /** Answered with a native menu too: a menu has no item for it. */
  withNativeMenu?: boolean;
  /** Answered while a field takes the typing. */
  inField?: boolean;
  /** Answered again as a held key repeats: a move, which a person holds to go further. */
  repeats?: boolean;
  /** Left to a table the press is in, which answers it itself. */
  tablesOwn?: boolean;
  /** Off macOS only: a chord of Windows and Linux (Ctrl+Y), which is no chord on a Mac. */
  offMac?: boolean;
}

/** The chords the shell answers, in the order the toolbar and the menus list them. */
export const SHELL_CHORDS: readonly ShellChord[] = [
  { chord: 'Mod+N', command: 'new-file', inField: true },
  { chord: 'Mod+O', command: 'open-file', inField: true },
  { chord: 'Mod+Shift+O', command: 'open-folder' },
  { chord: 'Mod+S', command: 'save', inField: true },
  { chord: 'Mod+Shift+S', command: 'save-as' },
  { chord: 'Mod+Alt+S', command: 'save-all', withNativeMenu: true },
  { chord: 'Mod+W', command: 'close-tab' },
  { chord: 'Ctrl+Tab', command: 'next-tab', repeats: true },
  { chord: 'Ctrl+Shift+Tab', command: 'previous-tab', repeats: true },
  { chord: 'Mod+F', command: 'focus-filter' },
  { chord: 'Mod+Z', command: 'undo', repeats: true, tablesOwn: true },
  { chord: 'Mod+Shift+Z', command: 'redo', repeats: true, tablesOwn: true },
  { chord: 'Ctrl+Y', command: 'redo', repeats: true, tablesOwn: true, offMac: true },
  { chord: 'Alt+ArrowLeft', command: 'back', withNativeMenu: true, repeats: true },
  { chord: 'Alt+ArrowRight', command: 'forward', withNativeMenu: true, repeats: true },
  { chord: 'Alt+ArrowUp', command: 'up', withNativeMenu: true, repeats: true },
  // Root's graph, where Up leads: H for the top of it all, as Shift+Command+H is a Mac's Finder's
  // Home. Not the prototype's Mod+Shift+G, a browser's Find Previous on macOS (and the Finder's Go to
  // Folder); a browser's own Shift+Cmd/Ctrl+H (its home page, Firefox's history) is a page's to spend.
  { chord: 'Mod+Shift+H', command: 'show-graph', withNativeMenu: true },
  { chord: 'Mod+,', command: 'settings', withNativeMenu: true },
  { chord: 'Mod+Shift+P', command: 'palette', withNativeMenu: true },
  // Firefox keeps Ctrl+Shift+P for a private window, so the palette answers F1 too, as VS Code's does.
  { chord: 'F1', command: 'palette', withNativeMenu: true },
];

/** The chord of `command`, as written in SHELL_CHORDS (its first, for one with two), or none. */
export function chordOf(command: ShellCommand): string | undefined {
  return SHELL_CHORDS.find((c) => c.command === command)?.chord;
}

/** Whether the page runs on macOS, where Mod is Command: read at each press, as the shell reads it. */
export function onMac(): boolean {
  return isMacPlatform(navigator.platform || navigator.userAgent || '');
}

/** How installKeys answers. */
export interface KeyOptions {
  /** A native menu has the File and Edit chords: only those it has no item for are answered. */
  nativeMenu?: boolean;
  /**
   * Whether the shell offers `command` now (New, for a host that makes files), asked at each press:
   * the chord of one it does not is left to the page, unspent. Default: every one.
   */
  offers?(command: ShellCommand): boolean;
}

/**
 * Answer the shell's chords on the window with `run`, until the returned function is called. Each
 * chord answered is spent (preventDefault). With `nativeMenu`, only the chords a native menu has
 * no item for: Undo and Redo among the rest are the menu's. A chord of a command the shell does not
 * offer now (`offers`) is not answered.
 */
export function installKeys(run: (command: ShellCommand) => void, options: KeyOptions = {}): () => void {
  const chords: { chord: Chord; spec: ShellChord }[] = SHELL_CHORDS.filter((spec) => !options.nativeMenu || spec.withNativeMenu).map((spec) => ({
    chord: parseChord(spec.chord),
    spec,
  }));
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const mac = onMac();
    const hit = chords.find(({ chord, spec }) => !(mac && spec.offMac) && matchesChord(chord, e, mac));
    if (!hit) return;
    if (!hit.spec.inField && isTextField(e.composedPath()[0] as Element | undefined)) return;
    if (hit.spec.tablesOwn && e.composedPath().some((el) => el instanceof DexTreeTable)) return;
    if (options.offers && !options.offers(hit.spec.command)) return;
    // Spent even when held, so a held Mod+S does not reach the browser's Save Page on its repeats.
    e.preventDefault();
    if (e.repeat && !hit.spec.repeats) return;
    run(hit.spec.command);
  };
  window.addEventListener('keydown', onKeydown);
  return () => window.removeEventListener('keydown', onKeydown);
}
