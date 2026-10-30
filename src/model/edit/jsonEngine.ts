// Copyright 2026 The MathWorks, Inc.
//
// Lifted from data-explorer-vscode src/host/SlddTextEditorProvider.ts at c73da3c: what belongs to
// the DOCUMENT rather than to one of its tables (its DocState and openDocs: the view count, where
// the baseline came from, every table's repaint, the file's stamp), with every VS Code call taken
// out and put behind the hooks an editable source is given (hooks.ts). Each table's paint and
// gestures are jsonView.ts. The extension keeps its own copy until its JSON dictionary editor moves
// onto this; keep the two alike (view's CI reports a vscode commit to that file).
//
// A JSON .sldd's TEXT IS THE TRUTH. The document is a TextStore (in the page, createTextStore; in
// the extension, the TextDocument), and every edit is a patch of it: undo, redo, dirty state and
// save are the text's. The tree is read from the text into core's session under the document's
// uri (a DocumentRegistry), and kept in step with it by the tables, which repaint from what each
// change of the text says.
import type { Session } from 'data-explorer-core';
import { uriPathBasename } from '../ids/pathUtil.js';
import type { EditableTableSource, TableView } from '../source/tableSource.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import { parseDetached, type DocumentRegistry } from '../workspace/SlddModel.js';
import type { Notify, TextStore } from './hooks.js';
import { describeSource } from './refusal.js';
import type { Registers } from './registers.js';
import { EntryBaseline, type BaselineSource, type DiskStamp } from './slddBaseline.js';
import { JsonView } from './jsonView.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How a JSON dictionary engine fills a table's Usage column: `fill` before a whole paint and for a
 * fetched row, `fillNow` for a narrow repaint — false when it has no graph to fill from at once,
 * and the rows then go out unfilled with `fill` following them.
 */
export interface JsonUsageFill {
  fill(rows: TreeTableRow[]): Promise<unknown>;
  fillNow(rows: TreeTableRow[]): boolean;
}

/** The file behind the document, for its baseline: what the disk says of it, and holds. */
export interface JsonDisk {
  /** The file's stamp, or null when it cannot be had. */
  stat(): Promise<DiskStamp | null>;
  /** The file's bytes, or null when they cannot be had. */
  read(): Promise<Uint8Array | null>;
}

/** When the Usage column is owed a repaint (a model appeared or went away): a usage repost hub. */
export interface JsonUsageReposts {
  /** `busy` defers the repost while it answers true. */
  subscribe(repost: () => void, busy?: () => boolean): { dispose(): void };
}

/** What a JSON dictionary engine is given: its hooks (hooks.ts), and the document. */
export interface JsonEngineOptions {
  /** The registry the dictionary's tree is read into, under its uri (its session is the engine's). */
  registry: DocumentRegistry;
  /** The uri the document is opened under: its identity, and its tree's srcId. */
  uri: string;
  /** Its name, for what is said of it. Default: the last segment of the uri's path, decoded. */
  name?: string;
  /** The document's text, which is the truth. */
  text: TextStore;
  /** The registers the window's documents share. */
  registers: Registers;
  /** Where a notice the table does not show goes. Default: nowhere. */
  notify?: Notify;
  /** The Usage column. Default: none, the cells as the file has them. */
  usage?: JsonUsageFill;
  /** When the Usage column is owed a repaint. Default: never. */
  usageReposts?: JsonUsageReposts;
  /**
   * The file on disk, for the baseline: of a document opened with unsaved changes, and to tell a
   * reload of a clean document from an edit of it. Default: none, and then neither is known.
   */
  disk?: JsonDisk;
  /** How many rows a whole paint delivers before it holds the rest back. Default: LAZY_ROW_BUDGET. */
  budget?: number;
  /** Called after every repaint of a table, wide or narrow, once its rows are sent (unless the table has its own, JsonTableOptions). */
  changed?: () => void;
  /**
   * The host delivers every whole paint's rows itself, and calls the table's `opened(view)` once
   * they are, with the view it delivered: a repaint's trailer (the drop rules, the clipboard, the
   * clip-mark repaint, `changed`) then waits for that call, as `open()`'s does, and the repaint
   * resolves after it. Each paint's trailer follows its own rows, whatever order they are
   * delivered in (without a view, the oldest paint not yet delivered). The VS Code extension's,
   * which posts the rows and then, in the same run, what follows them and its own after-paint work.
   * Default: false, a repaint's trailer follows its rows at once.
   */
  trailerAfterDelivery?: boolean;
}

/** What one table of the document is given of its own, beside the engine's options. */
export interface JsonTableOptions {
  /**
   * Called after every repaint of this table, wide or narrow, once its rows are sent, in place of
   * the engine's `changed`: for a host whose tables of one document answer to different owners
   * (the VS Code extension's, a provider per tab, each with its own hook).
   */
  changed?: () => void;
}

