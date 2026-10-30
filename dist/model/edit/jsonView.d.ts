import { type CellEdit, type ChildRows, type EditableTableSource, type InspectorView, type MatrixPage, type NewEntry, type TableChange, type TableView } from '../source/tableSource.js';
import type { JsonDocument, JsonTableOptions } from './jsonEngine.js';
/** One table of a JSON dictionary: resolveCustomTextEditor's view, as an EditableTableSource. */
export declare class JsonView implements EditableTableSource {
    private readonly doc;
    private readonly table;
    private readonly listeners;
    private readonly name;
    private readonly uri;
    private readonly planner;
    private readonly docState;
    private readonly unsubscribe;
    /**
     * Whether both the tree this document holds and every row on screen were built from the text as
     * it now reads: the precondition of every narrow repaint, and what lets an edit keep the tree it
     * is holding. Set only when a wide repaint's rows LAND; every path that leaves the two out of step
     * clears it (leaveStep).
     */
    private modelInSync;
    /** How many wide repaints this table has begun: the stamp a write painted ahead of its echo carries. */
    private wideEpoch;
    /** How many times this table changed its rows, or put its tree out of step, outside a wide repaint. */
    private rowsTouched;
    /** This table has closed: set first in dispose, and asked by everything still running then. */
    private disposed;
    /** The table has asked for its rows (`open`). Until then a wide repaint paints nothing. */
    private ready;
    private latestPost;
    private pendingOpen;
    private after;
    private awaiting;
    /** What the table edit in flight will need when its own change arrives (spent by the next change). */
    private hostEdit;
    /** A write whose rows are ALREADY on screen, so the change it fires has nothing left to paint. */
    private paintedWrite;
    /** The edits this table has written, newest last. */
    private readonly knownEdits;
    /** The clipboard mark this table has already painted (repaintClipMark). */
    private paintedMark;
    /** Whether the last change this table saw was an undo or a redo. */
    private lastByHistory;
    /** Structural edits, one text state at a time (queueStructural). */
    private structuralChain;
    constructor(doc: JsonDocument, table?: JsonTableOptions);
    private get session();
    private emit;
    private error;
    private failedEdit;
    private postRefusal;
    private findNode;
    private fillUsage;
    private fillUsageNow;
    private changed;
    private postRowPatch;
    private postBanner;
    private leaveStep;
    /**
     * The tree for this document — the one already built when it still says what the text says, a
     * fresh parse when it does not. Leaves modelInSync alone: a rebuild here brings the MODEL up to the
     * text, and the rows wherever they were.
     */
    private liveModel;
    /** Bring the model back in step with the text, painting nothing: an edit that mutated the tree and could not write. */
    private rebuildModel;
    /**
     * Rebuild the model from the text and paint every row: on open, on every change of the text that
     * is not a single entry's, and on save. Resolves when the rows are sent (with trailerAfterDelivery,
     * once what follows them is); a repaint whose rows are dropped (wideLanding) resolves when the rows
     * that replace them are. Resolves false when what follows the rows threw (sendTrailer): what a
     * caller says after the repaint is then not said, as the extension's rejected repaint skips it.
     */
    private post;
    /** The wide repaint as a REPAIR, out of step from the moment the rows are known not to say what the text does. */
    private repaintStale;
    private paintWide;
    private sendTrailer;
    private sayAfter;
    /** Every row painted again from the text, and what follows a paint. Resolves when they are sent. */
    repaintAll(): Promise<void>;
    private entryRowsOf;
    /**
     * Repaint ONE entry: splice its rows over the run the table holds under `entryRowId`, once its
     * Usage column is filled. Resolves when they are sent, for a caller with something to say AFTER
     * the rows: fresh rows clear the error banner, so a banner sent beside them has to come second.
     */
    private postEntryRows;
    /**
     * The same repaint, sent in THIS run, so an edit is on screen before the rest of its work. A cold
     * Usage graph is caught up in a second repaint.
     */
    private postEntryRowsNow;
    /**
     * Repaint what a STRUCTURAL change did: entries that left the table, arrived in it, or were
     * rebuilt — as the rows those three amount to. Sent in this run; a cold Usage graph is caught up
     * in a second repaint per entry.
     */
    private repaintOps;
    private remember;
    /** Repaint the entry THIS table just wrote, from the bytes it wrote: its echo confirms the paint. */
    private syncOwnEdit;
    /** Repaint an UNDO or a REDO of one of this table's own STRUCTURAL edits, from the ops it remembered. */
    private syncKnownOps;
    /** Repaint the entry an UNDO or a REDO of one of this table's own edits touched. */
    private syncKnownChange;
    /**
     * Sync ONE entry from the text, or say no: the narrow answer to "the text changed, and this table
     * did not change it". One replacement only, rows that match the text, and a registered tree.
     */
    private syncOneEntry;
    /**
     * The narrow repaint that keeps the clipboard mark this table painted current: the entries the two
     * marks name, and nothing when they are the same mark. Rows out of step with the text can only be
     * mended by a full repaint.
     */
    private repaintClipMark;
    /**
     * Write ONE region of the text: one undo step, heard as a change, which repaints every table of
     * the document and any text view. Throws when the text refuses the write (it moved under it), so
     * that a paint made before the write is taken back rather than left standing.
     */
    private writePatch;
    private patchFor;
    private submittedOf;
    private ensureValidJson;
    /**
     * Take back a paint the text never confirmed, and say why: re-read the text, repaint the entry from
     * it over the run the PAINT left (found in the re-read tree by the id the FILE still spells), and
     * send the banner AFTER those rows. Neither, once a wide repaint has begun since the paint: its rows
     * are already the file's answer.
     */
    private undoPaint;
    edit(msg: CellEdit): void;
    private applyEdit;
    private resyncWide;
    /** A paste, a drop or an add refused before it painted: put the model back (re-read the text), and say why. */
    private refusedStructural;
    /** The prologue every structural edit shares: the mid-edit JSON gate, a tree that matches the text, and the node the row names. */
    private onStructuralTarget;
    /**
     * A structural edit WITHIN one entry: add a nested child, delete one. The bytes it writes are an
     * entry span replaced by an entry span, exactly what a cell edit writes, so its echo and its undo
     * are read back the way a cell edit's are.
     */
    private applyEntryStructural;
    /**
     * Delete a top-level ENTRY: its element leaves the array, its run of rows leaves the table. The
     * transform is text-only, so the model change is an op applied beside it, captured BEFORE it.
     */
    private applyDeleteEntry;
    /**
     * Delete SEVERAL rows as ONE edit, in a single write. READ THE MODEL FIRST: every removal takes a
     * node out of the tree, so the selectors, the row to select afterwards and the undo's ops are all
     * read while the nodes are still attached.
     */
    private applyDeleteMany;
    private applyDelete;
    private applyAddChild;
    private copyDeps;
    copy(rowIds: readonly string[]): void;
    cut(rowIds: readonly string[]): void;
    dragStart(rowIds: readonly string[]): void;
    dragEnd(): void;
    /**
     * A same-document move's REMOVALS, stated as ops and applied to the live model, or null: this move
     * cannot take the narrow path, and the model is re-read from the trimmed text.
     */
    private moveRemovals;
    private transferAdapter;
    private transferDeps;
    /**
     * Structural edits, one text state at a time. Every one reads the text when it starts and writes
     * at the end, with an await between: two in flight at once would compute offsets over a text the
     * other moved. So each waits for the write in front of it; none is dropped, and one that fails
     * does not poison the chain. A cell edit is not queued.
     */
    private queueStructural;
    delete(rowIds: readonly string[]): void;
    addChild(rowId: string): void;
    paste(rowId: string): void;
    drop(rowId: string, mode: 'copy' | 'move'): void;
    addEntry(msg: NewEntry): void;
    /**
     * Create ONE new default entry from the Add gallery: a paste with no source, always narrow. Through
     * queueStructural, never directly.
     */
    private applyAddEntry;
    /**
     * Remove named entries from THIS document on behalf of another document's paste or drop (a
     * cross-file move), as one write. Refused for a text that does not parse: the move's paste half
     * has landed, so the user is left with a copy rather than a mangled original. Every outcome is
     * ANSWERED, never posted: the table the paste landed in reports it.
     */
    private deleteFromSourceDocument;
    private repaintTables;
    private readonly repaintThis;
    private statDisk;
    private readDisk;
    private stillCleanAt;
    private stampDisk;
    /** This document now reads what its file on disk does — whose stamp is `stamp`, if known. */
    private noteClean;
    /**
     * Whether a change that left the document reading clean was a reload from disk, or an edit to a
     * clean document (which reads clean the same way until its own dirty change arrives). The file
     * decides, and it is asked only if its stamp has CHANGED since the document last matched it.
     */
    private checkAgainstDisk;
    /**
     * The baseline of a document opened with unsaved changes: the file's own bytes, parsed where
     * nothing else can see them. Until it lands nothing is marked; a file that cannot be read is
     * baselined from the document's text.
     */
    private baselineFromDisk;
    private onTextChange;
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
    private findForRead;
    subscribe(listener: (change: TableChange) => void): () => void;
    undo(): void;
    redo(): void;
    private liveFind;
    requestEditText(rowId: string): void;
    /**
     * Location in Text: where the row's entry is in the text, for a host with a text view to show it
     * (the extension reveals it beside the table). The owning entry's span, re-read from the text; the
     * failures are said in the table, as the extension says them, and answered null.
     */
    locateInText(rowId: string): {
        offset: number;
        length: number;
    } | null;
    dispose(): void;
}
