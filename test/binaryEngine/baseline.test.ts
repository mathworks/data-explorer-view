// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/twoTabBaseline.test.ts at c73da3c.
//
// What a dictionary open in TWO tables must not lose when one of them closes: its Status column's
// baseline and its cross-document move deleter both belong to the document, not to a table. The
// extension's suite holds its JSON editor to the rule its binary dictionary editor already kept
// (a baseline captured once per document, and both torn down only when the last view closes);
// here the same two cases are asked of view's binary dictionary engine, two views of one engine
// being the extension's two panels of one document. The JSON half waits for the JSON engine (C3).
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { open, PARAMS, viewOf, waitFor, type View } from './harness.js';

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

describe('a binary dictionary open in two tables is one document', () => {
  it('the surviving table keeps its Modified marks when the other one closes', async () => {
    const o = await open(PARAMS);
    const first = o.view;
    assert.notStrictEqual(statusOf(await repaint(first), 'scalarD'), 'Modified', 'nothing is Modified against the on-open baseline');

    const row = lastRows(first).find((r: any) => r.Name?.label === 'scalarD');
    first.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '', newValue: '4242' });
    assert.strictEqual(o.events.length, 1, 'the edit landed');
    assert.strictEqual(statusOf(await repaint(first), 'scalarD'), 'Modified', 'the edited entry is Modified in the table that edited it');

    // A second table of the SAME document must not re-baseline to the edited text.
    const second = viewOf(o.engine);
    assert.strictEqual(statusOf(await repaint(second), 'scalarD'), 'Modified', 'the second table shows the edit as Modified too — one document, one baseline');
    assert.strictEqual(statusOf(await repaint(first), 'scalarD'), 'Modified', 'and opening it did not clear the first table’s marks');

    // Close the first table. The document is still open and still edited.
    first.close();
    assert.strictEqual(statusOf(await repaint(second), 'scalarD'), 'Modified', 'the surviving table still shows the edit as Modified');
    second.close();
  });

  it('a move out of the surviving table can still delete from the source', async () => {
    const registers = createRegisters();
    const o = await open(PARAMS, undefined, { registers });
    const first = o.view;
    const second = viewOf(o.engine);
    await repaint(first);
    await repaint(second);

    // Closing one table must not unregister the DOCUMENT's deleter: it completes the source half of
    // a cross-document move dragged out of the other.
    first.close();
    assert.ok(o.names().includes('negD'), 'the entry to move is there to begin with');
    const result = await registers.deleteFromSource(o.engine.uri, ['negD']);
    assert.deepStrictEqual(result, { removed: true });
    assert.ok(!o.names().includes('negD'), 'the surviving table completed the source-delete half of the move');
    assert.strictEqual(o.events[o.events.length - 1]?.label, 'Move (remove source)');
    second.close();
  });
});
