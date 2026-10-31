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
import { defineContextMenu } from '../context-menu/dex-context-menu.js';
import { defineVariableEditor } from '../variable-editor/dex-variable-editor.js';
import { defineErrorDialog } from '../error-dialog/dex-error-dialog.js';
import { insertEntryRows, mergeChildRows, pendingSelectionToApply, spliceEntryRows } from '../../model/actions/rowUpdates.js';
import { resolveOperands } from '../../model/actions/operands.js';
import { isSectionRowId } from '../../model/ids/sectionRowId.js';
import { localLinkName, parseLinkTarget } from '../../model/ids/linkTarget.js';
import { isEditable, isSourceClosed, } from '../../model/source/tableSource.js';
import { wireEditing } from './editingWire.js';
function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
const messageOf = (err) => (err instanceof Error ? err.message : String(err));
// The table each context menu was last opened for, by menu: every table connected to a shared
// menu hears each of its choices, and the one that opened it is the one that acts.
const menuOwners = new WeakMap();
/** The text of a cell, as the table shows it. */
function cellText(cell) {
    if (typeof cell === 'string')
        return cell;
    if (isRecord(cell) && typeof cell.text === 'string')
        return cell.text;
    return '';
}
/**
 * Wire `table` to `source`: show what it answers, and answer what the table asks. Returns the
 * handle that says what the app is to do (`on`), and through which it selects.
 *
 * The table is left to the app in what it is (`readonly`, `canAdd`, `rowDrag`, `storageKey`):
 * connectTable sets `loading` until the first paint, `expandTopLevel`, and what each paint says.
 */
