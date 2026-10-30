// Copyright 2026 The MathWorks, Inc.
//
// Lifted from data-explorer-vscode src/host/BinarySlddEditorProvider.ts at c73da3c: its document
// (BinarySlddDocument) and its save, backup and revert, with every VS Code call taken out and put
// behind the hooks an editable source is given (hooks.ts): core's session, the edit stack and its
// save point, the registers, and where a notice goes. Its views' gestures are binaryView.ts. The
// extension keeps its own copy until its binary dictionary editor moves onto this; keep the two
// alike (view's CI reports a vscode commit to that file).
//
// A COMPRESSED-BINARY (zip/XML) .sldd. Its only editable text payload is data/chunk0.xml; every
// other part passes through verbatim. The document holds that chunkXml string as its single edit
// surface plus the pass-through parts. Every table edit is a pure string transform on chunkXml
// (core's xmlStructuralEdit), replacing only the touched entry's <Object>…</Object> with what
// core's spliceEntryObject writes for it: the entry's bytes with what the edit changed written
// from the model, laid out as the chunk is, and every byte around it as it was. Untouched entries
// stay byte-identical.
//
// The document owns its own edit stack (the EditSink): undo and redo restore the chunk text, and
// rebuild the entries they change from that text (entryOps' fragments), so an undone entry keeps
// the bytes it came from. The save gate (`beginSave`, `serialize`) makes two checks before it hands
// back any bytes, and a refusal hands back none:
//  - it re-reads chunkXml and refuses the save if the chunk does not read back, so a serializer bug
//    that breaks the markup, or a chunk core would read as an empty dictionary, becomes a failed
//    save;
//  - it compares chunkXml with the chunk as last read or saved, entry by entry, with a scan of the
//    markup rather than core's reader (core's binarySaveGate): an entry no edit changed must be its
//    bytes, and an edited one must keep every part the edit did not change (core's
//    keptPartsViolations), or the save is refused, naming the entry.
// Neither checks that an edited value is right; keeping that right is core's writers' job.
//
// The model is registered in core's session under a srcId that PREFIXES the uri (ids/srcId.ts),
// so it never collides with a read-only view's model of the same file.
import { applyEntryOps, changedEntryKeys, DATA_PART_XML, chunkEntryKey, entryKey, findEntryObjectSpan, readBinarySlddPackage, SavedChunk, savedChunkRefusal, scanChunkEntries, uncheckableEntries, writeBinarySlddPackage, } from 'data-explorer-core';
import { uriPathBasename } from '../ids/pathUtil.js';
import { binaryEditSrcId } from '../ids/srcId.js';
import { readSlddParts } from '../workspace/slddContent.js';
import { BinaryView } from './binaryView.js';
import { describeSource } from './refusal.js';
import { EntryBaseline } from './slddBaseline.js';
const recordName = (record) => String(record.name ?? '');
const recordUuid = (record) => {
    const uuid = record.metadata?.uuid;
    return typeof uuid === 'string' && uuid ? uuid : undefined;
};
/**
 * The entries an edit changes, by entryKey: those its patch names — every op that builds an entry
 * carries its record, and a removal's record is the inverse op's, on the other side — or, for an
 * edit that could not state a patch, those whose text differs between its two chunks.
 */
function keysOfEdit(before, after, patch) {
    const keys = new Set();
    for (const op of patch ? [...patch.undo, ...patch.redo] : []) {
        if (op.kind !== 'remove')
            keys.add(entryKey(recordName(op.record), recordUuid(op.record)));
    }
    return keys.size > 0 || before === after ? keys : changedEntryKeys(before, after);
}
/**
 * For each entry an edit's patch rebuilds in its slot, its key before the edit (its undo record's),
 * by the row id it has after the edit, which is the one its undo op addresses.
 */
function keysBeforeEdit(patch) {
    const keys = new Map();
    for (const op of patch.undo) {
        if (op.kind === 'replace')
            keys.set(op.rowId, entryKey(recordName(op.record), recordUuid(op.record)));
    }
    return keys;
}
/** How many ops look their fragment up one at a time; more share one scan of the chunk. */
const FRAGMENT_LOOKUPS = 4;
/**
 * Give each op that rebuilds an entry that entry's `<Object>` text in `chunk`, the chunk state the
 * op restores, so the entry it rebuilds keeps the bytes it came from (entryOps' EntryFragment).
 * Once per op: an op restores the same chunk every time it runs. A few ops each look theirs up with
 * core's findEntryObjectSpan; more share one scan. One cut from the wrong place costs nothing but
 * the provenance: entryOps uses a fragment only when it reads as exactly the entry the op's record
 * names.
 */
