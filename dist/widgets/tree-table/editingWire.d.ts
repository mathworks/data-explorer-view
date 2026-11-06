import type { ContextMenuItem } from '../context-menu/dex-context-menu.js';
import type { DexErrorDialog } from '../error-dialog/dex-error-dialog.js';
import { type DragMode, type DropDecision } from '../../model/actions/dropDecision.js';
import type { CellEdit, EditableTableSource, TableChange, TableView } from '../../model/source/tableSource.js';
import type { DexTreeTable } from './dex-tree-table.js';
import { type MenuRow } from './menuItems.js';
/**
 * A plain-text view of the table's document that a row can be shown in (the VS Code extension's
 * JSON dictionary has one): what makes the editing menu offer Location in Text, in its place among
 * the other items, and Cmd/Ctrl+L do what it does.
 */
export interface TableTextView {
    /** Whether the document has one now; a function is asked whenever the menu is built. */
    available: boolean | ((view: TableView | undefined) => boolean);
    /** Show the row's text there. */
    locate(rowId: string): void;
}
/**
 * One editing gesture the table handed its source (the handle's `ran`): which of the editing menu's
 * items it was, the rows it carried, and how many it acted on.
 */
export interface EditingRun {
    /** The editing menu's item: 'copy', 'cut', 'paste', 'delete', 'addChild', 'undo', 'redo', 'locateInText', 'setActiveConfigSet'. */
    actionId: string;
    /**
     * The rows it was handed: the selection, for Copy, Cut and Delete; the row it was anchored at, for
     * the rest (none for a paste into the document itself, and for Undo and Redo).
     */
    rowIds: string[];
    /**
     * How many it acted on, as its item's label counts them: the entries Copy or Cut carried, the
     * items Delete took, the entries the clipboard held for Paste; one for a gesture on one row; none
     * for Undo and Redo.
     */
    count: number;
}
/**
 * What a drop of the drag in flight would do on a row of the table's document (TableHandle's
 * `dropDecision`): the table's own prediction for that row, and the row it lands on.
 */
export interface TableDropDecision extends DropDecision {
    /**
     * The row the drop lands on: the one asked about; for the document as a whole, the row of the
     * section it lands in, or '' for the document itself where it is one target (a MAT-file).
     */
    rowId: string;
}
/** How a drop handed over by TableHandle's `drop` ended, once the source had the chance to refuse it. */
export interface DropResult {
    /** It was handed to the source, which refused nothing by the end of the task: the entries are going in. */
    dropped: boolean;
    /** How many entries the drag carried: none where the document takes no drop, or no drag is in flight. */
    count: number;
    /** Why it was not dropped, where something said: the prediction's reason, or the source's refusal. */
    reason?: string;
}
/** Where a table's rows go as they are dragged out of it (EditingHost.dragOutSource). */
export interface DragOutSource {
    /** These rows are being dragged out: take their entries into the drag register. */
    dragStart(rowIds: readonly string[]): void;
    /** That drag ended, dropped or not. */
    dragEnd(): void;
}
/** What the editing half needs of the connected table it is part of. */
export interface EditingHost {
    table: DexTreeTable;
    /** The source's commands, or null for a source that takes none (every gesture is then refused). */
    source: EditableTableSource | null;
    /**
     * Whether rows are dragged out of the table onto other parts of the page
     * (ConnectTableOptions.dragOut): the table's `dragOut`, and a document that may not be edited
     * letting its rows go too, as a copy, through `dragOutSource`.
     */
    dragOut?: boolean;
    /**
     * Who takes the rows dragged out of a document that may not be edited into the drag register: the
     * source, where it can (an editable one, or a read-only one that has dragStart and dragEnd), else
     * null, and none are dragged out of it.
     */
    dragOutSource?: DragOutSource | null;
    textView?: TableTextView;
    /** Whether the table answers the Undo and Redo chords itself (ConnectTableOptions.undoChords). */
    undoChords?: boolean;
    errorDialog: DexErrorDialog;
    /** Listen on the table until the connection is disposed. */
    listen(type: string, listener: (e: Event) => void, capture?: boolean): void;
    selectedRowIds(): string[];
    rowsNow(): MenuRow[];
    docUri(): string;
    setDocUri(uri: string): void;
    view(): TableView | undefined;
    select(rowIds: readonly string[]): void;
    beginRename(rowId: string): void;
    /** A gesture handed to the source was not refused by the end of the task it was handed in. */
    ran(run: EditingRun): void;
}
/** What connectTable asks of the editing half. */
export interface EditingWire {
    /** A whole paint is about to install its rows: take the editing state it carries. */
    painting(view: TableView): void;
    /** One of the editing changes, handled; false for a change that is not one. */
    change(change: TableChange): boolean;
    /** Whether a right-click opens the menu at all, and on the space under the rows. */
    menuAllowed(rowId: string | null): boolean;
    /** Whether the document may be edited, as the last paint and the source say. */
    editable(): boolean;
    /** The editing menu for the current selection, anchored at `anchorRowId`. */
    menuFor(anchorRowId: string | null, selection?: readonly string[]): ContextMenuItem[];
    /** A menu item was chosen; false for one that is not the editing menu's. */
    act(actionId: string, anchorRowId: string | null): boolean;
    /**
     * Whether the editing menu for the current selection, anchored at its first row as a chord's is,
     * offers `actionId` enabled, where the document may be edited.
     */
    can(actionId: string): boolean;
    /** Do what that item does, as its chord would; false, and nothing done, where `can` is false. */
    run(actionId: string): boolean;
    /** Settled once every cell edit handed to the source so far is the document's, or refused. */
    editsSettled(): Promise<void>;
    /**
     * A committed edit made outside the table (an inspector's row), written back as a cell edit is:
     * settled once the source has it, or refused, which the table shows as it shows a cell's. It is
     * one of the edits `editsSettled` waits for.
     */
    edit(edit: CellEdit): Promise<void>;
    /**
     * Undo or Redo, as its menu item does, where the document may be edited and its source does not
     * say there is nothing to undo (or redo); false where not.
     */
    history(action: 'undo' | 'redo'): boolean;
    /**
     * With the drag in flight: what a drop onto `rowId` would do, as the table predicts a drop on its
     * own row there, or, for `rowId` null, a drop onto the document as a whole (documentDrop: the
     * section the entries came from, else the first that takes them); null where no drop can be
     * predicted (no drag, a document that may not be edited, a row whose section has no rule).
     */
    dropDecision(rowId: string | null, mode: DragMode): TableDropDecision | null;
    /**
     * Drop the drag in flight onto `rowId` as a drop on that row does, where `dropDecision` allows it;
     * settled once the source is done with it (a task after its promise, or after the call for a source
     * that returns none), with whether the source refused it.
     */
    drop(rowId: string, mode: DragMode): Promise<DropResult>;
    /**
     * The source said an error (the banner's, `reason`): no gesture handed to it this task is told as
     * done.
     */
    failed(reason?: string): void;
}
/** Whether `ev` is typing in a field of the table's (its search box, a column filter, a cell editor) rather than a gesture on the grid. */
export declare function isTypingInField(ev: KeyboardEvent): boolean;
/** Wire the editing half: the listeners go on through `host.listen`, the state stays in here. */
export declare function wireEditing(host: EditingHost): EditingWire;
