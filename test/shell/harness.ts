// Copyright 2026 The MathWorks, Inc.
//
// The app under test: an empty <dex-app-shell> in the page, every element the shell is built from
// defined (defineShellWidgets, and nothing else), and connectShell() over an in-memory ShellHost.
// Files are bytes in a map; what the shell asks of its host (saves, Save As, the prompts, the
// window's edited mark, the clipboard) is recorded and answered here. A folder is served to it as
// the Electron app's main process serves one: core's node readers through serveFolder, across a
// MessageChannel of the page's own.
//
// Ported from data-explorer-app's test/unit/page/harness.ts, whose page tests the ones beside this
// are: the same files, the same helpers, the DOM queries moved from the app's index.html to the
// shell's parts (the tab row is <dex-doc-tabs>'s shadow root, the welcome <dex-shell-docs>'s, the
// notice line the toast host's, the open files' list the Explorer's).
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { listFolder, nodeSourceReader, readProjectStoreFromDisk } from 'data-explorer-core/node/folder';
import { createWorkspace } from '../../src/model/source/workspace.js';
import { isEditable } from '../../src/model/source/tableSource.js';
import { portFromMessagePort } from '../../src/model/source/ports.js';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { listedFiles, serveFolder, type FolderReads } from '../../src/serve/index.js';
import type { DexTreeTable } from '../../src/widgets/tree-table/dex-tree-table.js';
import type { DexAppShell } from '../../src/widgets/app-shell/dex-app-shell.js';
import type { DexToolbar } from '../../src/widgets/app-shell/dex-toolbar.js';
import type { DexDocTabs } from '../../src/widgets/app-shell/dex-doc-tabs.js';
import type { DexLocationBar } from '../../src/widgets/app-shell/dex-location-bar.js';
import type { DexExplorer } from '../../src/widgets/app-shell/dex-explorer.js';
import type { DexSettingsPanel } from '../../src/widgets/app-shell/dex-settings-panel.js';
import type { DexAboutPanel } from '../../src/widgets/app-shell/dex-about-panel.js';
import type { DexToastHost } from '../../src/widgets/app-shell/dex-toast-host.js';
import type { DexConfirmDialog } from '../../src/widgets/app-shell/dex-confirm-dialog.js';
import type { DexShellDocs } from '../../src/widgets/app-shell/connect/dex-shell-docs.js';
import type { DexShellStatus } from '../../src/widgets/app-shell/connect/dex-shell-status.js';
import type { DexShellFolder } from '../../src/widgets/app-shell/connect/dex-shell-folder.js';
import type { DexRawViewer } from '../../src/widgets/app-shell/modules/dex-raw-viewer.js';
import type { DexSearchPanel } from '../../src/widgets/app-shell/modules/dex-search-panel.js';
import type { DexGalleryPanel } from '../../src/widgets/app-shell/modules/dex-gallery-panel.js';
import type { DexCommandWindow } from '../../src/widgets/app-shell/modules/dex-command-window.js';
import type { DexLogPanel } from '../../src/widgets/app-shell/modules/dex-log-panel.js';
import type { DexCommandPalette } from '../../src/widgets/app-shell/modules/dex-command-palette.js';
import type { DexRelationshipGraph } from '../../src/widgets/app-shell/modules/dex-relationship-graph.js';
import { connectShell } from '../../src/widgets/app-shell/connect/connectShell.js';
import { defineShellWidgets } from '../../src/widgets/app-shell/defineShellWidgets.js';
import type { CloseAnswer, ConnectShellOptions, ShellCommand, ShellHandle, ShellHost } from '../../src/widgets/app-shell/connect/types.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
export const fixture = (name: string) => path.join(ROOT, 'test/shell/fixtures', name);
/** Where the page's files live: a made-up folder, only ever in `Files`. */
export const at = (name: string) => `/work/${name}`;

// happy-dom (21) throws reading a shadow root's activeElement while the focus is in another
// component's shadow root: it climbs from the focused element's root to the document and asks the
// document for its host. A browser answers null there, which is what the shell's parts read (a
// popover closing asks whether it holds the focus, the Explorer whether its rows do), and the app
// moves the focus between them all the time: into a popover, the confirm dialog, a cell editor.
// Installed for the tests of each file that uses this harness, and put back after them; only that
// throw is turned into null, so any other error of the getter still fails the test.
const shadowActive = Object.getOwnPropertyDescriptor(ShadowRoot.prototype, 'activeElement')!;
beforeAll(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', {
    ...shadowActive,
    get(this: ShadowRoot) {
      try {
        return shadowActive.get!.call(this);
      } catch (err) {
        if (err instanceof TypeError && err.message.includes('getRootNode')) return null;
        throw err;
      }
    },
  });
});
afterAll(() => {
  Object.defineProperty(ShadowRoot.prototype, 'activeElement', shadowActive);
});

