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
