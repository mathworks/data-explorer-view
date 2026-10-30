// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/matAddGallery.test.ts at c73da3c: the
// MAT-file editor's Add gallery, run against view's MAT-file engine. A reopen is a new engine on
// the bytes a save handed back, and a Save As the bytes `serialize` hands back, written nowhere
// but held by the case. The live gate's file export (DEX_GATE_OUT) is the extension's.
import * as assert from 'node:assert';
import { createSession, parseMat } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { buffer, fixture, nameOf, open, same, tableOf, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A Level-5 file of one double, `x` = 1, and no objects: no subsystem at all. */
function plainMat(): Uint8Array {
  const out = new Uint8Array(128 + 64);
  out.fill(0x20, 0, 116);
  out.set(new TextEncoder().encode('MATLAB 5.0 MAT-file, written by a test'), 0);
  out.set([0x00, 0x01, 0x49, 0x4d], 124);
  const v = new DataView(out.buffer, 128);
  const words: [number, number][] = [[0, 14], [4, 56], [8, 6], [12, 8], [16, 6], [24, 5], [28, 8], [32, 1], [36, 1], [40, (1 << 16) | 1], [48, 9], [52, 8]];
  for (const [at, w] of words) v.setUint32(at, w, true);
  v.setUint8(44, 0x78);
  v.setFloat64(56, 1, true);
  return out;
}

/** The file's records by variable name (the subsystem, which has none, as `''`). */
function recordsOf(bytes: Uint8Array): Map<string, Uint8Array> {
  const parsed: any = parseMat(buffer(bytes));
  return new Map(parsed.records.map((r: any) => [r.name ?? '', r.bytes]));
}

/** Every variable record of `before` but `changed` is in `after` as the bytes it was. */
function keptUntouched(before: Uint8Array, after: Uint8Array, changed: string[]): void {
  const now = recordsOf(after);
  for (const [name, rec] of recordsOf(before)) {
    if (name === '' || changed.includes(name)) continue;
    assert.ok(now.has(name), `"${name}" is still in the saved file`);
    assert.ok(same(now.get(name)!, rec), `"${name}" is the bytes it was read from`);
  }
}

const topRowOrNull = (posts: any[], name: string): any => tableOf(posts).find((r) => r.parent == null && nameOf(r) === name) ?? null;
const topRow = (posts: any[], name: string): any => {
  const row = topRowOrNull(posts, name);
  assert.ok(row, `the table has a row for "${name}"`);
  return row;
};
const childrenOf = (posts: any[], row: any): string[] => tableOf(posts).filter((r) => r.parent === row.ID).map(nameOf);
const lastSetRows = (posts: any[]): any => [...posts].reverse().find((p) => p.type === 'setRows');

// Each tile's class, the default name core gives its first variable, and the class that variable
// reports.
const TILES: Record<string, { name: string; reports: string }> = {
  MatlabVariable: { name: 'var', reports: 'double' },
  MatlabStruct: { name: 'Struct', reports: 'struct' },
  string: { name: 'str', reports: 'string' },
  'Simulink.Parameter': { name: 'Param', reports: 'Simulink.Parameter' },
  'Simulink.Signal': { name: 'Signal', reports: 'Simulink.Signal' },
  'Simulink.Bus': { name: 'Bus', reports: 'Simulink.Bus' },
  'Simulink.LookupTable': { name: 'LookupTable', reports: 'Simulink.LookupTable' },
  'Simulink.Breakpoint': { name: 'Breakpoint', reports: 'Simulink.Breakpoint' },
  'Simulink.NumericType': { name: 'NumericType', reports: 'Simulink.NumericType' },
  'Simulink.AliasType': { name: 'AliasType', reports: 'Simulink.AliasType' },
  'Simulink.ValueType': { name: 'ValueType', reports: 'Simulink.ValueType' },
};

/** The classes core says `bytes` can take, read off the source as the view does. */
function coreClasses(bytes: Uint8Array): string[] {
  const mat: any = createSession().addMatSource('classes', buffer(bytes), { path: 'c.mat' });
  return mat.getAllowedTypes();
}

const add = (o: Opened, className: string, rename = true) => o.view.send({ type: 'addEntry', section: '', className, rename });

/** The saved file as another tab would open it: a document of its own. */
let reopened = 0;
const reopen = (bytes: Uint8Array) => open('reopened.mat', bytes, { as: `reopened${++reopened}.mat` });

describe('MAT-file engine: the Add gallery', () => {
  it('the view is told the classes core lists for the file, and the gallery is those', async () => {
    const o = await open('cases.mat');
    const set = lastSetRows(o.view.posts);
    assert.strictEqual(set.editable, true);
    assert.deepStrictEqual(set.add, { classes: coreClasses(o.original) });
    for (const c of ['MatlabVariable', 'MatlabStruct', 'Simulink.Parameter', 'Simulink.Bus', 'string']) {
      assert.ok(set.add.classes.includes(c), `the file can take a new ${c}`);
    }
    for (const c of set.add.classes) assert.ok(TILES[c], `every class core lists is one this suite adds (${c})`);
  });

  for (const className of Object.keys(TILES)) {
    it(`a ${className} tile adds one, which saves, reopens as it was, undoes, and saves as`, async () => {
      const t = TILES[className];
      const o = await open('cases.mat');
      if (!lastSetRows(o.view.posts).add.classes.includes(className)) return; // core does not list it for this file
      add(o, className);
      assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
      await waitFor(`the ${t.name} row`, () => !!topRowOrNull(o.view.posts, t.name));
      const row = topRow(o.view.posts, t.name);
      assert.strictEqual(row.Class, t.reports);
      assert.strictEqual(row.Status, 'New');
      const rename = o.view.posts.find((p) => p.type === 'beginRename');
      assert.ok(rename && rename.rowId === row.ID, 'its name editor is asked for');
      const saved = o.save();
      assert.strictEqual(o.index.dirty, false);
      keptUntouched(o.original, saved, [t.name]);
      const again = await reopen(saved);
      const back = topRow(again.view.posts, t.name);
      assert.strictEqual(back.Class, row.Class);
      assert.strictEqual(back.Value, row.Value);
      o.events[0].undo();
      await waitFor('the added row gone', () => !topRowOrNull(o.view.posts, t.name));
      assert.ok(!recordsOf(o.save()).has(t.name), 'the undone variable is not saved');
      keptUntouched(o.original, o.disk(), []);
      o.events[0].redo();
      await waitFor('the row back', () => !!topRowOrNull(o.view.posts, t.name));
      const copy = o.engine.serialize();
      assert.ok(recordsOf(copy).has(t.name), 'Save As writes the new variable');
      keptUntouched(o.original, copy, [t.name]);
      assert.ok(!recordsOf(o.disk()).has(t.name), 'and leaves the file as it was last saved');
      assert.strictEqual(o.index.dirty, true, 'which the document still differs from');
    });
  }

  it('a variable whose Value is typed "abc" becomes a string, which saves in its place, reopens as one, and undoes', async () => {
    const o = await open('cases.mat');
    const order = (posts: any[]) => tableOf(posts).filter((r) => r.parent == null).map(nameOf);
    const before = order(o.view.posts);
    const row = topRow(o.view.posts, 'kp');
    assert.notStrictEqual(row.Class, 'string');
    o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: row.Value, newValue: '"abc"' });
    await waitFor('kp a string', () => topRowOrNull(o.view.posts, 'kp')?.Class === 'string');
    assert.strictEqual(topRow(o.view.posts, 'kp').Value, '"abc"');
    assert.deepStrictEqual(order(o.view.posts), before, 'in its place in the table');
    assert.strictEqual(o.events.length, 1, 'one edit reached the stack');
    const saved = o.save();
    assert.strictEqual(o.index.dirty, false);
    keptUntouched(o.original, saved, ['kp']);
    const again = await reopen(saved);
    assert.strictEqual(topRow(again.view.posts, 'kp').Class, 'string');
    assert.strictEqual(topRow(again.view.posts, 'kp').Value, '"abc"');
    assert.deepStrictEqual(order(again.view.posts), before, 'and in its place in the file');
    o.events[0].undo();
    await waitFor('kp back as it was', () => topRowOrNull(o.view.posts, 'kp')?.Class === row.Class);
    assert.strictEqual(topRow(o.view.posts, 'kp').Value, row.Value);
    keptUntouched(o.original, o.save(), []);
  });

  it('a string variable whose Value is typed 0 becomes a double, which saves in its place and reopens as one', async () => {
    const o = await open('cases.mat');
    const order = (posts: any[]) => tableOf(posts).filter((r) => r.parent == null).map(nameOf);
    const before = order(o.view.posts);
    const row = topRow(o.view.posts, 'strScalar');
    assert.strictEqual(row.Class, 'string');
    o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: row.Value, newValue: '0' });
    await waitFor('strScalar a double', () => topRowOrNull(o.view.posts, 'strScalar')?.Class === 'double');
    assert.strictEqual(topRow(o.view.posts, 'strScalar').Value, '0');
    assert.deepStrictEqual(order(o.view.posts), before, 'in its place in the table');
    const saved = o.save();
    keptUntouched(o.original, saved, ['strScalar']);
    const again = await reopen(saved);
    assert.strictEqual(topRow(again.view.posts, 'strScalar').Class, 'double');
    assert.strictEqual(topRow(again.view.posts, 'strScalar').Value, '0');
    assert.deepStrictEqual(order(again.view.posts), before, 'and in its place in the file');
    o.events[0].undo();
    await waitFor('strScalar a string again', () => topRowOrNull(o.view.posts, 'strScalar')?.Class === 'string');
    assert.strictEqual(topRow(o.view.posts, 'strScalar').Value, row.Value);
    keptUntouched(o.original, o.save(), []);
  });

  it('a variable added and deleted before a save, or added and undone, leaves the file byte for byte as it was', async () => {
    const o = await open('pv_basic.mat');
    add(o, 'Simulink.Parameter', false);
    await waitFor('the Param row', () => !!topRowOrNull(o.view.posts, 'Param'));
    o.view.send({ type: 'delete', rowIds: [topRow(o.view.posts, 'Param').ID] });
    await waitFor('the Param row gone', () => !topRowOrNull(o.view.posts, 'Param'));
    assert.ok(same(o.save(), o.original), 'the save wrote the file as it was read');
    const u = await open('plain.mat', plainMat());
    add(u, 'Simulink.Signal', false);
    await waitFor('the Signal row', () => !!topRowOrNull(u.view.posts, 'Signal'));
    u.events[0].undo();
    await waitFor('the Signal row gone', () => !topRowOrNull(u.view.posts, 'Signal'));
    assert.ok(same(u.save(), u.original), 'no subsystem is written for an object no longer there');
  });

  it('a pinned add asks for no name editor, and two adds of a class take two names', async () => {
    const o = await open('pv_basic.mat');
    add(o, 'Simulink.Signal', false);
    add(o, 'Simulink.Signal', false);
    await waitFor('both rows', () => !!topRowOrNull(o.view.posts, 'Signal') && !!topRowOrNull(o.view.posts, 'Signal1'));
    assert.strictEqual(o.view.posts.filter((p) => p.type === 'beginRename').length, 0);
    assert.strictEqual(o.events.length, 2);
    keptUntouched(o.original, o.save(), ['Signal', 'Signal1']);
  });

  it("a new Bus's elements are added and removed from its row, and save", async () => {
    const o = await open('pv_basic.mat');
    add(o, 'Simulink.Bus', false);
    await waitFor('the Bus row', () => !!topRowOrNull(o.view.posts, 'Bus'));
    const bus = topRow(o.view.posts, 'Bus');
    assert.strictEqual(bus._canAddChild, true, 'a Bus row takes a child');
    assert.deepStrictEqual(childrenOf(o.view.posts, bus), []);
    o.view.send({ type: 'addChild', rowId: bus.ID });
    o.view.send({ type: 'addChild', rowId: bus.ID });
    await waitFor('two elements', () => childrenOf(o.view.posts, topRow(o.view.posts, 'Bus')).length === 2);
    assert.deepStrictEqual(childrenOf(o.view.posts, topRow(o.view.posts, 'Bus')), ['a', 'a1']);
    const saved = o.save();
    keptUntouched(o.original, saved, ['Bus']);
    const again = await reopen(saved);
    assert.deepStrictEqual(childrenOf(again.view.posts, topRow(again.view.posts, 'Bus')), ['a', 'a1']);
    const first = tableOf(o.view.posts).find((r) => r.parent === topRow(o.view.posts, 'Bus').ID && nameOf(r) === 'a');
    assert.strictEqual(first._canDelete, true);
    o.view.send({ type: 'delete', rowIds: [first.ID] });
    await waitFor('one element left', () => childrenOf(o.view.posts, topRow(o.view.posts, 'Bus')).length === 1);
    const third = await reopen(o.save());
    assert.deepStrictEqual(childrenOf(third.view.posts, topRow(third.view.posts, 'Bus')), ['a1']);
  });

  it('a Bus the file holds gains an element and loses one, and every other variable is as it was', async () => {
    const o = await open('cases.mat');
    const bus = tableOf(o.view.posts).find((r) => r.parent == null && r.Class === 'Simulink.Bus');
    assert.ok(bus, 'cases.mat holds a Bus');
    const name = nameOf(bus);
    const before = childrenOf(o.view.posts, bus);
    assert.ok(before.length > 0);
    o.view.send({ type: 'addChild', rowId: bus.ID });
    await waitFor('the new element', () => childrenOf(o.view.posts, topRow(o.view.posts, name)).length === before.length + 1);
    const firstRow = tableOf(o.view.posts).find((r) => r.parent === topRow(o.view.posts, name).ID && nameOf(r) === before[0]);
    o.view.send({ type: 'delete', rowIds: [firstRow.ID] });
    await waitFor('the first element gone', () => !childrenOf(o.view.posts, topRow(o.view.posts, name)).includes(before[0]));
    const after = childrenOf(o.view.posts, topRow(o.view.posts, name));
    const saved = o.save();
    keptUntouched(o.original, saved, [name]);
    const again = await reopen(saved);
    assert.deepStrictEqual(childrenOf(again.view.posts, topRow(again.view.posts, name)), after);
  });

  it('a file with no objects at all takes a Simulink object, and its subsystem comes with it', async () => {
    const o = await open('plain.mat', plainMat());
    assert.ok(!recordsOf(o.original).has(''), 'the file has no subsystem');
    const set = lastSetRows(o.view.posts);
    assert.deepStrictEqual(set.add, { classes: coreClasses(o.original) });
    assert.ok(set.add.classes.includes('Simulink.Parameter'));
    add(o, 'Simulink.Parameter');
    add(o, 'string');
    await waitFor('both rows', () => !!topRowOrNull(o.view.posts, 'Param') && !!topRowOrNull(o.view.posts, 'str'));
    const saved = o.save();
    assert.ok(recordsOf(saved).has(''), 'the save wrote a subsystem');
    keptUntouched(o.original, saved, ['Param', 'str']);
    const again = await reopen(saved);
    assert.strictEqual(topRow(again.view.posts, 'Param').Class, 'Simulink.Parameter');
    assert.strictEqual(topRow(again.view.posts, 'str').Class, 'string');
    assert.strictEqual(topRow(again.view.posts, 'x').Value, '1');
  });

  it('a read-only file offers no gallery and takes no add', async () => {
    const junk = new Uint8Array([...fixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const o = await open('tail.mat', junk);
    const set = lastSetRows(o.view.posts);
    assert.strictEqual(set.editable, false, 'no Add button: the table draws one only where it can add');
    assert.deepStrictEqual(set.add, { classes: [] });
    add(o, 'Simulink.Parameter');
    assert.strictEqual(o.events.length, 0);
    assert.strictEqual(o.index.dirty, false);
  });

  for (const className of ['Simulink.ConfigSet', 'Simulink.data.dictionary.EnumTypeDefinition']) {
    it(`an add of a class the file takes no new variable of (${className}) is refused in core's words, and adds nothing`, async () => {
      const o = await open('cases.mat');
      if (lastSetRows(o.view.posts).add.classes.includes(className)) return; // core offers it after all
      const before = tableOf(o.view.posts).length;
      add(o, className);
      await waitFor('the refusal', () => o.view.posts.some((p) => p.type === 'refused'));
      const refusal = o.view.posts.filter((p) => p.type === 'refused').pop();
      assert.strictEqual(refusal.title, 'Cannot Add', 'in the refusal dialog');
      const message: string = refusal.reason;
      assert.match(message, new RegExp(className.replace('.', '\\.')));
      assert.match(message, /takes a new variable of a plain value, a struct, or one of /);
      assert.ok(message.includes('cases.mat'), `the message names the file: ${message}`);
      assert.ok(!message.includes('binedit:'), 'and not the session source it was opened as');
      assert.strictEqual(o.events.length, 0, 'no edit reached the stack');
      assert.strictEqual(o.index.dirty, false);
      assert.strictEqual(tableOf(o.view.posts).length, before, 'no row was added');
    });
  }
});
