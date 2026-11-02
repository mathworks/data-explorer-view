// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// The Description column, on the rows and the columns a host posts (src/model/rows/rowBuilder.ts),
// drawn by a table connectTable feeds. Every host once posted columns that left it out, so no table
// showed a Description, although core says of every row whether its object has one and the table
// had the editor and the not-applicable wash for it (descriptionNotApplicable.test.ts). Now the
// column is in the set every host posts, right after Class, and shown where the default order puts
// it. Ported from data-explorer-vscode test/descriptionColumn.test.ts at 632f6e0, which drove the
// same rows through its webview entry (table-main.ts) rather than through connectTable directly.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DataModel } from 'data-explorer-core';
import { COLUMN_GROUPS, COLUMN_LABELS, COLUMNS, buildRows } from '../src/model/rows/rowBuilder.js';
import { buildMatRows } from '../src/model/rows/matRowBuilder.js';
import type { TableSource } from '../src/model/source/tableSource.js';
import { connectTable, defineTreeTable, type TableHandle } from '../src/widgets/tree-table/index.js';
import type { DexVariableEditor } from '../src/widgets/variable-editor/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

// import.meta.dirname, not a URL against import.meta.url: under happy-dom that resolves against
// the page's location.
const fixture = (...parts: string[]): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, '..', 'test-integration', 'fixtures', ...parts)));
const buffer = (bytes: Uint8Array): ArrayBuffer => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

const FILES: { name: string; rows: () => any[] }[] = [
  {
    name: 'a MAT-file',
    rows: () => buildMatRows(DataModel.addMatSource('desc-col-mat', buffer(fixture('mat', 'pv_basic.mat')), { path: 'pv_basic.mat' })),
  },
  {
    name: 'a dictionary',
    rows: () =>
      buildRows(
        DataModel.addDataSource('desc-col.sldd', JSON.parse(new TextDecoder().decode(fixture('workspace', 'params.sldd'))), { path: 'params.sldd' }),
      ),
  },
];

/** A source that answers with `rows` under the columns every host posts. */
function hostSource(rows: any[]): TableSource {
  return {
    open: async () => ({ docUri: 'file:///fx/d', rows, columns: COLUMNS, columnLabels: COLUMN_LABELS, columnGroups: COLUMN_GROUPS, editable: true }),
    children: async (nodeId) => ({ nodeId, rows: [], truncated: 0 }),
    matrix: async (nodeId) => ({ nodeId, message: 'none' }),
    inspect: async () => ({ groups: [] }),
    subscribe: () => () => {},
  };
}

const noEditor = { show: () => {}, deliver: async () => {}, close: () => {}, remove: () => {} } as unknown as DexVariableEditor;

async function settle(table: any): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise((done) => setTimeout(done, 0));
    await table.updateComplete;
  }
}

let handles: TableHandle[] = [];
afterEach(() => {
  for (const h of handles) h.dispose();
  handles = [];
  document.body.replaceChildren();
});

describe('the Description column', () => {
  it('is posted by the hosts, labelled, after Class', () => {
    expect(COLUMNS).toContain('Description');
    expect(COLUMNS.indexOf('Description')).toBe(COLUMNS.indexOf('Class') + 1);
    expect(COLUMN_LABELS.Description).toBe('Description');
  });

  for (const file of FILES) {
    it(`in ${file.name}: is shown by default`, async () => {
      localStorage.clear();
      const table = document.createElement('dex-tree-table') as any;
      document.body.append(table);
      handles.push(connectTable(table, hostSource(file.rows()), { variableEditor: noEditor }));
      await settle(table);
      expect(table._visibleColumns).toContain('Description');
      const headers = [...table.shadowRoot.querySelectorAll('thead th')].map((th: Element) => th.textContent?.trim() ?? '');
      expect(headers.some((h) => h.startsWith('Description'))).toBe(true);
    });
  }
});
