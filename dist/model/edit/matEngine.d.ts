import { type Session } from 'data-explorer-core';
import { type WarningBanner } from '../rows/parseWarnings.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { CellEdit, ChildRows, EditableTableSource, InspectorView, MatrixPage, NewEntry, TableChange, TableView } from '../source/tableSource.js';
import type { EditIndex, EditSink, Notify } from './hooks.js';
import { type DeleteTarget, type Registers } from './registers.js';
import { SaveMarks, type SaveMark, type SaveSnapshot } from './saveMarks.js';
import { type SourceDeleteResult } from './transfer.js';
/** How a MAT-file engine fills a table's Usage column: before a paint, and at once for a narrow repaint. */
export interface UsageFill {
    /** Fill `rows`, from a graph it may have to build first. A rejection leaves the cells as the file has them. */
    fill(rows: TreeTableRow[]): Promise<unknown>;
    /** Fill `rows` from the graph the last `fill` used, if there is one. */
    fillNow(rows: TreeTableRow[]): void;
}
/** What a MAT-file engine is given: its hooks (hooks.ts), and the file. */
export interface MatEngineOptions {
    /** Core's session the file is read into and edited through. */
    session: Session;
    /** The uri the document is opened under: its identity, in every row id. */
    uri: string;
    /** The file's bytes. */
    bytes: ArrayBuffer;
    /** Its name, for what is said of it. Default: the uri's last segment. */
    name?: string;
    /** Where each gesture's edit goes. */
    sink: EditSink;
    /** Where the stack stands, and its save point. */
    index: EditIndex;
    /** The registers the window's documents share. */
    registers: Registers;
    /** Where a notice the table does not show goes. Default: nowhere. */
    notify?: Notify;
    /** The Usage column. Default: none, the cells as the file has them. */
    usage?: UsageFill;
    /** How many rows a whole paint delivers before it holds the rest back. Default: LAZY_ROW_BUDGET. */
    budget?: number;
    /** Who restores a backup, in the notice a refused one gives ("If VS Code restarts now, …"). Default: 'the app'. */
    appName?: string;
    /** Called after every change to the tree, once every view is told: a gesture, an undo, a redo, a reload. */
    changed?: () => void;
}
/** One save of the document, from the bytes it is about to write to their landing (`saved`) or not (`notSaved`). */
export interface MatSave {
    /** The bytes to write. */
    readonly bytes: Uint8Array;
    /** Where the edit stack stood when they were read: what a save point is moved to (EditIndex.saved). */
    readonly at: number;
    /** @internal The Status column's snapshot, and the marks before it. */
    readonly snapshot: SaveSnapshot;
    /** @internal */
    readonly before: ReadonlyMap<any, SaveMark>;
}
/**
 * What one gesture did to the session: how many undo steps it recorded, and which variables it
 * touched (an edit's own, those core copied it into, those removed and added) — read off the
 * session's bus while the gesture ran, since only the session knows where an edit landed: two
 * variables that hold one handle (`r = h`) are one object, and an edit of one is an edit of both.
 */
