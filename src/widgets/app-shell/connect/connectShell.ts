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
// The rules themselves are the modules beside this one; this file orchestrates. Three of them
// are pieces of it moved out: what it builds (parts.ts), a tab's document and the widgets it is
// shown in (documents.ts), and the settings and popovers (popovers.ts).

import { parseLinkTarget, type LinkTarget } from '../../../model/ids/linkTarget.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { createWorkspace } from '../../../model/source/workspace.js';
import { NavHistory } from '../../../model/shell/navHistory.js';
import { basenameOf, isProjectFile, isSupportedPath, projectFallbackName } from 'data-explorer-core';
import type { ProjectOpenDetail } from '../../project-page/dex-project-page.js';
import { connectInspector } from '../../property-inspector/connectInspector.js';
import type { DexAppShell } from '../dex-app-shell.js';
import {
  clearSelection,
  connectDocument,
  docTabOf,
  keepRows,
  newProjectPage,
  newTable,
  paintProject,
  rowIn,
  sectionOf,
  statusOf,
  type OpenTab,
} from './documents.js';
import { explorerFiles } from './explorerFiles.js';
import { showFolder, type FolderView } from './folder.js';
import { installSearch } from './folderSearch.js';
import { installKeys, onMac } from './keys.js';
import { linkDestination, projectLinkPath } from './links.js';
import { locationOf, samePlace, type LocationStep, type ShellPlace } from './location.js';
import { buildShell } from './parts.js';
import { connectPopovers, pageStorage } from './popovers.js';
import { ReloadGate, reloadQuestion } from './reload.js';
import { Saver, closeAnswerOf, closeQuestion, settle } from './saving.js';
import { TabList } from './tabs.js';
import { systemThemeFromMedia } from './theme.js';
import { tableActionOf, toolbarItems } from './toolbarItems.js';
import type { CloseAnswer, ConnectShellOptions, ShellCommand, ShellHandle } from './types.js';

const COMMANDS: ReadonlySet<string> = new Set<ShellCommand>([
  'open-file', 'open-folder', 'save', 'save-as', 'save-all', 'close-tab', 'undo', 'redo', 'add-child', 'cut', 'copy',
  'paste', 'delete', 'next-tab', 'previous-tab', 'focus-filter', 'back', 'forward', 'up', 'settings', 'about',
]);

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Whether the focus, inside the widgets' shadow roots too, is in a field that takes text: for the
 * Edit menu's items, which come with no key event for view's isTypingInField(event) to read.
 */
