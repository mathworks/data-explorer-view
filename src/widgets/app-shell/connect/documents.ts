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
import { sourceUri } from '../../../model/source/sourceUri.js';
import type { LinkTarget } from '../../../model/ids/linkTarget.js';
import type { DexContextMenu } from '../../context-menu/dex-context-menu.js';
import type { DexErrorDialog } from '../../error-dialog/dex-error-dialog.js';
import type { DexProjectPage, ProjectOpenDetail } from '../../project-page/dex-project-page.js';
import { connectTable, type TableHandle } from '../../tree-table/connectTable.js';
import type { DexTreeTable, RowSelectedDetail } from '../../tree-table/dex-tree-table.js';
import type { DexVariableEditor } from '../../variable-editor/dex-variable-editor.js';
import type { DocTab } from '../dex-doc-tabs.js';
import { FILE_FORMATS, FILE_ICONS, fileGroupOf } from './explorerFiles.js';
import type { FolderView } from './folder.js';
import { folderOf } from './links.js';
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
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The page's clipboard, as connectTable's own default writes to it: a page without one fails the copy, saying so. */
function pageClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) return Promise.reject(new Error('this page has no clipboard access'));
  return navigator.clipboard.writeText(text);
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

/** A table in `tab`'s panel, its column choices kept under `storageKey`. */
export function newTable(tab: OpenTab, storageKey: string, editable = false): DexTreeTable {
  const table = document.createElement('dex-tree-table');
  table.readonly = !editable;
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
}

/** Connect `doc`'s source to a new table in `tab`'s panel, kept under `storageKey`. */
export function connectDocument(tab: OpenTab, doc: Doc, storageKey: string, wiring: DocumentWiring): TableHandle {
  const { host } = wiring;
  const handle = connectTable(newTable(tab, storageKey, doc.editable), doc.table, {
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
    copy: (text) => (host.copyText ? host.copyText(text) : pageClipboard(text)),
    // Usage is core's in a model; in a dictionary or a MAT-file the shown folder's usage
    // graphs fill it, so a file outside the folder has none.
    columns: (column) => column !== 'UsedBy' || doc.kind === 'model' || !!wiring.folder()?.lists(doc.uri),
    // A name a link holds means the file the folder's tree shows for it.
    resolveLink: (link: LinkTarget, fromUri: string) => wiring.folder()?.resolveLink(link, fromUri),
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

/** Draw `tab`'s project page from `folder`'s store, or say the folder it is in is needed. */
export async function paintProject(tab: OpenTab, page: DexProjectPage, folder: FolderView | undefined): Promise<void> {
  try {
    const store = folder ? await folder.projectStore(sourceUri(tab.path)) : null;
    if (store) page.payload = projectPageMessage(store, tab.path, folderOf(tab.path));
    else page.error = 'Open the folder this project is in to see its page.';
  } catch (err) {
    page.error = `Failed to read ${tab.name}: ${message(err)}`;
  }
}
