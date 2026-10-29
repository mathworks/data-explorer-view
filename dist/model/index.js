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
// out: it can change without a consumer noticing. What only a host serving the wire format uses
// (the module-level document registry, the webview-posting answers, the inspector's page) is
// data-explorer-view/host's; the last block below still exports it here, deprecated, until 1.0.
//
// Nothing here runs on import, and nothing here reaches a widget or lit (test/entries.test.ts),
// so a bundler keeps only what an app uses and a worker or a terminal can load all of it.
// Rows: what the tree table shows for a file, how much of it at once, and the banners above it.
export { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS, buildEntryRows, buildRows } from './rows/rowBuilder.js';
export { buildMatRows, buildMatVariableRows } from './rows/matRowBuilder.js';
export { clipMarkKey, splitClipMarkKey } from './rows/rowStamp.js';
export { rowPlannerFor } from './rows/rowPlanner.js';
export { LAZY_ROW_BUDGET, lazyRowsBanner } from './rows/lazyRows.js';
export { refuseIfUnreadable, sourceWarnings, warningBanner } from './rows/parseWarnings.js';
// The property inspector's pages, and which row it shows.
export { buildPropertyGroups } from './inspector/piBuilder.js';
export { InspectorSelection } from './inspector/inspectorSelection.js';
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
// The hierarchy: the graph of which file references which, and the health marks on it; a
// folder's files read into it over core's source cache; and the folder as a tree's rows.
export { RelGraph } from './hierarchy/graphModel.js';
export { DECORATIONS, HEALTH_QUERY, decode, encode } from './hierarchy/health.js';
export { buildGraphSource, graphSourcesOf } from './hierarchy/graphSources.js';
export { FolderHierarchy, HIERARCHY_ICONS } from './hierarchy/folderHierarchy.js';
export { createWorkspace } from './source/workspace.js';
export { sourceUri, uriPath } from './source/sourceUri.js';
// Usage: who uses each variable and where each block's parameters come from, as the Usage
// column's cells (over core's usage index), and the grammar of the links in them.
export { annotateModelViewRows, annotateVariableRows, buildUsageGraph, buildUsageGraphFromSummaries, } from './usage/usageCells.js';
export { parseFileTarget, parseNavTarget, resolveNavSource } from './usage/navTarget.js';
// The graphs those cells are filled from, one per file being viewed, kept until the folder
// changes; and the reposts a data file's table is owed when a model appears or goes away.
export { UsageGraphs } from './usage/usageGraphs.js';
export { USAGE_REPOST_DEBOUNCE_MS, USAGE_REPOST_MAX_WAITS, createUsageRepostBus, repostsUsageOn, } from './usage/usageRepost.js';
export { createUsageRepostHub } from './usage/usageRepostHub.js';
// A source across a message channel: the table's end (messageSource, and inspectorFeed for an
// inspector whose host follows a table elsewhere), the host's end (serveTable), and the messages
// between them.
export { inspectorFeed, messageSource } from './source/messageSource.js';
export { serveTable } from './source/serveTable.js';
// A dictionary's parts read off disk, under the read policy (a source that cannot be read is a
// failure, not an empty dictionary).
export { readSlddContent, readSlddParts, scanSldd } from './workspace/slddContent.js';
// DEPRECATED HERE: a host's plumbing, which is data-explorer-view/host's. Each name below is the
// same export that entry has, kept here so that nothing importing it from ./model breaks during
// 0.x; it leaves ./model at 1.0. An app needs none of it: it opens files with createWorkspace and
// wires widgets with connectTable and connectInspector.
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
export { 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
answerChildRequest, 
/** @deprecated A host's answer to a webview: import it from data-explorer-view/host. */
childRowsMessage, } from './rows/childRequest.js';
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
export { 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
MAX_TABLE_ROWS, 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
capRows, 
/** @deprecated A host's posting: import it from data-explorer-view/host. */
rowCapBanner, } from './rows/rowCap.js';
export { 
/** @deprecated A host's inspector page: import it from data-explorer-view/host. */
InspectorPage, } from './inspector/inspectorPage.js';
