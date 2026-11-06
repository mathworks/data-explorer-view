// Copyright 2026 The MathWorks, Inc.
//
// The shell's keyboard chords, each written once (the toolbar's tooltips read the same text), and
// the one window listener that answers them.
//
// The Electron app bound these in its native menu (data-explorer-app src/main/menu.ts at 0983920:
// CmdOrCtrl+O, +Shift+O, +S, +Shift+S, +W, Ctrl+Tab, Ctrl+Shift+Tab, CmdOrCtrl+F); a browser page
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

import { matchesChord, parseChord, type Chord } from '../../../model/shell/chords.js';
import { isMacPlatform } from '../../shared/dragMode.js';
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
 * no item for.
 */
export function installKeys(run: (command: ShellCommand) => void, options: { nativeMenu?: boolean } = {}): () => void {
  const chords: { chord: Chord; spec: ShellChord }[] = SHELL_CHORDS.filter((spec) => !options.nativeMenu || spec.withNativeMenu).map((spec) => ({
    chord: parseChord(spec.chord),
    spec,
  }));
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.defaultPrevented) return;
    const mac = onMac();
    const hit = chords.find(({ chord }) => matchesChord(chord, e, mac));
    if (!hit) return;
    if (!hit.spec.inField && isTypingInField(e)) return;
    // Spent even when held, so a held Mod+S does not reach the browser's Save Page on its repeats.
    e.preventDefault();
    if (e.repeat && !hit.spec.repeats) return;
    run(hit.spec.command);
  };
  window.addEventListener('keydown', onKeydown);
  return () => window.removeEventListener('keydown', onKeydown);
}
