import { LitElement } from 'lit';
import type { MatrixDescriptor } from '../variable-editor/dex-matrix-grid.js';
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
export interface EditCompletedDetail {
    rowId: string;
    columnId: string;
    oldValue: string;
    newValue: string;
}
export interface BlockLinkGroup {
    modelName: string;
    blocks: {
        blockName: string;
        blockPath: string;
        linkTarget: string;
    }[];
}
export declare class DexTreeTable extends LitElement {
    static styles: import("lit").CSSResult[];
    rows: TreeTableRow[];
    selectedRowIds: string[];
    rowHeight: number;
    tableStyle: 'normal' | 'light';
    columnLabels: Record<string, string> | null;
    columnGroups: Record<string, string> | null;
    columns: string[] | null;
    loading: boolean;
    canAdd: boolean;
    addClasses: readonly string[] | null;
    rowDrag: boolean;
    get selectedRowId(): string;
    set selectedRowId(id: string);
    private _expandedIds;
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
}
