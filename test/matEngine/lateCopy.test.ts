// Copyright 2026 The MathWorks, Inc.
//
// A MAT-file's clipboard is read at paste time (registers.ts's SourceReader): each variable a Cut
// or a Copy took is found again by its origin token — the same node through edits and a rename —
// and pasted as it is then, as the Data Explorer in MATLAB resolves its clipboard. A
// variable deleted in between is named and not pasted, and closing the file empties a clipboard
// taken from it.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { buffer, emptyMat, errorsIn, fixture, namesOf, open, shownCells, tableOf, variableOf, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

function windowOf() {
  const registers = createRegisters();
  const session = createSession();
  return {
    registers,
    source: () => open('gains.mat', fixture('pv_basic.mat'), { as: 'gains.mat', registers, session }),
    target: () => open('other.mat', emptyMat(), { as: 'other.mat', registers, session }),
  };
}

const rowOf = (tab: Opened, name: string): any => {
  const row = tableOf(tab.view.posts).find((r) => r.parent == null && r.Name?.label === name);
  assert.ok(row, `the table has a row for "${name}"`);
  return row;
};

/** Send a gesture and wait for its edit, or its word. */
async function gesture(tab: Opened, msg: Record<string, unknown>): Promise<string[]> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${String(msg.type)} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
  return errorsIn(tab.view.posts);
}

/** A value edit or a rename of the variable `name`, as the table sends one. */
const editOf = (tab: Opened, name: string, columnId: string, newValue: string) => ({
  type: 'edit',
  rowId: rowOf(tab, name).ID,
  columnId,
  oldValue: '',
  newValue,
});

const valueOf = (tab: Opened, name: string): string => {
  const variable = variableOf(tab, name);
  assert.ok(variable, `${name} is in the file`);
  return shownCells(variable)['.']!.Value!;
};

describe('a MAT-file clipboard, read at paste time', () => {
  it('a Cut, an edit of the cut variable, then a paste moves the edited value', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'cut', rowIds: [rowOf(source, 'x').ID] });
    assert.deepStrictEqual(await gesture(source, editOf(source, 'x', 'Value', '42')), []);
    const target = await w.target();
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: '' }), []);
    assert.strictEqual(valueOf(target, 'x'), '42', 'the value typed after the Cut is the one pasted');
    await waitFor('the original to leave the source', () => !namesOf(source).includes('x'));
  });

  it('a variable renamed after the Copy is pasted under its new name', async () => {
    const w = windowOf();
    const source = await w.source();
    const before = valueOf(source, 'x');
    source.view.send({ type: 'copy', rowIds: [rowOf(source, 'x').ID] });
    assert.deepStrictEqual(await gesture(source, editOf(source, 'x', 'Name', 'x0')), []);
    const target = await w.target();
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: '' }), []);
    assert.deepStrictEqual(namesOf(target), ['x0']);
    assert.strictEqual(valueOf(target, 'x0'), before);
  });

  it('a variable deleted after the Copy is not pasted, and the paste says so', async () => {
    const w = windowOf();
    const source = await w.source();
    source.view.send({ type: 'copy', rowIds: [rowOf(source, 'x').ID] });
    await gesture(source, { type: 'delete', rowIds: [rowOf(source, 'x').ID] });
    const target = await w.target();
    const edits = target.events.length;
    assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: '' }), ['Nothing to paste: "x" is no longer in gains.mat.']);
    assert.strictEqual(target.events.length, edits);
    assert.deepStrictEqual(namesOf(target), []);
  });

  it('a Copy, then the file read again from disk, then a paste reads the variable from the file as it is now', async () => {
    const w = windowOf();
    const source = await w.source();
    // What the disk holds after an outside writer (MATLAB) set x to 42 and saved.
    const outside = await open('gains.mat', fixture('pv_basic.mat'), { as: 'outside.mat' });
    await gesture(outside, editOf(outside, 'x', 'Value', '42'));
    const written = outside.save();
    for (const mode of ['copy', 'cut']) {
      source.view.send({ type: mode, rowIds: [rowOf(source, 'x').ID] });
      await source.engine.replace(buffer(written));
      const target = await w.target();
      assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: '' }), [], mode);
      assert.strictEqual(valueOf(target, 'x'), '42', `${mode}: the variable as the file holds it now`);
    }
    await waitFor('the cut to take x out of the source', () => !namesOf(source).includes('x'));
  });

  it('closing the file empties a clipboard taken from it, Copy or Cut', async () => {
    for (const mode of ['copy', 'cut']) {
      const w = windowOf();
      const source = await w.source();
      source.view.send({ type: mode, rowIds: [rowOf(source, 'x').ID] });
      assert.strictEqual(w.registers.getClipboard()?.mode, mode);
      source.view.close();
      assert.strictEqual(w.registers.getClipboard(), null, `the ${mode} went with the file`);
      const target = await w.target();
      assert.deepStrictEqual(await gesture(target, { type: 'paste', rowId: '' }), ['Nothing to paste — the clipboard is empty.']);
      assert.deepStrictEqual(namesOf(target), []);
    }
  });
});
