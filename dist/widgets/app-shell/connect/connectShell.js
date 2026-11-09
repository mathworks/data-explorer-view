// Copyright 2026 The MathWorks, Inc.
//
// The app in a shell: open files as tabs, each a table connected to its document in one editing
// workspace (a MAT-file, a dictionary and a .slx's Model Workspace take edits; a .mdl stays
// read-only), in one pane or two side by side, the inspector following the active tab (the tab of
// the pane the user is in), one variable editor, menu and dialog for them all; and around them the
// shell's parts, the toolbar, the location bar, the Explorer with the folder under it, Settings,
// About and the toasts. The same code runs in the Electron app and in a browser page: what differs
// is the host (types.ts), which a page hands in.
//
// Lifted from data-explorer-app src/renderer/app.ts and main.ts at 0983920, the app's renderer:
// its rules, in its order, with its comments. What changed is where things are drawn (the shell's
// parts, not index.html's elements) and what the shell adds (the toolbar, preview tabs, the
// Explorer's sections and Root, the location bar and its history, the settings, the chords).
// The rules themselves are the modules beside this one; this file orchestrates. Several are pieces
// of it moved out: what it builds (parts.ts), a tab's document and its widgets (documents.ts), the
// settings and popovers (popovers.ts), the history (navigation.ts), the questions (questions.ts),
// the parts' requests (requests.ts), the rows dropped on the Explorer (explorerDrop.ts), the
// document commands (carryOut.ts), the folder shown (shownFolder.ts), the modules' views
// (modules.ts: Raw, Search, the Gallery, the Terminal), Root's relationship graph (graphPane.ts),
// and the panes' rows and panels (panes.ts).
import { createRegisters } from '../../../model/edit/registers.js';
import { parseLinkTarget } from '../../../model/ids/linkTarget.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { isEditable } from '../../../model/source/tableSource.js';
import { newDictionaryBytes } from '../../../model/source/newDictionary.js';
import { createWorkspace } from '../../../model/source/workspace.js';
import { createOpenFilesUsage } from '../../../model/usage/openFilesUsage.js';
import { keptView } from '../../../model/shell/shellLayout.js';
import { basenameOf, isProjectFile, isSlddFile, projectFallbackName } from 'data-explorer-core';
import { connectInspector } from '../../property-inspector/connectInspector.js';
import { focusIsInTextField } from '../../shared/textField.js';
import { clearSelection, connectDocument, copyText, docTabOf, newTable, openingNote, repaintProjects, showProject, statusOf, COPY_ENTRY_LINK, SHOW_IN_GRAPH, } from './documents.js';
import { ranNote } from './editingNotes.js';
import { connectExplorerDrop } from './explorerDrop.js';
import { explorerFiles, FILE_ICONS } from './explorerFiles.js';
import { connectFolderNav } from './folderNav.js';
import { connectGraphPane } from './graphPane.js';
import { followDropMark } from './drop.js';
import { installKeys, onMac } from './keys.js';
import { linkDestination } from './links.js';
import { locationOf } from './location.js';
import { ShellNavigation } from './navigation.js';
import { connectModules } from './modules.js';
import { PaneRows, keepSplit, keptSplit, slotPanels } from './panes.js';
import { buildShell } from './parts.js';
import { connectRequests } from './requests.js';
import { linkedEntryOf, rowIn, rowOfEntry, sectionOf } from './rows.js';
import { connectShownFolder } from './shownFolder.js';
import { connectPopovers, pageStorage } from './popovers.js';
import { inPageQuestions, shellPrompts } from './questions.js';
import { ReloadGate } from './reload.js';
import { Saver, settle } from './saving.js';
import { TabList } from './tabs.js';
import { settableSystemTheme, systemThemeFromMedia } from './theme.js';
import { toolbarItems, toolbarStateOf } from './toolbarItems.js';
import { carryOut, showRootFrom } from './carryOut.js';
import { connectCompare } from './compare.js';
import { comparable, compareChoices } from './comparePick.js';
import { isMatlabAction, matlabActionLabel, matlabLabel, matlabMenuItems, matlabOffers, matlabPaletteCommands, MatlabResults, matlabTargetOf, runMatlab, withMatlabResults, } from './matlab.js';
import { paletteCommands, withMatlabCommands } from './paletteItems.js';
import { copiedNote, linkRequestOf, NO_LINK, OPEN_URL_PROMPT } from './shareLinks.js';
import { SHELL_VIEWS, viewOfCommand } from './views.js';
const message = (err) => (err instanceof Error ? err.message : String(err));
/** Whether two files' bytes are the same. */
const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
/** A feed of the one page of a file selected in the graph: it has no matrix, and takes no edit. */
function pageFeed(file) {
    const page = { ...(file.box.uri ? { rowId: file.box.uri } : {}), groups: file.groups };
    return {
        onPage(listener) {
            listener(page);
            return () => { };
        },
        matrix: async (nodeId) => ({ nodeId, message: 'This file has no value to show as a table.' }),
    };
}
/** The location bar's dimmed segment for the file selected in the graph: its name, icon and path (as `titleOf` says it), and why it is dimmed. */
function previewOf(file, titleOf) {
    if (!file)
        return undefined;
    const { box } = file;
    return { label: box.label, icon: FILE_ICONS[box.kind], ...(box.uri ? { title: titleOf(uriPath(box.uri)) } : {}), description: 'selected in the graph' };
}
/**
 * Fill an empty `<dex-app-shell>` with the app, over `options.host`, and return the handle the host
 * drives it by. The elements it builds must be defined first (the parts' define functions, and the
 * widgets the documents are shown in). Nothing is opened: the host opens files (`openPaths`) and
 * shows a folder (`showFolder`) when it has them.
 */
