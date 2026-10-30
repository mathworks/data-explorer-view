// Copyright 2026 The MathWorks, Inc.
//
// The documents a page has open, each read by core in the page, and the table each one shows.
//
// A workspace is one core session and one document registry over it (workspace/SlddModel.ts), so
// a page's documents share what one session shares (a model's Usage counts the others), and two
// workspaces share nothing. The module-level registry the VS Code extension uses is a different
// one: a workspace neither reads nor writes it.
//
// What a document's table answers is what the extension's host sends its table for the same file,
// built by the same functions from the same route (readDocument.ts), read-only. With `editing`, a
// MAT-file and a dictionary are edited in the page: the table is an engine's (the extension's
// editor of the format lifted: edit/matEngine.ts, edit/binaryEngine.ts, edit/jsonEngine.ts), over
// an undo stack of the page's own (a JSON dictionary's is its text's), and the document saves
// through the Doc's save half (`serialize`, `saved`).
import { createSession, exceedsTextSyncLimit, isEditableJsonSlddBytes, isZipBytes } from 'data-explorer-core';
import { binaryEditSrcId } from '../ids/srcId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { sourceWarnings, warningBanner } from '../rows/parseWarnings.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import { annotateModelViewRows, annotateVariableRows, type UsageGraph } from '../usage/usageCells.js';
import { DocumentRegistry } from '../workspace/SlddModel.js';
import { EditStack, EditStackIndex } from '../edit/editStack.js';
import type { EditIndex, Notify } from '../edit/hooks.js';
import { BinaryEngine, type BinarySave } from '../edit/binaryEngine.js';
import { JsonEngine, type JsonUsageReposts } from '../edit/jsonEngine.js';
import type { JsonView } from '../edit/jsonView.js';
import type { DiskStamp } from '../edit/slddBaseline.js';
import { createTextStore, type PageTextStore } from '../edit/textStore.js';
import { MatEngine, type MatSave } from '../edit/matEngine.js';
import { createRegisters, type Registers } from '../edit/registers.js';
import { docKindOf, readDocument, type DocKind, type Reading } from './readDocument.js';
import { sourceUri } from './sourceUri.js';
import type { ChildRows, EditableTableSource, InspectorView, MatrixPage, TableChange, TableSource, TableView } from './tableSource.js';
import type { TreeTableRow } from '../rows/tableRow.js';

export type { DocKind } from './readDocument.js';

/** How a workspace reads and shows its documents. */
export interface WorkspaceOptions {
  /**
   * How many rows a table's paint (`open()`, and a `replaceAll`) delivers before it holds the rest
   * back, breadth-first, for `children()`: `LAZY_ROW_BUDGET` (100,000) unless set. A row whose
   * children were held back carries `_lazy`. `children()` answers to the default budget whatever
   * this is, as the extension does.
   */
  rowBudget?: number;
  /**
   * Where the Usage column's answers come from: who uses each variable of a dictionary or a
   * MAT-file, and where each parameter of a model's blocks comes from. Every paint and every
   * `children()` answer is filled from the graph it gives for the document's uri, as the VS Code
   * extension fills its tables from the folder around a file. Unset, a table's Usage column holds
   * only what the file itself says (a model's blocks, by name).
   */
  usage?: UsageSource;
  /**
   * When a dictionary's or a MAT-file's Usage column is owed a repaint because a model appeared
   * or went away in the folder: each such document subscribes while it is open, and repaints its
   * table (a `replaceAll`, refilled from `usage`) when told to. A usage repost hub
   * (createUsageRepostHub) over the app's watch on the folder. Unset, a column changes only when
   * its own file does.
   */
  usageReposts?: UsageReposts;
  /**
   * Edit in the page what the page can edit: a MAT-file and a dictionary, JSON (within the text
   * limit the extension's table editor has) or compressed. Its table is then an
   * EditableTableSource (connectTable's `editing` wires a table to it), its edits go on an undo
   * stack of its own (a JSON dictionary's text's), and it saves through the Doc's `serialize` and
   * `saved`. Default false: every document is read-only, as before.
   */
  editing?: boolean;
  /**
   * With `editing`: the clipboard and drag register the workspace's documents share (and the
   * deleters a move between them asks), for a page that shares one with other workspaces.
   * Default: one of the workspace's own (createRegisters).
   */
  registers?: Registers;
  /**
   * With `editing`: where a document says what its table does not show — a move that left its
   * original behind, an undo of an edit made before a reload, an undo that failed. Default:
   * nowhere.
   */
  notify?: Notify;
}

