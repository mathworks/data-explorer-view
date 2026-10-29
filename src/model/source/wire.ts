// Copyright 2026 The MathWorks, Inc.
//
// The wire format of a table source: the messages `serveTable` and `messageSource` exchange to
// carry a TableSource across a message channel (a webview's, a worker's, an Electron window's).
//
// These are the VS Code extension's own table and inspector messages, which its host and its
// webviews have spoken from the start, now documented here as the format: a host that speaks them
// can feed a table wired with connectTable, and one that answers them can be served from any
// TableSource. The extension adds messages of its own beside these (editing, navigation); a side
// that does not know a message ignores it.
//
// Below the table's are a folder's: the messages `serveFolder` and `folderReader` exchange to read
// a folder for a FolderHierarchy across a channel, from where its files are (Electron's main
// process, a worker) to where they are not (a sandboxed page).
//
// Types only.
import type { SourceFile } from 'data-explorer-core';
import type { ProjectStore } from '../hierarchy/graphSources.js';
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { MatrixPayload } from '../matrix/matrixPayload.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';

/**
 * One end of a message channel: what `messageSource`, `inspectorFeed` and `serveTable` talk
 * through. Messages are plain data (they may be structured-cloned or sent as JSON on the way).
 *
 * In a page, for a channel to the page's host:
 * ```ts
 * const port: TablePort = {
 *   postMessage: (message) => host.postMessage(message),
 *   onMessage: (listener) => {
 *     const hear = (e: MessageEvent) => listener(e.data);
 *     window.addEventListener('message', hear);
 *     return () => window.removeEventListener('message', hear);
 *   },
 * };
 * ```
 */
export interface TablePort {
  /** Send `message` to the other end. */
  postMessage(message: unknown): void;
  /** Hear every message the other end sends, until the returned function is called. */
  onMessage(listener: (message: unknown) => void): () => void;
}

// --- From the host (the side that holds the document) --------------------------------------------

/** The whole table: a TableView with its `type`. The answer to `ready`, and a repaint. */
export interface SetRowsMessage {
  type: 'setRows';
  /** The uri the document was opened under (TableView.docUri). */
  docUri: string;
  rows: TreeTableRow[];
  columns: string[];
  columnLabels: Record<string, string>;
  columnGroups?: Record<string, string>;
  editable: boolean;
  /** Why the document is shown the way it is (TableView.notice). */
  notice?: string;
  /** What the read could not read, and what the paint held back (TableView.warnings). */
  warnings?: WarningBanner;
}

/**
 * The rows of one entry, the entry's row first, replacing the rows of the entry the table shows
 * as `entryRowId` (a `updateEntry` change); no rows removes the entry.
 */
export interface UpdateEntryRowsMessage {
  type: 'updateEntryRows';
  entryRowId: string;
  rows: TreeTableRow[];
}

/**
 * The rows of a new entry, joining the section `sectionRowId` before the entry row `beforeRowId`,
 * or last in the section without one (an `insertEntry` change).
 */
export interface InsertEntryRowsMessage {
  type: 'insertEntryRows';
  sectionRowId: string;
  beforeRowId?: string;
  rows: TreeTableRow[];
}

/**
 * What went wrong, for the table's error banner: the answer to `ready` for a document that cannot
 * be shown, or an `error` change later.
 */
export interface ErrorMessage {
  type: 'error';
  message: string;
}

/** The answer to `requestChildren`: a ChildRows with its `type`. */
export interface ChildRowsMessage {
  type: 'childRows';
  nodeId: string;
  rows: TreeTableRow[];
  truncated: number;
}

/** The answer to `requestMatrix`: a MatrixPage with its `type`, exactly one of `matrix` and `message`. */
export interface MatrixCellsMessage {
  type: 'matrixCells';
  nodeId: string;
  matrix?: MatrixPayload;
  message?: string;
}

/** What the property inspector shows: an InspectorView's groups. The answer to a `select` of a row. */
export interface ShowPropsMessage {
  type: 'showProps';
  groups: PropertyGroup[];
}

/** The property inspector has nothing to show. The answer to a `select` of nothing, or of a section. */
export interface EmptyMessage {
  type: 'empty';
}

/** Every message a host sends a table's (or an inspector's) end. */
export type TableHostMessage =
  | SetRowsMessage
  | UpdateEntryRowsMessage
  | InsertEntryRowsMessage
  | ErrorMessage
  | ChildRowsMessage
  | MatrixCellsMessage
  | ShowPropsMessage
  | EmptyMessage;

// --- From the table's end ------------------------------------------------------------------------

/** The table (or the inspector) is up: send the whole table (or what the inspector shows). */
export interface ReadyMessage {
  type: 'ready';
}

