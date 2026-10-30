// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/multiDelete.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/structuralRefusals.test.ts at c73da3c
//
// Deleting many rows at once, and an Add Child, a Delete or an Add the file will not take, run
// against view's JSON dictionary engine through the messages its table sends, over the page's own
// text (the TextDocument's stand-in): each suite's text-dictionary half. The compressed-binary
// halves are test/binaryEngine/structural.test.ts; the refusals here are compared with the MAT-file
// engine's and the binary dictionary engine's, as the extension compares its three editors. A delete
// paints at once and writes its text a turn later, so each case waits for the text to move, or for a
// word.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { fixture as matFixture, open as openMat, tableOf } from '../matEngine/harness.js';
import { open as openBinary, PARAMS as BINARY_PARAMS } from '../binaryEngine/harness.js';
import { chunkOf, entryNames, open, settle, waitFor, WORKSPACE_DATA, WORKSPACE_PARAMS } from './harness.js';

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

// An ARRAY's child rows, which core labels `name(3)` / `name{1,2}`: a position rather than a name,
// so the file never spells it.
const isElementRow = (row: any): boolean => /[({][\d,\s]+[)}]$/.test(nameOf(row));

// What the host says when a delete does not happen: a failure in the banner (`error`), or a refusal
// in its dialog (`refused`: a child its parent will not give up).
const isReport = (m: any): boolean => m.type === 'error' || m.type === 'refused';

/**
 * Open a JSON fixture, let the caller choose a selection out of the rows the engine sent, send the
 * delete, and hand back what came of it.
 */
async function deleteFromJson(
  rel: string,
  pick: (rows: any[]) => string[],
): Promise<{ before: string; after: string; versions: number; posts: any[]; rows: any[] }> {
  const o = await open(rel);
  const opened = o.view.posts.filter((m) => m.type === 'setRows').pop();
  assert.ok(opened, 'the first paint sent the whole table');
  const rows = opened.rows as any[];
  const before = o.text.text;
  const rowIds = pick(rows);
  assert.ok(rowIds.length > 1, 'this file is about MULTI-row deletes');
  const versionBefore = o.text.version;
  o.view.posts.length = 0;
  o.view.send({ type: 'delete', rowIds });
  // Done means one of two things, and a refusal is one of them: the no-operands case writes
  // nothing at all and reports instead.
  await waitFor(
    'the delete to be applied or refused',
    () =>
      o.view.posts.some(isReport) ||
      (o.text.version > versionBefore && o.view.posts.some((m) => m.type === 'updateEntryRows' || m.type === 'setRows')),
  );
  // An error after the write can only be given time.
  await settle();
  const after = o.text.text;
  assert.ok(!o.view.posts.some(isReport), `no error was reported (${JSON.stringify(o.view.posts.filter(isReport))})`);
  return { before, after, versions: o.text.version - versionBefore, posts: o.view.posts, rows };
}

describe('Select-all then Delete, on a JSON .sldd', () => {
  it('empties every section, in ONE write, and says where the selection went', async () => {
    // Collapsed: the visible rows are the headers and the top-level entries.
    const run = await deleteFromJson(WORKSPACE_DATA, (rows) => rows.filter((r) => isHeader(r) || isEntryRow(r)).map((r) => r.ID));
    assert.deepStrictEqual(entryNames(run.after), [], 'every entry is gone');
    assert.strictEqual(run.versions, 1, 'one write, so one undo step');
    // The sections themselves survive: a dictionary with no `entries` array at all does not reopen.
    const chunk = chunkOf(run.after);
    assert.ok(Array.isArray(chunk.entries), 'the entries array is still there, just empty');
    assert.ok(Array.isArray(chunk['Dictionary References']), 'and so is the other section');
    assert.strictEqual(chunk.AllowAccessBWS, false, 'and the sibling properties are untouched');
    // Nothing is left selected that no longer exists. The table asks for a landing row.
    const landed = run.posts.filter((m) => m.type === 'selectRows').pop();
    assert.ok(landed, 'the host named a row for the selection to land on');
    assert.deepStrictEqual(
      (landed.rowIds as string[]).filter((id) => !id.startsWith('section:')),
      [],
      `with every entry gone the only place left is a header (got ${JSON.stringify(landed.rowIds)})`,
    );
    assert.ok(landed.rowIds.length, 'and it named one');
  });

  it('collapsed and expanded select-all produce the SAME file', async () => {
    const collapsed = await deleteFromJson(WORKSPACE_DATA, (rows) => rows.filter((r) => isHeader(r) || isEntryRow(r)).map((r) => r.ID));
    const expanded = await deleteFromJson(WORKSPACE_DATA, (rows) => {
      const ids = rows.map((r) => r.ID);
      assert.ok(ids.length > rows.filter((r) => isHeader(r) || isEntryRow(r)).length, 'data.sldd has nested children');
      return ids;
    });
    assert.strictEqual(expanded.before, collapsed.before, 'both started from the same fixture');
    assert.strictEqual(expanded.after, collapsed.after, 'the child ids changed nothing: one file, two selections');
    assert.strictEqual(expanded.versions, 1, 'still one write');
  });
});

