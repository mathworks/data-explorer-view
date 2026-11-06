// Copyright 2026 The MathWorks, Inc.
//
// The app in a shell: open files as tabs, each a table connected to its document in one editing
// workspace (a MAT-file, a dictionary and a .slx's Model Workspace take edits; a .mdl stays
// read-only), the inspector following the active tab, one variable editor, menu and dialog for
// them all; and around them the shell's parts, the toolbar, the location bar, the Explorer with
// the folder under it, Settings, About and the toasts. The same code runs in the Electron app and
// in a browser page: what differs is the host (types.ts), which a page hands in.
//
// Lifted from data-explorer-app src/renderer/app.ts and main.ts at 0983920, the app's renderer:
// its rules, in its order, with its comments. What changed is where things are drawn (the shell's
// parts, not index.html's elements) and what the shell adds (the toolbar, preview tabs, the
// Explorer's sections and Root, the location bar and its history, the settings, the chords).
// The rules themselves are the modules beside this one; this file orchestrates. Several are pieces
// of it moved out: what it builds (parts.ts), a tab's document and its widgets (documents.ts), the
// settings and popovers (popovers.ts), the history (navigation.ts), the questions (questions.ts),
// the parts' requests (requests.ts), the document commands (carryOut.ts), the folder shown
// (shownFolder.ts), the modules' views (modules.ts: Raw, Search, the Gallery, the Terminal), and
// Root's relationship graph (graphPane.ts).

import { parseLinkTarget, type LinkTarget } from '../../../model/ids/linkTarget.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { isEditable } from '../../../model/source/tableSource.js';
import { createWorkspace } from '../../../model/source/workspace.js';
import { createOpenFilesUsage } from '../../../model/usage/openFilesUsage.js';
import { basenameOf, isProjectFile, projectFallbackName } from 'data-explorer-core';
import { connectInspector } from '../../property-inspector/connectInspector.js';
import { focusIsInTextField } from '../../shared/textField.js';
import type { DexAppShell } from '../dex-app-shell.js';
import type { LogLevel } from '../modules/dex-log-panel.js';
import {
  clearSelection,
  connectDocument,
  docTabOf,
  newTable,
  repaintProjects,
  showProject,
  statusOf,
  SHOW_IN_GRAPH,
  type OpenTab,
} from './documents.js';
import { ranNote } from './editingNotes.js';
import { explorerFiles } from './explorerFiles.js';
import type { FolderView } from './folder.js';
import { connectGraphPane } from './graphPane.js';
import { installKeys, onMac } from './keys.js';
import { linkDestination } from './links.js';
import { locationOf, type ShellPlace } from './location.js';
import { ShellNavigation } from './navigation.js';
import { connectModules } from './modules.js';
import { buildShell } from './parts.js';
import { connectRequests } from './requests.js';
import { rowIn, sectionOf } from './rows.js';
import { connectShownFolder } from './shownFolder.js';
import { connectPopovers, pageStorage } from './popovers.js';
import { inPageQuestions, shellPrompts } from './questions.js';
import { ReloadGate } from './reload.js';
import { Saver, settle } from './saving.js';
import { TabList } from './tabs.js';
import { systemThemeFromMedia } from './theme.js';
import { toolbarItems, toolbarStateOf, type ToolbarState } from './toolbarItems.js';
import { carryOut, type CarryOutContext } from './carryOut.js';
import { paletteCommands } from './paletteItems.js';
import { viewOfCommand } from './views.js';
import type { ConnectShellOptions, ShellCommand, ShellHandle } from './types.js';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Fill an empty `<dex-app-shell>` with the app, over `options.host`, and return the handle the host
 * drives it by. The elements it builds must be defined first (the parts' define functions, and the
 * widgets the documents are shown in). Nothing is opened: the host opens files (`openPaths`) and
 * shows a folder (`showFolder`) when it has them.
 */
