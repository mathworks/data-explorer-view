// Copyright 2026 The MathWorks, Inc.
// A dex-tree-table fed by hand from tableData.ts: rows in, lazy children on request, the
// selection out.
//
// Hand wiring, until view connects a table to its data itself (see ../../README.md).
import { mergeChildRows } from 'data-explorer-view/model';
import type { DexTreeTable, TreeTableRow } from 'data-explorer-view/tree-table';
import type { TablePayload } from './tableData';

export interface TableHandlers {
  /** The rows under `nodeId`, which the payload held back. */
  children(nodeId: string): TreeTableRow[];
  select(rowIds: string[]): void;
}

export interface TableHandle {
  setPayload(payload: TablePayload): void;
}

export function wireTable(table: DexTreeTable, handlers: TableHandlers): TableHandle {
  table.expandTopLevel = true;
  table.loading = true;

  function install(rows: TreeTableRow[]): void {
    // The table keeps selected ids a new payload no longer has; drop them and say so.
    const present = new Set(rows.map((r) => r.ID));
    const before = table.selectedRowIds;
    table.rows = rows;
    const kept = before.filter((id) => present.has(id));
    table.selectedRowIds = kept;
    if (kept.length !== before.length) handlers.select(kept);
  }

  table.addEventListener('dex-request-children', (e) => {
    const nodeId = (e as CustomEvent<{ nodeId?: unknown }>).detail?.nodeId;
    if (typeof nodeId !== 'string' || nodeId === '') return;
    const merged = mergeChildRows(table.rows, nodeId, handlers.children(nodeId));
    if (merged) install(merged);
  });

  table.addEventListener('dex-row-selected', (e) => {
    const rowIds = (e as CustomEvent<{ rowIds?: unknown }>).detail?.rowIds;
    handlers.select(Array.isArray(rowIds) ? rowIds : []);
  });

  return {
    setPayload(payload) {
      table.loading = false;
      table.columns = payload.columns;
      table.columnLabels = payload.columnLabels;
      table.columnGroups = payload.columnGroups;
      install(payload.rows);
    },
  };
}