interface Observed {
    steps: number;
    touched: Set<any>;
    added: Set<any>;
    /**
     * Each of `added` that is put in the place of a variable the gesture took out, and that one:
     * core's retype, a variable of another class swapped in under the same name (saveMarks.ts).
     */
    replaced: Map<any, any>;
    /** The variables before the gesture, each with the row id the table spells it by. */
    before: Map<any, string>;
    order: any[];
    /**
     * What the gesture threw, if it threw. Its steps are counted all the same: core recorded them
     * before it threw, and an edit the stack is not told of would leave core's stack a step ahead
     * of it, so that the next Undo undid the wrong edit.
     */
    error?: unknown;
}
/** One open MAT-file: its tree, its edits, its saves, and the tables that show it. */
export declare class MatEngine {
    readonly options: MatEngineOptions;
    readonly uri: string;
    readonly srcId: string;
    readonly metaPath: string;
    disposed: boolean;
    /**
     * Moved by every tree registered from the disk (a reload). An edit made on one generation's tree
     * has nothing to undo on another's: its steps were on the stack that left with the old tree, so
     * its undo and redo check this first.
     */
    generation: number;
    /**
     * Moved by every change to the tree, and by every save (which moves the Status column), so a
     * paint that awaited can tell it is stale.
     */
    version: number;
    /** Which variables differ from the file as last saved, for the Status column. */
    readonly marks: SaveMarks<any>;
    /** @internal The tables that show it. */
    readonly views: Set<MatView>;
    /** The file's bytes, until the first paint registers them (`model`). */
    private bytes;
    /** The registered tree, or why there is none. Null until the first `model()`. */
    private loaded;
    /** A backup was refused, and the user was told; reset by the next backup that succeeds. */
    private backupRefusalShown;
    constructor(options: MatEngineOptions);
    get session(): Session;
    /** @internal */
    notify(level: 'warning' | 'error' | 'status', message: string, ms?: number): void;
    /**
     * The tree, registered from the file's bytes on the first ask: lazily, so a large file opens
     * onto the table's spinner, and not onto a blank editor while it parses. Throws why there is
     * none: a `-v7.3` file (HDF5), a file that is not a MAT-file, one the reader could not read at
     * all (refused, rather than shown as an empty file a save would then write).
     */
    model(): any;
    /**
     * Core's message, saying the file's name where core says the srcId. A MatNode is named by the
     * srcId it was registered under, and core quotes that name (`Cannot save "binedit:file:///…"`),
     * as a node's id, which a message can carry, begins with it. Every message shown of core's comes
     * through here.
     */
    describe(err: unknown): string;
    /** A warning banner with core's messages described (see `describe`). */
    describeBanner(banner: WarningBanner | undefined): WarningBanner | undefined;
    /**
     * The file as a save writes it, or an Error saying why it cannot be written (core's refusal),
     * in which case nothing is to be written anywhere. Synchronous, so the bytes are the document as
     * the save was asked for: an edit that lands while they are being written stays unsaved.
     */
    serialize(): Uint8Array;
    /**
     * Start a save: the bytes to write (`serialize`), taken with where the stack stands and the
     * Status column as they are, before anything is awaited. Hand it to `saved` once the bytes are
     * on disk, or to `notSaved` if they never get there. Throws core's refusal, and then there is
     * nothing to write and nothing to hand back.
     */
    beginSave(): MatSave;
    /**
     * The bytes of `save` are on disk: the Status column is measured from them from now on. The
     * edit stack's save point is the caller's to move (EditIndex.saved), once, where its own rule
     * says: VS Code's moves when the save it asked for resolves.
     */
    saved(save: MatSave): void;
    /** The bytes of `save` were never written: the Status column stays measured from the last save. */
    notSaved(save: MatSave): void;
    /**
     * The bytes a hot-exit backup holds: the whole file as a save would write it, with no save point
     * moved. Where core refuses to write the tree as it stands, says so once (through `notify`),
     * until a backup succeeds again, and throws: `kept`, an earlier backup still standing, is then
     * what a restart restores, which the notice says.
     */
    backup(kept: boolean): Uint8Array;
    /**
     * Push one gesture's undo steps onto the edit stack as one edit, and record which variables it
     * touched for the Status column. `touched` beyond what the bus said: a batch delete announces
     * its first variable only, and the rest of them are as much the edit's.
     */
    private pushEdit;
    /**
     * An undo or redo of an edit made before the file was last read from disk. Its steps left with
     * the old tree, so nothing is done to the new one, and the user is told rather than left
     * guessing why the table did not move.
     */
    private staleEdit;
    /**
     * Run one gesture through the session, push what it recorded as ONE edit, and repaint every view
     * of the file: the half of a gesture that is the document's. A view's own gestures come through
     * here, and so does the delete a move into another document asks of this one (`deleteMoved`).
     *
     * What core recorded before a throw is one edit like any other, so that the next Undo undoes it
     * and not the edit before it. A gesture that threw is not repainted here: whatever core did
     * before it threw is in the tree, and the caller paints every row again and says why.
     */
    record(label: string, run: (mat: any) => void, touched?: () => Iterable<any>): Observed;
    /**
     * Take out of this file the variables a move into another document carried away (the registers'
     * source deleter), as ONE edit on this file's own stack, and answer what became of them for the
     * view the move was made in to say: this file's views are repainted, never told.
     *
     * By name, because a MAT-file's payloads carry no metadata and so its selectors are names — and
     * only the variable that was taken: the one holding the name must be the node the cut or the
     * drag carried the token of (`originOf`), or nothing is removed. A name the file now holds twice
     * is refused rather than guessed at, and so is a file that takes no edit. A name nothing answers
     * to any more (renamed or deleted since the cut) is skipped, and only when none answers is that
     * the answer.
     */
    deleteMoved(targets: readonly DeleteTarget[]): SourceDeleteResult;
    /**
     * The token a cut or a drag of `variable` carries (TransferItem.origin), which `deleteMoved`
     * tells the original by: one object for as long as the variable is the same node — through
     * edits of it, a rename, and the undo of its delete, which puts the node itself back. A variable
     * made since (an Add, a paste, a reload of the file) is another node, with another token.
     */
    originOf(variable: any): object;
    private readonly origins;
    /** Run core's undo or redo `steps` times on this file's stack, and repaint what it touched. */
    private replay;
    /** Repaint every view after `observed`: one variable's rows at a time, or all of them. */
    private repaint;
    /** Repaint the variables whose Status changed between two answers of `marks`. */
    private repaintMarks;
    /** Every view painted again from the tree. Resolves when every one is. */
    repaintAll(): Promise<void>;
    /**
     * Make this document hold `bytes`, what the disk holds now: a revert, or a reload of an outside
     * change. A new tree, so a new generation, and nothing differing from the file. Resolves when
     * every view is painted from it.
     */
    replace(bytes: ArrayBuffer): Promise<void>;
    /** A table of the document: an EditableTableSource, until its `dispose()`. */
    view(): EditableTableSource & {
        dispose(): void;
        repaintAll(): Promise<void>;
    };
    /** Close the document: its tree leaves the session. Its views answer nothing more. */
    dispose(): void;
}
/**
 * One table of a MAT-file: resolveCustomEditor's view, as an EditableTableSource.
 * @internal
 */
