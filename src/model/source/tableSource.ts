// Copyright 2026 The MathWorks, Inc.
//
// What a table shows of a document, and how it answers what the table asks next: the READ half of
// the table's contract with whatever holds the document.
//
// The shapes are those of the VS Code extension's table messages (its host posts them to the
// table's webview), without the `type` envelope: a `TableView` is a `setRows`, `ChildRows` a
// `childRows`, `MatrixPage` a `matrixCells`, an `InspectorView` a `showProps`, and a
// `TableChange` the repaints that follow a first paint. So one table wiring can be fed by a source
// in the page (source/workspace.ts) or by a host across a message channel, and draw the same rows.
//
// Editing (an edit, a paste, a drop, undo) is the other half: EditableTableSource extends this
// interface with one command per gesture, each the extension's editing message without its
// envelope, and its answers arrive as more TableChanges. A read-only source implements this one
// alone.
//
// Types, isEditable, and SourceClosed.
import type { DropFacts } from '../actions/dropFacts.js';
import type { SectionRule } from '../actions/sectionRules.js';
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { MatrixPayload } from '../matrix/matrixPayload.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';
import type { ClipboardMode, DragDescriptor } from './wire.js';

/** What the table shows for a document: its rows, its columns and the banners above them. */
export interface TableView {
  /**
   * The uri the document was opened under. Row ids, link targets and matrix node ids embed the
   * id its tree is registered under, which is this uri, or for a compressed dictionary and a
   * MAT-file `binedit:` + this uri (`srcIdToUriString` turns either back into this).
   */
  docUri: string;
  /**
   * Every row of the first paint, parents before their children. A row whose children the paint
   * held back carries `_lazy`; `TableSource.children` answers it.
   */
  rows: TreeTableRow[];
  /** The column keys, in their default order (`<dex-tree-table>`'s `columns`). */
  columns: string[];
  /** Each column's heading, by key (`columnLabels`). */
  columnLabels: Record<string, string>;
  /** The heading group of the columns that have one, by key (`columnGroups`). */
  columnGroups: Record<string, string>;
  /** Whether the table may edit what it shows. Always false from a read-only source. */
  editable: boolean;
  /**
   * Why the document is shown the way it is, to stay above the table while it is open: for
   * example, that a MAT-file opens for viewing only. Absent when there is nothing to say.
   */
  notice?: string;
  /**
   * What the read could not read, and what the paint held back for `children` to answer. Absent
   * for a whole file shown whole.
   */
  warnings?: WarningBanner;
  /**
   * What the Add gallery offers, where it is not every tile: `{classes}`, the classes the document
   * can take a new entry of (a MAT-file's, from core's MatNode.getAllowedTypes), in no section.
   * Absent: every tile, a dictionary's, each naming its section.
   */
  add?: { classes: readonly string[] };
}

/** The rows under one row whose children a paint held back (`_lazy`). */
export interface ChildRows {
  /** The row asked about, echoed so an answer that arrives after a repaint can be dropped. */
  nodeId: string;
  /**
   * The rows under it, never its own row, parents before children. Empty when it has none after
   * all, or is no longer in the document: the table then stops offering to open it.
   */
  rows: TreeTableRow[];
  /** How many of its children have no row. Always 0 from this package's sources. */
  truncated: number;
}

/**
 * The cells of a matrix the variable editor opens on, or why there are none: exactly one of
 * `matrix` and `message`. What `<dex-variable-editor>`'s `deliver()` takes, as it is.
 */
export type MatrixPage =
  | {
      /** The row's node id the editor asked with (its `_matrix.nodeId`), echoed. */
      nodeId: string;
      /** The matrix's name, class, shape and cells. */
      matrix: MatrixPayload;
      message?: undefined;
    }
  | {
      /** The row's node id the editor asked with, echoed. */
      nodeId: string;
      matrix?: undefined;
      /** Why there is no grid to show: the value is gone, or does not lay out as one. */
      message: string;
    };

/** What the property inspector shows for a selection. */
export interface InspectorView {
  /**
   * The row these properties are of: the first row of the selection. Absent when there is
   * nothing to show: no selection, a section heading first, or a row no longer in the document.
   */
  rowId?: string;
  /** The inspector's groups (`<dex-property-inspector>`'s `groups`); empty when `rowId` is absent. */
  groups: PropertyGroup[];
}

