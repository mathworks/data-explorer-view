// Copyright 2026 The MathWorks, Inc.
//
// What the command palette lists: every toolbar action, enabled exactly as its button is now, then
// a command to show each of the shell's views and Root's relationship graph, then Settings and
// About. Each row's id is the
// ShellCommand it runs, and its shortcut the chord that does the same, in the platform's words
// (chordLabel). Pure: connectShell hands it the toolbar's state as the palette opens.
//
// The labels are the toolbar's where they say what they do out of the toolbar ("Save"), and longer
// where they lean on its icons ("Open" is Open File…, "New" New Data Dictionary…, "Close" is Close
// Tab), as a menu would name them; the ellipsis marks a command that asks something before it acts
// (New asks where the file goes, where the host has a dialog for it).
import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import { chordOf } from './keys.js';
import { toolbarItems } from './toolbarItems.js';
import { SHELL_VIEWS } from './views.js';
/** The palette's names for the toolbar's actions, where its own label would not do. */
const LABELS = {
    'new-file': 'New Data Dictionary…',
    'open-file': 'Open File…',
    'open-folder': 'Open Folder…',
    'save-as': 'Save As…',
    'close-tab': 'Close Tab',
};
/** The toolbar's actions on its start side are the file's, on its end side the edits. */
const categoryOf = (align) => (align === 'end' ? 'Edit' : 'File');
/** The palette's commands for the shell as `state` says it is. */
export function paletteCommands(state) {
    const label = (chord) => (chord ? chordLabel(parseChord(chord), state.mac) : undefined);
    const command = (id, text, category, shortcut, disabled = false) => ({
        id,
        label: text,
        category,
        ...(shortcut ? { shortcut } : {}),
        ...(disabled ? { disabled } : {}),
    });
    return [
        ...toolbarItems(state).map((item) => command(item.id, LABELS[item.id] ?? item.label, categoryOf(item.align), item.shortcut, !!item.disabled)),
        ...SHELL_VIEWS.map((v) => command(v.command, `Show ${v.label}`, 'View', label(v.chord))),
        command('show-graph', 'Show Graph', 'View'),
        command('settings', 'Settings', 'Preferences', label(chordOf('settings'))),
        command('about', 'About', 'Help'),
    ];
}
