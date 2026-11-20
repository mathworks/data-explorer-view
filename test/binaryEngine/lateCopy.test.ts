// Copyright 2026 The MathWorks, Inc.
//
// A compressed-binary dictionary's clipboard is read at paste time (registers.ts's SourceReader):
// what a Cut or a Copy took is pasted as it is when the paste lands, so an edit made in between is
// what moves or is copied, as the Data Explorer in MATLAB resolves its clipboard. An entry deleted
// in between is not pasted and is named, and closing the dictionary empties a clipboard taken from
// it. The bug behind it: a Cut, an edit of the cut entry, a paste — the paste wrote the value from
// the moment of the Cut and removed the edited original, so the edit was in neither place.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { entryOf, entryRow, errorsIn, open, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The edit bash's MATLAB-written binary dictionary: somewhere a paste can land, holding no gravity. */
const VALUES = 'test-integration/fixtures/editbash/values_binary.sldd';

/** A window: one session and one set of registers for every document a case opens. */
function windowOf() {
  const registers = createRegisters();
  const session = createSession();
  return {
    registers,
    source: () => open('test-integration/fixtures/sldd/params_binary.sldd', undefined, { as: 'late_src.sldd', registers, session }),
    target: () => open(VALUES, undefined, { as: 'late_dst.sldd', registers, session }),
  };
}

/** Send a gesture to a view and wait for its edit, or its word. */
async function gesture(tab: Opened, msg: Record<string, unknown>): Promise<string[]> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${String(msg.type)} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
  return errorsIn(tab.view.posts);
}

/** The Value cell of the document's entry `name`, as its table shows it. */
function valueOf(tab: Opened, name: string): string {
  const entry = entryOf(tab.model(), name);
  assert.ok(entry, `${name} is in the document`);
  const cell = entry.toRow().Value;
  return String(cell && typeof cell === 'object' ? (cell.text ?? '') : cell);
}

const editValue = (tab: Opened, name: string, oldValue: string, newValue: string) =>
  gesture(tab, { type: 'edit', rowId: entryRow(tab.view.posts, name).ID, columnId: 'Value', oldValue, newValue });

const rename = (tab: Opened, name: string, newValue: string) =>
  gesture(tab, { type: 'edit', rowId: entryRow(tab.view.posts, name).ID, columnId: 'Name', oldValue: name, newValue });

/** Paste into the target's Design Data, and wait for a cut's move to finish. */
async function pasteInto(w: ReturnType<typeof windowOf>, target: Opened): Promise<string[]> {
  const said = await gesture(target, { type: 'paste', rowId: 'section:design' });
  await new Promise((resolve) => setTimeout(resolve, 20));
  return said;
}

describe('a binary dictionary clipboard, read at paste time', () => {
  it('a Cut, an edit of the cut entry, then a paste moves the edited value', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'cut', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    assert.deepStrictEqual(await editValue(source, 'gravity', '9.81', '9.8'), []);
    const target = await w.target();
    assert.deepStrictEqual(await pasteInto(w, target), []);
    assert.strictEqual(valueOf(target, 'gravity'), '9.8', 'the value typed after the Cut is the one pasted');
    await waitFor('the original to leave the source', () => !source.names().includes('gravity'));
    assert.strictEqual(w.registers.getClipboard(), null, 'the cut is spent');
  });

  it('a Copy, an edit, then a paste copies the edited value, and the source keeps it', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'copy', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    await editValue(source, 'gravity', '9.81', '9.8');
    const target = await w.target();
    assert.deepStrictEqual(await pasteInto(w, target), []);
    assert.strictEqual(valueOf(target, 'gravity'), '9.8');
    assert.strictEqual(valueOf(source, 'gravity'), '9.8');
    assert.strictEqual(w.registers.getClipboard()?.mode, 'copy', 'a copy stays for the next paste');
  });

  it('an entry renamed after the Cut moves under its new name', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'cut', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    assert.deepStrictEqual(await rename(source, 'gravity', 'g0'), []);
    const target = await w.target();
    assert.deepStrictEqual(await pasteInto(w, target), []);
    assert.strictEqual(valueOf(target, 'g0'), '9.81');
    assert.ok(!entryOf(target.model(), 'gravity'), 'nothing lands under the old name');
    await waitFor('the renamed original to leave the source', () => !source.names().includes('g0'));
  });

  it('an entry deleted after the Copy is not pasted, and the paste says so', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'copy', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    await gesture(source, { type: 'delete', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    const target = await w.target();
    const before = target.events.length;
    assert.deepStrictEqual(await pasteInto(w, target), ['Nothing to paste: "gravity" is no longer in late_src.sldd.']);
    assert.strictEqual(target.events.length, before, 'nothing was pasted');
    assert.ok(!entryOf(target.model(), 'gravity'));
    assert.strictEqual(w.registers.getClipboard(), null, 'nothing is left on the clipboard');
  });

  it('closing the dictionary empties a clipboard taken from it, Copy or Cut', async () => {
    for (const mode of ['copy', 'cut']) {
      const w = windowOf();
      const source = await w.source();
      source.view.send({ type: mode, rowIds: [entryRow(source.view.posts, 'gravity').ID] });
      assert.strictEqual(w.registers.getClipboard()?.mode, mode);
      source.view.close();
      assert.strictEqual(w.registers.getClipboard(), null, `the ${mode} went with the dictionary`);
      const target = await w.target();
      const before = target.events.length;
      assert.deepStrictEqual(await pasteInto(w, target), ['Nothing to paste — the clipboard is empty.']);
      assert.strictEqual(target.events.length, before);
      assert.ok(source.names().includes('gravity'), 'and the source keeps its entry');
    }
  });
});
