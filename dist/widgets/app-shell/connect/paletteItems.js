// Copyright 2026 The MathWorks, Inc.
//
// What the command palette lists: every toolbar action, enabled exactly as its button is now, then
// a command to show each of the shell's views and Root's relationship graph, then the panes'
// (Split Right, Move to Other Pane, and each pane's focus, enabled as each would act now), then
// Settings and About. Each row's id is the ShellCommand it runs, and its shortcut the chord that
// does the same, in the platform's words (chordLabel). Pure: connectShell hands it the toolbar's
// state, and what the panes' commands would do, as the palette opens.
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
import { chordOf } from './keys.js';
import { toolbarItems } from './toolbarItems.js';
import { SHELL_VIEWS } from './views.js';
/** The palette's names for the toolbar's actions and the views, where their own label would not do. */
const LABELS = {
    'new-file': 'New Data Dictionary…',
    'open-file': 'Open File…',
    'open-folder': 'Open Folder…',
    'save-as': 'Save As…',
    'close-tab': 'Close Tab',
    'show-raw': 'Show Raw View',
};
/** No tab open: none of the panes' commands does anything. */
const NO_PANES = { splitRight: false, moveToOther: false, panes: 0 };
/** The toolbar's actions on its start side are the file's, on its end side the edits. */
const categoryOf = (align) => (align === 'end' ? 'Edit' : 'File');
/**
 * Where each command goes among those of its group; one not named keeps its place after them (a
 * view a later version adds, the panes' commands after the views). The File group's is the toolbar's.
 */
const ORDER = [
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
function ordered(commands) {
    const rank = (c) => {
        const at = ORDER.indexOf(c.id);
        return at < 0 ? ORDER.length : at;
    };
    return [...commands].sort((a, b) => rank(a) - rank(b));
}
/** The palette's commands for the shell as `state` says it is, and its panes as `panes` says (none, by default). */
export function paletteCommands(state, panes = NO_PANES) {
    const label = (chord) => (chord ? chordLabel(parseChord(chord), state.mac) : undefined);
    const command = (id, text, category, shortcut, disabled = false) => ({
        id,
        label: LABELS[id] ?? text,
        category,
        ...(shortcut ? { shortcut } : {}),
        ...(disabled ? { disabled } : {}),
    });
    const actions = toolbarItems(state).map((item) => command(item.id, item.label, categoryOf(item.align), item.shortcut, !!item.disabled));
    return [
        ...actions.filter((c) => c.category === 'File'),
        ...ordered(actions.filter((c) => c.category === 'Edit')),
        ...ordered([
            ...SHELL_VIEWS.map((v) => command(v.command, `Show ${v.label}`, 'View', label(v.chord))),
            command('show-graph', 'Show Graph', 'View', label(chordOf('show-graph'))),
            command('split-right', 'Split Right', 'View', label(chordOf('split-right')), !panes.splitRight),
            command('move-to-other-pane', 'Move to Other Pane', 'View', undefined, !panes.moveToOther),
            command('focus-pane-1', 'Focus First Pane', 'View', label(chordOf('focus-pane-1')), panes.panes < 1),
            command('focus-pane-2', 'Focus Second Pane', 'View', label(chordOf('focus-pane-2')), panes.panes < 2),
        ]),
        command('settings', 'Settings', 'Other', label(chordOf('settings'))),
        command('about', 'About', 'Other'),
    ];
}
/**
 * `commands` with a host's MATLAB group (`matlab`, connectShell's from matlab.ts) among them: after
 * every other group, before Settings and About, as a MATLAB menu would come before a window's own.
 * An empty group leaves the list as it was. A list of its own rather than a part of
 * paletteCommands, so what the shell lists of itself does not wait on what its host reaches.
 */
export function withMatlabCommands(commands, matlab) {
    const other = commands.findIndex((c) => c.category === 'Other');
    const at = other < 0 ? commands.length : other;
    return [...commands.slice(0, at), ...matlab, ...commands.slice(at)];
}
