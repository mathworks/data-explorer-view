// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/model`: the view model, as the apps built on this package use it.
//
// Every name is listed; none comes through `export *`, which would also publish whatever a module
// exports for its neighbours' sake. A name two modules export (`WHOLE_FILE_SECTION`, from
// sectionRowId and sectionRules; the `ClipMark` trio, from rowStamp and rowBuilder) is exported
// once, from the module that defines it.
//
// The list is what the VS Code extension and the desktop app import, and the types their
// signatures name, so an app can write down what it is handed. What only this package's own
// tests and widgets reach (the filter grammar, the row stamps, the catalog's bookkeeping) stays
// out: it can change without a consumer noticing.
//
// Nothing here runs on import, and nothing here reaches a widget or lit (test/entries.test.ts),
// so a bundler keeps only what an app uses and a worker or a terminal can load all of it.

// Rows: what the tree table shows for a file, how much of it at once, and the banners above it.
export { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS, buildEntryRows, buildRows } from './rows/rowBuilder.js';
export type { TreeTableRow } from './rows/tableRow.js';
export { buildMatRows, buildMatVariableRows } from './rows/matRowBuilder.js';
export type { MatStampOptions, SavedStatus } from './rows/matRowBuilder.js';
export { clipMarkKey, splitClipMarkKey } from './rows/rowStamp.js';
export type { ClipMark } from './rows/rowStamp.js';
export { rowPlannerFor } from './rows/rowPlanner.js';
export type { PlanOptions, RowPlanner } from './rows/rowPlanner.js';
export { LAZY_ROW_BUDGET, lazyRowsBanner } from './rows/lazyRows.js';
export type { PlannedRow, RowPlan } from './rows/lazyRows.js';
export { MAX_TABLE_ROWS, capRows, rowCapBanner } from './rows/rowCap.js';
export type { CappedRows } from './rows/rowCap.js';
export { answerChildRequest, childRowsMessage } from './rows/childRequest.js';
export type { UsageFiller } from './rows/childRequest.js';
export { refuseIfUnreadable, sourceWarnings, warningBanner } from './rows/parseWarnings.js';
export type { WarningBanner } from './rows/parseWarnings.js';
export { postOrFallback, postOrReport } from './rows/postPayload.js';
export type { PostTarget } from './rows/postPayload.js';

// The property inspector's pages, and which row it shows.
export { buildPropertyGroups } from './inspector/piBuilder.js';
export type { PropertyGroup, PropertyRow } from './inspector/piBuilder.js';
export type { PIPropertyGroup, PIPropertyRow } from './inspector/piBuilder.js';
export { InspectorPage } from './inspector/inspectorPage.js';
export { InspectorSelection } from './inspector/inspectorSelection.js';
export type { FindNode, Inspector } from './inspector/inspectorSelection.js';

// The variable editor's cells.
export { answerMatrixRequest, matrixCellsMessage } from './matrix/matrixRequest.js';
export type { MatrixDescriptor, MatrixPayload } from './matrix/matrixPayload.js';

// Actions: which rows a menu item, a drop or a paste acts on, and what a table does with the
// rows an edit sends back. A host that performs the edit asks the same rules.
export { dropDecision, isNoopMove, rejectReason } from './actions/dropDecision.js';
export type { DragItem, DragMode, DragSource, DropCursor, DropDecision, DropTarget } from './actions/dropDecision.js';
export { dropFactsOf } from './actions/dropFacts.js';
export type { DropFacts } from './actions/dropFacts.js';
export { resolveOperands, sectionRowIdOf } from './actions/operands.js';
export type { OperandRow, Operands } from './actions/operands.js';
export { sectionRules, wholeFileRules } from './actions/sectionRules.js';
export type { SectionRule } from './actions/sectionRules.js';
export {
  insertEntryRows,
  mergeChildRows,
  nextExpandedIds,
  nextStickyIds,
  pendingSelectionToApply,
  spliceEntryRows,
} from './actions/rowUpdates.js';

// Ids: section rows, sources, paths, the Add gallery's catalog and a project's MSP roles.
export { WHOLE_FILE_SECTION, buildSectionRowId, isSectionRowId, sectionNameFromRowId } from './ids/sectionRowId.js';
export { binaryEditSrcId, srcIdToUriString } from './ids/srcId.js';
export { basename, projectPathSegments, uriBasename } from './ids/pathUtil.js';
export { ADD_CATALOG, allTiles, matCatalog } from './ids/addCatalog.js';
export type { GalleryCategory, GalleryTile, SectionKey } from './ids/addCatalog.js';
export type { MspDictionary, MspProject, MspRole } from './ids/msp.js';

// The hierarchy: the graph of which file references which, and the health marks on it.
export { RelGraph } from './hierarchy/graphModel.js';
export type { GraphNode, GraphSource, GroupKind, NodeKind, SourceType } from './hierarchy/graphModel.js';
export { DECORATIONS, HEALTH_QUERY, decode, encode } from './hierarchy/health.js';
export type { HealthDecoration, HealthState } from './hierarchy/health.js';

// Sources: a document as a table shows it (the rows, the children of a row, a matrix's cells,
// the inspector's page, and what changes after), and the workspace that opens documents in the
// page.
export type { ChildRows, InspectorView, MatrixPage, TableChange, TableSource, TableView } from './source/tableSource.js';
export { createWorkspace } from './source/workspace.js';
export type { Doc, DocKind, Workspace, WorkspaceOptions } from './source/workspace.js';
export { sourceUri } from './source/sourceUri.js';

// The workspace: the documents open in core's session, and a dictionary's parts read off disk.
export {
  findNode,
  getModel,
  getModelForBinaryTab,
  getModelFromBytes,
  getModelFromParsed,
  invalidate,
  openSourceView,
  parseDetached,
  peekModel,
  releaseIfUnviewed,
  releaseSourceView,
} from './workspace/SlddModel.js';
export type { TabSources } from './workspace/SlddModel.js';
export { readSlddContent, readSlddParts, scanSldd } from './workspace/slddContent.js';
