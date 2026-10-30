// Copyright 2026 The MathWorks, Inc.
//
// A tree table fed by a TableSource: the wiring every app with a table writes, written once.
//
// It shows what the source's `open()` answers and every change it reports after, keeping what the
// user did across a repaint (the rows they opened, their selection, the rows their search shows);
// fetches the rows under a row the paint held back; opens the one variable editor on a matrix
// glyph and fills it; draws the banners; turns a click on a link into the row it names, here or
// elsewhere; and gives a read-only context menu and Ctrl+F. What is the app's (opening another
// document, its own menu items) comes out of the handle it returns.
//
// With `editing`, it wires the editing half too (editingWire.ts): every gesture as the source's
// command (an EditableTableSource's), the editing menu and its chords, the drop predictor, and the
// dialogs a refusal is shown in.
//
// This is the VS Code extension's table webview (its table-main.ts) with the extension taken out:
// the same rules, in the same order, so that the extension, which uses this over its own message
// channel, shows its tables exactly as it did.
import { defineContextMenu, type ContextMenuItem, type DexContextMenu } from '../context-menu/dex-context-menu.js';
import { defineVariableEditor, type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { defineErrorDialog, type DexErrorDialog } from '../error-dialog/dex-error-dialog.js';
import { insertEntryRows, mergeChildRows, pendingSelectionToApply, spliceEntryRows } from '../../model/actions/rowUpdates.js';
import { resolveOperands } from '../../model/actions/operands.js';
import { isSectionRowId } from '../../model/ids/sectionRowId.js';
import { localLinkName, parseLinkTarget, type LinkTarget } from '../../model/ids/linkTarget.js';
import {
  isEditable,
  isSourceClosed,
  type InspectorFeed,
  type InspectorView,
  type MatrixPage,
  type TableChange,
  type TableSource,
  type TableView,
} from '../../model/source/tableSource.js';
import type { DexTreeTable, TableBanners, TreeTableRow } from './dex-tree-table.js';
import { wireEditing, type EditingWire, type TableTextView } from './editingWire.js';
import type { MenuRow } from './menuItems.js';

/** What a right-click is on, for the items an app adds to the menu (`menuItems`). */
export interface TableMenuContext {
  /** The row right-clicked, or null for the space under the rows. */
  rowId: string | null;
  /** The selection, which the table has already settled (a click outside it replaces it). */
  selectedRowIds: string[];
  /** The rows the table holds. */
  rows: TreeTableRow[];
}

/** How connectTable wires a table. */
export interface ConnectTableOptions {
  /**
   * The variable editor a matrix glyph opens. Default: one connectTable makes and puts in
   * `<body>`, and takes away again on dispose(). Pass the same one to connectInspector, which
   * otherwise takes this table's, to have one editor for both.
   */
  variableEditor?: DexVariableEditor;
  /**
   * Whether a right-click opens a context menu: by default it does, with Copy Name and Copy
   * Value for the selection, then `menuItems`. False for none, for an app that answers
   * `dex-table-context-menu` itself.
   */
  menu?: boolean;
  /**
   * Items of the app's own to add to the menu, after a separator; choosing one sends the
   * handle's `action`.
   */
  menuItems?: (context: TableMenuContext) => ContextMenuItem[];
  /**
   * The context menu to open. Default: one connectTable makes, in `<body>`, when it is first
   * needed. One menu may serve several tables: a choice is acted on by the table that opened the
   * menu, and a menu dismissed (or opened by another table, or by the app) leaves no table
   * waiting for its next choice.
   */
  contextMenu?: DexContextMenu;
  /**
   * Where the banners go. Default: the table's own strip, above its search bar (`table.banners`).
   * A function draws them elsewhere instead, and is called with all three whenever any changes.
   */
  banners?: (banners: TableBanners) => void;
  /**
   * Where Copy Name and Copy Value put their text, for an app with a clipboard of its own
   * (Electron's, a host's). A throw or a rejected promise is a copy that failed: the table says
   * so in its error banner, and the handle sends `copyFailed`. Default: the page's clipboard,
   * `navigator.clipboard.writeText`, which a page without one, or one that refuses (an unfocused
   * page, a permission policy), fails the same way.
   */
  copy?: (text: string) => Promise<void> | void;
  /**
   * Which of the source's columns the table has (`table.columns`, the ones its Columns menu
   * offers), chosen again on every whole paint: the keys in a list, or those a test passes, asked
   * of each column with the paint (`TableView`). For a column nothing fills in this document, such
   * as Usage in a dictionary opened where no workspace fills it. Default: every column the source
   * paints. A paint that names no columns leaves the table its built-in set, as without this
   * option.
   */
  columns?: readonly string[] | ((column: string, view: TableView) => boolean);
  /**
   * The file a link opens, for an app that knows where the files a link names are: asked of each
   * link the table follows, but one into the table's own document, with that document's uri
   * (`fromUri`). A uri is the file the link opens: a link to an entry of this table's own
   * document then selects it here, as a Data Type link does, and any other link goes to
   * `navigate` with the uri as its `uri`. Null, undefined, or a throw leaves the link to the
   * table's own rule, as without this option.
   *
   * A FolderHierarchy's `resolveLink` is one, so a table's links open the files a folder's tree
   * shows for the names they hold: `resolveLink: (link, fromUri) => hierarchy.resolveLink(link,
   * fromUri)`. Default: none; the table selects a Data Type link's row, and sends every other link
   * to `navigate`.
   */
  resolveLink?: (link: LinkTarget, fromUri: string) => string | null | undefined | Promise<string | null | undefined>;
  /**
   * Wire the table to edit, through the source's commands (an EditableTableSource's): a cell edit,
   * the Add gallery, a row drag and drop, and a context menu of editing items (Copy, Cut, Paste,
   * Add Child, Delete, Undo, Redo) with their chords, in place of Copy Name and Copy Value. A
   * refused edit opens the error dialog. Whether a document may be edited is still its view's
   * `editable`: a read-only one gets no menu, no cell editor, no `+ Add` and no row drag. A source
   * that takes no edits (isEditable false) is wired as a read-only document. Default false.
   */
  editing?: boolean;
  /**
   * With `editing`: a plain-text view of the document a row can be shown in. The editing menu then
   * offers Location in Text, in its place among the other items, and Cmd/Ctrl+L does what it does.
   */
  textView?: TableTextView;
  /**
   * With `editing`: the dialog a refused edit is shown in. Default: one connectTable makes, in
   * `<body>`, and takes away again on dispose().
   */
  errorDialog?: DexErrorDialog;
}

/** A link the table does not answer itself: a row of another document, or a file. */
export interface NavigateRequest {
  /** The link's target, as the row carries it. */
  target: string;
  /** What it points at. */
  link: LinkTarget;
  /**
   * The uri of the file the link opens, as connectTable's `resolveLink` named it: open this one,
   * rather than the file `link` names. Absent without a `resolveLink`, or when it named none.
   */
  uri?: string;
}

/** A copy that did not reach the clipboard (the handle's `copyFailed`). */
export interface CopyFailure {
  /** What was to be copied: the names or values, one a line. */
  text: string;
  /** Why, as the clipboard or the app's `copy` said it. */
  message: string;
}

/** A menu item the app added (`menuItems`) was chosen. */
export interface TableAction {
  actionId: string;
  /** The row right-clicked, or null for the space under the rows. */
  rowId: string | null;
  /** The selection when it was chosen. */
  rowIds: string[];
}

/** What a connected table tells its app, by event (TableHandle.on). */
export interface TableHandleEventMap {
  /**
   * The selection changed: by the user, by select() or selectByName() or a link, or to nothing
   * because every selected row went in a repaint (a task later, so a repaint followed by a
   * selection reads as one change).
   */
  select: string[];
  /** A link the table does not answer itself: open what it points at. */
  navigate: NavigateRequest;
  /** One of the app's menu items was chosen. */
  action: TableAction;
  /**
   * Copy Name or Copy Value did not reach the clipboard. The table's error banner says so too,
   * until a copy succeeds or the table repaints.
   */
  copyFailed: CopyFailure;
}

/** A table wired to a source: what connectTable returns. */
export interface TableHandle extends InspectorFeed {
  readonly table: DexTreeTable;
  readonly source: TableSource;
  /** The variable editor this table's matrix glyphs open. */
  readonly variableEditor: DexVariableEditor;
  /** The last whole paint, or undefined until the first. */
  readonly view: TableView | undefined;
  /** Hear an event, until the returned function is called. */
  on<K extends keyof TableHandleEventMap>(type: K, listener: (detail: TableHandleEventMap[K]) => void): () => void;
  /**
   * Select these rows: now, when they are all in the table, else as soon as a repaint brings the
   * rest (a full paint gives up waiting). For a host that says what is selected after an edit.
   */
  select(rowIds: readonly string[]): void;
  /**
   * Select the row named `name`, an entry rather than a row nested under one where both have the
   * name, else a block row whose key it is: now, or when a repaint brings it. For a link from
   * another document, once this one is open.
   */
  selectByName(name: string): void;
  /** Open the Name editor on `rowId`, now or when a repaint brings the row. */
  beginRename(rowId: string): void;
  /**
   * The Add gallery, as if its `+ Add` button were clicked: it opens, or closes if it is open,
   * and nothing happens on a table that cannot add. For a keyboard accelerator of the app's.
   */
  toggleAddGallery(): void;
  /**
   * With `editing`: the editing menu for the current selection (or `selection`), anchored at
   * `anchorRowId` (null for no row), as a right-click there would show it. For a chord of the
   * app's to do exactly what its item would, when it is enabled. Without `editing`, none.
   */
  menuFor(anchorRowId: string | null, selection?: readonly string[]): ContextMenuItem[];
  /** Stop: the table keeps what it shows and hears nothing more. */
  dispose(): void;
}

function isRecord(x: unknown): x is Record<string, any> {
  return typeof x === 'object' && x !== null;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// The table each context menu was last opened for, by menu: every table connected to a shared
// menu hears each of its choices, and the one that opened it is the one that acts.
const menuOwners = new WeakMap<object, object>();

/** The text of a cell, as the table shows it. */
function cellText(cell: unknown): string {
  if (typeof cell === 'string') return cell;
  if (isRecord(cell) && typeof cell.text === 'string') return cell.text;
  return '';
}

/**
 * Wire `table` to `source`: show what it answers, and answer what the table asks. Returns the
 * handle that says what the app is to do (`on`), and through which it selects.
 *
 * The table is left to the app in what it is (`readonly`, `canAdd`, `rowDrag`, `storageKey`):
 * connectTable sets `loading` until the first paint, `expandTopLevel`, and what each paint says.
 */
export function connectTable(table: DexTreeTable, source: TableSource, options: ConnectTableOptions = {}): TableHandle {
  const cleanups: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(
    target: HTMLElement,
    type: K,
    listener: (e: HTMLElementEventMap[K]) => void,
    capture = false,
  ): void => {
    target.addEventListener(type, listener, capture);
    cleanups.push(() => target.removeEventListener(type, listener, capture));
  };
  const listeners: { [K in keyof TableHandleEventMap]: Set<(detail: TableHandleEventMap[K]) => void> } = {
    select: new Set(),
    navigate: new Set(),
    action: new Set(),
    copyFailed: new Set(),
  };
  const emit = <K extends keyof TableHandleEventMap>(type: K, detail: TableHandleEventMap[K]): void => {
    for (const listener of [...listeners[type]]) (listener as (d: TableHandleEventMap[K]) => void)(detail);
  };

  // The one variable editor, made here unless the app has one.
  let editor = options.variableEditor;
  let madeEditor = false;
  if (!editor) {
    defineVariableEditor();
    editor = document.createElement('dex-variable-editor');
    document.body.appendChild(editor);
    madeEditor = true;
  }
  const variableEditor = editor;

  // The dialog a refused edit is shown in, made here unless the app has one; editing only.
  let dialog = options.errorDialog;
  let madeDialog = false;
  if (options.editing && !dialog) {
    defineErrorDialog();
    dialog = document.createElement('dex-error-dialog');
    document.body.appendChild(dialog);
    madeDialog = true;
  }
  // The editing half, wired below once the table's own listeners are (editingWire.ts).
  let editing: EditingWire | null = null;

  let view: TableView | undefined;
  let docUri = '';
  let disposed = false;

  // --- Banners ---------------------------------------------------------------------------------

  let banners: TableBanners = {};
  const drawBanners = (next: TableBanners): void => {
    banners = next;
    if (options.banners) options.banners({ ...banners });
    else table.banners = banners.error || banners.notice || banners.warnings ? { ...banners } : null;
  };
  const showError = (message: string | undefined): void => drawBanners({ ...banners, error: message });

  // --- Columns ---------------------------------------------------------------------------------

  const chosen = options.columns;
  const chooseColumns = (next: TableView): string[] => {
    if (chosen === undefined) return next.columns;
    const keep = typeof chosen === 'function' ? (c: string) => chosen(c, next) : (c: string) => chosen.includes(c);
    return next.columns.filter(keep);
  };

  // --- Rows ------------------------------------------------------------------------------------

  const selectedRowIds = (): string[] => (Array.isArray(table.selectedRowIds) ? table.selectedRowIds : []);
  const rowsNow = (): TreeTableRow[] => (Array.isArray(table.rows) ? table.rows : []);

  // The rows asked to be selected once they are all present (select()): after a rename (the row's
  // id changes) and after an edit that adds rows. Applied as soon as they all exist.
  let pendingSelectIds: string[] = [];
  const applyPendingSelection = (): void => {
    const toSelect = pendingSelectionToApply(rowsNow(), pendingSelectIds);
    if (!toSelect) return;
    table.selectedRowIds = toSelect;
    emit('select', toSelect);
    pendingSelectIds = [];
  };

  // A row to open the name editor on once it exists (beginRename()). Cleared whether or not the
  // editor opened: a row that is present and NOT renameable is an answer, not a wait.
  let pendingRenameId: string | null = null;
  const applyPendingRename = (): void => {
    if (!pendingRenameId) return;
    if (!rowsNow().some((r) => r.ID === pendingRenameId)) return;
    table.beginRename(pendingRenameId);
    pendingRenameId = null;
  };

  // A name to select once its row exists (selectByName(), a local link).
  let pendingSelectName: string | null = null;
  const applyPendingNameSelection = (): void => {
    if (!pendingSelectName) return;
    const rows = rowsNow();
    // A top-level ENTRY: its parent is a section header or, in a table with no section rows (a
    // MAT-file's), it has no parent and is no header itself.
    const isEntry = (r: TreeTableRow): boolean => (typeof r.parent === 'string' ? isSectionRowId(r.parent) : !isSectionRowId(r.ID));
    const named = (r: TreeTableRow): boolean => r.Name?.label === pendingSelectName;
    // Entries first, because every by-name target means the top-level one: a nested row that
    // shares the name is not what a link means. Then any row, for a block named before SIDs;
    // then a block by its key, which no cell prints.
    const match =
      rows.find((r) => named(r) && isEntry(r)) ?? rows.find(named) ?? rows.find((r) => r._blockKey === pendingSelectName);
    if (!match) return;
    table.selectedRowIds = [match.ID];
    emit('select', [match.ID]);
    pendingSelectName = null;
  };

  // A selection whose every row a repaint removed is cleared, and said, ONE TASK later rather
  // than in the repaint: a repaint and a select() that follows it (a rename: the old id goes,
  // then the new one is selected) must not read as "nothing selected" and then the new row.
  let vanishedClear: ReturnType<typeof setTimeout> | null = null;
  const cancelVanishedClear = (): void => {
    if (vanishedClear === null) return;
    clearTimeout(vanishedClear);
    vanishedClear = null;
  };
  const scheduleVanishedClear = (): void => {
    cancelVanishedClear();
    vanishedClear = setTimeout(() => {
      vanishedClear = null;
      const present = new Set(rowsNow().map((r) => r.ID));
      const selection = selectedRowIds();
      if (selection.length === 0 || selection.some((id) => present.has(id))) return;
      table.selectedRowIds = [];
      emit('select', []);
    }, 0);
  };

  // Hand a new row array to the table and re-derive everything that depends on it: every repaint
  // (a whole paint, one entry's, a row's children) comes here, so no path can drift from another.
  const installRows = (rows: TreeTableRow[]): void => {
    const prevSelected = selectedRowIds();
    // The expansion is the table's (expandTopLevel); the rows a search shows are kept with it.
    table._replaceRows(rows, pendingSelectIds);
    const present = new Set(rows.map((r) => r.ID));
    const stillSelected = prevSelected.filter((id) => present.has(id));
    const vanished = prevSelected.length > 0 && stillSelected.length === 0;
    if (stillSelected.length > 0) table.selectedRowIds = stillSelected;
    table.requestUpdate();
    applyPendingSelection();
    applyPendingNameSelection();
    if (vanished && !selectedRowIds().some((id) => present.has(id))) scheduleVanishedClear();
    // After the selection, which expands the row's ancestors and scrolls it into view: an editor
    // opened on a row hidden under a collapsed section would be a table that stopped answering.
    applyPendingRename();
  };

  /** A whole paint: open()'s answer, or a replaceAll. */
  const paint = (next: TableView): void => {
    view = next;
    if (next.docUri) docUri = next.docUri;
    // The editing state a paint carries, before its rows are installed, as it always was.
    editing?.painting(next);
    table.loading = false;
    // Every row is replaced, so an open grid describes rows the user can no longer see.
    variableEditor.close();
    drawBanners({ notice: next.notice, warnings: next.warnings });
    table.columns = next.columns.length > 0 ? chooseColumns(next) : null;
    table.columnLabels = next.columnLabels;
    table.columnGroups = next.columnGroups;
    installRows(next.rows);
    // A whole paint holds every row it is going to: a selection or a rename still waiting now
    // would otherwise land on whatever row next takes that id.
    pendingSelectIds = [];
    pendingRenameId = null;
    refreshInspector();
  };

  const failed = (message: string): void => {
    table.loading = false;
    showError(message);
  };

  // What a source that is told of its paint (`opened`: an in-page engine) says while a paint is
  // being asked for: held from the ask until the paint, and what follows it, are in, and then taken
  // in the order it was said. Taken before the rows, it would land on a table that has not got
  // them, and the rows, built before it, would land over it. Any other source (a host across a
  // channel, which says things in its own order) is taken as it arrives.
  let held: TableChange[] | null = null;
  const release = (): void => {
    const queued = held ?? [];
    held = null;
    for (const change of queued) onChange(change);
  };

  /** The table and its source are out of step: ask for the whole table again. */
  const reopen = (): void => {
    if (source.opened) held ??= [];
    source.open().then(
      (v) => {
        if (disposed) return;
        const queued = held;
        held = null;
        paint(v);
        // What the source says after a paint (an editable one's drop rules) follows the rows.
        source.opened?.();
        held = queued;
        release();
      },
      // A source closed while it was asked has nothing to show, and no banner to say it in.
      (err) => {
        if (!disposed && !isSourceClosed(err)) failed(messageOf(err));
        release();
      },
    );
  };

  const onChange = (change: TableChange): void => {
    if (disposed) return;
    if (held) {
      held.push(change);
      return;
    }
    switch (change.kind) {
      case 'replaceAll':
        return paint(change.view);
      case 'updateEntry':
      case 'insertEntry': {
        const spliced =
          change.kind === 'updateEntry'
            ? spliceEntryRows(rowsNow(), change.entryRowId, change.rows)
            : insertEntryRows(rowsNow(), change.sectionRowId, change.beforeRowId, change.rows);
        // The table does not hold the entry the source repainted, so a splice would drop the edit.
        if (!spliced) return reopen();
        variableEditor.close();
        // Only a change that succeeded repaints this narrowly, so an earlier failure's banner goes.
        showError(undefined);
        installRows(spliced);
        refreshInspector();
        return;
      }
      case 'error':
        return failed(change.message);
      default:
        // The editing changes, which a table that does not edit ignores.
        editing?.change(change);
    }
  };

  // --- What the table asks -----------------------------------------------------------------------

  // A matrix glyph, in a Value cell: the editor opens on its descriptor and is filled as the cells
  // arrive. No node id is nothing to ask with, and a panel that can never be answered is worse
  // than none.
  listen(table, 'dex-matrix-open', (e) => {
    const detail = e.detail as Partial<typeof e.detail> | undefined;
    if (!detail?.matrix || !detail.anchorEl) return;
    const nodeId = detail.matrix.nodeId;
    if (typeof nodeId !== 'string' || nodeId === '') return;
    variableEditor.show(detail.anchorEl, detail.matrix);
    void source.matrix(nodeId).then((page) => void variableEditor.deliver(page), () => {});
  });

  // A row whose children the paint held back was opened. The table marks it asked-about, so a
  // second click does not ask again.
  listen(table, 'dex-request-children', (e) => {
    const nodeId = e.detail?.nodeId;
    if (typeof nodeId !== 'string' || nodeId === '') return;
    source.children(nodeId).then(
      (answer) => {
        if (disposed || !Array.isArray(answer.rows)) return;
        // Merged in place: the banners, the columns, the selection and an open grid stay.
        const merged = mergeChildRows(rowsNow(), answer.nodeId, answer.rows);
        // No row by that id any more: a repaint rebuilt the tree while the fetch was in flight.
        if (merged) installRows(merged);
        // Children that got no row would otherwise read as the whole list.
        if (merged && answer.truncated > 0) {
          showError(
            `This item has more rows than one view can show: ${answer.truncated.toLocaleString('en-US')} ` +
              'of its contents are not listed.',
          );
        }
      },
      () => {},
    );
  });

  listen(table, 'dex-row-selected', (e) => {
    emit('select', e.detail?.rowIds ?? []);
  });

  // A Data Type link names a row of this table; every other target is for whoever opens
  // documents, and so is a local one whose row is not here after all. The app's resolveLink names
  // the file of any other first: a link it resolves to this document is local too. One rule
  // decides, asked of the target as it is or of its entry in the file resolveLink named.
  const localName = (target: string, link: LinkTarget, uri: string | undefined): string | null =>
    localLinkName(uri === undefined ? target : link.kind === 'entry' ? `${link.name}@${uri}` : '', docUri);
  const follow = (target: string, link: LinkTarget, uri: string | undefined): void => {
    const navigate = (): void => emit('navigate', { target, link, ...(uri === undefined ? {} : { uri }) });
    const name = localName(target, link, uri);
    if (name === null) return navigate();
    pendingSelectName = name;
    applyPendingNameSelection();
    if (pendingSelectName !== null) {
      // A local miss must not hijack the next repaint the way an early selectByName may.
      pendingSelectName = null;
      navigate();
    }
  };
  listen(table, 'dex-link-clicked', (e) => {
    const target = e.detail?.target;
    if (typeof target !== 'string') return;
    const link = parseLinkTarget(target);
    const resolveLink = options.resolveLink;
    if (!resolveLink || localName(target, link, undefined) !== null) return follow(target, link, undefined);
    const from = docUri;
    Promise.resolve()
      .then(() => resolveLink(link, from))
      .catch(() => undefined)
      .then((uri) => {
        if (!disposed) follow(target, link, typeof uri === 'string' && uri !== '' ? uri : undefined);
      });
  });

  // Ctrl/Cmd+F: the search box. Not with modifiers the table does not own.
  listen(
    table,
    'keydown',
    (ev) => {
      if ((ev.key === 'f' || ev.key === 'F') && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey) {
        ev.preventDefault();
        ev.stopPropagation();
        table.focusFilter();
      }
    },
    true,
  );

  // --- Editing -----------------------------------------------------------------------------------

  const selectRows = (rowIds: readonly string[]): void => {
    cancelVanishedClear();
    pendingSelectIds = rowIds.filter((id) => typeof id === 'string');
    applyPendingSelection();
  };
  const beginRenameRow = (rowId: string): void => {
    pendingRenameId = typeof rowId === 'string' ? rowId : null;
    applyPendingRename();
  };
  if (options.editing) {
    editing = wireEditing({
      table,
      source: isEditable(source) ? source : null,
      textView: options.textView,
      errorDialog: dialog!,
      listen: (type, listener, capture = false) => {
        table.addEventListener(type, listener, capture);
        cleanups.push(() => table.removeEventListener(type, listener, capture));
      },
      selectedRowIds,
      rowsNow: () => rowsNow() as MenuRow[],
      docUri: () => docUri,
      setDocUri: (uri) => {
        docUri = uri;
      },
      view: () => view,
      select: selectRows,
      beginRename: beginRenameRow,
    });
  }

  // --- The context menu: read-only, or the editing one -------------------------------------------

  let contextMenu = options.contextMenu;
  let madeMenu = false;
  let menuListening = false;
  // What the open menu is about, until it closes: a choice, a dismissal, or another table's (or
  // the app's) show() in its place. A menu shared with other tables (`contextMenu`) acts for the
  // one that opened it last, and only on its next choice.
  let menuContext: TableMenuContext | null = null;
  const menuOwner = {};
  const onAction = (e: Event): void => {
    const context = menuContext;
    menuContext = null;
    if (!context || menuOwners.get(e.currentTarget as object) !== menuOwner) return;
    const actionId = (e as CustomEvent<{ actionId: string }>).detail?.actionId;
    // The editing menu's own items are commands, anchored where the menu was opened.
    if (editing && typeof actionId === 'string' && editing.act(actionId, context.rowId)) return;
    if (actionId === 'copyName' || actionId === 'copyValue') return void copyText(context, actionId);
    if (typeof actionId === 'string') emit('action', { actionId, rowId: context.rowId, rowIds: context.selectedRowIds });
  };
  const onMenuClosed = (): void => {
    menuContext = null;
  };

  // Copy Name and Copy Value. A copy that fails is said in the error banner, over whatever error
  // was there, which the next copy that succeeds gives back (a repaint draws its own).
  const copy = options.copy ?? pageClipboard;
  let copyError: { shown: string; covered: string | undefined } | null = null;
  const copyText = (context: TableMenuContext, which: 'copyName' | 'copyValue'): void => {
    const text = selectionText(context, which);
    let copying: Promise<void>;
    try {
      copying = Promise.resolve(copy(text));
    } catch (err) {
      copying = Promise.reject(err);
    }
    copying.then(
      () => {
        if (disposed) return;
        if (copyError && banners.error === copyError.shown) showError(copyError.covered);
        copyError = null;
      },
      (err) => {
        if (disposed) return;
        const message = messageOf(err);
        const shown = `Could not copy to the clipboard: ${message}`;
        const covered = copyError && banners.error === copyError.shown ? copyError.covered : banners.error;
        copyError = { shown, covered };
        showError(shown);
        emit('copyFailed', { text, message });
      },
    );
  };
  if (options.menu !== false) {
    listen(table, 'dex-table-context-menu', (e) => {
      const { x, y, rowId } = e.detail;
      const context: TableMenuContext = { rowId: rowId ?? null, selectedRowIds: [...selectedRowIds()], rows: rowsNow() };
      if (editing && !editing.menuAllowed(context.rowId)) return;
      // The editing menu is for the current selection, but a right-click on no row is a gesture
      // on the document, whose menu is the one a selection of nothing gets.
      const items = editing
        ? editing.menuFor(context.rowId, context.rowId === null ? [] : context.selectedRowIds)
        : [...readOnlyItems(context)];
      const extra = options.menuItems?.(context) ?? [];
      if (items.length > 0 && extra.length > 0) items.push({ id: '', label: '', separator: true });
      items.push(...extra);
      if (items.length === 0) return;
      if (!contextMenu) {
        defineContextMenu();
        contextMenu = document.createElement('dex-context-menu');
        document.body.appendChild(contextMenu);
        madeMenu = true;
      }
      if (!menuListening) {
        contextMenu.addEventListener('dex-action', onAction);
        contextMenu.addEventListener('dex-menu-closed', onMenuClosed);
        menuListening = true;
      }
      // After show(): a menu it replaces says it closed, which clears every table's context.
      contextMenu.show(x, y, items);
      menuOwners.set(contextMenu, menuOwner);
      menuContext = context;
    });
  }

  // --- The inspector's feed: this table's selection, inspected ----------------------------------

  const pageListeners = new Set<(page: InspectorView) => void>();
  let inspected: readonly string[] | null = null;
  // What the inspector was last given, as the extension's InspectorPage keeps it: its groups, and
  // the cells its variable editor was given for them. A page that shows exactly that again is not
  // sent, so an edit elsewhere in the document does not close a grid open on this row.
  let shown: { groups: string; cells: { nodeId: string; page: string } | null } | null = null;
  let asking = 0;

  const send = (page: InspectorView): void => {
    for (const listener of [...pageListeners]) listener(page);
  };
  /** Whether the grid open on the inspector's row would show other cells for `rowId`'s. */
  const cellsChanged = async (rowId: string): Promise<boolean> => {
    if (!shown?.cells) return false;
    // Another row's grid is another grid, whatever its cells.
    if (shown.cells.nodeId !== rowId) return true;
    return JSON.stringify(await source.matrix(rowId)) !== shown.cells.page;
  };
  /** Show the first row of `rowIds`; on a refresh, leave a row that is gone to the selection. */
  const inspect = (rowIds: readonly string[], refresh: boolean): void => {
    if (pageListeners.size === 0) return;
    const ask = ++asking;
    void source.inspect(rowIds).then(async (page) => {
      if (ask !== asking || disposed) return;
      if (page.rowId === undefined) {
        if (refresh) return;
        shown = null;
        return send({ groups: [] });
      }
      const groups = JSON.stringify(page.groups);
      if (shown && shown.groups === groups && !(await cellsChanged(page.rowId))) return;
      if (ask !== asking) return;
      shown = { groups, cells: null };
      send(page);
    }, () => {});
  };
  const refreshInspector = (): void => {
    if (inspected) inspect(inspected, true);
  };
  const followSelection = (rowIds: string[]): void => {
    inspected = rowIds;
    inspect(rowIds, false);
  };
  listeners.select.add(followSelection);

  // --- Start -----------------------------------------------------------------------------------

  table.expandTopLevel = true;
  // Waiting for the first paint: the table says Loading… rather than "No data".
  table.loading = true;
  const unsubscribe = source.subscribe(onChange);
  reopen();

  return {
    table,
    source,
    variableEditor,
    get view() {
      return view;
    },
    on(type, listener) {
      listeners[type].add(listener as never);
      return () => void listeners[type].delete(listener as never);
    },
    select: selectRows,
    selectByName(name) {
      pendingSelectName = typeof name === 'string' ? name : null;
      applyPendingNameSelection();
    },
    beginRename: beginRenameRow,
    toggleAddGallery() {
      table.toggleAddGallery();
    },
    menuFor(anchorRowId, selection) {
      return editing ? editing.menuFor(anchorRowId, selection) : [];
    },
    onPage(listener) {
      pageListeners.add(listener);
      if (inspected) inspect(inspected, false);
      return () => void pageListeners.delete(listener);
    },
    async matrix(nodeId): Promise<MatrixPage> {
      const page = await source.matrix(nodeId);
      if (shown) shown.cells = { nodeId, page: JSON.stringify(page) };
      return page;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      cancelVanishedClear();
      for (const cleanup of cleanups.splice(0)) cleanup();
      if (contextMenu && menuListening) {
        contextMenu.removeEventListener('dex-action', onAction);
        contextMenu.removeEventListener('dex-menu-closed', onMenuClosed);
      }
      if (madeMenu) contextMenu?.remove();
      if (madeEditor) variableEditor.remove();
      if (madeDialog) dialog?.remove();
      for (const set of Object.values(listeners)) set.clear();
      pageListeners.clear();
    },
  };
}

/** The menu a read-only table gives a selection: its names and values, to copy. */
function readOnlyItems(context: TableMenuContext): ContextMenuItem[] {
  const ops = resolveOperands(context.selectedRowIds, context.rows);
  if (ops.deleteIds.length === 0) return [];
  return [
    { id: 'copyName', label: 'Copy Name', icon: 'copy' },
    { id: 'copyValue', label: 'Copy Value' },
  ];
}

/** The selection's names (or values), one a line: what Copy Name (or Copy Value) copies. */
function selectionText(context: TableMenuContext, which: 'copyName' | 'copyValue'): string {
  const byId = new Map(context.rows.map((r) => [r.ID, r]));
  const ops = resolveOperands(context.selectedRowIds, context.rows);
  const lines = ops.deleteIds.map((id) => {
    const row = byId.get(id);
    return which === 'copyName' ? (row?.Name?.label ?? '') : cellText(row?.Value);
  });
  return lines.join('\n');
}

/** The page's clipboard, which a page without one fails like one that refuses. */
function pageClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    return Promise.reject(new Error('this page has no clipboard access'));
  }
  return navigator.clipboard.writeText(text);
}
