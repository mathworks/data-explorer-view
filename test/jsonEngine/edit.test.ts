// Copyright 2026 The MathWorks, Inc.
//
// The JSON dictionary engine's own cases: an edit patches the entry's span of the text and nothing
// else, paints before it writes, and is confirmed by its echo; the text's undo and redo bring the
// table back narrowly; a change made by another writer of the text is followed, and one made while
// a table is painted reaches it after its rows; a save clears the Modified marks, and a reload
// measures them from the file again.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { entryNames, entryRow, open, settle, tableOf, viewOf, WORKSPACE_PARAMS } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const rowOf = (posts: any[], name: string): any => tableOf(posts).find((r) => r.parent?.startsWith('section:') && r.Name?.label === name);

describe('JSON dictionary engine: edit, undo, save', () => {
  it('a value edit writes its entry span and nothing else, painted before the write lands', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const before = o.text.text;
    const gravity = entryRow(o.view.posts, 'gravity');
    const from = o.view.posts.length;
    o.view.send({ type: 'edit', rowId: gravity.ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    // The paint is in this run; the text moves a turn later.
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.8', 'painted at once');
    assert.strictEqual(o.text.text, before, 'and the text not yet written');
    await settle();
    assert.notStrictEqual(o.text.text, before);
    assert.strictEqual(o.text.dirty, true);
    // Only the entry changed: what is before its span and after it is as it was.
    const at = before.indexOf('"name": "gravity"');
    const head = before.slice(0, before.lastIndexOf('{', at));
    assert.ok(o.text.text.startsWith(head), 'everything before the entry is as it was');
    assert.strictEqual(o.view.posts.slice(from).filter((p) => p.type === 'setRows').length, 0, 'no wide repaint');
    assert.deepStrictEqual(o.view.posts.slice(from).filter((p) => p.type === 'error'), []);
  });

  it("undo restores the text byte for byte and the table narrowly; redo puts the edit back", async () => {
    const o = await open(WORKSPACE_PARAMS);
    const before = o.text.text;
    const gravity = entryRow(o.view.posts, 'gravity');
    o.view.send({ type: 'edit', rowId: gravity.ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await settle();
    const edited = o.text.text;
    const from = o.view.posts.length;
    await o.undo();
    assert.strictEqual(o.text.text, before);
    assert.strictEqual(o.text.dirty, false, 'back at the file');
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.81');
    assert.strictEqual(o.view.posts.slice(from).filter((p) => p.type === 'setRows').length, 0, 'narrowly');
    await o.redo();
    assert.strictEqual(o.text.text, edited);
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.8');
  });

  it('a change another writer makes to one entry is followed narrowly', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const at = o.text.text.indexOf('"name": "gravity"');
    const value = o.text.text.indexOf('9.81', at);
    const from = o.view.posts.length;
    assert.strictEqual(await o.type(value, 4, '9.7'), true);
    await settle();
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.7');
    assert.strictEqual(o.view.posts.slice(from).filter((p) => p.type === 'setRows').length, 0);
  });

  it('what the engine says while a table is being painted reaches it after the rows, which it does not undo', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const second = viewOf(o.engine);
    // An edit in another table that lands once the rows are answered and before they are sent: the
    // rows, built before it, are still the answer, and its own rows are said straight away.
    second.send({ type: 'ready' });
    await Promise.resolve();
    o.view.send({ type: 'edit', rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await settle();
    assert.deepStrictEqual(
      second.posts.map((p) => p.type),
      ['setRows', 'sectionRules', 'clipboardState', 'updateEntryRows'],
      'the rows first, what follows them, and the edit after them',
    );
    assert.strictEqual(rowOf(second.posts, 'gravity').Value, '9.8', 'the rows built before the edit do not land over it');
  });

  it('a save clears the Modified marks; a reload from the file measures them from it again', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const gravity = entryRow(o.view.posts, 'gravity');
    o.view.send({ type: 'edit', rowId: gravity.ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await settle();
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Status, 'Modified');
    o.save();
    await settle();
    assert.strictEqual(o.text.dirty, false);
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Status, '', 'saved: the file holds it');
    // Another program writes the original back, and the document reloads it.
    o.disk.write(o.original);
    await o.text.reset(new TextDecoder().decode(o.original));
    await settle();
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Value, '9.81');
    assert.strictEqual(rowOf(o.view.posts, 'gravity').Status, '', 'the file is the baseline again');
    assert.deepStrictEqual(entryNames(o.text.text), o.names());
  });
});
