// Copyright 2026 The MathWorks, Inc.
//
// What the command palette lists: every toolbar action, enabled exactly as its button is now, then
// a command to show each of the shell's views and Root's relationship graph, the Folder view's
// own two (Up One Level and Read Again, for a host that shows folders, enabled as each would act
// now), then the panes' (Split Right, Move to Other Pane, and each pane's focus, enabled as each
// would act now), then a compare's (Compare With… among the File rows, Next and Previous Change
// after the panes'), then Settings and About. Each row's id is the ShellCommand it runs, and its
// shortcut the chord that does the same, in the platform's words (chordLabel). Pure: connectShell
// hands it the toolbar's state, and what the panes' and the compare's commands would do, as the
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
    'open-url': 'Open from URL…',
    'show-raw': 'Show Raw View',
};
/** No tab open: none of the panes' commands does anything. */
const NO_PANES = { splitRight: false, moveToOther: false, panes: 0 };
/** No folder shown. */
const NO_FOLDER = { shown: false, canUp: false, refresh: 'read' };
/** A host with none of them. */
const NO_HOST = { openUrl: false, copyLink: null };
/** No file to compare, and no compare. */
const NO_COMPARE = { canCompare: false, hasChanges: false };
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
    'show-folder',
    'folder-up',
    'folder-refresh',
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
/**
 * The palette's commands for the shell as `state` says it is, its panes as `panes` says (none, by
 * default), its folder as `folder` says (none shown, by default), what the host's optional members
 * give as `host` says (none, by default), and a compare as `compare` says (nothing to compare, by
 * default). The Folder view's rows are there where the shell has the view (`folder.view`, else a
 * host that shows folders, `state.canOpenFolder`). Open from URL… is a File row after the ways to
 * open a file the toolbar has, Compare With… after the toolbar's File rows, and Copy Link the File
 * group's last, greyed while the host's link would link no file.
 */
export function paletteCommands(state, panes = NO_PANES, folder = NO_FOLDER, host = NO_HOST, compare = NO_COMPARE) {
    const label = (chord) => (chord ? chordLabel(parseChord(chord), state.mac) : undefined);
    const command = (id, text, category, shortcut, disabled = false) => ({
        id,
        label: LABELS[id] ?? text,
        category,
        ...(shortcut ? { shortcut } : {}),
        ...(disabled ? { disabled } : {}),
    });
    // The Folder view's rows, where the shell has the view.
    const folderView = folder.view ?? state.canOpenFolder;
    const actions = toolbarItems(state).map((item) => command(item.id, item.label, categoryOf(item.align), item.shortcut, !!item.disabled));
    const file = actions.filter((c) => c.category === 'File');
    if (host.openUrl) {
        const after = Math.max(file.findIndex((c) => c.id === 'open-folder'), file.findIndex((c) => c.id === 'open-file'));
        file.splice(after + 1, 0, command('open-url', 'Open from URL…', 'File'));
    }
    file.push(command('compare-with', 'Compare With…', 'File', undefined, !compare.canCompare));
    if (host.copyLink)
        file.push(command('copy-link', 'Copy Link', 'File', undefined, !host.copyLink.enabled));
    return [
        ...file,
        ...ordered(actions.filter((c) => c.category === 'Edit')),
        ...ordered([
            ...SHELL_VIEWS.filter((v) => v.view !== 'folder' || folderView).map((v) => command(v.command, `Show ${v.label}`, 'View', label(v.chord))),
            ...(folderView
                ? [
                    command('folder-up', 'Folder: Up One Level', 'View', undefined, !folder.canUp),
                    command('folder-refresh', folder.refresh === 'pick' ? 'Folder: Pick Again' : 'Folder: Read Again', 'View', undefined, !folder.shown),
                ]
                : []),
            command('show-graph', 'Show Graph', 'View', label(chordOf('show-graph'))),
            command('split-right', 'Split Right', 'View', label(chordOf('split-right')), !panes.splitRight),
            command('move-to-other-pane', 'Move to Other Pane', 'View', undefined, !panes.moveToOther),
            command('focus-pane-1', 'Focus First Pane', 'View', label(chordOf('focus-pane-1')), panes.panes < 1),
            command('focus-pane-2', 'Focus Second Pane', 'View', label(chordOf('focus-pane-2')), panes.panes < 2),
            command('next-change', 'Next Change', 'View', label(chordOf('next-change')), !compare.hasChanges),
            command('previous-change', 'Previous Change', 'View', label(chordOf('previous-change')), !compare.hasChanges),
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
