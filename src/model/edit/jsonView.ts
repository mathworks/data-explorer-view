// Copyright 2026 The MathWorks, Inc.
//
// Lifted from data-explorer-vscode src/host/SlddTextEditorProvider.ts at c73da3c: one table of a
// JSON dictionary (resolveCustomTextEditor's view) — its paints, the narrow repaints that keep it in
// step with every change of the text, and its gestures — as an EditableTableSource, with every VS
// Code call taken out and put behind the document's hooks (jsonEngine.ts). The extension keeps its
// own copy until its JSON dictionary editor moves onto this; keep the two alike (view's CI reports a
// vscode commit to that file).
//
// THE TEXT IS THE TRUTH. Every edit changes the tree, PAINTS the rows it changed, and then writes
// the text, a patch of the entry's own span (one undo step); the change the write fires confirms
// the paint (its echo), and every other change of the text — an undo, a redo, a keystroke in a text
// view, a reload — is planned narrowly where it can be (core's jsonEntrySync), and repainted wide
// where it cannot. Structural edits are queued, one text state at a time (queueStructural).
import {
  addChild as addChildEdit,
  addNewEntry,
  applyEntryOps,
  catalogFunctionRenameOf,
  catalogRenameOf,
  cellEdit,
  deleteChild,
  deleteChildren,
  deleteEntriesByName,
  deleteEntry,
  detectIndent,
  editRefusalText,
  entrySelectorOf,
  findEntryByName,
  findEntrySpan,
  findOwningEntry,
  hintFor,
  insertOp,
  isPaintedEcho,
  minimalReplacement,
  mutateEntry,
  opsOfPastedEntries,
  parsesAsJson,
  pasteEntries,
  patchOfPairs,
  planDeletion,
  planEntrySync,
  planKnownChange,
  planKnownOps,
  planOwnEdit,
  refuseDisallowedPaste,
  removalPairs,
  removeEntries,
  removeOp,
  replaceOp,
  reselectAfterRemoval,
  reserializeEntry,
  scJsonFunctionRenameEdits,
  scJsonRenameEdits,
  sectionByName,
  type AppliedOp,
  type EntryOpPair,
  type EntrySelector,
  type HostEdit,
  type KnownEdit,
  type PaintedWrite,
  type Removal,
  type Session,
  type StructuralResult,
  type TextPatch,
} from 'data-explorer-core';
import { sectionRules } from '../actions/sectionRules.js';
import { buildSectionRowId } from '../ids/sectionRowId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { sourceWarnings, warningBanner } from '../rows/parseWarnings.js';
import { buildEntryRows, COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor, type RowPlanner } from '../rows/rowPlanner.js';
import type { ClipMark } from '../rows/rowStamp.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import {
  SourceClosed,
  type CellEdit,
  type ChildRows,
  type EditableTableSource,
  type InspectorView,
  type MatrixPage,
  type NewEntry,
  type TableChange,
  type TableView,
} from '../source/tableSource.js';
import { parseDetached } from '../workspace/SlddModel.js';
import { copyEntriesToClipboard, dragEntries, type CopyDeps } from './clipboardAction.js';
import { clipMarkChange, clipMarkOfDoc } from './clipMarks.js';
import { sectionTarget, type SectionTarget } from './dictionaryTarget.js';
import { answerEditTextRequest } from './editText.js';
import type { RangeReplacement, TextStoreChange } from './hooks.js';
import type { JsonDocState, JsonDocument } from './jsonEngine.js';
import { addChildRefusal, addEntryRefusal, deleteRefusal, refusedChange, type RefusedGesture } from './refusal.js';
import { NOT_FOUND_REASON, reach, type DeleteTarget } from './registers.js';
import { baselineOwed, diskBaselineUsable, sameDiskStamp, type DiskStamp } from './slddBaseline.js';
import { runTransfer, type SourceDeleteResult, type TransferAdapter, type TransferDeps } from './transfer.js';
import { wideLanding } from './wideRepaint.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Where an entry-scoped paint left its entry: the run the table now holds it under, the id the file
 * still spells it by (the two differ by a rename), and the wide repaints begun when the paint went
 * out.
 */
type PaintedRun = { rowId: string; fileRowId: string; epoch: number };

/** What follows a whole paint, once its rows are delivered: the drop rules, and the clipboard mark they carry. */
interface Trailer {
  model: any;
  clipMark: ClipMark | undefined;
}

/**
 * The edits this table remembers past their own change, newest last, because the text can hand any
 * of them back as an undo or a redo (planKnownChange, planKnownOps). Bounded in number, and in size.
 */
const REMEMBER_COUNT = 16;
const REMEMBER_LIMIT = 1_000_000;

/** One table of a JSON dictionary: resolveCustomTextEditor's view, as an EditableTableSource. */
export class JsonView implements EditableTableSource {
  private readonly listeners = new Set<(change: TableChange) => void>();
  private readonly name: string;
  private readonly uri: string;
  // Which builder plans this file's rows AND answers a fetch for them (rowPlanner.ts).
  private readonly planner: RowPlanner;
  // The document's state while this table is open, shared with its other tables.
  private readonly docState: JsonDocState;
  private readonly unsubscribe: (() => void)[] = [];

  /**
   * Whether both the tree this document holds and every row on screen were built from the text as
   * it now reads: the precondition of every narrow repaint, and what lets an edit keep the tree it
   * is holding. Set only when a wide repaint's rows LAND; every path that leaves the two out of step
   * clears it (leaveStep).
   */
  private modelInSync = false;
  /** How many wide repaints this table has begun: the stamp a write painted ahead of its echo carries. */
  private wideEpoch = 0;
  /** How many times this table changed its rows, or put its tree out of step, outside a wide repaint. */
  private rowsTouched = 0;
  /** This table has closed: set first in dispose, and asked by everything still running then. */
  private disposed = false;
  /** The table has asked for its rows (`open`). Until then a wide repaint paints nothing. */
  private ready = false;
  // The newest wide repaint, for an older one whose rows it replaces to resolve with.
  private latestPost: Promise<void> = Promise.resolve();
  // An `open()` waiting for the rows the next wide repaint lands.
  private pendingOpen: { resolve(view: TableView): void; reject(err: unknown): void } | null = null;
  // What follows the paint `open()` last answered, until it is delivered (`opened`).
  private after: Trailer | null = null;
  /** What the table edit in flight will need when its own change arrives (spent by the next change). */
  private hostEdit: HostEdit | null = null;
  /** A write whose rows are ALREADY on screen, so the change it fires has nothing left to paint. */
  private paintedWrite: PaintedWrite | null = null;
  /** The edits this table has written, newest last. */
  private readonly knownEdits: KnownEdit[] = [];
  /** The clipboard mark this table has already painted (repaintClipMark). */
  private paintedMark: ClipMark | undefined;
  /** Whether the last change this table saw was an undo or a redo. */
  private lastByHistory = false;
  /** Structural edits, one text state at a time (queueStructural). */
  private structuralChain: Promise<unknown> = Promise.resolve();