export function connectTable(table, source, options = {}) {
    const cleanups = [];
    const listen = (target, type, listener, capture = false) => {
        target.addEventListener(type, listener, capture);
        cleanups.push(() => target.removeEventListener(type, listener, capture));
    };
    const listeners = {
        select: new Set(),
        navigate: new Set(),
        action: new Set(),
        copyFailed: new Set(),
    };
    const emit = (type, detail) => {
        for (const listener of [...listeners[type]])
            listener(detail);
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
    let editing = null;
    let view;
    let docUri = '';
    let disposed = false;
    // --- Banners ---------------------------------------------------------------------------------
    let banners = {};
    const drawBanners = (next) => {
        banners = next;
        if (options.banners)
            options.banners({ ...banners });
        else
            table.banners = banners.error || banners.notice || banners.warnings ? { ...banners } : null;
    };
    const showError = (message) => drawBanners({ ...banners, error: message });
    // --- Columns ---------------------------------------------------------------------------------
    const chosen = options.columns;
    const chooseColumns = (next) => {
        if (chosen === undefined)
            return next.columns;
        const keep = typeof chosen === 'function' ? (c) => chosen(c, next) : (c) => chosen.includes(c);
        return next.columns.filter(keep);
    };
    // --- Rows ------------------------------------------------------------------------------------
    const selectedRowIds = () => (Array.isArray(table.selectedRowIds) ? table.selectedRowIds : []);
    const rowsNow = () => (Array.isArray(table.rows) ? table.rows : []);
    // The rows asked to be selected once they are all present (select()): after a rename (the row's
    // id changes) and after an edit that adds rows. Applied as soon as they all exist.
    let pendingSelectIds = [];
    const applyPendingSelection = () => {
        const toSelect = pendingSelectionToApply(rowsNow(), pendingSelectIds);
        if (!toSelect)
            return;
        table.selectedRowIds = toSelect;
        emit('select', toSelect);
        pendingSelectIds = [];
    };
    // A row to open the name editor on once it exists (beginRename()). Cleared whether or not the
    // editor opened: a row that is present and NOT renameable is an answer, not a wait.
    let pendingRenameId = null;
    const applyPendingRename = () => {
        if (!pendingRenameId)
            return;
        if (!rowsNow().some((r) => r.ID === pendingRenameId))
            return;
        table.beginRename(pendingRenameId);
        pendingRenameId = null;
    };
    // A name to select once its row exists (selectByName(), a local link).
    let pendingSelectName = null;
    const applyPendingNameSelection = () => {
        if (!pendingSelectName)
            return;
        const rows = rowsNow();
        // A top-level ENTRY: its parent is a section header or, in a table with no section rows (a
        // MAT-file's), it has no parent and is no header itself.
        const isEntry = (r) => (typeof r.parent === 'string' ? isSectionRowId(r.parent) : !isSectionRowId(r.ID));
        const named = (r) => r.Name?.label === pendingSelectName;
        // Entries first, because every by-name target means the top-level one: a nested row that
        // shares the name is not what a link means. Then any row, for a block named before SIDs;
        // then a block by its key, which no cell prints.
        const match = rows.find((r) => named(r) && isEntry(r)) ?? rows.find(named) ?? rows.find((r) => r._blockKey === pendingSelectName);
        if (!match)
            return;
        table.selectedRowIds = [match.ID];
        emit('select', [match.ID]);
        pendingSelectName = null;
    };
    // A selection whose every row a repaint removed is cleared, and said, ONE TASK later rather
    // than in the repaint: a repaint and a select() that follows it (a rename: the old id goes,
    // then the new one is selected) must not read as "nothing selected" and then the new row.
    let vanishedClear = null;
    const cancelVanishedClear = () => {
        if (vanishedClear === null)
            return;
        clearTimeout(vanishedClear);
        vanishedClear = null;
    };
    const scheduleVanishedClear = () => {
        cancelVanishedClear();
        vanishedClear = setTimeout(() => {
            vanishedClear = null;
            const present = new Set(rowsNow().map((r) => r.ID));
            const selection = selectedRowIds();
            if (selection.length === 0 || selection.some((id) => present.has(id)))
                return;
            table.selectedRowIds = [];
            emit('select', []);
        }, 0);
    };
    // Hand a new row array to the table and re-derive everything that depends on it: every repaint
    // (a whole paint, one entry's, a row's children) comes here, so no path can drift from another.
    const installRows = (rows) => {
        const prevSelected = selectedRowIds();
        // The expansion is the table's (expandTopLevel); the rows a search shows are kept with it.
        table._replaceRows(rows, pendingSelectIds);
        const present = new Set(rows.map((r) => r.ID));
        const stillSelected = prevSelected.filter((id) => present.has(id));
        const vanished = prevSelected.length > 0 && stillSelected.length === 0;
        if (stillSelected.length > 0)
            table.selectedRowIds = stillSelected;
        table.requestUpdate();
        applyPendingSelection();
        applyPendingNameSelection();
        if (vanished && !selectedRowIds().some((id) => present.has(id)))
            scheduleVanishedClear();
        // After the selection, which expands the row's ancestors and scrolls it into view: an editor
        // opened on a row hidden under a collapsed section would be a table that stopped answering.
        applyPendingRename();
    };
    /** A whole paint: open()'s answer, or a replaceAll. */
    const paint = (next) => {
        view = next;
        if (next.docUri)
            docUri = next.docUri;
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
    const failed = (message) => {
        table.loading = false;
        showError(message);
    };
    // What a source that is told of its paint (`opened`: an in-page engine) says while a paint is
    // being asked for: held from the ask until the paint, and what follows it, are in, and then taken
    // in the order it was said. Taken before the rows, it would land on a table that has not got
    // them, and the rows, built before it, would land over it. Any other source (a host across a
    // channel, which says things in its own order) is taken as it arrives.
    let held = null;
    const release = () => {
        const queued = held ?? [];
        held = null;
        for (const change of queued)
            onChange(change);
    };
    /** The table and its source are out of step: ask for the whole table again. */
    const reopen = () => {
        if (source.opened)
            held ??= [];
        source.open().then((v) => {
            if (disposed)
                return;
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
            if (!disposed && !isSourceClosed(err))
                failed(messageOf(err));
            release();
        });
    };
    const onChange = (change) => {
        if (disposed)
            return;
        if (held) {
            held.push(change);
            return;
        }
        switch (change.kind) {
            case 'replaceAll':
                return paint(change.view);
            case 'updateEntry':
            case 'insertEntry': {
                const spliced = change.kind === 'updateEntry'
                    ? spliceEntryRows(rowsNow(), change.entryRowId, change.rows)
                    : insertEntryRows(rowsNow(), change.sectionRowId, change.beforeRowId, change.rows);
                // The table does not hold the entry the source repainted, so a splice would drop the edit.
                if (!spliced)
                    return reopen();
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
        const detail = e.detail;
        if (!detail?.matrix || !detail.anchorEl)
            return;
        const nodeId = detail.matrix.nodeId;
        if (typeof nodeId !== 'string' || nodeId === '')
            return;
        variableEditor.show(detail.anchorEl, detail.matrix);
        void source.matrix(nodeId).then((page) => void variableEditor.deliver(page), () => { });
    });
    // A row whose children the paint held back was opened. The table marks it asked-about, so a
    // second click does not ask again.
    listen(table, 'dex-request-children', (e) => {
        const nodeId = e.detail?.nodeId;
        if (typeof nodeId !== 'string' || nodeId === '')
            return;
        source.children(nodeId).then((answer) => {
            if (disposed || !Array.isArray(answer.rows))
                return;
            // Merged in place: the banners, the columns, the selection and an open grid stay.
            const merged = mergeChildRows(rowsNow(), answer.nodeId, answer.rows);
            // No row by that id any more: a repaint rebuilt the tree while the fetch was in flight.
            if (merged)
                installRows(merged);
            // Children that got no row would otherwise read as the whole list.
            if (merged && answer.truncated > 0) {
                showError(`This item has more rows than one view can show: ${answer.truncated.toLocaleString('en-US')} ` +
                    'of its contents are not listed.');
            }
        }, () => { });
    });
    listen(table, 'dex-row-selected', (e) => {
        emit('select', e.detail?.rowIds ?? []);
    });
    // A Data Type link names a row of this table; every other target is for whoever opens
    // documents, and so is a local one whose row is not here after all. The app's resolveLink names
    // the file of any other first: a link it resolves to this document is local too. One rule
    // decides, asked of the target as it is or of its entry in the file resolveLink named.
    const localName = (target, link, uri) => localLinkName(uri === undefined ? target : link.kind === 'entry' ? `${link.name}@${uri}` : '', docUri);
    const follow = (target, link, uri) => {
        const navigate = () => emit('navigate', { target, link, ...(uri === undefined ? {} : { uri }) });
        const name = localName(target, link, uri);
        if (name === null)
            return navigate();
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
        if (typeof target !== 'string')
            return;
        const link = parseLinkTarget(target);
        const resolveLink = options.resolveLink;
        if (!resolveLink || localName(target, link, undefined) !== null)
            return follow(target, link, undefined);
        const from = docUri;
        Promise.resolve()
            .then(() => resolveLink(link, from))
            .catch(() => undefined)
            .then((uri) => {
            if (!disposed)
                follow(target, link, typeof uri === 'string' && uri !== '' ? uri : undefined);
        });
    });
    // Ctrl/Cmd+F: the search box. Not with modifiers the table does not own.
    listen(table, 'keydown', (ev) => {
        if ((ev.key === 'f' || ev.key === 'F') && (ev.metaKey || ev.ctrlKey) && !ev.shiftKey && !ev.altKey) {
            ev.preventDefault();
            ev.stopPropagation();
            table.focusFilter();
        }
    }, true);
    // --- Editing -----------------------------------------------------------------------------------
    const selectRows = (rowIds) => {
        cancelVanishedClear();
        pendingSelectIds = rowIds.filter((id) => typeof id === 'string');
        applyPendingSelection();
    };
    const beginRenameRow = (rowId) => {
        pendingRenameId = typeof rowId === 'string' ? rowId : null;
        applyPendingRename();
    };
    if (options.editing) {
        editing = wireEditing({
            table,
            source: isEditable(source) ? source : null,
            textView: options.textView,
            undoChords: !!options.undoChords,
            errorDialog: dialog,
            listen: (type, listener, capture = false) => {
                table.addEventListener(type, listener, capture);
                cleanups.push(() => table.removeEventListener(type, listener, capture));
            },
            selectedRowIds,
            rowsNow: () => rowsNow(),
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
    let menuContext = null;
    const menuOwner = {};
    const onAction = (e) => {
        const context = menuContext;
        menuContext = null;
        if (!context || menuOwners.get(e.currentTarget) !== menuOwner)
            return;
        const actionId = e.detail?.actionId;
        // The editing menu's own items are commands, anchored where the menu was opened.
        if (editing && typeof actionId === 'string' && editing.act(actionId, context.rowId))
            return;
        if (actionId === 'copyName' || actionId === 'copyValue')
            return void copyText(context, actionId);
        if (typeof actionId === 'string')
            emit('action', { actionId, rowId: context.rowId, rowIds: context.selectedRowIds });
    };
    const onMenuClosed = () => {
        menuContext = null;
    };
    // Copy Name and Copy Value. A copy that fails is said in the error banner, over whatever error
    // was there, which the next copy that succeeds gives back (a repaint draws its own).
    const copy = options.copy ?? pageClipboard;
    let copyError = null;
    const copyText = (context, which) => {
        const text = selectionText(context, which);
        let copying;
        try {
            copying = Promise.resolve(copy(text));
        }
        catch (err) {
            copying = Promise.reject(err);
        }
        copying.then(() => {
            if (disposed)
                return;
            if (copyError && banners.error === copyError.shown)
                showError(copyError.covered);
            copyError = null;
        }, (err) => {
            if (disposed)
                return;
            const message = messageOf(err);
            const shown = `Could not copy to the clipboard: ${message}`;
            const covered = copyError && banners.error === copyError.shown ? copyError.covered : banners.error;
            copyError = { shown, covered };
            showError(shown);
            emit('copyFailed', { text, message });
        });
    };
    if (options.menu !== false) {
        listen(table, 'dex-table-context-menu', (e) => {
            const { x, y, rowId } = e.detail;
            const context = { rowId: rowId ?? null, selectedRowIds: [...selectedRowIds()], rows: rowsNow() };
            if (editing && !editing.menuAllowed(context.rowId))
                return;
            // The editing menu is for the current selection, but a right-click on no row is a gesture
            // on the document, whose menu is the one a selection of nothing gets.
            const items = editing
                ? editing.menuFor(context.rowId, context.rowId === null ? [] : context.selectedRowIds)
                : [...readOnlyItems(context)];
            const extra = options.menuItems?.(context) ?? [];
            if (items.length > 0 && extra.length > 0)
                items.push({ id: '', label: '', separator: true });
            items.push(...extra);
            if (items.length === 0)
                return;
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
    const pageListeners = new Set();
    let inspected = null;
    // What the inspector was last given, as the extension's InspectorPage keeps it: its groups, and
    // the cells its variable editor was given for them. A page that shows exactly that again is not
    // sent, so an edit elsewhere in the document does not close a grid open on this row.
    let shown = null;
    let asking = 0;
    const send = (page) => {
        for (const listener of [...pageListeners])
            listener(page);
    };
    /** Whether the grid open on the inspector's row would show other cells for `rowId`'s. */
    const cellsChanged = async (rowId) => {
        if (!shown?.cells)
            return false;
        // Another row's grid is another grid, whatever its cells.
        if (shown.cells.nodeId !== rowId)
            return true;
        return JSON.stringify(await source.matrix(rowId)) !== shown.cells.page;
    };
    /** Show the first row of `rowIds`; on a refresh, leave a row that is gone to the selection. */
    const inspect = (rowIds, refresh) => {
        if (pageListeners.size === 0)
            return;
        const ask = ++asking;
        void source.inspect(rowIds).then(async (page) => {
            if (ask !== asking || disposed)
                return;
            if (page.rowId === undefined) {
                if (refresh)
                    return;
                shown = null;
                return send({ groups: [] });
            }
            const groups = JSON.stringify(page.groups);
            if (shown && shown.groups === groups && !(await cellsChanged(page.rowId)))
                return;
            if (ask !== asking)
                return;
            shown = { groups, cells: null };
            send(page);
        }, () => { });
    };
    const refreshInspector = () => {
        if (inspected)
            inspect(inspected, true);
    };
    const followSelection = (rowIds) => {
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
            listeners[type].add(listener);
            return () => void listeners[type].delete(listener);
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
        undo() {
            editing?.history('undo');
        },
        redo() {
            editing?.history('redo');
        },
        onPage(listener) {
            pageListeners.add(listener);
            if (inspected)
                inspect(inspected, false);
            return () => void pageListeners.delete(listener);
        },
        async matrix(nodeId) {
            const page = await source.matrix(nodeId);
            if (shown)
                shown.cells = { nodeId, page: JSON.stringify(page) };
            return page;
        },
        dispose() {
            if (disposed)
                return;
            disposed = true;
            unsubscribe();
            cancelVanishedClear();
            for (const cleanup of cleanups.splice(0))
                cleanup();
            if (contextMenu && menuListening) {
                contextMenu.removeEventListener('dex-action', onAction);
                contextMenu.removeEventListener('dex-menu-closed', onMenuClosed);
            }
            if (madeMenu)
                contextMenu?.remove();
            if (madeEditor)
                variableEditor.remove();
            if (madeDialog)
                dialog?.remove();
            for (const set of Object.values(listeners))
                set.clear();
            pageListeners.clear();
        },
    };
}
/** The menu a read-only table gives a selection: its names and values, to copy. */
function readOnlyItems(context) {
    const ops = resolveOperands(context.selectedRowIds, context.rows);
    if (ops.deleteIds.length === 0)
        return [];
    return [
        { id: 'copyName', label: 'Copy Name', icon: 'copy' },
        { id: 'copyValue', label: 'Copy Value' },
    ];
}
/** The selection's names (or values), one a line: what Copy Name (or Copy Value) copies. */
function selectionText(context, which) {
    const byId = new Map(context.rows.map((r) => [r.ID, r]));
    const ops = resolveOperands(context.selectedRowIds, context.rows);
    const lines = ops.deleteIds.map((id) => {
        const row = byId.get(id);
        return which === 'copyName' ? (row?.Name?.label ?? '') : cellText(row?.Value);
    });
    return lines.join('\n');
}
/** The page's clipboard, which a page without one fails like one that refuses. */
function pageClipboard(text) {
    if (!navigator.clipboard?.writeText) {
        return Promise.reject(new Error('this page has no clipboard access'));
    }
    return navigator.clipboard.writeText(text);
}