export function connectShell(shell: DexAppShell, options: ConnectShellOptions): ShellHandle {
  const host = options.host;
  const appName = options.appName ?? 'Data Explorer';
  const key = options.storageKey ?? 'dex-shell';
  // The layout is the shell's to keep; set before the views go in, which is when it reads it back.
  if (!shell.storageKey) shell.storageKey = `${key}:layout`;
  const parts = buildShell(shell, { appName });
  const { toolbar, location, explorer, folderPart, tree, docs, strip, status, editor, menu, dialog, confirm, toasts } = parts;

  let disposed = false;
  const stops: (() => void)[] = [];
  const tabs = new TabList<OpenTab>();
  let nextId = 0;
  // The Log, which every part of the shell writes to.
  const log = (level: LogLevel, text: string): void => parts.log.appendEntry({ level, message: text });
  // The Usage column is answered over the open tabs, as each holds its file (read or saved), until
  // a folder is shown, whose session answers it from then on (ws.setUsage). A change to what is
  // open (a tab opened, closed, saved or reloaded; refresh() tells it) repaints, once the burst is
  // over, each table whose column was answered over other tabs than are open now.
  const openUsage = createOpenFilesUsage({
    files: () => tabs.items.flatMap((t) => (t.doc && t.bytes ? [{ uri: t.doc.uri, path: t.path, bytes: t.bytes }] : [])),
    refill(uris) {
      if (disposed || folderNow()) return;
      for (const uri of uris) void ws.get(uri)?.repaint().catch((err) => log('error', `Could not fill the Usage column: ${message(err)}`));
    },
  });
  stops.push(() => openUsage.dispose());
  // Its documents share one clipboard, so a row copied in one tab pastes into another. What a
  // document says the table cannot show is a toast, as it stands, and a line of the Log, which
  // keeps what a toast lets go by.
  const ws = createWorkspace({
    editing: true,
    usage: openUsage,
    notify(notice) {
      toasts.show(notice);
      log(notice.level === 'status' ? 'info' : notice.level, notice.message);
    },
  });
  // What the shell must say: a toast, and its line in the Log; what it caught, as an error.
  const say = (level: 'info' | 'error', text: string, ms?: number): void => {
    toasts.show({ level, message: text, ...(ms === undefined ? {} : { ms }) });
    log(level, text);
  };
  const failed = (text: string): void => say('error', text);

  // The inspector follows the active tab's table, or none (its empty text).
  const inspector = connectInspector(parts.inspector, null, { variableEditor: editor, empty: parts.inspectorEmpty });
  inspector.on('navigate', (target) => {
    if (tabs.active) void navigate(tabs.active, parseLinkTarget(target));
  });
  // The folder in the Explorer (shownFolder.ts, below): its hierarchy; a chosen file opens as a tab.
  const folderNow = (): FolderView | undefined => folders.current;
  // A table is ruled as Settings says when it is made (popovers, below, is there before any file is read).
  const wiring = { host, editor, menu, dialog, folder: folderNow, tableStyle: () => popovers.tableStyle() };

  const popovers = connectPopovers(shell, parts, {
    store: pageStorage(),
    key: `${key}:settings`,
    system: options.systemTheme ?? systemThemeFromMedia(),
    appName,
    about: options.about ?? [],
    tables: () => tabs.items.flatMap((t) => (t.table ? [t.table] : [])),
  });
  stops.push(() => popovers.dispose());

  // The shell's confirm dialog, one question at a time (questions.ts), for a host with none.
  const questions = inPageQuestions(confirm, () => popovers.closeAll());
  // The host's own questions where it has them, the in-page ones where it has none, each reload
  // answer said in the Log.
  const { confirmClose, confirmReload } = shellPrompts<OpenTab>(host, questions, { open: (tab) => isOpen(tab), log });
  const isOpen = (tab: OpenTab): boolean => !disposed && tabs.items.includes(tab);

  // --- Painting ----------------------------------------------------------------------------------

  /** The place the user is now: the active tab and its selection's first row, or Root. */
  const here = (): ShellPlace => {
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
      if (!tab) return false;
      activate(tab);
      if (place.rowId === null) clearSelection(tab);
      else tab.handle?.select([place.rowId]);
      return true;
    },
  });
  const visit = (): void => nav.visit();

  // The inspector and the folder's tree follow the active tab.
  const follow = () => {
    inspector.follow(tabs.active?.handle ?? null);
    if (tabs.active) folderNow()?.reveal(sourceUri(tabs.active.path));
  };

  function paint(): void {
    const active = tabs.active;
    strip.tabs = tabs.items.map(docTabOf);
    strip.active = active?.id ?? '';
    for (const tab of tabs.items) tab.panel.hidden = tab !== active;
    // Root: the relationship graph while files are open, the welcome while none is.
    docs.welcome = tabs.items.length === 0;
    parts.graphPanel.hidden = !!active || tabs.items.length === 0;
    docs.canOpenFolder = !!host.pickFolder;
    const title = active ? `${active.dirty ? '● ' : ''}${active.name} — ${appName}` : appName;
    if (host.setTitle) host.setTitle(title);
    else document.title = title;
    // The window's edited mark (macOS), and the host's cue to ask before it closes.
    host.setEdited?.(tabs.items.some((t) => t.dirty));
    status.textContent = statusOf(active);
    later();
  }

  // What follows the active table's selection and source (the toolbar's buttons, the Explorer, the
  // location bar) is drawn a microtask after whatever changed: TableHandle.can has no event of its
  // own, and is asked again once the table has heard the change too.
  let pending = false;
  function later(): void {
    if (pending || disposed) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!disposed) refresh();
    });
  }

  // What the toolbar's buttons, and the palette's rows for them, can do now.
  const toolbarState = (): ToolbarState => toolbarStateOf(tabs.active, tabs.items, !!host.pickFolder, onMac());

  function refresh(): void {
    const active = tabs.active;
    toolbar.items = toolbarItems(toolbarState());
    explorer.files = explorerFiles(tabs.items.map((t) => ({ id: t.id, path: t.path, name: t.name, dirty: t.dirty, rows: t.handle?.view?.rows })));
    // The rows the active table holds now: its paint, the entries repainted since, the children
    // it was answered; none for a project page or a file still being read.
    const rows = active?.table?.rows ?? [];
    const rowId = here().rowId;
    const section = active && rowId !== null ? sectionOf(rows, rowId) : undefined;
    explorer.selected = active ? { fileId: active.id, ...(section ? { sectionId: section } : {}) } : { fileId: null };
    const at = locationOf(active ?? null, rowId, (id) => rowIn(rows, id), explorer.rootLabel);
    nav.located(at);
    location.segments = at.segments;
    location.canBack = nav.canBack;
    location.canForward = nav.canForward;
    location.canUp = nav.canUp;
    modules.refresh();
    graph.refresh();
    // A tab opened, closed, saved or reloaded since: the Usage it answers is owed to the others.
    if (!folderNow()) openUsage.changed();
  }

  // Another tab is the active one (or none, at Root): the variable editor was the last one's, and
  // everything that follows the active tab follows this one; the user has been here.
  function shown(): void {
    editor.close();
    paint();
    follow();
    visit();
  }

  function activate(tab: OpenTab): void {
    if (tabs.activate(tab)) shown();
  }

  // The Explorer's Root: no document shown, the tabs kept.
  function showRoot(): void {
    if (tabs.deactivate()) shown();
  }

  function pin(tab: OpenTab): void {
    if (!tab.preview) return;
    tab.preview = false;
    paint();
  }

  // --- Saving and closing ------------------------------------------------------------------------

  // Save writes over the file, Save As where the user says, which the tab then shows. A save
  // that cannot be made says why.
  const saver = new Saver(host);
  const saved = (name: string) => say('info', `Saved ${name}`, 2000);
  async function save(tab: OpenTab, as = false, fromCommand = false): Promise<boolean> {
    // The Terminal's lines before it are the document's first: an edit one made went to the source,
    // with no cell editor for commitEdit to wait on. (The Terminal's own `save` is one of them.)
    if (!fromCommand) await modules.idle();
    // A cell editor still open holds what the user typed: the save takes it.
    await tab.handle?.commitEdit();
    const writes = as || !!tab.doc?.dirty;
    const result = await saver.save(tab, as);
    // Another program wrote the file after the save: the user's file is the document, not the disk's.
    // Asked, and answered before the save counts: kept, the document is unsaved again, so a close
    // that saved first does not go on.
    if (result.kind === 'saved' && result.overwritten) {
      await reloads.changedOnDisk(tab, true, true);
      return !tab.doc?.dirty;
    }
    if (result.kind === 'saved' && writes) saved(tab.name);
    if (result.kind === 'saved-as') {
      close(tab);
      saved((await open(result.path)).name);
    } else if (result.kind === 'not-saved' && result.error) {
      log('error', `Could not save ${tab.name}: ${result.error}`);
      // The Terminal says why itself, on its own line.
      if (fromCommand) throw new Error(result.error);
      popovers.closeAll();
      dialog.show({ title: `Could Not Save ${tab.name}`, reason: result.error });
    }
    return result.kind !== 'not-saved';
  }

  // A tab with unsaved edits closes once the user says to save them (and they are) or discard them.
  // An edit a Terminal line still running makes is one too, as it is for a save.
  async function requestClose(tab: OpenTab): Promise<void> {
    await modules.idle();
    // What a cell editor still open holds is an unsaved edit too.
    await tab.handle?.commitEdit();
    if ((await settle([tab], confirmClose, (t) => save(t))) && tabs.items.includes(tab)) close(tab);
  }

  // A tab's listeners, table and document let go, and the host told its file is closed.
  function release(tab: OpenTab): void {
    for (const stop of tab.stops.splice(0)) stop();
    tab.handle?.dispose();
    tab.doc?.dispose();
    host.closeFile?.(tab.path);
  }

  function close(tab: OpenTab): void {
    release(tab);
    tab.panel.remove();
    const wasActive = tab === tabs.active;
    tabs.remove(tab);
    // Back must not land on a place that went with the tab, nor a question stay up about it.
    nav.forget(tab.id);
    questions.recheck();
    if (wasActive) shown();
    else paint();
  }

  // --- Opening -----------------------------------------------------------------------------------

  /**
   * Open the file at `path` in a tab, or go to its tab. `preview`: the file is only being looked at
   * (a click in the folder's tree, a search pick, a link), so it takes the place of the preview tab
   * there is, unless that one holds edits; a file opened for good is kept, and so is its tab when
   * it was a preview.
   */
  async function open(path: string, how: { preview?: boolean } = {}): Promise<OpenTab> {
    // A file by its uri, as the workspace knows it: on Windows the folder's tree and a link spell
    // the path File > Open gave (`C:\work\x.sldd`) as `c:\work\x.sldd` and `C:\work/x.sldd`.
    const uri = sourceUri(path);
    const existing = tabs.find((t) => sourceUri(t.path) === uri);
    if (existing) {
      if (!how.preview) pin(existing);
      activate(existing);
      // Still being read: what the caller does next (select a link's row) needs its table.
      await existing.ready;
      return existing;
    }
    const replaced = how.preview ? tabs.find((t) => !!t.preview && !t.dirty) : undefined;
    const at = replaced ? tabs.items.indexOf(replaced) : -1;
    // Its neighbour is active only until the new tab is: no place the user went to.
    if (replaced) nav.quietly(() => close(replaced));
    const panel = document.createElement('section');
    panel.className = 'doc-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.dataset.path = path;
    docs.append(panel);
    // A project's tab by the name its row in the folder has: every TOML project's file is matlab.toml.
    const name = isProjectFile(path) ? projectFallbackName(path) : basenameOf(path);
    const tab: OpenTab = { id: `tab-${++nextId}`, path, name, panel, preview: !!how.preview, selection: [], stops: [], ready: Promise.resolve() };
    tabs.add(tab);
    if (at >= 0) tabs.move(tab, at);
    shown();
    tab.ready = load(tab, uri);
    await tab.ready;
    return tab;
  }

  // Read the file of a tab just added and show it: on its page, a project; in a table connected to
  // its document, any other file; and in the table's banner why it could not be.
  async function load(tab: OpenTab, uri: string): Promise<void> {
    const { path } = tab;
    if (isProjectFile(path)) return showProject(tab, { host, folder: folderNow, open: (to) => open(to, { preview: true }), log });
    const storageKey = `${key}:${uri}`;
    try {
      const bytes = await host.readFile(path);
      // The shell was taken down meanwhile, and the host told of every file it had open.
      if (disposed) return;
      // Closed while its file was read: nothing to open. The host began watching the file after the
      // read, past the close it heard, so it is told again, unless a tab opened since holds the file
      // (by its uri: another spelling of the path is the same file).
      if (!tabs.items.includes(tab)) {
        if (!tabs.find((t) => sourceUri(t.path) === uri)) host.closeFile?.(path);
        return;
      }
      const doc = await ws.open(bytes, tab.name, uri);
      if (disposed || !tabs.items.includes(tab)) {
        doc.dispose();
        return;
      }
      tab.doc = doc;
      tab.bytes = bytes;
      tab.stops.push(
        doc.onDirty((dirty) => {
          tab.dirty = dirty;
          // An edit keeps a preview tab: it is not the user's to lose by looking at another file.
          if (dirty) tab.preview = false;
          paint();
        }),
      );
      const handle = connectDocument(tab, doc, storageKey, wiring);
      // Where the document's undo stack stands: the toolbar's Undo and Redo move with it, whether or
      // not its table changes (a reload of the text it already held empties the stack).
      const history = isEditable(doc.table) ? doc.table.history : undefined;
      if (history) tab.stops.push(history.onChange(() => later()));
      tab.stops.push(
        handle.on('navigate', ({ link, uri: to }) => void navigate(tab, link, to)),
        handle.on('select', (rowIds) => {
          tab.selection = rowIds;
          if (tab === tabs.active) visit();
          later();
        }),
        handle.on('copyFailed', (failure) => log('error', `Could not copy: ${failure.message}`)),
        // What Copy, Cut, Paste and Delete did, from the toolbar, a chord or the menu, said briefly.
        handle.on('ran', (run) => {
          const note = ranNote(run);
          if (note) say('info', note, 2000);
        }),
        // Show in Graph: Root, what the row stands for (its item, the file it names, the file's box) brought forward.
        handle.on('action', ({ actionId, rowId }) => {
          if (actionId !== SHOW_IN_GRAPH.id) return;
          showRoot();
          graph.showRow(uri, tab.table?.rows ?? [], rowId);
        }),
        // For the toolbar, the Explorer and the Gallery: each whole paint, the first too (which no
        // change may follow), and any change at all. What the document refused, and why, is a line
        // of the Log, past the dialog that said it. (Its `error` changes are its banner's, and what
        // failed is said where it failed: the workspace's notice, a read, a save.)
        handle.on('painted', () => later()),
        doc.table.subscribe((change) => {
          if (change.kind === 'refused') log('warning', `${change.title}: ${change.reason}`);
          else if (change.kind === 'invalid') log('warning', change.reason);
          later();
        }),
      );
      if (tab === tabs.active) follow();
      later();
      log('info', `Opened ${tab.name}`);
    } catch (err) {
      if (disposed) return;
      const table = tab.table ?? newTable(tab, storageKey, false, popovers.tableStyle());
      table.banners = { error: `Failed to open ${tab.name}: ${message(err)}` };
      log('error', table.banners.error!);
    }
  }

  // A file a folder's tree, a search or the Search view picked: as a preview, on the row `name`
  // names, if it names one.
  function openOn(uri: string, name?: string): void {
    void open(uriPath(uri), { preview: true }).then((tab) => {
      if (name !== undefined) tab.handle?.selectByName(name);
    });
  }

  // A link into another file: open it (or go to its tab) and select the row it names. `uri` is
  // the file the folder's tree shows for it, when a folder is shown.
  async function navigate(from: OpenTab, link: LinkTarget, uri?: string): Promise<void> {
    const to = linkDestination(link, from.path);
    const tab = await open(uri ? uriPath(uri) : to.path, { preview: true });
    if (to.select) tab.handle?.selectByName(to.select);
  }

  function openPaths(paths: readonly string[]): Promise<void> {
    // In order, so the last one named ends up active.
    return paths.reduce<Promise<unknown>>((prev, p) => prev.then(() => (disposed ? undefined : open(p))), Promise.resolve()).then(() => undefined);
  }

  // --- Files changed on disk ---------------------------------------------------------------------

  // A reload unasked, or one that failed, said in the Log once it is done (an answer is said as given).
  const reloads = new ReloadGate<OpenTab>({
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
  function command(id: ShellCommand): void {
    if (disposed) return;
    // The tab active when the command was given, whatever is active by the time it is carried out.
    const tab = tabs.active;
    if (id === 'settings' || id === 'about') return popovers.toggle(id);
    // The palette, as its own modal: the popovers make way first, one Escape closing one layer;
    // none over another modal, whose keys are its own, until one stack keeps their order (F2).
    if (id === 'palette') {
      if (parts.modalOpen()) return;
      popovers.closeAll();
      return parts.palette.show(paletteCommands(toolbarState()));
    }
    const view = viewOfCommand(id);
    if (view) {
      // A view brought forward; one with a box of its own (Search, the Terminal) takes the keyboard.
      modules.show(view.view);
      return later();
    }
    if ((id === 'undo' || id === 'redo') && focusIsInTextField()) return void document.execCommand(id);
    // A toolbar press takes no focus, so a cell editor still open is open now: what it holds is
    // the document's before anything acts on it.
    void Promise.resolve(tab?.handle?.commitEdit()).then(() => {
      if (!disposed) carryOut(id, tab, carrying);
    });
  }
  // What the document commands are carried out with (carryOut.ts).
  const carrying: CarryOutContext = { host, tabs, nav, openPaths, save, close: (tab) => void requestClose(tab), shown, later, failed };

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
    async save(tab) {
      if (await save(tab, false, true)) return `Saved ${tab.name}.`;
      throw new Error(`${tab.name} was not saved.`);
    },
    failed,
    later,
  });
  stops.push(() => modules.dispose());

  // Root's relationship graph (graphPane.ts), over the tabs' bytes and the folder's files.
  const graph = connectGraphPane(parts.graph, {
    tabs: () => tabs.items,
    folder: folderNow,
    shown: () => !disposed && !tabs.active && tabs.items.length > 0,
    open: openOn,
    notOpen: (ref) => say('info', `${ref} is not open`),
    failed,
  });
  stops.push(() => graph.dispose());

  // --- The parts' requests -----------------------------------------------------------------------

  // Each part's request (requests.ts), a tab named by its id.
  stops.push(
    connectRequests(shell, parts, {
      command,
      tabOf: (id) => tabs.find((t) => t.id === id),
      activate,
      close: (tab) => void requestClose(tab),
      save: (tab, as) => void save(tab, as),
      pin,
      move: (tab, index) => tabs.move(tab, index) && paint(),
      showRoot,
      toStep(index) {
        nav.toStep(index);
        later();
      },
      toggle: (id, anchor) => popovers.toggle(id, anchor),
      viewChanged(view, open) {
        // A view the user shows by its button or its chord takes the keyboard as its command gives
        // it, and shows what it would have shown meanwhile.
        if (open && view) modules.shown(view);
        later();
      },
    }),
  );

  stops.push(installKeys(command, { nativeMenu: options.nativeMenu }));

  // --- The folder --------------------------------------------------------------------------------

  // Every open table is painted again, its Usage filled from the folder shown, and every
  // project's page from its store, again when the folder says its marker changed (a matlab.toml
  // saved). The graph draws the folder's files.
  const folders = connectShownFolder(folderPart, tree, {
    open: openOn,
    shown(shown) {
      log('info', `Showing the folder ${shown.root}`);
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
    failed: (text) => log('error', `This folder could not be read: ${text}`),
  });

  // Nothing is open yet, and nowhere has been visited: the history starts at the first file.
  paint();
  follow();

  return {
    openPaths: (paths) => (disposed ? Promise.resolve() : openPaths(paths)),
    showFolder(root, port) {
      if (!disposed) folders.show(root, port);
    },
    fileChanged(path) {
      // By its uri, as open() finds a file's tab: a watcher may spell the path otherwise.
      const uri = sourceUri(path);
      const tab = disposed ? undefined : tabs.find((t) => sourceUri(t.path) === uri);
      // A clean document takes the disk's file without asking; one with edits is asked first.
      if (tab?.doc) void reloads.changedOnDisk(tab, tab.doc.dirty);
    },
    command,
    async requestClose() {
      if (disposed) return true;
      await modules.idle();
      await Promise.all(tabs.items.map((t) => t.handle?.commitEdit()));
      return settle(tabs.items, confirmClose, (t) => save(t));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of stops.splice(0)) stop();
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