/**
 * What a property inspector follows: each page it should show, as the selection or the document
 * changes, and the cells of a matrix one of its rows describes. A connected table's handle is one
 * (its selection, inspected); `inspectorFeed(port)` is another (the pages a host sends).
 */
export interface InspectorFeed {
  /**
   * Hear each page to show, until the returned function is called. A page with no groups is
   * nothing to show.
   */
  onPage(listener: (view: InspectorView) => void): () => void;
  /** The cells of the matrix an inspector row's `matrix` describes, by its `nodeId`. */
  matrix(nodeId: string): Promise<MatrixPage>;
}

/**
 * What the clipboard holds, as every table is told whenever it changes: payload-free, the facts a
 * paste target judges each entry by, the section each was taken from (`sectionName`, '' for a
 * MAT-file's variable), and the document (`sourceDocUri`).
 */
export interface ClipboardStatus {
  canPaste: boolean;
  mode: ClipboardMode | null;
  items: (DropFacts & { sectionName?: string })[];
  sourceDocUri?: string;
}

/**
 * Something that changed what the table shows, after `open()`: the repaints a source sends its
 * subscribers.
 *
 * - `replaceAll`: the whole table, again, as `open()` now answers it (the file was read again).
 * - `updateEntry`: the rows of one entry, the entry's row first and then everything under it,
 *   replace the rows of the entry the table shows as `entryRowId`; no rows removes the entry.
 * - `insertEntry`: the rows of a new entry join the section `sectionRowId`, before the entry row
 *   `beforeRowId`, or last in the section without one.
 * - `error`: what went wrong, for the banner; the rows on screen stay (the file could not be read
 *   again, for example).
 *
 * A read-only source sends `replaceAll` and `error`; the entry-scoped two come from editing, and
 * so do the rest, which an editable source sends as the editing messages' answers (wire.ts):
 *
 * - `sectionRules`: what each section of `docUri` takes, for the table to predict a drop or a paste.
 * - `clipboard`: what the clipboard now holds, told to every table.
 * - `drag`: the drag in flight, told to every table, or null when it ends.
 * - `select`: the rows an edit made the selection (a rename's row, a delete's survivor, what a
 *   paste added).
 * - `beginRename`: open the Name editor on a row the Add gallery just created.
 * - `invalid`: a cell edit refused, with the value refused and the one the cell keeps.
 * - `refused`: a gesture refused before it changed anything, titled by the gesture.
 * - `editText`: the answer to `requestEditText`: the whole text of the row's Value, or null and why.
 *
 * A table that does not edit ignores the editing kinds.
 */
export type TableChange =
  | { kind: 'replaceAll'; view: TableView }
  | { kind: 'updateEntry'; entryRowId: string; rows: TreeTableRow[] }
  | { kind: 'insertEntry'; sectionRowId: string; beforeRowId?: string; rows: TreeTableRow[] }
  | { kind: 'error'; message: string }
  | { kind: 'sectionRules'; docUri: string; rules: SectionRule[] }
  | { kind: 'clipboard'; state: ClipboardStatus }
  | { kind: 'drag'; descriptor: DragDescriptor | null }
  | { kind: 'select'; rowIds: string[] }
  | { kind: 'beginRename'; rowId: string }
  | { kind: 'invalid'; reason: string; invalidValue: unknown; previousValue: unknown }
  | { kind: 'refused'; title: string; reason: string }
  | { kind: 'editText'; rowId: string; text: string | null; reason?: string };

/**
 * One document, as a table shows it: what it shows first, the answers it gives as the user opens
 * rows, values and the inspector, and what it says when the document changes.
 *
 * Every answer but `open()` is total: it resolves, with an empty answer or a reason, for a row
 * that is gone or never was. `open()` rejects when the document cannot be shown, with the message
 * a table's error banner shows ("Failed to parse plant.sldd: …").
 */
export interface TableSource {
  /** The whole table, as it is now. */
  open(): Promise<TableView>;
  /** The rows under `rowId`, a row the paint held back (`_lazy`). */
  children(rowId: string): Promise<ChildRows>;
  /** The cells of the matrix a row's `_matrix` (or an inspector row's `matrix`) describes, by its `nodeId`. */
  matrix(nodeId: string): Promise<MatrixPage>;
  /**
   * What the property inspector shows for a table's selection: the properties of its FIRST row,
   * or nothing when that row is a section heading, or none is selected. A row id alone is a
   * selection of one.
   */
  inspect(selection: string | readonly string[]): Promise<InspectorView>;
  /** Hear every change after `open()`, until the returned function is called. */
  subscribe(listener: (change: TableChange) => void): () => void;
  /**
   * The answer of the last `open()` has been shown: a table painted it (connectTable), or a channel
   * posted it (serveTable). A source that has more to say after a paint (an editable one's drop
   * rules and clipboard) says it now, as changes, so that they arrive after the rows they are about.
   * What it says between the ask and this reaches the table after both, in the order it was said.
   * Optional; a read-only source has nothing to add.
   */
  opened?(): void;
}

