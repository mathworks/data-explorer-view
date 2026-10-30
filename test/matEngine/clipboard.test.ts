// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/matClipboard.test.ts at c73da3c: the
// MAT-file editor's clipboard and row drags, run against view's MAT-file engine, every document of
// a case on one session and one set of registers, as a window's are. The cases between a MAT-file
// and a dictionary wait for the dictionary engines (they come with core's JSON and XML pieces);
// where a case's other document was a dictionary only to be somewhere else to paste or to copy
// from, it is a second MAT-file here.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type Registers } from '../../src/model/index.js';
import {
  emptyMat,
  errorsIn,
  fixture,
  namesOf,
  open,
  readMat,
  shownCells,
  tableOf,
  twiceNamedMat,
  variableOf,
  waitFor,
  buffer,
  type Opened,
} from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const variableRow = (posts: any[], name: string): any => {
  const row = tableOf(posts).find((r) => r.parent == null && r.Name?.label === name);
  assert.ok(row, `the table has a row for "${name}"`);
  return row;
};

/** The ids the last `selectRows` the view was sent asks for. */
const selected = (posts: any[]): string[] => posts.filter((m) => m.type === 'selectRows').pop()?.rowIds ?? [];

/** Send a gesture to a MAT-file's view and wait for it to be answered: an edit pushed, or a word. */
async function onMat(tab: Opened, msg: any, what = msg.type): Promise<void> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
}

const quiet = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A window: one session and one set of registers for every document a case opens. */
function windowOf(): { registers: Registers; session: ReturnType<typeof createSession>; open: (as: string, bytes: Uint8Array) => Promise<Opened> } {
  const registers = createRegisters();
  const session = createSession();
  return { registers, session, open: (as, bytes) => open(as, bytes, { as, registers, session }) };
}

/** `cells` with the entry's own row named `name`, as a duplicate's is. */
function renamed(cells: Record<string, Record<string, string>>, name: string): Record<string, Record<string, string>> {
  return Object.fromEntries(Object.entries(cells).map(([at, row]) => [at, at === '.' ? { ...row, Name: name } : row]));
}

