import { type AppliedOp, type EntryPatch, type ScPartPatch, type Session } from 'data-explorer-core';
import type { EditableTableSource, TableView } from '../source/tableSource.js';
import { BinaryView } from './binaryView.js';
import type { EditIndex, EditSink, Notify } from './hooks.js';
import type { Registers } from './registers.js';
import { EntryBaseline } from './slddBaseline.js';
/** What a binary dictionary engine is given: its hooks (hooks.ts), and the file. */
export interface BinaryEngineOptions {
    /** Core's session the dictionary is read into and edited through. */
    session: Session;
    /** The uri the document is opened under: its identity, in every row id. */
    uri: string;
    /** The file's bytes: a compressed .sldd (a zip). */
    bytes: Uint8Array;
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
    /** How many rows a whole paint delivers before it holds the rest back. Default: LAZY_ROW_BUDGET. */
    budget?: number;
    /**
     * Called after every repaint of the document, once its views are painted: each edit, its undo
     * and redo, a save, a revert and a reload, and every error path that rebuilds from the text.
     */
    changed?: () => void;
    /**
     * The host delivers every whole paint's rows itself, and calls the view's `opened(view)` once
     * they are, with the view it delivered: a repaint's trailer (the drop rules, the clipboard, the
     * clip-mark repaint) then waits for that call, as `open()`'s does, and the repaint resolves after
     * it. Each paint's trailer follows its own rows, whatever order they are delivered in (without a
     * view, the oldest paint not yet delivered). The VS Code extension's, which posts the rows and
     * then, in the same run, what follows them and its own after-paint work. Default: false, a
     * repaint's trailer follows its rows at once.
     */
    trailerAfterDelivery?: boolean;
}
/** One save of the document, from the bytes it is about to write to their landing (`saved`) or not (`notSaved`). */
export interface BinarySave {
    /** The bytes to write. */
    readonly bytes: Uint8Array;
    /** Where the edit stack stood when they were read: what a save point is moved to (EditIndex.saved). */
    readonly at: number;
}
/** Where a wide repaint gets its tree: from chunkXml again (`'chunk'`), or the one the session holds (`'registered'`). */
export type ModelSource = 'chunk' | 'registered';
/** The document as its views reach it: what a table needs of the engine, kept off the engine's own surface, which is the host's. */
export interface BinaryDocument {
    readonly uri: string;
    readonly srcId: string;
    readonly metaPath: string;
    readonly options: BinaryEngineOptions;
    readonly session: Session;
    readonly views: Set<BinaryView>;
    readonly baseline: EntryBaseline;
    baselineCaptured: boolean;
    readonly disposed: boolean;
    readonly chunkXml: string;
    readonly parts: Record<string, Uint8Array>;
    registerModel(xml: string): any;
    liveModel(): any;
    describe(text: string): string;
    pushEdit(label: string, before: string, after: string, patch?: EntryPatch, part?: ScPartPatch): void;
    repaintAll(from?: ModelSource): void;
    repaintOps(applied: AppliedOp[]): void;
    notify(level: 'warning' | 'error' | 'status', message: string, ms?: number): void;
}
/** One open compressed dictionary: its chunk and parts, its edits, its saves, and the tables that show it. */
export declare class BinaryEngine {
    /** The uri the document is opened under. */
    readonly uri: string;
    /** The id its tree is registered under in the session: `binedit:` + the uri. */
    readonly srcId: string;
    /**
     * The `meta.path` its source is registered with, and its name in what is said of it: the last
     * segment of the uri's path, DECODED, which is the spelling a model's `gravity@my params.sldd`
     * link finds an open dictionary by (core's openSourceNamed).
     */
    readonly metaPath: string;
    private readonly options;
    private closed;
    /** The dictionary's data part, the one edit surface. */
    private chunk;
    /**
     * The pass-through parts. Changed in place only (`resetParts`), because it is the object a save
     * zips and the reader takes the catalog out of; an edit swaps one member for another array.
     */
    private readonly zipMeta;
    /**
     * The chunk as this document last read or wrote it — opened, saved, reverted or reloaded — which
     * the save gate holds a save to (core's binarySaveGate). A document restored from a backup read
     * the backup, so that is its chunk until it is saved.
     */
    private savedChunk;
    /** The pass-through parts as this document last read or wrote them, beside `savedChunk`. */
    private savedParts;
    /**
     * The entries the edits since `savedChunk` have changed, by entryKey: every entry not in here
     * must be its bytes in `savedChunk`. Each edit adds what it changes, and so does each undo and
     * redo of it, so an entry edited and then undone stays in here, which is safe. Emptied whenever
     * `savedChunk` is replaced.
     */
    private edited;
    /**
     * The entries the edits since `savedChunk` have changed while core's check could not be held to
     * them, each key mapped to every key that entry has gone by (core's uncheckableEntries). Asked
     * when each edit is made, while the entry's node still holds the bytes it was read from.
     */
    private unchecked;
    /** The tables that show it. */
    private readonly views;
    /** The Status column's baseline: the file on disk, entry by entry. */
    private readonly baseline;
    /** What each save in flight took with its bytes, by the save. */
    private readonly taken;
    private saveSeq;
    private readonly outstanding;
    private landedSeq;
    private readonly landedEdits;
    /** The document as its views reach it. */
    private readonly document;
    /**
     * Read `options.bytes`, a compressed .sldd. Throws for one that is not a dictionary: not a zip,
     * or a zip with no data part.
     */
    constructor(options: BinaryEngineOptions);
    /** Whether `dispose()` has closed it. */
    get disposed(): boolean;
    /** The dictionary's data part as it stands: the text every edit is made on. */
    get chunkXml(): string;
    /** The pass-through parts as they stand. */
    get parts(): Readonly<Record<string, Uint8Array>>;
    /**
     * For the VS Code extension's integration suites only; not for apps. What those suites do to the
     * document behind its tables, as they did before its editor moved onto this engine: set its
     * chunk as though an edit had written it (to hold the save gate to a chunk no edit could
     * write), and push an edit as a gesture pushes one. Neither repaints anything.
     */
    readonly forTests: {
        setChunk: (xml: string) => void;
        pushEdit: (label: string, before: string, after: string, patch?: EntryPatch, part?: ScPartPatch) => void;
    };
    private get session();
    private notify;
    /** Core's message, saying the file's name where core says the srcId (refusal.ts's describeSource). */
    private describe;
    /**
     * Register `xml` as this document's source and answer the tree. Every rebuild goes through here
     * — a paint, the two mid-transform rebuilds — so a source registered halfway through a cut and
     * paste is the same shape as the one a paint builds, warnings included. The sink is threaded
     * because the two halves of the read report separately: the parser fills it, then the session's
     * registration appends to the same one.
     */
    private registerModel;
    /**
     * The model as it already stands, WITHOUT re-parsing — what every edit starts from. At rest the
     * registered source describes exactly chunkXml: the only things that change chunkXml are
     * `pushEdit` and a reload, and each either changes the model to match (an edit mutates it in
     * place or applies entry ops) or re-registers it wholesale (the wide repaint), synchronously up to
     * the repaint.
     */
    private liveModel;
    /**
     * Push an edit onto the edit stack.
     *
     * `patch` names the entries each direction changes, so undo and redo can bring the model and the
     * rows back in step WITHOUT re-parsing. It is optional, and every caller that cannot state one
     * omits it: the direction then repaints from a re-parse of the text it just restored. A missing
     * or wrong patch costs latency, never correctness.
     *
     * `part` is a pass-through zip member this edit also changed — the System Composer catalog, which
     * a rename of an architectural entry has to move because it lists the entry by name. It travels
     * with the chunk in both directions, and it forces both of them WIDE: what a catalogued rename
     * changes is how an entry CLASSIFIES, and only a re-read of the chunk and the parts together
     * derives that.
     */
    private pushEdit;
    private markEdited;
    /** Record entries in `unchecked`, each group the keys of one entry, joined to any it shares one with. */
    private markUnchecked;
    /**
     * Bring the model and every view in step with a chunkXml just swapped under them. The narrow route
     * needs both halves to succeed — the ops AND a live model to apply them to — so anything
     * unexpected falls back to the wide repaint, a complete recovery even from a half-applied op list:
     * it re-registers the source from chunkXml, which is already the text this restore intended.
     */
    private applyOps;
    /** Every view painted again from the tree: from chunkXml again, or (`'registered'`) the one the session holds. */
    repaintAll(from?: ModelSource): void;
    private repaintOps;
    /**
     * Make this document hold `read`: the chunk and the parts. Shared by a revert, a reload, and a
     * revert that could not read the disk (`revertToSaved`), so all three replace it the same way.
     * Wide on purpose: the whole document came from elsewhere.
     */
    private applyDisk;
    /**
     * Replace every pass-through part, in place: `zipMeta` is the object a save zips and the reader
     * reads the catalog out of, and handing either another object is how a revert writes a chunk from
     * disk beside a part an undone edit patched.
     */
    private resetParts;
    /**
     * Make this document hold `bytes`, what the disk holds now: a revert, or a reload of an outside
     * change. Throws, changing nothing, for bytes that are not a dictionary.
     */
    replace(bytes: Uint8Array): void;
    /**
     * Put the document back to the file as it last read or wrote it — the chunk the save gate holds a
     * save to and the parts beside it: a revert that could not read the disk, which must not leave
     * the document holding edits it was told to drop.
     */
    revertToSaved(): void;
    /**
     * The save gate's two checks on the chunk as it stands, and its read, which a save re-baselines
     * from. Throws the refusal.
     */
    private gate;
    /**
     * The file as a save writes it — gated, then zipped — with nothing moved: a Save As to another
     * file. Synchronous, so the bytes are the document as it was asked for. Throws the gate's
     * refusal, and then there is nothing to write.
     */
    serialize(): Uint8Array;
    /**
     * Start a save of the file itself: the bytes (gated, then zipped), taken with where the stack
     * stands, before anything is awaited. The edits it writes are its own from now on: one that lands
     * while the bytes are being written is the next save's, as its text is. Hand it to `saved` once
     * the bytes are on disk, or to `notSaved` if they never get there, which gives its edits back.
     * Throws the gate's refusal, and then there is nothing to write and nothing to hand back.
     */
    beginSave(): BinarySave;
    /**
     * The bytes of `save` are on disk: the next save is held to the text this one wrote (not chunkXml,
     * which an edit on the write's await may have moved on), and the Status column is measured from
     * it. The edit stack's save point is the caller's to move (EditIndex.saved).
     */
    saved(save: BinarySave): void;
    /** The bytes of `save` were never written: the edits it took are unsaved again. */
    notSaved(save: BinarySave): void;
    private forgetLanded;
    /**
     * The bytes a hot-exit backup holds: the document zipped as it stands, ungated (a scratch copy of
     * what the editor already holds proves nothing the save gate will not prove again before the
     * user's file is touched), at the zip's fastest level. Moves nothing.
     */
    backup(): Uint8Array;
    /**
     * Re-capture the baseline from the document's chunkXml so the Modified marks reset after a save:
     * the tree registered again under the srcId (the one a paint paints from) and snapshotted. The
     * gate's read is reused when it is still a read of the document's payload; an edit that landed on
     * the save's await moved chunkXml on, and then it is read again.
     */
    private reBaseline;
    /** A table of the document: an EditableTableSource, until its `dispose()`. */
    view(): EditableTableSource & {
        dispose(): void;
        repaintAll(): Promise<void>;
        opened(view?: TableView): void;
    };
    /** Close the document: its tree leaves the session. Its views answer nothing more. */
    dispose(): void;
}
