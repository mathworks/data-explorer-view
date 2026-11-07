// Copyright 2026 The MathWorks, Inc.
//
// A copy that takes the place of entries the target already has (TransferRequest.replacing, and each
// engine's `dropReplacing`): a compare's Copy to Right of a changed entry.
//
// A plain copy of an entry the target already holds is pasted beside it under a free name (`Kp1`),
// which is right for a paste and wrong for a compare: Copy to Right must leave the right file holding
// the left file's entry under its own name, where its old one was. So the entries it replaces are
// taken out first, in the same edit as the paste, and one Undo puts the old one back. This holds the
// policy's half with a made-up document (transfer.ts: the selectors reach the commit as `removeFirst`,
// a move is refused, a document that cannot take entries out for a move still can for this), and then
// each kind of editable document, through its engine in a page's workspace: a JSON dictionary, a
// compressed one, a MAT-file and a model's workspace. And what a replace of an entry that is no longer
// there says, having changed nothing.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createRegisters,
  createWorkspace,
  runTransfer,
  sourceUri,
  type ClipboardItem,
  type Doc,
  type EditableTableSource,
  type TableChange,
  type TransferAdapter,
  type TransferCommit,
  type TransferTarget,
  type TreeTableRow,
  type Workspace,
} from '../src/model/index.js';

// --- The policy, with a made-up document -----------------------------------------------------------

const HERE = 'file:///work/here.sldd';
const THERE = 'file:///work/there.sldd';

function item(name: string, uuid: string): ClipboardItem {
  return {
    payload: { name, metadata: { uuid }, value: 1 },
    sourceSection: 'design',
    className: 'Simulink.Parameter',
    arrayClass: '',
    kind: 'Parameter',
    isMatlabVariable: true,
    isScalarNumeric: true,
  };
}

/** A document that records what the policy asks it to commit, and what it is told to say. */
function fakeAdapter(takesRemoveFirst?: boolean) {
  const commits: TransferCommit<TransferTarget>[] = [];
  const reports: string[] = [];
  const adapter: TransferAdapter<TransferTarget> = {
    docUri: HERE,
    takesRemoveFirst,
    resolveTarget: () => ({ sectionName: 'design' }),
    commit: (plan) => void commits.push(plan),
    onFailure: (err) => {
      throw err;
    },
    report: (message) => void reports.push(message),
  };
  return { adapter, commits, reports };
}

const DEPS = { deleteFromSource: async () => ({ removed: true }) };

describe('the policy of a replacing copy', () => {
  it("hands the entries it replaces to the commit, to take out first", async () => {
    const registers = createRegisters();
    registers.setDrag(THERE, [item('Kp', 'other-uuid')]);
    const { adapter, commits } = fakeAdapter();
    const outcome = await runTransfer({ rowId: 'section:design', replacing: [{ name: 'Kp', uuid: 'u1' }] }, registers.dragRegister('copy'), adapter, DEPS);
    expect(outcome).toEqual({ kind: 'done' });
    expect(commits).toHaveLength(1);
    expect(commits[0].removeFirst).toEqual([{ name: 'Kp', uuid: 'u1' }]);
    expect(commits[0].label).toBe('Copy');
  });

  it('refuses a move that would replace entries, changing nothing', async () => {
    const registers = createRegisters();
    registers.setDrag(THERE, [item('Kp', 'other-uuid')]);
    const { adapter, commits, reports } = fakeAdapter();
    const outcome = await runTransfer({ rowId: 'section:design', replacing: [{ name: 'Kp', uuid: 'u1' }] }, registers.dragRegister('move'), adapter, DEPS);
    expect(outcome).toEqual({ kind: 'refused', message: 'Only a copy replaces entries.' });
    expect(commits).toEqual([]);
    expect(reports).toEqual(['Only a copy replaces entries.']);
  });

  it('lets a document that takes nothing out for a move replace entries all the same', async () => {
    const registers = createRegisters();
    registers.setDrag(THERE, [item('Kp', 'other-uuid')]);
    const { adapter, commits } = fakeAdapter(false);
    const outcome = await runTransfer({ rowId: 'section:design', replacing: [{ name: 'Kp', uuid: 'u1' }] }, registers.dragRegister('copy'), adapter, DEPS);
    expect(outcome).toEqual({ kind: 'done' });
    expect(commits[0].removeFirst).toEqual([{ name: 'Kp', uuid: 'u1' }]);
  });
});

