// Copyright 2026 The MathWorks, Inc.
//
// A MAT-file and a compressed dictionary edited in the page against the VS Code extension's golden
// payloads, editing fields and all. inPage.test.ts holds every in-page source to the goldens with a
// read-only source's fields; here every MAT-file and every compressed (zip) dictionary the
// extension pins is opened in a workspace made with `editing`, on its engine
// (src/model/edit/matEngine.ts, src/model/edit/binaryEngine.ts), and served across a channel as the
// extension's host serves its table. Its first paint must be what the extension's editor of it
// posts, message for message and key for key: the `setRows` with `editable` (and, for a MAT-file,
// the Add gallery's classes), then the drop rules and the clipboard. Its inspector pages, matrices
// and lazy children must be the goldens' too, since the engine answers them itself.
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exceedsTextSyncLimit, isEditableJsonSlddBytes, isZipBytes } from 'data-explorer-core';
import { createWorkspace, isSectionRowId, type TableSource } from '../../src/model/index.js';
import { serveTable } from '../../src/serve/index.js';
import { digestRows, snapshotText } from './snapshotText.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const REPO = resolve(import.meta.dirname, '../..');

/** A dictionary the extension edits: a compressed one, or JSON its table editor takes. */
function editableSldd(bytes: Uint8Array): boolean {
  return isZipBytes(bytes) || (isEditableJsonSlddBytes(bytes) && !exceedsTextSyncLimit(bytes));
}

/** A JSON dictionary: its table is the text table, and the extension's host adds `hasTextView`. */
const isText = (rel: string): boolean => rel.endsWith('.sldd') && !isZipBytes(new Uint8Array(readFileSync(join(REPO, rel))));
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');
const SMALL_BUDGET = 5;

const FIXTURES = readdirSync(SNAPSHOTS)
  .filter((key) => existsSync(join(SNAPSHOTS, key, 'table.json')))
  .map((key) => key.split('__').join('/'))
  .filter((rel) => rel.endsWith('.mat') || (rel.endsWith('.sldd') && editableSldd(new Uint8Array(readFileSync(join(REPO, rel))))))
  .sort();

const snapshotFile = (rel: string, kind: string): string => join(SNAPSHOTS, rel.split('/').join('__'), `${kind}.json`);
const golden = (rel: string, kind: string): any => JSON.parse(readFileSync(snapshotFile(rel, kind), 'utf8'));

/** The messages the first paint posts, served across a channel as the extension serves it. */
async function firstPaint(table: TableSource, text = false): Promise<any[]> {
  const posts: any[] = [];
  let hear: (m: unknown) => void = () => {};
  const stop = serveTable(
    table,
    {
      postMessage: (m) => void posts.push(JSON.parse(JSON.stringify(m))),
      onMessage: (l) => ((hear = l), () => {}),
    },
    // What the extension's host adds to a JSON dictionary's setRows: "Location in Text" has a target.
    text ? { extra: { setRows: () => ({ hasTextView: true }) } } : {},
  );
  hear({ type: 'ready' });
  for (let i = 0; i < 50 && !posts.some((p) => p.type === 'clipboardState' || p.type === 'error'); i++) {
    await new Promise((done) => setTimeout(done, 0));
  }
  stop();
  return posts;
}

/**
 * A paint's messages as JSON text, with a golden's digested rows digested the same way. For a JSON
 * dictionary (`text`), a setRows' keys in the golden's order: the host's own field (hasTextView)
 * goes after the source's, where the extension spells it before `warnings`.
 */
function paintText(posts: any[], want: any[], text = false): string {
  return JSON.stringify(
    posts.map((p, i) => {
      const q = p.type === 'setRows' && want[i]?.rows?.digested ? { ...p, rows: digestRows(p.rows) } : p;
      if (!text || q.type !== 'setRows' || !want[i]) return q;
      const keys = Object.keys(want[i]);
      return Object.fromEntries([...keys.filter((k) => k in q), ...Object.keys(q).filter((k) => !keys.includes(k))].map((k) => [k, q[k]]));
    }),
  );
}

async function keyed(rows: any[], answer: (row: any) => Promise<unknown>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const value = await answer(row);
    if (value === undefined) continue;
    out[row.ID] = value;
  }
  return out;
}

async function withEditable(rel: string, budget: number | undefined, use: (table: TableSource) => Promise<void>): Promise<void> {
  const ws = createWorkspace({ editing: true, ...(budget === undefined ? {} : { rowBudget: budget }) });
  try {
    const name = rel.slice(rel.lastIndexOf('/') + 1);
    const doc = await ws.open(new Uint8Array(readFileSync(join(REPO, rel))), name, `file:///fx/${rel}`);
    expect(doc.editable).toBe(true);
    await use(doc.table);
  } finally {
    ws.dispose();
  }
}

describe("a file edited in the page answers what the extension's editor of it sends", { timeout: 60_000 }, () => {
  it('has the MAT-files and the compressed dictionaries the extension pins', () => {
    expect(FIXTURES.filter((rel) => rel.endsWith('.mat')).length).toBeGreaterThan(10);
    expect(FIXTURES.filter((rel) => rel.endsWith('.sldd')).length).toBeGreaterThan(5);
  });

  for (const rel of FIXTURES) {
    it(rel, async () => {
      await withEditable(rel, undefined, async (table) => {
        const want = golden(rel, 'table');
        const posts = await firstPaint(table, isText(rel));
        expect(paintText(posts, want, isText(rel))).toBe(JSON.stringify(want));

        const view = await table.open();
        const inspector = await keyed(view.rows, async (row) => {
          if (isSectionRowId(row.ID)) return undefined;
          const page = await table.inspect(row.ID);
          return page.rowId === undefined ? undefined : { type: 'showProps', groups: page.groups };
        });
        expect(snapshotText(inspector)).toBe(readFileSync(snapshotFile(rel, 'inspector'), 'utf8'));
        const matrix = await keyed(view.rows, async (row) => {
          if (!row._matrix) return undefined;
          const page = await table.matrix(row._matrix.nodeId);
          return page.matrix
            ? { type: 'matrixCells', nodeId: page.nodeId, matrix: page.matrix }
            : { type: 'matrixCells', nodeId: page.nodeId, message: page.message };
        });
        expect(snapshotText(matrix)).toBe(readFileSync(snapshotFile(rel, 'matrix'), 'utf8'));
      });

      await withEditable(rel, SMALL_BUDGET, async (table) => {
        const want = golden(rel, 'table-lazy');
        const posts = await firstPaint(table, isText(rel));
        expect(paintText(posts, want, isText(rel))).toBe(JSON.stringify(want));
        const view = await table.open();
        const children = await keyed(
          view.rows.filter((row: any) => row._lazy),
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
