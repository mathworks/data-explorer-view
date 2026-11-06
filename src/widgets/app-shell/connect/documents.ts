// Copyright 2026 The MathWorks, Inc.
//
// A tab's document and the widgets it is shown in: its table, connected to the document's source
// as every document of the editing workspace is, or a project's page; and how its tab and the
// status bar name it. connectShell opens and closes tabs and says what each event means; these are
// the parts of that which are about one tab alone.
//
// Lifted, where the Electron app had them, from data-explorer-app src/renderer/app.ts at 0983920
// (newTable, newProjectPage, paintProject, and the connectTable options of its open()).

import type { Doc } from '../../../model/source/workspace.js';
import { projectPageMessage } from '../../../model/source/projectPage.js';
import { sourceUri, uriPath } from '../../../model/source/sourceUri.js';
import { isSupportedPath } from 'data-explorer-core';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexErrorDialog } from '../../error-dialog/dex-error-dialog.js';
import type { DexProjectPage, ProjectOpenDetail } from '../../project-page/dex-project-page.js';
import { connectTable, type TableHandle } from '../../tree-table/connectTable.js';
import type { DexTreeTable, RowSelectedDetail } from '../../tree-table/dex-tree-table.js';
import type { EditingRun } from '../../tree-table/editingWire.js';
import type { DexVariableEditor } from '../../variable-editor/dex-variable-editor.js';
import type { DocTab } from '../dex-doc-tabs.js';
import { FILE_FORMATS, FILE_ICONS, fileGroupOf } from './explorerFiles.js';
import type { FolderView } from './folder.js';
import { onMac } from './keys.js';
import { folderOf, projectLinkPath } from './links.js';
import type { ShellTab } from './tabs.js';
import type { ShellHost } from './types.js';

/** A tab as the shell keeps it: a ShellTab, its table's selection, and its listeners. */
export interface OpenTab extends ShellTab {
  /** The selection its table last said (TableHandle `select`), for the history, the Explorer and the location. */
  selection: readonly string[];
  /** What stops its listeners, when it closes. */
  stops: (() => void)[];
  /**
   * Settles once the tab is opened: its file read and its table connected, or its banner saying why
   * not (or its page drawn). A second open of the file waits for it, so a link's or a search's row
   * is selected in a table that is there.
   */
  ready: Promise<void>;
  /** The bytes its file holds as the shell last read or wrote them: what the relationship graph draws. */
  bytes?: Uint8Array;
}

/** The item a document's table menu ends with: the row's item, or the file's box, in the relationship graph. */
export const SHOW_IN_GRAPH = { id: 'showInGraph', label: 'Show in Graph' } as const;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The page's clipboard, as connectTable's own default writes to it: a page without one fails the copy, saying so. */
function pageClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('this page has no clipboard access'));
  return navigator.clipboard.writeText(text);
}

/** Put `text` on the host's clipboard, or the page's for a host without one, asked at each copy. */
export function copyText(host: ShellHost, text: string): Promise<void> {
  return host.copyText ? host.copyText(text) : pageClipboard(text);
}

