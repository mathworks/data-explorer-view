// Copyright 2026 The MathWorks, Inc.
//
// A tree table fed by a TableSource: the wiring every app with a table writes, written once.
//
// It shows what the source's `open()` answers and every change it reports after, keeping what the
// user did across a repaint (the rows they opened, their selection, the rows their search shows);
// fetches the rows under a row the paint held back; opens the one variable editor on a matrix
// glyph and fills it; draws the banners; turns a click on a link into the row it names, here or
// elsewhere; and gives a read-only context menu and Ctrl+F. What is the app's (opening another
// document, its own menu items, editing) comes out of the handle it returns.
//
// This is the VS Code extension's table webview (its table-main.ts) with the extension taken out:
// the same rules, in the same order, so that the extension, which uses this over its own message
// channel, shows its tables exactly as it did.
import { defineContextMenu, type ContextMenuItem, type DexContextMenu } from '../context-menu/dex-context-menu.js';
import { defineVariableEditor, type DexVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { insertEntryRows, mergeChildRows, pendingSelectionToApply, spliceEntryRows } from '../../model/actions/rowUpdates.js';
import { resolveOperands } from '../../model/actions/operands.js';
import { isSectionRowId } from '../../model/ids/sectionRowId.js';
import { localLinkName, parseLinkTarget, type LinkTarget } from '../../model/ids/linkTarget.js';
import type {
  InspectorFeed,
  InspectorView,
  MatrixPage,
  TableChange,
  TableSource,
  TableView,
} from '../../model/source/tableSource.js';
import type { DexTreeTable, TableBanners, TreeTableRow } from './dex-tree-table.js';

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
  /** The context menu to open. Default: one connectTable makes, in `<body>`, when it is first needed. */
  contextMenu?: DexContextMenu;
  /**
   * Where the banners go. Default: the table's own strip, above its search bar (`table.banners`).
   * A function draws them elsewhere instead, and is called with all three whenever any changes.
   */
  banners?: (banners: TableBanners) => void;
}

/** A link the table does not answer itself: a row of another document, or a file. */
export interface NavigateRequest {
  /** The link's target, as the row carries it. */
  target: string;
  /** What it points at. */
  link: LinkTarget;
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
  /** Stop: the table keeps what it shows and hears nothing more. */
  dispose(): void;
}

function isRecord(x: unknown): x is Record<string, any> {
  return typeof x === 'object' && x !== null;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

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
    table.loading = false;
    // Every row is replaced, so an open grid describes rows the user can no longer see.
    variableEditor.close();
    drawBanners({ notice: next.notice, warnings: next.warnings });
    table.columns = next.columns.length > 0 ? next.columns : null;
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

  /** The table and its source are out of step: ask for the whole table again. */
  const reopen = (): void => {
    source.open().then(
      (v) => !disposed && paint(v),
      (err) => !disposed && failed(messageOf(err)),
    );
  };

  const onChange = (change: TableChange): void => {
    if (disposed) return;
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
  // documents, and so is a local one whose row is not here after all.
  listen(table, 'dex-link-clicked', (e) => {
    const target = e.detail?.target;
    if (typeof target !== 'string') return;
    const navigate = (): void => emit('navigate', { target, link: parseLinkTarget(target) });
    const name = localLinkName(target, docUri);
    if (name === null) return navigate();
    pendingSelectName = name;
    applyPendingNameSelection();
    if (pendingSelectName !== null) {
      // A local miss must not hijack the next repaint the way an early selectByName may.
      pendingSelectName = null;
      navigate();
    }
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

  // --- The read-only context menu ----------------------------------------------------------------

  let contextMenu = options.contextMenu;
  let madeMenu = false;
  let menuListening = false;
  // What the open menu is about, until one of its items is chosen.
  let menuContext: TableMenuContext | null = null;
  const onAction = (e: Event): void => {
    const context = menuContext;
    if (!context) return;
    menuContext = null;
    const actionId = (e as CustomEvent<{ actionId: string }>).detail?.actionId;
    if (actionId === 'copyName' || actionId === 'copyValue') return void copyText(context, actionId);
    if (typeof actionId === 'string') emit('action', { actionId, rowId: context.rowId, rowIds: context.selectedRowIds });
  };
  if (options.menu !== false) {
    listen(table, 'dex-table-context-menu', (e) => {
      const { x, y, rowId } = e.detail;
      const context: TableMenuContext = { rowId: rowId ?? null, selectedRowIds: [...selectedRowIds()], rows: rowsNow() };
      const items = [...readOnlyItems(context)];
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
        menuListening = true;
      }
      menuContext = context;
      contextMenu.show(x, y, items);
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
    select(rowIds) {
      cancelVanishedClear();
      pendingSelectIds = rowIds.filter((id) => typeof id === 'string');
      applyPendingSelection();
    },
    selectByName(name) {
      pendingSelectName = typeof name === 'string' ? name : null;
      applyPendingNameSelection();
    },
    beginRename(rowId) {
      pendingRenameId = typeof rowId === 'string' ? rowId : null;
      applyPendingRename();
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
      if (contextMenu && menuListening) contextMenu.removeEventListener('dex-action', onAction);
      if (madeMenu) contextMenu?.remove();
      if (madeEditor) variableEditor.remove();
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

/** The selection's names (or values), one a line, on the clipboard; nothing where it is refused. */
function copyText(context: TableMenuContext, which: 'copyName' | 'copyValue'): void {
  const byId = new Map(context.rows.map((r) => [r.ID, r]));
  const ops = resolveOperands(context.selectedRowIds, context.rows);
  const lines = ops.deleteIds.map((id) => {
    const row = byId.get(id);
    return which === 'copyName' ? (row?.Name?.label ?? '') : cellText(row?.Value);
  });
  void navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
}