  constructor(private readonly doc: JsonDocument) {
    this.name = doc.name;
    this.uri = doc.uri;
    this.planner = rowPlannerFor(this.name);
    // The baseline is PER DOCUMENT, not per table, so a second table does not re-baseline an edited
    // document to its edited text.
    this.docState = doc.openView();
    // This table holds the tree it registers under the uri, until it closes.
    doc.registry.openSourceView(this.uri);
    doc.views.add(this);
    const registers = doc.options.registers;
    // So that clipboard and drag broadcasts from ANY table reach this one (a cut only marks the
    // clipboard, and the source row needs a repaint to show it), and so that a cross-document move
    // whose SOURCE is this dictionary can take its originals out of the text.
    this.unsubscribe.push(
      registers.listen({
        clipboard: (state) => {
          reach(() => this.emit({ kind: 'clipboard', state }));
          reach(() => this.repaintClipMark());
        },
        drag: (descriptor) => this.emit({ kind: 'drag', descriptor }),
      }),
    );
    registers.registerSourceDeleter(this.uri, (targets) => this.deleteFromSourceDocument(targets));
    // Every tab of this document repaints wide when the baseline moves (repaintAll).
    this.docState.repaints.add(this.repaintThis);
    // Repaint on ANY change to the text: this table's edits, a text view's, undo and redo.
    this.unsubscribe.push(doc.text.onChange((change) => this.onTextChange(change)));
    // On save the text IS the file, so the marks clear.
    this.unsubscribe.push(doc.text.onSave(() => this.noteClean()));
    // A model created or deleted elsewhere can add or remove a block that uses one of these
    // entries. Held back while a write this table painted ahead of is in flight.
    const reposts = doc.options.usageReposts?.subscribe(
      () => void this.post(),
      () => this.paintedWrite !== null || this.hostEdit !== null,
    );
    if (reposts) this.unsubscribe.push(() => reposts.dispose());
    // Where the baseline comes from: the text, if it reads clean as the table opens; the file's own
    // bytes, if the document already holds unsaved changes.
    if (!doc.text.dirty) {
      this.docState.baseline.cleanAt = doc.text.version;
      this.stampDisk(doc.text.version);
    } else if (!this.docState.baseline.captured && !this.docState.baseline.pending) {
      void this.baselineFromDisk();
    }
  }

  private get session(): Session {
    return this.doc.session;
  }

  // Each listener on its own terms: one that throws (a post to a closed panel) costs the others
  // nothing, and costs the engine nothing, which would otherwise take it for a failed repaint.
  private emit(change: TableChange): void {
    if (this.disposed) return;
    for (const listener of [...this.listeners]) reach(() => listener(change));
  }

  private error(message: string): void {
    this.emit({ kind: 'error', message });
  }

  private failedEdit(err: unknown): string {
    return 'Failed to apply edit: ' + this.doc.describe((err as Error).message);
  }

  // A refused Add Child, Delete or Add, in core's words, said as every table editor says one.
  private postRefusal(gesture: RefusedGesture, reason: string): void {
    this.emit(refusedChange(gesture, reason, (text) => this.doc.describe(text)));
  }

  private findNode = (rowId: string): any => this.doc.registry.findNode(this.uri, rowId);

  // The Usage column, filled as the workspace's graph answers it: awaited, or at once where it can
  // be (false where it cannot, and the rows go out unfilled, with the fill following).
  private fillUsage(rows: TreeTableRow[]): Promise<unknown> {
    return this.doc.options.usage?.fill(rows) ?? Promise.resolve(false);
  }
  private fillUsageNow(rows: TreeTableRow[]): boolean {
    return this.doc.options.usage ? this.doc.options.usage.fillNow(rows) : true;
  }

  private changed(): void {
    this.doc.options.changed?.();
  }

  // A narrow repaint: one entry's run of rows replaced, removed or added. Counted, because a wide
  // repaint in flight read its text before this and would paint over it (wideLanding).
  private postRowPatch(change: TableChange): void {
    if (this.disposed) return;
    this.rowsTouched++;
    this.emit(change);
    this.changed();
  }

  // A failure's banner, posted after the repaint that clears the way for it — which a closed table
  // does not get, so neither does the banner.
  private postBanner(message: string): void {
    if (!this.disposed) this.error(message);
  }

  // The rows or the tree no longer match the text (see modelInSync).
  private leaveStep(): void {
    this.modelInSync = false;
    this.rowsTouched++;
  }

  /**
   * The tree for this document — the one already built when it still says what the text says, a
   * fresh parse when it does not. Leaves modelInSync alone: a rebuild here brings the MODEL up to the
   * text, and the rows wherever they were.
   */
  private liveModel(): any {
    if (this.modelInSync) {
      const held = this.doc.registry.peekModel(this.uri);
      if (held) return held;
    }
    this.doc.registry.invalidate(this.uri);
    return this.doc.registry.getModel(this.uri, this.name, this.doc.text.text);
  }

  /** Bring the model back in step with the text, painting nothing: an edit that mutated the tree and could not write. */
  private rebuildModel(): void {
    this.doc.registry.invalidate(this.uri);
    try {
      this.doc.registry.getModel(this.uri, this.name, this.doc.text.text);
    } catch {
      // The text does not parse: the next repaint goes wide and reports the parse error.
      this.leaveStep();
    }
  }

  // --- The wide repaint ------------------------------------------------------------------------

  /**
   * Rebuild the model from the text and paint every row: on open, on every change of the text that
   * is not a single entry's, and on save. Resolves when the rows are sent; a repaint whose rows are
   * dropped (wideLanding) resolves when the rows that replace them are.
   */
  private post(): Promise<void> {
    // A closed table repaints nothing, and a table not yet asked for its rows is painted when it is.
    if (this.disposed || !this.ready) return Promise.resolve();
    // Counted before the text is read: a write painted before this point is never again taken for
    // one whose rows are on screen, and a repaint begun before it is no longer the newest.
    const epoch = ++this.wideEpoch;
    this.latestPost = this.paintWide(epoch);
    return this.latestPost;
  }

  /** The wide repaint as a REPAIR, out of step from the moment the rows are known not to say what the text does. */
  private repaintStale(): Promise<void> {
    this.leaveStep();
    return this.post();
  }

