import { type Session } from 'data-explorer-core';
import type { TreeTableRow } from '../rows/tableRow.js';
import { type EditableTableSource } from '../source/tableSource.js';
import type { EditIndex, EditSink, Notify } from './hooks.js';
import { type Registers } from './registers.js';
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
    /** Its name, for what is said of it. Default: the last segment of the uri's path, decoded. */
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
    /**
     * The host delivers every whole paint's rows itself, and calls the view's `opened()` once they
     * are: a repaint's trailer (the drop rules, the clipboard, the clip-mark repaint) then waits for
     * that call, as `open()`'s does, and the repaint resolves after it, so that what is said after a
     * repaint follows its trailer. One `opened()` per whole paint (each `open()` answered and each
     * `replaceAll`), in the order they were sent. The VS Code extension's, whose post of the rows is
     * awaited before what follows them. Default: false, a repaint's trailer follows its rows at once.
     */
    trailerAfterDelivery?: boolean;
}
/** One save of the document, from the bytes it is about to write to their landing (`saved`) or not (`notSaved`). */
export interface MatSave {
    /** The bytes to write. */
    readonly bytes: Uint8Array;
    /** Where the edit stack stood when they were read: what a save point is moved to (EditIndex.saved). */
    readonly at: number;
}
/** One open MAT-file: its tree, its edits, its saves, and the tables that show it. */
export declare class MatEngine {
    /** The uri the document is opened under. */
    readonly uri: string;
    /** The id its tree is registered under in the session: `binedit:` + the uri. */
    readonly srcId: string;
    /** Its name, as what is said of it names it. */
    readonly metaPath: string;
    private readonly options;
    private closed;
    /**
     * Moved by every tree registered from the disk (a reload). An edit made on one generation's tree
     * has nothing to undo on another's: its steps were on the stack that left with the old tree, so
     * its undo and redo check this first.
     */
    private treeGeneration;
    /**
     * Moved by every change to the tree, and by every save (which moves the Status column), so a
     * paint that awaited can tell it is stale.
     */
    private treeVersion;
    /** Which variables differ from the file as last saved, for the Status column. */
    private readonly marks;
    /** The tables that show it. */
    private readonly views;
    /** What each save in flight took of the Status column, by the save. */
    private readonly taken;
    /** The document as its views reach it. */
    private readonly document;
    /** The file's bytes, until the first paint registers them (`model`). */
    private bytes;
    /** The registered tree, or why there is none. Null until the first `model()`. */
    private loaded;
    /** A backup was refused, and the user was told; reset once a backup is written (`backupWritten`). */
    private backupRefusalShown;
    constructor(options: MatEngineOptions);
    /** Whether `dispose()` has closed it. */
    get disposed(): boolean;
    /** How many trees have been registered from the disk since it opened (each `replace`). */
    get generation(): number;
    /** Moved by every change to the tree and by every save: what a paint that awaited checks it against. */
    get version(): number;
    private get session();
    private notify;
    /**
     * The tree, registered from the file's bytes on the first ask: lazily, so a large file opens
     * onto the table's spinner, and not onto a blank editor while it parses. Throws why there is
     * none: a `-v7.3` file (HDF5), a file that is not a MAT-file, one the reader could not read at
     * all (refused, rather than shown as an empty file a save would then write).
     */
    private model;
    /**
     * Core's message, saying the file's name where core says the srcId. A MatNode is named by the
     * srcId it was registered under, and core quotes that name (`Cannot save "binedit:file:///…"`),
     * as a node's id, which a message can carry, begins with it. Every message shown of core's comes
     * through here.
     */
    private describe;
    /** A warning banner with core's messages described (see `describe`). */
    private describeBanner;
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
     * until a backup is written again (`backupWritten`), and throws: `kept`, an earlier backup still
     * standing, is then what a restart restores, which the notice says.
     */
    backup(kept: boolean): Uint8Array;
    /** The bytes `backup` handed back are written: a refusal after this one is said again. */
    backupWritten(): void;
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
    private record;
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
    private deleteMoved;
    /**
     * The token a cut or a drag of `variable` carries (TransferItem.origin), which `deleteMoved`
     * tells the original by: one object for as long as the variable is the same node — through
     * edits of it, a rename, and the undo of its delete, which puts the node itself back. A variable
     * made since (an Add, a paste, a reload of the file) is another node, with another token.
     */
    private originOf;
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
