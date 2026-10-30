// Copyright 2026 The MathWorks, Inc.
//
// Lifted from data-explorer-vscode src/host/BinarySlddEditorProvider.ts at c73da3c: its view's
// paint and gestures (resolveCustomEditor), as an EditableTableSource, with every VS Code call
// taken out and put behind the document's hooks (binaryEngine.ts). The extension keeps its own copy
// until its binary dictionary editor moves onto this; keep the two alike (view's CI reports a
// vscode commit to that file).
//
// What is the document's (a repaint after an edit, its undo or its redo) reaches every view of it,
// and what is a gesture's (its refusal, its selection) only the view it was made in.
import { applyEntryOps, addChildXml, addNewEntryXml, catalogFunctionRenameOf, catalogRenameOf, cellEdit, deleteChildrenXml, deleteChildXml, deleteEntriesByNameXml, deleteEntryXml, editRefusalText, entryRecord, entrySelectorOf, findEntryByName, findOwningEntry, insertOp, mutateEntry, opsOfPastedEntries, pasteEntriesXml, patchOfPairs, planDeletion, refuseDisallowedPaste, removalPairs, removeEntries, removeOp, replaceOp, reselectAfterRemoval, scXmlFunctionRenamePatch, scXmlRenamePatch, sectionByName, spliceEntryObject, } from 'data-explorer-core';
import { sectionRules } from '../actions/sectionRules.js';
import { buildSectionRowId } from '../ids/sectionRowId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { sourceWarnings, warningBanner } from '../rows/parseWarnings.js';
import { buildEntryRows, COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import { SourceClosed, } from '../source/tableSource.js';
import { copyEntriesToClipboard, dragEntries } from './clipboardAction.js';
import { clipMarkChange, clipMarkOfDoc } from './clipMarks.js';
import { sectionTarget } from './dictionaryTarget.js';
import { answerEditTextRequest } from './editText.js';
import { addChildRefusal, addEntryRefusal, deleteRefusal, refusedChange } from './refusal.js';
import { NOT_FOUND_REASON, reach } from './registers.js';
import { runTransfer } from './transfer.js';
/**
 * Run a patch or op-list builder, or give up. Every op list is a best effort: serializing an entry,
 * or naming the one an op addresses, can fail in ways that must not fail the EDIT — the text
 * transform has already succeeded by then, and an undo that repaints wide is merely slow.
 */
function attempt(build) {
    try {
        return build();
    }
    catch {
        return undefined;
    }
}
/** One table of a compressed dictionary: resolveCustomEditor's view, as an EditableTableSource. */
export class BinaryView {
    constructor(doc) {
        this.doc = doc;
        this.listeners = new Set();
        this.closed = false;
        // What follows the paint `open()` last answered, until it is delivered (`opened`). A repaint
        // sends its own after its own rows.
        this.after = null;
        // Every path that takes the entry-scoped repaint mutates through entryOps.mutateEntry, so the
        // session's node index is repaired around it; the paths that fall back to the wide repaint
        // re-register, which is the same repair at whole-source scope.
        this.findNode = (rowId) => this.session.findNodeById?.(rowId) ?? null;
        // A row's node, as the questions resolve it (children, a matrix, the inspector): whatever goes
        // wrong is no node, and the answer says there is none.
        this.findForRead = (rowId) => {
            try {
                return typeof rowId === 'string' && rowId !== '' ? this.findNode(rowId) : null;
            }
            catch {
                return null;
            }
        };
        this.name = doc.metaPath;
        this.planner = rowPlannerFor(this.name);
        const registers = doc.options.registers;
        // So that clipboard and drag broadcasts from ANY table reach this one, and so that a
        // cross-document move whose SOURCE is this dictionary can take its originals out of it: an
        // in-memory chunkXml splice pushed onto this document's own stack, then a repaint.
        this.unlisten = registers.listen({
            // The state and the repaint each on its own terms, as editorHub's broadcast reaches a view.
            clipboard: (state) => {
                reach(() => this.emit({ kind: 'clipboard', state }));
                reach(() => this.repaintClipMark());
            },
            drag: (descriptor) => this.emit({ kind: 'drag', descriptor }),
        });
        registers.registerSourceDeleter(doc.uri, (targets) => this.deleteMoved(targets));
        doc.views.add(this);
    }
    get session() {
        return this.doc.session;
    }
    emit(change) {
        if (this.closed)
            return;
        for (const listener of [...this.listeners])
            listener(change);
    }
    error(message) {
        this.emit({ kind: 'error', message });
    }
    failedEdit(err) {
        return 'Failed to apply edit: ' + this.doc.describe(err.message);
    }
    // A refused Add Child, Delete or Add, in core's words, said as every table editor says one.
    postRefusal(gesture, reason) {
        this.emit(refusedChange(gesture, reason, (text) => this.doc.describe(text)));
    }
    // --- Painting --------------------------------------------------------------------------------
    /**
     * The whole table, from the tree: from chunkXml again (`'chunk'`, what every caller that swapped
     * the text under the model needs), or the tree the session holds (`'registered'`, for a save,
     * which has just registered one built from that same chunkXml).
     */
    paint(from) {
        try {
            const node = from === 'registered' ? this.doc.liveModel() : this.doc.registerModel(this.doc.chunkXml);
            if (!this.doc.baselineCaptured) {
                this.doc.baseline.capture(node);
                this.doc.baselineCaptured = true;
            }
            const modified = this.doc.baseline.modified(node);
            const clipMark = clipMarkOfDoc(this.doc.options.registers, this.doc.uri);
            const planned = this.planner.payload(node, this.doc.options.budget ?? LAZY_ROW_BUDGET, { modifiedNames: modified, clipMark });
            // What the read of this dictionary could not read, and what the plan held back: rebuilt with
            // the model on every repaint, because an edit rewrites chunkXml and the answer is about the
            // chunk as it stands.
            const warnings = lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(node)));
            const view = {
                docUri: this.doc.uri,
                rows: planned.rows,
                columns: COLUMNS,
                columnLabels: COLUMN_LABELS,
                columnGroups: COLUMN_GROUPS,
                editable: true,
                ...(warnings === undefined ? {} : { warnings }),
            };
            return { view, trailer: { model: node, clipMark } };
        }
        catch (err) {
            throw new Error(`Failed to parse ${this.name}: ${this.doc.describe(err.message)}`);
        }
    }
    // Behind the rows, in the order the dictionary views send them: where a paste or a drop can land,
    // and what the clipboard holds. Then the clip mark: a copy or a cut that landed between the rows
    // being built and their delivery repainted the rows it marked ahead of these, so those are
    // painted again, after them. Part of the paint, as the extension's is: what throws here is said
    // as the paint's own failure, after whatever went out before it, and goes no further.
    sendTrailer(after) {
        if (this.closed)
            return;
        try {
            this.emit({ kind: 'sectionRules', docUri: this.doc.uri, rules: sectionRules(after.model) });
            this.emit({ kind: 'clipboard', state: this.doc.options.registers.clipboardState() });
            this.paintedMark = after.clipMark;
            this.repaintClipMark();
        }
        catch (err) {
            this.error(`Failed to parse ${this.name}: ${this.doc.describe(err.message)}`);
        }
    }
    /** Every row painted again, and what follows a paint. */
    repaintAll(from = 'chunk') {
        if (this.closed)
            return Promise.resolve();
        let painted;
        try {
            painted = this.paint(from);
        }
        catch (err) {
            this.error(err.message);
            return Promise.resolve();
        }
        this.emit({ kind: 'replaceAll', view: painted.view });
        this.sendTrailer(painted.trailer);
        return Promise.resolve();
    }
    // One entry's rows, stamped the way a whole paint stamps them: the baseline diff and the
    // clipboard mark, asked about ONE entry, answering as the wide path does.
    entryRows(entry, section) {
        const modified = new Set();
        if (this.doc.baseline.isModified(entry))
            modified.add(entry.name);
        return buildEntryRows(entry, section.name, modified, clipMarkOfDoc(this.doc.options.registers, this.doc.uri), undefined, LAZY_ROW_BUDGET);
    }
    /**
     * Repaint only the rows the applied ops touched: the affected entries' subtrees, from the model
     * that is already correct, spliced by the table over the runs it holds. The row ids in an op are
     * the ones the TABLE spells, which on a rename is the entry's OLD id. Any surprise falls back to
     * the wide repaint.
     */
    repaintOps(applied) {
        if (this.closed)
            return;
        try {
            for (const op of applied) {
                if (op.kind === 'remove') {
                    // An empty replacement IS the removal (spliceEntryRows).
                    this.emit({ kind: 'updateEntry', entryRowId: op.entryRowId, rows: [] });
                    continue;
                }
                const section = op.entry?.parent;
                if (!section)
                    throw new Error(`"${op.entry?.name}" is not in a section.`);
                const rows = this.entryRows(op.entry, section);
                if (op.kind === 'replace') {
                    this.emit({ kind: 'updateEntry', entryRowId: op.entryRowId, rows });
                }
                else {
                    this.emit({ kind: 'insertEntry', sectionRowId: buildSectionRowId(section.name), beforeRowId: op.beforeRowId, rows });
                }
            }
        }
        catch (err) {
            // The model change already landed, so the table must not be left showing the rows from
            // before it. Repaint wide, then say so — after, because the repaint clears the banner.
            void this.repaintAll();
            this.error(`Failed to update the row: ${this.doc.describe(err.message)}`);
        }
    }
    // Repaint ONE entry, the shape every within-entry edit takes.
    postEntry(entry, entryRowId) {
        this.repaintOps([{ kind: 'replace', entryRowId, entry }]);
    }
    /**
     * The narrow repaint that keeps the clipboard mark this view painted current: on every clipboard
     * broadcast, the entries the painted mark and the clipboard's now name between them, and nothing
     * when they are the same mark. An affected entry that is no longer in the model is skipped: its
     * rows are already gone.
     */
    repaintClipMark() {
        const next = clipMarkOfDoc(this.doc.options.registers, this.doc.uri);
        const affected = clipMarkChange(this.paintedMark, next);
        if (!affected)
            return;
        let model;
        try {
            model = this.doc.liveModel();
        }
        catch {
            // No tree to name the affected entries in. The wide repaint is both the fallback and where
            // the read error is reported; paintedMark is left alone because nothing was painted.
            void this.repaintAll();
            return;
        }
        this.paintedMark = next;
        const ops = [];
        const seen = new Set();
        for (const { section, name } of affected) {
            const entry = findEntryByName(model, section, name);
            if (!entry || seen.has(entry.id))
                continue;
            seen.add(entry.id);
            ops.push({ kind: 'replace', entryRowId: entry.id, entry });
        }
        if (ops.length > 0)
            this.repaintOps(ops);
    }
    // --- The source half of a move out of this dictionary ------------------------------------------
    // The deleter a move into another document asks of this one (the registers' source deleter).
    deleteMoved(targets) {
        const before = this.doc.chunkXml;
        const after = deleteEntriesByNameXml(before, targets);
        // Nothing answers to those names any more: renamed or deleted since the cut. Said, because the
        // move's other half has landed and the user is left holding a copy.
        if (after === before)
            return { removed: false, reason: NOT_FOUND_REASON };
        // The model half of the delete, narrowly when every target resolves to exactly one live entry,
        // keyed on the SAME targets the text splice used, so the two halves cannot remove different
        // entries. removalPairs refuses before it removes anything.
        const removal = attempt(() => removalPairs(this.doc.liveModel(), targets, this.session) ?? undefined);
        this.doc.pushEdit('Move (remove source)', before, after, removal ? patchOfPairs(removal.pairs) : undefined);
        // Repainted through the document, so every view of it repaints: this runs on behalf of ANOTHER
        // document's drop.
        if (removal)
            this.doc.repaintOps(removal.applied);
        else
            this.doc.repaintAll();
        return { removed: true };
    }
    // --- The read half -----------------------------------------------------------------------------
    // Painted when asked, as the extension paints on the webview's `ready`. A view closed answers
    // SourceClosed, which whoever relays the answer says nothing of.
    open() {
        if (this.closed)
            return Promise.reject(new SourceClosed(`${this.name} is closed.`));
        try {
            const { view, trailer } = this.paint('chunk');
            this.after = trailer;
            return Promise.resolve(view);
        }
        catch (err) {
            return Promise.reject(err);
        }
    }
    /** The answer of the last `open()` has been shown: send what follows its paint. */
    opened() {
        const after = this.after;
        this.after = null;
        if (after)
            this.sendTrailer(after);
    }
    // The rows under a row the payload deferred. No Usage column and no stamps, as the extension's
    // binary editor answers one: a fetched row matches its siblings.
    async children(rowId) {
        const { nodeId, rows, truncated } = childRowsMessage(rowId, this.findForRead(rowId), this.planner);
        return { nodeId, rows, truncated };
    }
    async matrix(nodeId) {
        const { matrix, message } = matrixCellsMessage(nodeId, this.findForRead(nodeId));
        return matrix ? { nodeId, matrix } : { nodeId, message: message ?? 'This value could not be read as a table.' };
    }
    async inspect(selection) {
        const rowIds = typeof selection === 'string' ? [selection] : selection;
        let view = { groups: [] };
        const show = { showNode: (node) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node) }), clear: () => { } };
        new InspectorSelection(show, (_uri, id) => this.findForRead(id)).show(this.doc.uri, rowIds);
        return view;
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    }
    // --- Structural edits ----------------------------------------------------------------------------
    /**
     * A structural transform WITHIN one entry: add a nested child, delete one. Always entry-scoped:
     * a nested child is a row inside the entry's run, so the whole entry's rows are rebuilt and
     * nothing else moves. Both directions of the undo are a `replace` of that one entry, from a
     * record snapshotted on either side of the transform.
     */
    applyStructural(rowId, transform, label, gesture) {
        this.doc.liveModel();
        const node = this.findNode(rowId);
        if (!node) {
            this.error('Could not locate the item in the model.');
            return;
        }
        const entry = findOwningEntry(node);
        if (!entry) {
            this.error('Could not locate the owning entry in the model.');
            return;
        }
        // Core's reason, asked before anything changes (refusal.ts).
        const refused = gesture === 'addChild' ? addChildRefusal(this.session, node.id) : deleteRefusal(this.session, [node.id]);
        if (refused) {
            this.postRefusal(gesture, refused);
            return;
        }
        // Snapshot before the transform, which mutates the model: the entry's pre-edit state is the
        // whole undo, and its id is what the table still shows.
        const entryRowId = entry.id;
        const undoOps = attempt(() => [replaceOp(entry, entryRowId)]);
        try {
            const before = this.doc.chunkXml;
            // Through mutateEntry: these transforms mutate the model before they splice the text, and the
            // repaint that follows skips the re-parse that used to repair the node index.
            const { newText, selectId } = mutateEntry(entry, () => transform(before, node), this.session);
            const redoOps = attempt(() => [replaceOp(entry, entryRowId)]);
            this.doc.pushEdit(label, before, newText, undoOps && redoOps ? { undo: undoOps, redo: redoOps } : undefined);
            this.doc.repaintOps([{ kind: 'replace', entryRowId, entry }]);
            if (selectId)
                this.emit({ kind: 'select', rowIds: [selectId] });
        }
        catch (err) {
            // A transform that throws half-way leaves a model that no longer matches chunkXml; rebuild
            // from the text first, because the repaint clears the error banner the message writes.
            this.doc.repaintAll();
            this.error(this.failedEdit(err));
        }
    }
    /**
     * Delete a whole top-level entry: forward a remove, and its undo an insert of the record at the
     * position it came from. deleteEntryXml is a text-only splice, so the model half is an op here.
     */
    applyDeleteEntry(entry) {
        const entryRowId = entry.id;
        // Both lists are read while the entry is still attached: insertOp needs its section and index,
        // and both need its serialized state.
        const patch = attempt(() => ({ undo: [insertOp(entry)], redo: [removeOp(entryRowId)] }));
        try {
            const before = this.doc.chunkXml;
            // Before the model op: the row to select next is picked from the entry's siblings.
            const { newText, selectId } = deleteEntryXml(before, entry, buildSectionRowId);
            const applied = applyEntryOps(this.doc.liveModel(), [removeOp(entryRowId)], this.session);
            this.doc.pushEdit('Delete', before, newText, patch);
            this.doc.repaintOps(applied);
            if (selectId)
                this.emit({ kind: 'select', rowIds: [selectId] });
        }
        catch (err) {
            // Nothing was pushed, so chunkXml is untouched; the model may not be. Rebuild from the text.
            this.doc.repaintAll();
            this.error(this.failedEdit(err));
        }
    }
    /**
     * Delete SEVERAL rows as ONE edit: one `after` string built by folding every removal, and one op
     * list describing all of them. READ THE MODEL FIRST: a removal takes its node out of the tree, so
     * the selectors the splice needs, the row to select afterwards, and the records the ops carry are
     * all read while the nodes are still attached.
     */
    applyDeleteMany(rowIds) {
        const model = this.doc.liveModel();
        const plan = planDeletion(rowIds, (rowId) => this.findNode(rowId));
        if (!plan.entries.length && !plan.childGroups.length) {
            this.error('Could not locate the items in the model.');
            return;
        }
        // Asked of every row the plan removes, before any leaves (refusal.ts).
        const refused = deleteRefusal(this.session, [...plan.entries, ...plan.childGroups.flatMap((g) => g.children)].map((n) => n.id));
        if (refused) {
            this.postRefusal('delete', refused);
            return;
        }
        // Read off the live tree, before anything leaves it.
        const selectors = plan.entries.map((entry) => entrySelectorOf(entry));
        const doomed = new Set(plan.entries);
        const lastEntry = plan.entries[plan.entries.length - 1];
        const entrySelectId = lastEntry
            ? reselectAfterRemoval((lastEntry.parent?.children ?? []).filter((e) => e === lastEntry || !doomed.has(e)), lastEntry, buildSectionRowId(lastEntry.parent?.name ?? ''))
            : null;
        try {
            const before = this.doc.chunkXml;
            let working = before;
            const childPairs = [];
            const applied = [];
            let childSelectId = null;
            for (const group of plan.childGroups) {
                // Before the removal: this record is what an undo restores.
                const undoOp = attempt(() => replaceOp(group.entry, group.entry.id));
                const result = mutateEntry(group.entry, () => deleteChildrenXml(working, group.children), this.session);
                working = result.newText;
                childSelectId = result.selectId ?? childSelectId;
                const redoOp = attempt(() => replaceOp(group.entry, group.entry.id));
                if (undoOp && redoOp)
                    childPairs.push({ redo: redoOp, undo: undoOp });
                applied.push({ kind: 'replace', entryRowId: group.entry.id, entry: group.entry });
            }
            working = deleteEntriesByNameXml(working, selectors);
            // The entries leave the model through the one removal every path shares, whose undo ops are
            // captured interleaved with the removals. It refuses before removing anything, and a refusal
            // costs only the narrow undo: the entries still leave, by plain ops.
            const entryRemoval = attempt(() => removeEntries(model, plan.entries, this.session));
            if (entryRemoval)
                applied.push(...entryRemoval.applied);
            else
                applied.push(...applyEntryOps(model, plan.entries.map((entry) => removeOp(entry.id)), this.session));
            // The op list is all-or-nothing: a patch missing one op would restore a partial state.
            const complete = !!entryRemoval && childPairs.length === plan.childGroups.length;
            const patch = complete ? patchOfPairs([...childPairs, ...entryRemoval.pairs]) : undefined;
            this.doc.pushEdit('Delete', before, working, patch);
            this.doc.repaintOps(applied);
            const landing = entrySelectId ?? childSelectId;
            if (landing)
                this.emit({ kind: 'select', rowIds: [landing] });
        }
        catch (err) {
            // Nothing was pushed, so chunkXml is untouched; the model may not be — the child removals
            // happen before the splice. Rebuild from the text, then say so.
            this.doc.repaintAll();
            this.error(this.failedEdit(err));
        }
    }
    // --- The commands ------------------------------------------------------------------------------
    /**
     * Delete whichever rows the gesture named. One row keeps the two shapes it has — a child leaving
     * is a `replace` of its owning entry, an entry leaving is a `remove` — and several are one fold.
     */
    delete(rowIds) {
        if (this.closed)
            return;
        if (rowIds.length !== 1) {
            this.applyDeleteMany(rowIds);
            return;
        }
        this.doc.liveModel();
        const node = this.findNode(rowIds[0]);
        if (!node) {
            this.error('Could not locate the item in the model.');
            return;
        }
        if (!node.isEntry) {
            this.applyStructural(rowIds[0], (xml, n) => deleteChildXml(xml, n), 'Delete', 'delete');
            return;
        }
        // Core's reason, asked before anything changes (refusal.ts).
        const refused = deleteRefusal(this.session, [node.id]);
        if (refused)
            this.postRefusal('delete', refused);
        else
            this.applyDeleteEntry(node);
    }
    addChild(rowId) {
        if (this.closed)
            return;
        this.applyStructural(rowId, (xml, node) => addChildXml(xml, node), 'Add child', 'addChild');
    }
    // A value edit or a rename: mutate the node, reserialize its owning entry, splice it.
    edit(msg) {
        if (this.closed)
            return;
        try {
            this.doc.liveModel();
            const node = this.findNode(msg.rowId);
            if (!node) {
                this.error('Could not locate the edited item in the model.');
                return;
            }
            const entry = findOwningEntry(node);
            if (!entry) {
                this.error('Could not locate the owning entry in the model.');
                return;
            }
            // The entry's identity BEFORE the mutation, twice over, because a rename moves both halves:
            // the entry as the XML still spells it (the span lookup must find the old text), and the id
            // the TABLE still spells it under (the row splice must find the run that is on screen).
            const entrySelectorForLookup = entrySelectorOf(entry);
            const entryRowId = entry.id;
            // The rename to carry into the System Composer catalog, which names the entry as the file
            // still does; null for all but a rename of a catalogued architectural entry. And a service
            // interface's function, which the catalog keeps a copy of. Never both.
            const catalogRename = catalogRenameOf(msg.columnId, msg.newValue, node, entry);
            const functionRename = catalogFunctionRenameOf(msg.columnId, msg.newValue, node, entry);
            // The undo half of the patch, snapshotted at the only moment the pre-edit state exists.
            const beforeRecord = attempt(() => entryRecord(entry));
            const { result, unchanged } = cellEdit(entry, node, msg.columnId, msg.newValue, this.session);
            if (result && typeof result === 'object' && result.error) {
                // Named as the session's editProperty names one: `Cannot edit "<row>": <why>.`
                this.emit({
                    kind: 'invalid',
                    reason: this.doc.describe(editRefusalText(node, msg.columnId, result.reason)),
                    invalidValue: msg.newValue,
                    previousValue: msg.oldValue,
                });
                // A rejected edit leaves the model untouched, so repainting this entry from it is what puts
                // the cell back.
                this.postEntry(entry, entryRowId);
                return;
            }
            // The cell's own text set back: nothing changed, so nothing is pushed or painted.
            if (unchanged)
                return;
            const before = this.doc.chunkXml;
            // Core writes the entry and splices it: its bytes, with what the edit changed written from
            // the model, laid out as this chunk is, and every byte around it as it was.
            const after = spliceEntryObject(before, entry, entrySelectorForLookup);
            if (after === null) {
                // The node is mutated and the text is not: rebuild from the text, so the orphan mutation
                // goes, then say so.
                this.doc.repaintAll();
                this.error('Could not locate the entry text to update.');
                return;
            }
            // Each direction addresses the entry by the id the OTHER one leaves behind, and a RENAME
            // makes those two different.
            const redoOps = attempt(() => [replaceOp(entry, entryRowId)]);
            const patch = beforeRecord && redoOps ? { undo: [{ kind: 'replace', rowId: entry.id, record: beforeRecord }], redo: redoOps } : undefined;
            // The catalog is a zip member this document only passes through, so carrying the rename into
            // it is a member swap: after the validation gate, so a rejected edit does not pay for it.
            const scPart = catalogRename
                ? scXmlRenamePatch(this.doc.parts, catalogRename.oldName, catalogRename.newName)
                : functionRename
                    ? scXmlFunctionRenamePatch(this.doc.parts, functionRename)
                    : null;
            this.doc.pushEdit('Edit ' + msg.columnId, before, after, patch, scPart ?? undefined);
            this.doc.repaintOps([{ kind: 'replace', entryRowId, entry }]);
            if (msg.columnId === 'Name')
                this.emit({ kind: 'select', rowIds: [node.id] });
        }
        catch (err) {
            // setProperty may have landed before the throw, and the repaint clears the banner.
            this.doc.repaintAll();
            this.error(this.failedEdit(err));
        }
    }
    /** Create ONE new default entry from the Add gallery: one fragment into the XML, one insert op, one narrow repaint. */
    addEntry(msg) {
        if (this.closed)
            return;
        try {
            const model = this.doc.liveModel();
            const section = sectionByName(model, msg.section ?? '');
            if (!section) {
                this.error('Could not resolve the target section.');
                return;
            }
            // Core's reason, asked before anything changes (refusal.ts).
            const refused = addEntryRefusal(this.session, section.id, msg.className);
            if (refused) {
                this.postRefusal('add', refused);
                return;
            }
            const before = this.doc.chunkXml;
            // Before the add: the mark the new tail is measured from.
            const addedFrom = section.children.length;
            const { newText, selectId } = addNewEntryXml(before, section, msg.className);
            // Indexes the new subtree and states the insert for the undo.
            const added = opsOfPastedEntries(section, addedFrom, this.session);
            this.doc.pushEdit('Add', before, newText, patchOfPairs(added.pairs));
            this.doc.repaintOps(added.applied);
            if (selectId) {
                this.emit({ kind: 'select', rowIds: [selectId] });
                // After the selection, which expands and scrolls the row into view. Unpinned only.
                if (msg.rename)
                    this.emit({ kind: 'beginRename', rowId: selectId });
            }
        }
        catch (err) {
            // `addEntry` attaches the new node before the splice can fail: rebuild from the text first.
            this.doc.repaintAll();
            this.error(this.failedEdit(err));
        }
    }
    // --- The clipboard and row drags ---------------------------------------------------------------
    copyDeps(broadcast) {
        return {
            session: this.session,
            registers: this.doc.options.registers,
            // From the model as it stands: a cut, a copy or a drag's start changes no text, so a re-parse
            // could only reproduce the tree that is already there.
            refresh: () => {
                this.doc.liveModel();
            },
            findNode: this.findNode,
            post: (message) => this.error(this.doc.describe(message.message)),
            broadcast,
        };
    }
    copy(rowIds) {
        if (this.closed)
            return;
        copyEntriesToClipboard(rowIds, 'copy', this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
    }
    cut(rowIds) {
        if (this.closed)
            return;
        copyEntriesToClipboard(rowIds, 'cut', this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
    }
    dragStart(rowIds) {
        if (this.closed)
            return;
        dragEntries(rowIds, this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastDragState()));
    }
    dragEnd() {
        if (this.closed)
            return;
        this.doc.options.registers.clearDrag();
        this.doc.options.registers.broadcastDragState();
    }
    // --- Paste and drop: one transfer, two registers -------------------------------------------------
    //
    // What a paste or a drop MEANS is transfer.ts's. What is left here is what an edit IS in this
    // format: XML splices folded into chunkXml, pushed as one edit with the entry ops that let its
    // undo and redo skip the re-parse. The whole edit is synchronous from chunkXml to pushEdit, so
    // nothing can land in between.
    transferAdapter() {
        return {
            docUri: this.doc.uri,
            resolveTarget: (rowId) => sectionTarget(this.doc.liveModel(), this.findNode(rowId), rowId),
            validate: (target, payloads) => refuseDisallowedPaste(target.section, payloads),
            commit: ({ target, payloads, removeFirst, label }) => {
                let section = target.section;
                const before = this.doc.chunkXml;
                let working = before;
                // The forward changes in the order they happen, each with its inverse.
                const pairs = [];
                const applied = [];
                let narrow = true;
                // A same-document move removes the sources first so the pasted copies can keep their names
                // — from the text AND from the model, whose namespace the uniqueness check reads.
                if (removeFirst.length > 0) {
                    working = deleteEntriesByNameXml(working, removeFirst);
                    const removal = removalPairs(target.model, removeFirst, this.session);
                    if (removal) {
                        pairs.push(...removal.pairs);
                        applied.push(...removal.applied);
                    }
                    else {
                        // The model cannot say which entries the selectors mean, so it catches up the old way,
                        // and the target section is found again in the tree that replaced it — by name.
                        narrow = false;
                        section = sectionByName(this.doc.registerModel(working), target.sectionName);
                        if (!section)
                            throw new Error('Could not resolve the target section.');
                    }
                }
                // The fold attaches each new entry to the section itself, APPENDING it, so whatever it
                // added is the tail this count marks off; entryOps indexes each new subtree and describes
                // it for the undo stack.
                const addedFrom = section.children.length;
                const { newText, selectIds } = pasteEntriesXml(working, section, payloads);
                const added = opsOfPastedEntries(section, addedFrom, this.session);
                pairs.push(...added.pairs);
                applied.push(...added.applied);
                this.doc.pushEdit(label, before, newText, narrow ? patchOfPairs(pairs) : undefined);
                if (narrow)
                    this.doc.repaintOps(applied);
                else
                    this.doc.repaintAll();
                if (selectIds.length)
                    this.emit({ kind: 'select', rowIds: selectIds });
            },
            // A paste attaches its new nodes to the model before it can fail on the text, and a move has
            // taken its sources out, so the model may be a step ahead of chunkXml. Rebuild from the text
            // first, because the repaint clears the banner.
            onFailure: (err) => {
                this.doc.repaintAll();
                this.error(this.failedEdit(err));
            },
            report: (message) => this.error(this.doc.describe(message)),
        };
    }
    // A move that left its original behind is said where it stays, not only in the banner a row
    // update clears: see TransferDeps.warn.
    transferDeps() {
        return {
            deleteFromSource: (uri, selectors) => this.doc.options.registers.deleteFromSource(uri, selectors),
            warn: (message) => this.doc.notify('warning', message),
        };
    }
    paste(rowId) {
        if (this.closed)
            return;
        const registers = this.doc.options.registers;
        void runTransfer({ rowId }, registers.clipboardRegister(() => registers.broadcastClipboardState()), this.transferAdapter(), this.transferDeps());
    }
    drop(rowId, mode) {
        if (this.closed)
            return;
        const registers = this.doc.options.registers;
        void runTransfer({ rowId }, registers.dragRegister(mode, () => registers.broadcastDragState()), this.transferAdapter(), this.transferDeps());
    }
    // --- Undo, redo, and the whole text of a Value ---------------------------------------------------
    undo() {
        if (this.closed)
            return;
        this.doc.options.sink.undo();
    }
    redo() {
        if (this.closed)
            return;
        this.doc.options.sink.redo();
    }
    // A Value editor is opening on a summary: send its whole text, read off the live tree, as an edit
    // is (editText.ts).
    requestEditText(rowId) {
        if (this.closed)
            return;
        this.emit(answerEditTextRequest(this.session, (id) => (this.doc.liveModel(), this.findNode(id)), rowId, (text) => this.doc.describe(text)));
    }
    dispose() {
        if (this.closed)
            return;
        this.closed = true;
        this.doc.views.delete(this);
        this.unlisten();
        this.listeners.clear();
        const registers = this.doc.options.registers;
        // A drag that started in this view and is still on goes with it, so a stale register cannot
        // complete against another document.
        if (registers.getDrag()?.sourceDocUri === this.doc.uri) {
            registers.clearDrag();
            registers.broadcastDragState();
        }
        // Only once the LAST view of the document closes: both are the document's.
        if (this.doc.views.size === 0) {
            registers.unregisterSourceDeleter(this.doc.uri);
            this.doc.baseline.clear();
        }
    }
}
