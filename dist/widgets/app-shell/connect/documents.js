// Copyright 2026 The MathWorks, Inc.
//
// A tab's document and the widgets it is shown in: its table, connected to the document's source
// as every document of the editing workspace is, or a project's page; and how its tab and the
// status bar name it. connectShell opens and closes tabs and says what each event means; these are
// the parts of that which are about one tab alone.
//
// Lifted, where the Electron app had them, from data-explorer-app src/renderer/app.ts at 0983920
// (newTable, newProjectPage, paintProject, and the connectTable options of its open()).
import { projectPageMessage } from '../../../model/source/projectPage.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { isSupportedPath } from 'data-explorer-core';
import { connectTable } from '../../tree-table/connectTable.js';
import { FILE_FORMATS, FILE_ICONS, fileGroupOf } from './explorerFiles.js';
import { onMac } from './keys.js';
import { folderOf, projectLinkPath } from './links.js';
/** The item a document's table menu ends with: the row's item, or the file's box, in the relationship graph. */
export const SHOW_IN_GRAPH = { id: 'showInGraph', label: 'Show in Graph' };
const message = (err) => (err instanceof Error ? err.message : String(err));
/** The page's clipboard, as connectTable's own default writes to it: a page without one fails the copy, saying so. */
function pageClipboard(text) {
    if (!navigator.clipboard?.writeText)
        return Promise.reject(new Error('this page has no clipboard access'));
    return navigator.clipboard.writeText(text);
}
/** Put `text` on the host's clipboard, or the page's for a host without one, asked at each copy. */
export function copyText(host, text) {
    return host.copyText ? host.copyText(text) : pageClipboard(text);
}
/** How the tab row draws `tab`: its name, its kind's icon, its path as the tooltip, its marks. */
export function docTabOf(tab) {
    const group = fileGroupOf(tab.path);
    return {
        id: tab.id,
        label: tab.name,
        ...(group === 'other' ? {} : { icon: FILE_ICONS[group] }),
        title: tab.path,
        dirty: !!tab.dirty,
        preview: !!tab.preview,
    };
}
/** What the status bar says of the active tab: its kind, and `· Modified` while it holds unsaved edits. */
export function statusOf(tab) {
    const group = tab ? fileGroupOf(tab.path) : 'other';
    return group === 'other' ? '' : `${FILE_FORMATS[group]}${tab?.dirty ? ' · Modified' : ''}`;
}
/**
 * Select no row of `tab`'s table: the file itself. TableHandle.select([]) selects nothing rather
 * than clearing, so the selection goes as a click on no row takes it, the table's own event saying
 * so, which is what connectTable (its `select`, the inspector's feed) hears.
 */
export function clearSelection(tab) {
    const table = tab.table;
    if (!table || table.selectedRowIds.length === 0)
        return;
    table.selectedRowIds = [];
    table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [] }, bubbles: true, composed: true }));
}
// --- The widgets ---------------------------------------------------------------------------------
/** A table in `tab`'s panel, its column choices kept under `storageKey`, ruled as `tableStyle` says (the setting's). */
export function newTable(tab, storageKey, editable = false, tableStyle = 'normal') {
    const table = document.createElement('dex-tree-table');
    table.readonly = !editable;
    table.tableStyle = tableStyle;
    // Shift+F10 and the ContextMenu key open the selected row's menu, as a right-click on it does.
    table.keyboardMenu = true;
    // Before it is connected: the table reads its column choices from the key it has then.
    table.storageKey = storageKey;
    tab.panel.append(table);
    tab.table = table;
    return table;
}
/** Connect `doc`'s source to a new table in `tab`'s panel, kept under `storageKey`. */
export function connectDocument(tab, doc, storageKey, wiring) {
    const { host } = wiring;
    const handle = connectTable(newTable(tab, storageKey, doc.editable, wiring.tableStyle()), doc.table, {
        variableEditor: wiring.editor,
        contextMenu: wiring.menu,
        // Every document wired for editing: one that takes no edits (a .mdl, a .slx or MAT-file
        // kept for viewing only) gets the read-only menu, and an editing menu ends with Copy Name
        // and Copy Value. The table answers Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z itself.
        editing: true,
        readOnlyMenu: true,
        copyText: true,
        undoChords: true,
        // The inspector beside it shows the file's page while no row is selected, a section's, several
        // rows' and a row's Usage links; and edits a row where the document takes an edit of it.
        inspectorPages: true,
        inspectorEditing: true,
        errorDialog: wiring.dialog,
        // The host's clipboard, or the page's for a host without one, asked at each copy.
        copy: (text) => copyText(host, text),
        // Usage is answered over the open tabs until a folder is shown, and from then on over the
        // folder: a model's is its own blocks' and workspace's either way, but a dictionary or a
        // MAT-file outside the folder shown has none.
        columns: (column) => {
            const folder = wiring.folder();
            return column !== 'UsedBy' || doc.kind === 'model' || !folder || folder.lists(doc.uri);
        },
        // A name a link holds means the file the folder's tree shows for it.
        resolveLink: (link, fromUri) => wiring.folder()?.resolveLink(link, fromUri),
        // Every file a table shows is one the graph draws (a model, a dictionary, a MAT-file).
        menuItems: () => [{ ...SHOW_IN_GRAPH }],
    });
    tab.handle = handle;
    return handle;
}
/**
 * A project's page in `tab`'s panel, drawn from its store as the shown folder's reader answers it.
 * A link on it goes to `follow`, with the project's folder; one that cannot be followed says why
 * on the page.
 */