/** The table's selection: show its first row in the inspector (answered `showProps` or `empty`). */
export interface SelectMessage {
  type: 'select';
  rowIds: string[];
}

/** The rows under a row the paint held back (`_lazy`): answered `childRows`. */
export interface RequestChildrenMessage {
  type: 'requestChildren';
  nodeId: string;
}

/** The cells of the matrix a row's `_matrix` describes, by its `nodeId`: answered `matrixCells`. */
export interface RequestMatrixMessage {
  type: 'requestMatrix';
  nodeId: string;
}

/** Every message a table's (or an inspector's) end sends its host. */
export type TableClientMessage = ReadyMessage | SelectMessage | RequestChildrenMessage | RequestMatrixMessage;

// --- A folder across a channel -------------------------------------------------------------------
//
// The page asks (folderReader), the host answers (serveFolder): every question a `folderRequest`
// with an `id`, and its answer the `folderAnswer` with the same `id`, in whatever order the reads
// finish. Each is plain data (structured-clone safe; a file's bytes are an ArrayBuffer, which a
// port that can transfer hands over rather than copies). A port may carry a table's messages beside
// these, but one folder's.
//
// THE HOST READS ONLY WHAT IT LISTED. Core's readers answer only for the files they are given;
// at this boundary that rule is the host's: a question names a file by uri, the uri is matched
// exactly against the host's own last listing, and the file read is the host's SourceFile, never
// a path the page sends. A uri that matches no listed file (outside the folder, holding `..`,
// with a prefix that looks like the folder's, of another scheme, or another spelling of a listed
// one: nothing is decoded, resolved or normalised) is refused, and nothing is read for it. A
// project store is answered only for a listed file, from beside it, by the host's reader.

/** What a `folderRequest` asks: the folder's files, or a version, the bytes or the project store of one of them. */
export type FolderAsk = 'list' | 'version' | 'bytes' | 'projectStore';

/**
 * A question about the folder (folderReader → serveFolder), answered by the `folderAnswer` with
 * its `id`:
 *
 * - `list`: the folder's files, as `SourceFile`s in the folder's order (FolderFiles.list). The
 *   host keeps this listing, and the questions below are about its files.
 * - `version`, `bytes`, `projectStore`: what the host's reader answers (GraphReader) for the file
 *   of its last listing whose uriString is `uri`, exactly. Any other uri, or none, is `refused`
 *   and nothing is read: a page can have the host read only the files the host listed. So is a
 *   question asked before the host has listed the folder, and an `ask` of no other name.
 */
export interface FolderRequestMessage {
  type: 'folderRequest';
  /** Which answer is this question's: no other question of the same reader waiting has it. */
  id: number;
  ask: FolderAsk;
  /** The file asked about, by its uriString. Not on a `list`. */
  uri?: string;
}

/**
 * The answer to the `folderRequest` with this `id`: a `value`, an `error`, or a refusal.
 *
 * The value of a `list` is its files (`SourceFile[]`); of a `version`, a string or null; of
 * `bytes`, an ArrayBuffer (a typed array is read as the bytes it views) or null; of a
 * `projectStore`, a ProjectStore or null.
 */
export interface FolderAnswerMessage {
  type: 'folderAnswer';
  id: number;
  value?: SourceFile[] | string | ArrayBuffer | ProjectStore | null;
  /** Why there is no value: what the host's listing or reading threw. The question rejects with it. */
  error?: string;
  /**
   * Why the host did not answer: the question names no file of its last listing (or asks what the
   * wire does not). Nothing was read. The page's call answers null, as a reader does for a file it
   * was not given.
   */
  refused?: string;
  /**
   * On the answer to a `list`: true when the listing was cut short, the folder holding more
   * supported files than `value` (FolderFileList.truncated, which a structured clone of the array
   * would drop). Absent: all of them. A page that does not know the field reads the files alone.
   */
  truncated?: boolean;
}

/**
 * The folder changed: the page reads it again (FolderHierarchy.rebuild, UsageGraphs and
 * NameIndex invalidate).
 *
 * `uris`, when the host knows them, are the files the change touched, by their uriString in the
 * listing's form (`sourceUri(path)`). A HINT only: it does not say whether each was created,
 * deleted or saved (the page tells those apart by listing the folder again), a host may send one
 * change as several messages or several as one, and none may be missing from what it knows.
 * Absent means something changed, read it all again, as a page that does not know the field
 * does in any case.
 */
export interface FolderChangedMessage {
  type: 'folderChanged';
  uris?: string[];
}

/** Every message a folder's host sends the page's end. */
export type FolderHostMessage = FolderAnswerMessage | FolderChangedMessage;

/** Every message the page's end of a folder sends its host. */
export type FolderClientMessage = FolderRequestMessage;