/** How the tab row draws `tab`: its name, its kind's icon, its path as the tooltip, its marks. */
export function docTabOf(tab: OpenTab): DocTab {
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
export function statusOf(tab: OpenTab | undefined): string {
  const group = tab ? fileGroupOf(tab.path) : 'other';
  return group === 'other' ? '' : `${FILE_FORMATS[group]}${tab?.dirty ? ' · Modified' : ''}`;
}

/**
 * What a table's editing gesture did, as the prototype's toasts said it: Copy and Cut, a Paste of
 * something, and Delete with how many entries it took. None for the rest, whose table shows them.
 */
export function ranNote({ actionId, count }: EditingRun): string | undefined {
  if (actionId === 'copy') return 'Copied to clipboard';
  if (actionId === 'cut') return 'Cut to clipboard';
  if (actionId === 'paste' && count > 0) return 'Pasted';
  if (actionId === 'delete' && count > 0) return count === 1 ? 'Entry deleted' : `${count} entries deleted`;
  return undefined;
}

/**
 * Select no row of `tab`'s table: the file itself. TableHandle.select([]) selects nothing rather
 * than clearing, so the selection goes as a click on no row takes it, the table's own event saying
 * so, which is what connectTable (its `select`, the inspector's feed) hears.
 */
export function clearSelection(tab: OpenTab): void {
  const table = tab.table;
  if (!table || table.selectedRowIds.length === 0) return;
  table.selectedRowIds = [];
  table.dispatchEvent(new CustomEvent<RowSelectedDetail>('dex-row-selected', { detail: { rowIds: [] }, bubbles: true, composed: true }));
}

// --- The widgets ---------------------------------------------------------------------------------

/** A table in `tab`'s panel, its column choices kept under `storageKey`, ruled as `tableStyle` says (the setting's). */
export function newTable(tab: OpenTab, storageKey: string, editable = false, tableStyle: DexTreeTable['tableStyle'] = 'normal'): DexTreeTable {
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

/** The shared parts a document's table is connected with, and the folder it is read against. */
export interface DocumentWiring {
  host: ShellHost;
  editor: DexVariableEditor;
  menu: DexContextMenu;
  dialog: DexErrorDialog;
  /** The folder shown now, if any: its Usage, and the files its tree shows for a link's names. */
  folder(): FolderView | undefined;
  /** How a table made now is ruled: the table style setting's. */
  tableStyle(): DexTreeTable['tableStyle'];
}

/** Connect `doc`'s source to a new table in `tab`'s panel, kept under `storageKey`. */
export function connectDocument(tab: OpenTab, doc: Doc, storageKey: string, wiring: DocumentWiring): TableHandle {
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
    resolveLink: (link: LinkTarget, fromUri: string) => wiring.folder()?.resolveLink(link, fromUri),
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
export function newProjectPage(tab: OpenTab, revealIn: string, follow: (root: string, link: ProjectOpenDetail) => Promise<void>): DexProjectPage {
  const page = document.createElement('dex-project-page');
  // Where a folder link shows its folder (the host's reveal).
  page.revealIn = revealIn;
  page.addEventListener('dex-project-open', (e) => {
    const root = page.payload?.root;
    if (root) void follow(root, e.detail).catch((err) => (page.error = message(err)));
  });
  tab.panel.append(page);
  tab.page = page;
  return page;
}

/**
 * Draw `tab`'s project page from `folder`'s store, or say the folder it is in is needed. Resolves to
 * why its store could not be read, which the page says too; undefined when it was drawn.
 */
export async function paintProject(tab: OpenTab, page: DexProjectPage, folder: FolderView | undefined): Promise<string | undefined> {
  try {
    const store = folder ? await folder.projectStore(sourceUri(tab.path)) : null;
    if (store) page.payload = projectPageMessage(store, tab.path, folderOf(tab.path));
    else page.error = 'Open the folder this project is in to see its page.';
    return undefined;
  } catch (err) {
    page.error = `Failed to read ${tab.name}: ${message(err)}`;
    return page.error;
  }
}

/** What a project's page says in the Log. */
type ProjectLog = (level: 'info' | 'error', text: string) => void;

/**
 * Draw again from `folder`'s store each project's page among `tabs`, or only those whose marker is
 * among `uris`; one that could not be read says why in the Log (`log`).
 */
export function repaintProjects(tabs: readonly OpenTab[], folder: FolderView, log: ProjectLog, uris?: readonly string[]): void {
  for (const t of tabs) {
    if (!t.page || (uris && !uris.includes(sourceUri(t.path)))) continue;
    void paintProject(t, t.page, folder).then((failed) => {
      if (failed) log('error', failed);
    });
  }
}

/**
 * Show the project of `tab` on its page, drawn from the shown folder's store: a link on it opens
 * its file as a preview (`open`), and one that cannot be followed says why on the page and in the
 * Log, as a store that cannot be read does.
 */
export async function showProject(
  tab: OpenTab,
  on: { host: ShellHost; folder(): FolderView | undefined; open(path: string): Promise<unknown>; log: ProjectLog },
): Promise<void> {
  const revealIn = on.host.revealIn ?? (onMac() ? 'Finder' : 'the file manager');
  const follow = (root: string, link: ProjectOpenDetail) =>
    followProjectLink(root, link, { folder: on.folder, open: on.open, reveal: (to) => on.host.reveal?.(to) }).catch((err) => {
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
export async function followProjectLink(
  root: string,
  link: ProjectOpenDetail,
  on: { folder(): FolderView | undefined; open(path: string): Promise<unknown>; reveal(path: string): Promise<void> | undefined },
): Promise<void> {
  const path = projectLinkPath(root, link.path);
  const project = link.preferProject ? await on.folder()?.projectIn(path) : undefined;
  if (project) await on.open(uriPath(project));
  else if (isSupportedPath(path)) await on.open(path);
  else await on.reveal(path);
}
