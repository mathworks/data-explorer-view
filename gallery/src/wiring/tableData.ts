// Copyright 2026 The MathWorks, Inc.
// What the table, the inspector and the variable editor show for an open file, built with view's
// model the way the VS Code extension's host builds its messages. DOM-free.
//
// Hand wiring, until view reads files for a table itself (see ../../README.md).
import {
  childRowsMessage,
  COLUMN_GROUPS,
  COLUMN_LABELS,
  COLUMNS,
  findNode,
  LAZY_ROW_BUDGET,
  lazyRowsBanner,
  matrixCellsMessage,
  rowPlannerFor,
  sourceWarnings,
  warningBanner,
  type WarningBanner,
} from 'data-explorer-view/model';
import type { TreeTableRow } from 'data-explorer-view/tree-table';
import type { MatrixCellsAnswer } from 'data-explorer-view/variable-editor';
import type { OpenDocument } from './documents';

export interface TablePayload {
  rows: TreeTableRow[];
  columns: string[];
  columnLabels: Record<string, string>;
  columnGroups: Record<string, string>;
  /** What the parse could not read, and what the plan held back. */
  warnings?: WarningBanner;
}

// The Usage column is filled from a workspace usage graph that only the extension's host
// builds; with none, the column would always be empty.
const GALLERY_COLUMNS = COLUMNS.filter((c) => c !== 'UsedBy');

export function tablePayload(doc: OpenDocument): TablePayload {
  const planned = rowPlannerFor(doc.name).payload(doc.node, LAZY_ROW_BUDGET);
  return {
    rows: planned.rows,
    columns: GALLERY_COLUMNS,
    columnLabels: COLUMN_LABELS,
    columnGroups: COLUMN_GROUPS,
    warnings: lazyRowsBanner(planned.plan, warningBanner(sourceWarnings(doc.node))),
  };
}

/** The rows under a row whose children the payload held back. */
export function childRows(doc: OpenDocument, nodeId: string): { rows: TreeTableRow[]; truncated: number } {
  const { rows, truncated } = childRowsMessage(nodeId, findNode(doc.uri, nodeId), rowPlannerFor(doc.name));
  return { rows, truncated };
}

/** The cells of a variable editor opening on `nodeId`, or why there are none. */
export function matrixCells(doc: OpenDocument, nodeId: string): MatrixCellsAnswer {
  const { matrix, message } = matrixCellsMessage(nodeId, findNode(doc.uri, nodeId));
  // The model's message types `matrix` as possibly null; the editor's answer does not.
  return { nodeId, matrix: matrix ?? undefined, message };
}
