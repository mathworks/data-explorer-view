// Copyright 2026 The MathWorks, Inc.
//
// open-questions 16 (design: data-explorer-vscode docs/deep-work/2026-10-28-view-split/bug16-design.md),
// on the MAT-file engine. Its Status column is kept by SaveMarks, edit by edit, not by a baseline
// diffed against the tree.
//
//  (A) does not apply: a reload clears the marks (replace). Pinned here; passes today.
//  (B) does, twice, failing today. A save that lands after a newer one leaves the file holding the
//      older document, but SaveMarks.commit of the older snapshot leaves every edit made after that
//      snapshot as the newer save left it, saved: the Status column marks nothing the file lacks
//      (its reference model in saveMarks.test.ts, EveryEdit.commit, does the same). And the engine
//      does not say the save landed behind, which a host whose save point moved to the newer save
//      needs to write again (review169 P1: VS Code shows the tab clean over the older file, and
//      closing it loses the newer edit).
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { buffer, edit, open, topRow, valuesOf, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Two saves of cases.mat, the older to land last: scalarD 42 in the older, 43 in the newer. */
async function twoSaves(): Promise<{ o: Opened; older: ReturnType<Opened['engine']['beginSave']>; newer: ReturnType<Opened['engine']['beginSave']> }> {
  const o = await open('cases.mat');
  edit(o, 'scalarD', 'Value', '42');
  const older = o.engine.beginSave();
  edit(o, 'scalarD', 'Value', '43');
  const newer = o.engine.beginSave();
  return { o, older, newer };
}

describe('MAT-file engine: a save that lands after a newer one (open-questions 16 B, review169 P1)', () => {
  it('saved() says the save landed behind one already landed, so a host whose save point moved can write again', async () => {
    const { o, older, newer } = await twoSaves();
    assert.strictEqual((o.engine.saved as (s: unknown) => unknown)(newer), false, 'the newest save landed in order');
    assert.strictEqual((o.engine.saved as (s: unknown) => unknown)(older), true, 'the older one landed after it: the file is behind');
  });

  it('the Status column marks the newer edit, which the file lacks', async () => {
    const { o, older, newer } = await twoSaves();
    o.engine.saved(newer);
    o.index.saved(newer.at);
    o.engine.saved(older);
    o.index.saved(older.at);
    assert.strictEqual(valuesOf(older.bytes).get('scalarD').Value, '42', 'the file holds the older save');
    assert.strictEqual(o.index.dirty, true, 'and the page reads dirty over it');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, 'Modified', 'scalarD is 43 here and 42 in the file');
  });
});

describe('MAT-file engine: the Status column after the disk changes under a clean document (open-questions 16 A)', () => {
  it('a reload from what the disk now holds marks no variable Modified (passes today: replace clears the marks)', async () => {
    const o = await open('cases.mat');
    const other = await open('cases.mat');
    edit(other, 'scalarD', 'Value', '42');
    const disk = other.save();
    edit(o, 'negD', 'Value', '7');
    assert.strictEqual(topRow(o.view.posts, 'negD').Status, 'Modified');
    o.index.reverted();
    await o.engine.replace(buffer(disk));
    assert.strictEqual(topRow(o.view.posts, 'negD').Status, '', 'the edit was dropped');
    assert.strictEqual(topRow(o.view.posts, 'scalarD').Status, '', 'and what the file now holds is not an edit of this document');
  });
});