describe('MAT-file engine: clipboard and row drags, within one file', () => {
  it('the view offers the clipboard: rows copy, and the file is one paste target', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    const set = m.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.clipboard, undefined);
    assert.strictEqual(variableRow(m.view.posts, 'x')._canCopy, true);
    const rules = m.view.posts.find((p) => p.type === 'sectionRules');
    assert.ok(rules, 'the rules follow the rows');
    assert.deepStrictEqual(rules.rules.map((r: any) => [r.sectionName, r.sectionLabel]), [['', 'gains.mat']]);
    assert.ok(rules.rules[0].allowedTypes.includes('MatlabVariable'));
    assert.ok(rules.rules[0].allowedTypes.includes('Simulink.Parameter'));
    assert.ok(m.view.posts.some((p) => p.type === 'clipboardState'), 'and what the clipboard holds');
  });

  it('a copy pasted into its own file is a duplicate under a unique name; one undo takes it out, redo puts it back', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'x').ID] });
    assert.strictEqual(w.registers.getClipboard()?.mode, 'copy');
    assert.deepStrictEqual(w.registers.getClipboard()!.items.map((i) => [i.sourceSection, i.payload.name]), [['', 'x']]);

    await onMat(m, { type: 'paste', rowId: variableRow(m.view.posts, 'p').ID });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x', 'x1']);
    assert.strictEqual(m.events.length, 1, 'ONE edit reached the stack');
    assert.strictEqual(m.events[0].label, 'Paste');
    assert.strictEqual(m.index.dirty, true);
    assert.deepStrictEqual(selected(m.view.posts), [variableOf(m, 'x1').id], 'the duplicate is selected');
    assert.deepStrictEqual(shownCells(variableOf(m, 'x1'))['.'], { ...shownCells(variableOf(m, 'x'))['.'], Name: 'x1' });
    assert.ok(w.registers.getClipboard(), 'a copy stays on the clipboard');
    await waitFor('the duplicate painted', () => tableOf(m.view.posts).some((r) => r.parent == null && r.Name?.label === 'x1'));
    assert.strictEqual(variableRow(m.view.posts, 'x1').Status, 'New');

    m.events[0].undo();
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x']);
    assert.strictEqual(m.index.dirty, false, 'undone: clean');
    m.events[0].redo();
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x', 'x1']);
    assert.strictEqual(m.index.dirty, true);
  });

  it('a cut pasted back into its own file changes nothing, and is spent', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    const q = variableRow(m.view.posts, 'q').ID;
    m.view.send({ type: 'cut', rowIds: [variableRow(m.view.posts, 'x').ID] });
    assert.strictEqual(w.registers.getClipboard()?.mode, 'cut');
    m.view.posts.length = 0;
    m.view.send({ type: 'paste', rowId: q });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await quiet();
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.strictEqual(m.events.length, 0, 'no edit');
    assert.strictEqual(m.index.dirty, false);
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x']);
  });

  it('a copy of two variables pastes two, as ONE edit one undo takes out', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'x').ID, variableRow(m.view.posts, 'p').ID] });
    assert.deepStrictEqual(w.registers.getClipboard()!.items.map((i) => i.payload.name), ['x', 'p']);
    await onMat(m, { type: 'paste', rowId: '' });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x', 'x1', 'p1']);
    assert.strictEqual(m.events.length, 1);
    assert.deepStrictEqual(selected(m.view.posts), [variableOf(m, 'x1').id, variableOf(m, 'p1').id], 'both are selected');
    assert.deepStrictEqual(shownCells(variableOf(m, 'p1')), renamed(shownCells(variableOf(m, 'p')), 'p1'));
    m.events[0].undo();
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x']);
    assert.strictEqual(m.index.dirty, false);
  });

  it('a cut dims its rows, a copy dashes them, and the mark goes with the clipboard', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    const other = await w.open('other.mat', fixture('cases.mat'));
    m.view.send({ type: 'cut', rowIds: [variableRow(m.view.posts, 'x').ID] });
    await waitFor('the cut row repainted', () => variableRow(m.view.posts, 'x').Name?.clipboardMode === 'cut');
    assert.strictEqual(variableRow(m.view.posts, 'q').Name?.clipboardMode, undefined, 'only the cut variable');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'q').ID] });
    await waitFor('the copied row repainted', () => variableRow(m.view.posts, 'q').Name?.clipboardMode === 'copy');
    assert.strictEqual(variableRow(m.view.posts, 'x').Name?.clipboardMode, undefined, 'and the cut is no longer marked');
    // A copy in another document takes the mark away from this one.
    other.view.send({ type: 'copy', rowIds: [variableRow(other.view.posts, 'scalarD').ID] });
    await waitFor('the mark gone', () => variableRow(m.view.posts, 'q').Name?.clipboardMode === undefined);
    const state = m.view.posts.filter((p) => p.type === 'clipboardState').pop();
    assert.strictEqual(state.sourceDocUri, other.engine.uri, 'this view was told what the clipboard holds now');
  });

  it('a copy made while the rows are on their way is marked once they land', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', fixture('pv_basic.mat'));
    const x = variableRow(m.view.posts, 'x').ID;
    m.view.posts.length = 0;
    m.view.send({ type: 'ready' });
    m.view.send({ type: 'copy', rowIds: [x] });
    await waitFor('the repaint', () => m.view.posts.some((p) => p.type === 'setRows'));
    await waitFor('the mark on the copied row', () => tableOf(m.view.posts).find((r) => r.ID === x)?.Name?.clipboardMode === 'copy');
  });

  it('a paste into an EMPTY MAT-file, aimed at no row, lands', async () => {
    const w = windowOf();
    const source = await w.open('gains.mat', fixture('pv_basic.mat'));
    const m = await w.open('empty.mat', emptyMat());
    assert.deepStrictEqual(namesOf(m), []);
    const rules = m.view.posts.find((p) => p.type === 'sectionRules');
    assert.deepStrictEqual(rules.rules.map((r: any) => r.sectionName), [''], 'an empty file is still one target');
    source.view.send({ type: 'copy', rowIds: [variableRow(source.view.posts, 'x').ID, variableRow(source.view.posts, 'str').ID] });
    await onMat(m, { type: 'paste', rowId: '' });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.deepStrictEqual(namesOf(m), ['x', 'str']);
    const saved = m.save();
    assert.strictEqual(m.index.dirty, false, 'saved');
    assert.deepStrictEqual(readMat(saved, (mat) => mat.children.map((v: any) => v.name)), ['x', 'str']);
    assert.deepStrictEqual(
      readMat(saved, (mat) => shownCells(mat.children[0])),
      shownCells(variableOf(source, 'x')),
      'saved, and read back as the variable it was copied from',
    );
  });
});

