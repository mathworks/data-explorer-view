// Copyright 2026 The MathWorks, Inc.
//
// The shell's keyboard chords, each written once (the toolbar's tooltips read the same text), and
// the one window listener that answers them.
//
// The Electron app bound these in its native menu (data-explorer-app src/main/menu.ts at 0983920:
// CmdOrCtrl+O, +Shift+O, +S, +Shift+S, +W, +Z, Shift+CmdOrCtrl+Z, CmdOrCtrl+F, Ctrl+Tab,
// Ctrl+Shift+Tab); a browser page
// has no such menu, so the shell answers them itself, along with the shell's own (Save All,
// Back, Forward, Up, Settings, as the prototype had them). A host with a native menu says so,
// and then the menu fires its chords through the handle and the shell answers only the ones a
// native menu does not have: a second answer would save twice.
//
// Heard on the window, in the bubble phase, after every widget: a widget that takes a key for
// itself (a table's Cmd/Ctrl+Z and Cmd/Ctrl+F, the shell's own view chords) prevents its default,
// and a press already spent is left alone. A press typed into a field (the search box, a cell
// editor, a column filter, read off the composed path as the table reads it) is the field's,
// but for Save and Open, which an editor answers wherever the caret is.
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
import { isTypingInField } from '../../tree-table/editingWire.js';
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
  { chord: 'Mod+,', command: 'settings', withNativeMenu: true },
];

/** The chord of `command`, as written in SHELL_CHORDS, or none. */
export function chordOf(command: ShellCommand): string | undefined {
  return SHELL_CHORDS.find((c) => c.command === command)?.chord;
}

/** Whether the page runs on macOS, where Mod is Command: read at each press, as the shell reads it. */
export function onMac(): boolean {
  return isMacPlatform(navigator.platform || navigator.userAgent || '');
}

/**
 * Answer the shell's chords on the window with `run`, until the returned function is called. Each
 * chord answered is spent (preventDefault). With `nativeMenu`, only the chords a native menu has
 * no item for: Undo and Redo among the rest are the menu's.
 */
export function installKeys(run: (command: ShellCommand) => void, options: { nativeMenu?: boolean } = {}): () => void {
  const chords: { chord: Chord; spec: ShellChord }[] = SHELL_CHORDS.filter((spec) => !options.nativeMenu || spec.withNativeMenu).map((spec) => ({
    chord: parseChord(spec.chord),
    spec,
  }));
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const mac = onMac();
    const hit = chords.find(({ chord, spec }) => !(mac && spec.offMac) && matchesChord(chord, e, mac));
    if (!hit) return;
    if (!hit.spec.inField && isTypingInField(e)) return;
    if (hit.spec.tablesOwn && e.composedPath().some((el) => el instanceof DexTreeTable)) return;
    // Spent even when held, so a held Mod+S does not reach the browser's Save Page on its repeats.
    e.preventDefault();
    if (e.repeat && !hit.spec.repeats) return;
    run(hit.spec.command);
  };
  window.addEventListener('keydown', onKeydown);
  return () => window.removeEventListener('keydown', onKeydown);
}
