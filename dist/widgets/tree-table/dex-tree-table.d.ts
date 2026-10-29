import { LitElement } from 'lit';
import { type DragMode } from '../shared/dragMode.js';
import type { AddTileDetail } from './dex-add-gallery.js';
import type { MatrixDescriptor } from '../../model/matrix/matrixPayload.js';
export interface TreeTableRow {
    ID: string;
    parent: string | null;
    Name: {
        label: string;
        iconId?: string;
        editable?: boolean;
        element?: boolean;
        clipboardMode?: string;
    };
    Value: {
        text: string;
        editable?: boolean;
        clipboardMode?: string;
        linkTarget?: string;
        editor?: string;
        options?: string[];
    } | string;
    _valueEditable?: boolean;
    _descriptionEditable?: boolean;
    _descriptionApplies?: boolean;
    _matrix?: MatrixDescriptor;
    _lazy?: boolean;
    DataType: {
        prefix?: string;
        text: string;
        clipboardMode?: string;
        linkTarget?: string;
    } | string;
    Class?: {
        text: string;
        clipboardMode?: string;
    } | string;
    Kind?: {
        text: string;
        clipboardMode?: string;
    } | string;
    Description: {
        text: string;
        clipboardMode?: string;
    } | string;
    Status: {
        text: string;
        clipboardMode?: string;
    } | string;
    UsedBy?: {
        text: string;
        linkTarget?: string;
    } | {
        links: {
            text: string;
            linkTarget: string;
        }[];
    } | string;
    _systemPath?: string;
    _blockPath?: string;
}
/** What `dex-edit-completed` carries: the cell, the text it had and the text typed. */
export interface EditCompletedDetail {
    rowId: string;
    columnId: string;
    oldValue: string;
    newValue: string;
}
/** What `dex-row-selected` carries: the selection, as `selectedRowIds` now holds it. */
export interface RowSelectedDetail {
    rowIds: string[];
}
/** What `dex-request-children` carries: the row whose children the payload held back. */
export interface RequestChildrenDetail {
    nodeId: string;
}
/**
 * What `dex-table-context-menu` carries: where to open the menu (viewport pixels), the row
 * right-clicked (null for the space under the rows), and, for a model's block row, the model the
 * row's `_graphTarget` names.
 */
export interface TableContextMenuDetail {
    x: number;
    y: number;
    rowId: string | null;
    graphTarget?: string;
}
/**
 * What `dex-row-drag-start` carries: the rows dragged — the selection when the row grabbed is in
 * it, else that row alone — less any section header.
 */
export interface RowDragStartDetail {
    rowIds: string[];
}
/** What `dex-row-drop` carries: the row let go on ('' for the space under the rows), and copy or move. */
export interface RowDropDetail {
    targetRowId: string;
    mode: DragMode;
}
/** What `dex-edit-text-request` carries: the row whose whole Value text the editor needs. */
export interface EditTextRequestDetail {
    rowId: string;
}
/** What `dex-link-clicked` carries: the `linkTarget` of the link clicked. */
export interface LinkClickedDetail {
    target: string;
}
/** What `dex-add-entry` carries: the tile's class, section and label, and whether to rename the row. */
export interface AddEntryDetail extends AddTileDetail {
    rename: boolean;
}
export interface BlockLinkGroup {
    modelName: string;
    blocks: {
        blockName: string;
        blockPath: string;
        linkTarget: string;
    }[];
}
/**
 * The tree table: a document's rows as a tree, with a search bar, sortable, resizable and
 * reorderable columns (the Columns menu shows, hides and orders them, and a right-click on a
 * header filters on that column), cell editors, row drag and drop, links, matrix glyphs, an
 * `+ Add` gallery and virtual scrolling for very large documents. Data comes in by properties
 * (`rows` above all) and every user action goes out as a `dex-*` event; it never changes the
 * document itself. Its defaults are a full editor; `readonly`, `canAdd` and `rowDrag` turn parts
 * of that off.
 *
 * @tagname dex-tree-table
 */