defineShellWidgets();

/** What the host was asked, and how it answers. */
export interface Main {
  files: Map<string, Uint8Array>;
  saves: { path: string; bytes: Uint8Array }[];
  /** Save As: the path the dialog answers with (null: cancelled), in turn. */
  saveAs: (string | null)[];
  /** The Open File dialog: the paths it answers with, in turn (none: cancelled). */
  picks: string[][];
  /** The Open Folder dialogs asked for. */
  folderPicks: number;
  /** The unsaved-edits prompts asked (their file names), and the answers, in turn. */
  closeAsked: string[][];
  closeAnswers: CloseAnswer[];
  reloadAsked: string[];
  reloadAnswers: boolean[];
  edited: boolean[];
  /** What requestClose() answered, in turn: the window's close, or the app's quit, going on. */
  closedWindow: boolean[];
  /** The files the host was told to stop watching. */
  closedFiles: string[];
  /** The files the host was asked to read, in turn (by its own readFile; a test's replacement records nothing). */
  reads: string[];
  copied: string[];
  revealed: string[];
  /** Make a save fail with this message. */
  failSave?: string;
  /** Tell the shell `path` changed on disk, as the host's watcher does. */
  changed(path: string): void;
}

export interface Page {
  shell: DexAppShell;
  handle: ShellHandle;
  /** The host the shell runs over: replace a member to answer otherwise. */
  host: ShellHost;
  main: Main;
  command(c: ShellCommand): void;
  /** The window is asked to close: requestClose(), its answer recorded in `main.closedWindow`. */
  closeWindow(): void;
}

/** What a test changes about the page: members the host leaves out, and the shell's options. */
export interface PageOptions extends Omit<ConnectShellOptions, 'host'> {
  /** Host members left out: no prompt of its own (the in-page dialogs ask), no folder, no title. */
  without?: (keyof ShellHost)[];
  /** The shell's own storage-key, set before connectShell. */
  shellStorageKey?: string;
}

const pages: Page[] = [];
afterEach(() => {
  for (const page of pages.splice(0)) page.handle.dispose();
  document.body.replaceChildren();
  document.title = '';
  delete document.documentElement.dataset.theme;
  localStorage.clear();
});

export function startPage(files: Record<string, string> = {}, options: PageOptions = {}): Page {
  const main: Main = {
    files: new Map(Object.entries(files).map(([name, from]) => [at(name), new Uint8Array(readFileSync(fixture(from)))])),
    saves: [],
    saveAs: [],
    picks: [],
    folderPicks: 0,
    closeAsked: [],
    closeAnswers: [],
    reloadAsked: [],
    reloadAnswers: [],
    edited: [],
    closedWindow: [],
    closedFiles: [],
    reads: [],
    copied: [],
    revealed: [],
    changed: (p) => page.handle.fileChanged(p),
  };
  const read = (p: string) => {
    main.reads.push(p);
    const bytes = main.files.get(p);
    if (!bytes) return Promise.reject(new Error(`ENOENT: no such file, open '${p}'`));
    return Promise.resolve(bytes.slice());
  };
  const write = (p: string, bytes: Uint8Array) => {
    if (main.failSave) return Promise.reject(new Error(main.failSave));
    main.saves.push({ path: p, bytes: bytes.slice() });
    main.files.set(p, bytes.slice());
    return Promise.resolve();
  };
  const host: ShellHost = {
    pickFiles: async () => main.picks.shift() ?? [],
    pickFolder: async () => void main.folderPicks++,
    readFile: read,
    closeFile: (p) => void main.closedFiles.push(p),
    saveFile: async (p, bytes) => (await write(p, bytes), { overwritten: false }),
    saveFileAs: async (p, bytes) => {
      const to = main.saveAs.shift() ?? null;
      if (to === null) return null;
      await write(to, bytes);
      return { path: to, overwritten: false };
    },
    confirmClose: async (names) => (main.closeAsked.push(names), main.closeAnswers.shift() ?? 'cancel'),
    confirmReload: async (name) => (main.reloadAsked.push(name), main.reloadAnswers.shift() ?? false),
    setEdited: (edited) => void main.edited.push(edited),
    copyText: async (text) => void main.copied.push(text),
    reveal: async (p) => void main.revealed.push(p),
  };
  for (const name of options.without ?? []) delete (host as Partial<ShellHost>)[name];
  const shell = document.createElement('dex-app-shell');
  if (options.shellStorageKey) shell.storageKey = options.shellStorageKey;
  document.body.append(shell);
  const { without: _without, shellStorageKey: _key, ...shellOptions } = options;
  const handle = connectShell(shell, { ...shellOptions, host });
  const page: Page = {
    shell,
    handle,
    host,
    main,
    command: (c) => handle.command(c),
    closeWindow: () => void handle.requestClose().then((ok) => main.closedWindow.push(ok)),
  };
  pages.push(page);
  return page;
}

