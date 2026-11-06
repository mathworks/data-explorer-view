// Copyright 2026 The MathWorks, Inc.
//
// What the shell's parts ask, and what connectShell does for each: the toolbar's buttons, the
// welcome's and the command palette's rows (each a ShellCommand); a view the user brought forward;
// the Settings and About buttons; the tab row's select, close, pin and move; the location bar's
// Back, Forward, Up and segments; the Explorer's rows and its files' menus. Each part names a tab by
// its id, and a request about a tab that has closed since does nothing.
import { connectFileMenu } from './fileMenu.js';
import { SHELL_VIEWS } from './views.js';
const COMMANDS = new Set([
    'new-file', 'open-file', 'open-folder', 'save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut',
    'copy', 'paste', 'delete', 'next-tab', 'previous-tab', 'focus-filter', 'back', 'forward', 'up', 'settings', 'about',
    'palette', 'show-graph', ...SHELL_VIEWS.map((v) => v.command),
]);
/** Whether `id` is a command the shell carries out: what a part sends as one may be anything. */
export function isShellCommand(id) {
    return COMMANDS.has(id);
}
/** Answer `parts`' requests with `on`; returns what stops it. */
export function connectRequests(shell, parts, on) {
    const stops = [];
    const listen = (target, type, listener) => {
        target.addEventListener(type, listener);
        stops.push(() => target.removeEventListener(type, listener));
    };
    const asked = (id) => {
        if (isShellCommand(id))
            on.command(id);
    };
    // The toolbar, the welcome's buttons, which ask what the toolbar's Open and Folder ask, and the palette.
    listen(parts.toolbar, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
    listen(parts.docs, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
    listen(parts.palette, 'dex-palette-run', (e) => asked(e.detail.id));
    listen(shell, 'dex-shell-view-changed', (e) => on.viewChanged(e.detail.view, e.detail.open));
    listen(shell, 'dex-shell-action', (e) => {
        const { actionId, anchor } = e.detail;
        if (actionId === 'settings' || actionId === 'about')
            on.toggle(actionId, anchor);
    });
    // The tab row's requests, each about a tab by its id; a move's index is the tab's place once moved.
    const onTab = (type, act) => listen(parts.strip, type, (e) => {
        const tab = on.tabOf(e.detail.id);
        if (tab)
            act(tab, e);
    });
    onTab('dex-tab-select', (tab) => on.activate(tab));
    onTab('dex-tab-close', (tab) => on.close(tab));
    onTab('dex-tab-pin', (tab) => on.pin(tab));
    onTab('dex-tab-move', (tab, e) => on.move(tab, e.detail.index));
    listen(parts.location, 'dex-location-go', (e) => {
        const { to } = e.detail;
        if (typeof to === 'number')
            on.toStep(to);
        else
            on.command(to);
    });
    listen(parts.explorer, 'dex-explorer-open', (e) => {
        const { fileId, sectionId, pin } = e.detail;
        if (fileId === null)
            return on.showRoot();
        const tab = on.tabOf(fileId);
        if (!tab)
            return;
        if (pin)
            on.pin(tab);
        on.activate(tab);
        if (sectionId !== undefined)
            tab.handle?.select([sectionId]);
    });
    // A file's menu in the Explorer: Save, Save As and Close for that file.
    stops.push(connectFileMenu(parts.explorer, parts.menu, { tabOf: on.tabOf, save: on.save, close: on.close }));
    return () => {
        for (const stop of stops.splice(0))
            stop();
    };
}
