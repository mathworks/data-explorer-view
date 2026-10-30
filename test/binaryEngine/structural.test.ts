// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/multiDelete.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/structuralRefusals.test.ts at c73da3c
//
// Deleting many rows at once, and an Add Child, a Delete or an Add the file will not take, run
// against view's binary dictionary engine through the messages its table sends. Each suite's
// compressed-binary half is here; its text-dictionary half waits for the JSON engine (C3). The
// refusals are compared with the MAT-file engine's, the other table editor view already has.
import * as assert from 'node:assert';
import { SC_PART_XML } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { fixture as matFixture, open as openMat, tableOf } from '../matEngine/harness.js';
import { file, membersOf, open, PARAMS, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const isHeader = (row: any): boolean => String(row.ID).startsWith('section:');
const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
const nameOf = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');
const childrenOf = (rows: any[], parentId: string): any[] => rows.filter((r) => r.parent === parentId);
const rowNamed = (rows: any[], name: string): any => {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
};

// What the host says when a delete does not happen: a failure in the banner (`error`), or a
// refusal in its dialog (`refused`: a child its parent will not give up).
const isReport = (m: any): boolean => m.type === 'error' || m.type === 'refused';

// The fixture is the extension's vitest architectural dictionary. It carries a pass-through zip
// member (System Composer's catalog) that the editor never edits and must re-zip verbatim, which
// makes it the fixture that can show a delete damaging a part of the file it had no business
// touching.
const ARCH = 'test/fixtures/arch_binary.sldd';
const ARCH_ENTRIES = ['StructType', 'DataInterface', 'ValueType'];

/** How many DD.ENTRY objects the payload spells. */
const entryCountOfXml = (xml: string): number => (xml.match(/Class="DD\.ENTRY"/g) ?? []).length;

/** Whether the payload names something — an entry, or an element of one. */
const namesInXml = (xml: string, name: string): boolean => xml.includes(`>${name}</P>`);

/**
 * Open the fixture, choose a selection from the rows the engine sent, send the delete, then SAVE:
 * on this format the payload and the file are two different things, and a delete that got the
 * payload right can still write a broken zip.
 */
async function deleteFromBinary(pick: (rows: any[]) => string[]) {
  const o = await open(ARCH);
  // No settle anywhere in here: the engine answers `ready` and `delete` synchronously.
  const opened = o.view.posts.filter((m) => m.type === 'setRows').pop();
  assert.ok(opened, 'the first paint sent the whole table');
  const rows = opened.rows as any[];
  const before = o.engine.chunkXml;
  const rowIds = pick(rows);
  assert.ok(rowIds.length > 1, 'this file is about MULTI-row deletes');
  o.view.posts.length = 0;
  o.view.send({ type: 'delete', rowIds });
  const after = o.engine.chunkXml;
  assert.ok(!o.view.posts.some(isReport), `no error was reported (${JSON.stringify(o.view.posts.filter(isReport))})`);
  const saved = membersOf(o.save());
  return { before, after, edits: o.events.length, posts: o.view.posts, rows, saved };
}

/** The fixture's own copy of a zip member, to compare a saved one against. */
function archMember(member: string): Uint8Array {
  const bytes = membersOf(file(ARCH))[member];
  assert.ok(bytes, `the fixture carries ${member}`);
  return bytes;
}

describe('The same two gestures, on a compressed-binary .sldd', () => {
  it('select-all empties the payload in ONE edit, and the file it saves is still a dictionary', async () => {
    const run = await deleteFromBinary((rows) => rows.filter((r) => isHeader(r) || isEntryRow(r)).map((r) => r.ID));
    assert.strictEqual(entryCountOfXml(run.before), ARCH_ENTRIES.length, 'the fixture had three');
    assert.strictEqual(entryCountOfXml(run.after), 0, 'and the payload holds none');
    for (const name of ARCH_ENTRIES) assert.ok(!namesInXml(run.after, name), `"${name}" is gone from the payload`);
    // One edit on the document's own stack: one Ctrl+Z puts it all back.
    assert.strictEqual(run.edits, 1, 'one document edit, so one undo step');

    const chunk = run.saved['data/chunk0.xml'];
    assert.ok(chunk, 'the saved file still holds data/chunk0.xml');
    assert.strictEqual(new TextDecoder().decode(chunk), run.after, 'and it is the emptied payload');
    assert.ok(run.saved['metadata/mwcoreProperties.xml'], 'the metadata part came through too');
    // The part the editor never touches, byte for byte, after the widest edit there is.
    assert.deepStrictEqual(run.saved[SC_PART_XML], archMember(SC_PART_XML), 'the pass-through part survived the widest delete there is');

    const landed = run.posts.filter((m) => m.type === 'selectRows').pop();
    assert.ok(landed, 'the host named a row for the selection to land on');
    assert.deepStrictEqual(
      (landed.rowIds as string[]).filter((id) => !id.startsWith('section:')),
      [],
      `with every entry gone the only place left is a header (got ${JSON.stringify(landed.rowIds)})`,
    );
    assert.ok(landed.rowIds.length, 'and it named one');
  });

  it('collapsed and expanded select-all produce the SAME payload', async () => {
    // Here the redundant child ids are bus elements whose owning entry is in the same selection,
    // and this is the path where dropping subsumption fails loudest.
    const collapsed = await deleteFromBinary((rows) => rows.filter((r) => isHeader(r) || isEntryRow(r)).map((r) => r.ID));
    const expanded = await deleteFromBinary((rows) => {
      const ids = rows.map((r) => r.ID);
      assert.ok(ids.length > rows.filter((r) => isHeader(r) || isEntryRow(r)).length, 'the fixture has nested children, so expanded really is a wider selection');
      return ids;
    });
    assert.strictEqual(expanded.before, collapsed.before, 'both started from the same fixture');
    assert.strictEqual(expanded.after, collapsed.after, 'the child ids changed nothing: one payload, two selections');
    assert.strictEqual(expanded.edits, 1, 'still one edit');
  });

  it('a scattered selection takes the entry and the child it named, and nothing adjacent', async () => {
    // One whole entry and one CHILD of a different entry, in a single message: the two shapes the
    // fold puts together, spliced in the right order.
    const run = await deleteFromBinary((rows) => {
      const struct = rowNamed(rows, 'StructType');
      const kids = childrenOf(rows, struct.ID);
      assert.deepStrictEqual(kids.map(nameOf), ['Element'], 'StructType has the one bus element');
      return [
        rowNamed(rows, 'DataInterface').ID, // a whole entry
        kids[0].ID, // and a child of an entry that STAYS
        rows.find(isHeader)!.ID, // a header is not an operand
        `${struct.ID}/NoSuchElementAnywhere`, // and neither is a row that does not exist
      ];
    });

    assert.ok(!namesInXml(run.after, 'DataInterface'), 'the entry that was named is gone');
    assert.ok(namesInXml(run.after, 'StructType'), 'the entry that only lost a child survives');
    assert.ok(!namesInXml(run.after, 'Element'), 'without the element that was named');
    assert.ok(namesInXml(run.after, 'ValueType'), 'and the entry nobody named is untouched');
    assert.strictEqual(entryCountOfXml(run.after), 2, 'exactly one entry left');
    assert.strictEqual(run.edits, 1, 'one edit for the whole scattered gesture');

    // The table agrees: the child's entry was repainted without it, and the deleted entry left by
    // a repaint with no rows in it.
    const paints = run.posts.filter((m) => m.type === 'updateEntryRows');
    const structPaint = paints.filter((m) => String(m.entryRowId).endsWith('/StructType')).pop();
    assert.ok(structPaint, 'StructType was repainted');
    const structRows = structPaint.rows as any[];
    assert.ok(structRows.length, 'and it is still on the table');
    assert.deepStrictEqual(structRows.filter((r) => r.parent === structPaint.entryRowId).map(nameOf), [], 'with no children under it');
    const gonePaint = paints.filter((m) => String(m.entryRowId).endsWith('/DataInterface')).pop();
    assert.ok(gonePaint, 'DataInterface was taken off the table too');
    assert.deepStrictEqual(gonePaint.rows, [], 'and left no rows behind');

    assert.strictEqual(new TextDecoder().decode(run.saved['data/chunk0.xml']), run.after, 'the save wrote the payload the delete produced');
    assert.deepStrictEqual(run.saved[SC_PART_XML], archMember(SC_PART_XML), 'and left the pass-through part alone');
  });
});

// This format's undo is the document's own: the delete pushes the chunk and a patch of entry ops,
// and undo applies the inverse ops to the model in place. [P, Q, R] with P and Q deleted used to
// come back as [P, R, Q]: the chunk was right, the model and the rows on screen were not.
describe('Undo of a multi-entry delete, on a compressed-binary .sldd', () => {
  it('puts the entries back in the order they had, in the model it already holds', async () => {
    const o = await open(PARAMS);
    const model: any = o.model();
    assert.ok(model, 'the first paint registered the model');
    const inventory = () => (model.children as any[]).map((s: any) => (s.children as any[]).map((e: any) => e.name));
    const section = (model.children as any[]).find((s: any) => s.children.length >= 3);
    assert.ok(section, 'a section with three neighbours');
    const [p, q, r] = (section.children as any[]).slice(0, 3);
    const before = inventory();
    const chunkBefore = o.engine.chunkXml;

    o.view.posts.length = 0;
    o.view.send({ type: 'delete', rowIds: [p.id, q.id] });
    assert.deepStrictEqual(o.view.posts.filter(isReport), [], 'the delete is applied');
    assert.strictEqual(o.events.length, 1, 'as one edit');
    assert.strictEqual(section.children[0], r, `${p.name} and ${q.name} left, so ${r.name} leads`);

    o.undo();
    assert.strictEqual(o.engine.chunkXml, chunkBefore, 'the undo restores the chunk');
    assert.strictEqual(o.model(), model, 'from the ops, not by re-reading it');
    assert.deepStrictEqual(inventory(), before, `and ${p.name}, ${q.name}, ${r.name} are back in that order`);

    o.redo();
    assert.strictEqual(section.children[0], r, 'the redo removes them again');
  });
});

/** A table editor's document, as the refusals suite asks of it. */
interface Tab {
  view: { posts: any[]; send(message: any): void };
  /** The rows the table holds now. */
  rows(): any[];
  /** Whether any edit reached the document since it was opened, and whether it is dirty. */
  touched(): boolean;
  /** The Add of `className` as the gallery sends it here. */
  add(className: string): any;
  /** Core's session, which answers why a gesture is refused. */
  session: any;
}

const lastRows = (posts: any[]): any[] => posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];

