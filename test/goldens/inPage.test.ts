// Copyright 2026 The MathWorks, Inc.
//
// The in-page sources against the VS Code extension's golden payloads: for every fixture the
// extension pins, a document opened in a workspace here answers what the extension's host sends
// its table for the same file.
//
// THE GOLDENS ARE THE EXTENSION'S. __snapshots__/ is a copy of data-explorer-vscode's
// test/goldens/__snapshots__ (the five kinds a table answers), and the fixtures they were written
// from are at the same paths here; `node scripts/copy-goldens.mjs <vscode checkout>` refreshes
// both. Each fixture is opened under the uri the extension's goldens open it under
// (`file:///fx/<its path>`), so the ids in the rows are the same ids.
//
// What is compared, per fixture (the extension's test/goldens/tables.test.ts writes the same):
//   table.json         `open()`, at the real row budget, against the first paint;
//   table-lazy.json    `open()` at a budget of SMALL_BUDGET rows, so rows are deferred;
//   children-lazy.json `children()` of every row that paint deferred;
//   inspector.json     `inspect()` of every row of the first paint but the section headings;
//   matrix.json        `matrix()` of every row of the first paint that carries `_matrix`.
//
// WHAT IS NORMALISED, and only this: the message envelope. A TableView is a `setRows` with no
// `type`, and a ChildRows, a MatrixPage and an InspectorView are a `childRows`, a `matrixCells` and
// a `showProps` with none; each is wrapped back here in its message's `type` (in the message's key
// order, so an answer kept as a digest compares by hash). And a source here is read-only, so a
// paint differs from an editable view's in exactly its editing fields: `editable` is false, and
// there is no `hasTextView` (the JSON dictionary's "Location in Text"), no `add` (the MAT-file's
// Add gallery), and none of the messages that only arm editing (`sectionRules`, the drop rules,
// and `clipboardState`). Everything else, every row and banner and every id, compares as it is.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { createWorkspace, isSectionRowId, type TableSource, type TableView } from '../../src/model/index.js';
import { digestRows, snapshotText } from './snapshotText.js';

const REPO = resolve(import.meta.dirname, '../..');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');

/** The extension's small budget (tables.test.ts): any fixture with more than a few rows defers. */
const SMALL_BUDGET = 5;

/** Every fixture with a first paint pinned, by its repo path (the key with '__' as '/'). */
const FIXTURES = readdirSync(SNAPSHOTS)
  .filter((key) => existsSync(join(SNAPSHOTS, key, 'table.json')))
  .map((key) => key.split('__').join('/'))
  .sort();

const snapshotFile = (rel: string, kind: string): string => join(SNAPSHOTS, rel.split('/').join('__'), `${kind}.json`);
const golden = (rel: string, kind: string): any => JSON.parse(readFileSync(snapshotFile(rel, kind), 'utf8'));

function bytesOf(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO, rel)));
}

/** A value as JSON carries it: an `undefined` field is absent, as across a message channel. */
const asJson = (value: unknown): any => JSON.parse(JSON.stringify(value));

/**
 * The golden first paint as a read-only source answers it: the `setRows` without its envelope and
 * its editing fields, after asserting that every other message of the paint only arms editing.
 */
function readOnlyPaint(messages: any[]): any {
  const [setRows, ...rest] = messages;
  expect(setRows.type).toBe('setRows');
  expect(rest.map((m) => m.type).filter((t) => t !== 'sectionRules' && t !== 'clipboardState')).toEqual([]);
  const { type: _type, hasTextView: _text, add: _add, ...view } = setRows;
  return { ...view, editable: false };
}

/** `open()` against a golden paint; rows kept as a digest compare by it. */
function expectPaint(view: TableView, messages: any[]): void {
  const want = readOnlyPaint(messages);
  const got = asJson(view);
  if (want.rows?.digested) got.rows = asJson(digestRows(view.rows));
  expect(got).toEqual(want);
}

