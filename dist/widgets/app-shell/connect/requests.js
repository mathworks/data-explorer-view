// Copyright 2026 The MathWorks, Inc.
//
// What the shell's parts ask, and what connectShell does for each: the toolbar's buttons, the
// welcome's and the command palette's rows (each a ShellCommand); a view the user brought forward;
// the Settings and About buttons; each pane's tab row's select, close, pin and move; the documents'
// area's pane focused, tab dropped and divider moved; the location bar's Back, Forward, Up and
// segments; the Explorer's rows and its files' menus; a tab's menu. Each part names a tab by its
// id, and a request about a tab that has closed since does nothing.
import { connectFileMenu } from './fileMenu.js';
import { connectTabMenu } from './tabMenu.js';
import { SHELL_VIEWS } from './views.js';
const COMMANDS = new Set([
    'new-file', 'open-file', 'open-folder', 'save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut',
    'copy', 'paste', 'delete', 'next-tab', 'previous-tab', 'split-right', 'move-to-other-pane', 'focus-pane-1', 'focus-pane-2', 'focus-filter', 'back', 'forward', 'up', 'settings', 'about',
    'palette', 'show-graph', 'folder-up', 'folder-refresh', 'open-url', 'copy-link', ...SHELL_VIEWS.map((v) => v.command),
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
    // The toolbar, the welcome's buttons, which ask what the toolbar's Open and Folder ask, the Folder
    // view's Open Folder… with no folder shown, and the palette.
    listen(parts.toolbar, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
    listen(parts.docs, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
    listen(parts.folderPart, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
    listen(parts.palette, 'dex-palette-run', (e) => asked(e.detail.id));
    listen(shell, 'dex-shell-view-changed', (e) => on.viewChanged(e.detail.view, e.detail.open));
    listen(shell, 'dex-shell-action', (e) => {
        const { actionId, anchor } = e.detail;
        if (actionId === 'settings' || actionId === 'about')
            on.toggle(actionId, anchor);
    });
    // The panes' tab rows' requests, heard on the documents' area they are in (a second pane's row
    // comes and goes), each about a tab by its id, from the row of a pane; a move's index is the
    // tab's place once moved, in the row it was dropped on.
    const onTab = (type, act) => listen(parts.docs, type, (e) => {
        const pane = on.paneOfRow(e.target);
        const tab = on.tabOf(e.detail.id);
        if (tab && pane >= 0)
            act(tab, e, pane);
    });
    onTab('dex-tab-select', (tab) => on.activate(tab));
    onTab('dex-tab-close', (tab) => on.close(tab));
    onTab('dex-tab-pin', (tab) => on.pin(tab));
    onTab('dex-tab-move', (tab, e, pane) => on.move(tab, e.detail.index, pane));
    // The documents' area: the pane the user is in, a tab dropped on a pane's documents, the divider.
    listen(parts.docs, 'dex-pane-focus', (e) => on.focusPane(e.detail.pane));
    listen(parts.docs, 'dex-pane-drop', (e) => {
        const tab = on.tabOf(e.detail.id);
        if (tab)
            on.drop(tab, e.detail.pane, e.detail.side);
    });
    listen(parts.docs, 'dex-panes-resized', (e) => on.resized(e.detail.ratio));
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
    // A tab's menu: Close, Close Others and Copy Link for that tab.
    stops.push(connectTabMenu(parts.docs, parts.menu, {
        tabOf: on.tabOf,
        others: on.others,
        close: on.close,
        closeOthers: on.closeOthers,
        link: on.link,
        copyLink: on.copyLink,
    }));
    return () => {
        for (const stop of stops.splice(0))
            stop();
    };
}