/** What belongs to the document rather than to one of its tables (the extension's DocState). */
export interface JsonDocState {
  views: number;
  baseline: BaselineSource;
  repaints: Set<() => void>;
  diskStamp: DiskStamp | null;
}

/** The document as its tables reach it: what a table needs of the engine, kept off the engine's own surface. */
export interface JsonDocument {
  readonly uri: string;
  readonly name: string;
  readonly options: JsonEngineOptions;
  readonly registry: DocumentRegistry;
  readonly session: Session;
  readonly text: TextStore;
  readonly baseline: EntryBaseline;
  readonly views: Set<JsonView>;
  describe(text: string): string;
  /** Count one more open table, and answer what the document already knows. */
  openView(): JsonDocState;
  /** Close one table; true when it was the LAST, and the document-scoped teardown is owed. */
  closeView(state: JsonDocState): boolean;
  /** The document's state while any table is open, or null. */
  readonly state: JsonDocState | null;
}

const freshState = (): JsonDocState => ({
  views: 0,
  baseline: { captured: false, pending: false, version: -1, cleanAt: -1 },
  repaints: new Set(),
  diskStamp: null,
});

/** One open JSON dictionary: its text, the tables that show it, and what they share. */
export class JsonEngine {
  /** The uri the document is opened under, which is also its tree's srcId. */
  readonly uri: string;
  /** Its name, as what is said of it names it, and the `meta.path` its tree is registered with. */
  readonly name: string;

  private closed = false;
  private readonly views = new Set<JsonView>();
  /** The Status column's baseline: the file on disk, entry by entry. */
  private readonly baseline = new EntryBaseline();
  /** While any table is open, what they share (forgotten with the last, as the extension forgets it). */
  private docState: JsonDocState | null = null;
  private readonly document: JsonDocument;

  constructor(options: JsonEngineOptions) {
    this.uri = options.uri;
    // The last segment of the uri's path, decoded, as `basename(uri.path)` names a VS Code uri.
    this.name = options.name ?? (uriPathBasename(options.uri) || 'document');
    const engine = this;
    this.document = {
      uri: this.uri,
      name: this.name,
      options,
      registry: options.registry,
      session: options.registry.session,
      text: options.text,
      baseline: this.baseline,
      views: this.views,
      // Core's messages name this source by its id (the uri), which every message shown here
      // spells as the file's name.
      describe: describeSource(this.uri, this.name),
      openView: () => {
        const state = (this.docState ??= freshState());
        state.views++;
        return state;
      },
      closeView: (state) => {
        // Defensive: an untracked table is treated as the last one, so a teardown is never skipped.
        if (this.docState !== state) return true;
        if (--state.views > 0) return false;
        // Forgotten, so the next table captures a fresh baseline rather than trusting a cleared one.
        this.docState = null;
        return true;
      },
      get state() {
        return engine.docState;
      },
    };
  }

  /** Whether `dispose()` has closed it. */
  get disposed(): boolean {
    return this.closed;
  }

  /**
   * The file on disk now holds `text`, which the document's text has moved on from (a save whose
   * bytes were read before the edits since): the Status column is measured from it, as from the
   * file's own bytes of a document opened with unsaved changes. The page's own: a TextDocument's
   * save writes the text as it stands.
   */
  fileHolds(text: string): void {
    const state = this.docState;
    if (!state) return;
    let tree: any;
    try {
      tree = parseDetached(this.name, text);
    } catch {
      return;
    }
    this.baseline.capture(tree);
    state.baseline.captured = true;
    state.baseline.version = -1;
    // No version of the text is the file's now, even one a save that landed before this one made
    // clean: the next repaint keeps this baseline, and does not take one from the text.
    state.baseline.cleanAt = -1;
    for (const repaint of state.repaints) repaint();
  }

  /**
   * A table of the document: an EditableTableSource, until its `dispose()`. Its `locateInText` is
   * where a row's entry is in the text, for a host with a text view to show it (null when it cannot
   * be found, which the table says). `table` is what this table has of its own (its `changed`).
   */
  view(table: JsonTableOptions = {}): EditableTableSource & {
    dispose(): void;
    repaintAll(): Promise<void>;
    opened(view?: TableView): void;
    locateInText(rowId: string): { offset: number; length: number } | null;
  } {
    if (this.closed) throw new Error(`${this.name} is closed.`);
    return new JsonView(this.document, table);
  }

  /** Close the document: every table closes, and the last releases the tree it held. */
  dispose(): void {
    if (this.closed) return;
    this.closed = true;
    for (const view of [...this.views]) view.dispose();
  }
}
