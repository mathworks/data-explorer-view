// Copyright 2026 The MathWorks, Inc.
//
// First lifted from the VS Code extension's src/host/MatEditorProvider.ts at c73da3c: its document
// (MatDocument) and its view's editing (resolveCustomEditor's gestures), with every VS Code call
// taken out and put behind the hooks an editable source is given (hooks.ts): core's session, the
// edit stack and its save point, the registers, and where a notice goes. The extension's MAT-file
// editor now runs on this engine, and keeps only VS Code's end of the hooks.
//
// A MAT-file editor's rules (`-v6` and `-v7`, the Level-5 files core reads and writes). The user's
// baseline: a save never breaks the file. Two things here hold that up, and none of them is this
// module's own judgement of a value:
//
//  - Every edit is made through core's session (editProperty, addEntry, addChildTo,
//    deleteNode(s)ById, pasteEntries), whose gate offers no edit a save of the file would refuse
//    or write as something else (MatNode._editRefusal), and whose undo and redo are the only undo
//    and redo there are. A gesture core refuses records no step and changes nothing.
//  - A save is `session.serializeSource`: the file as it was read, every variable nobody edited
//    as its own bytes, what was edited written fresh, self-checked against MATLAB's load rules
//    before any byte is handed back. A refusal (MatWriteError, naming the variable) fails the
//    save with core's words, and nothing is handed back to write.
//
// THE DOCUMENT IS THE TREE. The session's source for this file is the document, registered under
// a prefixed srcId (ids/srcId.ts). The edit stack (EditSink) is mapped onto core's: each gesture
// is observed on the session's bus, and one that recorded N undo steps pushes ONE edit whose undo
// and redo replay the session's `undo()` / `redo()` N times. The stack calls them in its order,
// so the two move together.
//
// A SAVE KEEPS THE TREE. Re-registering the saved bytes would empty core's undo stack, and every
// edit before the save could no longer be undone. What a save does reset is the Status column,
// which says "differs from the file on disk" and so is kept here (saveMarks.ts); core's own marks
// are what makes a save write an edit, and are never reset.
//
// A RELOAD REPLACES IT. A revert, or an outside change, registers a new tree (`replace`). The
// edits the stack still holds from before were made on the old tree, which is gone, so their undo
// and redo do nothing but say so (the document's `generation`).
//
// Each table that shows the document is a view (`view()`), an EditableTableSource: what is the
// document's (a repaint after an edit, its undo or its redo) reaches every view, and what is a
// gesture's (its refusal, its selection) only the view it was made in.
import { cloneForPaste, toEntrySelector, type PastePayload, type PasteResult, type Session } from 'data-explorer-core';
import { wholeFileRules } from '../actions/sectionRules.js';
import { matCatalog } from '../ids/addCatalog.js';
import { WHOLE_FILE_SECTION } from '../ids/sectionRowId.js';
import { uriPathBasename } from '../ids/pathUtil.js';
import { binaryEditSrcId } from '../ids/srcId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { buildMatVariableRows } from '../rows/matRowBuilder.js';
import { refuseIfUnreadable, sourceWarnings, warningBanner, type WarningBanner } from '../rows/parseWarnings.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor, type PlanOptions, type RowPlanner } from '../rows/rowPlanner.js';
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
import { copyEntriesToClipboard, dragEntries, type CopyDeps } from './clipboardAction.js';
import { clipMarkChange, clipMarkOfDoc } from './clipMarks.js';
import { answerEditTextRequest } from './editText.js';
import type { EditIndex, EditSink, Notify } from './hooks.js';
import { addChildRefusal, addEntryRefusal, deleteRefusal, describeSource, refusedChange, type RefusedGesture } from './refusal.js';
import { NOT_FOUND_REASON, reach, type DeleteTarget, type Registers } from './registers.js';
import { replacementsIn, SaveMarks, type SaveMark, type SaveSnapshot } from './saveMarks.js';
import {
  runTransfer,
  TransferRefused,
  type SourceDeleteResult,
  type TransferAdapter,
  type TransferDeps,
  type TransferTarget,
} from './transfer.js';

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
   * repaint follows its trailer. One `opened(view)` per whole paint (each `open()` answered and each
   * `replaceAll`), with the view it delivered: each paint's trailer follows its own rows, whatever
   * order they are delivered in (without a view, the oldest paint not yet delivered). The VS Code
   * extension's, whose post of the rows is awaited before what follows them. Default: false, a
   * repaint's trailer follows its rows at once.
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

/** What a save took of the Status column with its bytes: its snapshot, and its place among the saves begun. */
interface TakenMarks {
  snapshot: SaveSnapshot;
  seq: number;
}

/**
 * The document as its views reach it: what a table needs of the engine, kept off the engine's own
 * surface, which is the host's.
 */
interface MatDocument {
  readonly uri: string;
  readonly srcId: string;
  readonly metaPath: string;
  readonly options: MatEngineOptions;
  readonly session: Session;
  readonly marks: SaveMarks<any>;
  readonly views: Set<MatView>;
  readonly disposed: boolean;
  readonly version: number;
  model(): any;
  describe(err: unknown): string;
  describeBanner(banner: WarningBanner | undefined): WarningBanner | undefined;
  serialize(): Uint8Array;
  record(label: string, run: (mat: any) => void, touched?: () => Iterable<any>): Observed;
  originOf(variable: any): object;
  deleteMoved(targets: readonly DeleteTarget[]): SourceDeleteResult;
  notify(level: 'warning' | 'error' | 'status', message: string, ms?: number): void;
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

// O(variables) a gesture, for the id map and the order: 10 ms on a file of 100,000 variables,
// against the 300 ms the payload of such a file takes to build.
function observe(session: Session, mat: any, srcId: string, run: () => void): Observed {
  const before = new Map<any, string>();
  for (const v of mat.children) before.set(v, v.id);
  const observed: Observed = { steps: 0, touched: new Set(), added: new Set(), replaced: new Map(), before, order: [...mat.children] };
  // The variable a node is or is under, while it is in the file; a variable just removed is
  // known by having been in it.
  const variableOf = (node: any): any => {
    for (let n = node; n; n = n.parent) if (n.parent === mat) return n;
    return before.has(node) ? node : null;
  };
  const touch = (node: any) => {
    const v = variableOf(node);
    if (v) observed.touched.add(v);
    return v;
  };
  const bus = session.bus;
  const subs = [
    bus.subscribe('undo/changed', (e: any) => {
      if (e.srcId === srcId) observed.steps++;
    }),
    bus.subscribe('node/children-changed', (e: any) => void touch(e.parent)),
    bus.subscribe('node/added', (e: any) => {
      if (touch(e.node) === e.node) observed.added.add(e.node);
    }),
    bus.subscribe('node/deleted', (e: any) => void touch(e.node)),
  ];
  try {
    run();
  } catch (err) {
    observed.error = err;
  } finally {
    for (const s of subs) s.remove();
  }
  observed.replaced = replacementsIn(before, observed.added, (v) => v.id, (v) => v.parent === mat);
  return observed;
}

/** Whether a gesture changed which variables the file holds, or their order. */
function variablesMoved(mat: any, observed: Observed): boolean {
  const now = mat.children as any[];
  return now.length !== observed.order.length || now.some((v, i) => v !== observed.order[i]);
}

/**
 * The classes `mat` can take a new variable of, as core lists them (MatNode.getAllowedTypes): a
 * plain variable and a struct, and the classes of MATLAB's own default objects where the file's
 * objects can be added to. A core without the list adds a plain variable only, as it always has.
 */
function allowedClasses(mat: any): readonly string[] {
  if (typeof mat?.getAllowedTypes !== 'function') return ['MatlabVariable'];
  const classes = mat.getAllowedTypes();
  return Array.isArray(classes) ? classes.filter((c: unknown): c is string => typeof c === 'string') : [];
}

/** The label the gallery's tile of `className` shows ('MATLAB Structure'), or the class itself. */
function tileLabelOf(className: string): string {
  return matCatalog([className]).flatMap((c) => c.tiles).find((t) => t.className === className)?.label ?? className;
}

const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** One open MAT-file: its tree, its edits, its saves, and the tables that show it. */
export class MatEngine {
  /** The uri the document is opened under. */
  readonly uri: string;
  /** The id its tree is registered under in the session: `binedit:` + the uri. */
  readonly srcId: string;
  /** Its name, as what is said of it names it. */
  readonly metaPath: string;

