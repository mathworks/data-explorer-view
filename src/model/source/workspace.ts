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
// built by the same functions from the same route (readDocument.ts), read-only.
import { createSession } from 'data-explorer-core';
import { binaryEditSrcId } from '../ids/srcId.js';
import { InspectorSelection } from '../inspector/inspectorSelection.js';
import { buildPropertyGroups } from '../inspector/piBuilder.js';
import { matrixCellsMessage } from '../matrix/matrixRequest.js';
import { childRowsMessage } from '../rows/childRequest.js';
import { LAZY_ROW_BUDGET, lazyRowsBanner } from '../rows/lazyRows.js';
import { sourceWarnings, warningBanner } from '../rows/parseWarnings.js';
import { COLUMNS, COLUMN_GROUPS, COLUMN_LABELS } from '../rows/rowBuilder.js';
import { rowPlannerFor } from '../rows/rowPlanner.js';
import { DocumentRegistry } from '../workspace/SlddModel.js';
import { docKindOf, readDocument, type DocKind, type Reading } from './readDocument.js';
import { sourceUri } from './sourceUri.js';
import type { ChildRows, InspectorView, MatrixPage, TableChange, TableSource, TableView } from './tableSource.js';

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
}

/** One open document. */
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
  /** What its table shows, and how it answers. */
  readonly table: TableSource;
  /**
   * The file changed: read `bytes` in place of what it held. The table's subscribers hear the
   * outcome: a `replaceAll` with the new paint, or an `error` saying why the file could not be
   * read (and `open()` then rejects with it).
   */
  reload(bytes: ArrayBuffer | Uint8Array): Promise<void>;
  /** Close it: its tree leaves the session, and its table answers nothing more. */
  dispose(): void;
}

/** The documents a page has open. */
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
  closed(doc: InPageDoc): void;
}

class InPageDoc implements Doc {
  readonly table: TableSource;
  /** The current read, or undefined when it failed (`failure` says why) or the document is closed. */
  private reading: Reading | undefined;
  private failure = '';
  /** The current read's paint, once built, or why it could not be. */
  private painted: TableView | Error | undefined;
  private readonly listeners = new Set<(change: TableChange) => void>();
  private disposed = false;

  constructor(
    private readonly shared: Shared,
    readonly uri: string,
    readonly name: string,
    readonly kind: DocKind,
    bytes: ArrayBuffer,
  ) {
    this.read(bytes);
    this.table = {
      open: async () => this.open(),
      children: async (rowId) => this.children(rowId),
      matrix: async (nodeId) => this.matrix(nodeId),
      inspect: async (selection) => this.inspect(selection),
      subscribe: (listener) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
      },
    };
  }

  async reload(bytes: ArrayBuffer | Uint8Array): Promise<void> {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    this.read(arrayBufferOf(bytes));
    if (this.kind === 'project') return;
    let change: TableChange;
    try {
      change = { kind: 'replaceAll', view: this.open() };
    } catch (err) {
      change = { kind: 'error', message: messageOf(err) };
    }
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

  private open(): TableView {
    if (this.disposed) throw new Error(`${this.name} is closed.`);
    const r = this.reading;
    if (!r) throw new Error(this.failure);
    if (!this.painted) {
      try {
        const planned = r.planner.payload(r.node, this.shared.budget, r.paint);
        const notice = r.notice();
        const warnings = r.banner(lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(r.node))));
        this.painted = {
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
        this.painted = new Error(r.paintFailed(err));
      }
    }
    if (this.painted instanceof Error) throw this.painted;
    return this.painted;
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

  private children(rowId: string): ChildRows {
    const r = this.reading;
    const { nodeId, rows, truncated } = childRowsMessage(rowId, this.find(rowId), r?.planner ?? rowPlannerFor(this.name), r?.fetch);
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
  const docs = new Map<string, InPageDoc>();
  const shared: Shared = {
    registry: new DocumentRegistry(session),
    budget,
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
      const doc = new InPageDoc(shared, id, name, kind, arrayBufferOf(bytes));
      docs.set(id, doc);
      return doc;
    },
    get: (uri) => docs.get(uri),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const doc of [...docs.values()]) doc.dispose();
      session.removeAll();
    },
  };
}
