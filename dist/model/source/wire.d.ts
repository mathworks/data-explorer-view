import type { SourceFile } from 'data-explorer-core';
import type { DropFacts } from '../actions/dropFacts.js';
import type { SectionRule } from '../actions/sectionRules.js';
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
    /** What the Add gallery offers, where it is not every tile (TableView.add). */
    add?: {
        classes: readonly string[];
    };
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
export type TableHostMessage = SetRowsMessage | UpdateEntryRowsMessage | InsertEntryRowsMessage | ErrorMessage | ChildRowsMessage | MatrixCellsMessage | ShowPropsMessage | EmptyMessage;
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
/** A committed cell edit, a rename among them (`columnId` 'Name'): what the cell held, and what it now says. */
export interface EditMessage {
    type: 'edit';
    rowId: string;
    columnId: string;
    oldValue: string;
    newValue: string;
}
/**
 * Copy the selection's entries to the clipboard. Copy, Cut and Delete carry the whole selection,
 * because the gesture was made over it; the host resolves what that means (whole entries for copy
 * and cut, rows for delete).
 */
export interface CopyMessage {
    type: 'copy';
    rowIds: string[];
}
/** Cut the selection's entries: a copy whose originals go when it is pasted (a lazy cut). */
export interface CutMessage {
    type: 'cut';
    rowIds: string[];
}
/** Delete the selection's rows. */
export interface DeleteMessage {
    type: 'delete';
    rowIds: string[];
}
/**
 * Paste the clipboard into the section of the row it is anchored at. '' is no row, the document
 * itself: sent only by a table whose document is one target (a MAT-file, whose host sent a
 * whole-file `sectionRules` rule), for a right-click on its empty body or Cmd+V with nothing
 * selected.
 */
export interface PasteMessage {
    type: 'paste';
    rowId: string;
}
/** Add a child to the row: an element to a struct, a cell or an array. */
export interface AddChildMessage {
    type: 'addChild';
    rowId: string;
}
/**
 * Create one new default entry, from the Add gallery: the section it goes in (core's key, `design`,
 * `arch` or `config`; '' for a MAT-file), the class to create, and whether its Name cell should open
 * for a rename once it is there.
 */
export interface AddEntryMessage {
    type: 'addEntry';
    section: string;
    className: string;
    rename: boolean;
}
/** Undo or redo the document's last edit. */
export interface UndoRedoMessage {
    type: 'undo' | 'redo';
}
/** Rows are being dragged: the host takes them into its drag register. */
export interface DragStartMessage {
    type: 'dragStart';
    rowIds: string[];
}
/** The drag of this table's rows ended, dropped or not: the host lets its drag register go. */
export interface DragEndMessage {
    type: 'dragEnd';
}
/**
 * The drag was let go over a row: move or copy what it carries there. '' is the table's empty
 * body, for the reason a paste's row can be ''.
 */
export interface DropMessage {
    type: 'drop';
    rowId: string;
    mode: 'copy' | 'move';
}
/**
 * The whole text of a Value the row shows as a summary for its size (`<1x500 double>`), asked for
 * as its editor opens: the row carries only a marker that there is one (`_hasEditText`). Answered
 * by `editText`.
 */
export interface RequestEditTextMessage {
    type: 'requestEditText';
    rowId: string;
}
/** Every editing message a table's end sends its host. */
export type TableEditClientMessage = EditMessage | CopyMessage | CutMessage | DeleteMessage | PasteMessage | AddChildMessage | AddEntryMessage | UndoRedoMessage | DragStartMessage | DragEndMessage | DropMessage | RequestEditTextMessage;
/** How the clipboard holds its entries: a cut moves them when they are pasted, a copy does not. */
export type ClipboardMode = 'cut' | 'copy';
/**
 * A drag in flight, as every table hears of it: the document it started in and the facts each
 * item is judged by where it is dropped, never the entries themselves (dropDecision's DragSource).
 */
export interface DragDescriptor {
    docUri: string;
    items: (DropFacts & {
        sectionName: string;
    })[];
}
/** The rules each section of the document holds a drop or a paste to, for the table to predict one. */
export interface SectionRulesMessage {
    type: 'sectionRules';
    docUri: string;
    rules: SectionRule[];
}
/**
 * What the clipboard holds, sent to every table whenever it changes, so each can offer Paste
 * without asking: payload-free, the same facts a drag descriptor carries. `sectionName` is the
 * section each entry was taken from ('' for a MAT-file's variable), and `sourceDocUri` the document:
 * with both, a cut pasted back where it came from is known to change nothing.
 */
export interface ClipboardStateMessage {
    type: 'clipboardState';
    canPaste: boolean;
    mode: ClipboardMode | null;
    items: (DropFacts & {
        sectionName?: string;
    })[];
    sourceDocUri?: string;
}
/** The drag in flight, sent to every table, or null when it ends. */
export interface DragStateMessage {
    type: 'dragState';
    descriptor: DragDescriptor | null;
}
/**
 * Select these rows: what an edit just made the answer to "where am I" (a rename's row, a delete's
 * survivor, every entry a paste added). Applied as soon as the rows are there.
 */
export interface SelectRowsMessage {
    type: 'selectRows';
    rowIds: string[];
}
/** Open the Name editor on a row: an entry the Add gallery just created, whose name the user says next. */
export interface BeginRenameMessage {
    type: 'beginRename';
    rowId: string;
}
/** A cell edit refused: shown in a dialog, with the value refused and the one the cell keeps. */
export interface ValidationErrorMessage {
    type: 'validationError';
    reason: string;
    invalidValue: unknown;
    previousValue: unknown;
}
/**
 * A gesture refused before it changed anything (Add Child, Delete, Add): shown in the dialog a
 * refused cell edit is, titled by the gesture (`Cannot Add Child`, `Cannot Delete`, `Cannot Add`),
 * with why. A dialog, not the banner, because the next repaint clears the banner.
 */
export interface RefusedMessage {
    type: 'refused';
    title: string;
    reason: string;
}
/**
 * The answer to `requestEditText`: the whole text of the row's Value, which the editor opens on, or
 * null where there is none to edit (the value changed under the request), with why where core
 * says.
 */
export interface EditTextMessage {
    type: 'editText';
    rowId: string;
    text: string | null;
    reason?: string;
}
/** Every editing message a host sends a table's end. */
export type TableEditHostMessage = SectionRulesMessage | ClipboardStateMessage | DragStateMessage | SelectRowsMessage | BeginRenameMessage | ValidationErrorMessage | RefusedMessage | EditTextMessage;
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