  private readonly options: MatEngineOptions;
  private closed = false;

  /**
   * Moved by every tree registered from the disk (a reload). An edit made on one generation's tree
   * has nothing to undo on another's: its steps were on the stack that left with the old tree, so
   * its undo and redo check this first.
   */
  private treeGeneration = 0;

  /**
   * Moved by every change to the tree, and by every save (which moves the Status column), so a
   * paint that awaited can tell it is stale.
   */
  private treeVersion = 0;

  /** Which variables differ from the file as last saved, for the Status column. */
  private readonly marks = new SaveMarks<any>();

  /** The tables that show it. */
  private readonly views = new Set<MatView>();

  /** What each save in flight took of the Status column, by the save. */
  private readonly taken = new WeakMap<MatSave, TakenMarks>();
  // The saves begun, and the latest of them to land: one that lands after a later one has left the
  // file holding an older document than that one wrote (`saved`'s answer).
  private saveSeq = 0;
  private landedSeq = 0;

  /** The document as its views reach it. */
  private readonly document: MatDocument;

  /** The file's bytes, until the first paint registers them (`model`). */
  private bytes: ArrayBuffer | null;
  /** The registered tree, or why there is none. Null until the first `model()`. */
  private loaded: { node: any } | { error: Error } | null = null;
  /** A backup was refused, and the user was told; reset once a backup is written (`backupWritten`). */
  private backupRefusalShown = false;

  constructor(options: MatEngineOptions) {
    this.options = options;
    this.uri = options.uri;
    this.srcId = binaryEditSrcId(options.uri);
    // The last segment of the uri's path, decoded, as `basename(uri.path)` names a VS Code uri.
    this.metaPath = options.name ?? (uriPathBasename(options.uri) || 'document');
    this.bytes = options.bytes;
    const engine = this;
    this.document = {
      uri: this.uri,
      srcId: this.srcId,
      metaPath: this.metaPath,
      options,
      session: options.session,
      marks: this.marks,
      views: this.views,
      get disposed() {
        return engine.closed;
      },
      get version() {
        return engine.version;
      },
      model: () => this.model(),
      describe: (err) => this.describe(err),
      describeBanner: (banner) => this.describeBanner(banner),
      serialize: () => this.serialize(),
      record: (label, run, touched) => this.record(label, run, touched),
      originOf: (variable) => this.originOf(variable),
      deleteMoved: (targets) => this.deleteMoved(targets),
      notify: (level, message, ms) => this.notify(level, message, ms),
    };
  }

  /** Whether `dispose()` has closed it. */
  get disposed(): boolean {
    return this.closed;
  }

  /** How many trees have been registered from the disk since it opened (each `replace`). */
  get generation(): number {
    return this.treeGeneration;
  }

  /** Moved by every change to the tree and by every save: what a paint that awaited checks it against. */
  get version(): number {
    return this.treeVersion;
  }

  private get session(): Session {
    return this.options.session;
  }

  private notify(level: 'warning' | 'error' | 'status', message: string, ms?: number): void {
    this.options.notify?.({ level, message, ...(ms === undefined ? {} : { ms }) });
  }

  /**
   * The tree, registered from the file's bytes on the first ask: lazily, so a large file opens
   * onto the table's spinner, and not onto a blank editor while it parses. Throws why there is
   * none: a `-v7.3` file (HDF5), a file that is not a MAT-file, one the reader could not read at
   * all (refused, rather than shown as an empty file a save would then write).
   */
  private model(): any {
    if (this.loaded) {
      if ('error' in this.loaded) throw this.loaded.error;
      return this.loaded.node;
    }
    const bytes = this.bytes!;
    this.bytes = null;
    try {
      this.session.removeDataSource(this.srcId);
      const node = this.session.addMatSource(this.srcId, bytes, { path: this.metaPath }) as any;
      try {
        refuseIfUnreadable(sourceWarnings(node));
      } catch (err) {
        this.session.removeDataSource(this.srcId);
        throw err;
      }
      this.loaded = { node };
      return node;
    } catch (err) {
      this.loaded = { error: err instanceof Error ? err : new Error(String(err)) };
      throw this.loaded.error;
    }
  }

  /**
   * Core's message, saying the file's name where core says the srcId. A MatNode is named by the
   * srcId it was registered under, and core quotes that name (`Cannot save "binedit:file:///…"`),
   * as a node's id, which a message can carry, begins with it. Every message shown of core's comes
   * through here.
   */
  private describe(err: unknown): string {
    return describeSource(this.srcId, this.metaPath)(err instanceof Error ? err.message : String(err));
  }

  /** A warning banner with core's messages described (see `describe`). */
  private describeBanner(banner: WarningBanner | undefined): WarningBanner | undefined {
    return banner && { headline: this.describe(banner.headline), details: banner.details.map((d) => this.describe(d)) };
  }

