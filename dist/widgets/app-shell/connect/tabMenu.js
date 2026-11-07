// Copyright 2026 The MathWorks, Inc.
//
// A tab's menu: what a right-click on a tab, or Shift+F10 or the ContextMenu key on it, shows
// (the tab row's `dex-tab-menu`, heard on the documents' area, where every pane's row is): for that
// tab, whichever is active, Compare With… on a file's tab (greyed for a file no compare reads: a
// project, one that could not be read) or Next and Previous Change on a compare tab; Close and Close
// Others (the others of its own pane, as an editor group's Close Others closes); and for a host that
// makes links, Copy Link at that tab's selection. A menu a key asked for takes the keyboard. Each
// item with a chord is labelled with it (keys.ts). The menu is the tables' and the Explorer's too:
// as the Explorer's file menu (fileMenu.ts), it is acted on by its next choice only, and a
// dismissal, or the menu shown again by another, ends it, so a table's Copy is never taken for a
// tab's Close.
import { shortcutOf } from './fileMenu.js';
/** The items of `tab`'s menu. */
function itemsOf(tab, actions) {
    const changes = actions.changes(tab);
    // A compare tab's own steps, or a file's Compare With….
    const own = changes
        ? [
            { id: 'next-change', label: 'Next Change', icon: 'arrowNavigationSouthUI', disabled: !changes.hasChanges, ...shortcutOf('next-change') },
            { id: 'previous-change', label: 'Previous Change', icon: 'arrowNavigationNorthUI', disabled: !changes.hasChanges, ...shortcutOf('previous-change') },
        ]
        : [{ id: 'compare-with', label: 'Compare With…', icon: 'compareUI', ...(actions.comparable(tab) ? {} : { disabled: true }) }];
    const link = actions.link(tab);
    return [
        ...own,
        { id: '', label: '', separator: true },
        { id: 'close-tab', label: 'Close', icon: 'close', ...shortcutOf('close-tab') },
        { id: 'close-others', label: 'Close Others', ...(actions.others(tab).length === 0 ? { disabled: true } : {}) },
        ...(link
            ? [
                { id: '', label: '', separator: true },
                { id: 'copy-link', label: 'Copy Link', icon: 'copy', ...(link.enabled ? {} : { disabled: true }) },
            ]
            : []),
    ];
}
/** Answer the tab rows' `dex-tab-menu` (heard on `docs`, where every pane's row is) with `menu`; returns what stops it. */
export function connectTabMenu(docs, menu, actions) {
    let menuFor = null;
    const onMenu = (e) => {
        const tab = actions.tabOf(e.detail.id);
        if (!tab)
            return;
        menu.show(e.detail.x, e.detail.y, itemsOf(tab, actions), { focusFirst: !!e.detail.keyboard });
        // After show(): a menu it replaced said it closed, which ends the menu before this one.
        menuFor = tab;
    };
    const onAction = (e) => {
        const tab = menuFor && actions.tabOf(menuFor.id) === menuFor ? menuFor : null;
        menuFor = null;
        if (!tab)
            return;
        switch (e.detail.actionId) {
            case 'compare-with':
                return actions.compareWith(tab);
            case 'next-change':
            case 'previous-change':
                return actions.step(tab, e.detail.actionId === 'next-change' ? 1 : -1);
            case 'close-tab':
                return actions.close(tab);
            case 'close-others':
                return actions.closeOthers(tab);
            case 'copy-link':
                return actions.copyLink(tab);
        }
    };
    const onClosed = () => {
        menuFor = null;
    };
    docs.addEventListener('dex-tab-menu', onMenu);
    menu.addEventListener('dex-action', onAction);
    menu.addEventListener('dex-menu-closed', onClosed);
    return () => {
        docs.removeEventListener('dex-tab-menu', onMenu);
        menu.removeEventListener('dex-action', onAction);
        menu.removeEventListener('dex-menu-closed', onClosed);
    };
}
