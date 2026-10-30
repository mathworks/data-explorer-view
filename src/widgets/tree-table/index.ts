// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/tree-table`: the tree table, the parts it draws (filter bar, column filter,
// Add gallery, matrix glyph), connectTable, which feeds one from a table source, and the context
// menu's items for a row selection. defineTreeTable defines the parts too; their classes and
// defines are here for an app that holds one or names its type.
export { DexTreeTable, defineTreeTable } from './dex-tree-table.js';
export { connectTable } from './connectTable.js';
export type {
  ConnectTableOptions,
  CopyFailure,
  NavigateRequest,
  TableAction,
  TableHandle,
  TableHandleEventMap,
  TableMenuContext,
} from './connectTable.js';
export type { TableTextView } from './editingWire.js';
export type {
  AddEntryDetail,
  EditCompletedDetail,
  EditTextRequestDetail,
  LinkClickedDetail,
  RequestChildrenDetail,
  RowDragStartDetail,
  RowDropDetail,
  RowSelectedDetail,
  TableBanners,
  TableContextMenuDetail,
  TreeTableEventMap,
  TreeTableRow,
} from './dex-tree-table.js';
export { DexFilterBar, defineFilterBar } from './dex-filter-bar.js';
export type { FilterAppliedDetail, FilterBarEventMap } from './dex-filter-bar.js';
export { DexColumnFilter, defineColumnFilter } from './dex-column-filter.js';
export type { ColumnFilterAppliedDetail, ColumnFilterClearedDetail, ColumnFilterEventMap } from './dex-column-filter.js';
export { DexAddGallery, defineAddGallery } from './dex-add-gallery.js';
export type { AddGalleryEventMap, AddPinChangedDetail, AddTileDetail } from './dex-add-gallery.js';
export { DexMatrixOpen, defineMatrixOpen } from '../shared/dex-matrix-open.js';
export type { MatrixOpenDetail, MatrixOpenEventMap } from '../shared/dex-matrix-open.js';
export {
  buildContextMenuItems,
  resolveShortcutAction,
  shouldOpenCellEditor,
  shouldShowContextMenu,
} from './menuItems.js';
export type { ClipboardState, MenuInput, MenuRow, PasteTarget, ShortcutAction } from './menuItems.js';
