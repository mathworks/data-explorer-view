// Copyright 2026 The MathWorks, Inc.
//
// A JSON dictionary's clipboard is read at paste time (registers.ts's SourceReader), from the text
// as it stands then: an edit made between a Cut or a Copy and its paste is what lands, whether it
// was made in the table or in a text view of the file, as the Data Explorer in MATLAB resolves its
// clipboard. An entry deleted in between is named and not pasted, and closing the
// dictionary empties a clipboard taken from it.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { WORKSPACE_DATA, WORKSPACE_PARAMS, chunkOf, entryRow, errorsIn, file, open, settle, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function windowOf() {
  const registers = createRegisters();
  const registry = new DocumentRegistry(createSession());
  return {
    registers,
    source: () => open(WORKSPACE_PARAMS, file(WORKSPACE_PARAMS), { as: 'late_src.sldd', registers, registry }),
    target: () => open(WORKSPACE_DATA, file(WORKSPACE_DATA), { as: 'late_dst.sldd', registers, registry }),
  };
}

/** Send a gesture to a view, and wait for the text to move or the view to say why not. */
async function gesture(tab: Opened, msg: Record<string, unknown>): Promise<string[]> {
  const version = tab.text.version;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${String(msg.type)} to land or be refused`, () => tab.text.version !== version || errorsIn(tab.view.posts).length > 0);
  await settle();
  return errorsIn(tab.view.posts);
}

/** The entry `name` the text holds, as a value of the chunk. */
function entryIn(tab: Opened, name: string): any {
  return ((chunkOf(tab.text.text).entries ?? []) as any[]).find((e) => e.name === name);
}

const description = (tab: Opened, name: string): string => entryIn(tab, name)?.value?._elements?.[0]?._properties?.Description;

describe('a JSON dictionary clipboard, read at paste time', () => {
  it('a Cut, an edit of the cut entry in its table, then a paste moves the edited entry', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'cut', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    const row = entryRow(source.view.posts, 'gravity');
    assert.deepStrictEqual(
      await gesture(source, { type: 'edit', rowId: row.ID, columnId: 'Description', oldValue: 'gravity accel', newValue: 'typed after the cut' }),
      [],
    );
    const target = await w.target();
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: 'section:design' }), []);
    assert.strictEqual(description(target, 'gravity'), 'typed after the cut', 'the edit made after the Cut is the one pasted');
    await waitFor('the original to leave the source', () => !source.names().includes('gravity'));
  });

  it('a Copy, an edit in a text view of the file, then a paste copies the text as it is now', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'copy', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    const at = source.text.text.indexOf('"gravity accel"');
    assert.ok(at > 0, 'the fixture spells the description');
    assert.ok(await source.type(at, '"gravity accel"'.length, '"typed in the text"'), 'the text view edit landed');
    await settle();
    const target = await w.target();
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: 'section:design' }), []);
    assert.strictEqual(description(target, 'gravity'), 'typed in the text');
  });

  it('an entry deleted after the Copy is not pasted, and the paste says so', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'copy', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    await gesture(source, { type: 'delete', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    const target = await w.target();
    const version = target.text.version;
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: 'section:design' }), [
      'Nothing to paste: "gravity" is no longer in late_src.sldd.',
    ]);
    assert.strictEqual(target.text.version, version, 'nothing was pasted');
    assert.strictEqual(w.registers.getClipboard(), null);
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
      assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: 'section:design' }), ['Nothing to paste — the clipboard is empty.']);
      assert.ok(!target.names().includes('gravity'));
    }
  });
});