declare class MatView implements EditableTableSource {
    private readonly doc;
    private readonly listeners;
    private readonly name;
    private readonly planner;
    private readonly unlisten;
    private closed;
    private lastClasses;
    private paintedMark;
    private after;
    constructor(doc: MatEngine);
    private get session();
    private emit;
    private error;
    private findNode;
    private findForRead;
    private stamps;
    private readOnlyNotice;
    private build;
    private tree;
    /** The whole table, built from the tree; what follows it is kept for `opened`. */
    private paint;
    private afterPaint;
    /** Every row painted again from the tree, and what follows a paint. */
    repaintAll(): Promise<void>;
    private repaintAndReport;
    repaintVariables(variables: Iterable<any>, before?: ReadonlyMap<any, string>): void;
    private putBack;
    refreshGallery(): void;
    /**
     * The narrow repaint that keeps the clipboard mark this view painted (`paintedMark`) current: on
     * every clipboard broadcast, the variables the painted mark and the clipboard's now name between
     * them, and nothing when they are the same mark — the rule every table follows (clipMarks.ts). A
     * variable is found by its name, the key's other half; one the file no longer holds (a cut
     * pasted elsewhere took it) has no rows left to un-dim.
     */
    private repaintClipMark;
    private treeOrSay;
    private editableTree;
    /**
     * Run one gesture through the session, and push what it recorded as one edit. The gate is
     * core's: a refused gesture records no step, so nothing is pushed and the document stays
     * clean. A file core opened read-only takes nothing at all (the table offers nothing either;
     * this is the lock behind the door).
     */
    private gesture;
    private refused;
    /**
     * A command that throws is said, as a gesture's throw is, over every row painted again from the
     * tree: whatever it did before it threw is in it, and a cell may still show what was typed.
     */
    private handle;
    open(): Promise<TableView>;
    /** The answer of the last `open()` has been shown: send what follows a paint. */
    opened(): void;
    children(rowId: string): Promise<ChildRows>;
    matrix(nodeId: string): Promise<MatrixPage>;
    inspect(selection: string | readonly string[]): Promise<InspectorView>;
    subscribe(listener: (change: TableChange) => void): () => void;
    edit(msg: CellEdit): void;
    delete(rowIds: readonly string[]): void;
    addEntry(msg: NewEntry): void;
    addChild(rowId: string): void;
    private copyDeps;
    copy(rowIds: readonly string[]): void;
    cut(rowIds: readonly string[]): void;
    dragStart(rowIds: readonly string[]): void;
    dragEnd(): void;
    private transferAdapter;
    private transferDeps;
    private transferred;
    paste(rowId: string): void;
    drop(rowId: string, mode: 'copy' | 'move'): void;
    undo(): void;
    redo(): void;
    requestEditText(rowId: string): void;
    dispose(): void;
}
export {};
