// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A MAT-file edited in the page: createWorkspace({editing}) opens one on the MAT-file engine, over
// an undo stack of its own, and the Doc saves it (serialize, saved, notSaved) and says when it is
// dirty. Its table is an EditableTableSource connectTable({editing}) wires a table to, and what it
// says after a paint (the drop rules, the clipboard) follows the rows.
import * as assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, isEditable, type Doc, type Notice, type TableChange, type Workspace } from '../../src/model/index.js';
import { connectTable, defineTreeTable } from '../../src/widgets/tree-table/index.js';
import { fixture, valuesOf } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
  document.body.replaceChildren();
});

function workspace(editing = true, notices: Notice[] = []): Workspace {
  const ws = createWorkspace({ editing, notify: (n) => void notices.push(n) });
  workspaces.push(ws);
  return ws;
}

/** Every change `doc`'s table sends, from now on. */
function heard(doc: Doc): TableChange[] {
  const changes: TableChange[] = [];
  doc.table.subscribe((c) => void changes.push(c));
  return changes;
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const variableId = (doc: Doc, name: string) => `binedit:${doc.uri}/${name}`;

/** Run `body` with what a microtask throws kept in `thrown`, as a page's error handler would hear it. */
async function catchingMicrotasks(body: (thrown: unknown[]) => Promise<void>): Promise<void> {
  const real = globalThis.queueMicrotask;
  const thrown: unknown[] = [];
  globalThis.queueMicrotask = (task) =>
    real(() => {
      try {
        task();
      } catch (err) {
        thrown.push(err);
      }
    });
  try {
    await body(thrown);
  } finally {
    globalThis.queueMicrotask = real;
  }
}

describe('createWorkspace({editing}): a MAT-file edited in the page', () => {
  it('opens a MAT-file to edit, and leaves every other kind, and every workspace without editing, read-only', async () => {
    const ws = workspace();
    const mat = await ws.open(fixture('cases.mat'), 'cases.mat');
    assert.strictEqual(mat.editable, true);
    assert.ok(isEditable(mat.table));
    const view = await mat.table.open();
    assert.strictEqual(view.editable, true);
    assert.ok(view.add?.classes.includes('MatlabVariable'), 'the gallery offers what core says the file takes');
    const plain = await workspace(false).open(fixture('cases.mat'), 'cases.mat');
    assert.strictEqual(plain.editable, false);
    assert.strictEqual((await plain.table.open()).editable, false, 'a workspace without editing is read-only, as before');
    assert.throws(() => plain.serialize(), /not edited in this workspace/);
  });

  it('an edit makes it dirty, its undo clean, and a save of it clean, said each time it changes', async () => {
    const ws = workspace();
    const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
    await doc.table.open();
    const dirty: boolean[] = [];
    doc.onDirty((d) => void dirty.push(d));
    const table = doc.table as any;
    table.edit({ rowId: variableId(doc, 'scalarD'), columnId: 'Value', oldValue: '', newValue: '42' });
    assert.strictEqual(doc.dirty, true);
    table.undo();
    assert.strictEqual(doc.dirty, false);
    table.redo();
    const save = doc.serialize();
    assert.strictEqual(valuesOf(save.bytes).get('scalarD').Value, '42');
    assert.strictEqual(doc.dirty, true, 'dirty until the bytes are written');
    doc.saved(save.at);
    assert.strictEqual(doc.dirty, false);
    assert.deepStrictEqual(dirty, [true, false, true, false]);
  });

  it('tells its dirty listeners once the step is done, each on its own terms: one that throws costs the others nothing, nor the stacks', async () => {
    await catchingMicrotasks(async (thrown) => {
      const ws = workspace();
      const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
      await doc.table.open();
      const was = valuesOf(fixture('cases.mat')).get('scalarD').Value;
      doc.onDirty(() => {
        throw new Error('the tab is gone');
      });
      // An app that saves the moment it is told: the step is done, and the bytes hold it.
      const told: [boolean, string][] = [];
      doc.onDirty((dirty) => {
        const { bytes, at } = doc.serialize();
        doc.notSaved(at);
        told.push([dirty, valuesOf(bytes).get('scalarD').Value]);
      });
      const table = doc.table as any;
      table.edit({ rowId: variableId(doc, 'scalarD'), columnId: 'Value', oldValue: '', newValue: '42' });
      table.undo();
      table.redo();
      await settle();
      assert.deepStrictEqual(told, [
        [true, '42'],
        [false, was],
        [true, '42'],
      ]);
      assert.strictEqual(thrown.length, 3, "each throw reaches the page's error handler, a turn later");
      assert.match(String(thrown[0]), /the tab is gone/);
      // The two stacks are still in step: one undo takes the edit out, and leaves it clean.
      table.undo();
      assert.strictEqual(doc.dirty, false);
      assert.strictEqual(valuesOf(doc.serialize().bytes).get('scalarD').Value, was);
    });
  });

  it('a save whose bytes were never written leaves it as it was', async () => {
    const ws = workspace();
    const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
    await doc.table.open();
    const changes = heard(doc);
    (doc.table as any).edit({ rowId: variableId(doc, 'scalarD'), columnId: 'Value', oldValue: '', newValue: '42' });
    const save = doc.serialize();
    doc.notSaved(save.at);
    assert.strictEqual(doc.dirty, true);
    const rows = changes.filter((c) => c.kind === 'updateEntry').pop() as any;
    assert.strictEqual(rows.rows[0].Status, 'Modified', 'and the Status column still says so');
  });

  it('a reload takes the new bytes, empties the undo stack, and is clean', async () => {
    const notices: Notice[] = [];
    const ws = workspace(true, notices);
    const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
    await doc.table.open();
    const changes = heard(doc);
    (doc.table as any).edit({ rowId: variableId(doc, 'scalarD'), columnId: 'Value', oldValue: '', newValue: '42' });
    await doc.reload(fixture('pv_basic.mat'));
    assert.strictEqual(doc.dirty, false);
    const paint = changes.filter((c) => c.kind === 'replaceAll').pop() as any;
    assert.ok(paint.view.rows.some((r: any) => r.Name?.label === 'p'), 'the new file is painted');
    (doc.table as any).undo();
    assert.strictEqual(doc.dirty, false, 'nothing from before the reload is undone');
    assert.deepStrictEqual(notices, []);
  });

  it("documents of a workspace share its clipboard: a copy in one pastes into another, and a cut's source goes", async () => {
    const ws = workspace();
    const a = await ws.open(fixture('pv_basic.mat'), 'a.mat');
    const b = await ws.open(fixture('cases.mat'), 'b.mat');
    await a.table.open();
    await b.table.open();
    const bHeard = heard(b);
    (a.table as any).cut([variableId(a, 'x')]);
    assert.ok(bHeard.some((c) => c.kind === 'clipboard' && c.state.canPaste), 'every table is told what the clipboard holds');
    (b.table as any).paste('');
    await settle();
    assert.strictEqual(a.dirty, true, "the cut's source lost the variable, as an edit of its own");
    assert.strictEqual(b.dirty, true);
    const bSaved = valuesOf(b.serialize().bytes);
    assert.ok(bSaved.has('x'));
    assert.ok(!valuesOf(a.serialize().bytes).has('x'));
  });

  it('wired to a table with connectTable({editing}): the gestures edit it, and its rules follow its rows', async () => {
    const ws = workspace();
    const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
    const table = document.createElement('dex-tree-table') as any;
    document.body.append(table);
    const seen: string[] = [];
    doc.table.subscribe((c) => void seen.push(c.kind));
    const handle = connectTable(table, doc.table, { editing: true });
    await settle();
    await table.updateComplete;
    assert.deepStrictEqual(seen.slice(0, 2), ['sectionRules', 'clipboard'], 'what follows a paint, after it');
    assert.strictEqual(table.canAdd, true);
    assert.ok(handle.menuFor(variableId(doc, 'scalarD'), [variableId(doc, 'scalarD')]).some((i) => i.id === 'paste'));
    table.dispatchEvent(
      new CustomEvent('dex-edit-completed', { detail: { rowId: variableId(doc, 'scalarD'), columnId: 'Value', oldValue: '', newValue: '42' } }),
    );
    await settle();
    assert.strictEqual(doc.dirty, true);
    assert.strictEqual(table.rows.find((r: any) => r.ID === variableId(doc, 'scalarD')).Value, '42');
    handle.dispose();
  });

  it("says what its table does not show through the workspace's notify", async () => {
    const notices: Notice[] = [];
    const ws = workspace(true, notices);
    const doc = await ws.open(fixture('cases.mat'), 'cases.mat');
    await doc.table.open();
    const cut = await ws.open(fixture('pv_basic.mat'), 'twin.mat');
    await cut.table.open();
    // A cut whose source no longer has a table open: the paste lands, and the source keeps it.
    (cut.table as any).cut([variableId(cut, 'x')]);
    cut.dispose();
    (doc.table as any).paste('');
    await settle();
    assert.deepStrictEqual(
      notices.map((n) => [n.level, n.message]),
      [['warning', 'Pasted here, but the original in twin.mat could not be removed: its table is no longer open. Remove it there by hand.']],
    );
  });
});