const EDITORS: { name: string; open(): Promise<Tab> }[] = [
  {
    name: 'a MAT-file',
    open: async () => {
      const m = await openMat('refusals.mat', matFixture('cases.mat'));
      return {
        view: m.view,
        rows: () => tableOf(m.view.posts),
        touched: () => m.events.length > 0 || m.index.dirty,
        add: (className) => ({ type: 'addEntry', section: '', className, rename: false }),
        session: m.session,
      };
    },
  },
  {
    name: 'a binary dictionary',
    open: async () => {
      const b: Opened = await open(PARAMS, undefined, { as: 'refusals.sldd' });
      return {
        view: b.view,
        rows: () => lastRows(b.view.posts),
        touched: () => b.events.length > 0 || b.index.dirty,
        add: (className) => ({ type: 'addEntry', section: 'design', className, rename: false }),
        session: b.session,
      };
    },
  },
];

// The rows are the same in both files: `cplxScalar`, a complex double, which takes no child, and
// the elements of `mat2x3`, a 2x3 double, which cannot leave it without breaking its shape. The
// Add is of a Simulink.ConfigSet, which neither a MAT-file nor a dictionary's Design Data takes.
describe('An Add Child, a Delete or an Add the file will not take is refused alike in every table editor', () => {
  // What each editor said, per gesture, for the cross-editor comparison at the end.
  const said: Record<string, Record<string, any>> = {};

  // A MAT-file's variables are its top rows, a dictionary's entries the rows under its sections.
  const tops = (tab: Tab): any[] => tab.rows().filter((r) => r.parent == null || isEntryRow(r));
  const topRow = (tab: Tab, name: string): any => {
    const row = tops(tab).find((r) => nameOf(r) === name);
    assert.ok(row, `the table has a row for "${name}" (it has ${tops(tab).map(nameOf).join(', ')})`);
    return row;
  };
  const kidsOf = (tab: Tab, row: any): any[] => tab.rows().filter((r) => r.parent === row.ID);

  /** Send `message`, and answer what the host posted back once it has had its say. */
  const refusalOf = async (tab: Tab, message: any): Promise<{ refused: any[]; errors: any[] }> => {
    const mark = tab.view.posts.length;
    const answer = () => tab.view.posts.slice(mark);
    tab.view.send(message);
    for (let i = 0; i < 50 && !answer().some((m) => m.type === 'refused' || m.type === 'error'); i++) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
    return {
      refused: answer()
        .filter((m) => m.type === 'refused')
        .map(({ title, reason }) => ({ title, reason })),
      errors: answer().filter((m) => m.type === 'error' || m.type === 'validationError'),
    };
  };

  for (const editor of EDITORS) {
    it(`in ${editor.name}`, async () => {
      const tab = await editor.open();
      const scalar = topRow(tab, 'cplxScalar');
      assert.strictEqual(scalar._canAddChild, false, 'the menu greys Add Child on it');
      const elements = kidsOf(tab, topRow(tab, 'mat2x3'));
      assert.strictEqual(elements.length, 6, 'the 2x3 matrix shows its six elements');
      assert.strictEqual(elements[0]._canDelete, false, 'the menu greys Delete on them');

      // Core's own answer for each, asked of the rows this editor's file holds.
      const noChild = tab.session.addChildRefusal(scalar.ID);
      const noDelete = tab.session.deleteRefusal(elements[0].ID);
      assert.match(String(noChild), /^Cannot add to "cplxScalar": .+\. Nothing was added\.$/);
      assert.match(String(noDelete), /^Cannot delete "mat2x3\(1,1\)": .+\. Nothing was deleted\.$/);

      const cases: [string, any, { title: string; reason: string | RegExp }][] = [
        ['addChild', { type: 'addChild', rowId: scalar.ID }, { title: 'Cannot Add Child', reason: noChild! }],
        ['delete one', { type: 'delete', rowIds: [elements[0].ID] }, { title: 'Cannot Delete', reason: noDelete! }],
        ['delete two', { type: 'delete', rowIds: [elements[0].ID, elements[1].ID] }, { title: 'Cannot Delete', reason: noDelete! }],
        ['add', tab.add('Simulink.ConfigSet'), { title: 'Cannot Add', reason: /^Cannot add a Simulink\.ConfigSet to "[^"]+": .+\.$/ }],
      ];
      const topsBefore = tops(tab).length;
      said[editor.name] = {};
      for (const [what, message, expected] of cases) {
        const { refused, errors } = await refusalOf(tab, message);
        assert.deepStrictEqual(errors, [], `${what}: no failure is reported`);
        assert.strictEqual(refused.length, 1, `${what}: refused in the dialog (${JSON.stringify(refused)})`);
        assert.strictEqual(refused[0].title, expected.title, `${what}: titled by the gesture`);
        if (expected.reason instanceof RegExp) assert.match(refused[0].reason, expected.reason, `${what}: in core's words`);
        else assert.strictEqual(refused[0].reason, expected.reason, `${what}: in core's words`);
        assert.strictEqual(tab.touched(), false, `${what}: nothing was written`);
        said[editor.name][what] = refused;
      }
      assert.strictEqual(kidsOf(tab, topRow(tab, 'mat2x3')).length, 6, 'the matrix keeps its elements');
      assert.strictEqual(tops(tab).length, topsBefore, 'no entry was added');
    });
  }

  it('and the editors said the same of the same rows', () => {
    const names = EDITORS.map((e) => e.name);
    assert.deepStrictEqual(Object.keys(said), names, 'every editor was asked');
    for (const name of names) {
      assert.deepStrictEqual(Object.keys(said[name]), ['addChild', 'delete one', 'delete two', 'add'], `${name} answered every gesture`);
    }
    // The Add names where it was refused, a file or a section, so it is the one that differs.
    const same = (name: string) => ({ ...said[name], add: undefined });
    for (const name of names.slice(1)) assert.deepStrictEqual(same(name), same(names[0]), `${name} says what ${names[0]} says`);
  });
});