/** What a workspace's data documents subscribe to for a Usage repaint: a usage repost hub. */
export interface UsageReposts {
  subscribe(repost: () => void): { dispose(): void };
}

/**
 * The usage graphs a workspace fills its tables' Usage column from: one that can answer for a
 * document, given its uri.
 *
 * Over a folder, the graph for a document is core's `planSummaries(cache, reader, files, uri)` —
 * the summaries of just the files that can reach it — through `buildUsageGraphFromSummaries`.
 * The document must be open under the uri the folder lists it by (`sourceUri(path)`), since that
 * is the uri the graph's answers name it by.
 */
export interface UsageSource {
  /** The graph that answers for the document opened under `uri`. A rejection leaves the cells as the file has them. */
  graphFor(uri: string): Promise<UsageGraph>;
}

/**
 * One open document. An app is handed one and does not implement it, so a release may add to it.
 */
export interface Doc {
  /** The uri it was opened under: its identity in the workspace, and its table's `docUri`. */
  readonly uri: string;
  /** Its file name, as opened (`plant.sldd`). */
  readonly name: string;
  /**
   * What it is. A `'project'` opens on a project page rather than in a table: its `table.open()`
   * rejects, saying so.
   */
  readonly kind: DocKind;
  /** What its table shows, and how it answers. An EditableTableSource where `editable`. */
  readonly table: TableSource;
  /**
   * Whether the page edits it (a MAT-file or a dictionary, in a workspace made with `editing`):
   * its table takes edits, and it saves through `serialize` and `saved`. Whether a given file can be
   * edited is its view's `editable` (a MAT-file laid out in a way a save could not keep opens
   * read-only).
   */
  readonly editable: boolean;
  /** Whether it holds edits its file does not: false for a document the page does not edit. */
  readonly dirty: boolean;
  /** Hear `dirty` change, until the returned function is called. */
  onDirty(listener: (dirty: boolean) => void): () => void;
  /**
   * Start a save: the bytes to write, read synchronously, so that they are the document as the
   * save was asked for, and `at`, which `saved` (or `notSaved`) is handed once they are written
   * (or are not). Throws why it cannot be written (core's refusal, in its words), and for a
   * document the page does not edit.
   */
  serialize(): { bytes: Uint8Array; at: SaveToken };
  /** The bytes of the save `at` began are on disk: it is clean as of then, and its Status column moves. */
  saved(at: SaveToken): void;
  /** The bytes of the save `at` began were never written: nothing about the document moves. */
  notSaved(at: SaveToken): void;
  /**
   * The file changed: read `bytes` in place of what it held. The table's subscribers hear the
   * outcome: a `replaceAll` with the new paint, or an `error` saying why the file could not be
   * read (and `open()` then rejects with it).
   */
  reload(bytes: ArrayBuffer | Uint8Array): Promise<void>;
  /**
   * Paint the table again from the read it has, refilled from the workspace's `usage`: its
   * subscribers hear a `replaceAll` (or the `error` the paint failed with). For what changed the
   * Usage column and not the file, as a usage source that appeared (`setUsage`). A project, which
   * opens on a page, has no table to paint.
   */
  repaint(): Promise<void>;
  /** Close it: its tree leaves the session, and its table answers nothing more. */
  dispose(): void;
}

/** What `Doc.serialize` hands back with its bytes, for `saved`: which save of the document they are. */
export interface SaveToken {
  readonly at: number;
}

/**
 * The documents a page has open. An app is handed one and does not implement it, so a release may
 * add to it.
 */
