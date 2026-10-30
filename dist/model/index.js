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
// tests and widgets reach (the filter grammar, the row stamps, the table's expansion and
// selection bookkeeping, the repost bus the hub is made of) stays out: it can change without a
// consumer noticing. What only the VS Code extension's host uses (the module-level document
// registry, the webview-posting answers, the inspector's page, the binary editor's srcId and the
// tree's file decorations) is data-explorer-view/host's; what only a process that serves a folder
// or a table uses (serveFolder, serveTable, a listing from core's, Electron's main-process port)
// is data-explorer-view/serve's.
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
export { insertEntryRows, spliceEntryRows } from './actions/rowUpdates.js';
// Ids: section rows, sources, paths, the Add gallery's catalog, and a project's MSP roles and how
// a project is found to be one.
export { WHOLE_FILE_SECTION, buildSectionRowId, isSectionRowId, sectionNameFromRowId } from './ids/sectionRowId.js';
export { srcIdToUriString } from './ids/srcId.js';
export { localLinkName, parseLinkTarget } from './ids/linkTarget.js';
export { basename, projectPathSegments, uriBasename } from './ids/pathUtil.js';
export { ADD_CATALOG, allTiles, matCatalog } from './ids/addCatalog.js';
export { MSP_CONFIG, detectMsp } from './ids/mspProject.js';
// The hierarchy: the graph of which file references which, and the health marks on it; a
// folder's files read into it over core's source cache; and the folder as a tree's rows.
export { RelGraph } from './hierarchy/graphModel.js';
export { buildGraphSource, graphSourcesOf } from './hierarchy/graphSources.js';
export { FolderHierarchy, HIERARCHY_ICONS } from './hierarchy/folderHierarchy.js';
export { isEditable } from './source/tableSource.js';
export { createWorkspace } from './source/workspace.js';
export { sourceUri, uriPath } from './source/sourceUri.js';
// A project's page: the message its page is drawn from (<dex-project-page>), from its store.
export { projectPageMessage, readProjectPage } from './source/projectPage.js';
// Usage: who uses each variable and where each block's parameters come from, as the Usage
// column's cells (over core's usage index), and the grammar of the links in them.
export { annotateModelViewRows, annotateVariableRows, buildUsageGraph, buildUsageGraphFromSummaries, } from './usage/usageCells.js';
export { parseFileTarget, parseNavTarget, resolveNavSource } from './usage/navTarget.js';
// The graphs those cells are filled from, one per file being viewed, kept until the folder
// changes; and the reposts a data file's table is owed when a model appears or goes away.
export { UsageGraphs } from './usage/usageGraphs.js';
export { USAGE_REPOST_DEBOUNCE_MS } from './usage/usageRepost.js';
export { createUsageRepostHub } from './usage/usageRepostHub.js';
// A folder, read once for all of it: its hierarchy, its Usage graphs, its names and its reposts,
// over one listing and one cache, kept up to date by one change.
export { createFolderSession } from './folder/folderSession.js';
// Search: a folder's entry names (dictionary and MAT-file variables, model-workspace variables,
// blocks), read once over core's source cache, and what a search over them shows.
export { NameIndex } from './search/nameIndex.js';
export { namesFromMat, namesFromSldd, namesFromSlx } from './search/nameExtract.js';
export { namesOfFile } from './search/nameScan.js';
export { filterEntries } from './search/searchFilter.js';
export { MAX_SEARCH_RESULTS, SEARCH_ICONS, searchEntries, searchItem, sortNameRecords } from './search/searchItems.js';
// A source across a message channel: the table's end (messageSource, and inspectorFeed for an
// inspector whose host follows a table elsewhere), and the messages between it and the host's
// end (serveTable, on data-explorer-view/serve).
export { inspectorFeed, messageSource } from './source/messageSource.js';
export { NOT_FOUND_REASON, createRegisters } from './edit/registers.js';
// transfer.ts's isNoopMove, the host's half of the rule the drop predictor's isNoopMove answers
// (above), under a name of its own.
export { TransferRefused, fileNameOf, isNoopMove as isNoopTransfer, runTransfer, sharedNameRefusal, sourceKeptMessage, } from './edit/transfer.js';
export { REFUSAL_TITLES, addChildRefusal, addEntryRefusal, deleteRefusal, describeSource, refusedChange } from './edit/refusal.js';
export { answerEditTextRequest } from './edit/editText.js';
// The in-page undo stack and its save point, and the Status column's marks it is measured with.
export { EditStack, EditStackIndex } from './edit/editStack.js';
export { SaveMarks, replacementsIn } from './edit/saveMarks.js';
// The copy, the cut and the start of a drag every table source shares, and the clipboard's mark.
export { CopyRefused, buildClipboardSnapshot, buildDragSnapshot, cloneForPaste, copyEntriesToClipboard, dragEntries, recordCopy, sourceSectionOf, } from './edit/clipboardAction.js';
export { clipMarkChange, clipMarkOfDoc, sameClipMark } from './edit/clipMarks.js';
// The MAT-file editor: a document over core's session, and each table of it an EditableTableSource.
export { MatEngine } from './edit/matEngine.js';
// A folder across a message channel, for a hierarchy where its files are not: the page's end
// (folderReader), in the same wire format as the host's (serveFolder, on data-explorer-view/serve).
export { folderReader } from './source/folderReader.js';
// A folder's files as a listing answers them, saying when it was cut short; and a page's
// MessagePort as a channel's port.
export { folderFileList } from './hierarchy/folderList.js';
export { portFromMessagePort } from './source/ports.js';
// A dictionary's parts read off disk, under the read policy (a source that cannot be read is a
// failure, not an empty dictionary).
export { readSlddContent, readSlddParts, scanSldd } from './workspace/slddContent.js';