export declare class DexTreeTable extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The rows, flat: each names its parent by `ID` (`parent`, null at the top level), and
     * siblings show in the order given until the user sorts. What the model's buildRows (or
     * buildMatRows) makes of a document. Default none. Attribute `rows` (JSON); set the property.
     */
    rows: TreeTableRow[];
    /**
     * The ids of the selected rows. The table changes it as the user selects, and says so with
     * `dex-row-selected`; setting it sends nothing. Default none. Attribute `selectedrowids` (JSON).
     */
    selectedRowIds: string[];
    /**
     * A row's height in CSS pixels, which virtual scrolling lays the rows out at: the
     * `--dex-row-height` token when the page sets one, else this. Default 26. Attribute `rowheight`.
     */
    rowHeight: number;
    /**
     * `normal`, the default, rules every cell; `light` drops the lines between columns and keeps a
     * faint one between rows. Reflected to the attribute `table-style`.
     */
    tableStyle: 'normal' | 'light';
    /**
     * Each column's header text, by column key (`{ DataType: 'Data Type' }`), also the name a
     * search may qualify a term with (`"Data Type":double`); a column with none shows its key.
     * Default null. Attribute `columnlabels` (JSON).
     */
    columnLabels: Record<string, string> | null;
    /**
     * The group heading each column sits under in the Columns menu, by column key. Default null:
     * no headings. Attribute `columngroups` (JSON).
     */
    columnGroups: Record<string, string> | null;
    /**
     * The column keys this document has, which the Columns menu offers; the user's saved order and
     * choice of hidden ones apply within them. Default null: the built-in set. Attribute `columns`
     * (JSON).
     */
    columns: string[] | null;
    /**
     * The rows are on their way: while there are none, the table says Loading… (with a spinner,
     * after half a second) instead of "No data"; the search bar stays. Set it while a document is
     * read. Default false. Attribute `loading`.
     */
    loading: boolean;
    /**
     * Whether this view can create entries, i.e. whether the `+ Add` button (and its gallery,
     * whose tiles send `dex-add-entry`) exists at all. Default false. Attribute `canadd`.
     */
    canAdd: boolean;
    /**
     * The classes a MAT-file's gallery offers, as its host says core lists them (setRows'
     * `add: {classes}`), or null, the default, for a dictionary's gallery, which offers every tile.
     * The gallery draws the tiles of these classes only (matCatalog). Property only.
     */
    addClasses: readonly string[] | null;
    /**
     * Whether a row can be dragged, or a dragged row let go over one. False where the document is
     * read-only (table-main sets it from setRows' `editable`): no row is draggable, and a drag from
     * another table draws no drop target here, on a row or on the empty body. Default true.
     * Attribute `rowdrag`.
     */
    rowDrag: boolean;
    /**
     * A viewer: the user selects, opens, searches, sorts, filters and copies, and changes nothing.
     * No cell editor opens — not on a double-click, not on Enter, not for beginRename or
     * openWholeValueEditor — and no cell is drawn as editable; the `+ Add` button is not drawn
     * whatever canAdd says, and no row is dragged or takes a drop whatever rowDrag says. So none of
     * the events those gestures send (dex-edit-completed, dex-edit-text-request, dex-add-entry,
     * dex-row-drag-start, dex-row-drop) is sent. A right-click still sends dex-table-context-menu:
     * what a read-only menu offers is the app's to say (buildContextMenuItems with editable false).
     * False, the default, is the table as it always was, each cell's own flags deciding. Reflected
     * to the attribute `readonly`.
     */
    readonly: boolean;
    private get _addsEntries();
    private get _dragsRows();
    /**
     * Where the user's column choices (which are shown, and their order) are kept: the page's
     * localStorage, under `<storageKey>-column-order`, `<storageKey>-hidden-columns` and
     * `<storageKey>-known-columns`. The default, 'dex', is the keys every table has always used,
     * so a layout saved before this existed carries over — and every table on the page that keeps
     * the default shares one layout. An app gives each kind of table a key of its own, or null
     * (or '') to keep the choices for this element's life only, with localStorage never touched.
     * They are read when the table is connected, so a key set before then is the only one read; one
     * set later reads again, from that key. Attribute `storage-key`.
     */
    storageKey: string | null;
    /**
     * The last of `selectedRowIds`, or '' when nothing is selected; set, it selects that row alone
     * ('' selects nothing). Sends nothing.
     */
    get selectedRowId(): string;
    set selectedRowId(id: string);
    private _expandedIds;
    /**
     * The rows shown open, by id: a copy, the caller's to keep.
     *
     * Set it to open exactly these rows — an expansion the app saved, or the one it read before
     * giving the table new rows (nextExpandedIds keeps those that still exist). An id with no row is
     * kept, and opens its row if one comes. Setting it fetches nothing; expand() is the twisty's
     * click, which asks for children the payload held back.
     */
    get expandedIds(): Set<string>;
    set expandedIds(ids: Iterable<string>);
    /**
     * Opens these rows as a click on each one's twisty does: a row with nothing under it stays
     * closed, and a row whose children the payload held back (`_lazy`) asks for them once
     * (dex-request-children). Read off `rows` as they are now, so it may follow an assignment of
     * them directly.
     */
    expand(ids: Iterable<string>): void;
    /** Closes these rows. */
    collapse(ids: Iterable<string>): void;
    /**
     * The expansion an app otherwise keeps around every assignment of `rows`, kept by the table
     * (nextExpandedIds): the first rows with any in them open their top level — a dictionary's
     * sections, a MAT-file's variables, though not one whose children were held back, whose first
     * click fetches — and from then on the rows the user opened stay open while they exist, and
     * what they closed stays closed. Off, the default, a change of `rows` leaves the expansion as it
     * was, to the app (expandedIds). Attribute `expand-top-level`.
     */
    expandTopLevel: boolean;
    private _shownRows;
    private _filterText;
    private _filterParseCache;
    private _stickyRowIds;
    private _awaitedWholeValue;
    private _editingCell;
    private _scrollTop;
    private _viewportHeight;
    private _focusedCol;
    private _lastClickedId;
    private _focusedRowId;
    private _dragSourceId;
    private _dropTargetId;
    private _dropPosition;
    private _dropForbidden;
    private _dropTooltip;
    private _dropTooltipX;
    private _dropTooltipY;
    private _dragIconId;
    private _dragLabel;
    private _dragCount;
    private _lastDragMode;
    /**
     * Predicts a drop for the row under the cursor ('' for the empty body), injected by the
     * host-side glue (table-main) and backed by the pure dropDecision: whether it may drop, the
     * cursor and the tooltip to show, and whether it would change nothing. Returns null when it
     * cannot predict — no drag it was told about, or a target with no rule — and null REFUSES:
     * with glue present, "cannot say" is not "yes". Only a table with no predictor at all, the
     * default, falls back to the built-in permissive drag behavior, so it is usable without the
     * glue. Property only.
     */
    dropPredictor: ((targetRowId: string, mode: 'copy' | 'move') => {
        canDrop: boolean;
        cursor: string;
        tooltip: string;
        noop: boolean;
    } | null) | null;
    private _scrolledX;
    private _columnWidths;
    private _columnOrder;
    private _hiddenColumns;
    private _sortState;
    private _columnMenuOpen;
    private _columnMenuX;
    private _columnMenuY;
    private _menuDragCol;
    private _menuDragOverCol;
    private _menuDragOverSide;
    private _addGalleryOpen;
    private _addPinned;
    private _filterPopupCol;
    private _filterPopupX;
    private _filterPopupY;
    private _resizingCol;
    private _resizeStartX;
    private _resizeStartWidth;
    private _resizeNextCol;
    private _resizeNextStartWidth;
    private _suppressNextHeaderClick;
    private _dragColId;
    private _dragOverColId;
    private _dragOverSide;
    private _filterBar?;
    private _container;
    private get _rowH();
    private _visibleRowsCache;
    private _depthCache;
    private _childCounts;
    private _lazyIds;
    private _pendingChildren;
    private _lastRowsRef;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private _boundOnDocClick;
    private _boundOnWindowBlur;
    private _onWindowBlur;
    private _onDocumentClick;
    private _loadedStorageKey;
    private _loadPersistedState;
    private _readKnownColumns;
    private _persistOrder;
    private _persistHidden;
    private get _availableColumns();
    private get _orderedColumns();
    private get _visibleColumns();
    private _getColWidth;
    private _defaultColWidth;
    private get _minTableWidth();
    private _onResizeMouseDown;
    private _onResizeDblClick;
    private _onHeaderDragStart;
    private _onHeaderDragOver;
    private _onHeaderDragLeave;
    private _onHeaderDrop;
    private _onHeaderDragEnd;
    private _onAddButtonClick;
    /**
     * Open or close the Add gallery, anchored under the Add button.
     *
     * Public because the keyboard's way in comes from outside this element: the host's
     * `dataExplorer.addEntry` command posts `openAddGallery`, and table-main calls this. It
     * TOGGLES, so the accelerator behaves exactly as the button does rather than being a
     * second, subtly different way to open the same popover.
     *
     * Opening is one flag because the popover is anchored in CSS, so both callers land on the
     * same geometry without either of them measuring anything. A view that cannot add has no
     * Add button and nothing to open — the command is a no-op there, which is the right answer
     * for a read-only .slx: the keybinding's `when` clause already excludes that view, but the
     * Command Palette does not have to.
     */
    toggleAddGallery(): void;
    private _closeAddGallery;
    private _onAddTile;
    /**
     * Open the inline name editor on a row, from outside the component.
     *
     * The host asks for this after creating an entry from the gallery (`beginRename`), and it
     * goes through the very path a double-click takes — `_cellEditTarget`, which is the one
     * place that knows whether a cell may be edited at all. So a row whose Name the host would
     * refuse gets no editor rather than one whose commit bounces. Returns whether the editor
     * opened, so a caller can keep holding a request whose row has not arrived yet.
     */
    beginRename(rowId: string): boolean;
    private _onColumnsButtonClick;
    private _openColumnFilter;
    private _onHeaderContextMenu;
    private _onFunnelClick;
    /** The token in the applied text scoped to `col`, if there is one. */
    private _tokenForColumn;
    private _applyColumnFilter;
    private _clearColumnFilter;
    private _setFilterText;
    private _onColumnFilterApplied;
    private _onColumnFilterCleared;
    private _toggleColumnVisibility;
    private _resetColumns;
    private _onMenuDragStart;
    private _onMenuDragOver;
    private _onMenuDragLeave;
    private _onMenuDrop;
    private _onMenuDragEnd;
    private _onHeaderClick;
    private _getAriaSortValue;
    private _getSortIndicator;
    private _renderFunnel;
    private _sortSiblings;
    private _getCellText;
    private _getCellSortText;
    firstUpdated(): void;
    private _resizeObserver;
    updated(changedProps: Map<string, unknown>): void;
    private _lastStartIdx;
    private _onScroll;
    private _invalidateCache;
    private _buildCaches;
    private _getVisibleRows;
    private _parseFilterExpression;
    private get _filterParse();
    private get _filterTerms();
    private get _filterTokens();
    private _filterRows;
    private _flattenToVisible;
    /**
     * Whether this row has anything to show when opened.
     *
     * ONE rule, read by all three gestures that can open a row — the twisty's click, the
     * Space key, and `aria-expanded` for a screen reader. They were three copies of
     * `_childCounts.has(id)`, which is the shape of defect this repo keeps relearning:
     * add a second way for a row to have children and two of the three silently keep the
     * old answer, so a tree a mouse can open is a tree a keyboard cannot.
     *
     * The second way is a deferred row, whose children exist in the file and not in the
     * table (host: lazyRows.ts).
     */
    private _canExpand;
    private _toggleExpand;
    private _requestChildren;
    private _expandAncestors;
    private _onContainerContextMenu;
    private _onRowContextMenu;
    private _onCellClick;
    private _onRowClick;
    private _dragModeFrom;
    private _onRowDragStart;
    private _setDragImage;
    private _onRowDragEnd;
    private _onRowDragOver;
    private _isRowOrHeaderEvent;
    private _onBodyDragOver;
    private _onBodyDrop;
    private _onRowDragLeave;
    private _onRowDrop;
    /**
     * What a double-click on this cell would open, or null when the cell has no editor.
     *
     * Extracted so that editability is decided ONCE and read twice: here by the
     * double-click handler that opens the editor, and by `_cellStateClass` below, whose
     * `cell-editable` class draws a field boundary promising that an editor is there.
     * Written out separately they were the same knowledge in two places — this table's
     * recurring bug class — and the failure is worse than a missing cue: a boundary over
     * a cell that will not open teaches the user to distrust the one signal the design
     * rests on. treeTableCellStates.test.ts pins the two against each other.
     */
    private _cellEditTarget;
    /**
     * Which of the three cell states this cell is in, as a class the stylesheet acts on:
     * `cell-editable`, `cell-readonly`, or `cell-readonly cell-blank` when the column does
     * not apply to this row at all.
     *
     * Emptiness is decided by `_getCellText` — the same string this table searches, sorts
     * and copies by — so "this cell is blank" means one thing across the component instead
     * of one thing per column renderer. Several renderers return `html``` for an empty
     * value, i.e. no element at all, which is exactly why the state has to live on the
     * <td>: there is nothing inside an empty cell to hang it on.
     *
     * But emptiness ALONE is not the state. An empty cell means one of two different things
     * and only one of them is worth drawing:
     *   - the property does not exist for this kind of object (a Simulink.Bus has no value,
     *     a service bus has no data type) — nothing will ever go here;
     *   - the property exists and is simply unset (no usage recorded, not modified, no unit
     *     given) — an empty VALUE, which is ordinary and needs no cue.
     * Read off a blank, only NOT_APPLICABLE_WHEN_BLANK columns are the first kind (core can
     * also say so outright of a Description: propertyAbsent). Measured over five real
     * dictionaries with every column shown, the second kind is the overwhelming majority:
     * Usage, Status, Unit and Header File are blank on 100% of rows, Storage Class and
     * Alignment on 97%, Dimensions/Dimensions Mode/Complexity/Min/Max on 87-91%, Last
     * Modified on 81%. Washing those painted whole columns solid, which is what it looks
     * like — a cue carried by every row in a column distinguishes nothing, it just
     * redecorates the table. Value (11%) and Data Type (26%) are the only columns where a
     * blank is genuinely exceptional.
     */
    private _cellStateClass;
    private _onCellDblClickIfEditable;
    /**
     * Open the Value editor of `rowId` on `text`, the whole value its summary stands for, which the
     * host sent in answer to this table's `dex-edit-text-request`. In the textarea, as the text is one
     * long line of up to 200,000 characters; committed unchanged it posts nothing, and changed it
     * posts the whole text. Only the answer to the last request opens an editor, and only while no
     * other editor is open and the cell still takes this one: an answer that arrives after the user
     * moved on opens nothing.
     */
    openWholeValueEditor(rowId: string, text: string): void;
    private _onTableKeyDown;
    private _selectAll;
    private _selectAndScroll;
    private _extendSelection;
    private _rangeSelect;
    private _scrollToRow;
    private _onCellDblClick;
    private _onEditKeyDown;
    private _onTextAreaKeyDown;
    private _closeEditorIfCellNoLongerEditable;
    private _focusTable;
    private _onEditBlur;
    private _isEditorFor;
    private _commitEdit;
    /** Focus (and select) the search input — e.g. for a Ctrl+F shortcut. */
    focusFilter(): void;
    private _newSearch;
    private _onLinkClick;
    private _highlight;
    private _renderMatrixGlyph;
    private _renderParamLinks;
    private _renderEditor;
    private _renderCellValue;
    willUpdate(changedProps: Map<string, unknown>): void;
    private _scrollToSelectedRow;
    /** Flashes a row's background once, on the next render, as a copy does; nothing if it is not drawn. */
    flashRow(rowId: string): void;
    private _pendingFlashId;
    private _noMatchMessage;
    private _renderFilterBar;
    render(): import("lit-html").TemplateResult<1>;
    private _renderNoRows;
    private _renderTable;
    private _renderDropTooltip;
    private _renderAddButton;
    /**
     * The gallery, rendered INSIDE the search bar — not beside it as the other popovers are.
     *
     * That is what pays for the stylesheet doing all the positioning: an absolute box measures
     * its percentages against the bar, so "as wide as the tab, inset, just underneath" is three
     * declarations that keep being true while the tab is resized. Out of flow, so being a child
     * of a flex row costs the bar nothing. Right after the Add button, which is also where the
     * keyboard wants it: Tab from the pressed button reaches the tiles.
     */
    private _renderAddGallery;
    private _renderColumnsButton;
    private _renderColumnFilterPopup;
    private _renderColumnMenu;
}
/**
 * Registers the widget as `<dex-tree-table>`, or under `tag`, after the parts its template draws,
 * which keep their default names: the + Add gallery, the column-filter popup, the filter bar, the
 * icon and the matrix glyph. Parts first, so a part whose name is taken throws before the table
 * is registered at all.
 */
