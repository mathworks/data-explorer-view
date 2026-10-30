// Copyright 2026 The MathWorks, Inc.
//
// open-questions 16 (design: data-explorer-vscode docs/deep-work/2026-10-28-view-split/bug16-design.md),
// failing today. The binary dictionary engine's Status column says whether an entry differs from the
// file on disk. Two ways it says otherwise:
//
//  (A) A reload of a clean document from what the disk now holds (the watcher's reload of an outside
//      change, or a revert onto a file changed outside) keeps the baseline the document was opened or
//      last saved with (applyDisk replaces the chunk and repaints, but never re-baselines), so every
//      entry the outside change touched reads Modified until the next save, though nothing is unsaved.
//  (B) A save that lands after a newer one leaves the file holding the older document (VS Code cancels
//      the first save's token but lets its write finish; in a page, any two saves). D44 gives the next
//      save the keys it needs, but the Status column is re-baselined from the chunk as it stands, the
//      newer document, so it marks nothing that the file lacks; and the engine does not say the save
//      landed behind, which a host whose save point moved to the newer save needs to write again
//      (review169 P1: the tab reads clean over the older file, and closing it loses the newer edit).
//      The same baseline also misses an edit that lands on a single save's write.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { entryRow, open, PARAMS, waitFor, type Opened, type View } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The rows of the latest whole paint `view` received. */
const lastRows = (view: View): any[] => view.posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];

/** The Status cell of the top-level entry row named `name`. */
function statusOf(rows: any[], name: string): unknown {
  const row = rows.find((r: any) => r.Name?.label === name && String(r.parent ?? '').startsWith('section:'));
  assert.ok(row, `the table has a row for "${name}"`);
  return row.Status;
}

/** A whole repaint of this view, and the rows it painted. */
async function repaint(view: View): Promise<any[]> {
  view.posts.length = 0;
  view.send({ type: 'ready' });
  await waitFor('a whole-table paint', () => view.posts.some((m) => m.type === 'setRows'));
  return lastRows(view);
}

/** An edit of `name`'s Value through the table, as the table makes one. */
function setValue(o: Opened, name: string, value: string): void {
  const row = entryRow(o.view.posts, name);
  o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: String(row.Value ?? ''), newValue: value });
}

/** PARAMS as another editor saved it with `name`'s Value set to `value`: what the disk holds after an outside change. */
async function changedOutside(name: string, value: string): Promise<Uint8Array> {
  const other = await open(PARAMS);
  setValue(other, name, value);
  return other.save();
}

describe('binary dictionary engine: the Status column after the disk changes under a clean document (open-questions 16 A)', () => {
  it('a reload from what the disk now holds marks no entry Modified', async () => {
    const o = await open(PARAMS);
    assert.notStrictEqual(statusOf(await repaint(o.view), 'gravity'), 'Modified', 'nothing differs from the file on open');
    const disk = await changedOutside('gravity', '9.7');
    // The watcher's reload of a clean document (diskFollow), and VS Code marking it clean.
    o.engine.replace(disk);
    o.index.reverted();
    assert.strictEqual(o.index.dirty, false);
    assert.notStrictEqual(statusOf(await repaint(o.view), 'gravity'), 'Modified', 'the document holds what the file does: nothing differs from it');
  });

  it('a revert onto a file changed outside marks no entry Modified', async () => {
    const o = await open(PARAMS);
    setValue(o, 'scalarD', '4242');
    assert.strictEqual(statusOf(await repaint(o.view), 'scalarD'), 'Modified');
    const disk = await changedOutside('gravity', '9.7');
    // Revert: VS Code marks the document clean, and the provider reads the file as it now is.
    o.index.reverted();
    o.engine.replace(disk);
    const rows = await repaint(o.view);
    assert.notStrictEqual(statusOf(rows, 'scalarD'), 'Modified', 'the edit was dropped');
    assert.notStrictEqual(statusOf(rows, 'gravity'), 'Modified', 'and what the file now holds is not an edit of this document');
  });
});

describe('binary dictionary engine: a save that lands after a newer one (open-questions 16 B, review169 P1)', () => {
  /** Two saves, the older landing last, as D44's own case: the file then holds gravity 9.7, the document 9.6. */
  async function landedBehind(): Promise<{ o: Opened; older: ReturnType<Opened['engine']['beginSave']>; newer: ReturnType<Opened['engine']['beginSave']> }> {
    const o = await open(PARAMS);
    setValue(o, 'gravity', '9.7');
    const older = o.engine.beginSave();
    setValue(o, 'gravity', '9.6');
    const newer = o.engine.beginSave();
    return { o, older, newer };
  }

  it('the Status column is measured from the file it wrote, which lacks the newer edit', async () => {
    const { o, older, newer } = await landedBehind();
    o.engine.saved(newer);
    o.index.saved(newer.at);
    o.engine.saved(older);
    o.index.saved(older.at);
    assert.strictEqual(o.index.dirty, true, 'the file is older than the document');
    assert.strictEqual(statusOf(await repaint(o.view), 'gravity'), 'Modified', 'gravity is 9.6 here and 9.7 in the file');
  });

  it('saved() says the save landed behind one already landed, so a host whose save point moved can write again', async () => {
    const { o, older, newer } = await landedBehind();
    assert.strictEqual((o.engine.saved as (s: unknown) => unknown)(newer), false, 'the newest save landed in order');
    assert.strictEqual((o.engine.saved as (s: unknown) => unknown)(older), true, 'the older one landed after it: the file is behind');
  });

  it('an edit that lands on a save’s write stays Modified until a save writes it', async () => {
    // One save, and an edit on its await: the save's bytes lack it. The extension's saveSettled
    // writes again; until a round does (and in a page, until the next save), the row must say so.
    const o = await open(PARAMS);
    setValue(o, 'gravity', '9.7');
    const save = o.engine.beginSave();
    setValue(o, 'scalarD', '4242');
    o.engine.saved(save);
    o.index.saved(save.at);
    const rows = await repaint(o.view);
    assert.strictEqual(statusOf(rows, 'scalarD'), 'Modified', 'the file lacks it');
    assert.notStrictEqual(statusOf(rows, 'gravity'), 'Modified', 'the save wrote it');
  });
});