  /**
   * The file as a save writes it, or an Error saying why it cannot be written (core's refusal),
   * in which case nothing is to be written anywhere. Synchronous, so the bytes are the document as
   * the save was asked for: an edit that lands while they are being written stays unsaved.
   */
  serialize(): Uint8Array {
    let out: ReturnType<Session['serializeSource']>;
    try {
      this.model();
      out = this.session.serializeSource(this.srcId);
    } catch (err) {
      throw new Error(this.describe(err));
    }
    if (!out || out.kind !== 'binary' || !(out.bytes instanceof Uint8Array)) {
      throw new Error(`Cannot save "${this.metaPath}": it is not held as a MAT-file. Nothing was written.`);
    }
    return out.bytes;
  }

  /**
   * Start a save: the bytes to write (`serialize`), taken with where the stack stands and the
   * Status column as they are, before anything is awaited. Hand it to `saved` once the bytes are
   * on disk, or to `notSaved` if they never get there. Throws core's refusal, and then there is
   * nothing to write and nothing to hand back.
   */
  beginSave(): MatSave {
    const bytes = this.serialize();
    const snapshot = this.marks.snapshot();
    const save: MatSave = { bytes, at: this.options.index.here() };
    this.taken.set(save, { snapshot, seq: ++this.saveSeq });
    return save;
  }

  /**
   * The bytes of `save` are on disk: the Status column is measured from them from now on. The
   * edit stack's save point is the caller's to move (EditIndex.saved), once, where its own rule
   * says: VS Code's moves when the save it asked for resolves.
   *
   * True when it landed behind a save begun after it, which had already landed: the file now holds
   * an older document than that newer save wrote. A host whose save point moved with the newer save
   * (VS Code's) shows the document clean over it, and writes it again (open-questions 16 B).
   */
  saved(save: MatSave): boolean {
    const taken = this.taken.get(save);
    if (!taken) return false;
    this.taken.delete(save);
    const behind = taken.seq < this.landedSeq;
    if (!behind) this.landedSeq = taken.seq;
    // The rows whose Status the commit moves, against what they show now: a save that lands behind
    // a newer one marks again what the newer one's landing cleared.
    const before = this.marks.marks();
    this.marks.commit(taken.snapshot);
    // The Status column moved with it, which a paint on its await built before: it builds again.
    this.treeVersion++;
    this.repaintMarks(before);
    return behind;
  }

  /** The bytes of `save` were never written: the Status column stays measured from the last save. */
  notSaved(save: MatSave): void {
    const taken = this.taken.get(save);
    if (!taken) return;
    this.taken.delete(save);
    this.marks.release(taken.snapshot);
  }

  /**
   * The bytes a hot-exit backup holds: the whole file as a save would write it, with no save point
   * moved. Where core refuses to write the tree as it stands, says so once (through `notify`),
   * until a backup is written again (`backupWritten`), and throws: `kept`, an earlier backup still
   * standing, is then what a restart restores, which the notice says.
   */
  backup(kept: boolean): Uint8Array {
    try {
      return this.serialize();
    } catch (err) {
      if (!this.backupRefusalShown) {
        this.backupRefusalShown = true;
        const app = this.options.appName ?? 'the app';
        this.notify(
          'warning',
          `${messageOf(err)} ${kept ? `If ${app} restarts now, it restores ${this.metaPath} as it was before the latest edits.` : ''}`.trim(),
        );
      }
      throw err;
    }
  }

  /** The bytes `backup` handed back are written: a refusal after this one is said again. */
  backupWritten(): void {
    this.backupRefusalShown = false;
  }

  /**
   * Push one gesture's undo steps onto the edit stack as one edit, and record which variables it
   * touched for the Status column. `touched` beyond what the bus said: a batch delete announces
   * its first variable only, and the rest of them are as much the edit's.
   */
  private pushEdit(label: string, observed: Observed, touched: Iterable<any> = []): void {
    const steps = observed.steps;
    const generation = this.treeGeneration;
    const mark = this.marks.push([...observed.touched, ...touched], observed.added, observed.replaced);
    const { index, sink } = this.options;
    this.treeVersion++;
    index.pushed();
    sink.push({
      label,
      undo: () => {
        index.undone();
        if (generation !== this.treeGeneration) return this.staleEdit('undone');
        mark.undone();
        this.replay('undo', steps);
      },
      redo: () => {
        index.redone();
        if (generation !== this.treeGeneration) return this.staleEdit('redone');
        mark.redone();
        this.replay('redo', steps);
      },
    });
  }

  /**
   * An undo or redo of an edit made before the file was last read from disk. Its steps left with
   * the old tree, so nothing is done to the new one, and the user is told rather than left
   * guessing why the table did not move.
   */
  private staleEdit(what: 'undone' | 'redone'): void {
    this.notify('status', `${this.metaPath} was reloaded from disk since this edit was made, so it cannot be ${what}.`, 5000);
  }

  /**
   * Run one gesture through the session, push what it recorded as ONE edit, and repaint every view
   * of the file: the half of a gesture that is the document's. A view's own gestures come through
   * here, and so does the delete a move into another document asks of this one (`deleteMoved`).
   *
   * What core recorded before a throw is one edit like any other, so that the next Undo undoes it
   * and not the edit before it. A gesture that threw is not repainted here: whatever core did
   * before it threw is in the tree, and the caller paints every row again and says why.
   */
  private record(label: string, run: (mat: any) => void, touched: () => Iterable<any> = () => []): Observed {
    const mat = this.model();
    const observed = observe(this.session, mat, this.srcId, () => run(mat));
    if (observed.steps > 0) this.pushEdit(label, observed, touched());
    if (observed.error) {
      this.treeVersion++;
      // Whatever core did before it threw is in the tree, which the caller paints again.
      this.options.changed?.();
      return observed;
    }
    // Its rows, and the gallery's classes where the edit moved them.
    this.repaint(observed);
    return observed;
  }

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
  private deleteMoved(targets: readonly DeleteTarget[]): SourceDeleteResult {
    let mat: any;
    try {
      mat = this.model();
    } catch (err) {
      return { removed: false, reason: this.describe(err) };
    }
    if (mat.readOnly) return { removed: false, reason: `${this.metaPath} is read-only` };
    // The file's variables by name, once: a select-all cut of a large file names every one.
    const byName = new Map<string, any[]>();
    for (const v of mat.children as any[]) {
      const named = byName.get(v.name);
      if (named) named.push(v);
      else byName.set(v.name, [v]);
    }
    const variables: any[] = [];
    for (const target of targets) {
      const { name } = toEntrySelector(target);
      const named = byName.get(name) ?? [];
      if (named.length > 1) return { removed: false, reason: `it holds more than one "${name}", and a move takes its original out by name` };
      // The variable that holds the name now must be the one that was taken: a cut is lazy, and
      // between it and the paste the original can be deleted and another variable given its
      // name, which a delete by name would take out instead. Nothing is removed then: the
      // original is gone, or (renamed since) still there under its new name for the user.
      const origin = typeof target === 'object' ? target.origin : undefined;
      if (named.length === 1 && origin && this.origins.get(named[0]) !== origin) {
        const moved = (mat.children as any[]).find((v) => this.origins.get(v) === origin);
        return moved
          ? { removed: false, reason: `the "${name}" it holds now is another variable, and the one taken is now "${moved.name}"` }
          : { removed: false, gone: true, reason: `the "${name}" it holds now is another variable, which was left as it is` };
      }
      variables.push(...named);
    }
    if (variables.length === 0) return { removed: false, reason: NOT_FOUND_REASON };
    const observed = this.record(
      'Move (remove source)',
      () => this.session.deleteNodesById(variables.map((v) => v.id)),
      () => variables,
    );
    // Answered from what the file holds now, not from whether core threw: a delete it recorded
    // before throwing took the originals out all the same (and is an edit the stack was handed),
    // and telling the user to remove them by hand would have them look for what is gone.
    const gone = variables.every((v) => v.parent !== mat);
    if (observed.error) this.repaintAll();
    if (gone && observed.steps > 0) return { removed: true };
    if (observed.error) return { removed: false, reason: this.describe(observed.error) };
    return { removed: false, reason: 'the file did not let it be removed' };
  }

