// Copyright 2026 The MathWorks, Inc.
//
// A source across a message channel answers what it answers beside its table: for every fixture
// the extension's goldens pin, serveTable(in-page source) on one end of a channel and
// messageSource on the other give the same paint, the same children of every deferred row, the
// same cells of every matrix and the same inspector page of every row as the in-page source does
// directly (which inPage.test.ts holds to the goldens). And a reload, and a file that cannot be
// read, reach the far end as they do the near one.
//
// The channel is what a webview's or a worker's is: every message structured-cloned, and delivered
// in a task of its own, in order. Every question of one kind is asked at once, so the answers are
// matched to their questions by the wire alone.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createWorkspace,
  isSectionRowId,
  messageSource,
  type TableChange,
  type TableSource,
} from '../../src/model/index.js';
import { serveTable } from '../../src/serve/index.js';
import { channel } from './channel.js';

const REPO = resolve(import.meta.dirname, '../..');
const SNAPSHOTS = join(import.meta.dirname, '__snapshots__');
const FIXTURES = readdirSync(SNAPSHOTS)
  .filter((key) => existsSync(join(SNAPSHOTS, key, 'table.json')))
  .map((key) => key.split('__').join('/'))
  .sort();

const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** The far end of `near`, through a fresh channel. */
function across(near: TableSource): { far: TableSource; stop: () => void } {
  const [host, client] = channel();
  const unserve = serveTable(near, host);
  const far = messageSource(client);
  return { far, stop: () => (unserve(), far.dispose()) };
}

async function expectSame(near: TableSource, far: TableSource): Promise<void> {
  const view = await near.open();
  expect(asJson(await far.open())).toEqual(asJson(view));
  const rows = view.rows;
  const [children, matrices, pages] = await Promise.all([
    Promise.all(rows.filter((r) => r._lazy).map((r) => Promise.all([near.children(r.ID), far.children(r.ID)]))),
    Promise.all(rows.filter((r) => r._matrix).map((r) => Promise.all([near.matrix(r._matrix!.nodeId), far.matrix(r._matrix!.nodeId)]))),
    Promise.all(rows.map((r) => Promise.all([near.inspect(r.ID), far.inspect(r.ID)]))),
  ]);
  for (const [a, b] of [...children, ...matrices, ...pages]) expect(asJson(b)).toEqual(asJson(a));
  // A selection of several, a section first, and nothing, as the inspector is asked them.
  const section = rows.find((r) => isSectionRowId(r.ID));
  for (const selection of [rows.slice(0, 3).map((r) => r.ID), section ? [section.ID] : [], []]) {
    expect(asJson(await far.inspect(selection))).toEqual(asJson(await near.inspect(selection)));
  }
}

describe('a source across a channel answers as it does beside its table', { timeout: 60_000 }, () => {
  it('has the corpus', () => expect(FIXTURES.length).toBeGreaterThan(60));

  for (const rel of FIXTURES) {
    it(rel, async () => {
      const name = rel.slice(rel.lastIndexOf('/') + 1);
      const bytes = new Uint8Array(readFileSync(join(REPO, rel)));
      for (const options of [{}, { rowBudget: 5 }]) {
        const ws = createWorkspace(options);
        const doc = await ws.open(bytes, name, `file:///fx/${rel}`);
        const { far, stop } = across(doc.table);
        try {
          await expectSame(doc.table, far);
        } finally {
          stop();
          ws.dispose();
        }
      }
    });
  }

  it('carries a reload, and a file that cannot be read, to the far end', async () => {
    const ws = createWorkspace();
    const doc = await ws.open(readFileSync(join(REPO, 'test/fixtures/params.sldd')), 'params.sldd');
    const { far, stop } = across(doc.table);
    const nearHeard: TableChange[] = [];
    const farHeard: TableChange[] = [];
    doc.table.subscribe((c) => nearHeard.push(c));
    far.subscribe((c) => farHeard.push(c));
    await far.open();

    const arrived = () => new Promise((done) => setTimeout(done, 5));
    await doc.reload(readFileSync(join(REPO, 'test/fixtures/chain_leaf.sldd')));
    await arrived();
    await doc.reload(new TextEncoder().encode('{"x": '));
    await arrived();
    expect(farHeard.map((c) => c.kind)).toEqual(['replaceAll', 'error']);
    expect(asJson(farHeard)).toEqual(asJson(nearHeard));
    await expect(far.open()).rejects.toThrow(/^Failed to parse params\.sldd: /);
    stop();
    ws.dispose();
  });
});
