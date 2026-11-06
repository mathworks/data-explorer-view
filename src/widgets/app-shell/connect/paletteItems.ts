// Copyright 2026 The MathWorks, Inc.
//
// What the command palette lists: every toolbar action, enabled exactly as its button is now, then
// a command to show each of the shell's views, then Settings and About. Each row's id is the
// ShellCommand it runs, and its shortcut the chord that does the same, in the platform's words
// (chordLabel). Pure: connectShell hands it the toolbar's state as the palette opens.
//
// The labels are the toolbar's where they say what they do out of the toolbar ("Save"), and longer
// where they lean on its icons ("Open" is Open File…, "Close" is Close Tab), as a menu would name
// them; the ellipsis marks a command that asks something before it acts.

import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import type { PaletteCommand } from '../modules/dex-command-palette.js';
import { chordOf } from './keys.js';
import { toolbarItems, type ToolbarState } from './toolbarItems.js';
import type { ShellCommand } from './types.js';
import { SHELL_VIEWS } from './views.js';

/** The palette's names for the toolbar's actions, where its own label would not do. */
const LABELS: Partial<Record<ShellCommand, string>> = {
  'open-file': 'Open File…',
  'open-folder': 'Open Folder…',
  'save-as': 'Save As…',
  'close-tab': 'Close Tab',
};

/** The toolbar's actions on its start side are the file's, on its end side the edits. */
const categoryOf = (align: string | undefined): string => (align === 'end' ? 'Edit' : 'File');

/** The palette's commands for the shell as `state` says it is. */
export function paletteCommands(state: ToolbarState): PaletteCommand[] {
  const label = (chord: string | undefined) => (chord ? chordLabel(parseChord(chord), state.mac) : undefined);
  const command = (id: ShellCommand, text: string, category: string, shortcut?: string, disabled = false): PaletteCommand => ({
    id,
    label: text,
    category,
    ...(shortcut ? { shortcut } : {}),
    ...(disabled ? { disabled } : {}),
  });
  return [
    ...toolbarItems(state).map((item) =>
      command(item.id as ShellCommand, LABELS[item.id as ShellCommand] ?? item.label, categoryOf(item.align), item.shortcut, !!item.disabled),
    ),
    ...SHELL_VIEWS.map((v) => command(v.command, `Show ${v.label}`, 'View', label(v.chord))),
    command('settings', 'Settings', 'Preferences', label(chordOf('settings'))),
    command('about', 'About', 'Help'),
  ];
}
