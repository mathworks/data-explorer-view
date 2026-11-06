// Copyright 2026 The MathWorks, Inc.
//
// What the command palette lists: every toolbar action, enabled exactly as its button is now, then
// a command to show each of the shell's views and Root's relationship graph, then Settings and
// About. Each row's id is the ShellCommand it runs, and its shortcut the chord that does the same,
// in the platform's words (chordLabel). Pure: connectShell hands it the toolbar's state as the
// palette opens.
//
// The labels are the toolbar's where they say what they do out of the toolbar ("Save"), and longer
// where they lean on its icons ("Open" is Open File…, "New" New Data Dictionary…, "Close" is Close
// Tab), as a menu would name them; the ellipsis marks a command that asks something before it acts
// (New asks where the file goes, where the host has a dialog for it).
//
// The order and the groups are the prototype's palette's, before anything is typed and the commands
// run lately come first: File; Edit as an Edit menu has it, the clipboard before Delete and Add Child
// (the toolbar groups them by kind instead); View, side by side as the prototype's bars had them,
// the graph after Search and the Log before the Terminal; and Settings and About under Other. Each
// view is shown, not toggled, as its command does: "Show Raw View" where the prototype's said
// "Toggle Raw View".

import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import type { PaletteCommand } from '../modules/dex-command-palette.js';
import { chordOf } from './keys.js';
import { toolbarItems, type ToolbarState } from './toolbarItems.js';
import type { ShellCommand } from './types.js';
import { SHELL_VIEWS } from './views.js';

/** The palette's names for the toolbar's actions and the views, where their own label would not do. */
const LABELS: Partial<Record<ShellCommand, string>> = {
  'new-file': 'New Data Dictionary…',
  'open-file': 'Open File…',
  'open-folder': 'Open Folder…',
  'save-as': 'Save As…',
  'close-tab': 'Close Tab',
  'show-raw': 'Show Raw View',
};

/** The toolbar's actions on its start side are the file's, on its end side the edits. */
const categoryOf = (align: string | undefined): string => (align === 'end' ? 'Edit' : 'File');

/**
 * Where each command goes among those of its group; one not named keeps its place after them (a
 * view a later version adds). The File group's is the toolbar's.
 */
const ORDER: readonly ShellCommand[] = [
  'undo',
  'redo',
  'cut',
  'copy',
  'paste',
  'delete',
  'add-child',
  'show-explorer',
  'show-gallery',
  'show-search',
  'show-graph',
  'show-properties',
  'show-raw',
  'show-log',
  'show-terminal',
];

/** `commands` in ORDER, a stable sort: the ones it does not name keep their order, after the rest. */
function ordered(commands: PaletteCommand[]): PaletteCommand[] {
  const rank = (c: PaletteCommand) => {
    const at = ORDER.indexOf(c.id as ShellCommand);
    return at < 0 ? ORDER.length : at;
  };
  return [...commands].sort((a, b) => rank(a) - rank(b));
}

/** The palette's commands for the shell as `state` says it is. */
export function paletteCommands(state: ToolbarState): PaletteCommand[] {
  const label = (chord: string | undefined) => (chord ? chordLabel(parseChord(chord), state.mac) : undefined);
  const command = (id: ShellCommand, text: string, category: string, shortcut?: string, disabled = false): PaletteCommand => ({
    id,
    label: LABELS[id] ?? text,
    category,
    ...(shortcut ? { shortcut } : {}),
    ...(disabled ? { disabled } : {}),
  });
  const actions = toolbarItems(state).map((item) =>
    command(item.id as ShellCommand, item.label, categoryOf(item.align), item.shortcut, !!item.disabled),
  );
  return [
    ...actions.filter((c) => c.category === 'File'),
    ...ordered(actions.filter((c) => c.category === 'Edit')),
    ...ordered([
      ...SHELL_VIEWS.map((v) => command(v.command, `Show ${v.label}`, 'View', label(v.chord))),
      command('show-graph', 'Show Graph', 'View', label(chordOf('show-graph'))),
    ]),
    command('settings', 'Settings', 'Other', label(chordOf('settings'))),
    command('about', 'About', 'Other'),
  ];
}