describe('MAT-file engine: clipboard and row drags, between two MAT-files', () => {
  it('a copy, a cut, a drop that moves and one that copies', async () => {
    const w = windowOf();
    const a = await w.open('a.mat', fixture('pv_basic.mat'));
    const c = await w.open('c.mat', emptyMat());
    a.view.send({ type: 'copy', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(c, { type: 'paste', rowId: '' });
    assert.deepStrictEqual(namesOf(c), ['x']);
    assert.strictEqual(a.events.length, 0);

    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'str').ID] });
    await onMat(c, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the original moved out', () => !namesOf(a).includes('str'));
    assert.deepStrictEqual(namesOf(c), ['x', 'str']);
    assert.deepStrictEqual(namesOf(a), ['p', 'q', 'x']);
    assert.strictEqual(a.events.length, 1, "the source's removal is its own edit");
    assert.strictEqual(a.events[0].label, 'Move (remove source)');

    a.view.send({ type: 'dragStart', rowIds: [variableRow(a.view.posts, 'q').ID] });
    assert.ok(w.registers.getDrag(), 'the drag is on');
    await onMat(c, { type: 'drop', rowId: '', mode: 'move' });
    await waitFor('the original moved out', () => !namesOf(a).includes('q'));
    assert.deepStrictEqual(namesOf(c), ['x', 'str', 'q']);
    // The drop lets go of the register once its source's delete is answered, a turn after it.
    await waitFor('a drop to end the drag', () => w.registers.getDrag() === null);

    a.view.send({ type: 'dragStart', rowIds: [variableRow(a.view.posts, 'p').ID] });
    await onMat(c, { type: 'drop', rowId: variableRow(c.view.posts, 'x').ID, mode: 'copy' });
    assert.deepStrictEqual(namesOf(c), ['x', 'str', 'q', 'p']);
    assert.deepStrictEqual(namesOf(a), ['p', 'x'], 'a copy leaves its original');
  });

  it('a drag within one MAT-file: a move is the no-op, a copy a duplicate', async () => {
    const w = windowOf();
    const a = await w.open('a.mat', fixture('pv_basic.mat'));
    const [x, p] = [variableRow(a.view.posts, 'x').ID, variableRow(a.view.posts, 'p').ID];
    a.view.send({ type: 'dragStart', rowIds: [x] });
    a.view.posts.length = 0;
    a.view.send({ type: 'drop', rowId: p, mode: 'move' });
    await waitFor('the drag to end', () => w.registers.getDrag() === null);
    await quiet();
    assert.deepStrictEqual(errorsIn(a.view.posts), []);
    assert.strictEqual(a.events.length, 0);
    a.view.send({ type: 'dragStart', rowIds: [x] });
    await onMat(a, { type: 'drop', rowId: '', mode: 'copy' });
    assert.deepStrictEqual(namesOf(a), ['p', 'q', 'str', 'x', 'x1']);
  });
});

