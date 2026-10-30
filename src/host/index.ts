// Copyright 2026 The MathWorks, Inc.
// `data-explorer-view/host`: for a HOST that serves the wire format, not for an app.
//
// A host is the process that holds the documents and answers a table's messages across a
// channel, the way the VS Code extension's host answers its webviews. What is here is the
// plumbing such a host is built from, shaped by that job: a document registry over core's
// module-level session, the answers to a webview's requestChildren and requestMatrix posted on
// the webview they came from, posting with a fallback for a payload too large to deliver, the
// property inspector's page as a ready/post cycle, the srcId an editable binary file registers
// under, a hierarchy row's health mark as file decorations carry it, and the editors (the MAT-file
// engine and what it is built from) the extension's own are to move onto.
//
// An app does not need any of it. It opens files with createWorkspace and wires its widgets with
// connectTable and connectInspector, and an app whose documents live elsewhere serves them with
// serveTable (data-explorer-view/serve), which answers the same messages from any TableSource.
//
// It is the VS Code extension's, and it is outside the package's semver promise: its shapes
// follow that host (a webview's postMessage, tab sources, a module-level session), and they may
// change in any minor release, in step with the extension, which pins this package by commit or
// tag. The API check reports a change here and does not fail on it. Every other entry is covered.
//
// DOM-free, like the model: a host runs in Node, a worker or a page.

// The document registry over core's module-level session (DataModel): which tree is held for
// which uri, how many views hold it, and a node by its row id. createWorkspace keeps one of its
// own per workspace instead.
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
} from '../model/workspace/SlddModel.js';
export type { TabSources } from '../model/workspace/SlddModel.js';

// The answers to a webview's questions, as messages: built (childRowsMessage, matrixCellsMessage)
// and posted on the webview that asked (answerChildRequest, answerMatrixRequest).
export { answerChildRequest, childRowsMessage } from '../model/rows/childRequest.js';
export type { UsageFiller } from '../model/rows/childRequest.js';
export { answerMatrixRequest, matrixCellsMessage } from '../model/matrix/matrixRequest.js';

// Posting a payload, and what is posted when one is too large to deliver: the table cut to a cap,
// with a banner that says so.
export { postOrFallback, postOrReport } from '../model/rows/postPayload.js';
export type { PostTarget } from '../model/rows/postPayload.js';
export { MAX_TABLE_ROWS, capRows, rowCapBanner } from '../model/rows/rowCap.js';
export type { CappedRows } from '../model/rows/rowCap.js';

// The property inspector's page, for an inspector in another view than its table: what it shows
// and was sent, sent again on every `ready`, and only when it changes.
export { InspectorPage } from '../model/inspector/inspectorPage.js';

// The srcId an editable tree of a byte-backed file (a .sldd or a .mat) is registered under, beside
// the read-only tree of the same uri.
export { binaryEditSrcId } from '../model/ids/srcId.js';

// A hierarchy row's health mark as VS Code's file decorations carry it: in the row's resourceUri
// query (`HEALTH_QUERY`, `encode`, `decode`), drawn as a badge, a theme colour id and a tooltip
// (`DECORATIONS`).
export { DECORATIONS, HEALTH_QUERY, decode, encode } from '../model/hierarchy/health.js';
export type { HealthDecoration } from '../model/hierarchy/health.js';

// The editors a table source is built from, for the extension to move its own onto (step 6b): the
// MAT-file engine (its MatEditorProvider, lifted), the hooks an engine is given (where its edits go
// to be undone, its save point, the text it keeps as the truth), the in-page undo stack and its
// save point, the Status column's marks, the clipboard's mark, and the copy, the cut and a drag's
// start with the snapshots they take. An app edits through createWorkspace({ editing }) instead.
export { MatEngine } from '../model/edit/matEngine.js';
export type { MatEngineOptions, MatSave, UsageFill } from '../model/edit/matEngine.js';
export type { Edit, EditIndex, EditSink, RangeReplacement, TextStore } from '../model/edit/hooks.js';
export { EditStack, EditStackIndex } from '../model/edit/editStack.js';
export { SaveMarks, replacementsIn } from '../model/edit/saveMarks.js';
export type { MarkedEdit, SaveMark, SaveSnapshot } from '../model/edit/saveMarks.js';
export { clipMarkChange, clipMarkOfDoc, sameClipMark } from '../model/edit/clipMarks.js';
export type { MarkedEntry } from '../model/edit/clipMarks.js';
export {
  CopyRefused,
  buildClipboardSnapshot,
  buildDragSnapshot,
  copyEntriesToClipboard,
  dragEntries,
  sourceSectionOf,
} from '../model/edit/clipboardAction.js';
export type { CopyDeps, SnapshotSession } from '../model/edit/clipboardAction.js';
