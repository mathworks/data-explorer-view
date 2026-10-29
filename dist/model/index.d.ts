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
export { refuseIfUnreadable, sourceWarnings, warningBanner } from './rows/parseWarnings.js';
export type { WarningBanner } from './rows/parseWarnings.js';
export { buildPropertyGroups } from './inspector/piBuilder.js';
export type { PropertyGroup, PropertyRow } from './inspector/piBuilder.js';
export type { PIPropertyGroup, PIPropertyRow } from './inspector/piBuilder.js';
export { InspectorSelection } from './inspector/inspectorSelection.js';
export type { FindNode, Inspector } from './inspector/inspectorSelection.js';
export type { MatrixDescriptor, MatrixPayload } from './matrix/matrixPayload.js';
export { dropDecision, isNoopMove, rejectReason } from './actions/dropDecision.js';
export type { DragItem, DragMode, DragSource, DropCursor, DropDecision, DropTarget } from './actions/dropDecision.js';
export { dropFactsOf } from './actions/dropFacts.js';
export type { DropFacts } from './actions/dropFacts.js';
export { resolveOperands, sectionRowIdOf } from './actions/operands.js';
export type { OperandRow, Operands } from './actions/operands.js';
export { sectionRules, wholeFileRules } from './actions/sectionRules.js';
export type { SectionRule } from './actions/sectionRules.js';
export { insertEntryRows, mergeChildRows, nextExpandedIds, nextStickyIds, pendingSelectionToApply, spliceEntryRows, } from './actions/rowUpdates.js';
export { WHOLE_FILE_SECTION, buildSectionRowId, isSectionRowId, sectionNameFromRowId } from './ids/sectionRowId.js';
export { binaryEditSrcId, srcIdToUriString } from './ids/srcId.js';
export { localLinkName, parseLinkTarget } from './ids/linkTarget.js';
export type { LinkTarget } from './ids/linkTarget.js';
export { basename, projectPathSegments, uriBasename } from './ids/pathUtil.js';
export { ADD_CATALOG, allTiles, matCatalog } from './ids/addCatalog.js';
export type { GalleryCategory, GalleryTile, SectionKey } from './ids/addCatalog.js';
export type { MspDictionary, MspProject, MspRole } from './ids/msp.js';
export { RelGraph } from './hierarchy/graphModel.js';
export type { GraphNode, GraphSource, GroupKind, NodeKind, SourceType } from './hierarchy/graphModel.js';
export { DECORATIONS, HEALTH_QUERY, decode, encode } from './hierarchy/health.js';
export type { HealthDecoration, HealthState } from './hierarchy/health.js';
export { buildGraphSource, graphSourcesOf } from './hierarchy/graphSources.js';
export type { GraphReader, ProjectStore, RawFile } from './hierarchy/graphSources.js';
export { FolderHierarchy, HIERARCHY_ICONS } from './hierarchy/folderHierarchy.js';
export type { FolderFiles, FolderHierarchyOptions, HierarchyItem } from './hierarchy/folderHierarchy.js';
export type { ChildRows, InspectorFeed, InspectorView, MatrixPage, TableChange, TableSource, TableView, } from './source/tableSource.js';
export { createWorkspace } from './source/workspace.js';
export type { Doc, DocKind, Workspace, WorkspaceOptions } from './source/workspace.js';
export { sourceUri, uriPath } from './source/sourceUri.js';
export { inspectorFeed, messageSource } from './source/messageSource.js';
export { serveTable } from './source/serveTable.js';
export type { ChildRowsMessage, EmptyMessage, ErrorMessage, InsertEntryRowsMessage, MatrixCellsMessage, ReadyMessage, RequestChildrenMessage, RequestMatrixMessage, SelectMessage, SetRowsMessage, ShowPropsMessage, TableClientMessage, TableHostMessage, TablePort, UpdateEntryRowsMessage, } from './source/wire.js';
export { readSlddContent, readSlddParts, scanSldd } from './workspace/slddContent.js';
export { 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
findNode, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
getModel, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
getModelForBinaryTab, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
getModelFromBytes, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
getModelFromParsed, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
invalidate, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
openSourceView, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
parseDetached, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
peekModel, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
releaseIfUnviewed, 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
releaseSourceView, } from './workspace/SlddModel.js';
export type { 
/** @deprecated A host's document registry: import it from data-explorer-view/host. */
TabSources, } from './workspace/SlddModel.js';
export { 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
answerChildRequest, 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
childRowsMessage, } from './rows/childRequest.js';
export type { 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
UsageFiller, } from './rows/childRequest.js';
export { 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
answerMatrixRequest, 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
matrixCellsMessage, } from './matrix/matrixRequest.js';
export { 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
postOrFallback, 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
postOrReport, } from './rows/postPayload.js';
export type { 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
PostTarget, } from './rows/postPayload.js';
export { 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
MAX_TABLE_ROWS, 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
capRows, 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
rowCapBanner, } from './rows/rowCap.js';
export type { 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
CappedRows, } from './rows/rowCap.js';
export { 
/** @deprecated A host's inspector page: import it from data-explorer-view/host. */
InspectorPage, } from './inspector/inspectorPage.js';