describe('MAT-file engine: pastes and drops refused', () => {
  const unchanged = (m: Opened, names: string[]) => {
    assert.strictEqual(m.events.length, 0, 'no edit reached the stack');
    assert.strictEqual(m.index.dirty, false);
    assert.deepStrictEqual(namesOf(m), names);
  };

  it('a read-only MAT-file is no target, and says why', async () => {
    const w = windowOf();
    const junk = new Uint8Array([...fixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const ro = await w.open('tail.mat', junk);
    const s = await w.open('source.mat', fixture('cases.mat'));
    assert.deepStrictEqual(ro.view.posts.find((p) => p.type === 'sectionRules').rules, [], 'no drop or paste rule');
    const was = namesOf(ro);
    s.view.send({ type: 'copy', rowIds: [variableRow(s.view.posts, 'scalarD').ID] });
    await onMat(ro, { type: 'paste', rowId: '' });
    assert.match(errorsIn(ro.view.posts)[0], /^Read-only: Cannot save "tail\.mat": /);
    unchanged(ro, was);
    s.view.send({ type: 'dragStart', rowIds: [variableRow(s.view.posts, 'scalarD').ID] });
    await onMat(ro, { type: 'drop', rowId: '', mode: 'move' });
    assert.match(errorsIn(ro.view.posts)[0], /^Read-only: /);
    unchanged(ro, was);
    assert.strictEqual(w.registers.getDrag(), null);
    assert.ok(namesOf(s).includes('scalarD'), 'the refused move left its source alone');
  });

  it('a variable whose name its file holds twice offers no Copy or Cut; the file says why, and the others travel', async () => {
    const w = windowOf();
    const d = await w.open('twice.mat', twiceNamedMat());
    assert.deepStrictEqual(namesOf(d), ['x', 'str', 'x']);
    const set = d.view.posts.find((p) => p.type === 'setRows');
    assert.match(JSON.stringify(set.warnings), /Two entries in twice\.mat are named 'x'/, 'the banner names the file, not its srcId');
    const [x, str] = [variableRow(d.view.posts, 'x').ID, variableRow(d.view.posts, 'str').ID];
    const rows = set.rows as any[];
    assert.deepStrictEqual(rows.filter((r) => r.parent == null).map((r) => [r.Name.label, r._canCopy]), [
      ['x', false],
      ['str', true],
      ['x', false],
    ]);
    for (const mode of ['copy', 'cut'] as const) {
      d.view.posts.length = 0;
      d.view.send({ type: mode, rowIds: [x] });
      assert.deepStrictEqual(errorsIn(d.view.posts), [`Could not ${mode} the selected item.`]);
      assert.strictEqual(w.registers.getClipboard(), null);
    }
    d.view.send({ type: 'cut', rowIds: [str] });
    assert.deepStrictEqual(w.registers.getClipboard()?.items.map((i) => i.payload.name), ['str']);
  });

  it('a move whose original became one of two of its name is pasted, and the original kept, said', async () => {
    const w = windowOf();
    const a = await w.open('back.mat', fixture('pv_basic.mat'));
    const t = await w.open('target.mat', emptyMat());
    const warnings: string[] = [];
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    // The file is read again holding two x (an outside change, with no unsaved edit): the cut's
    // original is now one of two.
    await a.engine.replace(buffer(twiceNamedMat()));
    assert.deepStrictEqual(namesOf(a), ['x', 'str', 'x']);
    await onMat(t, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the report', () => errorsIn(t.view.posts).length > 0);
    const said =
      'Pasted here, but the original in back.mat could not be removed: it holds more than one "x", and a move takes its original out by name. Remove it there by hand.';
    assert.deepStrictEqual(errorsIn(t.view.posts), [said]);
    for (const n of t.notices) warnings.push(n.message);
    assert.deepStrictEqual(warnings, [said], 'said where it stays, too');
    assert.ok(namesOf(t).includes('x'), 'the paste landed');
    assert.deepStrictEqual(namesOf(a), ['x', 'str', 'x'], 'and nothing was guessed at in the source');
    assert.strictEqual(a.events.length, 0);
  });

  it('a move whose source delete core recorded and then threw is answered by what the file holds: done', async () => {
    const w = windowOf();
    const a = await w.open('throws.mat', fixture('pv_basic.mat'));
    const t = await w.open('target.mat', emptyMat());
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    const session = w.session as any;
    const deleteNodesById = session.deleteNodesById;
    session.deleteNodesById = (...args: unknown[]) => {
      const done = deleteNodesById(...args);
      throw new Error(`after the delete (${done})`);
    };
    try {
      await onMat(t, { type: 'paste', rowId: '' });
      await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
      await waitFor('the original taken out', () => !namesOf(a).includes('x'));
      await quiet();
    } finally {
      session.deleteNodesById = deleteNodesById;
    }
    assert.deepStrictEqual(errorsIn(t.view.posts), [], 'no "remove it there by hand" for an original that is gone');
    assert.ok(namesOf(t).includes('x'));
    assert.strictEqual(a.events.length, 1, 'the delete is an edit the stack was handed');
    a.events[0].undo();
    assert.ok(namesOf(a).includes('x'), 'and its undo puts the original back');
  });

  // A cut is lazy and a MAT-file's variable is told by name alone, so between the cut and the
  // paste the original can be deleted and another variable given its name. The cut carries who
  // the original was (originOf), and the move takes out only that one.
  const giveNameX = async (a: Opened, from: string) => {
    await onMat(a, { type: 'addEntry', section: '', className: 'MatlabVariable', rename: false });
    const added = namesOf(a).find((n) => !from.split(',').includes(n))!;
    await onMat(a, { type: 'edit', rowId: variableOf(a, added).id, columnId: 'Name', oldValue: added, newValue: 'x' });
    assert.ok(namesOf(a).includes('x'), 'another variable now holds the name');
  };

  it('a cut whose variable was deleted and its name given to another: the paste lands, and the other is left alone', async () => {
    const w = windowOf();
    const a = await w.open('cut.mat', fixture('pv_basic.mat'));
    const t = await w.open('target.mat', emptyMat());
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'delete', rowIds: [variableOf(a, 'x').id] });
    await giveNameX(a, namesOf(a).join());
    const other = variableOf(a, 'x');
    const edits = a.events.length;
    await onMat(t, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the report', () => errorsIn(t.view.posts).length > 0);
    assert.deepStrictEqual(errorsIn(t.view.posts), [
      'Pasted here; the original in cut.mat is no longer there to remove: the "x" it holds now is another variable, which was left as it is.',
    ]);
    assert.ok(namesOf(t).includes('x'), 'the paste landed');
    assert.strictEqual(variableOf(a, 'x'), other, 'and the variable that holds the name now was not taken out');
    assert.strictEqual(a.events.length, edits, 'no edit in the source');
  });

  it('a cut whose variable was renamed and its name given to another: nothing is taken out, and the renamed one is named', async () => {
    const w = windowOf();
    const a = await w.open('renamed.mat', fixture('pv_basic.mat'));
    const t = await w.open('target.mat', emptyMat());
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'edit', rowId: variableOf(a, 'x').id, columnId: 'Name', oldValue: 'x', newValue: 'y' });
    await giveNameX(a, namesOf(a).join());
    await onMat(t, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the report', () => errorsIn(t.view.posts).length > 0);
    assert.deepStrictEqual(errorsIn(t.view.posts), [
      'Pasted here, but the original in renamed.mat could not be removed: the "x" it holds now is another variable, and the one taken is now "y". Remove it there by hand.',
    ]);
    assert.ok(namesOf(a).includes('x') && namesOf(a).includes('y'), 'both are where they were');
  });

  it('a cut whose variable was edited, or deleted and the delete undone, is still the one taken, and moves', async () => {
    const w = windowOf();
    const a = await w.open('same.mat', fixture('pv_basic.mat'));
    const t = await w.open('target.mat', emptyMat());
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'edit', rowId: variableOf(a, 'x').id, columnId: 'Value', oldValue: '[1 2 3]', newValue: '[4 5]' });
    await onMat(t, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the original moved out', () => !namesOf(a).includes('x'));
    assert.deepStrictEqual(errorsIn(t.view.posts), []);

    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'p').ID] });
    await onMat(a, { type: 'delete', rowIds: [variableOf(a, 'p').id] });
    a.events[a.events.length - 1].undo();
    assert.ok(namesOf(a).includes('p'), 'the delete is undone');
    await onMat(t, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the original moved out', () => !namesOf(a).includes('p'));
    assert.deepStrictEqual(errorsIn(t.view.posts), []);
    assert.ok(namesOf(t).includes('p'));
  });

  it('the drag register is let go of after a drop that landed, one refused, and one that failed', async () => {
    const w = windowOf();
    const m = await w.open('gains.mat', emptyMat());
    const s = await w.open('source.mat', fixture('pv_basic.mat'));
    const ro = await w.open('tail.mat', new Uint8Array([...fixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]));

    s.view.send({ type: 'dragStart', rowIds: [variableRow(s.view.posts, 'x').ID] });
    await onMat(m, { type: 'drop', rowId: '', mode: 'copy' });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.ok(namesOf(m).includes('x'));
    assert.strictEqual(w.registers.getDrag(), null, 'landed');

    s.view.send({ type: 'dragStart', rowIds: [variableRow(s.view.posts, 'str').ID] });
    await onMat(ro, { type: 'drop', rowId: '', mode: 'copy' });
    assert.match(errorsIn(ro.view.posts)[0], /^Read-only: /);
    assert.strictEqual(w.registers.getDrag(), null, 'refused');

    const session = w.session as any;
    const paste = session.pasteEntries;
    session.pasteEntries = () => {
      throw new Error('the paste broke');
    };
    try {
      s.view.send({ type: 'dragStart', rowIds: [variableRow(s.view.posts, 'q').ID] });
      m.view.posts.length = 0;
      m.view.send({ type: 'drop', rowId: '', mode: 'move' });
      await waitFor('the failure said', () => errorsIn(m.view.posts).length > 0);
    } finally {
      session.pasteEntries = paste;
    }
    assert.deepStrictEqual(errorsIn(m.view.posts), ['Failed to apply edit: the paste broke']);
    assert.strictEqual(w.registers.getDrag(), null, 'failed');
    assert.ok(namesOf(s).includes('q'), 'a failed move takes nothing out of its source');
  });
});