  private paintWide(epoch: number): Promise<void> {
    try {
      this.doc.registry.invalidate(this.uri);
      const version = this.doc.text.version;
      const touched = this.rowsTouched;
      const node = this.doc.registry.getModel(this.uri, this.name, this.doc.text.text);
      // From this read, if it is a text known to be the file's (baselineOwed): parsed fresh here, so
      // never a tree an edit has changed ahead of its write.
      if (baselineOwed(this.docState.baseline, version)) {
        this.doc.baseline.capture(node);
        this.docState.baseline.captured = true;
        this.docState.baseline.version = version;
      }
      const modified = this.doc.baseline.modified(node);
      const clipMark = clipMarkOfDoc(this.doc.options.registers, this.uri);
      const planned = this.planner.payload(node, this.doc.options.budget ?? LAZY_ROW_BUDGET, { modifiedNames: modified, clipMark });
      const rows = planned.rows;
      return this.fillUsage(rows)
        .catch(() => false)
        .then((): Promise<void> | void => {
          // Closed while the graph was awaited: nothing to post to, and no re-read.
          if (this.disposed) return;
          // Only if these rows are still the answer: the newest repaint, over the text they were
          // built from, with nothing painted or put out of step behind them.
          const landing = wideLanding(
            { epoch, version, touched },
            { epoch: this.wideEpoch, version: this.doc.text.version, touched: this.rowsTouched },
          );
          if (landing === 'superseded') return this.latestPost;
          if (landing === 'reread') return this.post();
          // Every row below is built from `node`, which is still what the text says.
          this.modelInSync = true;
          // What the read of this dictionary could not read, and what the plan held back.
          const warnings = lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(node)));
          const view: TableView = {
            docUri: this.uri,
            rows,
            columns: COLUMNS,
            columnLabels: COLUMN_LABELS,
            columnGroups: COLUMN_GROUPS,
            editable: true,
            ...(warnings === undefined ? {} : { warnings }),
          };
          const trailer: Trailer = { model: node, clipMark };
          const opening = this.pendingOpen;
          if (opening) {
            // The rows `open()` asked for: answered, and what follows them sent once they are shown.
            this.pendingOpen = null;
            this.after = trailer;
            opening.resolve(view);
          } else {
            this.emit({ kind: 'replaceAll', view });
            this.sendTrailer(trailer);
          }
        });
    } catch (err) {
      this.doc.registry.invalidate(this.uri);
      // Nothing was painted, so what is on screen is older than the text: the next repaint is a full one.
      this.modelInSync = false;
      const message = `Failed to parse ${this.name}: ${this.doc.describe((err as Error).message)}`;
      const opening = this.pendingOpen;
      if (opening) {
        this.pendingOpen = null;
        opening.reject(new Error(message));
      } else {
        this.error(message);
      }
      return Promise.resolve();
    }
  }

  // Behind the rows: this document's section drop rules, so the table can predict a drop, what the
  // clipboard holds, and the clip mark these rows CARRY (a copy or a cut that landed while they
  // waited is painted again, after them). Outside the paint's own try, as the extension's are: a
  // throw here ends what follows the rows (the rest of the trailer, and `changed`), says nothing,
  // and leaves the rows, already sent, in step.
  private sendTrailer(after: Trailer): void {
    if (this.disposed) return;
    try {
      this.emit({ kind: 'sectionRules', docUri: this.uri, rules: sectionRules(after.model) });
      this.emit({ kind: 'clipboard', state: this.doc.options.registers.clipboardState() });
      this.paintedMark = after.clipMark;
      this.repaintClipMark();
      this.changed();
    } catch {
      /* lost, as the extension's promise rejects with nobody to hear it */
    }
  }

  /** Every row painted again from the text, and what follows a paint. Resolves when they are sent. */
  repaintAll(): Promise<void> {
    return this.post();
  }

  // --- The narrow repaints ---------------------------------------------------------------------

  // One entry's rows, as a full rebuild would have built them: the baseline and the clipboard mark
  // asked about a single entry, planned to the budget the payload used.
  private entryRowsOf(entry: any): TreeTableRow[] {
    const modified = new Set<string>();
    if (this.doc.baseline.isModified(entry)) modified.add(entry.name);
    return buildEntryRows(entry, entry.parent?.name ?? '', modified, clipMarkOfDoc(this.doc.options.registers, this.uri), undefined, LAZY_ROW_BUDGET);
  }

  /**
   * Repaint ONE entry: splice its rows over the run the table holds under `entryRowId`, once its
   * Usage column is filled. Resolves when they are sent, for a caller with something to say AFTER
   * the rows: fresh rows clear the error banner, so a banner sent beside them has to come second.
   */
  private postEntryRows(entryRowId: string, entry: any): Promise<void> {
    const rows = this.entryRowsOf(entry);
    return this.fillUsage(rows)
      .catch(() => false)
      .then(() => {
        this.postRowPatch({ kind: 'updateEntry', entryRowId, rows });
      });
  }

  /**
   * The same repaint, sent in THIS run, so an edit is on screen before the rest of its work. A cold
   * Usage graph is caught up in a second repaint.
   */
  private postEntryRowsNow(entryRowId: string, entry: any): void {
    const rows = this.entryRowsOf(entry);
    const filled = this.fillUsageNow(rows);
    this.postRowPatch({ kind: 'updateEntry', entryRowId, rows });
    if (!filled) void this.postEntryRows(entryRowId, entry);
  }

  /**
   * Repaint what a STRUCTURAL change did: entries that left the table, arrived in it, or were
   * rebuilt — as the rows those three amount to. Sent in this run; a cold Usage graph is caught up
   * in a second repaint per entry.
   */
  private repaintOps(applied: readonly AppliedOp[]): void {
    try {
      for (const op of applied) {
        if (op.kind === 'remove') {
          // An empty replacement IS the removal (spliceEntryRows).
          this.postRowPatch({ kind: 'updateEntry', entryRowId: op.entryRowId, rows: [] });
          continue;
        }
        const section = op.entry?.parent;
        if (!section) throw new Error(`"${op.entry?.name}" is not in a section.`);
        const rows = this.entryRowsOf(op.entry);
        const filled = this.fillUsageNow(rows);
        if (op.kind === 'replace') {
          this.postRowPatch({ kind: 'updateEntry', entryRowId: op.entryRowId, rows });
        } else {
          this.postRowPatch({ kind: 'insertEntry', sectionRowId: buildSectionRowId(section.name), beforeRowId: op.beforeRowId, rows });
        }
        // Addressed by the entry's CURRENT id, which for an insert is the run just added.
        if (!filled) void this.postEntryRows(op.kind === 'replace' ? op.entryRowId : op.entry.id, op.entry);
      }
    } catch (err) {
      // The model change has already landed, so the table must not be left showing the rows from
      // before it. Repaint wide, then say so — after, because fresh rows wipe a banner sent first.
      void this.repaintStale().then(() => this.postBanner(`Failed to update the row: ${this.doc.describe((err as Error).message)}`));
    }
  }

  private remember(edit: KnownEdit): void {
    if (edit.submitted.text.length + edit.replaced.length > REMEMBER_LIMIT) return;
    this.knownEdits.push(edit);
    if (this.knownEdits.length > REMEMBER_COUNT) this.knownEdits.shift();
  }

  /** Repaint the entry THIS table just wrote, from the bytes it wrote: its echo confirms the paint. */
  private syncOwnEdit(changes: readonly RangeReplacement[], hint: HostEdit | null): boolean {
    if (!hint) return false;
    const plan = planOwnEdit(changes, hint);
    if (!plan) return false;
    // Rows that match the text, and a tree still registered to apply the op to.
    if (!this.modelInSync) return false;
    const model = this.doc.registry.peekModel(this.uri);
    if (!model) return false;
    try {
      const applied = applyEntryOps(model, [plan.op], this.session);
      const op = applied[0];
      if (!op || op.kind !== 'replace') return false;
      void this.postEntryRows(plan.entryRowId, op.entry);
      return true;
    } catch {
      // The model may now be half-changed: the caller's full repaint is the repair.
      this.doc.registry.invalidate(this.uri);
      this.leaveStep();
      return false;
    }
  }

  /** Repaint an UNDO or a REDO of one of this table's own STRUCTURAL edits, from the ops it remembered. */
  private syncKnownOps(changes: readonly RangeReplacement[]): boolean {
    if (changes.length !== 1 || this.knownEdits.length === 0) return false;
    if (!this.modelInSync) return false;
    const model = this.doc.registry.peekModel(this.uri);
    if (!model) return false;
    const ops = planKnownOps(changes, this.knownEdits);
    if (!ops || ops.length === 0) return false;
    try {
      this.repaintOps(applyEntryOps(model, ops, this.session));
      return true;
    } catch {
      this.doc.registry.invalidate(this.uri);
      this.leaveStep();
      return false;
    }
  }

  /** Repaint the entry an UNDO or a REDO of one of this table's own edits touched. */
  private syncKnownChange(changes: readonly RangeReplacement[]): boolean {
    if (changes.length !== 1 || this.knownEdits.length === 0) return false;
    if (!this.modelInSync) return false;
    const model = this.doc.registry.peekModel(this.uri);
    if (!model) return false;
    try {
      const plan = planKnownChange(model, changes, this.knownEdits);
      if (!plan) return false;
      const entryRowId = plan.entry.id;
      const applied = applyEntryOps(
        model,
        [{ kind: 'replace', rowId: plan.entry.id, record: plan.record, fromDocumentText: plan.fromDocumentText }],
        this.session,
      );
      const op = applied[0];
      if (!op || op.kind !== 'replace') return false;
      // In THIS run, so the undone value is on screen at once (postEntryRowsNow).
      this.postEntryRowsNow(entryRowId, op.entry);
      return true;
    } catch {
      this.doc.registry.invalidate(this.uri);
      this.leaveStep();
      return false;
    }
  }

  /**
   * Sync ONE entry from the text, or say no: the narrow answer to "the text changed, and this table
   * did not change it". One replacement only, rows that match the text, and a registered tree.
   */
  private syncOneEntry(changes: readonly RangeReplacement[]): boolean {
    if (changes.length !== 1) return false;
    if (!this.modelInSync) return false;
    const model = this.doc.registry.peekModel(this.uri);
    if (!model) return false;
    try {
      const change = changes[0];
      const plan = planEntrySync(model, this.doc.text.text, { rangeOffset: change.rangeOffset, text: change.text });
      if (!plan) return false;
      const entryRowId = plan.entry.id;
      const applied = applyEntryOps(
        model,
        [{ kind: 'replace', rowId: plan.entry.id, record: plan.record, fromDocumentText: plan.fromDocumentText }],
        this.session,
      );
      const op = applied[0];
      if (!op || op.kind !== 'replace') return false;
      this.postEntryRowsNow(entryRowId, op.entry);
      return true;
    } catch {
      this.doc.registry.invalidate(this.uri);
      this.leaveStep();
      return false;
    }
  }

  /**
   * The narrow repaint that keeps the clipboard mark this table painted current: the entries the two
   * marks name, and nothing when they are the same mark. Rows out of step with the text can only be
   * mended by a full repaint.
   */
  private repaintClipMark(): void {
    const next = clipMarkOfDoc(this.doc.options.registers, this.uri);
    const affected = clipMarkChange(this.paintedMark, next);
    if (!affected) return;
    if (!this.modelInSync) {
      void this.post();
      return;
    }
    let model: any;
    try {
      model = this.liveModel();
    } catch {
      // No tree to name the affected entries in: the wide repaint is the fallback, and where the
      // parse error is reported; paintedMark is left alone because nothing was painted.
      void this.post();
      return;
    }
    this.paintedMark = next;
    const ops: AppliedOp[] = [];
    const seen = new Set<string>();
    for (const { section, name } of affected) {
      const entry = findEntryByName(model, section, name);
      if (!entry || seen.has(entry.id)) continue;
      seen.add(entry.id);
      ops.push({ kind: 'replace', entryRowId: entry.id, entry });
    }
    if (ops.length > 0) this.repaintOps(ops);
  }

  // --- Writes ------------------------------------------------------------------------------------

  /**
   * Write ONE region of the text: one undo step, heard as a change, which repaints every table of
   * the document and any text view. Throws when the text refuses the write (it moved under it), so
   * that a paint made before the write is taken back rather than left standing.
   */
  private async writePatch(patch: TextPatch): Promise<void> {
    const written = await this.doc.text.apply([patch]);
    if (!written) throw new Error('the document rejected the edit (it may have changed on disk)');
  }

  // The one region to write to make the text read exactly `newText`, for the folded multi-step edits
  // that cannot name theirs.
  private patchFor(result: { newText: string; patch?: TextPatch }, ownText: string): TextPatch {
    return result.patch ?? minimalReplacement(ownText, result.newText);
  }

  // The range replacement a patch amounts to, as its change will report it back.
  private submittedOf(patch: TextPatch): RangeReplacement {
    return { rangeOffset: patch.offset, rangeLength: patch.length, text: patch.text };
  }

  // Guard against an edit while a text view holds invalid JSON (a mid-edit state). An in-step
  // document is waved through: its tree is already proof that the text parses.
  private ensureValidJson = (): boolean => {
    if (this.modelInSync || parsesAsJson(this.doc.text.text)) return true;
    this.error("Can't apply edit — the document has invalid JSON (likely mid-edit in the text view). Fix the text, then retry.");
    return false;
  };

  /**
   * Take back a paint the text never confirmed, and say why: re-read the text, repaint the entry from
   * it over the run the PAINT left (found in the re-read tree by the id the FILE still spells), and
   * send the banner AFTER those rows. Neither, once a wide repaint has begun since the paint: its rows
   * are already the file's answer.
   */
  private undoPaint(painted: PaintedRun, message: string): void {
    if (painted.epoch !== this.wideEpoch) {
      void this.latestPost.then(() => this.postBanner(message));
      return;
    }
    this.rebuildModel();
    const fresh = this.findNode(painted.fileRowId);
    if (fresh) {
      void this.postEntryRows(painted.rowId, fresh).then(() => this.postBanner(message));
    } else {
      void this.repaintStale().then(() => this.postBanner(message));
    }
  }

  // --- Value edit and rename ---------------------------------------------------------------------
  //
  // The order is the point, cheapest first: mutate the model, PAINT (in this run), locate the
  // entry's text, write it. Everything after the paint can still fail, so both exits below (no
  // span, anything thrown) call undoPaint.
  edit(msg: CellEdit): void {
    if (this.disposed) return;
    void this.applyEdit(msg);
  }

  private async applyEdit(msg: CellEdit): Promise<void> {
    // The entry this edit has already changed in the model and shown, if it got that far.
    let painted: PaintedRun | null = null;
    try {
      if (!this.ensureValidJson()) return;
      const currentText = this.doc.text.text;

      this.liveModel();
      const node = this.findNode(msg.rowId);
      if (!node) {
        this.error('Could not locate the edited item in the model.');
        return;
      }
      // Owning top-level entry; pre-edit name for span lookup (rename mutates it).
      const entry = findOwningEntry(node);
      if (!entry) {
        this.error('Could not locate the owning entry in the model.');
        return;
      }
      // The entry's selector BEFORE the mutation: the span lookup has to find the entry as the text
      // still spells it.
      const entrySelectorForLookup = entrySelectorOf(entry);
      const isRename = msg.columnId === 'Name';
      // And its row id: the paint splices over the id the rows on screen carry.
      const entryRowIdOnScreen = entry.id;
      // And the rename to carry into the System Composer catalog, and a service interface's
      // function, which the catalog spells as the document still does. Never both.
      const catalogRename = catalogRenameOf(msg.columnId, msg.newValue, node, entry);
      const functionRename = catalogFunctionRenameOf(msg.columnId, msg.newValue, node, entry);

      // Mutated through entryOps so the session's node index follows a rename.
      const { result, unchanged } = cellEdit(entry, node, msg.columnId, msg.newValue, this.session);
      if (result && typeof result === 'object' && result.error) {
        // Invalid cell input: said, then the entry repainted so the cell reverts. A refused
        // setProperty changes nothing, so the entry's own rows still say what the text says.
        this.emit({
          kind: 'invalid',
          reason: this.doc.describe(editRefusalText(node, msg.columnId, result.reason)),
          invalidValue: msg.newValue,
          previousValue: msg.oldValue,
        });
        void this.postEntryRows(entryRowIdOnScreen, entry);
        return;
      }
      // The cell's own text set back: nothing changed, so nothing is painted or written.
      if (unchanged) return;

      // PAINT — in this run, before anything expensive. From here to the write the screen is ahead
      // of the file, so every way out that is not a write takes the paint back (undoPaint).
      painted = { rowId: entry.id, fileRowId: entryRowIdOnScreen, epoch: this.wideEpoch };
      this.postEntryRowsNow(entryRowIdOnScreen, entry);
      // After a rename node.id is the new name, and the rows just sent carry it.
      if (isRename) this.emit({ kind: 'select', rowIds: [node.id] });

      // --- and only now the expensive half: where in the text that entry lives ---
      const indent = detectIndent(currentText);
      const entryText = reserializeEntry(entry, indent);
      const span = findEntrySpan(currentText, entrySelectorForLookup);
      if (!span) {
        // The tree has been mutated and painted, and the text cannot be: the text is the truth here.
        this.undoPaint(painted, 'Could not locate the entry text to update.');
        return;
      }
      // The System Composer interface dictionary is a part of THIS document and lists the entry BY
      // NAME, so a rename of a catalogued entry carries into it, in the same edit (one undo step).
      const scEdits = catalogRename
        ? scJsonRenameEdits(currentText, catalogRename.oldName, catalogRename.newName)
        : functionRename
          ? scJsonFunctionRenameEdits(currentText, functionRename)
          : [];
      const patches: TextPatch[] = [
        { offset: span.offset, length: span.length, text: entryText },
        ...scEdits.map((e) => ({ offset: e.start, length: e.end - e.start, text: e.text })),
      ];
      // Set last, immediately before the write, so the change it fires is the one that spends it.
      // No hint when the catalog rode along: that change is not an echo of one entry span.
      const submitted = { rangeOffset: span.offset, rangeLength: span.length, text: entryText };
      this.hostEdit = scEdits.length > 0 ? null : { entryId: entry.id, submitted, epoch: this.wideEpoch };
      const written = await this.doc.text.apply(patches);
      if (!written) throw new Error('the document rejected the edit (it may have changed on disk)');
      // Remembered only now the text holds it, and only for the single-span shape: its undo writes
      // `replaced` back over `entryText` at the same offset (syncKnownChange).
      if (scEdits.length === 0) {
        this.remember({ submitted, replaced: currentText.slice(span.offset, span.offset + span.length) });
      }
    } catch (err) {
      this.hostEdit = null;
      const message = this.failedEdit(err);
      if (painted) this.undoPaint(painted, message);
      // Nothing painted, nothing mutated: the banner is the whole answer.
      else this.error(message);
    }
  }

  // --- Structural edits (delete, add child, paste, drop, add) --------------------------------------
  //
  // Each changes the model, PAINTS, then writes the text, and what it changed is also stated as
  // entry-level ops kept beside the bytes, so its undo can be applied rather than discovered.

  // A structural paint cannot be taken back row by row, so a write that fails resyncs the whole table.
  private resyncWide(message: string): void {
    void this.repaintStale().then(() => this.postBanner(message));
  }

  /** A paste, a drop or an add refused before it painted: put the model back (re-read the text), and say why. */
  private refusedStructural(message: string): void {
    this.rebuildModel();
    this.error(message);
  }

  /** The prologue every structural edit shares: the mid-edit JSON gate, a tree that matches the text, and the node the row names. */
  private async onStructuralTarget(rowId: string, run: (node: any) => Promise<void>): Promise<void> {
    let node: any;
    try {
      if (!this.ensureValidJson()) return;
      this.liveModel();
      node = this.findNode(rowId);
    } catch (err) {
      this.error(this.failedEdit(err));
      return;
    }
    if (!node) {
      this.error('Could not locate the item in the model.');
      return;
    }
    await run(node);
  }

  /**
   * A structural edit WITHIN one entry: add a nested child, delete one. The bytes it writes are an
   * entry span replaced by an entry span, exactly what a cell edit writes, so its echo and its undo
   * are read back the way a cell edit's are.
   */
  private async applyEntryStructural(node: any, transform: (text: string, node: any) => StructuralResult): Promise<void> {
    let painted: PaintedRun | null = null;
    try {
      const currentText = this.doc.text.text;
      const entry = findOwningEntry(node);
      if (!entry) {
        this.error('Could not locate the owning entry in the model.');
        return;
      }
      // A nested child changes nothing about the entry's own name: one id for rows and model.
      const entryRowId = entry.id;
      const result = mutateEntry(entry, () => transform(currentText, node), this.session);
      // PAINT, in this run.
      painted = { rowId: entryRowId, fileRowId: entryRowId, epoch: this.wideEpoch };
      this.postEntryRowsNow(entryRowId, entry);
      if (result.selectId) this.emit({ kind: 'select', rowIds: [result.selectId] });
      const patch = this.patchFor(result, currentText);
      const submitted = this.submittedOf(patch);
      // Set immediately before the write, so the change it fires is the one that spends it.
      this.hostEdit = { entryId: entry.id, submitted, epoch: this.wideEpoch };
      await this.writePatch(patch);
      this.remember({ submitted, replaced: currentText.slice(patch.offset, patch.offset + patch.length) });
    } catch (err) {
      this.hostEdit = null;
      const message = this.failedEdit(err);
      if (painted) this.undoPaint(painted, message);
      else this.error(message);
    }
  }

  /**
   * Delete a top-level ENTRY: its element leaves the array, its run of rows leaves the table. The
   * transform is text-only, so the model change is an op applied beside it, captured BEFORE it.
   */
  private async applyDeleteEntry(entry: any): Promise<void> {
    let painted = false;
    try {
      const currentText = this.doc.text.text;
      const model = this.doc.registry.peekModel(this.uri);
      if (!model) throw new Error('the document has no model to edit');
      const entryRowId = entry.id;
      const pairs: EntryOpPair[] = [{ redo: removeOp(entryRowId), undo: insertOp(entry) }];
      const result = deleteEntry(currentText, entry, buildSectionRowId);
      // Model, then paint.
      const applied = applyEntryOps(model, [pairs[0].redo], this.session);
      painted = true;
      this.repaintOps(applied);
      if (result.selectId) this.emit({ kind: 'select', rowIds: [result.selectId] });
      const patch = this.patchFor(result, currentText);
      const submitted = this.submittedOf(patch);
      // The rows are already on screen, and the bytes this writes are not an element anything can
      // read back: both are what its change needs to be told (paintedWrite), and its undo (the ops).
      this.paintedWrite = { submitted, epoch: this.wideEpoch };
      await this.writePatch(patch);
      this.remember({ submitted, replaced: currentText.slice(patch.offset, patch.offset + patch.length), patch: patchOfPairs(pairs) });
    } catch (err) {
      this.paintedWrite = null;
      const message = this.failedEdit(err);
      if (painted) this.resyncWide(message);
      else this.error(message);
    }
  }

  /**
   * Delete SEVERAL rows as ONE edit, in a single write. READ THE MODEL FIRST: every removal takes a
   * node out of the tree, so the selectors, the row to select afterwards and the undo's ops are all
   * read while the nodes are still attached.
   */
  private async applyDeleteMany(rowIds: readonly string[]): Promise<void> {
    let painted = false;
    try {
      if (!this.ensureValidJson()) return;
      const model = this.liveModel();
      if (!model) throw new Error('the document has no model to edit');
      const currentText = this.doc.text.text;
      const plan = planDeletion(rowIds, (rowId) => this.findNode(rowId));
      if (!plan.entries.length && !plan.childGroups.length) {
        this.error('Could not locate the items in the model.');
        return;
      }
      // Asked of every row the plan removes, before any leaves (refusal.ts).
      const refused = deleteRefusal(this.session, [...plan.entries, ...plan.childGroups.flatMap((g: any) => g.children)].map((n: any) => n.id));
      if (refused) {
        this.postRefusal('delete', refused);
        return;
      }
      // Read off the live tree, before anything leaves it.
      const selectors = plan.entries.map((entry: any) => entrySelectorOf(entry));
      const doomed = new Set<any>(plan.entries);
      const lastEntry = plan.entries[plan.entries.length - 1];
      const selectId = lastEntry
        ? reselectAfterRemoval(
            ((lastEntry.parent?.children ?? []) as any[]).filter((e) => e === lastEntry || !doomed.has(e)),
            lastEntry,
            buildSectionRowId(lastEntry.parent?.name ?? ''),
          )
        : null;
      // MODEL, the whole entries first: removeEntries refuses before it removes anything.
      const entryRemoval = removeEntries(model, plan.entries, this.session);
      const pairs: EntryOpPair[] = [...entryRemoval.pairs];
      // TEXT — children first, each group one splice; then the whole entries, by selector.
      let working = currentText;
      const childApplied: AppliedOp[] = [];
      let childSelectId: string | null = null;
      for (const group of plan.childGroups) {
        // The undo side is the entry WITH the child, which only exists now.
        const undo = replaceOp(group.entry, group.entry.id);
        const result = mutateEntry(group.entry, () => deleteChildren(working, group.children), this.session);
        working = result.newText;
        childSelectId = result.selectId ?? childSelectId;
        pairs.push({ redo: replaceOp(group.entry, group.entry.id), undo });
        childApplied.push({ kind: 'replace', entryRowId: group.entry.id, entry: group.entry });
      }
      working = deleteEntriesByName(working, selectors);
      // PAINT — in this run, before the write.
      const applied = [...childApplied, ...entryRemoval.applied];
      painted = true;
      this.repaintOps(applied);
      const landing = selectId ?? childSelectId;
      if (landing) this.emit({ kind: 'select', rowIds: [landing] });
      const patch = minimalReplacement(currentText, working);
      const submitted = this.submittedOf(patch);
      this.paintedWrite = { submitted, epoch: this.wideEpoch };
      await this.writePatch(patch);
      this.remember({ submitted, replaced: currentText.slice(patch.offset, patch.offset + patch.length), patch: patchOfPairs(pairs) });
    } catch (err) {
      this.paintedWrite = null;
      const message = this.failedEdit(err);
      // Unpainted, the rows still say what the text says, but the tree may not.
      if (painted) this.resyncWide(message);
      else this.refusedStructural(message);
    }
  }

  private applyDelete(rowIds: readonly string[]): Promise<void> {
    // One row keeps the narrow paths it has: an entry's element cut out, or one child spliced.
    if (rowIds.length === 1) {
      return this.onStructuralTarget(rowIds[0], async (node) => {
        // Core's reason, asked before anything changes (refusal.ts).
        const refused = deleteRefusal(this.session, [node.id]);
        if (refused) this.postRefusal('delete', refused);
        else await (node.isEntry ? this.applyDeleteEntry(node) : this.applyEntryStructural(node, deleteChild));
      });
    }
    return this.applyDeleteMany(rowIds);
  }

  private applyAddChild(rowId: string): Promise<void> {
    return this.onStructuralTarget(rowId, async (node) => {
      const refused = addChildRefusal(this.session, node.id);
      if (refused) this.postRefusal('addChild', refused);
      else await this.applyEntryStructural(node, addChildEdit);
    });
  }

  // --- The clipboard and row drags ---------------------------------------------------------------

  // From the tree this table already holds when it is in step with the text: a copy changes no text.
  private copyDeps(broadcast: () => void): CopyDeps {
    return {
      session: this.session,
      registers: this.doc.options.registers,
      refresh: () => {
        this.liveModel();
      },
      findNode: this.findNode,
      post: (message) => this.error(this.doc.describe(message.message)),
      broadcast,
    };
  }

  copy(rowIds: readonly string[]): void {
    if (this.disposed) return;
    copyEntriesToClipboard(rowIds, 'copy', this.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
  }

  // Cut is LAZY: it only marks the entry on the clipboard and writes nothing. The source is removed
  // at PASTE time, so a same-document move is a single write (one undo step).
  cut(rowIds: readonly string[]): void {
    if (this.disposed) return;
    copyEntriesToClipboard(rowIds, 'cut', this.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
  }

  dragStart(rowIds: readonly string[]): void {
    if (this.disposed) return;
    dragEntries(rowIds, this.uri, this.copyDeps(() => this.doc.options.registers.broadcastDragState()));
  }

  dragEnd(): void {
    if (this.disposed) return;
    this.doc.options.registers.clearDrag();
    this.doc.options.registers.broadcastDragState();
  }

  // --- Paste and drop: one transfer, two registers -------------------------------------------------

  /**
   * A same-document move's REMOVALS, stated as ops and applied to the live model, or null: this move
   * cannot take the narrow path, and the model is re-read from the trimmed text.
   */
  private moveRemovals(model: any, targets: readonly EntrySelector[]): Removal | null {
    try {
      return removalPairs(model, targets, this.session);
    } catch {
      return null;
    }
  }

  // A fresh adapter per transfer, because onFailure has to know how far this one got: a structural
  // paint cannot be taken back row by row, while a refusal before it has only the tree to put back.
  private transferAdapter(): TransferAdapter<SectionTarget> {
    let painted = false;
    return {
      docUri: this.uri,
      guard: this.ensureValidJson,
      resolveTarget: (rowId) => sectionTarget(this.liveModel(), this.findNode(rowId), rowId),
      validate: (target, payloads) => refuseDisallowedPaste(target.section, payloads),
      commit: async ({ target, payloads, removeFirst }) => {
        const docText = this.doc.text.text;
        let section = target.section;
        // What the edit amounts to in the model, and what it leaves to repaint.
        const pairs: EntryOpPair[] = [];
        const applied: AppliedOp[] = [];
        let narrow = true;
        // A same-document move removes the sources first (in the same text), so the paste keeps
        // their names: the whole move is ONE write.
        let workingText = docText;
        let againstDocument = true;
        if (removeFirst.length > 0) {
          workingText = deleteEntriesByName(docText, removeFirst);
          againstDocument = false;
          const removals = this.moveRemovals(target.model, removeFirst);
          if (removals) {
            pairs.push(...removals.pairs);
            applied.push(...removals.applied);
          } else {
            // Re-read from the trimmed text, or the paste renames what it is moving; the section is
            // found again there by NAME.
            narrow = false;
            this.leaveStep();
            this.doc.registry.invalidate(this.uri);
            section = sectionByName(this.doc.registry.getModel(this.uri, this.name, workingText), target.sectionName);
            if (!section) throw new Error('Could not resolve the target section.');
          }
        }
        // Read AFTER any removal: everything from here on is what the paste added.
        const addedFrom = (section.children as any[]).length;
        const pasted = pasteEntries(workingText, section, payloads as Record<string, unknown>[]);
        if (narrow) {
          const added = opsOfPastedEntries(section, addedFrom, this.session);
          pairs.push(...added.pairs);
          applied.push(...added.applied);
          // PAINT — the model already holds the pasted entries.
          painted = true;
          this.repaintOps(applied);
        } else {
          // The tree registered above describes the trimmed text: the write's change repaints wide.
          this.leaveStep();
        }
        if (pasted.selectIds.length) this.emit({ kind: 'select', rowIds: pasted.selectIds });
        const patch = againstDocument ? this.patchFor(pasted, docText) : minimalReplacement(docText, pasted.newText);
        const submitted = this.submittedOf(patch);
        if (narrow) this.paintedWrite = { submitted, epoch: this.wideEpoch };
        await this.writePatch(patch);
        if (narrow) {
          this.remember({ submitted, replaced: docText.slice(patch.offset, patch.offset + patch.length), patch: patchOfPairs(pairs) });
        }
      },
      onFailure: (err) => {
        this.paintedWrite = null;
        const message = this.failedEdit(err);
        if (painted) this.resyncWide(message);
        else this.refusedStructural(message);
      },
      report: (message) => this.error(this.doc.describe(message)),
    };
  }

  // A move that left its original behind is said where it stays, not only in the banner a row update
  // clears: see TransferDeps.warn.
  private transferDeps(): TransferDeps {
    return {
      deleteFromSource: (uri, selectors) => this.doc.options.registers.deleteFromSource(uri, selectors),
      warn: (message) => this.doc.options.notify?.({ level: 'warning', message }),
    };
  }

  /**
   * Structural edits, one text state at a time. Every one reads the text when it starts and writes
   * at the end, with an await between: two in flight at once would compute offsets over a text the
   * other moved. So each waits for the write in front of it; none is dropped, and one that fails
   * does not poison the chain. A cell edit is not queued.
   */
  private queueStructural(run: () => Promise<unknown>): Promise<unknown> {
    this.structuralChain = this.structuralChain.catch(() => {}).then(run);
    return this.structuralChain;
  }

  delete(rowIds: readonly string[]): void {
    if (this.disposed) return;
    void this.queueStructural(() => this.applyDelete(rowIds));
  }

  addChild(rowId: string): void {
    if (this.disposed) return;
    void this.queueStructural(() => this.applyAddChild(rowId));
  }

  // A paste reads the clipboard when its turn comes, so the second of two queued pastes of one cut
  // finds the clipboard that cut left.
  paste(rowId: string): void {
    if (this.disposed) return;
    const registers = this.doc.options.registers;
    void this.queueStructural(() =>
      runTransfer({ rowId }, registers.clipboardRegister(() => registers.broadcastClipboardState()), this.transferAdapter(), this.transferDeps()),
    );
  }

  // A drop reads its register when the message ARRIVES, not when its turn comes: the source's
  // dragEnd follows it at once and clears the register.
  drop(rowId: string, mode: 'copy' | 'move'): void {
    if (this.disposed) return;
    const registers = this.doc.options.registers;
    const register = registers.dragRegister(mode, () => registers.broadcastDragState());
    void this.queueStructural(() => runTransfer({ rowId }, register, this.transferAdapter(), this.transferDeps()));
  }

  addEntry(msg: NewEntry): void {
    if (this.disposed) return;
    void this.queueStructural(() => this.applyAddEntry(msg));
  }

  /**
   * Create ONE new default entry from the Add gallery: a paste with no source, always narrow. Through
   * queueStructural, never directly.
   */
  private async applyAddEntry(msg: NewEntry): Promise<void> {
    let painted = false;
    try {
      if (!this.ensureValidJson()) return;
      const model = this.liveModel();
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
      const currentText = this.doc.text.text;
      // Read BEFORE the add: the mark the new tail is measured from.
      const addedFrom = (section.children as any[]).length;
      const result = addNewEntry(currentText, section, msg.className);
      // Indexes the new subtree and states the insert an undo has to take back.
      const added = opsOfPastedEntries(section, addedFrom, this.session);
      // PAINT — ahead of the write.
      painted = true;
      this.repaintOps(added.applied);
      if (result.selectId) {
        this.emit({ kind: 'select', rowIds: [result.selectId] });
        // After the selection, which expands and scrolls the row into view; unpinned only.
        if (msg.rename) this.emit({ kind: 'beginRename', rowId: result.selectId });
      }
      const patch = this.patchFor(result, currentText);
      const submitted = this.submittedOf(patch);
      this.paintedWrite = { submitted, epoch: this.wideEpoch };
      await this.writePatch(patch);
      this.remember({ submitted, replaced: currentText.slice(patch.offset, patch.offset + patch.length), patch: patchOfPairs(added.pairs) });
    } catch (err) {
      this.paintedWrite = null;
      const message = this.failedEdit(err);
      // Painted, the rows named an entry that does not exist; unpainted, the tree has one the file
      // does not. Either way the text's answer is put back.
      if (painted) this.resyncWide(message);
      else {
        this.rebuildModel();
        this.error(message);
      }
    }
  }

  /**
   * Remove named entries from THIS document on behalf of another document's paste or drop (a
   * cross-file move), as one write. Refused for a text that does not parse: the move's paste half
   * has landed, so the user is left with a copy rather than a mangled original. Every outcome is
   * ANSWERED, never posted: the table the paste landed in reports it.
   */
  private async deleteFromSourceDocument(targets: DeleteTarget[]): Promise<SourceDeleteResult> {
    const srcText = this.doc.text.text;
    if (!parsesAsJson(srcText)) return { removed: false, reason: 'the file has invalid JSON' };
    const trimmed = deleteEntriesByName(srcText, targets);
    // Renamed or deleted since the cut: nothing answers to those names any more.
    if (trimmed === srcText) return { removed: false, reason: NOT_FOUND_REASON };
    const patch = minimalReplacement(srcText, trimmed);
    const written = await this.doc.text.apply([patch]);
    return written ? { removed: true } : { removed: false, reason: 'the document rejected the edit (it may have changed on disk)' };
  }

  // --- The baseline: the file on disk -------------------------------------------------------------
  //
  // A Modified mark says an entry differs from what the FILE holds. A change of the text carries the
  // dirty state from BEFORE it, and the change with no replacements that follows carries the new one;
  // a revert and a save end in one of those reading clean. A reload from disk ends in nothing (its
  // change reads clean, and no dirty change follows), so it is told by comparing the text with the file.

  // Every table of this document repaints wide, and the first to read the text takes the new
  // baseline from it (baselineOwed); the others mark against it.
  private repaintTables(): void {
    for (const repaint of this.docState.repaints) repaint();
  }
  private readonly repaintThis = (): void => void this.post();

  private async statDisk(): Promise<DiskStamp | null> {
    try {
      return (await this.doc.options.disk?.stat()) ?? null;
    } catch {
      return null;
    }
  }

  private async readDisk(): Promise<Uint8Array | null> {
    try {
      return (await this.doc.options.disk?.read()) ?? null;
    } catch {
      return null;
    }
  }

  // The document still reads clean at `version`: the one text a stat or a read begun there speaks for.
  private stillCleanAt(version: number): boolean {
    return !this.doc.text.dirty && this.doc.text.version === version;
  }

  // Taken whenever the document is known to read what the file does; kept only if it still does by
  // the time the stat answers.
  private stampDisk(version: number): void {
    void this.statDisk().then((stamp) => {
      if (stamp && this.stillCleanAt(version)) this.docState.diskStamp = stamp;
    });
  }

  /** This document now reads what its file on disk does — whose stamp is `stamp`, if known. */
  private noteClean(stamp?: DiskStamp): void {
    this.docState.baseline.cleanAt = this.doc.text.version;
    if (stamp) this.docState.diskStamp = stamp;
    else this.stampDisk(this.doc.text.version);
    if (this.docState.baseline.version !== this.doc.text.version) this.repaintTables();
  }

  /**
   * Whether a change that left the document reading clean was a reload from disk, or an edit to a
   * clean document (which reads clean the same way until its own dirty change arrives). The file
   * decides, and it is asked only if its stamp has CHANGED since the document last matched it.
   */
  private async checkAgainstDisk(version: number): Promise<void> {
    const stamp = await this.statDisk();
    if (!stamp || this.disposed || !this.stillCleanAt(version)) return;
    if (this.docState.baseline.version === version || sameDiskStamp(this.docState.diskStamp, stamp)) return;
    const bytes = await this.readDisk();
    if (!bytes || this.disposed || !this.stillCleanAt(version)) return;
    if (new TextDecoder().decode(bytes) !== this.doc.text.text) return;
    this.noteClean(stamp);
  }

  /**
   * The baseline of a document opened with unsaved changes: the file's own bytes, parsed where
   * nothing else can see them. Until it lands nothing is marked; a file that cannot be read is
   * baselined from the document's text.
   */
  private async baselineFromDisk(): Promise<void> {
    const state = this.docState;
    state.baseline.pending = true;
    const cleanAtBefore = state.baseline.cleanAt;
    const bytes = await this.readDisk();
    state.baseline.pending = false;
    // The DOCUMENT's read, not this table's: only the last table closing ends it.
    if (this.doc.state !== state) return;
    // A save while the file was read: baselined from the saved text already, or owed from the file
    // as it now stands, which these bytes may predate.
    if (!diskBaselineUsable(state.baseline, cleanAtBefore)) {
      if (!state.baseline.captured) void this.baselineFromDisk();
      return;
    }
    let tree: any = null;
    try {
      tree = bytes ? parseDetached(this.name, new TextDecoder().decode(bytes)) : null;
    } catch {
      tree = null;
    }
    if (tree) {
      this.doc.baseline.capture(tree);
      state.baseline.captured = true;
      state.baseline.version = -1;
    }
    for (const repaint of state.repaints) repaint();
  }

  // --- Every change of the text ---------------------------------------------------------------------

  // A change as the plain range replacements every path here reasons about.
  private onTextChange(change: TextStoreChange): void {
    if (this.disposed) return;
    const changes = change.changes;
    // A change with NO replacements changed no text: the dirty state's own (VS Code fires one after
    // every edit, and when a save clears it). Returned BEFORE the hint is spent. It is also the one
    // change that says the document has turned clean — a save or a revert.
    if (changes.length === 0) {
      if (!this.doc.text.dirty && !this.lastByHistory) this.noteClean();
      return;
    }
    this.lastByHistory = change.reason === 'undo' || change.reason === 'redo';
    // A change to a document that read clean before it, from neither this table's own write nor the
    // undo stack, may be a reload from disk, which says so no other way.
    if (!this.doc.text.dirty && !this.lastByHistory && this.hostEdit === null && this.paintedWrite === null) {
      void this.checkAgainstDisk(this.doc.text.version);
    }
    // Spent or dropped here, exactly once, whichever branch the change takes.
    const hint = hintFor(this.hostEdit, this.wideEpoch);
    this.hostEdit = null;
    // A structural edit painted its own rows before it wrote: if this is that write, nothing is left.
    const painted = this.paintedWrite;
    this.paintedWrite = null;
    if (painted && isPaintedEcho(changes, painted, this.wideEpoch)) return;
    // The table's own edit first, then an undo or a redo of one it wrote earlier (structural first),
    // then one entry changed in the text, and only then the wide repaint.
    if (this.syncOwnEdit(changes, hint)) return;
    if (this.syncKnownOps(changes)) return;
    if (this.syncKnownChange(changes)) return;
    if (this.syncOneEntry(changes)) return;
    void this.repaintStale();
  }

  // --- The read half -------------------------------------------------------------------------------

  // Painted when asked, as the extension paints on the webview's `ready`. Answered by the rows the
  // next wide repaint lands (a newer one lands for an older); a table closed answers SourceClosed,
  // which whoever relays the answer says nothing of.
  open(): Promise<TableView> {
    if (this.disposed) return Promise.reject(new SourceClosed(`${this.name} is closed.`));
    const answer = new Promise<TableView>((resolve, reject) => {
      const earlier = this.pendingOpen;
      this.pendingOpen = {
        resolve: (view) => {
          earlier?.resolve(view);
          resolve(view);
        },
        reject: (err) => {
          earlier?.reject(err);
          reject(err);
        },
      };
    });
    this.ready = true;
    void this.post();
    return answer;
  }

  /** The answer of the last `open()` has been shown: send what follows its paint. */
  opened(): void {
    const after = this.after;
    this.after = null;
    if (after) this.sendTrailer(after);
  }

  // The rows under a row the payload deferred, filled as the payload's Usage column is.
  async children(rowId: string): Promise<ChildRows> {
    const { nodeId, rows, truncated } = childRowsMessage(rowId, this.findForRead(rowId), this.planner);
    if (rows.length > 0) await this.fillUsage(rows).catch(() => false);
    return { nodeId, rows, truncated };
  }

  async matrix(nodeId: string): Promise<MatrixPage> {
    const { matrix, message } = matrixCellsMessage(nodeId, this.findForRead(nodeId));
    return matrix ? { nodeId, matrix } : { nodeId, message: message ?? 'This value could not be read as a table.' };
  }

  async inspect(selection: string | readonly string[]): Promise<InspectorView> {
    const rowIds = typeof selection === 'string' ? [selection] : selection;
    let view: InspectorView = { groups: [] };
    const show = { showNode: (node: unknown) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node) }), clear: () => {} };
    new InspectorSelection(show, (_uri, id) => this.findForRead(id)).show(this.uri, rowIds);
    return view;
  }

  // A row's node, as the questions resolve it: whatever goes wrong is no node.
  private findForRead = (rowId: string): any => {
    try {
      return typeof rowId === 'string' && rowId !== '' ? this.findNode(rowId) : null;
    } catch {
      return null;
    }
  };

  subscribe(listener: (change: TableChange) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // --- Undo, redo, the whole text of a Value, and Location in Text ---------------------------------

  // One stack, the text's own: an undo here is an undo of the text, which every table and text view
  // of the document hears.
  undo(): void {
    if (this.disposed) return;
    this.doc.text.undo();
  }

  redo(): void {
    if (this.disposed) return;
    this.doc.text.redo();
  }

  // The node a row names in the tree the text says now, as an edit finds it; null where there is
  // none to read (text that does not parse).
  private liveFind(rowId: string): any {
    try {
      this.liveModel();
      return this.findNode(rowId);
    } catch {
      return null;
    }
  }

  // A Value editor is opening on a summary: its whole text, read off the tree the text says.
  requestEditText(rowId: string): void {
    if (this.disposed) return;
    this.emit(answerEditTextRequest(this.session, (id) => this.liveFind(id), rowId, (text) => this.doc.describe(text)));
  }

  /**
   * Location in Text: where the row's entry is in the text, for a host with a text view to show it
   * (the extension reveals it beside the table). The owning entry's span, re-read from the text; the
   * failures are said in the table, as the extension says them, and answered null.
   */
  locateInText(rowId: string): { offset: number; length: number } | null {
    if (this.disposed) return null;
    try {
      const currentText = this.doc.text.text;
      this.doc.registry.invalidate(this.uri);
      this.doc.registry.getModel(this.uri, this.name, currentText);
      const node = this.findNode(rowId);
      if (!node) {
        this.error('Could not locate the item in the model.');
        return null;
      }
      const entry = findOwningEntry(node);
      if (!entry) {
        this.error('Could not locate the owning entry in the model.');
        return null;
      }
      const span = findEntrySpan(currentText, entrySelectorOf(entry));
      if (!span) {
        this.error(`Could not locate "${entry.name}" in the text.`);
        return null;
      }
      return span;
    } catch (err) {
      this.error(`Failed to locate in text: ${this.doc.describe((err as Error).message)}`);
      return null;
    }
  }

  dispose(): void {
    // First, so nothing still in flight acts for this table from here on.
    if (this.disposed) return;
    this.disposed = true;
    const registers = this.doc.options.registers;
    // A drag that started in this table and is still on goes with it.
    if (registers.getDrag()?.sourceDocUri === this.uri) {
      registers.clearDrag();
      registers.broadcastDragState();
    }
    for (const stop of this.unsubscribe.splice(0)) stop();
    this.docState.repaints.delete(this.repaintThis);
    this.listeners.clear();
    this.doc.views.delete(this);
    this.pendingOpen?.reject(new SourceClosed(`${this.name} is closed.`));
    this.pendingOpen = null;
    // Per table, paired with the open: the last one drops the tree it held.
    this.doc.registry.releaseSourceView(this.uri);
    // Only once the LAST table of this document closes.
    if (this.doc.closeView(this.docState)) {
      registers.unregisterSourceDeleter(this.uri);
      this.doc.baseline.clear();
    }
  }
}