describe('A scattered multi-row delete, on a JSON .sldd', () => {
  it('takes exactly what was named, subsumes the rest, and leaves the file otherwise alone', async () => {
    // Entries that are not adjacent, all but one child of a container that SURVIVES, a child whose
    // own entry is also selected, a section header, and an id for a row that is not there.
    const expectedGone = ['MyAlias', 'myStruct', 'u8Scalar'];
    let hostName = '';
    let hostId = '';
    let hostKeeps = '';
    const run = await deleteFromJson(WORKSPACE_PARAMS, (rows) => {
      // A container whose children are NAMED fields, may be removed, and is not itself selected:
      // the widest such, minus every child but its last.
      const containers = rows
        .filter(isEntryRow)
        .filter((row) => !expectedGone.includes(nameOf(row)))
        .map((row) => ({ row, kids: childrenOf(rows, row.ID) }))
        .filter((c) => c.kids.length >= 2 && c.kids.every((k) => k._canDelete !== false && !isElementRow(k)))
        .sort((a, b) => b.kids.length - a.kids.length);
      assert.ok(containers.length, 'params.sldd has a container of named, removable fields');
      const { row: host, kids } = containers[0];
      hostName = nameOf(host);
      hostId = host.ID;
      hostKeeps = nameOf(kids[kids.length - 1]);
      const struct = rowNamed(rows, 'myStruct');
      const structKids = childrenOf(rows, struct.ID);
      assert.ok(structKids.length >= 1, 'myStruct has a child to be subsumed');
      return [
        rowNamed(rows, 'MyAlias').ID,
        rowNamed(rows, 'u8Scalar').ID,
        struct.ID,
        structKids[0].ID, // subsumed: its entry is going anyway
        ...kids.slice(0, -1).map((k) => k.ID),
        rows.find(isHeader)!.ID, // a header is not an operand
        `${rows[1].ID}/NoSuchChildAnywhere`, // and neither is a row that does not exist
      ];
    });

    const namesAfter = entryNames(run.after);
    for (const gone of expectedGone) assert.ok(!namesAfter.includes(gone), `"${gone}" was deleted`);
    assert.strictEqual(namesAfter.length, entryNames(run.before).length - expectedGone.length, 'and nothing else was');
    assert.ok(namesAfter.includes(hostName), 'the container whose children went survives');
    assert.strictEqual(run.versions, 1, 'one write for the whole scattered gesture');
    assert.deepStrictEqual(
      chunkOf(run.after)['Dictionary References'],
      chunkOf(run.before)['Dictionary References'],
      'the Dictionary References section is what it was',
    );
    // The container's children went too, and the surviving one survived: asserted on the repaint,
    // the table's own answer to "what is left".
    const paint = run.posts.filter((m) => m.type === 'updateEntryRows' && m.entryRowId === hostId).pop();
    assert.ok(paint, `the surviving container "${hostName}" was repainted`);
    assert.deepStrictEqual(childrenOf(paint.rows as any[], hostId).map(nameOf), [hostKeeps], `"${hostName}" kept exactly the one child left out`);
    const entryIn = (text: string) => (chunkOf(text).entries as any[]).find((e) => e.name === hostName);
    assert.notDeepStrictEqual(entryIn(run.after), entryIn(run.before), `the children deleted from "${hostName}" were written out`);
    // Every deleted entry leaves the table as the protocol spells a removal: a repaint of its own
    // subtree with NOTHING in it.
    for (const gone of expectedGone) {
      const removals = run.posts.filter((m) => m.type === 'updateEntryRows' && String(m.entryRowId).endsWith(`/${gone}`));
      assert.ok(removals.length, `"${gone}" was taken off the table too, not just out of the file`);
      for (const removal of removals) assert.deepStrictEqual(removal.rows, [], `and left no rows behind ("${gone}")`);
    }
  });

  it('a selection of nothing but headers and stale ids is refused, not half-applied', async () => {
    const o = await open(WORKSPACE_DATA);
    const rows = o.view.posts.filter((m) => m.type === 'setRows').pop()!.rows as any[];
    const before = o.text.text;
    const version = o.text.version;
    o.view.posts.length = 0;
    o.view.send({ type: 'delete', rowIds: [...rows.filter(isHeader).map((r) => r.ID), 'not-a-row-id', `${rows[1].ID}/nope`] });
    await waitFor('the refusal', () => o.view.posts.some((m) => m.type === 'error'));
    await settle();
    assert.strictEqual(o.text.text, before, 'the document was not touched');
    assert.strictEqual(o.text.version, version, 'and no write was attempted');
    assert.ok(o.view.posts.some((m) => m.type === 'error'), `the user was told (saw ${JSON.stringify(o.view.posts.map((m) => m.type))})`);
  });
});

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
    name: 'a text dictionary',
    open: async () => {
      const j = await open(WORKSPACE_PARAMS, undefined, { as: 'refusals.sldd' });
      const version = j.text.version;
      return {
        view: j.view,
        rows: () => lastRows(j.view.posts),
        touched: () => j.text.version !== version || j.text.dirty,
        add: (className) => ({ type: 'addEntry', section: 'design', className, rename: false }),
        session: j.session,
      };
    },
  },
  {
    name: 'a binary dictionary',
    open: async () => {
      const b = await openBinary(BINARY_PARAMS, undefined, { as: 'refusals.sldd' });
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

// The rows are the same in the three files: `cplxScalar`, a complex double, which takes no child,
// and the elements of `mat2x3`, a 2x3 double, which cannot leave it without breaking its shape. The
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
    await waitFor('the answer', () => answer().some((m) => m.type === 'refused' || m.type === 'error'));
    await settle();
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

  it('and the three editors said the same of the same rows', () => {
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