  /**
   * The token a cut or a drag of `variable` carries (TransferItem.origin), which `deleteMoved`
   * tells the original by: one object for as long as the variable is the same node — through
   * edits of it, a rename, and the undo of its delete, which puts the node itself back. A variable
   * made since (an Add, a paste, a reload of the file) is another node, with another token.
   */
  private originOf(variable: any): object {
    let token = this.origins.get(variable);
    if (!token) this.origins.set(variable, (token = {}));
    return token;
  }

  // Keyed weakly by the node: a token keeps no variable alive, and a variable gone keeps no token.
  private readonly origins = new WeakMap<object, object>();

  /** Run core's undo or redo `steps` times on this file's stack, and repaint what it touched. */
  private replay(direction: 'undo' | 'redo', steps: number): void {
    const mat = this.model();
    const observed = observe(this.session, mat, this.srcId, () => {
      for (let i = 0; i < steps; i++) {
        // The session's undo is its ACTIVE source's: this file, every time.
        this.session.setActiveContext(mat);
        if (direction === 'undo') this.session.undo();
        else this.session.redo();
      }
    });
    this.treeVersion++;
    if (observed.error) {
      // Core's own step threw part-way: the tree is whatever it left, so every row is painted
      // again from it, and the user is told. Nothing can put the two stacks back in step.
      this.repaintAll();
      this.notify('error', `Could not ${direction} the edit of ${this.metaPath}: ${this.describe(observed.error)}`);
      return;
    }
    this.repaint(observed);
  }

  /** Repaint every view after `observed`: one variable's rows at a time, or all of them. */
  private repaint(observed: Observed): void {
    let mat: any;
    try {
      mat = this.model();
    } catch {
      return void this.repaintAll();
    }
    if (variablesMoved(mat, observed)) return void this.repaintAll();
    const present = [...observed.touched].filter((v) => v.parent === mat);
    for (const view of [...this.views]) {
      view.repaintVariables(present, observed.before);
      // An edit can change what core says the file takes a new variable of, and so can its undo
      // and its redo, which come through here as the gesture does.
      view.refreshGallery();
    }
    this.options.changed?.();
  }

  /** Repaint the variables whose Status changed between two answers of `marks`. */
  private repaintMarks(before: ReadonlyMap<any, SaveMark>): void {
    let mat: any;
    try {
      mat = this.model();
    } catch {
      return;
    }
    const after = this.marks.marks();
    const changed = new Set<any>();
    for (const [v, m] of before) if (after.get(v) !== m) changed.add(v);
    for (const [v, m] of after) if (before.get(v) !== m) changed.add(v);
    // Of the variables in the file only. One an edit took out of it is marked all the same, and
    // has no rows: a splice of rows the table does not hold has it ask for every row again, which
    // resets its banners.
    const present = [...changed].filter((v) => v.parent === mat);
    if (present.length === 0) return;
    for (const view of [...this.views]) view.repaintVariables(present);
  }

  /** Every view painted again from the tree. Resolves when every one is. */
  repaintAll(): Promise<void> {
    const painted = Promise.all([...this.views].map((view) => view.repaintAll()));
    this.options.changed?.();
    return painted.then(() => {});
  }

  /**
   * Make this document hold `bytes`, what the disk holds now: a revert, or a reload of an outside
   * change. A new tree, so a new generation, and nothing differing from the file. Resolves when
   * every view is painted from it.
   */
  replace(bytes: ArrayBuffer): Promise<void> {
    this.session.removeDataSource(this.srcId);
    this.bytes = bytes;
    this.loaded = null;
    this.treeGeneration++;
    this.treeVersion++;
    this.marks.clear();
    // Registered now rather than at the paint, so that what asks the session next finds the new
    // tree. A file that no longer reads says so at the paint.
    try {
      this.model();
    } catch {
      /* reported by the paint */
    }
    return this.repaintAll();
  }

  /** A table of the document: an EditableTableSource, until its `dispose()`. */
  view(): EditableTableSource & { dispose(): void; repaintAll(): Promise<void>; opened(view?: TableView): void } {
    return new MatView(this.document);
  }

  /** Close the document: its tree leaves the session. Its views answer nothing more. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const view of [...this.views]) view.dispose();
    this.session.removeDataSource(this.srcId);
  }
}

/** Thrown by a paint that a parse failure ended, so that it is said as such. */
class ParseFailure extends Error {}
/** Thrown by a paint whose view closed while it awaited: it has nowhere to go. */
class Closed extends Error {}

/** What follows a paint, once its rows are delivered: the drop rules, the clipboard, the clip mark. */
interface Trailer {
  notice: string | undefined;
  mat: any;
  clipMark: ClipMark | undefined;
}

/** One table of a MAT-file: resolveCustomEditor's view, as an EditableTableSource. */
class MatView implements EditableTableSource {
  private readonly listeners = new Set<(change: TableChange) => void>();
  private readonly name: string;
  private readonly planner: RowPlanner;
  private readonly unlisten: () => void;
  private closed = false;
  // The classes the gallery was last told the file can take a new variable of. Core's answer
  // (MatNode.getAllowedTypes) can change with the file — a reload, a subsystem a save no longer
  // writes as read — so an edit that changes it, or the undo or redo of one, repaints the whole
  // table, which tells the gallery again (refreshGallery).
  private lastClasses: readonly string[] = [];
  // The clipboard mark the rows last painted whole carry (repaintClipMark).
  private paintedMark: ClipMark | undefined;
  // What follows the paint `open()` last answered, until it is delivered (`opened`). A repaint
  // sends its own after its own rows.
  private after: Trailer | null = null;
  // With trailerAfterDelivery: what follows each whole paint sent, oldest first, until its rows are
  // delivered (`opened`), and the repaint waiting on it.
  private awaiting: { view: TableView; trailer: Trailer; done?: () => void }[] = [];