export function connectShell(shell, options) {
    const host = options.host;
    const appName = options.appName ?? 'Data Explorer';
    const key = options.storageKey ?? 'dex-shell';
    // The layout is the shell's to keep; set before the views go in, which is when it reads it back.
    if (!shell.storageKey)
        shell.storageKey = `${key}:layout`;
    // A Folder view for a host that shows folders, as it is when the shell is connected.
    const folderView = !!host.pickFolder;
    const parts = buildShell(shell, { appName, folders: folderView });
    // Its Open Folder… with no folder shown, as the view itself, as the shell was connected.
    parts.folderPart.canOpenFolder = folderView;
    const { toolbar, location, explorer, folderPart, folderBar, tree, docs, strip, status, editor, menu, dialog, confirm, toasts } = parts;
    let disposed = false;
    const stops = [];
    // The open tabs, in one pane or two (tabs.ts): the active tab is the one the focused pane shows.
    const tabs = new TabList();
    // The tabs of files: every tab but a compare's, which shows two of them and is a file of neither.
    const fileTabs = () => tabs.items.filter((t) => !t.compare);
    // A file's tab by its uri (another spelling of the path is the same file); never a compare tab.
    const tabOfFile = (uri) => tabs.find((t) => !t.compare && sourceUri(t.path) === uri);
    // Each pane's row of tabs, the first's the shell's own, a second's made as a second pane comes;
    // and the divider between two panes where the user left it, kept with the layout.
    const paneRows = new PaneRows(docs, strip);
    const store = pageStorage();
    docs.ratio = keptSplit(store, shell.storageKey);
    let nextId = 0;
    // The Log, which every part of the shell writes to.
    const log = (level, text) => parts.log.appendEntry({ level, message: text });
    // The Usage column is answered over the open tabs, as each holds its file (read or saved), until
    // a folder is shown, whose session answers it from then on (ws.setUsage). A change to what is
    // open (a tab opened, closed, saved or reloaded; refresh() tells it) repaints, once the burst is
    // over, each table whose column was answered over other tabs than are open now.
    const openUsage = createOpenFilesUsage({
        files: () => fileTabs().flatMap((t) => (t.doc && t.bytes ? [{ uri: t.doc.uri, path: t.path, bytes: t.bytes }] : [])),
        refill(uris) {
            if (disposed || folderNow())
                return;
            for (const uri of uris)
                void ws.get(uri)?.repaint().catch((err) => log('error', `Could not fill the Usage column: ${message(err)}`));
        },
    });
    stops.push(() => openUsage.dispose());
    // Its documents share one clipboard, so a row copied in one tab pastes into another, and one drag
    // register, whose drag in flight the Explorer's drops are judged by (explorerDrop.ts). What a
    // document says the table cannot show is a toast, as it stands, and a line of the Log, which
    // keeps what a toast lets go by. Each is counted, and the latest kept, so that a drop's refusal the
    // workspace said since the drop was handed over (a move that left its original behind) is not said
    // twice.
    const registers = createRegisters();
    let dragging = null;
    stops.push(registers.listen({ drag: (descriptor) => void (dragging = descriptor) }));
    let notices = 0;
    const noticed = [];
    const ws = createWorkspace({
        editing: true,
        registers,
        usage: openUsage,
        notify(notice) {
            noticed.push({ at: ++notices, message: notice.message });
            if (noticed.length > 16)
                noticed.shift();
            toasts.show(notice);
            log(notice.level === 'status' ? 'info' : notice.level, notice.message);
        },
    });
    // What the shell must say: a toast, and its line in the Log; what it caught, as an error. A
    // page's own notice (notify) is said the same way.
    const say = (level, text, ms) => {
        toasts.show({ level, message: text, ...(ms === undefined ? {} : { ms }) });
        log(level, text);
    };
    const failed = (text) => say('error', text);
    // The inspector follows the active tab's table, or at Root the page of the file selected in the
    // graph, or none (its empty text). A link on it goes where a table's link goes: through the folder
    // shown, to the file its tree shows for the name the link holds; at Root, to the graph's file.
    const inspector = connectInspector(parts.inspector, null, { variableEditor: editor, empty: parts.inspectorEmpty });
    inspector.on('navigate', (target) => void followInspectorLink(target));
    // A connected MATLAB's evaluations, kept for their rows (matlab.ts), and each table's feed to the
    // inspector with them added, made once per table so the inspector follows one feed per table.
    const matlabResults = new MatlabResults();
    const matlabFeeds = new WeakMap();
    async function followInspectorLink(target) {
        const from = tabs.active;
        if (!from)
            return graph.openLink(target);
        const link = parseLinkTarget(target);
        const uri = await Promise.resolve(folderNow()?.resolveLink(link, sourceUri(from.path))).catch(() => undefined);
        if (isOpen(from))
            await navigate(from, link, uri ?? undefined);
    }
    // The workspace folder (shownFolder.ts, below), in the Folder view: its hierarchy; a chosen file opens as a tab.
    const folderNow = () => folders.current;
    // A table is ruled as Settings says when it is made (popovers, below, is there before any file is read).
    const wiring = {
        host,
        editor,
        menu,
        dialog,
        folder: folderNow,
        tableStyle: () => popovers.tableStyle(),
        // A row's menu ends with a connected MATLAB's commands for the row (none without one).
        matlabItems: (tab, context) => matlabMenuItems(matlabOffers(host.matlab?.status(), matlabTarget(tab, context.rowId, context.rows))),
    };
    // The system's theme for Auto: the source the host gave (the page's media queries by default),
    // until the host tells one itself (setSystemTheme).
    const system = settableSystemTheme(options.systemTheme ?? systemThemeFromMedia());
    const popovers = connectPopovers(shell, parts, {
        store: pageStorage(),
        key: `${key}:settings`,
        system,
        appName,
        about: options.about ?? [],
        // A compare tab's two tables are ruled as the files' are.
        tables: () => tabs.items.flatMap((t) => (t.table ? [t.table] : t.compare ? t.compare.tables : [])),
        layoutGraph: (layout) => graph.setLayout(layout),
    });
    stops.push(() => popovers.dispose());
    // The shell's confirm dialog, one question at a time (questions.ts), for a host with none.
    const questions = inPageQuestions(confirm, () => popovers.closeAll());
    // The host's own questions where it has them, the in-page ones where it has none, each reload
    // answer said in the Log.
    const { confirmClose, confirmReload } = shellPrompts(host, questions, { open: (tab) => isOpen(tab), log });
    const isOpen = (tab) => !disposed && tabs.items.includes(tab);
    // --- Painting ----------------------------------------------------------------------------------
    /** The place the user is now: the active tab and its selection's first row, or Root. */
    const here = () => {
        const active = tabs.active;
        return active ? { tabId: active.id, rowId: active.selection[0] ?? null } : { tabId: null, rowId: null };
    };
    // Where the user has been, for Back and Forward, and where Up and the segments go. A place is
    // shown by showing its tab (or Root) and then selecting its row, or none for the file itself.
    const nav = new ShellNavigation({
        here,
        show(place) {
            if (place.tabId === null) {
                showRoot();
                return true;
            }
            const tab = tabs.find((t) => t.id === place.tabId);
            if (!tab)
                return false;
            activate(tab);
            // A compare tab's place is its lines' selection.
            if (tab.compare)
                tab.compare.select(place.rowId === null ? [] : [place.rowId]);
            else if (place.rowId === null)
                clearSelection(tab);
            else
                tab.handle?.select([place.rowId]);
            return true;
        },
    });
    const visit = () => nav.visit();
    // The location bar's segments as last drawn: what a press on one names.
    let located = [];
    // The inspector and the folder's tree follow the active tab: the folder, a file's tab only.
    const follow = () => {
        followInspector();
        if (tabs.active && !tabs.active.compare)
            folderNow()?.reveal(sourceUri(tabs.active.path));
    };
    // The inspector's feed: the active tab's table; at Root, a page of the file selected in the graph
    // (the same feed while it is the same page), or none.
    let rootPage = null;
    function followInspector() {
        // A compare tab's page is its selected line's differences.
        if (tabs.active)
            return inspector.follow(inspected(tabs.active) ?? tabs.active.compare?.feed ?? null);
        const file = tabs.items.length > 0 ? graph.selectedFile() : null;
        if (file !== rootPage?.file)
            rootPage = file ? { file, feed: pageFeed(file) } : null;
        inspector.follow(rootPage?.feed ?? null);
    }
    function paint() {
        const active = tabs.active;
        // Each pane its tab, side by side; at Root, none, and one pane, where the graph fills the area.
        slotPanels(tabs, !!active);
        docs.split = !!active && tabs.panes.length > 1;
        docs.focusedPane = tabs.focused;
        // Root: the relationship graph while files are open, the welcome while none is.
        docs.welcome = tabs.items.length === 0;
        parts.graphPanel.hidden = !!active || tabs.items.length === 0;
        docs.canOpenFolder = !!host.pickFolder;
        docs.canOpenUrl = !!host.fetchUrl;
        markRows();
        const title = active ? `${active.dirty ? '● ' : ''}${active.name} — ${appName}` : appName;
        if (host.setTitle)
            host.setTitle(title);
        else
            document.title = title;
        // The window's edited mark (macOS), and the host's cue to ask before it closes.
        host.setEdited?.(tabs.items.some((t) => t.dirty));
        Object.assign(status, statusOf(active));
        later();
    }
    // The folder's rows of the open files, marked as their tabs stand (open, active, unsaved, a
    // preview), after any change to the tabs (each one paints): once a frame, however many changed in it.
    let marking = false;
    function markRows() {
        if (marking || disposed)
            return;
        marking = true;
        requestAnimationFrame(() => {
            marking = false;
            if (disposed)
                return;
            const active = tabs.active;
            const marks = new Map(fileTabs().map((t) => [
                sourceUri(t.path),
                { open: true, ...(t === active ? { active: true } : {}), ...(t.dirty ? { unsaved: true } : {}), ...(t.preview ? { preview: true } : {}) },
            ]));
            folderNow()?.setMarks(marks);
        });
    }
    // What follows the active table's selection and source (the toolbar's buttons, the Explorer, the
    // location bar) is drawn a microtask after whatever changed: TableHandle.can has no event of its
    // own, and is asked again once the table has heard the change too.
    let pending = false;
    function later() {
        if (pending || disposed)
            return;
        pending = true;
        queueMicrotask(() => {
            pending = false;
            if (!disposed)
                refresh();
        });
    }
    // What the toolbar's buttons, and the palette's rows for them, can do now.
    const toolbarState = () => toolbarStateOf(tabs.active, tabs.items, !!host.pickFolder, onMac(), !!host.newFile);
    // What a file's tooltips say of its path: the host's words for it, if its paths are of its making.
    const titleOf = (path) => host.pathTitle?.(path) ?? path;
    // A tab's tooltip: its file's path, or a compare tab's two.
    const titleOfTab = (t) => (t.compare ? `${titleOf(t.compare.left.path)} ↔ ${titleOf(t.compare.right.path)}` : titleOf(t.path));
    function refresh() {
        const active = tabs.active;
        // First: at Root, the location bar draws the file the inspector shows.
        followInspector();
        toolbar.items = toolbarItems(toolbarState());
        // Each pane's tab row, each tab as its selection names it (the section it is in), here with what
        // else follows a selection; hidden at Root, where the graph fills the center, and with no file open.
        if (!active && paneRows.holdsFocus())
            rootTakesTheKeyboard();
        paneRows.paint(tabs, !!active, (t) => docTabOf(t, titleOfTab(t)));
        // The Explorer lists files: a compare is a tab of two of them, and none itself.
        explorer.files = explorerFiles(fileTabs().map((t) => ({ id: t.id, path: t.path, name: t.name, title: titleOf(t.path), dirty: t.dirty, rows: t.handle?.view?.rows })));
        // The rows the active table holds now: its paint, the entries repainted since, the children
        // it was answered; none for a project page or a file still being read.
        const rows = active?.table?.rows ?? [];
        const rowId = here().rowId;
        const section = active && rowId !== null ? sectionOf(rows, rowId) : undefined;
        explorer.selected = active ? { fileId: active.id, ...(section ? { sectionId: section } : {}) } : { fileId: null };
        const place = active ? { id: active.id, name: active.name, path: active.path, title: titleOfTab(active) } : null;
        const at = locationOf(place, active?.selection ?? null, (id) => rowIn(rows, id), explorer.rootLabel, previewOf(rootPage?.file, titleOf));
        nav.located(at);
        located = at.segments;
        location.segments = at.segments;
        location.canBack = nav.canBack;
        location.canForward = nav.canForward;
        location.canUp = nav.canUp;
        modules.refresh();
        graph.refresh();
        // A tab opened, closed, saved or reloaded since: the Usage it answers is owed to the others.
        if (!folderNow())
            openUsage.changed();
    }
    // The tab row hides at Root with the focus on one of its tabs (Alt+Up from a tab): rather than fall
    // to the page's body, the keyboard goes to the Explorer's Root row, where the user went, or, with
    // the Explorer off screen, to what fills the center where the row was: the graph (once it is
    // drawn, if it is still being built), or with the last file closed the welcome's Open File….
    function rootTakesTheKeyboard() {
        paneRows.blur();
        const left = shell.layout.left;
        if (left.open && left.view === 'explorer' && explorer.focusRow({ fileId: null }))
            return;
        if (tabs.items.length === 0)
            docs.focusOpenFile();
        else
            parts.graph.focus();
    }
    // Another tab is the active one (or none, at Root): the variable editor was the last one's, and
    // everything that follows the active tab follows this one; the user has been here. Closed, the
    // editor gives the keyboard back to its glyph in the table it was opened from, which may be in
    // the other pane: that is no press of the user's there (showing, below).
    let showing = 0;
    function shown() {
        showing++;
        try {
            editor.close();
            paint();
            follow();
            visit();
        }
        finally {
            showing--;
        }
    }
    // The tabs moved between the panes, or a pane came or went: shown, if the active tab is another
    // now (the tab moved is shown, and focused, where it went), else drawn again where they are.
    function rearranged(before) {
        if (tabs.active !== before)
            shown();
        else
            paint();
    }
    // A tab moved to the other pane, or into a pane of its own, by `change` (a drop, a move along
    // the rows, Split Right): rearranged, if it moved. A press on a tab focuses it, so a drag of one
    // starts with the keyboard on it, as does a chord pressed on one: the keyboard goes with the tab,
    // to the focused pane's row once that row is drawn (later's refresh, queued before), rather than
    // to the body as the tab's element leaves the row it was in.
    function rearrange(change) {
        const before = tabs.active;
        const keyboard = paneRows.holdsFocus();
        if (!change())
            return;
        rearranged(before);
        if (keyboard) {
            queueMicrotask(() => {
                if (!disposed)
                    paneRows.rows[tabs.focused]?.focusActive();
            });
        }
    }
    // The user is in the pane `pane`: a press or the focus came into it. Not at Root, where the graph
    // fills the first pane's place, nor while the shell itself is moving the keyboard.
    function focusPane(pane) {
        if (showing > 0 || !tabs.active)
            return;
        if (tabs.focus(pane))
            shown();
    }
    // Mod+1 or Mod+2: the pane `pane` focused (from Root, the documents shown again), and the
    // keyboard put on its active tab once its row is drawn (later's refresh, queued before), so the
    // next key pressed is that pane's.
    function goToPane(pane) {
        if (pane >= tabs.panes.length || tabs.items.length === 0)
            return;
        if (tabs.focus(pane))
            shown();
        queueMicrotask(() => {
            if (!disposed)
                paneRows.rows[pane]?.focusActive();
        });
    }
    // What the panes' commands would do now, for the palette's rows.
    function paneCommands() {
        const active = tabs.active;
        return {
            splitRight: !!active && tabs.splits(active, 'right'),
            moveToOther: !!active && tabs.splits(active, tabs.otherSide(active)),
            panes: tabs.items.length === 0 ? 0 : tabs.panes.length,
        };
    }
    function activate(tab) {
        if (tabs.activate(tab))
            shown();
    }
    // The Explorer's Root: no document shown, the tabs kept.
    function showRoot() {
        if (tabs.deactivate())
            shown();
    }
    function pin(tab) {
        if (!tab.preview)
            return;
        tab.preview = false;
        paint();
    }
    // --- Saving and closing ------------------------------------------------------------------------
    // Save writes over the file, Save As where the user says, which the tab then shows. A save
    // that cannot be made says why; one the host made a download of says so, as the file on disk is
    // as it was.
    const saver = new Saver(host);
    const saved = (name, downloaded = false) => say('info', `${downloaded ? 'Downloaded' : 'Saved'} ${name}`, 2000);
    async function save(tab, as = false, fromCommand = false) {
        // The Terminal's lines before it are the document's first: an edit one made went to the source,
        // with no cell editor for commitEdit to wait on. (The Terminal's own `save` is one of them.)
        if (!fromCommand)
            await modules.idle();
        // A cell editor still open, or a field of the inspector the focus is in, holds what the user
        // typed: the save takes it.
        inspector.commit();
        await tab.handle?.commitEdit();
        const writes = as || !!tab.doc?.dirty;
        const result = await saver.save(tab, as);
        // Another program wrote the file after the save: the user's file is the document, not the disk's.
        // Asked, and answered before the save counts: kept, the document is unsaved again, so a close
        // that saved first does not go on.
        if (result.kind === 'saved' && result.overwritten) {
            await reloads.changedOnDisk(tab, true, true);
            return tab.doc?.dirty ? false : 'saved';
        }
        if (result.kind === 'saved' && writes)
            saved(tab.name, result.downloaded);
        if (result.kind === 'saved-as') {
            close(tab);
            saved((await open(result.path)).name);
        }
        else if (result.kind === 'not-saved' && result.error) {
            log('error', `Could not save ${tab.name}: ${result.error}`);
            // The Terminal says why itself, on its own line.
            if (fromCommand)
                throw new Error(result.error);
            popovers.closeAll();
            dialog.show({ title: `Could Not Save ${tab.name}`, reason: result.error });
        }
        if (result.kind === 'not-saved')
            return false;
        return result.kind === 'saved' && result.downloaded ? 'downloaded' : 'saved';
    }
    /** Whether `tab` was saved, written or downloaded: what a close waiting on its save goes on by. */
    const saveOk = async (tab) => (await save(tab)) !== false;
    // A tab with unsaved edits closes once the user says to save them (and they are) or discard them.
    // An edit a Terminal line still running makes is one too, as it is for a save.
    async function requestClose(tab) {
        await modules.idle();
        // What a cell editor still open holds is an unsaved edit too, and so is an inspector field's.
        inspector.commit();
        await tab.handle?.commitEdit();
        if ((await settle([tab], confirmClose, saveOk)) && tabs.items.includes(tab))
            close(tab);
    }
    // The tabs a tab's menu's Close Others closes: the others of `keep`'s own pane; a compare tab's
    // two files are its own, and stay.
    const othersOf = (keep) => (tabs.panes[tabs.paneOf(keep)]?.items ?? []).filter((t) => t !== keep && !keep.compare?.involves(t));
    // Several tabs to close (a tab's menu's Close Others): their edits committed as a close commits
    // one's, one question about all their unsaved edits, and each closed, if it is still open, once
    // they are saved or let go.
    async function requestCloseMany(group) {
        if (group.length === 0)
            return;
        await modules.idle();
        inspector.commit();
        await Promise.all(group.map((t) => t.handle?.commitEdit()));
        if (!(await settle(group, confirmClose, saveOk)))
            return;
        for (const tab of group)
            if (tabs.items.includes(tab))
                close(tab);
    }
    // A tab's listeners, table and document let go, and the host told its file is closed. A compare
    // tab's connection let go: it holds no file of its own to tell the host of.
    function release(tab) {
        for (const stop of tab.stops.splice(0))
            stop();
        if (tab.compare)
            return tab.compare.dispose();
        tab.handle?.dispose();
        tab.doc?.dispose();
        host.closeFile?.(tab.path);
    }
    function close(tab) {
        // A file's compares go with it: each draws it, and would draw nothing.
        if (!tab.compare)
            for (const other of tabs.items.filter((t) => t.compare?.involves(tab)))
                close(other);
        release(tab);
        tab.panel.remove();
        const before = tabs.active;
        // A pane left with no tab goes, and the other is focused: its tab is then the active one.
        tabs.remove(tab);
        // Back must not land on a place that went with the tab, nor a question stay up about it.
        nav.forget(tab.id);
        questions.recheck();
        rearranged(before);
    }
    // --- Opening -----------------------------------------------------------------------------------
    /**
     * Open the file at `path` in a tab, or go to its tab. `preview`: the file is only being looked at
     * (a click in the folder's tree, a search pick, a link), so it takes the place of the preview tab
     * there is, unless that one holds edits; a file opened for good is kept, and so is its tab when
     * it was a preview. `created`: a new dictionary to make there (openNew), not a file to read.
     */
    async function open(path, how = {}) {
        // A file by its uri, as the workspace knows it: on Windows the folder's tree and a link spell
        // the path File > Open gave (`C:\work\x.sldd`) as `c:\work\x.sldd` and `C:\work/x.sldd`.
        const uri = sourceUri(path);
        const existing = tabOfFile(uri);
        if (existing) {
            if (!how.preview)
                pin(existing);
            activate(existing);
            // Still being read: what the caller does next (select a link's row) needs its table.
            await existing.ready;
            return existing;
        }
        // One preview tab in each pane: the focused pane's, which the new tab goes into.
        const replaced = how.preview ? tabs.panes[tabs.focused]?.items.find((t) => !!t.preview && !t.dirty) : undefined;
        const panel = document.createElement('section');
        panel.className = 'doc-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.dataset.path = path;
        docs.append(panel);
        // A project's tab by the name its row in the folder has: every TOML project's file is matlab.toml.
        const name = isProjectFile(path) ? projectFallbackName(path) : basenameOf(path);
        const tab = { id: `tab-${++nextId}`, path, name, panel, preview: !!how.preview, selection: [], stops: [], ready: Promise.resolve() };
        tabs.add(tab);
        // In the preview's place, which closes once the new tab is there, so the pane is never left
        // without a tab (it would go); the preview was not the active tab by then, and its close is
        // no place the user went to.
        if (replaced) {
            tabs.move(tab, tabs.panes[tabs.focused].items.indexOf(replaced));
            nav.quietly(() => close(replaced));
        }
        shown();
        // Until the file is shown (its table, its banner, its page), the panel says it is opening it.
        const note = openingNote(tab);
        tab.ready = load(tab, uri, !!how.created).finally(() => note.remove());
        await tab.ready;
        return tab;
    }
    // Read the file of a tab just added and show it: on its page, a project; in a table connected to
    // its document, any other file; and in the table's banner why it could not be. A new dictionary
    // (`created`) is made in the page, and nothing is read for it.
    async function load(tab, uri, created = false) {
        const { path } = tab;
        if (isProjectFile(path))
            return showProject(tab, { host, folder: folderNow, open: (to) => open(to, { preview: true }), log });
        const storageKey = `${key}:${uri}`;
        try {
            // A new file's bytes are the dictionary it is made as: what the graph draws until a save writes it.
            const bytes = created ? newDictionaryBytes() : await host.readFile(path);
            // The shell was taken down meanwhile, and the host told of every file it had open.
            if (disposed)
                return;
            // Closed while its file was read: nothing to open. The host began watching the file after the
            // read, past the close it heard, so it is told again, unless a tab opened since holds the file
            // (by its uri: another spelling of the path is the same file).
            if (!tabs.items.includes(tab)) {
                if (!tabOfFile(uri))
                    host.closeFile?.(path);
                return;
            }
            const doc = await (created ? ws.create(tab.name, uri) : ws.open(bytes, tab.name, uri));
            if (disposed || !tabs.items.includes(tab)) {
                doc.dispose();
                return;
            }
            tab.doc = doc;
            tab.bytes = bytes;
            // A new file holds unsaved edits from the start, which no change of its dirty state tells.
            if (doc.dirty) {
                tab.dirty = true;
                paint();
            }
            tab.stops.push(doc.onDirty((dirty) => {
                tab.dirty = dirty;
                // An edit keeps a preview tab: it is not the user's to lose by looking at another file.
                if (dirty)
                    tab.preview = false;
                // The file's page says whether it holds edits; its table hears nothing of a save.
                tab.handle?.refreshInspector();
                paint();
            }));
            const handle = connectDocument(tab, doc, storageKey, wiring);
            // Where the document's undo stack stands: the toolbar's Undo and Redo move with it, whether or
            // not its table changes (a reload of the text it already held empties the stack).
            const history = isEditable(doc.table) ? doc.table.history : undefined;
            if (history)
                tab.stops.push(history.onChange(() => later()));
            tab.stops.push(handle.on('navigate', ({ link, uri: to }) => void navigate(tab, link, to)), handle.on('select', (rowIds) => {
                tab.selection = rowIds;
                if (tab === tabs.active)
                    visit();
                later();
            }), handle.on('copyFailed', (failure) => log('error', `Could not copy: ${failure.message}`)), 
            // What Copy, Cut, Paste and Delete did, from the toolbar, a chord or the menu, said briefly.
            handle.on('ran', (run) => {
                const note = ranNote(run);
                if (note)
                    say('info', note, 2000);
            }), 
            // Copy Link to Entry: the host's link to the entry the row is in, on the clipboard. Show in
            // Graph: Root, what the row stands for (its item, the file it names, the file's box) brought
            // forward, and the keyboard kept as Show Graph's is (showRootFrom).
            handle.on('action', ({ actionId, rowId }) => {
                if (actionId === COPY_ENTRY_LINK.id)
                    return void copyEntryLink(tab, rowId);
                if (actionId !== SHOW_IN_GRAPH.id)
                    return;
                showRootFrom(tab.panel, showRoot, rootTakesTheKeyboard);
                graph.showRow(uri, tab.table?.rows ?? [], rowId);
            }), 
            // For the toolbar, the Explorer and the Gallery: each whole paint, the first too (which no
            // change may follow), and any change at all. What the document refused, and why, is a line
            // of the Log, past the dialog that said it. (Its `error` changes are its banner's, and what
            // failed is said where it failed: the workspace's notice, a read, a save.)
            handle.on('painted', () => later()), doc.table.subscribe((change) => {
                if (change.kind === 'refused')
                    log('warning', `${change.title}: ${change.reason}`);
                else if (change.kind === 'invalid')
                    log('warning', change.reason);
                later();
            }));
            // A connected MATLAB's command chosen on a row's menu (wiring.matlabItems).
            tab.stops.push(handle.on('action', ({ actionId, rowId }) => {
                if (isMatlabAction(actionId))
                    runOn(tab, actionId, rowId);
            }));
            if (tab === tabs.active)
                follow();
            later();
            log('info', created ? `Opened ${tab.name}, a new data dictionary` : `Opened ${tab.name}`);
        }
        catch (err) {
            if (disposed)
                return;
            const table = tab.table ?? newTable(tab, storageKey, false, popovers.tableStyle());
            table.banners = { error: `Failed to open ${tab.name}: ${message(err)}` };
            log('error', table.banners.error);
        }
    }
    // A file a folder's tree, a search or the Search view picked: as a preview, on the row `name`
    // names, if it names one.
    function openOn(uri, name) {
        void open(uriPath(uri), { preview: true }).then((tab) => {
            if (name !== undefined)
                tab.handle?.selectByName(name);
        });
    }
    // A link from outside the shell (the desktop app's data-explorer:// link, a page's #entry=): the
    // file opened for good, as openPaths opens one, since the user asked for it by name; then the
    // entry the link names, by its name and its section's label, selected once the table has its
    // rows, as select() selects a row (the history and the location follow). A link names in words
    // what the file held when it was made: an entry it holds no more is said, in a warning that stays
    // until its × (the user followed the link to see a row, and has to read why none is shown). The
    // caller waits on nothing it could say a failure with, so what fails is said here.
    async function openAt(path, at = {}) {
        // A page in plain JavaScript may hand anything: what is no string names nothing, and a path
        // that is none names no file (nor a name for the catch below to say it by).
        if (typeof path !== 'string' || path === '')
            return;
        try {
            const tab = await open(path);
            const entry = typeof at?.entry === 'string' ? at.entry : '';
            const section = typeof at?.section === 'string' ? at.section : '';
            if (entry === '')
                return;
            const rows = await paintedRows(tab);
            if (!rows || !isOpen(tab))
                return;
            const row = rowOfEntry(rows, entry, section);
            if (row)
                tab.handle?.select([row.ID]);
            else
                say('warning', `No entry named ${entry}${section ? ` in ${section}` : ''}`);
        }
        catch (err) {
            failed(`Could not open ${basenameOf(path)}: ${message(err)}`);
        }
    }
    // The rows of `tab`'s table once its first whole paint is in: at once for a table painted
    // already, else at its first `painted`. Null for a tab with no table connected (a project's page,
    // a file that could not be read, whose banner says why), for a table whose source could not open
    // its file (`failed`: no paint answers that open, and the banner says why), and for a tab closed,
    // before or while it waits: its close runs its stops, this one among them.
    function paintedRows(tab) {
        const handle = tab.handle;
        if (!isOpen(tab) || !handle)
            return Promise.resolve(null);
        if (handle.view)
            return Promise.resolve(handle.table.rows);
        // Neither painted nor still loading: its source failed already, as one that cannot parse its
        // file does within the open that connected it, before `failed` could be heard here.
        if (!handle.table.loading)
            return Promise.resolve(null);
        return new Promise((resolve) => {
            const done = (rows) => {
                offPainted();
                offFailed();
                // Painted: no stop is left for the close to run. (A close empties the list before it runs them.)
                const index = tab.stops.indexOf(stop);
                if (index >= 0)
                    tab.stops.splice(index, 1);
                resolve(rows);
            };
            const offPainted = handle.on('painted', () => done(handle.table.rows));
            const offFailed = handle.on('failed', () => done(null));
            const stop = () => done(null);
            tab.stops.push(stop);
        });
    }
    // Copy Link, for a host that makes links (ShellHost.linkFor): its address for every open file,
    // pane by pane, at `tab`'s selection (the active tab's, a tab's menu's own; none at Root), on the
    // clipboard. Asked of the host at once, as it answers, also as the palette and a tab's menu open
    // (linkAt), to grey the command while no open file has an address. A compare tab is no file: its
    // two files are among the open ones, and its link is at none of them, as Root's is.
    const openFiles = () => tabs.panes
        .flatMap((pane) => pane.items)
        .filter((t) => !t.compare)
        .map(({ path, name }) => ({ path, name }));
    const linkTabOf = (tab) => tab && !tab.compare ? { path: tab.path, selection: tab.selection, rows: tab.table?.rows ?? [] } : undefined;
    const linkAt = (tab) => host.linkFor?.(linkRequestOf(openFiles(), linkTabOf(tab)));
    async function copyLink(tab) {
        if (!host.linkFor)
            return;
        try {
            const link = linkAt(tab);
            if (link.url === null)
                return say('info', NO_LINK);
            await copyText(host, link.url);
            const note = copiedNote(link);
            say(note.level, note.text, note.level === 'info' ? 2000 : undefined);
        }
        catch (err) {
            failed(`Could not copy the link: ${message(err)}`);
        }
    }
    // Copy Link to Entry, for a host that makes links: its link to the entry the row `rowId` is in (a
    // block in a subsystem by its key, so that openAt selects that block again), put on the clipboard
    // as Copy Name puts a name, and said briefly. A host that answers no link copies nothing; one
    // whose clipboard refuses it, or that throws, is said, as a copy that failed is.
    async function copyEntryLink(tab, rowId) {
        const at = rowId === null ? undefined : linkedEntryOf(tab.table?.rows ?? [], rowId);
        if (!at)
            return;
        try {
            const link = host.entryLink?.({ path: tab.path, entry: at.entry, ...(at.section ? { section: at.section } : {}) });
            if (typeof link !== 'string' || link === '')
                return;
            await copyText(host, link);
            say('info', 'Link copied', 2000);
        }
        catch (err) {
            say('error', `Could not copy the link: ${message(err)}`);
        }
    }
    // A link into another file: open it (or go to its tab) and select the row it names. `uri` is
    // the file the folder's tree shows for it, when a folder is shown.
    async function navigate(from, link, uri) {
        const to = linkDestination(link, from.path);
        const tab = await open(uri ? uriPath(uri) : to.path, { preview: true });
        if (to.select)
            tab.handle?.selectByName(to.select);
    }
    // A new data dictionary at `path`, where the host's New said it goes (ShellHost.newFile), in a tab
    // of its own and unsaved until the user saves it. Not over a file a tab has open, whose edits it
    // would take the place of; and only a dictionary, the one kind of file New makes. A path it does
    // not open the host is told it has not (closeFile), as one that may have begun watching it.
    async function openNew(path) {
        if (disposed)
            return;
        const name = basenameOf(path);
        const holder = tabOfFile(sourceUri(path));
        if (holder)
            return keepOpenFile(holder, name);
        if (!isSlddFile(path)) {
            host.closeFile?.(path);
            return failed(`Could not make ${name}: a new file is a data dictionary, whose name ends in .sldd.`);
        }
        await open(path, { created: true });
    }
    // New named the file `tab` has open, which it does not make. A browser's save picker has emptied
    // that file as it closed (Chromium makes or empties the file it names): what the tab holds of it,
    // as the shell last read or saved it, is written back. Where that write fails, or the tab holds
    // no copy, a document the page edits is kept over the emptied file (Doc.keepOver), unsaved, for a
    // Save to write; one it does not edit cannot be saved, and is left as it is.
    async function keepOpenFile(tab, name) {
        const now = await host.readFile(tab.path).catch(() => undefined);
        if (disposed || !isOpen(tab))
            return;
        const emptied = now !== undefined && now.length === 0 && (tab.bytes === undefined || tab.bytes.length > 0);
        if (!emptied) {
            failed(`Could not make ${name}: it is open in a tab. Close the tab first.`);
            // The read has made the file as it is now the one the host watches for: a change it held, which
            // the host's watcher would not tell now, is the tab's to take (or to ask about) as any is.
            if (now && tab.bytes && !sameBytes(now, tab.bytes))
                void reloads.changedOnDisk(tab, tab.doc?.dirty ?? false);
            return;
        }
        const said = `Could not make ${name}: it was open in a tab, and the browser emptied it while picking`;
        let why;
        if (tab.bytes) {
            try {
                await host.saveFile(tab.path, tab.bytes);
                return failed(`${said}, so its saved copy was written back.`);
            }
            catch (err) {
                why = message(err);
                log('error', `Could not write ${name} back: ${why}`);
            }
        }
        // The host's reason ends its own sentence, as an error's message often does.
        if (!tab.doc?.editable)
            return failed(why === undefined ? `${said}.` : `${said}, and its copy could not be written back: ${why.replace(/\.?$/, '.')}`);
        tab.bytes = now;
        await tab.doc.keepOver(now);
        failed(`${said}. Save the tab to write it back.`);
    }
    function openPaths(paths) {
        // In order, so the last one named ends up active.
        return paths.reduce((prev, p) => prev.then(() => (disposed ? undefined : open(p))), Promise.resolve()).then(() => undefined);
    }
    // --- Comparing ---------------------------------------------------------------------------------
    // Why a tab is not one a compare reads, as the end of "Could not compare a with b: a …".
    const notComparable = (tab) => tab.compare
        ? 'is a comparison'
        : isProjectFile(tab.path)
            ? 'is a project, which has no table'
            : !tab.doc || (tab.table && !tab.table.loading && !tab.handle?.view)
                ? 'could not be read'
                : 'is not shown yet';
    /**
     * Compare `left` with `right` in a tab of their own, once both are read: their compare tab if
     * there is one of the two in that order, else a new one, both files' tabs kept (no longer
     * previews), as the compare draws them.
     */
    async function compare(left, right) {
        await Promise.all([left.ready, right.ready]);
        if (disposed || !isOpen(left) || !isOpen(right))
            return;
        const cannot = [left, right].find((t) => !comparable(t));
        if (cannot)
            return failed(`Could not compare ${left.name} with ${right.name}: ${cannot.name} ${notComparable(cannot)}`);
        const existing = tabs.find((t) => t.compare?.left === left && t.compare.right === right);
        if (existing)
            return activate(existing);
        pin(left);
        pin(right);
        const panel = document.createElement('section');
        panel.className = 'doc-panel';
        panel.setAttribute('role', 'tabpanel');
        panel.dataset.compare = '';
        docs.append(panel);
        const tab = { id: `tab-${++nextId}`, path: '', name: `${left.name} ↔ ${right.name}`, panel, selection: [], stops: [], ready: Promise.resolve() };
        tabs.add(tab);
        tab.compare = connectCompare(tab, left, right, {
            tableStyle: () => popovers.tableStyle(),
            storageKey: `${key}:compare`,
            titleOf,
            selected(lineIds) {
                tab.selection = lineIds;
                if (tab === tabs.active)
                    visit();
                later();
            },
            say,
            menu,
            showIn(file, rowId) {
                if (!isOpen(file))
                    return;
                activate(file);
                file.handle?.select([rowId]);
            },
        });
        shown();
        await tab.compare.refresh();
        log('info', `Comparing ${left.name} with ${right.name}`);
    }
    // Compare With…'s question, asked in the palette for the file `from`, answered by `picked`.
    let comparing = null;
    function compareWith(from) {
        if (disposed || parts.modalOpen())
            return;
        // The shell's own menus offer no Compare With… on a compare tab or a project's, a host's native
        // menu has the item everywhere: said at once, rather than after a file is picked.
        if (from.compare)
            return say('info', "A comparison can't be compared with another file.");
        if (isProjectFile(from.path))
            return say('info', `${from.name} is a project, which has no table: only data files are compared.`);
        popovers.closeAll();
        comparing = from;
        parts.palette.show(compareChoices(from, tabs.items, titleOf), { placeholder: `Compare ${from.name} with…`, remember: false });
    }
    // A row of Compare With…'s question: another open file's tab, or Browse…, which asks the host's
    // picker for one, opened (kept) and compared once it is shown. A picker that could not be shown
    // says why, as Open File's does; one the user cancelled says nothing.
    function picked(id) {
        const from = comparing;
        comparing = null;
        if (!from || !isOpen(from))
            return;
        if (id !== 'browse') {
            const other = tabs.find((t) => t.id === id);
            if (other)
                void compare(from, other);
            return;
        }
        void host.pickFiles().then(async (paths) => {
            const path = paths[0];
            if (path === undefined || disposed)
                return;
            // Compared once it is shown (paintedRows): a tab's `ready` settles a moment before its rows.
            const other = await open(path);
            await paintedRows(other);
            if (isOpen(from) && isOpen(other))
                await compare(from, other);
        }, (err) => {
            if (!(err instanceof Error && err.name === 'AbortError'))
                failed(`Could not open a file: ${message(err)}`);
        });
    }
    // --- Files changed on disk ---------------------------------------------------------------------
    // A reload unasked, or one that failed, said in the Log once it is done (an answer is said as given).
    const reloads = new ReloadGate({
        read: (path) => host.readFile(path),
        confirm: confirmReload,
        isOpen,
        reloaded: (tab) => log('info', `${tab.name} changed on disk: reloaded`),
        failed: (_tab, text) => log('error', text),
    });
    // --- Commands ----------------------------------------------------------------------------------
    // Undo and Redo: what is typed in a text field (the search box, a cell editor) is the field's to
    // undo; anything else is the active document's last edit. (Pressed in a table, the chords are the
    // table's own, and never reach the command.) Settings and About open their popover at once,
    // which takes the focus, and a cell editor commits as it loses it.
    function command(id) {
        if (disposed)
            return;
        // The tab active when the command was given, whatever is active by the time it is carried out.
        const tab = tabs.active;
        if (id === 'settings' || id === 'about')
            return popovers.toggle(id);
        if (id === 'matlab-connect')
            return void host.matlab?.showConnect();
        // On the active tab's selected row, or its file with none, once a cell editor still open has
        // given the document what it holds (a native menu's item takes no focus).
        if (isMatlabAction(id)) {
            void Promise.resolve(tab?.handle?.commitEdit()).then(() => {
                if (!disposed)
                    runOn(tab && isOpen(tab) ? tab : undefined, id, tab?.selection[0] ?? null);
            });
            return;
        }
        // The palette, as its own modal: the popovers make way first, one Escape closing one layer;
        // none over another modal, whose keys are its own, until one stack keeps their order (F2).
        if (id === 'palette') {
            if (parts.modalOpen())
                return;
            popovers.closeAll();
            const active = tabs.active;
            return parts.palette.show(withMatlabCommands(paletteCommands(toolbarState(), paneCommands(), { ...folderNav.commands(), view: folderView }, hostCommands(), {
                canCompare: !!active && comparable(active),
                hasChanges: !!active?.compare?.hasChanges,
            }), matlabCommands()));
        }
        const view = viewOfCommand(id);
        if (view) {
            // A view brought forward; one with a box of its own (Search, the Terminal) takes the keyboard.
            modules.show(view.view);
            return later();
        }
        if ((id === 'undo' || id === 'redo') && focusIsInTextField())
            return void document.execCommand(id);
        // A toolbar press takes no focus, so a cell editor still open is open now: what it holds is
        // the document's before anything acts on it.
        void Promise.resolve(tab?.handle?.commitEdit()).then(() => {
            if (!disposed)
                carryOut(id, tab, carrying);
        });
    }
    // What the document commands are carried out with (carryOut.ts).
    const carrying = {
        host,
        tabs,
        nav,
        openPaths,
        openNew,
        save: async (tab, as) => (await save(tab, as)) !== false,
        close: (tab) => void requestClose(tab),
        shown,
        keyboardToRoot: rootTakesTheKeyboard,
        rearrange,
        goToPane,
        later,
        failed,
        folder: { up: () => folderNav.up(), refresh: () => folderNav.refresh() },
        // Open from URL…'s address, asked in the shell's dialog in turn with its questions.
        askUrl: () => questions.prompt(OPEN_URL_PROMPT),
        copyLink: (tab) => void copyLink(tab),
        compareWith,
    };
    // What the palette offers of the host's optional members, as they stand as it opens.
    const hostCommands = () => ({ openUrl: !!host.fetchUrl, copyLink: linkState(tabs.active) });
    // Copy Link's state at `tab`: none for a host that makes no links, else whether its link links a file.
    function linkState(tab) {
        if (!host.linkFor)
            return null;
        try {
            return { enabled: linkAt(tab)?.url != null };
        }
        catch {
            // A host whose link throws: Copy Link says so when it is chosen.
            return { enabled: true };
        }
    }
    // --- The modules' views ------------------------------------------------------------------------
    // Raw, Search, the Gallery and the Terminal (modules.ts), over the active tab and the folder.
    const modules = connectModules({
        shell,
        parts,
        host,
        active: () => tabs.active,
        tabs: () => tabs.items,
        folder: folderNow,
        openOn,
        // The Terminal's line says what the toast does: a download is no save over the file.
        async save(tab) {
            const how = await save(tab, false, true);
            if (how)
                return `${how === 'downloaded' ? 'Downloaded' : 'Saved'} ${tab.name}.`;
            throw new Error(`${tab.name} was not saved.`);
        },
        failed,
        later,
    });
    stops.push(() => modules.dispose());
    // Root's relationship graph (graphPane.ts), over the tabs' bytes and the folder's files.
    const graph = connectGraphPane(parts.graph, {
        tabs: fileTabs,
        folder: folderNow,
        shown: () => !disposed && !tabs.active && tabs.items.length > 0,
        open: openOn,
        notOpen: (ref) => say('info', `${ref} is not open`),
        failed,
        // Its selection is the inspector's page at Root, and the location bar's dimmed file.
        selected: later,
        titleOf,
    });
    stops.push(() => graph.dispose());
    // Drawn in the layout Settings names from the start; a change of it is told through layoutGraph.
    graph.setLayout(popovers.graphLayout());
    // --- The parts' requests -----------------------------------------------------------------------
    // Each part's request (requests.ts), a tab named by its id.
    stops.push(connectRequests(shell, parts, {
        command,
        tabOf: (id) => tabs.find((t) => t.id === id),
        activate,
        close: (tab) => void requestClose(tab),
        // Close Others closes the others of the tab's own pane, as an editor group's does, the tab
        // made the active one first: what is left to look at is the tab the menu was asked of.
        others: othersOf,
        closeOthers(keep) {
            activate(keep);
            void requestCloseMany(othersOf(keep));
        },
        link: linkState,
        copyLink: (tab) => void copyLink(tab),
        save: (tab, as) => void save(tab, as),
        pin,
        move(tab, index, pane) {
            // Along its own row, the shown tab kept; into the other pane's, shown and focused there.
            if (tabs.paneOf(tab) !== pane)
                return rearrange(() => tabs.moveTo(tab, pane, index));
            if (tabs.move(tab, index))
                paint();
        },
        paneOfRow: (row) => paneRows.paneOf(row),
        focusPane,
        drop: (tab, pane, side) => rearrange(() => (side ? tabs.split(tab, side) : tabs.moveTo(tab, pane))),
        resized: (ratio) => keepSplit(store, shell.storageKey, ratio),
        showRoot,
        toStep(index) {
            // The dimmed file at Root opens, as a double-click on its box does; any other is a place.
            if (located[index]?.preview)
                graph.openSelected();
            else
                nav.toStep(index);
            later();
        },
        toggle: (id, anchor) => popovers.toggle(id, anchor),
        viewChanged(view, open) {
            // A view the user shows by its button or its chord takes the keyboard as its command gives
            // it, and shows what it would have shown meanwhile.
            if (open && view)
                modules.shown(view);
            later();
        },
        picked,
        compareWith,
        // An open file's menu in the Explorer ends with a connected MATLAB's commands for the file.
        matlabItems: (tab) => matlabMenuItems(matlabOffers(host.matlab?.status(), matlabTarget(tab, null))),
        runMatlab: (tab, id) => runOn(tab, id, null),
    }));
    // New's chord only for a host that makes files, asked at each press as the host's members are.
    // Mod+1 and Mod+2 only while the documents are in two panes: with one, they are the browser's,
    // which switches its own tabs by them. F7 and Shift+F7 only while a compare tab is active: they are
    // the browser's caret browsing everywhere else.
    const offers = (id) => {
        if (id === 'new-file')
            return !!host.newFile;
        if (id === 'focus-pane-1' || id === 'focus-pane-2')
            return tabs.panes.length > 1;
        if (id === 'next-change' || id === 'previous-change')
            return !!tabs.active?.compare;
        return true;
    };
    stops.push(installKeys(command, { nativeMenu: options.nativeMenu, offers }));
    // Files dragged over the page, where the page's installFileDrop takes them: the documents' area
    // is outlined as where they open.
    stops.push(followDropMark(docs, (dragging) => (docs.dropping = dragging)));
    // Table rows dragged onto the Explorer, onto a file or a section of one, open in a tab whether or
    // not it is on screen: moved or copied there, and said as an edit is.
    stops.push(connectExplorerDrop(explorer, {
        drag: () => dragging,
        tabOf: (id) => tabs.find((t) => t.id === id),
        tabOfUri: (uri) => tabs.find((t) => t.doc?.uri === uri),
        dropped: (text) => say('info', text, 2000),
        mark: () => notices,
        refused: (text, since) => {
            if (!noticed.some((n) => n.at > since && n.message === text))
                failed(text);
        },
    }));
    // --- The folder --------------------------------------------------------------------------------
    // The Folder view's bar and menus (folderNav.ts): a move asks the host, which shows the folder
    // it moved to as it shows any; a row's file opens, beside the others or not, and closes.
    const tabOfUri = tabOfFile;
    const folderNav = connectFolderNav({
        host,
        part: folderPart,
        bar: folderBar,
        menu,
        folder: () => folderNow(),
        isOpen: (uri) => !!tabOfUri(uri),
        open(path, side) {
            void open(path).then((tab) => {
                if (side && isOpen(tab))
                    rearrange(() => tabs.split(tab, 'right'));
            });
        },
        close(uri) {
            const tab = tabOfUri(uri);
            if (tab)
                void requestClose(tab);
        },
        selected: () => tree.selectedItems,
        // A row's file opened for good (not a preview), once it is shown, then asked about or compared.
        compareWith(path) {
            void open(path).then(async (tab) => {
                // A file that could not be shown is asked about by no one: its banner says why.
                if ((await paintedRows(tab)) && isOpen(tab))
                    compareWith(tab);
            });
        },
        compare(first, second) {
            void (async () => {
                const a = await open(first);
                const b = await open(second);
                await Promise.all([paintedRows(a), paintedRows(b)]);
                if (isOpen(a) && isOpen(b))
                    await compare(a, b);
            })();
        },
        said: (text) => say('info', text, 2000),
        failed,
    });
    stops.push(() => folderNav.dispose());
    // The Folder view comes forward with the first folder shown, and is left as the user leaves it
    // after: another folder made the workspace folder is no reason to take the side from what it shows.
    let folderRevealed = false;
    // The left view the shell keeps as the user left it, read as the first folder comes: a view
    // chosen in an earlier session (an app reopens its last folder at launch) or since the shell
    // started then stays in front, and the Folder view comes forward only where none was chosen.
    const leftViews = SHELL_VIEWS.filter((v) => v.side === 'left').map((v) => v.view);
    const keptLeftView = () => {
        let kept = null;
        try {
            kept = shell.storageKey ? (store?.getItem(shell.storageKey) ?? null) : null;
        }
        catch {
            // No storage to read: no choice kept.
        }
        return keptView(kept, 'left', leftViews);
    };
    // Every open table is painted again, its Usage filled from the folder shown, and every
    // project's page from its store, again when the folder says its marker changed (a matlab.toml
    // saved). The graph draws the folder's files.
    const folders = connectShownFolder(folderPart, tree, {
        open: openOn,
        menu: (detail) => folderNav.rowMenu(detail),
        shown(shown) {
            log('info', `Showing the folder ${shown.root}`);
            folderNav.shown(shown.root);
            if (folderView && !folderRevealed) {
                folderRevealed = true;
                // The side's first view kept (the Explorer, where every layout starts) is no choice of the
                // user's own: a layout kept for another side's sake keeps it too.
                const kept = keptLeftView();
                if (kept === null || kept === leftViews[0])
                    modules.show('folder');
            }
            markRows();
            modules.scope(basenameOf(shown.root));
            // The folder's usage from now on. A Close Folder, should one come, hands it back to the open
            // tabs: ws.setUsage(openUsage), then openUsage.changed().
            void ws.setUsage(shown.session.usage, shown.session.reposts);
            repaintProjects(tabs.items, shown, log);
            follow();
            graph.stale();
        },
        changed(shown, uris) {
            repaintProjects(tabs.items, shown, log, uris);
            graph.stale();
        },
        // The Search view's results on show are the folder's as it is now.
        namesChanged: () => modules.namesChanged(),
        failed: (text) => log('error', `This folder could not be read: ${text}`),
        // Its tree says so in a row of its own; the Log keeps the line.
        indexFailed: (text) => log('error', `The folder's data files could not be read: ${text}`),
    });
    // --- MATLAB ------------------------------------------------------------------------------------
    // A MATLAB the host reaches (ShellHost.matlab, matlab.ts): the status bar names the one connected,
    // and its button, like the palette's Connect to MATLAB… and the `matlab-connect` command, shows
    // the host's way to connect. Heard once, from now on, and drawn as it is now. A MATLAB gone takes
    // its answers with it: Properties shows what this MATLAB said, and the next may say otherwise.
    const paintMatlab = (now = host.matlab?.status()) => {
        if (disposed)
            return;
        const { label, title } = matlabLabel(now);
        status.matlab = label;
        status.matlabTitle = title;
    };
    stops.push(host.matlab?.on((now) => {
        if (now.state === 'off')
            matlabResults.clear();
        paintMatlab(now);
    }) ?? (() => { }));
    paintMatlab();
    status.addEventListener('dex-shell-matlab-connect', () => host.matlab?.showConnect());
    // The palette's MATLAB group, for a host with a MATLAB: Connect to MATLAB…, connected or not, then
    // the active tab's commands, for its selected row or its file.
    function matlabCommands() {
        const active = tabs.active;
        const offers = active ? matlabOffers(host.matlab?.status(), matlabTarget(active, active.selection[0] ?? null)) : [];
        return matlabPaletteCommands(!!host.matlab, offers);
    }
    // What `tab`'s row `rowId` (null: its file) is to MATLAB, as its table holds it now.
    function matlabTarget(tab, rowId, rows = tab.table?.rows ?? []) {
        return matlabTargetOf(tab, rows, rowId);
    }
    // A MATLAB command on `tab`'s row (or its file), however it was asked for: carried out only where
    // it is offered now, and not while it waits for a save, each refusal said.
    function runOn(tab, id, rowId) {
        const matlab = host.matlab;
        const target = tab ? matlabTarget(tab, rowId) : undefined;
        const offer = matlabOffers(matlab?.status(), target).find((o) => o.id === id);
        if (!matlab || !target || !offer)
            return say('info', `${matlabActionLabel(id, matlab?.status())} is not available here`);
        if (offer.disabled)
            return say('info', offer.reason ?? `${offer.label} is not available now`);
        void runMatlab(id, target, {
            matlab,
            say,
            log,
            evaluated(of, answer) {
                if (of.rowId !== undefined && of.value !== undefined)
                    matlabResults.set(of.docUri, of.rowId, of.value, answer);
            },
            showProperties: () => command('show-properties'),
        });
    }
    // The feed the inspector follows for `tab`: its table's, with what a connected MATLAB answered of
    // a row's value added while the row's value is still the one asked (a changed value finds none).
    // A host with no MATLAB has the table's own.
    function inspected(tab) {
        const handle = tab.handle;
        if (!handle || !host.matlab)
            return handle ?? null;
        let feed = matlabFeeds.get(handle);
        if (!feed) {
            const answerFor = (rowId) => {
                const target = matlabTarget(tab, rowId);
                return target?.value === undefined ? undefined : matlabResults.get(target.docUri, rowId, target.value);
            };
            feed = withMatlabResults(handle, answerFor, (listener) => matlabResults.on(listener));
            matlabFeeds.set(handle, feed);
        }
        return feed;
    }
    // Nothing is open yet, and nowhere has been visited: the history starts at the first file.
    paint();
    follow();
    return {
        openPaths: (paths) => (disposed ? Promise.resolve() : openPaths(paths)),
        openAt: (path, at) => (disposed ? Promise.resolve() : openAt(path, at)),
        showFolder(root, port) {
            if (!disposed)
                folders.show(root, port);
        },
        fileChanged(path) {
            // By its uri, as open() finds a file's tab: a watcher may spell the path otherwise.
            const uri = sourceUri(path);
            const tab = disposed ? undefined : tabOfFile(uri);
            // A clean document takes the disk's file without asking; one with edits is asked first.
            if (tab?.doc)
                void reloads.changedOnDisk(tab, tab.doc.dirty);
        },
        command,
        notify(notice) {
            if (disposed)
                return;
            // A page in plain JavaScript may hand anything: text that is no string is said as text, and no
            // text is nothing to say (no empty toast); a level that is none of the three is the plainest.
            const text = notice?.text == null ? '' : String(notice.text);
            if (text === '')
                return;
            say(notice.level === 'warning' || notice.level === 'error' ? notice.level : 'info', text);
        },
        setSystemTheme(theme) {
            if (!disposed)
                system.set(theme);
        },
        async requestClose() {
            if (disposed)
                return true;
            await modules.idle();
            inspector.commit();
            await Promise.all(tabs.items.map((t) => t.handle?.commitEdit()));
            return settle(tabs.items, confirmClose, saveOk);
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            for (const stop of stops.splice(0))
                stop();
            // Every tab closes, the host told of each file once: a read that lands later finds its tab
            // gone and the shell down, and tells it nothing more.
            for (const tab of [...tabs.items]) {
                release(tab);
                tabs.remove(tab);
            }
            folders.dispose();
            inspector.dispose();
            ws.dispose();
            parts.remove();
        },
    };
}