export interface Workspace {
  /**
   * Open the file `name`, whose content is `bytes` (which the workspace keeps: do not write to
   * them afterwards).
   *
   * `uri` is its identity, which every row id embeds; by default `sourceUri('/' + name)`. Pass
   * `sourceUri(path)` of the file's path when two open files may share a name, or to give a file
   * the identity the VS Code extension gives it.
   *
   * Rejects for a file of a kind this package does not open, a uri already open here, or a
   * workspace that is closed. A file that cannot be read still opens: its `table.open()` rejects
   * with what the table's error banner says.
   */
  open(bytes: ArrayBuffer | Uint8Array, name: string, uri?: string): Promise<Doc>;
  /** The open document of `uri`, if there is one. */
  get(uri: string): Doc | undefined;
  /**
   * Fill the Usage column from `usage` from now on, and repaint from `usageReposts` (both as
   * `createWorkspace` takes them; leaving one out means none): for a workspace that outlives a
   * folder, or a usage source that comes after the documents. Every paint reads the source, a
   * model's block parameters as much as a dictionary's users, so every open document's table that
   * has a subscriber is painted again, refilled (`replaceAll`): dictionaries, MAT-files and models;
   * one with none is refilled at its next paint. A project has no table. The repost subscriptions
   * move to the new hub, and stay a dictionary's and a MAT-file's alone, as the hub's rule has it.
   * Resolves when the repaints are done.
   */
  setUsage(usage?: UsageSource, usageReposts?: UsageReposts): Promise<void>;
  /** Close every document and the session they were read into. */
  dispose(): void;
}

const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** The bytes as core takes them: an ArrayBuffer holding exactly them. */
function arrayBufferOf(bytes: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (!ArrayBuffer.isView(bytes)) return bytes;
  const whole = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength;
  if (whole && bytes.buffer instanceof ArrayBuffer) return bytes.buffer;
  return new Uint8Array(bytes).buffer as ArrayBuffer;
}

/** What a workspace's documents share. */
interface Shared {
  registry: DocumentRegistry;
  budget: number;
  usage: UsageSource | undefined;
  usageReposts: UsageReposts | undefined;
  registers: Registers;
  notify: Notify | undefined;
  closed(doc: Doc): void;
}

/** What every workspace document is to the workspace that holds it. */
interface HeldDoc extends Doc {
  subscribeReposts(): void;
  refillUsage(): Promise<void>;
}

class InPageDoc implements HeldDoc {
  readonly table: TableSource;
  readonly editable = false;
  readonly dirty = false;
  /** The current read, or undefined when it failed (`failure` says why) or the document is closed. */
  private reading: Reading | undefined;
  private failure = '';
  /** The current read's paint, once asked for: it is filled (`usage`) before it resolves. */
  private painted: Promise<TableView> | undefined;
  private readonly listeners = new Set<(change: TableChange) => void>();
  private disposed = false;
  private reposts: { dispose(): void } | undefined;