/** Wait until `ready()` holds, a task at a time. */
export async function until(ready: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${ready}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

/** A few tasks, for what a test expects not to happen. */
export const settled = (ms = 30) => new Promise((r) => setTimeout(r, ms));

// --- The shell's parts ------------------------------------------------------------------------

export const docTabs = () => document.querySelector<DexDocTabs>('dex-doc-tabs')!;
export const toolbar = () => document.querySelector<DexToolbar>('dex-toolbar')!;
export const locationBar = () => document.querySelector<DexLocationBar>('dex-location-bar')!;
export const explorer = () => document.querySelector<DexExplorer>('dex-explorer')!;
export const docsArea = () => document.querySelector<DexShellDocs>('dex-shell-docs')!;
export const folderPart = () => document.querySelector<DexShellFolder>('dex-shell-folder')!;
export const confirmDialog = () => document.querySelector<DexConfirmDialog>('dex-confirm-dialog')!;
export const rawViewer = () => document.querySelector<DexRawViewer>('dex-raw-viewer')!;
export const searchPanel = () => document.querySelector<DexSearchPanel>('dex-search-panel')!;
export const galleryPanel = () => document.querySelector<DexGalleryPanel>('dex-gallery-panel')!;
export const commandWindow = () => document.querySelector<DexCommandWindow>('dex-command-window')!;
export const logPanel = () => document.querySelector<DexLogPanel>('dex-log-panel')!;
export const palette = () => document.querySelector<DexCommandPalette>('dex-command-palette')!;
export const settingsPanel = () => document.querySelector<DexSettingsPanel>('dex-settings-panel')!;
export const aboutPanel = () => document.querySelector<DexAboutPanel>('dex-about-panel')!;
export const toastHost = () => document.querySelector<DexToastHost>('dex-toast-host')!;
/** The shell's activity button of the view or action `id` (its gear is `settings`, its (i) `about`). */
export const activityButton = (shell: DexAppShell, id: string) =>
  shell.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-view="${id}"], button[data-action="${id}"]`);
/** The toolbar's button labelled `label`. */
export const toolbarButton = (label: string) =>
  [...(toolbar()?.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.querySelector('.label')?.textContent === label);
/** The toolbar's items that can be pressed now, by id. */
export const enabledItems = () => toolbar().items.filter((i) => !i.disabled).map((i) => i.id);
export const errorDialog = () => document.querySelector('dex-error-dialog')!;
export const variableEditor = () => document.querySelector('dex-variable-editor')!;
export const inspectorNote = () => document.querySelector<HTMLElement>('.dex-inspector-empty')!;
/** What the status bar says: the file's kind, and `· Modified` while it holds edits (its format's pill is statusBar.test.ts's). */
export const statusText = () => {
  const status = document.querySelector<DexShellStatus>('[slot="status"]');
  return status?.format ? `${status.kind}${status.modified ? ' · Modified' : ''}` : '';
};

const tabEls = () => [...(docTabs()?.shadowRoot?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])];
// A tab by its file's name: its subtitle, while its label names the section its selection is in.
const labelOf = (el: Element) => (el.querySelector('.subtitle') ?? el.querySelector('.label'))?.textContent ?? '';

/** The tab row's tabs, by their files' names. */
export const tabNames = () => tabEls().map(labelOf);
export const activeTab = () => tabEls().find((t) => t.getAttribute('aria-selected') === 'true') ?? null;
export const tabNamed = (name: string) => tabEls().find((t) => labelOf(t) === name);
export const dirtyTabs = () => tabEls().filter((t) => t.classList.contains('dirty')).map(labelOf);
export const previewTabs = () => tabEls().filter((t) => t.classList.contains('preview')).map(labelOf);
/** The id of the tab drawn for `name`: what the tab row's and the Explorer's requests name it by. */
export const tabIdOf = (name: string) => docTabs().tabs.find((t) => (t.subtitle ?? t.label) === name)!.id;

/** The welcome in the documents' area is on screen. */
export const welcomeShown = () => docsArea().shadowRoot?.querySelector<HTMLElement>('.welcome')?.hidden === false;
/** Root's relationship graph, and whether it is on screen (its panel shown). */
export const graph = () => document.querySelector<DexRelationshipGraph>('dex-relationship-graph')!;
export const graphShown = () => !!graph() && !graph().closest('[hidden]');

/** The Explorer's file rows, as drawn: their labels, the unsaved mark among them. */
export const explorerRows = () =>
  [...(explorer()?.shadowRoot?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].map((r) => r.querySelector('.label')?.textContent ?? '');
export const explorerRowOf = (label: string) =>
  [...(explorer()?.shadowRoot?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])].find((r) => r.querySelector('.label')?.textContent === label);

/** The toasts on screen: their texts. */
export const toastTexts = () =>
  [...(document.querySelector('dex-toast-host')?.shadowRoot?.querySelectorAll('.toast .message') ?? [])].map((m) => m.textContent ?? '');

/** The table of the file `name`. */
export const tableOf = (name: string) => document.querySelector<DexTreeTable>(`.doc-panel[data-path="${at(name)}"] dex-tree-table`);

/** The row of `table` named `name`, once its rows have come. */
export async function rowOf(name: string, row: string): Promise<TreeTableRow> {
  let found: TreeTableRow | undefined;
  await until(() => !!(found = tableOf(name)?.rows.find((r) => r.Name?.label === row)));
  return found!;
}

/** The text a row's cell shows. */
export const textOf = (row: TreeTableRow | undefined, key = 'Value') => {
  const cell = (row as Record<string, unknown> | undefined)?.[key];
  return typeof cell === 'object' && cell !== null ? String((cell as { text?: string }).text ?? '') : String(cell ?? '');
};

/** A committed cell edit, as the table sends one. */
export async function edit(name: string, row: string, value: string, key = 'Value'): Promise<void> {
  const r = await rowOf(name, row);
  tableOf(name)!.dispatchEvent(
    new CustomEvent('dex-edit-completed', { detail: { rowId: r.ID, columnId: key, oldValue: textOf(r, key), newValue: value }, bubbles: true, composed: true }),
  );
}

/** Select row `row` of `name`'s table, as a click on it does. */
export async function selectRow(name: string, row: string): Promise<TreeTableRow> {
  const r = await rowOf(name, row);
  const table = tableOf(name)!;
  table.selectedRowIds = [r.ID];
  table.dispatchEvent(new CustomEvent('dex-row-selected', { detail: { rowIds: [r.ID] }, bubbles: true, composed: true }));
  return r;
}

/** Open `names` and wait for each table's rows. */
export async function open(page: Page, ...names: string[]): Promise<void> {
  void page.handle.openPaths(names.map(at));
  for (const name of names) await until(() => (tableOf(name)?.rows.length ?? 0) > 0 || !!document.querySelector(`.doc-panel[data-path="${at(name)}"] dex-project-page`));
}

/** Select the tab of `name`, as a click on it does. */
export async function selectTab(name: string): Promise<void> {
  await until(() => !!tabNamed(name));
  tabNamed(name)!.click();
  await until(() => activeTab() === tabNamed(name));
}

/** The Value of row `name` in `bytes`, read again by view's model. */
export async function valueIn(bytes: Uint8Array, file: string, row: string): Promise<string> {
  const ws = createWorkspace();
  try {
    const view = await (await ws.open(bytes, file)).table.open();
    return textOf(view.rows.find((r) => r.Name?.label === row));
  } finally {
    ws.dispose();
  }
}

/** The last bytes saved to `name`. */
export const savedTo = (main: Main, name: string) => main.saves.filter((s) => s.path === at(name)).at(-1)?.bytes;

/** The items the shared context menu shows when row `row` of `name` is right-clicked (none: no menu). */
export async function menuOn(name: string, row: string): Promise<{ id: string; label: string; disabled?: boolean }[]> {
  const r = await rowOf(name, row);
  const table = tableOf(name)!;
  const menu = document.querySelector('dex-context-menu')!;
  let shown: { id: string; label: string; disabled?: boolean }[] = [];
  const show = menu.show.bind(menu);
  menu.show = (x, y, items) => {
    shown = items.filter((i) => !i.separator).map((i) => ({ id: i.id, label: i.label, disabled: i.disabled }));
    show(x, y, items);
  };
  table.selectedRowIds = [r.ID];
  table.dispatchEvent(new CustomEvent('dex-table-context-menu', { detail: { x: 0, y: 0, rowId: r.ID }, bubbles: true, composed: true }));
  menu.show = show;
  return shown;
}

/** Choose `actionId` in the shared context menu, as a click on its item does. */
export function choose(actionId: string): void {
  document.querySelector('dex-context-menu')!.dispatchEvent(new CustomEvent('dex-action', { detail: { actionId }, bubbles: true, composed: true }));
}

/** The section row of `name`'s table titled `title` (Design Data, …). */
export async function sectionOf(name: string, title: string): Promise<TreeTableRow> {
  let found: TreeTableRow | undefined;
  await until(() => !!(found = tableOf(name)?.rows.find((r) => r.ID.startsWith('section:') && r.Name?.label === title)));
  return found!;
}

/** `bytes` with row `row`'s Value set to `value`, as another program would write it: core, through view's model. */
export async function changedOutside(bytes: Uint8Array, file: string, row: string, value: string): Promise<Uint8Array> {
  const ws = createWorkspace({ editing: true });
  try {
    const doc = await ws.open(bytes.slice(), file);
    const source = doc.table;
    if (!isEditable(source)) throw new Error(`${file} takes no edits`);
    const r = (await source.open()).rows.find((x) => x.Name?.label === row)!;
    const dirty = new Promise<void>((resolve) => doc.onDirty((d) => d && resolve()));
    source.edit({ rowId: r.ID, columnId: 'Value', oldValue: textOf(r), newValue: value });
    await dirty;
    return doc.serialize().bytes;
  } finally {
    ws.dispose();
  }
}

/** A button of the in-page confirm dialog, by its label, once the dialog is open. */
export async function confirmButton(label: string): Promise<HTMLButtonElement> {
  let found: HTMLButtonElement | undefined;
  await until(() => !!(found = [...(confirmDialog().shadowRoot?.querySelectorAll('button') ?? [])].find((b) => b.textContent?.trim() === label)));
  return found!;
}

/** A folder on disk holding `files` (fixture names, or `to: from`), under a folder named `name`. */
export function tempFolder(name: string, files: Record<string, string>): string {
  const dir = path.join(mkdtempSync(path.join(tmpdir(), 'dex-shell-folder-')), name);
  mkdirSync(dir, { recursive: true });
  for (const [to, from] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, to)), { recursive: true });
    copyFileSync(fixture(from), path.join(dir, to));
  }
  return dir;
}

/** A folder and how to read it, as the Electron app's main process has them (its folderReads). */
export function folderReads(root: string): FolderReads {
  return {
    files: { list: async () => listedFiles(await listFolder(root)) },
    reader: (files) => ({
      ...nodeSourceReader(files),
      projectStore: (file) => readProjectStoreFromDisk(file.path),
    }),
  };
}

/**
 * Show `root` in the Explorer as the Electron app's main process serves it (folderReads through
 * serveFolder), across a channel of the page's own: what main's port and the preload hand over.
 * `changed(uris)` is its watcher.
 */
export function serveFolderTo(page: Page, root: string): { changed(uris?: string[]): void; dispose(): void } {
  const { port1, port2 } = new MessageChannel();
  const served = serveFolder(folderReads(root), portFromMessagePort(port1));
  page.handle.showFolder(root, port2);
  return {
    changed: (uris) => served.changed(uris),
    dispose: () => {
      served.dispose();
      port1.close();
    },
  };
}

/** The labels of the folder's tree rows, as drawn. */
export const treeLabels = () =>
  [...(document.querySelector('dex-hierarchy')?.shadowRoot?.querySelectorAll('[role="treeitem"] .label') ?? [])].map((l) => l.textContent?.trim());