  constructor(private readonly doc: MatDocument) {
    this.name = doc.metaPath;
    // The MAT planner (rowPlanner.ts): the payload and the answer to a fetch are one walk.
    this.planner = rowPlannerFor(this.name);
    const registers = doc.options.registers;
    // A clipboard broadcast from any table reaches this one (and repaints the mark it carries);
    // a drag's reaches it to predict the drop. A move whose source is this file, pasted or
    // dropped in another document, takes its originals out of this file through the document.
    this.unlisten = registers.listen({
      // The state and the repaint each on its own terms, as editorHub's broadcast reaches a view.
      clipboard: (state) => {
        reach(() => this.emit({ kind: 'clipboard', state }));
        reach(() => this.repaintClipMark());
      },
      drag: (descriptor) => this.emit({ kind: 'drag', descriptor }),
    });
    if (doc.views.size === 0) registers.registerSourceDeleter(doc.uri, (targets) => doc.deleteMoved(targets));
    doc.views.add(this);
  }

  private get session(): Session {
    return this.doc.session;
  }

  // Each listener on its own terms: one that throws (a post to a closed panel) costs the others
  // nothing, and costs the engine nothing, which would otherwise take it for a failed repaint.
  private emit(change: TableChange): void {
    if (this.closed) return;
    for (const listener of [...this.listeners]) reach(() => listener(change));
  }

  private error(message: string): void {
    this.emit({ kind: 'error', message });
  }

  // A row's node, as the commands resolve it: a lookup that throws is a command that throws, and
  // is said as one (handle).
  private findNode = (rowId: string): any => (this.session as any).findNodeById?.(rowId) ?? null;

  // A row's node, as the questions resolve it (children, a matrix, the inspector): whatever goes
  // wrong is no node, and the answer says there is none.
  private findForRead = (rowId: string): any => {
    try {
      return typeof rowId === 'string' && rowId !== '' ? this.findNode(rowId) : null;
    } catch {
      return null;
    }
  };

  // What every row of this view is stamped with beyond the Status column: its variables travel
  // on the clipboard and in row drags, as a dictionary's entries do (`_canCopy`), and those the
  // clipboard holds carry its mark (clipMarks.ts; keyed ('', name), the file's one section). The
  // payload, a variable's repaint and a fetch of the rows under one all stamp alike.
  private stamps(): PlanOptions {
    return { canCopy: true, clipMark: clipMarkOfDoc(this.doc.options.registers, this.doc.uri) };
  }

  // Why the file takes no edit at all, for the banner, or undefined. Core's own words where a
  // save says them; a file whose layout a save could not keep says nothing until it is edited,
  // which it cannot be, so that one gets this view's.
  private readOnlyNotice(mat: any): string | undefined {
    if (!mat.readOnly) return undefined;
    try {
      this.doc.serialize();
    } catch (err) {
      return `Read-only: ${(err as Error).message}`;
    }
    return `Read-only: ${this.name} is laid out in a way a save could not keep as it is, so it opens for viewing only.`;
  }

  // The rows of the whole file, with the Status column measured from the last save, and the
  // clipboard mark they carry (what the clip-mark repaint compares the clipboard with next).
  private build(mat: any) {
    const opts = { ...this.stamps(), savedStatus: this.doc.marks.marks() };
    const planned = this.planner.payload(mat, this.doc.options.budget ?? LAZY_ROW_BUDGET, opts);
    return { planned, clipMark: opts.clipMark, version: this.doc.version };
  }

  // The document's tree, or a ParseFailure saying why there is none.
  private tree(): any {
    try {
      return this.doc.model();
    } catch (err) {
      throw new ParseFailure(`Failed to parse ${this.name}: ${this.doc.describe(err)}`);
    }
  }

  /** The whole table, built from the tree, and what follows it once it is delivered. */
  private async paint(): Promise<{ view: TableView; trailer: Trailer }> {
    let mat = this.tree();
    try {
      let built = this.build(mat);
      // The Usage column. Awaited only here: an edit's repaint fills it from the graph this
      // built (fillNow).
      await this.doc.options.usage?.fill(built.planned.rows).catch(() => false);
      if (this.doc.disposed || this.closed) throw new Closed();
      // The document moved while the graph was being built: these rows are from before it. A
      // reload moves it onto another tree altogether, so the tree is asked for again, and the
      // rows, the notice and the gallery's classes below are all of the one it holds.
      if (built.version !== this.doc.version) {
        mat = this.tree();
        built = this.build(mat);
        this.doc.options.usage?.fillNow(built.planned.rows);
      }
      const notice = this.readOnlyNotice(mat);
      const warnings = this.doc.describeBanner(lazyRowsBanner(built.planned.plan, warningBanner(sourceWarnings(mat))));
      const view: TableView = {
        docUri: this.doc.uri,
        rows: built.planned.rows,
        columns: [...COLUMNS],
        columnLabels: { ...COLUMN_LABELS },
        columnGroups: { ...COLUMN_GROUPS },
        editable: !notice,
        ...(notice === undefined ? {} : { notice }),
        // The gallery offers the classes core says this file can take a new variable of.
        add: { classes: (this.lastClasses = allowedClasses(mat)) },
        ...(warnings === undefined ? {} : { warnings }),
      };
      return { view, trailer: { notice, mat, clipMark: built.clipMark } };
    } catch (err) {
      if (err instanceof Closed || err instanceof ParseFailure) throw err;
      throw new Error(`Failed to show ${this.name}: ${this.doc.describe(err)}`);
    }
  }

  // Behind the rows, in the order the dictionary views send them: where a paste or a drop can
  // land (the whole file, one target, admitting what core says it does), and what the clipboard
  // holds. A read-only file is no target: its empty admitted list would read as "no restriction"
  // (sectionRules.wholeFileRules), so it sends no rule at all.
  //
  // Part of the paint, as the extension's is: what throws here is said as the paint's own failure,
  // after whatever went out before it, and goes no further.
  private sendTrailer(after: Trailer): void {
    if (this.closed) return;
    try {
      this.emit({ kind: 'sectionRules', docUri: this.doc.uri, rules: after.notice ? [] : wholeFileRules(after.mat, this.name) });
      this.emit({ kind: 'clipboard', state: this.doc.options.registers.clipboardState() });
      // The mark these rows CARRY. A copy or a cut that landed while they were being built
      // repainted the rows it marked at once, ahead of these, which have just landed over that
      // with the mark from before: so the rows that moved are painted again, after them.
      this.paintedMark = after.clipMark;
      this.repaintClipMark();
    } catch (err) {
      this.error(`Failed to show ${this.name}: ${this.doc.describe(err)}`);
    }
  }