  constructor(
    private readonly shared: Shared,
    readonly uri: string,
    readonly name: string,
    readonly kind: DocKind,
    bytes: ArrayBuffer,
  ) {
    this.read(bytes);
    // A data file's Usage names blocks in the models around it, which come and go; a model's names
    // its own blocks and its own workspace, which no other model changes.
    this.subscribeReposts();
    this.table = {
      open: async () => this.open(),
      children: (rowId) => this.children(rowId),
      matrix: async (nodeId) => this.matrix(nodeId),
      inspect: async (selection) => this.inspect(selection),
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
      },
    };
  }

  onDirty(): () => void {
    return () => {};
  }

  serialize(): never {
    throw new Error(`${this.name} is not edited in this workspace.`);
  }

  saved(): void {}

  notSaved(): void {}

  async reload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    this.read(arrayBufferOf(bytes));
    if (this.kind === 'project') return;
    await this.emitPaint();
  }

  async repaint(): Promise<void> {
    if (this.disposed || this.kind === 'project') return;
    this.painted = undefined;
    await this.emitPaint();
  }

  // A data file's Usage names blocks in the models around it, which come and go; a model's names
  // its own blocks and its own workspace, which no other model changes.
  get repostsUsage(): boolean {
    return this.kind === 'dictionary' || this.kind === 'mat';
  }

  /** Take out the repost subscription the workspace's hub owes this document, in place of any held. */
  subscribeReposts(): void {
    this.reposts?.dispose();
    this.reposts = this.repostsUsage && !this.disposed ? this.shared.usageReposts?.subscribe(() => void this.refillUsage()) : undefined;
  }


  /**
   * The Usage column changed under the table (a repost, or a new usage source): paint again from
   * the same read, refilled, for a table that is showing it. With none subscribed, the next
   * `open()` paints afresh.
   */
  async refillUsage(): Promise<void> {
    if (this.disposed || !this.reading) return;
    this.painted = undefined;
    if (this.listeners.size > 0) await this.emitPaint();
  }

  /** Tell every subscriber the paint there is now: a `replaceAll`, or the `error` it failed with. */
  private async emitPaint(): Promise<void> {
    let change: TableChange;
    try {
      change = { kind: 'replaceAll', view: await this.open() };
    } catch (err) {
      change = { kind: 'error', message: messageOf(err) };
    }
    if (this.disposed) return;
    for (const listener of [...this.listeners]) {
      try {
        listener(change);
      } catch (err) {
        // One listener's failure is its own: the others still hear the change.
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reposts?.dispose();
    this.unload();
    this.listeners.clear();
    this.shared.closed(this);
  }

  private read(bytes: ArrayBuffer): void {
    this.unload();
    this.failure = '';
    if (this.kind === 'project') {
      this.failure = `${this.name} is a project: it opens on a project page, not in a table.`;
      return;
    }
    try {
      this.reading = readDocument(this.shared.registry, this.kind, this.name, this.uri, bytes);
    } catch (err) {
      this.failure = messageOf(err);
      this.unload();
    }
  }

  /** Take the current tree out of the session, whichever id a read registered it under. */
  private unload(): void {
    this.reading = undefined;
    this.painted = undefined;
    this.shared.registry.release(this.uri);
    this.shared.registry.release(binaryEditSrcId(this.uri));
  }

  private open(): Promise<TableView> {
    if (this.disposed) return Promise.reject(new Error(`${this.name} is closed.`));
    const r = this.reading;
    if (!r) return Promise.reject(new Error(this.failure));
    this.painted ??= this.paint(r);
    return this.painted;
  }

  private async paint(r: Reading): Promise<TableView> {
    let view: TableView;
    try {
      const planned = r.planner.payload(r.node, this.shared.budget, r.paint);
      const notice = r.notice();
      const warnings = r.banner(lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(r.node))));
      view = {
        docUri: this.uri,
        rows: planned.rows,
        columns: [...COLUMNS],
        columnLabels: { ...COLUMN_LABELS },
        columnGroups: { ...COLUMN_GROUPS },
        editable: false,
        ...(notice === undefined ? {} : { notice }),
        ...(warnings === undefined ? {} : { warnings }),
      };
    } catch (err) {
      throw new Error(r.paintFailed(err));
    }
    await this.fillUsage(view.rows);
    return view;
  }

  /**
   * The Usage column of `rows`, from the workspace's usage graph for this document: a model's
   * block rows take their parameters' sources and its workspace variables their users; every
   * other document's variables take theirs. The rule the extension fills its tables by
   * (usageCells.ts). A graph that cannot be had leaves the cells as the file has them.
   */
  private async fillUsage(rows: TreeTableRow[]): Promise<void> {
    const usage = this.shared.usage;
    if (!usage || rows.length === 0) return;
    try {
      const graph = await usage.graphFor(this.uri);
      if (this.kind === 'model') annotateModelViewRows(this.uri, rows, graph);
      else annotateVariableRows(this.uri, rows, graph);
    } catch {
      /* no graph: the cells keep what the read gave them */
    }
  }

  /** The node a row id names in the current tree, or null. */
  private find(nodeId: string): unknown {
    const r = this.reading;
    if (!r || typeof nodeId !== 'string' || nodeId === '') return null;
    try {
      return this.shared.registry.findNode(r.srcId, nodeId);
    } catch {
      return null;
    }
  }

  private async children(rowId: string): Promise<ChildRows> {
    const r = this.reading;
    const { nodeId, rows, truncated } = childRowsMessage(rowId, this.find(rowId), r?.planner ?? rowPlannerFor(this.name), r?.fetch);
    await this.fillUsage(rows);
    return { nodeId, rows, truncated };
  }

  private matrix(nodeId: string): MatrixPage {
    const { matrix, message } = matrixCellsMessage(nodeId, this.find(nodeId));
    return matrix ? { nodeId, matrix } : { nodeId, message: message ?? 'This value could not be read as a table.' };
  }

  private inspect(selection: string | readonly string[]): InspectorView {
    const rowIds = typeof selection === 'string' ? [selection] : selection;
    let view: InspectorView = { groups: [] };
    // The inspector's own rule for which row a selection shows (the first, unless it is a section
    // heading), with this document's lookup.
    const show = { showNode: (node: unknown) => void (view = { rowId: rowIds[0], groups: buildPropertyGroups(node) }), clear: () => {} };
    new InspectorSelection(show, (_uri, id) => this.find(id)).show(this.uri, rowIds);
    return view;
  }
}