export function newProjectPage(tab, revealIn, follow) {
    const page = document.createElement('dex-project-page');
    // Where a folder link shows its folder (the host's reveal).
    page.revealIn = revealIn;
    page.addEventListener('dex-project-open', (e) => {
        const root = page.payload?.root;
        if (root)
            void follow(root, e.detail).catch((err) => (page.error = message(err)));
    });
    tab.panel.append(page);
    tab.page = page;
    return page;
}
/**
 * Draw `tab`'s project page from `folder`'s store, or say the folder it is in is needed. Resolves to
 * why its store could not be read, which the page says too; undefined when it was drawn.
 */
export async function paintProject(tab, page, folder) {
    try {
        const store = folder ? await folder.projectStore(sourceUri(tab.path)) : null;
        if (store)
            page.payload = projectPageMessage(store, tab.path, folderOf(tab.path));
        else
            page.error = 'Open the folder this project is in to see its page.';
        return undefined;
    }
    catch (err) {
        page.error = `Failed to read ${tab.name}: ${message(err)}`;
        return page.error;
    }
}
/**
 * Draw again from `folder`'s store each project's page among `tabs`, or only those whose marker is
 * among `uris`; one that could not be read says why in the Log (`log`).
 */
export function repaintProjects(tabs, folder, log, uris) {
    for (const t of tabs) {
        if (!t.page || (uris && !uris.includes(sourceUri(t.path))))
            continue;
        void paintProject(t, t.page, folder).then((failed) => {
            if (failed)
                log('error', failed);
        });
    }
}
/**
 * Show the project of `tab` on its page, drawn from the shown folder's store: a link on it opens
 * its file as a preview (`open`), and one that cannot be followed says why on the page and in the
 * Log, as a store that cannot be read does.
 */
export async function showProject(tab, on) {
    const revealIn = on.host.revealIn ?? (onMac() ? 'Finder' : 'the file manager');
    const follow = (root, link) => followProjectLink(root, link, { folder: on.folder, open: on.open, reveal: (to) => on.host.reveal?.(to) }).catch((err) => {
        on.log('error', `Could not open ${link.path}: ${message(err)}`);
        throw err;
    });
    const failed = await paintProject(tab, newProjectPage(tab, revealIn, follow), on.folder());
    on.log(failed ? 'error' : 'info', failed ?? `Opened ${tab.name}`);
}
/**
 * Follow a link on a project's page, `link` from the project's folder `root`: a file this app shows
 * opens in a tab (a project on its page), a component row opens the project in its folder, and the
 * rest (a folder, a script) is shown in the OS file manager.
 */
export async function followProjectLink(root, link, on) {
    const path = projectLinkPath(root, link.path);
    const project = link.preferProject ? await on.folder()?.projectIn(path) : undefined;
    if (project)
        await on.open(uriPath(project));
    else if (isSupportedPath(path))
        await on.open(path);
    else
        await on.reveal(path);
}