export declare function defineTreeTable(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-tree-table': DexTreeTable;
    }
    interface HTMLElementEventMap {
        /**
         * The user changed the selection: a click, Ctrl/Cmd- or Shift-click, a key, select-all, or a
         * right-click on a row not in it.
         */
        'dex-row-selected': CustomEvent<RowSelectedDetail>;
        /**
         * A row whose children the payload held back (`_lazy`) was opened: answer with its rows.
         * Asked once until its rows arrive.
         */
        'dex-request-children': CustomEvent<RequestChildrenDetail>;
        /**
         * A right-click on a row (after selecting it) or on the space under the rows: open a context
         * menu there.
         */
        'dex-table-context-menu': CustomEvent<TableContextMenuDetail>;
        /** The user started dragging rows. */
        'dex-row-drag-start': CustomEvent<RowDragStartDetail>;
        /** A drag of this table's rows ended, dropped or not. No detail. */
        'dex-row-drag-end': CustomEvent<null>;
        /**
         * Rows were let go over a row the dropPredictor accepts (any row, with no predictor), or over
         * the space under the rows when it accepts that.
         */
        'dex-row-drop': CustomEvent<RowDropDetail>;
        /** A Value editor is opening on a summary: send the whole text with openWholeValueEditor. */
        'dex-edit-text-request': CustomEvent<EditTextRequestDetail>;
        /** A cell edit was committed with a text that differs from the one it had. */
        'dex-edit-completed': CustomEvent<EditCompletedDetail>;
        /**
         * A link in a cell was clicked: any cell whose text names its `linkTarget` (a Data Type, Used
         * By, a block, a parameter).
         */
        'dex-link-clicked': CustomEvent<LinkClickedDetail>;
        /** A tile of the `+ Add` gallery was clicked: add one entry of that class, renaming it if `rename`. */
        'dex-add-entry': CustomEvent<AddEntryDetail>;
    }
}
