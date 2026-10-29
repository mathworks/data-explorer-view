// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/tree-table`: the tree table, the parts it draws (filter bar, column filter,
// Add gallery, matrix glyph) and the context menu's items for a row selection. defineTreeTable
// defines the parts too; their classes and defines are here for an app that holds one or names
// its type.
export { DexTreeTable, defineTreeTable } from './dex-tree-table.js';
export type { BlockLinkGroup, EditCompletedDetail, TreeTableRow } from './dex-tree-table.js';
export { DexFilterBar, defineFilterBar } from './dex-filter-bar.js';
export { DexColumnFilter, defineColumnFilter } from './dex-column-filter.js';
export { DexAddGallery, defineAddGallery } from './dex-add-gallery.js';
export { DexMatrixOpen, defineMatrixOpen } from '../shared/dex-matrix-open.js';
export type { MatrixOpenDetail } from '../shared/dex-matrix-open.js';
export {
  buildContextMenuItems,
  resolveShortcutAction,
  shouldOpenCellEditor,
  shouldShowContextMenu,
} from './menuItems.js';
export type { ClipboardState, MenuInput, MenuRow, PasteTarget, ShortcutAction } from './menuItems.js';