// --- Each kind of document, through its engine ------------------------------------------------------

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
});

const fixture = (rel: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, rel)));
/** Every pending timer turn, as the engines' tests settle (four, plus two for a write's echo). */
const settle = async (turns = 6): Promise<void> => {
  for (let i = 0; i < turns; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

/** One editing workspace with the same file open twice, as a compare's two sides: a under /a/, b under /b/. */
async function twoSides(rel: string): Promise<{ a: Doc; b: Doc; at: EditableTableSource; bt: EditableTableSource }> {
  const ws = createWorkspace({ editing: true });
  workspaces.push(ws);
  const name = rel.split('/').pop()!;
  const a = await ws.open(fixture(rel), name, sourceUri(`/a/${name}`));
  const b = await ws.open(fixture(rel), name, sourceUri(`/b/${name}`));
  for (const doc of [a, b]) {
    await doc.table.open();
    doc.table.opened?.();
  }
  await settle();
  return { a, b, at: a.table as EditableTableSource, bt: b.table as EditableTableSource };
}

/** One editing workspace with two files open, a under /a/ and b under /b/. */
async function twoFiles(relA: string, relB: string): Promise<{ a: Doc; b: Doc; at: EditableTableSource; bt: EditableTableSource }> {
  const ws = createWorkspace({ editing: true });
  workspaces.push(ws);
  const open = (rel: string, side: string) => ws.open(fixture(rel), rel.split('/').pop()!, sourceUri(`/${side}/${rel.split('/').pop()!}`));
  const a = await open(relA, 'a');
  const b = await open(relB, 'b');
  for (const doc of [a, b]) {
    await doc.table.open();
    doc.table.opened?.();
  }
  await settle();
  return { a, b, at: a.table as EditableTableSource, bt: b.table as EditableTableSource };
}

/** Whether two byte arrays hold the same bytes. */
const sameBytes = (x: Uint8Array, y: Uint8Array): boolean => x.length === y.length && x.every((byte, i) => byte === y[i]);

const rowsOf = async (table: EditableTableSource): Promise<TreeTableRow[]> => (await table.open()).rows;
/** The row labelled `label` (under the row labelled `under`, where given). */
function rowNamed(rows: readonly TreeTableRow[], label: string, under?: string): TreeTableRow {
  const parent = under === undefined ? undefined : rows.find((row) => row.Name.label === under);
  const row = rows.find((r) => r.Name.label === label && (!parent || r.parent === parent.ID));
  if (!row) throw new Error(`no row ${label}`);
  return row;
}
const valueOf = (row: TreeTableRow): string => (typeof row.Value === 'string' ? row.Value : row.Value.text);
/** The names of the rows right under `parent` (null: the top level). */
const namesUnder = (rows: readonly TreeTableRow[], parent: string | null): string[] => rows.filter((row) => row.parent === parent).map((row) => row.Name.label);

/** Copy a's entry `label` over b's of that name, dropped onto b's `rowId`, as a compare's Copy to Right does. */
async function copyOver(at: EditableTableSource, bt: EditableTableSource, rowId: string, label: string, under?: string): Promise<void> {
  const aRow = rowNamed(await rowsOf(at), label, under);
  const bRow = rowNamed(await rowsOf(bt), label, under);
  at.dragStart([aRow.ID]);
  await bt.dropReplacing!(rowId, [bRow.ID]);
  at.dragEnd();
  await settle();
}

/** Edit `row`'s Value from `was` to `now` through `table`, and wait for it to land. */
async function setValue(table: EditableTableSource, row: TreeTableRow, now: string): Promise<void> {
  await table.edit({ rowId: row.ID, columnId: 'Value', oldValue: valueOf(row), newValue: now });
  await settle();
}

// The names are compared sorted: until core can paste in place, the copy goes last in its section,
// so a replace keeps a section's names but not their order.
describe('a replacing copy, in each kind of document', () => {
  it('a JSON dictionary: the copy takes its entry’s name and place, and one Undo puts it back', async () => {
    const { bt, at } = await twoSides('fixtures/params.sldd');
    await setValue(bt, rowNamed(await rowsOf(bt), 'Kp'), '5');
    const before = namesUnder(await rowsOf(bt), 'section:design');
    await copyOver(at, bt, 'section:design', 'Kp');
    const after = await rowsOf(bt);
    expect(namesUnder(after, 'section:design').sort()).toEqual([...before].sort());
    expect(valueOf(rowNamed(after, 'Kp'))).toBe('1');
    expect(bt.history?.canUndo).toBe(true);
    bt.undo();
    await settle();
    const undone = await rowsOf(bt);
    expect(valueOf(rowNamed(undone, 'Kp'))).toBe('5');
    expect(namesUnder(undone, 'section:design').sort()).toEqual([...before].sort());
  });

  it("a compressed dictionary: a struct entry replaced whole, its field the other side's", async () => {
    const { bt, at } = await twoSides('fixtures/object_props_binary.sldd');
    await setValue(bt, rowNamed(await rowsOf(bt), 'b', 'a'), '6');
    const before = namesUnder(await rowsOf(bt), 'section:other');
    await copyOver(at, bt, 'section:other', 'a');
    const after = await rowsOf(bt);
    expect(namesUnder(after, 'section:other').sort()).toEqual([...before].sort());
    expect(valueOf(rowNamed(after, 'b', 'a'))).toBe('5');
    bt.undo();
    await settle();
    const undone = await rowsOf(bt);
    expect(valueOf(rowNamed(undone, 'b', 'a'))).toBe('6');
    expect(namesUnder(undone, 'section:other').sort()).toEqual([...before].sort());
  });

  it('a MAT-file: a variable replaced, dropped on the file itself', async () => {
    const { bt, at } = await twoSides('fixtures/nd_numeric.mat');
    await setValue(bt, rowNamed(await rowsOf(bt), 'Mat'), '[1 2 3; 4 5 7]');
    const before = namesUnder(await rowsOf(bt), null);
    await copyOver(at, bt, '', 'Mat');
    const after = await rowsOf(bt);
    expect(namesUnder(after, null).sort()).toEqual([...before].sort());
    expect(valueOf(rowNamed(after, 'Mat'))).toBe('[1 2 3; 4 5 6]');
    bt.undo();
    await settle();
    const undone = await rowsOf(bt);
    expect(valueOf(rowNamed(undone, 'Mat'))).toBe('[1 2 3; 4 5 7]');
    expect(namesUnder(undone, null).sort()).toEqual([...before].sort());
  });

  it("a model's workspace: a variable no block uses, replaced", async () => {
    const { bt, at } = await twoSides('shell/fixtures/slxcases.slx');
    await setValue(bt, rowNamed(await rowsOf(bt), 'grid'), '[1 2 3; 4 5 7]');
    const before = namesUnder(await rowsOf(bt), 'section:workspace');
    await copyOver(at, bt, 'section:workspace', 'grid');
    const after = await rowsOf(bt);
    expect(namesUnder(after, 'section:workspace').sort()).toEqual([...before].sort());
    expect(valueOf(rowNamed(after, 'grid'))).toBe('[1 2 3; 4 5 6]');
    bt.undo();
    await settle();
    const undone = await rowsOf(bt);
    expect(valueOf(rowNamed(undone, 'grid'))).toBe('[1 2 3; 4 5 7]');
    expect(namesUnder(undone, 'section:workspace').sort()).toEqual([...before].sort());
  });

  // Core keeps a variable a block of the model uses by name: a delete of it is refused (the block
  // would find no variable of that name), and a replace deletes it first. Until core pastes over a
  // variable it keeps, the replace is refused, in core's reason, before anything changes.
  it("a model's workspace: a variable a block uses is refused, changing nothing", async () => {
    const { b, bt, at } = await twoSides('shell/fixtures/slxcases.slx');
    const changes: TableChange[] = [];
    bt.subscribe((change) => void changes.push(change));
    const before = namesUnder(await rowsOf(bt), 'section:workspace');
    const bytes = b.serialize().bytes;
    await copyOver(at, bt, 'section:workspace', 'tau');
    expect(changes.filter((c) => c.kind === 'error')).toEqual([
      {
        kind: 'error',
        message:
          'Cannot replace "tau": the model\'s block "TF" uses it by name, and would find no variable of that name once it is deleted here. Nothing was replaced.',
      },
    ]);
    const after = await rowsOf(bt);
    expect(namesUnder(after, 'section:workspace')).toEqual(before);
    expect(valueOf(rowNamed(after, 'tau'))).toBe('0.25');
    expect(b.dirty).toBe(false);
    expect(bt.history?.canUndo).toBe(false);
    expect(sameBytes(b.serialize().bytes, bytes)).toBe(true);
  });

  // A copy core will not paste into the file is refused before the variable it replaces goes: core
  // is asked deeply first (the paste made and taken back, seen by no one), as the paste's own refusal
  // would come only once the variable was gone.
  it('a MAT-file: a copy core will not paste is refused before the variable it replaces goes', async () => {
    const { b, bt, at } = await twoFiles('shell/fixtures/slxcases.slx', 'fixtures/nd_numeric.mat');
    const changes: TableChange[] = [];
    bt.subscribe((change) => void changes.push(change));
    const bytes = b.serialize().bytes;
    at.dragStart([rowNamed(await rowsOf(at), 'Const').ID]);
    await bt.dropReplacing!('', [rowNamed(await rowsOf(bt), 'Mat').ID]);
    at.dragEnd();
    await settle();
    expect(changes.filter((c) => c.kind === 'error')).toEqual([
      { kind: 'error', message: 'Cannot paste into "nd_numeric.mat": what was handed over is not an entry, a name and a value. Nothing was pasted.' },
    ]);
    expect(namesUnder(await rowsOf(bt), null)).toEqual(['Mat', 'Nd', 'Nd4', 'Vec']);
    expect(bt.history?.canUndo).toBe(false);
    expect(b.dirty).toBe(false);
    expect(sameBytes(b.serialize().bytes, bytes)).toBe(true);
  });

  it('refuses to replace an entry that is no longer there, changing nothing', async () => {
    const { b, bt, at } = await twoSides('fixtures/params.sldd');
    const changes: TableChange[] = [];
    bt.subscribe((change) => void changes.push(change));
    const dirty = b.dirty;
    at.dragStart([rowNamed(await rowsOf(at), 'Kp').ID]);
    await bt.dropReplacing!('section:design', ['file:///b/params.sldd/design/Gone']);
    await settle();
    expect(changes.filter((c) => c.kind === 'error')).toEqual([{ kind: 'error', message: 'An entry to replace is no longer in params.sldd.' }]);
    expect(b.dirty).toBe(dirty);
    expect(namesUnder(await rowsOf(bt), 'section:design')).toEqual(['Kp', 'Uo', 'Ki']);
    // It ended the drag, as a drop does whatever became of it: a drop after it, before the source's
    // dragEnd, finds nothing to drop.
    await bt.drop('section:design', 'copy');
    at.dragEnd();
    await settle();
    expect(changes.filter((c) => c.kind === 'error').map((c) => (c as { message: string }).message)).toEqual([
      'An entry to replace is no longer in params.sldd.',
      'Nothing to drop.',
    ]);
    expect(namesUnder(await rowsOf(bt), 'section:design')).toEqual(['Kp', 'Uo', 'Ki']);
  });
});

// A fault of core's found beside this task, and not this task's (reported): a compressed dictionary
// whose chunk holds no `DD.Dictionary` object, nor a `DD.DICTIONARYREFERENCE` (compressed.sldd and
// arch_binary.sldd among the fixtures), takes no new entry, copied, pasted or added. Core's
// insertNewEntry (edit/xmlStructuralEdit.ts, under pasteEntryXml and addNewEntryXml) throws "Could
// not locate the insertion point." where findEntryInsertionPoint (datamodel/parser/xmlEntrySplice.ts)
// finds neither object to insert before, and the table says "Failed to apply edit: …". Skipped until
// core inserts before `</DataSource>` there; take the skip off to see it fail.
describe('a copy into a compressed dictionary whose chunk has no DD.Dictionary object (core, reported)', () => {
  it.skip('pastes the copy beside the entry of its name', async () => {
    const { at, bt } = await twoSides('fixtures/compressed.sldd');
    const errors: string[] = [];
    bt.subscribe((change) => void (change.kind === 'error' && errors.push(change.message)));
    at.dragStart([rowNamed(await rowsOf(at), 'Kp').ID]);
    await bt.drop('section:design', 'copy');
    at.dragEnd();
    await settle();
    expect(errors).toEqual([]);
    expect(namesUnder(await rowsOf(bt), 'section:design')).toEqual(['Kp', 'Kp1']);
  });
});
