import { type AppliedOp } from 'data-explorer-core';
import { type CellEdit, type ChildRows, type EditableTableSource, type InspectorView, type MatrixPage, type NewEntry, type TableChange, type TableView } from '../source/tableSource.js';
import type { BinaryDocument, ModelSource } from './binaryEngine.js';
/** One table of a compressed dictionary: resolveCustomEditor's view, as an EditableTableSource. */
export declare class BinaryView implements EditableTableSource {
    private readonly doc;
    private readonly listeners;
    private readonly name;
    private readonly planner;
    private readonly unlisten;
    private closed;
    private paintedMark;
    private after;
    private awaiting;
    constructor(doc: BinaryDocument);
    private get session();
    private emit;
    private error;
    private failedEdit;
    private postRefusal;
    private findNode;
    private findForRead;
    /**
     * The whole table, from the tree: from chunkXml again (`'chunk'`, what every caller that swapped
     * the text under the model needs), or the tree the session holds (`'registered'`, for a save,
     * which has just registered one built from that same chunkXml).
     */
    private paint;
    private sendTrailer;
    /** Every row painted again, and what follows a paint. */
    repaintAll(from?: ModelSource): Promise<void>;
    private entryRows;
    /**
     * Repaint only the rows the applied ops touched: the affected entries' subtrees, from the model
     * that is already correct, spliced by the table over the runs it holds. The row ids in an op are
     * the ones the TABLE spells, which on a rename is the entry's OLD id. Any surprise falls back to
     * the wide repaint.
     */
    repaintOps(applied: AppliedOp[]): void;
    private postEntry;
    /**
     * The narrow repaint that keeps the clipboard mark this view painted current: on every clipboard
     * broadcast, the entries the painted mark and the clipboard's now name between them, and nothing
     * when they are the same mark. An affected entry that is no longer in the model is skipped: its
     * rows are already gone.
     */
    private repaintClipMark;
    private deleteMoved;
    open(): Promise<TableView>;
    /**
     * The answer of the last `open()` has been shown: send what follows its paint. With
     * trailerAfterDelivery, the whole paint whose rows are `view` has been delivered (an `open()`
     * answer or a `replaceAll`; without a view, the oldest not yet said to be): what follows it is
     * sent, and its repaint resolves.
     */
    opened(view?: TableView): void;
    children(rowId: string): Promise<ChildRows>;
    matrix(nodeId: string): Promise<MatrixPage>;
    inspect(selection: string | readonly string[]): Promise<InspectorView>;
    subscribe(listener: (change: TableChange) => void): () => void;
    /**
     * A structural transform WITHIN one entry: add a nested child, delete one. Always entry-scoped:
     * a nested child is a row inside the entry's run, so the whole entry's rows are rebuilt and
     * nothing else moves. Both directions of the undo are a `replace` of that one entry, from a
     * record snapshotted on either side of the transform.
     */
    private applyStructural;
    /**
     * Delete a whole top-level entry: forward a remove, and its undo an insert of the record at the
     * position it came from. deleteEntryXml is a text-only splice, so the model half is an op here.
     */
    private applyDeleteEntry;
    /**
     * Delete SEVERAL rows as ONE edit: one `after` string built by folding every removal, and one op
     * list describing all of them. READ THE MODEL FIRST: a removal takes its node out of the tree, so
     * the selectors the splice needs, the row to select afterwards, and the records the ops carry are
     * all read while the nodes are still attached.
     */
    private applyDeleteMany;
    /**
     * Delete whichever rows the gesture named. One row keeps the two shapes it has — a child leaving
     * is a `replace` of its owning entry, an entry leaving is a `remove` — and several are one fold.
     */
    delete(rowIds: readonly string[]): void;
    addChild(rowId: string): void;
    edit(msg: CellEdit): void;
    /** Create ONE new default entry from the Add gallery: one fragment into the XML, one insert op, one narrow repaint. */
    addEntry(msg: NewEntry): void;
    private copyDeps;
    copy(rowIds: readonly string[]): void;
    cut(rowIds: readonly string[]): void;
    dragStart(rowIds: readonly string[]): void;
    dragEnd(): void;
    private transferAdapter;
    private transferDeps;
    paste(rowId: string): void;
    drop(rowId: string, mode: 'copy' | 'move'): void;
    undo(): void;
    redo(): void;
    requestEditText(rowId: string): void;
    dispose(): void;
}