/** Answers by row id, in row order, refusing two rows under one id (tables.test.ts's `keyed`). */
async function keyed(rows: TableView['rows'], answer: (row: any) => Promise<unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const value = await answer(row);
    if (value === undefined) continue;
    if (Object.hasOwn(out, row.ID)) throw new Error(`two rows answer for ${row.ID}`);
    out[row.ID] = value;
  }
  return out;
}

/**
 * Open `rel` in a workspace of its own, at the default row budget or `budget`, hand its table to
 * `use`, and close the workspace.
 */
async function withSource(rel: string, budget: number | undefined, use: (table: TableSource) => Promise<void>): Promise<void> {
  const ws = createWorkspace(budget === undefined ? {} : { rowBudget: budget });
  try {
    const name = rel.slice(rel.lastIndexOf('/') + 1);
    const doc = await ws.open(bytesOf(rel), name, `file:///fx/${rel}`);
    await use(doc.table);
  } finally {
    ws.dispose();
  }
}

afterAll(() => {
  // The workspaces read into sessions of their own: core's module-level one is never touched.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

describe('in-page sources answer what the extension sends', { timeout: 60_000 }, () => {
  it('has the corpus the extension pins', () => {
    // A floor, as the extension's: a copy that lost its snapshots would pass with none.
    expect(FIXTURES.length).toBeGreaterThan(60);
    for (const ext of ['.sldd', '.slx', '.mdl', '.mat']) expect(FIXTURES.some((rel) => rel.endsWith(ext)), ext).toBe(true);
    for (const rel of FIXTURES) expect(existsSync(join(REPO, rel)), rel).toBe(true);
    // Every route the extension takes is in it: a model, a JSON and a compressed dictionary, a MAT-file.
    const routes = new Set(FIXTURES.map((rel) => readOnlyRoute(rel)));
    expect([...routes].sort()).toEqual(['json', 'mat', 'model', 'zip']);
  });

  for (const rel of FIXTURES) {
    it(rel, async () => {
      await withSource(rel, undefined, async (table) => {
        const view = await table.open();
        expectPaint(view, golden(rel, 'table'));

        // Every row the user can click, as the table reports a click: one row id.
        const inspector = await keyed(view.rows, async (row) => {
          if (isSectionRowId(row.ID)) return undefined;
          const page = await table.inspect(row.ID);
          return page.rowId === undefined ? undefined : { type: 'showProps', groups: page.groups };
        });
        expect(snapshotText(inspector)).toBe(readFileSync(snapshotFile(rel, 'inspector'), 'utf8'));

        // The id the variable editor asks with is the descriptor's, not the row's.
        const matrix = await keyed(view.rows, async (row) => {
          if (!row._matrix) return undefined;
          const page = await table.matrix(row._matrix.nodeId);
          return page.matrix
            ? { type: 'matrixCells', nodeId: page.nodeId, matrix: page.matrix }
            : { type: 'matrixCells', nodeId: page.nodeId, message: page.message };
        });
        expect(snapshotText(matrix)).toBe(readFileSync(snapshotFile(rel, 'matrix'), 'utf8'));
      });

      await withSource(rel, SMALL_BUDGET, async (table) => {
        const view = await table.open();
        expectPaint(view, golden(rel, 'table-lazy'));

        // One at a time and in row order, as a user opening each twisty in turn would ask.
        const children = await keyed(
          view.rows.filter((row) => row._lazy),
          async (row) => {
            const { nodeId, rows, truncated } = await table.children(row.ID);
            return { type: 'childRows', nodeId, rows, truncated };
          },
        );
        expect(snapshotText(children)).toBe(readFileSync(snapshotFile(rel, 'children-lazy'), 'utf8'));
      });
    });
  }
});

/** Which of the extension's routes a fixture takes (its test/goldens/views.ts routeOf). */
function readOnlyRoute(rel: string): string {
  if (rel.endsWith('.mat')) return 'mat';
  if (!rel.endsWith('.sldd')) return 'model';
  const b = bytesOf(rel);
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04 ? 'zip' : 'json';
}
