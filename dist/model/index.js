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
export { buildMatRows, buildMatVariableRows } from './rows/matRowBuilder.js';
export { clipMarkKey, splitClipMarkKey } from './rows/rowStamp.js';
export { rowPlannerFor } from './rows/rowPlanner.js';
export { LAZY_ROW_BUDGET, lazyRowsBanner } from './rows/lazyRows.js';
export { MAX_TABLE_ROWS, capRows, rowCapBanner } from './rows/rowCap.js';
export { answerChildRequest, childRowsMessage } from './rows/childRequest.js';
export { refuseIfUnreadable, sourceWarnings, warningBanner } from './rows/parseWarnings.js';
export { postOrFallback, postOrReport } from './rows/postPayload.js';
// The property inspector's pages, and which row it shows.
export { buildPropertyGroups } from './inspector/piBuilder.js';
export { InspectorPage } from './inspector/inspectorPage.js';
export { InspectorSelection } from './inspector/inspectorSelection.js';
// The variable editor's cells.
export { answerMatrixRequest, matrixCellsMessage } from './matrix/matrixRequest.js';
// Actions: which rows a menu item, a drop or a paste acts on, and what a table does with the
// rows an edit sends back. A host that performs the edit asks the same rules.
export { dropDecision, isNoopMove, rejectReason } from './actions/dropDecision.js';
export { dropFactsOf } from './actions/dropFacts.js';
export { resolveOperands, sectionRowIdOf } from './actions/operands.js';
export { sectionRules, wholeFileRules } from './actions/sectionRules.js';
export { insertEntryRows, mergeChildRows, nextExpandedIds, nextStickyIds, pendingSelectionToApply, spliceEntryRows, } from './actions/rowUpdates.js';
// Ids: section rows, sources, paths, the Add gallery's catalog and a project's MSP roles.
export { WHOLE_FILE_SECTION, buildSectionRowId, isSectionRowId, sectionNameFromRowId } from './ids/sectionRowId.js';
export { binaryEditSrcId, srcIdToUriString } from './ids/srcId.js';
export { localLinkName, parseLinkTarget } from './ids/linkTarget.js';
export { basename, projectPathSegments, uriBasename } from './ids/pathUtil.js';
export { ADD_CATALOG, allTiles, matCatalog } from './ids/addCatalog.js';
// The hierarchy: the graph of which file references which, and the health marks on it.
export { RelGraph } from './hierarchy/graphModel.js';
export { DECORATIONS, HEALTH_QUERY, decode, encode } from './hierarchy/health.js';
export { createWorkspace } from './source/workspace.js';
export { sourceUri, uriPath } from './source/sourceUri.js';
// A source across a message channel: the table's end (messageSource, and inspectorFeed for an
// inspector whose host follows a table elsewhere), the host's end (serveTable), and the messages
// between them.
export { inspectorFeed, messageSource } from './source/messageSource.js';
export { serveTable } from './source/serveTable.js';
// The workspace: the documents open in core's session, and a dictionary's parts read off disk.
export { findNode, getModel, getModelForBinaryTab, getModelFromBytes, getModelFromParsed, invalidate, openSourceView, parseDetached, peekModel, releaseIfUnviewed, releaseSourceView, } from './workspace/SlddModel.js';
export { readSlddContent, readSlddParts, scanSldd } from './workspace/slddContent.js';