function typingInField(): boolean {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el instanceof HTMLElement && el.isContentEditable);
}

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
  const parts = buildShell(shell, { appName, canOpenFolder: !!host.pickFolder });
  const { toolbar, location, explorer, folderPart, tree, docs, strip, status, editor, menu, dialog, confirm, toasts } = parts;

  let disposed = false;
  const stops: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(target: HTMLElement, type: K, listener: (e: HTMLElementEventMap[K]) => void): void => {
    target.addEventListener(type, listener);
    stops.push(() => target.removeEventListener(type, listener));
  };

  const tabs = new TabList<OpenTab>();
  let nextId = 0;
  // The Usage column is filled from the shown folder's session (ws.setUsage when one is shown).
  // Its documents share one clipboard, so a row copied in one tab pastes into another. What a
  // document says the table cannot show is a toast, as it stands.
  const ws = createWorkspace({ editing: true, notify: (notice) => toasts.show(notice) });

  // The inspector follows the active tab's table, or none (its empty text).
  const inspector = connectInspector(parts.inspector, null, { variableEditor: editor, empty: parts.inspectorEmpty });
  inspector.on('navigate', (target) => {
    if (tabs.active) void navigate(tabs.active, parseLinkTarget(target));
  });
  // The folder in the Explorer: its hierarchy; a chosen file opens as a tab.
  let folder: FolderView | undefined;
  const wiring = { host, editor, menu, dialog, folder: () => folder };

  const popovers = connectPopovers(shell, parts, {
    store: pageStorage(),
    key: `${key}:settings`,
    system: options.systemTheme ?? systemThemeFromMedia(),
    appName,
    about: options.about ?? [],
  });
  stops.push(() => popovers.dispose());

  // The host's own questions where it has them; the shell's confirm dialog where it has none.
  const confirmClose = (names: string[]): Promise<CloseAnswer> => {
    if (host.confirmClose) return host.confirmClose(names);
    popovers.closeAll();
    return confirm.show(closeQuestion(names)).then(closeAnswerOf);
  };
  const confirmReload = (name: string): Promise<boolean> => {
    if (host.confirmReload) return host.confirmReload(name);
    popovers.closeAll();
    return confirm.show(reloadQuestion(name)).then((id) => id === 'reload');
  };

  // --- Painting ----------------------------------------------------------------------------------

  // Where the user has been, for Back and Forward; and the location bar's segments and Up as drawn.
  const history = new NavHistory<ShellPlace>(samePlace);
  let restoring = false;
  let steps: LocationStep[] = [];
  let up: ShellPlace | null = null;

  /** The place the user is now: the active tab and its selection's first row, or Root. */
  const here = (): ShellPlace => {
    const active = tabs.active;
    return active ? { tabId: active.id, rowId: active.selection[0] ?? null } : { tabId: null, rowId: null };
  };
  const visit = (): void => {
    if (!restoring) history.visit(here());
  };

  // The inspector and the folder's tree follow the active tab.
  const follow = () => {
    inspector.follow(tabs.active?.handle ?? null);
    if (tabs.active) folder?.reveal(sourceUri(tabs.active.path));
  };

  function paint(): void {
    const active = tabs.active;
    strip.tabs = tabs.items.map(docTabOf);
    strip.active = active?.id ?? '';
    for (const tab of tabs.items) tab.panel.hidden = tab !== active;
    docs.welcome = !active;
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

  function refresh(): void {
    const active = tabs.active;
    toolbar.items = toolbarItems({
      canOpenFolder: !!host.pickFolder,
      active: active ? { editable: !!active.doc?.editable, dirty: !!active.dirty } : null,
      anyDirty: tabs.items.some((t) => t.dirty),
      can: (id) => !!active?.handle?.can(id),
      mac: onMac(),
    });
    explorer.files = explorerFiles(tabs.items.map((t) => ({ id: t.id, path: t.path, name: t.name, dirty: t.dirty, rows: t.handle?.view?.rows })));
    const rowId = here().rowId;
    const section = active && rowId !== null ? sectionOf(active, rowId) : undefined;
    explorer.selected = active ? { fileId: active.id, ...(section ? { sectionId: section } : {}) } : { fileId: null };
    const at = locationOf(active ?? null, rowId, (id) => (active ? rowIn(active, id) : undefined), explorer.rootLabel);
    steps = at.segments;
    up = at.up;
    location.segments = steps;
    location.canBack = history.canBack;
    location.canForward = history.canForward;
    location.canUp = up !== null;
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

  // Go to a place of the history or the location bar: its tab and its row, or Root. The moves
  // themselves are no visits; `visitIt` makes the place one (Up, a segment), and Back and Forward,
  // which move along the history, do not.
  function goTo(place: ShellPlace, visitIt: boolean): void {
    const tab = place.tabId === null ? undefined : tabs.find((t) => t.id === place.tabId);
    if (place.tabId !== null && !tab) return;
    restoring = true;
    try {
      if (!tab) showRoot();
      else {
        activate(tab);
        if (place.rowId === null) clearSelection(tab);
        else tab.handle?.select([place.rowId]);
      }
    } finally {
      restoring = false;
    }
    if (visitIt) history.visit(place);
    later();
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
  const saved = (name: string) => toasts.show({ level: 'info', message: `Saved ${name}`, ms: 2000 });
  async function save(tab: OpenTab, as = false): Promise<boolean> {
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
      popovers.closeAll();
      dialog.show({ title: `Could Not Save ${tab.name}`, reason: result.error });
    }
    return result.kind !== 'not-saved';
  }

  // A tab with unsaved edits closes once the user says to save them (and they are) or discard them.
  async function requestClose(tab: OpenTab): Promise<void> {
    // What a cell editor still open holds is an unsaved edit too.
    await tab.handle?.commitEdit();
    if ((await settle([tab], confirmClose, (t) => save(t))) && tabs.items.includes(tab)) close(tab);
  }

  function close(tab: OpenTab): void {
    for (const stop of tab.stops.splice(0)) stop();
    tab.handle?.dispose();
    tab.doc?.dispose();
    host.closeFile?.(tab.path);
    tab.panel.remove();
    const wasActive = tab === tabs.active;
    tabs.remove(tab);
    // Back must not land on a place that went with the tab.
    history.prune((place) => place.tabId !== tab.id);
    if (wasActive) shown();
    else paint();
  }

  // --- Opening -----------------------------------------------------------------------------------

  // A link on a project's page: a file this app shows opens in a tab (a project on its page), a
  // component row opens the project in its folder, and the rest (a folder, a script) is shown in
  // the OS file manager.
  async function followProjectLink(root: string, link: ProjectOpenDetail): Promise<void> {
    const path = projectLinkPath(root, link.path);
    const project = link.preferProject ? await folder?.projectIn(path) : undefined;
    if (project) await open(uriPath(project), { preview: true });
    else if (isSupportedPath(path)) await open(path, { preview: true });
    else await host.reveal?.(path);
  }

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
      return existing;
    }
    const replaced = how.preview ? tabs.find((t) => !!t.preview && !t.dirty) : undefined;
    const at = replaced ? tabs.items.indexOf(replaced) : -1;
    if (replaced) {
      // Its neighbour is active only until the new tab is: no place the user went to.
      restoring = true;
      try {
        close(replaced);
      } finally {
        restoring = false;
      }
    }
    const panel = document.createElement('section');
    panel.className = 'doc-panel';
    panel.setAttribute('role', 'tabpanel');
    panel.dataset.path = path;
    docs.append(panel);
    // A project's tab by the name its row in the folder has: every TOML project's file is matlab.toml.
    const name = isProjectFile(path) ? projectFallbackName(path) : basenameOf(path);
    const tab: OpenTab = { id: `tab-${++nextId}`, path, name, panel, preview: !!how.preview, selection: [], rows: new Map(), stops: [] };
    tabs.add(tab);
    if (at >= 0) tabs.move(tab, at);
    shown();
    if (isProjectFile(path)) {
      const revealIn = host.revealIn ?? (onMac() ? 'Finder' : 'the file manager');
      await paintProject(tab, newProjectPage(tab, revealIn, followProjectLink), folder);
      return tab;
    }
    const storageKey = `${key}:${uri}`;
    try {
      const bytes = await host.readFile(path);
      // The shell was taken down meanwhile, and the host told of every file it had open.
      if (disposed) return tab;
      // Closed while its file was read: nothing to open. The host began watching the file after the
      // read, past the close it heard, so it is told again, unless a tab opened since holds the file.
      if (!tabs.items.includes(tab)) {
        if (!tabs.find((t) => t.path === path)) host.closeFile?.(path);
        return tab;
      }
      const doc = await ws.open(bytes, tab.name, uri);
      if (disposed || !tabs.items.includes(tab)) {
        doc.dispose();
        return tab;
      }
      tab.doc = doc;
      tab.stops.push(
        doc.onDirty((dirty) => {
          tab.dirty = dirty;
          // An edit keeps a preview tab: it is not the user's to lose by looking at another file.
          if (dirty) tab.preview = false;
          paint();
        }),
      );
      const handle = connectDocument(tab, doc, storageKey, wiring);
      tab.stops.push(
        handle.on('navigate', ({ link, uri: to }) => void navigate(tab, link, to)),
        handle.on('select', (rowIds) => {
          tab.selection = rowIds;
          if (tab === tabs.active) visit();
          later();
        }),
        // The rows it sends, for the location bar; and, for the toolbar, any change at all (an
        // edit, the clipboard, a repaint).
        doc.table.subscribe((change) => {
          keepRows(tab, change);
          later();
        }),
      );
      if (tab === tabs.active) follow();
      later();
    } catch (err) {
      if (disposed) return tab;
      const table = tab.table ?? newTable(tab, storageKey);
      table.banners = { error: `Failed to open ${tab.name}: ${message(err)}` };
    }
    return tab;
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

  const reloads = new ReloadGate<OpenTab>({
    read: (path) => host.readFile(path),
    confirm: confirmReload,
    isOpen: (tab) => tabs.items.includes(tab),
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
    if ((id === 'undo' || id === 'redo') && typingInField()) {
      document.execCommand(id);
      return;
    }
    // A toolbar press takes no focus, so a cell editor still open is open now: what it holds is
    // the document's before anything acts on it.
    void Promise.resolve(tab?.handle?.commitEdit()).then(() => {
      if (!disposed) carryOut(id, tab);
    });
  }

  function carryOut(id: ShellCommand, tab: OpenTab | undefined): void {
    const action = tableActionOf(id);
    if (action && action !== 'undo' && action !== 'redo') {
      tab?.handle?.run(action);
      return;
    }
    switch (id) {
      case 'open-file':
        void host.pickFiles().then(openPaths);
        break;
      case 'open-folder':
        void host.pickFolder?.();
        break;
      case 'save':
      case 'save-as':
        if (tab) void save(tab, id === 'save-as');
        break;
      case 'save-all':
        void tabs.items.filter((t) => t.dirty).reduce<Promise<unknown>>((prev, t) => prev.then(() => save(t)), Promise.resolve());
        break;
      case 'close-tab':
        if (tab) void requestClose(tab);
        break;
      case 'undo':
      case 'redo':
        tab?.handle?.[id]();
        break;
      case 'next-tab':
      case 'previous-tab':
        tabs.cycle(id === 'next-tab' ? 1 : -1);
        shown();
        break;
      case 'focus-filter':
        tab?.table?.focusFilter();
        break;
      case 'back':
      case 'forward': {
        const place = id === 'back' ? history.back() : history.forward();
        if (place) goTo(place, false);
        break;
      }
      case 'up':
        if (up) goTo(up, true);
        break;
    }
  }

  // --- The parts' requests -----------------------------------------------------------------------

  const tabOf = (id: string | null | undefined) => (id ? tabs.find((t) => t.id === id) : undefined);
  const asked = (id: string): void => {
    if (COMMANDS.has(id)) command(id as ShellCommand);
  };
  // The toolbar, and the welcome's buttons, which ask what the toolbar's Open and Folder ask.
  listen(toolbar, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(docs, 'dex-toolbar-action', (e) => asked(e.detail.actionId));
  listen(shell, 'dex-shell-action', (e) => {
    const { actionId, anchor } = e.detail;
    if (actionId === 'settings' || actionId === 'about') popovers.toggle(actionId, anchor);
  });
  listen(strip, 'dex-tab-select', (e) => {
    const tab = tabOf(e.detail.id);
    if (tab) activate(tab);
  });
  listen(strip, 'dex-tab-close', (e) => {
    const tab = tabOf(e.detail.id);
    if (tab) void requestClose(tab);
  });
  listen(strip, 'dex-tab-pin', (e) => {
    const tab = tabOf(e.detail.id);
    if (tab) pin(tab);
  });
  // The tab's place once moved, as the request means it.
  listen(strip, 'dex-tab-move', (e) => {
    const tab = tabOf(e.detail.id);
    if (tab && tabs.move(tab, e.detail.index)) paint();
  });
  listen(location, 'dex-location-go', (e) => {
    const { to } = e.detail;
    if (typeof to !== 'number') return command(to);
    const step = steps[to];
    if (step) goTo(step.place, true);
  });
  listen(explorer, 'dex-explorer-open', (e) => {
    const { fileId, sectionId, pin: keep } = e.detail;
    if (fileId === null) return showRoot();
    const tab = tabOf(fileId);
    if (!tab) return;
    if (keep) pin(tab);
    activate(tab);
    if (sectionId !== undefined) tab.handle?.select([sectionId]);
  });

  // A file's menu in the Explorer: the shared context menu, with Save, Save As and Close for that
  // file. Acted on by its next choice only: a dismissal, or the menu shown again by a table, ends it.
  let menuFor: OpenTab | null = null;
  listen(explorer, 'dex-explorer-menu', (e) => {
    const tab = tabOf(e.detail.fileId);
    if (!tab) return;
    const editable = !!tab.doc?.editable;
    menu.show(e.detail.x, e.detail.y, [
      { id: 'save', label: 'Save', icon: 'saved', disabled: !(editable && tab.dirty) },
      { id: 'save-as', label: 'Save As…', icon: 'saveAs', disabled: !editable },
      { id: '', label: '', separator: true },
      { id: 'close-tab', label: 'Close', icon: 'close' },
    ]);
    menuFor = tab;
  });
  listen(menu, 'dex-action', (e) => {
    const tab = menuFor;
    menuFor = null;
    if (!tab || !tabs.items.includes(tab)) return;
    const id = e.detail.actionId;
    if (id === 'save' || id === 'save-as') void save(tab, id === 'save-as');
    else if (id === 'close-tab') void requestClose(tab);
  });
  listen(menu, 'dex-menu-closed', () => (menuFor = null));

  stops.push(installKeys(command, { nativeMenu: options.nativeMenu }));

  // --- The folder --------------------------------------------------------------------------------

  const search = installSearch(
    folderPart.searchInput,
    folderPart.searchResults,
    tree,
    () => folder?.session.names,
    (uri, name) => void open(uriPath(uri), { preview: true }).then((tab) => tab.handle?.selectByName(name)),
  );

  function showFolderIn(root: string, port: MessagePort): void {
    folder?.dispose();
    folderPart.hidden = false;
    folderPart.root = root;
    folderPart.note = '';
    let note = 'No data files in this folder.';
    folder = showFolder(tree, root, port, {
      empty: (isEmpty) => (folderPart.note = isEmpty ? note : ''),
      open: (uri) => void open(uriPath(uri), { preview: true }),
      error: (text) => {
        note = `This folder could not be read: ${text}`;
        folderPart.note = note;
      },
    });
    // Every open table is painted again, its Usage filled from this folder, and every project's
    // page from its store, again when the folder says its marker changed (a matlab.toml saved).
    void ws.setUsage(folder.session.usage, folder.session.reposts);
    const shown = folder;
    const repaint = (uris?: readonly string[]) => {
      for (const t of tabs.items) {
        if (t.page && (!uris || uris.includes(sourceUri(t.path)))) void paintProject(t, t.page, shown);
      }
    };
    folder.onChange(repaint);
    repaint();
    // The search reads the folder's names again each time the folder takes a change: its tree is
    // built again once its names are read again.
    folder.session.hierarchy.subscribe(() => search.reset());
    search.reset();
    follow();
  }

  // Nothing is open yet, and nowhere has been visited: the history starts at the first file.
  paint();
  follow();

  return {
    openPaths: (paths) => (disposed ? Promise.resolve() : openPaths(paths)),
    showFolder(root, port) {
      if (!disposed) showFolderIn(root, port);
    },
    fileChanged(path) {
      const tab = disposed ? undefined : tabs.find((t) => t.path === path);
      if (tab?.doc) void reloads.changedOnDisk(tab, tab.doc.dirty);
    },
    command,
    async requestClose() {
      if (disposed) return true;
      await Promise.all(tabs.items.map((t) => t.handle?.commitEdit()));
      return settle(tabs.items, confirmClose, (t) => save(t));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const stop of stops.splice(0)) stop();
      search.dispose();
      for (const tab of [...tabs.items]) {
        for (const stop of tab.stops.splice(0)) stop();
        tab.handle?.dispose();
        tab.doc?.dispose();
        host.closeFile?.(tab.path);
      }
      folder?.dispose();
      folder = undefined;
      inspector.dispose();
      ws.dispose();
      parts.remove();
    },
  };
}