/** A committed cell edit, a rename among them (`columnId` 'Name'): what the cell held, and what it now says. */
export interface CellEdit {
  rowId: string;
  columnId: string;
  oldValue: string;
  newValue: string;
}

/**
 * One new default entry from the Add gallery: the section it goes in (core's key; '' for a
 * MAT-file), the class to create, and whether its Name cell opens for a rename once it is there.
 */
export interface NewEntry {
  section: string;
  className: string;
  rename: boolean;
}

/**
 * A TableSource that also takes edits: one command per gesture, each the editing message of the
 * wire (wire.ts) without its envelope, in the order the user makes them.
 *
 * Every command is fire-and-forget. It returns nothing and promises nothing: what it did arrives
 * through `subscribe`, as the repaints of the entries it changed (`updateEntry`, `insertEntry`,
 * `replaceAll`) and the editing kinds of TableChange (a selection, a refusal, a dialog's reason). A
 * command the document will not take answers with a refusal, not a throw.
 *
 * ONE GESTURE IS ONE CALL, and one undo step: a source that keeps an undo stack pushes one entry
 * per call, however many entries the gesture changed. The call is made as the gesture's message
 * arrives (serveTable hands it on before it awaits anything), so the source sees gestures in the
 * order they were made.
 */
export interface EditableTableSource extends TableSource {
  /** Write a committed cell edit back. */
  edit(edit: CellEdit): void;
  /** Copy the entries of these rows to the clipboard. */
  copy(rowIds: readonly string[]): void;
  /** Cut the entries of these rows: copied, and taken out of this document when they are pasted. */
  cut(rowIds: readonly string[]): void;
  /** Delete these rows. */
  delete(rowIds: readonly string[]): void;
  /** Paste the clipboard into the section of `rowId` ('' for the document itself, where it is one target). */
  paste(rowId: string): void;
  /** Add a child to `rowId`. */
  addChild(rowId: string): void;
  /** Create a new default entry. */
  addEntry(entry: NewEntry): void;
  /** Undo the document's last edit. */
  undo(): void;
  /** Redo the document's last undone edit. */
  redo(): void;
  /** These rows are being dragged: take them into the drag register. */
  dragStart(rowIds: readonly string[]): void;
  /** The drag of this table's rows ended, dropped or not. */
  dragEnd(): void;
  /** The drag was let go over `rowId` ('' for the table's empty body): move or copy what it carries there. */
  drop(rowId: string, mode: 'copy' | 'move'): void;
  /** Ask for the whole text of `rowId`'s Value, answered by an `editText` change. */
  requestEditText(rowId: string): void;
}

/**
 * Why an answer never came: the source was closed while it was being asked (a table of a document
 * that closed during its paint). Whoever relays a source's answers (serveTable, connectTable) says
 * nothing of it, as there is no one left to tell.
 */
export class SourceClosed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceClosed';
  }
}

/**
 * Whether `err` is a SourceClosed. By its name, not `instanceof`, as serveTable tells one: the serve
 * entry loads no module of the model, this one included.
 */
export const isSourceClosed = (err: unknown): boolean => (err as { name?: unknown } | null)?.name === 'SourceClosed';

/** The commands an EditableTableSource takes, by name. */
const COMMANDS = [
  'edit',
  'copy',
  'cut',
  'delete',
  'paste',
  'addChild',
  'addEntry',
  'undo',
  'redo',
  'dragStart',
  'dragEnd',
  'drop',
  'requestEditText',
] as const satisfies readonly (keyof EditableTableSource)[];

/**
 * Whether `source` takes edits: it has every command of an EditableTableSource. Whether its
 * table may edit what it shows now is the view's `editable`, which can be false for a source that
 * takes edits (a MAT-file opened for viewing only).
 */
export function isEditable(source: TableSource): source is EditableTableSource {
  const commands = source as unknown as Record<string, unknown>;
  return COMMANDS.every((name) => typeof commands[name] === 'function');
}
