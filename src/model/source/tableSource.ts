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
// Editing (an edit, a paste, a drop, undo) is the other half, and comes as an extension of this
// interface: a read-only source implements this one alone.
//
// Types only.
import type { WarningBanner } from '../rows/parseWarnings.js';
import type { TreeTableRow } from '../rows/tableRow.js';
import type { MatrixPayload } from '../matrix/matrixPayload.js';
import type { PropertyGroup } from '../inspector/piBuilder.js';

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
 * A read-only source sends `replaceAll` and `error`; the entry-scoped two come from editing.
 */
export type TableChange =
  | { kind: 'replaceAll'; view: TableView }
  | { kind: 'updateEntry'; entryRowId: string; rows: TreeTableRow[] }
  | { kind: 'insertEntry'; sectionRowId: string; beforeRowId?: string; rows: TreeTableRow[] }
  | { kind: 'error'; message: string };

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
}
