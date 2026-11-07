// Copyright 2026 The MathWorks, Inc.
//
// A file's menu in the Explorer: a right-click on an open file's row shows the shared context menu
// with Save, Save As and Close for that file, whichever tab is active, each labelled with the chord
// that does the same to the active tab (keys.ts, as the toolbar's tooltips name them). The menu is
// the tables' too: it is acted on by its next choice only, and a dismissal, or the menu shown again
// by a table (which says the Explorer's closed first), ends it, so a table's Copy is never taken for
// a file's Close.
import { chordLabel, parseChord } from '../../../model/shell/chords.js';
import { chordOf, onMac } from './keys.js';
/** The menu's label of the chord of `command`, read at each menu as the platform says it (a tab's menu's too). */
export const shortcutOf = (command) => {
    const chord = chordOf(command);
    return chord ? { shortcut: chordLabel(parseChord(chord), onMac()) } : {};
};
/** Answer `explorer`'s file menus with `menu`; returns what stops it. */
export function connectFileMenu(explorer, menu, actions) {
    let menuFor = null;
    const onMenu = (e) => {
        const tab = actions.tabOf(e.detail.fileId);
        if (!tab)
            return;
        const editable = !!tab.doc?.editable;
        // As the toolbar's buttons: Save for a file with edits to write, Save As for one the page edits.
        menu.show(e.detail.x, e.detail.y, [
            { id: 'save', label: 'Save', icon: 'saved', disabled: !(editable && tab.dirty), ...shortcutOf('save') },
            { id: 'save-as', label: 'Save As…', icon: 'saveAs', disabled: !editable, ...shortcutOf('save-as') },
            { id: '', label: '', separator: true },
            { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
        ]);
        // After show(): a menu it replaced said it closed, which ends the menu before this one.
        menuFor = tab;
    };
    const onAction = (e) => {
        const tab = menuFor && actions.tabOf(menuFor.id) === menuFor ? menuFor : null;
        menuFor = null;
        if (!tab)
            return;
        const id = e.detail.actionId;
        if (id === 'save' || id === 'save-as')
            actions.save(tab, id === 'save-as');
        else if (id === 'close-tab')
            actions.close(tab);
    };
    const onClosed = () => {
        menuFor = null;
    };
    explorer.addEventListener('dex-explorer-menu', onMenu);
    menu.addEventListener('dex-action', onAction);
    menu.addEventListener('dex-menu-closed', onClosed);
    return () => {
        explorer.removeEventListener('dex-explorer-menu', onMenu);
        menu.removeEventListener('dex-action', onAction);
        menu.removeEventListener('dex-menu-closed', onClosed);
    };
}