  /** Every row painted again from the tree, and what follows a paint. */
  repaintAll(): Promise<void> {
    return this.paint().then(
      ({ view, trailer }) => {
        if (this.doc.options.trailerAfterDelivery) {
          return new Promise<void>((done) => {
            this.awaiting.push({ view, trailer, done });
            this.emit({ kind: 'replaceAll', view });
          });
        }
        this.emit({ kind: 'replaceAll', view });
        this.sendTrailer(trailer);
      },
      (err) => {
        if (!(err instanceof Closed)) this.error(messageOf(err));
      },
    );
  }

  // Every row painted again from the tree, and then `message` shown. In that order: a paint
  // clears the error banner, so a message sent beside it would be cleared as it arrived.
  private repaintAndReport(message: string): void {
    void this.repaintAll().then(() => this.error(message));
  }

  // One variable's rows, spliced over the run the table holds for it. The banner's count of rows
  // still to load is the last whole payload's until the next one: one variable cannot move it by
  // much, and recounting it is a walk of the whole file.
  repaintVariables(variables: Iterable<any>, before?: ReadonlyMap<any, string>): void {
    try {
      const saved = this.doc.marks.marks();
      const opts = this.stamps();
      for (const v of variables) {
        const rows = buildMatVariableRows(v, LAZY_ROW_BUDGET, saved, opts);
        this.doc.options.usage?.fillNow(rows);
        this.emit({ kind: 'updateEntry', entryRowId: before?.get(v) ?? v.id, rows });
      }
    } catch (err) {
      this.repaintAndReport(`Failed to update the row: ${this.doc.describe(err)}`);
    }
  }

  // Put back what the table shows of `node`, from the tree, and then show `message`, if any: how
  // a cell that shows what was typed is told what the tree holds, where the tree took nothing.
  // The rows of the variable `node` is or is under; every row, where it is under none.
  private putBack(node: any, message?: string): void {
    const mat = this.treeOrSay();
    if (!mat) return;
    let v = node;
    while (v && v.parent !== mat) v = v.parent;
    if (!v) {
      if (message) this.repaintAndReport(message);
      else void this.repaintAll();
      return;
    }
    this.repaintVariables([v]);
    if (message) this.error(message);
  }

  refreshGallery(): void {
    let mat: any;
    try {
      mat = this.doc.model();
    } catch {
      return;
    }
    if (!sameList(allowedClasses(mat), this.lastClasses)) void this.repaintAll();
  }

  /**
   * The narrow repaint that keeps the clipboard mark this view painted (`paintedMark`) current: on
   * every clipboard broadcast, the variables the painted mark and the clipboard's now name between
   * them, and nothing when they are the same mark — the rule every table follows (clipMarks.ts). A
   * variable is found by its name, the key's other half; one the file no longer holds (a cut
   * pasted elsewhere took it) has no rows left to un-dim.
   */
  private repaintClipMark(): void {
    const next = clipMarkOfDoc(this.doc.options.registers, this.doc.uri);
    const affected = clipMarkChange(this.paintedMark, next);
    if (!affected) return;
    let mat: any;
    try {
      mat = this.doc.model();
    } catch {
      // No tree, so no rows to mark: the view said why when it was painted, and saying it again
      // on every clipboard broadcast would only flash the same banner.
      return;
    }
    this.paintedMark = next;
    const names = new Set(affected.filter((e) => e.section === WHOLE_FILE_SECTION).map((e) => e.name));
    const variables = (mat.children as any[]).filter((v) => names.has(v.name));
    if (variables.length > 0) this.repaintVariables(variables);
  }

  // The document's tree, or null once the view has been told why there is none.
  private treeOrSay(): any {
    try {
      return this.tree();
    } catch (err) {
      this.error(messageOf(err));
      return null;
    }
  }

  // The document's tree when it takes an edit, or null once the view has been told why not:
  // there is no tree, or core opened the file read-only.
  private editableTree(): any {
    const mat = this.treeOrSay();
    if (!mat) return null;
    if (mat.readOnly) {
      this.error(this.readOnlyNotice(mat) ?? `${this.name} is read-only.`);
      return null;
    }
    return mat;
  }

  /**
   * Run one gesture through the session, and push what it recorded as one edit. The gate is
   * core's: a refused gesture records no step, so nothing is pushed and the document stays
   * clean. A file core opened read-only takes nothing at all (the table offers nothing either;
   * this is the lock behind the door).
   */
  private gesture(label: string, run: (mat: any) => void, touched: () => Iterable<any> = () => []): Observed | null {
    if (!this.editableTree()) return null;
    const observed = this.doc.record(label, run, touched);
    if (observed.error) {
      // Whatever core did before it threw is in the tree, and the table is shown it whole.
      this.repaintAndReport(`Failed to apply edit: ${this.doc.describe(observed.error)}`);
      return null;
    }
    return observed;
  }

  // A refused Add Child, Delete or Add, in core's words, said as every table editor says one.
  private refused(gesture: RefusedGesture, reason: string): void {
    this.emit(refusedChange(gesture, reason, (text) => this.doc.describe(text)));
  }

  /**
   * A command that throws is said, as a gesture's throw is, over every row painted again from the
   * tree: whatever it did before it threw is in it, and a cell may still show what was typed.
   */
  private handle(type: string, run: () => void): void {
    if (this.closed) return;
    try {
      run();
    } catch (err) {
      this.repaintAndReport(`Failed to handle ${type} in ${this.name}: ${this.doc.describe(err)}`);
    }
  }

  // --- The read half ---------------------------------------------------------------------------

  // A paint cut off by the view's close settles silently, as the extension's does: SourceClosed,
  // which whoever relays the answer says nothing of.
  open(): Promise<TableView> {
    if (this.closed) return Promise.reject(new SourceClosed(`${this.name} is closed.`));
    return this.paint().then(
      ({ view, trailer }) => {
        if (this.doc.options.trailerAfterDelivery) this.awaiting.push({ view, trailer });
        else this.after = trailer;
        return view;
      },
      (err) => {
        throw err instanceof Closed ? new SourceClosed(`${this.name} is closed.`) : err;
      },
    );
  }

