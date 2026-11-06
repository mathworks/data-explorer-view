// Copyright 2026 The MathWorks, Inc.
//
// The shell's toolbar, as the data <dex-toolbar> draws: the prototype's row (New, Open, Folder |
// Save, Save As, Save All | Close at the start; Undo, Redo | Add Child | Cut, Copy, Paste | Delete at
// the end), each button with the chord that does the same and whether it can be pressed now. Pure:
// connectShell says what is open and what the active table can do, and hands the toolbar the items
// again whenever that changes.
//
// The editing buttons are the active table's editing menu: each is enabled exactly when the menu's
// own item is (TableHandle.can), so a button and the right-click menu never disagree, and pressing
// one runs that item (TableHandle.run). Their chords are the table's (the menu's labels), the rest
// the shell's own (keys.ts), so a tooltip names the chord that works.
import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import { chordOf } from './keys.js';
/** The chords of the buttons that are the table's editing menu, as its menu labels them. */
const TABLE_CHORDS = {
    undo: 'Mod+Z',
    redo: 'Mod+Shift+Z',
    cut: 'Mod+X',
    copy: 'Mod+C',
    paste: 'Mod+V',
    delete: 'Delete',
};
/** Each editing button's item of the table's menu. */
const TABLE_ACTIONS = {
    undo: 'undo',
    redo: 'redo',
    'add-child': 'addChild',
    cut: 'cut',
    copy: 'copy',
    paste: 'paste',
    delete: 'delete',
};
/** The editing menu item a toolbar button (or the command it sends) runs, or none for a command of the shell's. */
export function tableActionOf(command) {
    return TABLE_ACTIONS[command];
}
/** The toolbar's buttons for `state`, in the order they are drawn. */
export function toolbarItems(state) {
    const item = (id, label, icon, group, disabled, align) => {
        const chord = TABLE_CHORDS[id] ?? chordOf(id);
        return {
            id,
            label,
            icon,
            group,
            ...(chord ? { shortcut: chordLabel(parseChord(chord), state.mac) } : {}),
            disabled,
            ...(align ? { align } : {}),
        };
    };
    const { active } = state;
    const table = (id, label, icon, group) => item(id, label, icon, group, !state.can(TABLE_ACTIONS[id]), 'end');
    return [
        // A new data dictionary, the one kind of file New makes, as the prototype's tooltip said.
        ...(state.canNewFile ? [newFile(item('new-file', 'New', 'new_server', 'open', false))] : []),
        item('open-file', 'Open', 'openFolder', 'open', false),
        ...(state.canOpenFolder ? [item('open-folder', 'Folder', 'folder', 'open', false)] : []),
        // The floppy turns blue while the active file holds edits it does not, as the prototype's did.
        item('save', 'Save', active?.dirty ? 'unsaved' : 'saved', 'save', !(active?.editable && active.dirty)),
        item('save-as', 'Save As', 'saveAs', 'save', !active?.editable),
        item('save-all', 'Save All', 'save_all', 'save', !state.anyDirty),
        item('close-tab', 'Close', 'close', 'close', active === null),
        table('undo', 'Undo', 'undo', 'history'),
        table('redo', 'Redo', 'redo', 'history'),
        table('add-child', 'Add Child', 'addBlockChild', 'add'),
        // The scissors alone: the `cut` tile the table's menu draws is light greys and a dotted line,
        // which beside Copy's solid tile made an enabled Cut look disabled.
        table('cut', 'Cut', 'scissorToolUI', 'clipboard'),
        table('copy', 'Copy', 'copy', 'clipboard'),
        table('paste', 'Paste', 'paste', 'clipboard'),
        table('delete', 'Delete', 'delete', 'delete'),
    ];
}
/** The New button, whose tooltip names what it makes. */
function newFile(item) {
    return { ...item, title: `New Data Dictionary${item.shortcut ? ` (${item.shortcut})` : ''}` };
}
/**
 * The toolbar's state over `active` among `tabs`, for a host that shows folders or not, on macOS or
 * not, and that makes new files or not.
 */
export function toolbarStateOf(active, tabs, canOpenFolder, mac, canNewFile = false) {
    return {
        canNewFile,
        canOpenFolder,
        active: active ? { editable: !!active.doc?.editable, dirty: !!active.dirty } : null,
        anyDirty: tabs.some((t) => t.dirty),
        can: (id) => !!active?.handle?.can(id),
        mac,
    };
}
