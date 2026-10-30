// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/binaryEntryScopedEdit.test.ts at c73da3c
// Ported from data-explorer-vscode test/binaryDirtyLifecycle.test.ts at c73da3c
// Ported from data-explorer-vscode test/addEntryHost.test.ts at c73da3c
// Ported from data-explorer-vscode test/duplicateNameIdentity.test.ts at c73da3c
//
// The binary dictionary editor's entry-scoped repaint, its Status column, its Add and its
// same-named entries, run against view's binary dictionary engine. The extension's unit suites
// could not run its provider (it imports `vscode`), so they rebuilt its composition from the
// modules it is made of; here the composition is the engine itself, driven through the messages
// its table sends, and what each case held to is held to the engine's own posts:
//
//  1. NARROW === WIDE. The rows an edit, an undo or a redo splices into the rows on screen are,
//     row for row, what a whole paint from the chunk (which re-parses it) paints.
//  2. The row ids a narrow repaint paints still RESOLVE in the session, so the next edit on one
//     of them works.
//
// What those suites asked of the modules alone (entryOps' and xmlStructuralEdit's own rules, a
// selector's fallbacks, rowBuilder's Status rule) is core's (C3) and view's rowBuilder's, and is
// tested there. A JSON dictionary's half, and the cases that hold the two formats to each other,
// wait for the JSON engine (C3).
import * as assert from 'node:assert';
import { entrySelectorOf } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, insertEntryRows, spliceEntryRows } from '../../src/model/index.js';
import { entryOf, file, open, PARAMS, readSldd, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * The rows the table holds now: the last whole paint, with every narrow repaint after it folded in
 * as the table folds them (rowUpdates.ts). A narrow message the rows cannot place is the failure the
 * table answers by asking for a whole paint, so it fails here.
 */
function onScreen(posts: any[]): any[] {
  let rows: any[] = [];
  for (const p of posts) {
    if (p.type === 'setRows') rows = p.rows;
    else if (p.type === 'updateEntryRows') {
      const next = spliceEntryRows(rows, p.entryRowId, p.rows);
      assert.ok(next, `the update of ${p.entryRowId} lands in the rows on screen`);
      rows = next;
    } else if (p.type === 'insertEntryRows') {
      const next = insertEntryRows(rows, p.sectionRowId, p.beforeRowId, p.rows);
      assert.ok(next, `the insert under ${p.sectionRowId} lands in the rows on screen`);
      rows = next;
    }
  }
  return rows;
}

/**
 * The whole table painted again from the chunk: what a wide repaint (which re-parses the chunk and
 * registers the tree again) paints. Anything read from the model after this is read again by name:
 * the tree is a new one.
 */
function wide(o: Opened): any[] {
  const at = o.view.posts.length;
  void o.view.source.repaintAll();
  const paint = o.view.posts.slice(at).find((p) => p.type === 'setRows');
  assert.ok(paint, 'the whole table was painted');
  return paint.rows;
}

/** That the rows on screen are what a whole paint paints. */
function assertNarrowIsWide(o: Opened, what: string): any[] {
  const narrow = onScreen(o.view.posts);
  assert.deepStrictEqual(narrow, wide(o), what);
  return narrow;
}

/** Every row of `rows` but a section header names a node the session can still find. */
function assertRowsResolve(o: Opened, rows: any[]): void {
  for (const row of rows) {
    if (String(row.ID).startsWith('section:')) continue;
    assert.ok(o.session.findNodeById(row.ID), `row ${row.ID} resolves to a node`);
  }
}

/** The entry `name`, in any section of the tree the session holds now. */
const entryNamed = (o: Opened, name: string): any => entryOf(o.model(), name);

/** The rows of the newest narrow repaint of `entryRowId`. */
const repaintOf = (o: Opened, entryRowId: string): any[] => {
  const p = o.view.posts.filter((m) => m.type === 'updateEntryRows' && m.entryRowId === entryRowId).pop();
  assert.ok(p, `${entryRowId} was repainted`);
  return p.rows;
};

const send = (o: Opened, message: any): any[] => {
  const at = o.view.posts.length;
  o.view.send(message);
  const posts = o.view.posts.slice(at);
  assert.deepStrictEqual(
    posts.filter((m) => m.type === 'error' || m.type === 'validationError' || m.type === 'refused'),
    [],
    `${message.type}: nothing was refused or failed`,
  );
  return posts;
};

const editCell = (o: Opened, node: any, columnId: string, newValue: string) =>
  send(o, { type: 'edit', rowId: node.id, columnId, oldValue: '', newValue });

describe('binary .sldd entry-scoped repaint — narrow paint equals wide paint', () => {
  it('a value edit: spliced rows are identical to a full rebuild', async () => {
    const o = await open(PARAMS);
    editCell(o, entryNamed(o, 'scalarD'), 'Value', '42');
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });

  it('a rename: spliced rows are identical to a full rebuild, and the new ids resolve', async () => {
    const o = await open(PARAMS);
    const entry = entryNamed(o, 'scalarD');
    const entryRowId = entry.id;
    editCell(o, entry, 'Name', 'scalarRenamed');
    const entryRows = repaintOf(o, entryRowId);
    assert.notStrictEqual(entryRows[0].ID, entryRowId);
    assertRowsResolve(o, entryRows);
    // The id the table used to show this entry under is gone, so a stale row id cannot route an
    // edit at a node that has since moved.
    assert.strictEqual(o.session.findNodeById(entryRowId), null);
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });

  it('a rename of an entry WITH children rekeys the children too', async () => {
    const o = await open(PARAMS);
    const bus = entryNamed(o, 'MyBus');
    assert.ok(bus.children.length > 0);
    const entryRowId = bus.id;
    const childIdsBefore = bus.children.map((c: any) => c.id);
    editCell(o, bus, 'Name', 'MyRenamedBus');
    const entryRows = repaintOf(o, entryRowId);
    assert.strictEqual(entryRows.length, 1 + bus.children.length);
    assertRowsResolve(o, entryRows);
    for (const stale of childIdsBefore) assert.strictEqual(o.session.findNodeById(stale), null);
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });

  it('an edit on a nested child paints the whole entry subtree', async () => {
    const o = await open(PARAMS);
    const struct = entryNamed(o, 'myStruct');
    const field = struct.children[0];
    editCell(o, field, 'Value', '7');
    assert.ok(repaintOf(o, struct.id).map((r: any) => r.ID).includes(field.id));
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });

  it('adding a child grows the entry run and the new row resolves', async () => {
    const o = await open(PARAMS);
    const bus = entryNamed(o, 'MyBus');
    const entryRowId = bus.id;
    const runBefore = onScreen(o.view.posts).filter((r: any) => r.ID === entryRowId || r.parent === entryRowId).length;
    send(o, { type: 'addChild', rowId: bus.id });
    const entryRows = repaintOf(o, entryRowId);
    assert.strictEqual(entryRows.length, runBefore + 1);
    // The child the user is about to be selected on, and may edit next.
    assertRowsResolve(o, entryRows);
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });

  it('deleting a nested child shrinks the entry run and drops its id', async () => {
    const o = await open(PARAMS);
    const bus = entryNamed(o, 'MyBus');
    const elementId = bus.children[0].id;
    send(o, { type: 'delete', rowIds: [elementId] });
    assert.ok(!repaintOf(o, bus.id).map((r: any) => r.ID).includes(elementId));
    // Not merely absent from the rows: gone from the index.
    assert.strictEqual(o.session.findNodeById(elementId), null);
    assertNarrowIsWide(o, 'the spliced rows are the full rebuild');
  });
});

describe('binary .sldd entry-scoped repaint — the Modified mark', () => {
  it('marks the edited entry, and only it', async () => {
    const o = await open(PARAMS);
    const entry = entryNamed(o, 'scalarD');
    editCell(o, entry, 'Value', '42');
    assert.strictEqual(repaintOf(o, entry.id)[0].Status, 'Modified');
    const gravity = onScreen(o.view.posts).find((r) => r.ID === entryNamed(o, 'gravity').id);
    assert.ok(!gravity.Status, 'an entry nobody edited is not marked');
  });

  it('stays marked when an entry is edited BACK to its saved value', async () => {
    // The value round-trips exactly, but a dictionary entry carries a lastModified stamp that every
    // edit rewrites, so its canonical JSON no longer matches the baseline: it is still, correctly,
    // modified with respect to the last SAVE. Both repaint paths agree on that.
    const o = await open(PARAMS);
    const entry = entryNamed(o, 'scalarD');
    const original = entry.toRow().Value;
    editCell(o, entry, 'Value', '42');
    editCell(o, entryNamed(o, 'scalarD'), 'Value', String(original));
    assert.strictEqual(entryNamed(o, 'scalarD').toRow().Value, original);
    assert.strictEqual(repaintOf(o, entry.id)[0].Status, 'Modified');
    const marked = wide(o).filter((r) => r.Status === 'Modified').map((r) => r.Name?.label);
    assert.deepStrictEqual(marked, ['scalarD']);
  });

  it('is dropped by an undo that restores the pre-edit record', async () => {
    const o = await open(PARAMS);
    // Read before the undo, which rebuilds the entry from its record: the node read here leaves the tree.
    const entryRowId = entryNamed(o, 'scalarD').id;
    editCell(o, entryNamed(o, 'scalarD'), 'Value', '42');
    assert.strictEqual(repaintOf(o, entryRowId)[0].Status, 'Modified');
    o.undo();
    assert.ok(!repaintOf(o, entryRowId)[0].Status, 'the undone entry is not marked');
    assert.deepStrictEqual(wide(o).filter((r) => r.Status === 'Modified'), []);
  });

  it('the narrow mark of one entry answers what the whole paint answers for all', async () => {
    // Two repaint paths ask the same question; if they can disagree, a Modified dot appears or
    // clears depending on which repaint the user happened to trigger.
    const o = await open(PARAMS);
    const bus = entryNamed(o, 'MyBus');
    editCell(o, bus.children[0], 'Name', 'RenamedElement');
    const narrow = onScreen(o.view.posts);
    const whole = wide(o);
    const statusOf = (rows: any[]) => new Map(rows.filter((r) => String(r.parent ?? '').startsWith('section:')).map((r) => [r.ID, r.Status]));
    assert.deepStrictEqual(statusOf(narrow), statusOf(whole));
    assert.deepStrictEqual(
      whole.filter((r) => r.Status === 'Modified').map((r) => r.Name?.label),
      ['MyBus'],
    );
  });
});

// An EDIT was fast but its UNDO took 5-9 s, because restoring the text was the whole edit and the
// repaint that followed re-parsed the dictionary. Undo, redo, delete and paste each state the
// entries they change as ops, applied to the live model and folded into the rows on screen. Plus
// the two that only ops can get wrong: a redo must restore what its undo took away (not re-run the
// edit that produced it), and inverses must be replayed in reverse order.
describe('binary .sldd entry ops — undo, redo, delete, paste', () => {
  it('undo and redo of a value edit are one replace op each', async () => {
    const o = await open(PARAMS);
    const originalValue = entryNamed(o, 'scalarD').toRow().Value;
    editCell(o, entryNamed(o, 'scalarD'), 'Value', '42');
    assertNarrowIsWide(o, 'the edit');
    o.undo();
    assert.strictEqual(entryNamed(o, 'scalarD').toRow().Value, originalValue);
    assertNarrowIsWide(o, 'its undo');
    o.redo();
    assert.strictEqual(entryNamed(o, 'scalarD').toRow().Value, '42');
    assertNarrowIsWide(o, 'its redo');
  });

  it('undo of a rename addresses the POST-rename id and puts the old one back', async () => {
    const o = await open(PARAMS);
    const bus = entryNamed(o, 'MyBus');
    const oldId = bus.id;
    const childIds = bus.children.map((c: any) => c.id);
    assert.ok(childIds.length > 0);
    editCell(o, bus, 'Name', 'MyRenamedBus');
    const newId = entryNamed(o, 'MyRenamedBus').id;
    assert.notStrictEqual(newId, oldId);
    o.undo();
    // The rows on screen carry the renamed id, so that is the run the undo replaces.
    assert.ok(o.view.posts.some((m) => m.type === 'updateEntryRows' && m.entryRowId === newId), 'the undo spliced the renamed run');
    // The rename's rekeying is undone for the entry AND for every descendant.
    assert.strictEqual(o.session.findNodeById(newId), null);
    assertRowsResolve(o, [{ ID: oldId }, ...childIds.map((id: string) => ({ ID: id }))]);
    assertNarrowIsWide(o, 'the undone rename');
  });

  it('deleting an entry and undoing it restores the same id at the same position', async () => {
    const o = await open(PARAMS);
    const entry = entryNamed(o, 'gravity');
    const entryRowId = entry.id;
    const index = entry.parent.children.indexOf(entry);
    send(o, { type: 'delete', rowIds: [entryRowId] });
    assert.strictEqual(o.session.findNodeById(entryRowId), null);
    assertNarrowIsWide(o, 'the delete');
    o.undo();
    const back = entryNamed(o, 'gravity');
    assert.strictEqual(back.id, entryRowId);
    assert.strictEqual(back.parent.children.indexOf(back), index);
    assertNarrowIsWide(o, 'its undo');
  });

  it('delete of MANY rows: one op list, and narrow === wide', async () => {
    // The whole gesture is one push: one `after` string and one patch.
    const o = await open(PARAMS);
    const before = o.engine.chunkXml;
    // Ids read while the nodes are attached: a node's id is its path, which a detached one has not.
    const otherId = entryNamed(o, 'gravity').id;
    const child = entryNamed(o, 'myStruct').children[0];
    assert.ok(child, 'the fixture’s struct has a field');
    const childId = child.id;
    send(o, { type: 'delete', rowIds: [otherId, childId] });
    assert.strictEqual(o.events.length, 1, 'one edit');
    const narrow = onScreen(o.view.posts);
    assert.ok(!narrow.some((r: any) => r.ID === otherId), 'the deleted entry’s run is gone');
    assert.ok(!narrow.some((r: any) => r.ID === childId), 'the deleted field’s row is gone');
    assertNarrowIsWide(o, 'the delete');
    // And the whole thing undoes in ONE step.
    o.undo();
    assert.strictEqual(o.engine.chunkXml, before);
    assert.ok(entryNamed(o, 'gravity'), 'the entry is back');
    assert.strictEqual(entryNamed(o, 'myStruct').children[0].id, childId, 'and the field');
    assertNarrowIsWide(o, 'its undo');
  });

  it('a paste inserts one entry run, and its redo keeps the pasted name and uuid', async () => {
    // Why an op carries a RECORD and not the edit that made it: pasting again would mint another
    // uuid and another unique name, so a "redo" would add a third entry rather than restore the one
    // undo took away.
    const o = await open(PARAMS);
    const gravity = entryNamed(o, 'gravity');
    const gravityUuid = gravity.metadata.uuid;
    send(o, { type: 'copy', rowIds: [gravity.id] });
    const posts = send(o, { type: 'paste', rowId: 'section:design' });
    // The paste's run is waited for: a paste is a transfer, which answers after a turn.
    for (let i = 0; i < 50 && !o.view.posts.some((m) => m.type === 'insertEntryRows'); i++) await new Promise((r) => setTimeout(r, 0));
    const inserts = o.view.posts.filter((m) => m.type === 'insertEntryRows');
    assert.strictEqual(inserts.length, 1, `one insert (${JSON.stringify(posts.map((p) => p.type))})`);
    // Appended, so it is its section's last entry and there is no row to insert before.
    assert.strictEqual(inserts[0].beforeRowId, undefined);
    const pasted = o.session.findNodeById(inserts[0].rows[0].ID) as any;
    const pastedName = pasted.name;
    const pastedUuid = pasted.metadata.uuid;
    assert.notStrictEqual(pastedName, 'gravity', 'uniquified across the namespace');
    assert.notStrictEqual(pastedUuid, gravityUuid, 'and a distinct object');
    assertRowsResolve(o, inserts[0].rows);
    assertNarrowIsWide(o, 'the paste');

    o.undo();
    assert.strictEqual(entryNamed(o, pastedName), undefined);
    assertNarrowIsWide(o, 'its undo');
    o.redo();
    assert.strictEqual(entryNamed(o, pastedName).metadata.uuid, pastedUuid);
    assertNarrowIsWide(o, 'its redo');
  });
});

describe('binary .sldd dirty-state / Modified lifecycle', () => {
  it('a value edit marks exactly that entry Modified vs the on-open baseline', async () => {
    const o = await open(PARAMS);
    assert.deepStrictEqual(
      o.view.posts.find((m) => m.type === 'setRows').rows.filter((r: any) => r.Status === 'Modified'),
      [],
      'nothing is Modified as opened',
    );
    const target = entryNamed(o, 'scalarD');
    assert.strictEqual(target.toRow()._valueEditable, true);
    editCell(o, target, 'Value', '42');
    const rows = wide(o);
    assert.strictEqual(rows.find((r: any) => r.Name?.label === 'scalarD').Status, 'Modified');
    const sibling = rows.find((r: any) => r.Name?.label && r.Name.label !== 'scalarD' && !String(r.ID).startsWith('section:'));
    assert.ok(!sibling.Status);
  });

  it('save re-baselines so no binary rows are Modified', async () => {
    const o = await open(PARAMS);
    editCell(o, entryNamed(o, 'scalarD'), 'Value', '42');
    assert.strictEqual(wide(o).filter((r) => r.Status === 'Modified').length, 1);
    const at = o.view.posts.length;
    o.save();
    const repaint = o.view.posts.slice(at).find((m) => m.type === 'setRows');
    assert.ok(repaint, 'a save paints the whole table');
    assert.strictEqual(repaint.rows.some((r: any) => r.Status === 'Modified'), false);
  });
});

/** The names of a section's entries, in the tree the session holds now. */
const sectionNames = (o: Opened, section: string): string[] =>
  (((o.model()?.children ?? []) as any[]).find((s) => s.name === section)?.children ?? []).map((e: any) => e.name);
const sectionOf = (o: Opened, section: string): any => ((o.model()?.children ?? []) as any[]).find((s) => s.name === section);

/** The newest selection the engine asked for. */
const selected = (o: Opened): string[] => o.view.posts.filter((m) => m.type === 'selectRows').pop()?.rowIds ?? [];

const add = (o: Opened, section: string, className: string, rename = false) =>
  o.view.send({ type: 'addEntry', section, className, rename });

describe('an add creates the entry core says it creates', () => {
  it('adds a Simulink.Parameter to Design Data, stamped and named by core', async () => {
    const o = await open(PARAMS);
    const before = sectionNames(o, 'design');
    add(o, 'design', 'Simulink.Parameter');
    const design = sectionOf(o, 'design');
    // The node the add attached: last in the section, where the chunk insertion puts it too.
    const node = (design.children as any[])[design.children.length - 1];
    assert.ok(!before.includes(node.name));
    assert.strictEqual(node.className, 'Simulink.Parameter');
    // Core's stamps, read and not computed.
    assert.strictEqual(node.status, 'New');
    assert.strictEqual(node.isDerived, false);
    assert.match(node.metadata.uuid, /[0-9a-f]/i);
    assert.strictEqual(node.metadata.isderived, '0');
    // The row the table is told to select is this node's.
    assert.deepStrictEqual(selected(o), [node.id]);
  });

  it('adds a Constant to Architectural Data as derived data', async () => {
    const o = await open(PARAMS);
    add(o, 'arch', 'Constant');
    const arch = sectionOf(o, 'arch');
    const node = (arch.children as any[])[arch.children.length - 1];
    assert.strictEqual(node.isDerived, true);
    assert.strictEqual(node.metadata.isderived, '1');
    assert.strictEqual(node.status, 'New');
  });

  it('gives each add a fresh unique name, so a pinned run of clicks never collides', async () => {
    const o = await open(PARAMS);
    const names: string[] = [];
    for (let i = 0; i < 3; i++) {
      add(o, 'design', 'Simulink.Parameter');
      const design = sectionOf(o, 'design');
      names.push((design.children as any[])[design.children.length - 1].name);
    }
    assert.strictEqual(new Set(names).size, 3);
    assert.strictEqual(o.events.length, 3, 'one edit a click');
    // And the FILE says the same three.
    const reread = readSldd(o.save(), (dict) => ((dict.children as any[]).find((s) => s.name === 'design').children as any[]).map((e) => e.name));
    for (const name of names) assert.ok(reread.includes(name), `${name} is in the saved file`);
  });

  it('refuses a class the section does not allow, and says which section refused', async () => {
    // Architectural Data takes no Signal. The gallery offers no such tile; reaching this means
    // the catalog and core have gone out of step.
    const o = await open(PARAMS);
    const at = o.view.posts.length;
    add(o, 'arch', 'Simulink.Signal');
    const refused = o.view.posts.slice(at).filter((m) => m.type === 'refused');
    assert.strictEqual(refused.length, 1, 'refused in the dialog');
    assert.strictEqual(refused[0].title, 'Cannot Add');
    assert.match(refused[0].reason, /Architectural Data|arch/);
    assert.strictEqual(o.events.length, 0, 'nothing was written');
  });

  it('names no section when the key is not one this dictionary has', async () => {
    const o = await open(PARAMS);
    const at = o.view.posts.length;
    add(o, 'nonesuch', 'Simulink.Parameter');
    assert.deepStrictEqual(
      o.view.posts.slice(at).filter((m) => m.type === 'error').map((m) => m.message),
      ['Could not resolve the target section.'],
    );
    assert.strictEqual(o.events.length, 0);
  });
});

describe('the add the table paints and the re-parse the next repaint does agree', () => {
  it('puts the new entry where a full re-read puts it, and in the ops an undo needs', async () => {
    const o = await open(PARAMS);
    const at = o.view.posts.length;
    add(o, 'design', 'Simulink.LookupTable');
    const posts = o.view.posts.slice(at);
    // ONE insert, of the entry the add created, appended (no beforeRowId).
    const inserts = posts.filter((m) => m.type === 'insertEntryRows');
    assert.strictEqual(inserts.length, 1);
    assert.strictEqual(inserts[0].beforeRowId, undefined);
    const [selectId] = selected(o);
    assert.strictEqual(inserts[0].rows[0].ID, selectId);
    // NARROW === WIDE: the rows the insert leaves on screen, against a whole paint from the chunk
    // it wrote. A disagreement here is a row order that changes under the user.
    const narrow = assertNarrowIsWide(o, 'the add');
    assert.ok(narrow.some((r) => r.ID === selectId), 'the new entry is in both');
    // And what the undo takes back: the same entry, removed by the id the rows carry.
    const mark = o.view.posts.length;
    o.undo();
    assert.deepStrictEqual(
      o.view.posts.slice(mark).filter((m) => m.type === 'updateEntryRows').map((m) => [m.entryRowId, m.rows.length]),
      [[selectId, 0]],
    );
    assertNarrowIsWide(o, 'the undone add');
  });

});

describe('an add into a section that is empty, and into a chunk that takes no insert', () => {
  it('fills a section that is empty, which has no row to aim at', async () => {
    // params.sldd has an empty Architectural Data, and Constant is the arch-only class: so the row
    // goes under the bare section header, with no beforeRowId.
    const o = await open(PARAMS);
    assert.deepStrictEqual(sectionNames(o, 'arch'), []);
    const at = o.view.posts.length;
    add(o, 'arch', 'Constant');
    const inserts = o.view.posts.slice(at).filter((m) => m.type === 'insertEntryRows');
    assert.strictEqual(inserts.length, 1);
    assert.strictEqual(inserts[0].sectionRowId, 'section:arch');
    assert.strictEqual(inserts[0].beforeRowId, undefined);
    assert.strictEqual((sectionOf(o, 'arch').children as any[])[0].metadata.isderived, '1');
    const names = sectionNames(o, 'arch');
    assertNarrowIsWide(o, 'the add');
    const reread = readSldd(o.save(), (dict) => ((dict.children as any[]).find((s) => s.name === 'arch').children as any[]).map((e) => e.name));
    assert.deepStrictEqual(reread, names);
  });

  it('refuses an add exactly where it refuses a paste, when the chunk takes no insert', async () => {
    // arch_binary.sldd is a chunk with no trailing dictionary object, which core's insertion point
    // aims in front of: nothing can be inserted into it, by an add or by a paste.
    const o = await open('test/fixtures/arch_binary.sldd');
    const entry = ((o.model().children as any[]).flatMap((s: any) => s.children as any[]) as any[])[0];
    const section = entry.parent;
    // A class the section DOES allow, so the only thing left to fail is the insert.
    const className = (section.getAllowedTypes() as string[])[0];
    assert.strictEqual(section.allowsType(className), true);
    const chunk = o.engine.chunkXml;

    let at = o.view.posts.length;
    add(o, section.name, className);
    assert.deepStrictEqual(
      o.view.posts.slice(at).filter((m) => m.type === 'error').map((m) => m.message),
      ['Failed to apply edit: Could not locate the insertion point.'],
    );
    send(o, { type: 'copy', rowIds: [entry.id] });
    at = o.view.posts.length;
    o.view.send({ type: 'paste', rowId: `section:${section.name}` });
    for (let i = 0; i < 50 && !o.view.posts.slice(at).some((m) => m.type === 'error'); i++) await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(
      o.view.posts.slice(at).filter((m) => m.type === 'error').map((m) => m.message),
      ['Failed to apply edit: Could not locate the insertion point.'],
    );
    assert.strictEqual(o.events.length, 0, 'nothing was written');
    assert.strictEqual(o.engine.chunkXml, chunk);
  });
});

describe('the row the add selects still resolves, so the next edit on it works', () => {
  it('finds the new entry by the id the rows carry, with no re-parse in between', async () => {
    const o = await open(PARAMS);
    add(o, 'design', 'Simulink.Parameter');
    const [selectId] = selected(o);
    const node = o.session.findNodeById(selectId) as any;
    assert.ok(node);
    // The rename right after it is the gesture this exists for.
    editCell(o, node, 'Name', 'justAdded');
    assert.ok(entryNamed(o, 'justAdded'), 'the rename right after the add lands');
  });
});

// `scalarD` in Design plus a pasted `scalarD` in Other Data: a plain numeric variable, so no
// section type restriction applies, and the two sections are two namespaces.
async function withDuplicate(registers = createRegisters()) {
  const o = await open(PARAMS, file(PARAMS), { registers });
  send(o, { type: 'copy', rowIds: [entryNamed(o, 'scalarD').id] });
  o.view.send({ type: 'paste', rowId: 'section:other' });
  for (let i = 0; i < 50 && o.events.length === 0; i++) await new Promise((r) => setTimeout(r, 0));
  const designEntry = sectionOf(o, 'design').children.find((e: any) => e.name === 'scalarD');
  const otherEntry = sectionOf(o, 'other').children.find((e: any) => e.name === 'scalarD');
  return { o, designEntry, otherEntry };
}

describe('binary .sldd — two entries named the same in different namespaces', () => {
  it('the paste produces a same-named pair with distinct UUID P-nodes', async () => {
    const { o, designEntry, otherEntry } = await withDuplicate();
    assert.ok(otherEntry, `the paste landed in Other Data (${JSON.stringify(o.view.posts.filter((m) => m.type === 'error'))})`);
    assert.strictEqual(otherEntry.name, 'scalarD');
    assert.notStrictEqual(otherEntry.metadata.uuid, designEntry.metadata.uuid);
  });

  // The XML scan returned the FIRST fragment whose Name P-node matched, so deleting the Other Data
  // copy destroyed the Design entry.
  it('REGRESSION: deleting the second copy removes THAT copy and spares the first', async () => {
    const { o, otherEntry } = await withDuplicate();
    send(o, { type: 'delete', rowIds: [otherEntry.id] });
    const after = readSldd(o.save(), (dict) => ({
      design: ((dict.children as any[]).find((s) => s.name === 'design').children as any[]).map((e) => e.name),
      other: ((dict.children as any[]).find((s) => s.name === 'other').children as any[]).map((e) => e.name),
    }));
    assert.ok(!after.other.includes('scalarD'));
    assert.ok(after.design.includes('scalarD'));
    assert.ok(after.design.includes('rowVec'), 'siblings intact');
  });

  it('REGRESSION: a move-source delete by selector hits only the selected copy', async () => {
    const registers = createRegisters();
    const { o, otherEntry } = await withDuplicate(registers);
    const result = await registers.deleteFromSource(o.engine.uri, [entrySelectorOf(otherEntry.serialize())]);
    assert.deepStrictEqual(result, { removed: true });
    const after = readSldd(o.save(), (dict) => ({
      design: ((dict.children as any[]).find((s) => s.name === 'design').children as any[]).map((e) => e.name),
      other: ((dict.children as any[]).find((s) => s.name === 'other').children as any[]).map((e) => e.name),
    }));
    assert.ok(!after.other.includes('scalarD'));
    assert.ok(after.design.includes('scalarD'));
  });
});