  /**
   * The answer of the last `open()` has been shown: send what follows its paint. With
   * trailerAfterDelivery, the whole paint whose rows are `view` has been delivered (an `open()`
   * answer or a `replaceAll`; without a view, the oldest not yet said to be): what follows it is
   * sent, and its repaint resolves.
   */
  opened(view?: TableView): void {
    if (this.doc.options.trailerAfterDelivery) {
      const at = view ? this.awaiting.findIndex((paint) => paint.view === view) : -1;
      const [next] = this.awaiting.splice(at >= 0 ? at : 0, 1);
      if (!next) return;
      this.sendTrailer(next.trailer);
      next.done?.();
      return;
    }
    const after = this.after;
    this.after = null;
    if (after) this.sendTrailer(after);
  }

  async children(rowId: string): Promise<ChildRows> {
    // Stamped as the payload was, so a fetched row's menu offers what its siblings' does.
    const { nodeId, rows, truncated } = childRowsMessage(rowId, this.findForRead(rowId), this.planner, this.stamps());
    if (rows.length > 0) await this.doc.options.usage?.fill(rows).catch(() => false);
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
    new InspectorSelection(show, (_uri, id) => this.findForRead(id)).show(this.doc.uri, rowIds);
    return view;
  }

  subscribe(listener: (change: TableChange) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  // --- The commands ----------------------------------------------------------------------------

  // A value edit or a rename: core's editProperty, as the Property Inspector of core's own app
  // makes one, with the node selected. A refusal comes back as the cell's validation error, and
  // the variable is repainted from the tree, which the refusal left as it was; so is every edit
  // that did not land, since the table shows what was typed until it is told otherwise.
  edit(msg: CellEdit): void {
    this.handle('edit', () => {
      const node = this.findNode(msg.rowId);
      if (!node) {
        this.repaintAndReport('Could not locate the edited item in the model.');
        return;
      }
      let result: unknown;
      const observed = this.gesture('Edit ' + msg.columnId, (mat) => {
        this.session.setActive(mat, node);
        result = this.session.editProperty(node.id, msg.columnId, msg.newValue, msg.oldValue);
      });
      if (!observed) return;
      const refused = result as { error?: boolean; reason?: string } | boolean;
      if (refused && typeof refused === 'object' && refused.error) {
        this.emit({ kind: 'invalid', reason: this.doc.describe(refused.reason), invalidValue: msg.newValue, previousValue: msg.oldValue });
        this.putBack(node);
        return;
      }
      if (refused === false) {
        this.putBack(node, `Could not edit ${msg.columnId} of this item.`);
        return;
      }
      if (msg.columnId === 'Name') this.emit({ kind: 'select', rowIds: [node.id] });
    });
  }

  // Delete the rows the gesture named, as ONE edit: the variables in one batch (one step), and
  // each row under a variable on its own (one step each). Nodes are resolved first and each is
  // deleted by the id it has at that moment: an element's id is its index, which the removal of
  // an earlier element moves.
  delete(rowIds: readonly string[]): void {
    this.handle('delete', () => {
      const nodes = rowIds.map((id) => this.findNode(id)).filter(Boolean);
      if (nodes.length === 0) {
        this.error('Could not locate the items in the model.');
        return;
      }
      const mat = this.doc.model();
      const variables = nodes.filter((n) => n.parent === mat);
      const inVariables = (n: any): boolean => {
        for (let p = n.parent; p; p = p.parent) if (variables.includes(p)) return true;
        return false;
      };
      const children = nodes.filter((n) => n.parent !== mat && !inVariables(n));
      // Asked of every row it would remove, before any is: a delete core refuses removes nothing.
      const refused = deleteRefusal(this.session, [...children, ...variables].map((n) => n.id));
      if (refused) {
        this.refused('delete', refused);
        return;
      }
      // Where the selection lands: the row after the last one removed, else the one before, else
      // its parent.
      const last = nodes[nodes.length - 1];
      const siblings: any[] = last.parent?.children ?? [];
      const doomed = new Set(nodes);
      const at = siblings.indexOf(last);
      const landing =
        siblings.slice(at + 1).find((s) => !doomed.has(s)) ??
        [...siblings.slice(0, at)].reverse().find((s) => !doomed.has(s)) ??
        (last.parent !== mat ? last.parent : null);
      const observed = this.gesture(
        'Delete',
        () => {
          for (const child of children) if (child.parent) this.session.deleteNodeById(child.id);
          if (variables.length > 0) this.session.deleteNodesById(variables.map((v) => v.id));
        },
        () => variables,
      );
      if (!observed) return;
      if (observed.steps === 0) {
        this.error('Nothing was deleted: this file does not let the selected items be removed.');
        return;
      }
      if (landing && !doomed.has(landing)) this.emit({ kind: 'select', rowIds: [landing.id] });
    });
  }

  // Add one variable of the class the gallery's tile names: core's addEntry, which names it (the
  // class's own default name, `var` for a plain variable, with a counter where it is taken) and
  // makes MATLAB's default value of it. Then its name editor, unless the gallery is pinned. An add
  // core refuses adds nothing, and says core's reason, asked before the add (refusal.ts). One that
  // fails after core said yes is a failure.
  addEntry(msg: NewEntry): void {
    this.handle('addEntry', () => {
      const className = msg.className || 'MatlabVariable';
      const refused = addEntryRefusal(this.session, this.doc.srcId, className);
      if (refused) {
        this.refused('add', refused);
        return;
      }
      let added: any = null;
      let refusal: string | null = null;
      const observed = this.gesture('Add', (mat) => {
        this.session.setActiveContext(mat);
        added = this.session.addEntry('', className);
        if (!added) refusal = this.session.addEntryRefusal();
      });
      if (!observed) return;
      if (!added) {
        this.error(refusal ? this.doc.describe(refusal) : `Could not add a ${tileLabelOf(className)} to ${this.name}.`);
        return;
      }
      this.emit({ kind: 'select', rowIds: [added.id] });
      if (msg.rename) this.emit({ kind: 'beginRename', rowId: added.id });
    });
  }

  // A field of a struct, an element of a vector or a cell, where core says the row takes one.
  addChild(rowId: string): void {
    this.handle('addChild', () => {
      const node = this.findNode(rowId);
      if (!node) {
        this.error('Could not locate the item in the model.');
        return;
      }
      const refused = addChildRefusal(this.session, node.id);
      if (refused) {
        this.refused('addChild', refused);
        return;
      }
      let child: any = null;
      const observed = this.gesture('Add child', () => {
        child = this.session.addChildTo(node.id);
      });
      if (!observed) return;
      if (!child) {
        this.error('Could not add a child to this item.');
        return;
      }
      this.emit({ kind: 'select', rowIds: [child.id] });
    });
  }

  // --- The clipboard and row drags ---------------------------------------------------------------
  //
  // A variable travels as a dictionary's entry does: its serialize() ({name, metadata: null,
  // value}), snapshotted by the walk every table shares (clipboardAction.ts), which asks core first
  // whether it can travel at all (copyRefusal) and carries it from the file's one section, ''.
  // Core's words come back naming the srcId, so every message is described.
  private copyDeps(broadcast: () => void): CopyDeps {
    return {
      session: this.session,
      registers: this.doc.options.registers,
      refresh: () => void this.doc.model(),
      findNode: this.findNode,
      post: (message) => this.error(this.doc.describe(message.message)),
      broadcast,
      // A variable's selector is its name alone, so each one taken carries who it was
      // (deleteMoved reads it back before a move takes it out).
      originOf: (variable: any) => this.doc.originOf(variable),
    };
  }

  // Copy or cut: nothing is changed until the cut is pasted (a cut is lazy). A cut of a file that
  // takes no edit could never be completed — its original could not be taken out — so it is
  // refused here, as every edit of one is.
  copy(rowIds: readonly string[]): void {
    this.handle('copy', () => {
      copyEntriesToClipboard(rowIds, 'copy', this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
    });
  }

  cut(rowIds: readonly string[]): void {
    this.handle('cut', () => {
      if (!this.editableTree()) return;
      copyEntriesToClipboard(rowIds, 'cut', this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastClipboardState()));
    });
  }

  dragStart(rowIds: readonly string[]): void {
    this.handle('dragStart', () => {
      dragEntries(rowIds, this.doc.uri, this.copyDeps(() => this.doc.options.registers.broadcastDragState()));
    });
  }

  dragEnd(): void {
    this.handle('dragEnd', () => {
      this.doc.options.registers.clearDrag();
      this.doc.options.registers.broadcastDragState();
    });
  }

  // --- Paste and drop: the transfer every table runs ---------------------------------------------
  //
  // What a paste or a drop MEANS is transfer.ts's: which register, the no-op of a move back into
  // where every item came from — which for a MAT-file is any move within it, the file being one
  // section — and a cross-document move as the paste here and then the delete in the source's own
  // format (the registers' deleters). What is left here is what the edit IS in a MAT-file: core's
  // pasteEntries into this file, all of the entries or none, as ONE undo step, inside a gesture so
  // that it is ONE edit with the Status column and the repaint every edit has.
  private transferAdapter(): TransferAdapter<TransferTarget> {
    // Thrown by the adapter where the view has already been told why (a gesture reports its own
    // refusals and failures), so that the transfer's failure path says nothing more.
    class Told extends Error {}
    return {
      docUri: this.doc.uri,
      // One section: a same-file move is always the no-op, so the policy never asks this file to
      // take entries out and paste them in one edit — and refuses, should it ever have to.
      takesRemoveFirst: false,
      // Any row, and no row at all (''), is the file.
      resolveTarget: () => {
        if (!this.treeOrSay()) throw new Told();
        return { sectionName: WHOLE_FILE_SECTION };
      },
      validate: () => {
        const mat = this.doc.model();
        if (mat.readOnly) throw new TransferRefused(this.readOnlyNotice(mat) ?? `${this.name} is read-only.`);
      },
      commit: ({ payloads, removeFirst, label }) => {
        // The policy guarantees none (takesRemoveFirst: false); a paste that went on regardless
        // would leave the originals standing beside what it pasted.
        if (removeFirst.length > 0) throw new Error(`a move within ${this.name} reached its paste`);
        let result: PasteResult | undefined;
        const observed = this.gesture(
          label,
          () => {
            // Clones, as a dictionary's paste takes (core's cloneForPaste: a number JSON has no
            // spelling for stays itself): the register keeps its records for the next paste.
            result = this.session.pasteEntries(this.doc.srcId, payloads.map((p) => cloneForPaste(p)) as unknown as PastePayload[]);
          },
          () => (result && 'nodes' in result ? result.nodes : []),
        );
        if (!observed) throw new Told();
        // Refused whole by core, in its words: nothing was made, recorded or published.
        if (!result || 'error' in result) {
          throw new TransferRefused(result ? this.doc.describe((result as { reason: string }).reason) : `Could not paste into ${this.name}.`);
        }
        // Selected once their rows arrive: the repaint that brings them is on its way.
        const ids = (result as { nodes: any[] }).nodes.map((n: any) => n.id);
        if (ids.length > 0) this.emit({ kind: 'select', rowIds: ids });
      },
      onFailure: (err) => {
        if (err instanceof Told) return;
        this.repaintAndReport(`Failed to apply edit: ${this.doc.describe(err)}`);
      },
      report: (message) => this.error(this.doc.describe(message)),
    };
  }

  // A move that left its original behind is said where it stays, not only in the banner a row
  // update clears: see TransferDeps.warn.
  private transferDeps(): TransferDeps {
    return {
      deleteFromSource: (uri, selectors) => this.doc.options.registers.deleteFromSource(uri, selectors),
      warn: (message) => this.doc.notify('warning', message),
    };
  }

  private transferred(run: Promise<unknown>): void {
    void run.catch((err) => this.repaintAndReport(`Failed to apply edit: ${this.doc.describe(err)}`));
  }

  paste(rowId: string): void {
    this.handle('paste', () => {
      const registers = this.doc.options.registers;
      this.transferred(runTransfer({ rowId }, registers.clipboardRegister(() => registers.broadcastClipboardState()), this.transferAdapter(), this.transferDeps()));
    });
  }

  drop(rowId: string, mode: 'copy' | 'move'): void {
    this.handle('drop', () => {
      const registers = this.doc.options.registers;
      this.transferred(runTransfer({ rowId }, registers.dragRegister(mode, () => registers.broadcastDragState()), this.transferAdapter(), this.transferDeps()));
    });
  }

  // --- Undo, redo, and the whole text of a Value --------------------------------------------------

  undo(): void {
    this.handle('undo', () => this.doc.options.sink.undo());
  }

  redo(): void {
    this.handle('redo', () => this.doc.options.sink.redo());
  }

  // A Value editor is opening on a summary: send its whole text (editText.ts).
  requestEditText(rowId: string): void {
    this.handle('requestEditText', () => {
      this.emit(answerEditTextRequest(this.session, this.findNode, rowId, (text) => this.doc.describe(text)));
    });
  }

  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    this.doc.views.delete(this);
    this.unlisten();
    this.listeners.clear();
    // A repaint whose rows can no longer be delivered has nothing more to wait for.
    for (const { done } of this.awaiting.splice(0)) done?.();
    const registers = this.doc.options.registers;
    // A drag that started in this view and is still on goes with it, so that a drop elsewhere
    // cannot complete against a source no view shows.
    if (registers.getDrag()?.sourceDocUri === this.doc.uri) {
      registers.clearDrag();
      registers.broadcastDragState();
    }
    // The deleter is the document's, so it stays while any view of it does.
    if (this.doc.views.size === 0) registers.unregisterSourceDeleter(this.doc.uri);
  }
}
