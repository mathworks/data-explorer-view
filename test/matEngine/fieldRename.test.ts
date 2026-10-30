// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/matFieldRename.test.ts at c73da3c: a
// struct field's rename in the MAT-file editor, run against view's MAT-file engine. A reopen is a
// new engine on the bytes a save handed back, and a Save As the bytes `serialize` hands back.
import * as assert from 'node:assert';
import { createSession, parseMat } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { buffer, nameOf, open, same, tableOf, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The file's records by variable name (the subsystem, which has none, as `''`). */
function recordsOf(bytes: Uint8Array): Map<string, Uint8Array> {
  const parsed: any = parseMat(buffer(bytes));
  return new Map(parsed.records.map((r: any) => [r.name ?? '', r.bytes]));
}

/** Every record of `before` but `changed` (the subsystem included) is in `after` as the bytes it was. */
function keptUntouched(before: Uint8Array, after: Uint8Array, changed: string[]): void {
  const now = recordsOf(after);
  for (const [name, rec] of recordsOf(before)) {
    if (changed.includes(name)) continue;
    assert.ok(now.has(name), `"${name || '(objects)'}" is still in the saved file`);
    assert.ok(same(now.get(name)!, rec), `"${name || '(objects)'}" is the bytes it was read from`);
  }
}

const readBack = (bytes: Uint8Array): any => createSession().addMatSource('readback', buffer(bytes), { path: 'r.mat' });

/** The field names core reads in `bytes` under the variable path `path`. */
function fieldsIn(bytes: Uint8Array, path: string[]): string[] {
  let node: any = readBack(bytes);
  for (const n of path) node = node.children.find((c: any) => c.name === n);
  return node.children.map((c: any) => c.name);
}

/** Each element's field names, in order, of the struct array variable `name` in `bytes`. */
function elementFieldsIn(bytes: Uint8Array, name: string): string[][] {
  return readBack(bytes)
    .children.find((c: any) => c.name === name)
    .children.map((e: any) => e.children.map((f: any) => f.name));
}

const topRow = (posts: any[], name: string): any => {
  const row = tableOf(posts).find((r) => r.parent == null && nameOf(r) === name);
  assert.ok(row, `the table has a row for "${name}"`);
  return row;
};
const rowAt = (posts: any[], path: string[]): any => {
  let row = topRow(posts, path[0]);
  for (const n of path.slice(1)) {
    const next = tableOf(posts).find((r) => r.parent === row.ID && nameOf(r) === n);
    assert.ok(next, `the table has a row for ${path.join('.')}`);
    row = next;
  }
  return row;
};
const childNames = (posts: any[], path: string[]): string[] => {
  const row = rowAt(posts, path);
  return tableOf(posts).filter((r) => r.parent === row.ID).map(nameOf);
};

let reopened = 0;
const reopen = (bytes: Uint8Array) => open('reopened.mat', bytes, { as: `reopened${++reopened}.mat` });

const rename = (o: Opened, path: string[], newValue: string) => {
  const row = rowAt(o.view.posts, path);
  o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: path[path.length - 1], newValue });
};