function cutFragments(chunk, ops) {
    const wanting = ops.filter((op) => op.kind !== 'remove' && op.fragment === undefined);
    if (wanting.length === 0)
        return;
    if (wanting.length <= FRAGMENT_LOOKUPS) {
        for (const op of wanting) {
            const span = findEntryObjectSpan(chunk, { name: recordName(op.record), uuid: recordUuid(op.record) });
            op.fragment = span ? chunk.slice(span.offset, span.offset + span.length) : null;
        }
        return;
    }
    const scan = scanChunkEntries(chunk);
    const found = new Map();
    for (const entry of scan.clean ? scan.entries : []) {
        const key = chunkEntryKey(entry);
        found.set(key, [...(found.get(key) ?? []), entry]);
    }
    for (const op of wanting) {
        const list = found.get(entryKey(recordName(op.record), recordUuid(op.record)));
        op.fragment = list?.length === 1 ? chunk.slice(list[0].start, list[0].end) : null;
    }
}
/** One open compressed dictionary: its chunk and parts, its edits, its saves, and the tables that show it. */
export class BinaryEngine {
    /**
     * Read `options.bytes`, a compressed .sldd. Throws for one that is not a dictionary: not a zip,
     * or a zip with no data part.
     */
    constructor(options) {
        this.closed = false;
        /**
         * The entries the edits since `savedChunk` have changed, by entryKey: every entry not in here
         * must be its bytes in `savedChunk`. Each edit adds what it changes, and so does each undo and
         * redo of it, so an entry edited and then undone stays in here, which is safe. Emptied whenever
         * `savedChunk` is replaced.
         */
        this.edited = new Set();
        /**
         * The entries the edits since `savedChunk` have changed while core's check could not be held to
         * them, each key mapped to every key that entry has gone by (core's uncheckableEntries). Asked
         * when each edit is made, while the entry's node still holds the bytes it was read from.
         */
        this.unchecked = new Map();
        /** The tables that show it. */
        this.views = new Set();
        /** The Status column's baseline: the file on disk, entry by entry. */
        this.baseline = new EntryBaseline();
        /** What each save in flight took with its bytes, by the save. */
        this.taken = new WeakMap();
        // Saves can land in any order in the page, where VS Code runs a document's saves one at a time.
        // One that lands after a newer one leaves the file holding its older bytes, and the edits the
        // newer ones wrote unsaved again: they are given back to `edited`, from what each landed save
        // took, kept while an older save is still out.
        this.saveSeq = 0;
        this.outstanding = new Set();
        this.landedSeq = 0;
        this.landedEdits = new Map();
        /**
         * For the VS Code extension's integration suites only; not for apps. What those suites do to the
         * document behind its tables, as they did before its editor moved onto this engine: set its
         * chunk as though an edit had written it (to hold the save gate to a chunk no edit could
         * write), push an edit as a gesture pushes one, replace its pass-through parts from a zip's
         * members as a reload does, and reach the set of tables a repaint reaches (where a suite puts a
         * stand-in, `{ repaintAll, repaintOps }`, to see which repaint ran; closing the document closes
         * only the tables that are real), and read what the Status column marks against the baseline a
         * save took. None repaints anything.
         */
        this.forTests = {
            setChunk: (xml) => {
                this.chunk = xml;
            },
            pushEdit: (label, before, after, patch, part) => this.pushEdit(label, before, after, patch, part),
            resetParts: (members) => this.resetParts(members),
            /**
             * The entries the Status column marks Modified in `node` (by default the tree the session
             * holds for the document), against its baseline: what a paint would stamp. Throws when no
             * baseline has been taken, which would mark nothing and so prove nothing.
             */
            modified: (node = this.session.getDataSource(this.srcId)) => {
                if (!this.baseline.captured)
                    throw new Error(`No baseline has been taken for ${this.metaPath}.`);
                return this.baseline.modified(node);
            },
            views: this.views,
        };
        this.options = options;
        this.uri = options.uri;
        this.srcId = binaryEditSrcId(options.uri);
        // The last segment of the uri's path, decoded, as `basename(uri.path)` names a VS Code uri.
        this.metaPath = options.name ?? (uriPathBasename(options.uri) || 'document');
        const read = readBinarySlddPackage(options.bytes);
        this.chunk = read.chunkXml;
        this.zipMeta = read.parts;
        this.savedChunk = new SavedChunk(read.chunkXml);
        this.savedParts = { ...read.parts };
        const engine = this;
        let baselineCaptured = false;
        this.document = {
            uri: this.uri,
            srcId: this.srcId,
            metaPath: this.metaPath,
            options,
            session: options.session,
            views: this.views,
            baseline: this.baseline,
            // Document-scoped, not per view: a second table opened after an edit must not baseline
            // against the edited content and clear every Modified mark.
            get baselineCaptured() {
                return baselineCaptured;
            },
            set baselineCaptured(value) {
                baselineCaptured = value;
            },
            get disposed() {
                return engine.closed;
            },
            get chunkXml() {
                return engine.chunk;
            },
            get parts() {
                return engine.zipMeta;
            },
            registerModel: (xml) => this.registerModel(xml),
            liveModel: () => this.liveModel(),
            describe: (text) => this.describe(text),
            pushEdit: (label, before, after, patch, part) => this.pushEdit(label, before, after, patch, part),
            repaintAll: (from) => this.repaintAll(from),
            repaintOps: (applied) => this.repaintOps(applied),
            notify: (level, message, ms) => this.notify(level, message, ms),
        };
    }
    /** Whether `dispose()` has closed it. */
    get disposed() {
        return this.closed;
    }
    /** The dictionary's data part as it stands: the text every edit is made on. */
    get chunkXml() {
        return this.chunk;
    }
    /** The pass-through parts as they stand. */
    get parts() {
        return this.zipMeta;
    }
    get session() {
        return this.options.session;
    }
    notify(level, message, ms) {
        this.options.notify?.({ level, message, ...(ms === undefined ? {} : { ms }) });
    }
    /** Core's message, saying the file's name where core says the srcId (refusal.ts's describeSource). */
    describe(text) {
        return describeSource(this.srcId, this.metaPath)(text);
    }
    /**
     * Register `xml` as this document's source and answer the tree. Every rebuild goes through here
     * — a paint, the two mid-transform rebuilds — so a source registered halfway through a cut and
     * paste is the same shape as the one a paint builds, warnings included. The sink is threaded
     * because the two halves of the read report separately: the parser fills it, then the session's
     * registration appends to the same one.
     */
    registerModel(xml) {
        this.session.removeDataSource(this.srcId);
        const warnings = [];
        const content = readSlddParts(xml, this.zipMeta, warnings);
        return this.session.addDataSource(this.srcId, content, { path: this.metaPath }, warnings);
    }
    /**
     * The model as it already stands, WITHOUT re-parsing — what every edit starts from. At rest the
     * registered source describes exactly chunkXml: the only things that change chunkXml are
     * `pushEdit` and a reload, and each either changes the model to match (an edit mutates it in
     * place or applies entry ops) or re-registers it wholesale (the wide repaint), synchronously up to
     * the repaint.
     */
    liveModel() {
        return this.session.getDataSource?.(this.srcId) ?? this.registerModel(this.chunk);
    }
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
    pushEdit(label, before, after, patch, part) {
        // What the save gate is told this edit changes, in both directions — see `edited`.
        const changed = keysOfEdit(before, after, patch);
        // And which of those entries the check cannot be held to, asked now — see `unchecked`.
        const uncheckable = uncheckableEntries(this.session.getDataSource(this.srcId) ?? null, changed, patch ? keysBeforeEdit(patch) : null);
        this.chunk = after;
        this.markEdited(changed);
        this.markUnchecked(uncheckable);
        if (part)
            this.zipMeta[part.member] = part.after;
        const { index, sink } = this.options;
        // The stack's position moves with the stack: this push, and each undo or redo of it.
        index.pushed();
        sink.push({
            label,
            undo: () => {
                index.undone();
                this.markEdited(changed);
                this.markUnchecked(uncheckable);
                this.chunk = before;
                if (part)
                    this.zipMeta[part.member] = part.before;
                this.applyOps(part ? undefined : patch?.undo);
            },
            redo: () => {
                index.redone();
                this.markEdited(changed);
                this.markUnchecked(uncheckable);
                this.chunk = after;
                if (part)
                    this.zipMeta[part.member] = part.after;
                this.applyOps(part ? undefined : patch?.redo);
            },
        });
    }
    markEdited(keys) {
        for (const key of keys)
            this.edited.add(key);
    }
    /** Record entries in `unchecked`, each group the keys of one entry, joined to any it shares one with. */
    markUnchecked(groups) {
        for (const group of groups) {
            const keys = new Set(group);
            for (const key of [...keys])
                for (const alias of this.unchecked.get(key) ?? [])
                    keys.add(alias);
            for (const key of keys)
                this.unchecked.set(key, keys);
        }
    }
    /**
     * Bring the model and every view in step with a chunkXml just swapped under them. The narrow route
     * needs both halves to succeed — the ops AND a live model to apply them to — so anything
     * unexpected falls back to the wide repaint, a complete recovery even from a half-applied op list:
     * it re-registers the source from chunkXml, which is already the text this restore intended.
     */
    applyOps(ops) {
        if (ops && ops.length > 0) {
            try {
                const model = this.session.getDataSource(this.srcId);
                if (model) {
                    // chunkXml is already the text this undo or redo restores: what the ops rebuild their
                    // entries from.
                    cutFragments(this.chunk, ops);
                    this.repaintOps(applyEntryOps(model, ops, this.session));
                    return;
                }
            }
            catch {
                /* fall through to the wide repaint */
            }
        }
        this.repaintAll();
    }
    /** Every view painted again from the tree: from chunkXml again, or (`'registered'`) the one the session holds. */
    repaintAll(from = 'chunk') {
        // Copied because a repaint can dispose a view, and a set mutated mid-iteration is how one
        // view's failure silently skips another's.
        for (const view of [...this.views])
            view.repaintAll(from);
        this.options.changed?.();
    }
    repaintOps(applied) {
        for (const view of [...this.views])
            view.repaintOps(applied);
        this.options.changed?.();
    }
    /**
     * Make this document hold `read`: the chunk and the parts. Shared by a revert, a reload, and a
     * revert that could not read the disk (`revertToSaved`), so all three replace it the same way.
     * Wide on purpose: the whole document came from elsewhere.
     */
    applyDisk(read) {
        this.chunk = read.chunkXml;
        // What a save is held to from now on, and nothing yet edited against it.
        this.savedChunk = new SavedChunk(read.chunkXml);
        this.savedParts = { ...read.parts };
        this.edited = new Set();
        this.unchecked = new Map();
        // The parts too: an edit can have patched one of them (a rename carried into the System
        // Composer catalog), and a revert that restored only the chunk would leave the entry named as
        // the file spells it beside a catalog that no longer classifies it.
        this.resetParts(read.parts);
        this.repaintAll();
    }
    /**
     * Replace every pass-through part, in place: `zipMeta` is the object a save zips and the reader
     * reads the catalog out of, and handing either another object is how a revert writes a chunk from
     * disk beside a part an undone edit patched.
     */
    resetParts(parts) {
        for (const member of Object.keys(this.zipMeta))
            delete this.zipMeta[member];
        for (const [member, data] of Object.entries(parts))
            if (member !== DATA_PART_XML)
                this.zipMeta[member] = data;
    }
    /**
     * Make this document hold `bytes`, what the disk holds now: a revert, or a reload of an outside
     * change. Throws, changing nothing, for bytes that are not a dictionary.
     */
    replace(bytes) {
        this.applyDisk(readBinarySlddPackage(bytes));
    }
    /**
     * Put the document back to the file as it last read or wrote it — the chunk the save gate holds a
     * save to and the parts beside it: a revert that could not read the disk, which must not leave
     * the document holding edits it was told to drop.
     */
    revertToSaved() {
        this.applyDisk({ chunkXml: this.savedChunk.xml, parts: this.savedParts });
    }
    /**
     * The save gate's two checks on the chunk as it stands, and its read, which a save re-baselines
     * from. Throws the refusal.
     */
    gate() {
        let gated;
        try {
            const warnings = [];
            const chunkXml = this.chunk;
            gated = { chunkXml, content: readSlddParts(chunkXml, this.zipMeta, warnings), warnings };
        }
        catch (err) {
            throw new Error('Refusing to save: the document did not re-parse (' + err.message + ').');
        }
        const refusal = savedChunkRefusal(this.savedChunk, gated.chunkXml, this.edited, this.session.getDataSource(this.srcId) ?? null, this.unchecked);
        if (refusal)
            throw new Error(refusal);
        return gated;
    }
    /**
     * The file as a save writes it — gated, then zipped — with nothing moved: a Save As to another
     * file. Synchronous, so the bytes are the document as it was asked for. Throws the gate's
     * refusal, and then there is nothing to write.
     */
    serialize() {
        this.gate();
        return writeBinarySlddPackage(this.chunk, { ...this.zipMeta }, 6);
    }
    /**
     * Start a save of the file itself: the bytes (gated, then zipped), taken with where the stack
     * stands, before anything is awaited. The edits it writes are its own from now on: one that lands
     * while the bytes are being written is the next save's, as its text is. Hand it to `saved` once
     * the bytes are on disk, or to `notSaved` if they never get there, which gives its edits back.
     * Throws the gate's refusal, and then there is nothing to write and nothing to hand back.
     */
    beginSave() {
        const gated = this.gate();
        const parts = { ...this.zipMeta };
        const bytes = writeBinarySlddPackage(this.chunk, parts, 6);
        const save = { bytes, at: this.options.index.here() };
        const seq = ++this.saveSeq;
        this.outstanding.add(seq);
        this.taken.set(save, { gated, parts, edited: this.edited, unchecked: this.unchecked, seq });
        this.edited = new Set();
        this.unchecked = new Map();
        return save;
    }
    /**
     * The bytes of `save` are on disk: the next save is held to the text this one wrote (not chunkXml,
     * which an edit on the write's await may have moved on), and the Status column is measured from
     * it. The edit stack's save point is the caller's to move (EditIndex.saved).
     */
    saved(save) {
        const taken = this.taken.get(save);
        if (!taken)
            return;
        this.taken.delete(save);
        this.outstanding.delete(taken.seq);
        if (taken.seq < this.landedSeq) {
            for (const [seq, later] of this.landedEdits) {
                if (seq <= taken.seq)
                    continue;
                for (const key of later.edited)
                    this.edited.add(key);
                this.markUnchecked(new Set(later.unchecked.values()));
            }
        }
        else {
            this.landedSeq = taken.seq;
        }
        this.landedEdits.set(taken.seq, { edited: taken.edited, unchecked: taken.unchecked });
        this.forgetLanded();
        this.savedChunk = new SavedChunk(taken.gated.chunkXml);
        this.savedParts = taken.parts;
        // Baseline BEFORE painting, or the paint diffs against the pre-save baseline and stamps
        // Modified on rows the save just made clean.
        this.reBaseline(taken.gated);
        // Wide on purpose: a save clears the Modified mark on every row that had one. From the tree the
        // line above has just registered.
        this.repaintAll('registered');
    }
    /** The bytes of `save` were never written: the edits it took are unsaved again. */
    notSaved(save) {
        const taken = this.taken.get(save);
        if (!taken)
            return;
        this.taken.delete(save);
        this.outstanding.delete(taken.seq);
        this.forgetLanded();
        for (const key of taken.edited)
            this.edited.add(key);
        this.markUnchecked(new Set(taken.unchecked.values()));
    }
    // What a landed save took is kept only while a save begun before it is still out.
    forgetLanded() {
        const oldest = Math.min(...this.outstanding);
        for (const seq of this.landedEdits.keys())
            if (seq <= oldest)
                this.landedEdits.delete(seq);
    }
    /**
     * The bytes a hot-exit backup holds: the document zipped as it stands, ungated (a scratch copy of
     * what the editor already holds proves nothing the save gate will not prove again before the
     * user's file is touched), at the zip's fastest level. Moves nothing.
     */
    backup() {
        return writeBinarySlddPackage(this.chunk, { ...this.zipMeta }, 1);
    }
    /**
     * Re-capture the baseline from the document's chunkXml so the Modified marks reset after a save:
     * the tree registered again under the srcId (the one a paint paints from) and snapshotted. The
     * gate's read is reused when it is still a read of the document's payload; an edit that landed on
     * the save's await moved chunkXml on, and then it is read again.
     */
    reBaseline(gated) {
        try {
            const reuse = gated.chunkXml === this.chunk ? gated : null;
            this.session.removeDataSource(this.srcId);
            // The sink is threaded here too: a node that carries its warnings on one route into the
            // session and not on another is how a source silently stops reporting.
            const warnings = reuse?.warnings ?? [];
            const content = reuse?.content ?? readSlddParts(this.chunk, this.zipMeta, warnings);
            const node = this.session.addDataSource(this.srcId, content, { path: this.metaPath }, warnings);
            this.baseline.capture(node);
        }
        catch {
            /* leave the baseline as it is on a parse failure */
        }
    }
    /** A table of the document: an EditableTableSource, until its `dispose()`. */
    view() {
        return new BinaryView(this.document);
    }
    /** Close the document: its tree leaves the session. Its views answer nothing more. */
    dispose() {
        if (this.closed)
            return;
        this.closed = true;
        // A stand-in a suite put in the set (forTests.views) has no table to close.
        for (const view of [...this.views])
            view.dispose?.();
        this.session.removeDataSource(this.srcId);
    }
}