/** Who hears a document's `dirty` change: each listener told on its own terms, once per change. */
class DirtyBell {
  private readonly listeners = new Set<(dirty: boolean) => void>();
  private was = false;

  listen(listener: (dirty: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Tell each listener that `dirty` changed, if it did. */
  tell(dirty: boolean): void {
    if (dirty === this.was) return;
    this.was = dirty;
    for (const listener of [...this.listeners]) {
      try {
        listener(dirty);
      } catch (err) {
        // One listener's failure is its own: the others still hear the change.
        queueMicrotask(() => {
          throw err;
        });
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

/** What an engine-backed document asks of its engine for a save, and to close. */
interface SavingEngine<S extends SaveToken & { readonly bytes: Uint8Array }> {
  beginSave(): S;
  saved(save: S): void;
  notSaved(save: S): void;
  dispose(): void;
}

/**
 * A document edited in the page through one of the engines: an undo stack of its own and where it
 * stands (its save point, and so `dirty`), its one table the engine's view, and its saves the
 * engine's.
 */
abstract class EditableDoc<S extends SaveToken & { readonly bytes: Uint8Array }> implements HeldDoc {
  abstract readonly kind: DocKind;
  readonly editable = true;
  protected abstract readonly engine: SavingEngine<S>;
  protected view!: EditableTableSource & { dispose(): void; repaintAll(): Promise<void> };
  protected readonly stack = new EditStack();
  protected readonly index = new EditStackIndex();
  /**
   * The stack's position, as the engine moves it. Whoever listens for `dirty` is told once the
   * step that moved it, and its replay, are done: never from inside one, where a listener that
   * threw would leave the two stacks out of step.
   */
  protected readonly watched: EditIndex;
  private readonly bell = new DirtyBell();
  private dirtyCheck = false;
  protected disposed = false;

  constructor(
    protected readonly shared: Shared,
    readonly uri: string,
    readonly name: string,
  ) {
    const index = this.index;
    this.watched = {
      get dirty() {
        return index.dirty;
      },
      get moves() {
        return index.moves;
      },
      here: () => index.here(),
      pushed: () => this.moved(() => index.pushed()),
      undone: () => this.moved(() => index.undone()),
      redone: () => this.moved(() => index.redone()),
      saved: (at) => this.moved(() => index.saved(at)),
      reverted: () => this.moved(() => index.reverted()),
    };
  }

  /** Its one table: the engine's view. */
  get table(): EditableTableSource {
    return this.view;
  }

  get dirty(): boolean {
    return this.index.dirty;
  }

  onDirty(listener: (dirty: boolean) => void): () => void {
    return this.bell.listen(listener);
  }

  // The stack moved: tell `dirty`'s listeners once the step is done (tellDirty, from the engine's
  // `changed`), or a turn later where no change to the tree follows (an undo of an edit from before
  // a reload, which does nothing to the tree).
  private moved(move: () => void): void {
    move();
    if (this.dirtyCheck) return;
    this.dirtyCheck = true;
    queueMicrotask(() => this.tellDirty());
  }

  /** Tell each listener of `dirty` that it changed, if it did, each on its own terms. */
  protected tellDirty(): void {
    this.dirtyCheck = false;
    if (!this.disposed) this.bell.tell(this.index.dirty);
  }

  serialize(): { bytes: Uint8Array; at: SaveToken } {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    const save = this.engine.beginSave();
    return { bytes: save.bytes, at: save };
  }

  saved(at: SaveToken): void {
    if (this.disposed) return;
    const save = at as S;
    this.engine.saved(save);
    this.index.saved(save.at);
    this.tellDirty();
  }

  notSaved(at: SaveToken): void {
    if (this.disposed) return;
    this.engine.notSaved(at as S);
  }

  abstract reload(bytes: ArrayBuffer | Uint8Array): Promise<void>;

  async repaint(): Promise<void> {
    if (this.disposed) return;
    await this.view.repaintAll();
  }

  subscribeReposts(): void {}

  async refillUsage(): Promise<void> {}

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.engine.dispose();
    this.bell.clear();
    this.shared.closed(this);
  }
}

/**
 * A MAT-file edited in the page: the MAT-file engine (edit/matEngine.ts) over an undo stack of its
 * own, its one table the engine's view, and its saves the engine's. Its Usage column is filled
 * from the workspace's `usage`, and repainted on its reposts.
 */
class EditableMatDoc extends EditableDoc<MatSave> {
  readonly kind = 'mat' as const;
  protected readonly engine: MatEngine;
  private reposts: { dispose(): void } | undefined;
  /** The usage graph the last fill used, for a narrow repaint's. */
  private graph: UsageGraph | undefined;

  constructor(shared: Shared, uri: string, name: string, bytes: ArrayBuffer) {
    super(shared, uri, name);
    this.engine = new MatEngine({
      session: shared.registry.session,
      uri,
      name,
      bytes,
      sink: this.stack,
      index: this.watched,
      registers: shared.registers,
      notify: shared.notify,
      budget: shared.budget,
      // Every change to the tree ends here, once the step and every view are done with it.
      changed: () => this.tellDirty(),
      usage: {
        fill: async (rows) => {
          const usage = this.shared.usage;
          if (!usage || rows.length === 0) return;
          this.graph = await usage.graphFor(this.uri);
          annotateVariableRows(this.uri, rows, this.graph);
        },
        fillNow: (rows) => {
          if (this.graph && rows.length > 0) annotateVariableRows(this.uri, rows, this.graph);
        },
      },
    });
    this.view = this.engine.view();
    this.subscribeReposts();
  }

  async reload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    // A new tree: no edit made before has anything to undo on it, and it holds what the disk does.
    this.stack.clear();
    this.index.reverted();
    this.tellDirty();
    this.graph = undefined;
    await this.engine.replace(arrayBufferOf(bytes));
  }

  async repaint(): Promise<void> {
    if (this.disposed) return;
    this.graph = undefined;
    await super.repaint();
  }

  subscribeReposts(): void {
    this.reposts?.dispose();
    this.reposts = this.disposed ? undefined : this.shared.usageReposts?.subscribe(() => void this.refillUsage());
  }

  async refillUsage(): Promise<void> {
    await this.repaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.reposts?.dispose();
    super.dispose();
  }
}

/**
 * A compressed (zip) dictionary edited in the page: the binary dictionary engine
 * (edit/binaryEngine.ts) over an undo stack of its own. As the VS Code extension's binary
 * dictionary editor, it fills no Usage column.
 */
class EditableBinaryDoc extends EditableDoc<BinarySave> {
  readonly kind = 'dictionary' as const;
  protected readonly engine: BinaryEngine;

  /** Throws for bytes that are not a compressed dictionary (a zip with no data part). */
  constructor(shared: Shared, uri: string, name: string, bytes: Uint8Array) {
    super(shared, uri, name);
    this.engine = new BinaryEngine({
      session: shared.registry.session,
      uri,
      name,
      bytes,
      sink: this.stack,
      index: this.watched,
      registers: shared.registers,
      notify: shared.notify,
      budget: shared.budget,
      // Every repaint of the document ends here, once the step and every view are done with it.
      changed: () => this.tellDirty(),
    });
    this.view = this.engine.view();
  }

  async reload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    // Read first: bytes that are not a dictionary reject, and the document keeps what it held.
    this.engine.replace(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
    // It holds what the disk does, and no edit made before has anything to undo on it.
    this.stack.clear();
    this.index.reverted();
    this.tellDirty();
  }
}

/** What a save of a JSON dictionary took: the text's version, and the bytes written. */
interface JsonSave extends SaveToken {
  readonly bytes: Uint8Array;
  readonly text: string;
}

/**
 * A JSON dictionary edited in the page: the JSON dictionary engine (edit/jsonEngine.ts) over a text
 * of the page's own (createTextStore), whose undo stack, dirty state and saves are the document's.
 * The file behind it is what the workspace last opened, reloaded or saved, which the engine's
 * baseline reads (a stamp moved by each). Its Usage column is filled from the workspace's `usage`.
 */
class EditableJsonDoc implements HeldDoc {
  readonly kind = 'dictionary' as const;
  readonly editable = true;
  readonly table: EditableTableSource;
  private readonly text: PageTextStore;
  private readonly engine: JsonEngine;
  private readonly view: JsonView;
  private readonly bell = new DirtyBell();
  private disposed = false;
  /** The file as the workspace last read or wrote it, and its stamp (moved by each). */
  private disk: { bytes: Uint8Array; stamp: DiskStamp };
  private generation = 0;
  /** The usage graph the last fill used, for a narrow repaint's. */
  private graph: UsageGraph | undefined;
  /** The table's repost and when it is held back (the engine subscribes once), and the hub's subscription. */
  private repost: { repost: () => void; busy?: () => boolean } | null = null;
  private reposts: { dispose(): void } | undefined;
  private readonly stopListening: () => void;

  constructor(
    private readonly shared: Shared,
    readonly uri: string,
    readonly name: string,
    bytes: Uint8Array,
  ) {
    this.disk = { bytes, stamp: { mtime: this.generation, size: bytes.length } };
    this.text = createTextStore(new TextDecoder().decode(bytes));
    this.engine = new JsonEngine({
      registry: shared.registry,
      uri,
      name,
      text: this.text,
      registers: shared.registers,
      notify: shared.notify,
      budget: shared.budget,
      usage: {
        fill: async (rows) => {
          const usage = this.shared.usage;
          if (!usage || rows.length === 0) return;
          this.graph = await usage.graphFor(this.uri);
          annotateVariableRows(this.uri, rows, this.graph);
        },
        fillNow: (rows) => {
          if (!this.shared.usage || rows.length === 0) return true;
          if (!this.graph) return false;
          annotateVariableRows(this.uri, rows, this.graph);
          return true;
        },
      },
      // One subscription for the engine's table, kept across the workspace's hubs (setUsage).
      usageReposts: {
        subscribe: (repost, busy) => {
          this.repost = { repost, ...(busy ? { busy } : {}) };
          return { dispose: () => void (this.repost = null) };
        },
      },
      disk: {
        stat: async () => this.disk.stamp,
        read: async () => this.disk.bytes,
      },
    });
    this.view = this.engine.view();
    this.table = this.view;
    // Its dirty state as the text says it: told with every change that moves it.
    this.stopListening = this.text.onChange((change) => {
      if (change.changes.length === 0) this.bell.tell(this.text.dirty);
    });
    this.subscribeReposts();
  }

  get dirty(): boolean {
    return this.text.dirty;
  }

  onDirty(listener: (dirty: boolean) => void): () => void {
    return this.bell.listen(listener);
  }

  // The text as it stands, as the bytes a save writes (UTF-8, as the extension saves a dictionary).
  serialize(): { bytes: Uint8Array; at: SaveToken } {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    const text = this.text.text;
    const bytes = new TextEncoder().encode(text);
    const save: JsonSave = { at: this.text.version, bytes, text };
    return { bytes, at: save };
  }

  saved(at: SaveToken): void {
    if (this.disposed) return;
    const save = at as JsonSave;
    this.disk = { bytes: save.bytes, stamp: { mtime: ++this.generation, size: save.bytes.length } };
    // Clean if the text is still the one written; otherwise the edits since stay unsaved, and the
    // Status column is measured from what was written.
    if (this.text.version === save.at) this.text.saved(save.at);
    else this.engine.fileHolds(save.text);
  }

  notSaved(_at: SaveToken): void {
    // Nothing moved for a save until its bytes were written.
  }

  async reload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.disk = { bytes: view, stamp: { mtime: ++this.generation, size: view.length } };
    this.graph = undefined;
    // The text the file holds now, with an empty undo stack and nothing unsaved.
    await this.text.reset(new TextDecoder().decode(view));
  }

  async repaint(): Promise<void> {
    if (this.disposed) return;
    this.graph = undefined;
    await this.view.repaintAll();
  }

  subscribeReposts(): void {
    this.reposts?.dispose();
    const hub = this.shared.usageReposts as JsonUsageReposts | undefined;
    this.reposts = this.disposed
      ? undefined
      : hub?.subscribe(
          () => {
            this.graph = undefined;
            this.repost?.repost();
          },
          () => this.repost?.busy?.() ?? false,
        );
  }

  async refillUsage(): Promise<void> {
    await this.repaint();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.reposts?.dispose();
    this.stopListening();
    this.engine.dispose();
    this.bell.clear();
    this.shared.closed(this);
  }
}

/**
 * The document the page edits `bytes` as, or null where it edits none: a MAT-file, a JSON
 * dictionary the extension's table editor would edit, and a compressed dictionary with a data part
 * (one with none opens read-only, and says why).
 */
function editableDoc(shared: Shared, uri: string, name: string, kind: DocKind, bytes: ArrayBuffer | Uint8Array): HeldDoc | null {
  if (kind === 'mat') return new EditableMatDoc(shared, uri, name, arrayBufferOf(bytes));
  if (kind !== 'dictionary') return null;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  // A JSON dictionary the extension's table editor opens: one that parses, within the text-sync
  // limit (the extension keeps a larger one read-only).
  if (!isZipBytes(view)) return isEditableJsonSlddBytes(view) && !exceedsTextSyncLimit(view) ? new EditableJsonDoc(shared, uri, name, view) : null;
  try {
    return new EditableBinaryDoc(shared, uri, name, view);
  } catch {
    return null;
  }
}

/**
 * A workspace: the documents of a page, read by core in the page.
 *
 * ```ts
 * const ws = createWorkspace();
 * const doc = await ws.open(bytes, 'plant.sldd');
 * const view = await doc.table.open(); // rows, columns, banners
 * ```
 */
export function createWorkspace(options: WorkspaceOptions = {}): Workspace {
  const budget = options.rowBudget ?? LAZY_ROW_BUDGET;
  if (!(budget >= 1)) throw new RangeError(`rowBudget must be at least 1, not ${String(options.rowBudget)}.`);
  const session = createSession();
  const docs = new Map<string, HeldDoc>();
  const shared: Shared = {
    registry: new DocumentRegistry(session),
    budget,
    usage: options.usage,
    usageReposts: options.usageReposts,
    registers: options.registers ?? createRegisters(),
    notify: options.notify,
    closed: (doc) => {
      if (docs.get(doc.uri) === doc) docs.delete(doc.uri);
    },
  };
  let disposed = false;
  return {
    async open(bytes, name, uri) {
      if (disposed) throw new Error('This workspace is closed.');
      const id = uri ?? sourceUri(`/${name}`);
      const kind = docKindOf(name);
      if (!kind) {
        throw new Error(
          `${name} is not a file this workspace opens: it opens data dictionaries (.sldd), models (.slx, .mdl), MAT-files (.mat) and projects.`,
        );
      }
      if (docs.has(id)) throw new Error(`${id} is already open in this workspace.`);
      const doc: HeldDoc = (options.editing && editableDoc(shared, id, name, kind, bytes)) || new InPageDoc(shared, id, name, kind, arrayBufferOf(bytes));
      docs.set(id, doc);
      return doc;
    },
    get: (uri) => docs.get(uri),
    async setUsage(usage, usageReposts) {
      if (disposed) return;
      shared.usage = usage;
      shared.usageReposts = usageReposts;
      const open = [...docs.values()];
      for (const doc of open) doc.subscribeReposts();
      await Promise.all(open.map((doc) => doc.refillUsage()));
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const doc of [...docs.values()]) doc.dispose();
      session.removeAll();
    },
  };
}