describe('MAT-file engine: struct field rename', () => {
  it("a field's Name cell is editable, and its rename is one edit that undoes and redoes", async () => {
    const o = await open('cases.mat');
    assert.strictEqual(rowAt(o.view.posts, ['structScalar', 'a']).Name.editable, true);
    rename(o, ['structScalar', 'a'], 'alpha');
    assert.strictEqual(o.events.length, 1, 'one gesture, one edit');
    await waitFor('the renamed row', () => childNames(o.view.posts, ['structScalar']).includes('alpha'));
    assert.deepStrictEqual(childNames(o.view.posts, ['structScalar']), ['alpha', 'b']);
    const select = o.view.posts.filter((p) => p.type === 'selectRows').pop();
    assert.deepStrictEqual(select?.rowIds, [rowAt(o.view.posts, ['structScalar', 'alpha']).ID], 'the renamed row is selected by its new id');
    assert.strictEqual(topRow(o.view.posts, 'structScalar').Status, 'Modified', 'the variable is marked as modified');
    o.events[0].undo();
    await waitFor('the old name back', () => childNames(o.view.posts, ['structScalar']).includes('a'));
    assert.deepStrictEqual(childNames(o.view.posts, ['structScalar']), ['a', 'b']);
    assert.strictEqual(o.index.dirty, false);
    o.events[0].redo();
    await waitFor('the new name again', () => childNames(o.view.posts, ['structScalar']).includes('alpha'));
    assert.strictEqual(o.index.dirty, true);
  });

  it('the rename saves; another tab shows it; Save As writes it; every other variable is as it was', async () => {
    const o = await open('cases.mat');
    rename(o, ['structScalar', 'b'], 'beta');
    await waitFor('the renamed row', () => childNames(o.view.posts, ['structScalar']).includes('beta'));
    const saved = o.save();
    assert.strictEqual(o.index.dirty, false);
    await waitFor('the Status cleared by the save', () => topRow(o.view.posts, 'structScalar').Status !== 'Modified');
    assert.deepStrictEqual(fieldsIn(saved, ['structScalar']), ['a', 'beta']);
    keptUntouched(o.original, saved, ['structScalar']);
    const again = await reopen(saved);
    assert.deepStrictEqual(childNames(again.view.posts, ['structScalar']), ['a', 'beta']);
    rename(o, ['structScalar', 'a'], 'alpha');
    await waitFor('the second rename', () => childNames(o.view.posts, ['structScalar']).includes('alpha'));
    const copy = o.engine.serialize();
    assert.deepStrictEqual(fieldsIn(copy, ['structScalar']), ['alpha', 'beta']);
    keptUntouched(o.original, copy, ['structScalar']);
    assert.deepStrictEqual(fieldsIn(o.disk(), ['structScalar']), ['a', 'beta'], 'the file it came from is as last saved');
  });

  for (const [what, newValue, reason] of [
    ['a name another field of the struct has', 'b', /^Cannot rename "structScalar\.a": 'b' already names another member of structScalar\.$/],
    ['a name MATLAB cannot load', '1x', /^Cannot rename "structScalar\.a": Invalid MATLAB name\. Must start with a letter/],
    ['a keyword', 'end', /^Cannot rename "structScalar\.a": 'end' is a reserved MATLAB keyword\.$/],
    ['an empty name', '', /^Cannot rename "structScalar\.a": Name cannot be empty\.$/],
    ['a name longer than MATLAB takes', 'x'.repeat(64), /maximum length of 63 characters/],
  ] as const) {
    it(`a rename to ${what} is refused in core's words, and records nothing`, async () => {
      const o = await open('cases.mat');
      rename(o, ['structScalar', 'a'], newValue);
      await waitFor('the refusal', () => o.view.posts.some((p) => p.type === 'validationError'));
      const refused = o.view.posts.filter((p) => p.type === 'validationError').pop();
      assert.match(refused.reason, reason);
      assert.ok(!refused.reason.includes('binedit:'), 'the refusal names the file, not the session source');
      assert.strictEqual(refused.invalidValue, newValue);
      assert.strictEqual(o.events.length, 0, 'no edit reached the stack');
      assert.strictEqual(o.index.dirty, false);
      assert.deepStrictEqual(childNames(o.view.posts, ['structScalar']), ['a', 'b']);
    });
  }

  it('in a struct array every element takes the new name, in the table and in the saved file', async () => {
    const o = await open('cases.mat');
    const elements = childNames(o.view.posts, ['struct1x3']);
    assert.strictEqual(elements.length, 3);
    rename(o, ['struct1x3', elements[0], 'a'], 'z');
    await waitFor('every element renamed', () => elements.every((e) => childNames(o.view.posts, ['struct1x3', e]).includes('z')));
    for (const e of elements) assert.deepStrictEqual(childNames(o.view.posts, ['struct1x3', e]), ['z', 'b'], `element ${e}`);
    assert.strictEqual(o.events.length, 1);
    const saved = o.save();
    assert.deepStrictEqual(elementFieldsIn(saved, 'struct1x3'), [['z', 'b'], ['z', 'b'], ['z', 'b']]);
    keptUntouched(o.original, saved, ['struct1x3']);
    const again = await reopen(saved);
    for (const e of elements) assert.deepStrictEqual(childNames(again.view.posts, ['struct1x3', e]), ['z', 'b']);
  });

  it('a field of a nested struct is renamed at its depth, and saves', async () => {
    const o = await open('cases.mat');
    rename(o, ['structNest', 'a', 'b'], 'inner');
    await waitFor('the nested rename', () => childNames(o.view.posts, ['structNest', 'a']).includes('inner'));
    const saved = o.save();
    assert.deepStrictEqual(fieldsIn(saved, ['structNest', 'a']), ['inner']);
    keptUntouched(o.original, saved, ['structNest']);
  });

  it('a field just added (`field`) is renamed and saved under its new name', async () => {
    const o = await open('cases.mat');
    o.view.send({ type: 'addChild', rowId: topRow(o.view.posts, 'structScalar').ID });
    await waitFor('the added field', () => childNames(o.view.posts, ['structScalar']).includes('field'));
    rename(o, ['structScalar', 'field'], 'gamma');
    await waitFor('the added field renamed', () => childNames(o.view.posts, ['structScalar']).includes('gamma'));
    assert.strictEqual(o.events.length, 2, 'the add and the rename, an edit each');
    const saved = o.save();
    assert.deepStrictEqual(fieldsIn(saved, ['structScalar']), ['a', 'b', 'gamma']);
    keptUntouched(o.original, saved, ['structScalar']);
    const again = await reopen(saved);
    assert.deepStrictEqual(childNames(again.view.posts, ['structScalar']), ['a', 'b', 'gamma']);
  });
});
