// Copyright 2026 The MathWorks, Inc.
//
// A cell edit sent while another edit's write is still on its way to the text. An add or a delete
// changes the tree, paints, says the row it selected, and only then writes the text, a turn later
// (the page's store, as a TextDocument, lands an edit after it is asked for). A caller that edits
// the moment the selection arrives (a script, a command window: a person typing a name is far
// slower) used to reach the engine inside that window, and its edit was computed over the text from
// BEFORE the add: no span for the entry only the add's write puts there ("Could not locate the
// entry text to update.", and a wide repaint that put the old rows back), or offsets the add's
// write was about to move (the text refused it). Either way the edit was lost.
//
// What these protect: every edit of a table's waits for the write in front of it, whatever kind
// each is, so an edit sent at ANY point after the gesture before it lands, in order, as its own
// undo step, with nothing said in the banner; and one with nothing in front of it still paints in
// the run it was sent in (test/jsonEngine/edit.test.ts). Through the source itself, as the caller
// that found it (a subscriber of doc.table) sends it, and across the channel (serveTable).
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, createWorkspace, type CellEdit, type EditableTableSource, type TableChange } from '../../src/model/index.js';
import { JsonEngine } from '../../src/model/edit/jsonEngine.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import type { TextStore } from '../../src/model/edit/hooks.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { diskOf, entryNames, entryRow, file, open, settle, viewOf, waitFor, WORKSPACE_PARAMS, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** When the caller sends its edits, counted from the change that says the gesture's selection. */
type Timing = 'inside the listener that hears the select' | 'a microtask after the select';
const TIMINGS: Timing[] = ['inside the listener that hears the select', 'a microtask after the select'];

const ADD = { type: 'addEntry', section: 'design', className: 'Simulink.Parameter', rename: true };

/**
 * Send `edits` the moment the next gesture's `select` is heard, at `when`, and hand back what the
 * table says from now on, the row the selection named, and the edits' own promises (settled once
 * each is in the text, or refused).
 */
function editOnSelect(o: Opened, when: Timing, edits: (rowId: string, said: TableChange[]) => CellEdit[]) {
  const said: TableChange[] = [];
  const out: { rowId: string; landed: Promise<unknown> } = { rowId: '', landed: Promise.resolve() };
  let fired = false;
  const stop = o.view.source.subscribe((change) => {
    said.push(change);
    if (change.kind !== 'select' || fired) return;
    fired = true;
    const rowId = change.rowIds[0];
    // The row and the edits' promises together, so a case that sees the one has the other.
    const send = (): void => {
      out.landed = Promise.all(edits(rowId, said).map((edit) => o.view.source.edit(edit)));
      out.rowId = rowId;
    };
    if (when === 'a microtask after the select') queueMicrotask(send);
    else send();
  });
  return { said, out, stop };
}

/** The Name of the row an insert painted under `rowId`: the name the add gave the new entry. */
function insertedName(said: TableChange[], rowId: string): string {
  for (const change of said) {
    if (change.kind !== 'insertEntry') continue;
    const row: any = change.rows.find((r: any) => r.ID === rowId);
    if (row) return row.Name?.label;
  }
  throw new Error(`no insert painted a row ${rowId}`);
}

/** What went wrong, said: the banner's errors, and the wide repaint the lost edit's repair sent. */
function failures(said: TableChange[]): string[] {
  return said.flatMap((c) => (c.kind === 'error' ? [c.message] : c.kind === 'replaceAll' ? ['(a wide repaint)'] : []));
}

/** The row of `name` in `bytes`, as a fresh table of them paints it. */
async function rowIn(bytes: Uint8Array, name: string): Promise<any> {
  const back = await open(WORKSPACE_PARAMS, bytes, { as: 'reopened.sldd' });
  return entryRow(back.view.posts, name);
}

/** The bytes the save writes, opened again: the row of `name` in them. */
const savedRow = (o: Opened, name: string): Promise<any> => rowIn(o.save(), name);

/** The row of `name` in the text as it stands, unsaved. */
const textRow = (o: Opened, name: string): Promise<any> => rowIn(new TextEncoder().encode(o.text.text), name);

/** The Name of the row `rowId` in the table's first paint. */
const paintedName = (o: Opened, rowId: string): string =>
  o.view.posts.find((p) => p.type === 'setRows').rows.find((r: any) => r.ID === rowId)?.Name?.label ?? '';

describe('A cell edit sent as an add or a delete says its selection, before that write lands', () => {
  for (const when of TIMINGS) {
    describe(`sent ${when}`, () => {
      it('a rename of the entry the add made lands, and the saved bytes hold it', async () => {
        const o = await open(WORKSPACE_PARAMS);
        const before = o.names();
        const { said, out, stop } = editOnSelect(o, when, (rowId, heard) => [
          { rowId, columnId: 'Name', oldValue: insertedName(heard, rowId), newValue: 'scriptedName' },
        ]);
        o.view.send(ADD);
        await waitFor('the edit to be sent', () => out.rowId !== '');
        await out.landed;
        await settle();
        stop();
        assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
        assert.deepStrictEqual(o.names(), [...before, 'scriptedName'], 'the text holds the added entry under the name sent');
        const row = await savedRow(o, 'scriptedName');
        assert.ok(row, 'and so does the file the save writes');
      });

      it('a Value edit of the entry the add made lands, and the saved bytes hold it', async () => {
        const o = await open(WORKSPACE_PARAMS);
        let added = '';
        const { said, out, stop } = editOnSelect(o, when, (rowId, heard) => {
          added = insertedName(heard, rowId);
          return [{ rowId, columnId: 'Value', oldValue: '0', newValue: '42' }];
        });
        o.view.send(ADD);
        await waitFor('the edit to be sent', () => out.rowId !== '');
        await out.landed;
        await settle();
        stop();
        assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
        assert.ok(o.names().includes(added), `the text holds the added ${added}`);
        assert.strictEqual((await savedRow(o, added)).Value, '42', 'with the Value sent, in the file the save writes');
      });

      it("a Value edit of the row a delete's selection lands on lands, and the deleted entry stays gone", async () => {
        const o = await open(WORKSPACE_PARAMS);
        let landedOn = '';
        const { said, out, stop } = editOnSelect(o, when, (rowId) => {
          landedOn = paintedName(o, rowId);
          return [{ rowId, columnId: 'Value', oldValue: '', newValue: '7' }];
        });
        o.view.send({ type: 'delete', rowIds: [entryRow(o.view.posts, 'gravity').ID] });
        await waitFor('the edit to be sent', () => out.rowId !== '');
        await out.landed;
        await settle();
        stop();
        assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
        assert.ok(!o.names().includes('gravity'), 'the delete is in the text');
        assert.ok(o.names().includes(landedOn), `the selection landed on an entry the text holds (${landedOn})`);
        assert.strictEqual((await savedRow(o, landedOn)).Value, '7', `and ${landedOn} holds the Value sent, in the file the save writes`);
      });
    });
  }

  it('two edits sent behind one add both land, in order, each its own undo step', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const version = o.text.version;
    let added = '';
    const { said, out, stop } = editOnSelect(o, 'a microtask after the select', (rowId, heard) => {
      added = insertedName(heard, rowId);
      return [
        { rowId, columnId: 'Value', oldValue: '0', newValue: '42' },
        { rowId, columnId: 'Name', oldValue: added, newValue: 'twiceEdited' },
      ];
    });
    o.view.send(ADD);
    await waitFor('the edits to be sent', () => out.rowId !== '');
    await out.landed;
    await settle();
    stop();
    assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
    assert.strictEqual(o.text.version, version + 3, 'three writes: the add, the Value, the rename');
    assert.strictEqual((await textRow(o, 'twiceEdited')).Value, '42', 'the text holds both edits');
    // One gesture, one undo step: the rename goes back alone, then the Value, then the add.
    await o.undo();
    assert.ok(o.names().includes(added) && !o.names().includes('twiceEdited'), 'the first undo takes back the rename only');
    assert.strictEqual((await textRow(o, added)).Value, '42', 'and leaves the Value');
    await o.undo();
    assert.notStrictEqual((await textRow(o, added)).Value, '42', 'the second takes back the Value');
    await o.undo();
    assert.ok(!o.names().includes(added), 'and the third, the add');
    await o.redo();
    await o.redo();
    await o.redo();
    assert.strictEqual((await savedRow(o, 'twiceEdited')).Value, '42', 'redone, the file the save writes holds both edits');
  });
});

describe("A table's edits, one text state at a time whichever kind comes first", () => {
  it('two cell edits sent in one run both land, each its own undo step', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const version = o.text.version;
    const said: TableChange[] = [];
    const stop = o.view.source.subscribe((c) => void said.push(c));
    const first = o.view.source.edit({ rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    const second = o.view.source.edit({ rowId: entryRow(o.view.posts, 'negD').ID, columnId: 'Name', oldValue: 'negD', newValue: 'negDRenamed' });
    await Promise.all([first, second]);
    await settle();
    stop();
    assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
    assert.strictEqual(o.text.version, version + 2, 'two writes');
    assert.ok(o.names().includes('negDRenamed') && !o.names().includes('negD'), 'the second is in the text');
    assert.strictEqual((await textRow(o, 'gravity')).Value, '9.8', 'and so is the first');
    await o.undo();
    assert.ok(o.names().includes('negD'), 'one undo takes back the rename');
    assert.strictEqual((await textRow(o, 'gravity')).Value, '9.8', 'and only the rename');
  });

  it('an edit waiting behind an add, its table closed before its turn: nothing is written for it, and no tree is held again', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const version = o.text.version;
    let edited: Promise<unknown> | null = null;
    const stop = o.view.source.subscribe((change) => {
      if (change.kind !== 'select' || edited) return;
      // Behind the add's write, which is on its way; then the table closes, as a tab does.
      edited = o.view.source.edit({ rowId: entryRow(o.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
      o.view.close();
    });
    o.view.send(ADD);
    await waitFor('the edit to be sent', () => edited !== null);
    await edited;
    await settle();
    stop();
    assert.strictEqual(o.text.version, version + 1, "the add's write, which had begun, and nothing for the edit");
    assert.strictEqual(o.model(), null, 'the closed table released its tree, and the edit did not read it back in');
  });

  it("over a text whose writes land a task later, as a TextDocument's do: an add, an edit of it, and a delete behind them all land", async () => {
    // The page's store with every write held for a task, as an extension host's WorkspaceEdit
    // round-trips before the document moves: the window an edit can arrive in is then a whole
    // task wide, not a microtask.
    const bytes = file(WORKSPACE_PARAMS);
    const store = createTextStore(new TextDecoder().decode(bytes));
    const late: TextStore = Object.create(store);
    late.apply = (patches, label) => {
      const asked = store.version;
      return new Promise<boolean>((resolve) =>
        setTimeout(() => (store.version !== asked ? resolve(false) : void store.apply(patches, label).then(resolve)), 0),
      );
    };
    const engine = new JsonEngine({
      registry: new DocumentRegistry(createSession()),
      uri: 'file:///work/late.sldd',
      name: 'late.sldd',
      text: late,
      registers: createRegisters(),
      disk: diskOf(bytes),
    });
    const view = viewOf(engine);
    view.send({ type: 'ready' });
    await waitFor('the first rows', () => view.posts.some((p) => p.type === 'setRows'));
    await settle();
    const said: TableChange[] = [];
    let added = '';
    const stop = view.source.subscribe((change) => {
      said.push(change);
      if (change.kind !== 'select' || added) return;
      const rowId = change.rowIds[0];
      added = insertedName(said, rowId);
      // The edit of what the add made, then a delete of another entry, each sent at once.
      view.send({ type: 'edit', rowId, columnId: 'Value', oldValue: '0', newValue: '42' });
      view.send({ type: 'delete', rowIds: [entryRow(view.posts, 'gravity').ID] });
    });
    const version = store.version;
    view.send(ADD);
    await waitFor('the three writes to land', () => store.version >= version + 3);
    await settle();
    stop();
    assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
    const names = entryNames(store.text);
    assert.ok(names.includes(added) && !names.includes('gravity'), 'the add and the delete are in the text');
    const back = await open(WORKSPACE_PARAMS, new TextEncoder().encode(store.text), { as: 'late-saved.sldd' });
    assert.strictEqual(entryRow(back.view.posts, added).Value, '42', 'and the edit between them');
    view.close();
  });
});

describe("Through a workspace's doc.table, as a script beside the table sends its edits", () => {
  it('an Add that opens a rename, and the rename sent a microtask after its select: the save holds the name', async () => {
    const ws = createWorkspace({ editing: true });
    try {
      const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd', 'file:///w/params.sldd');
      const table = doc.table as EditableTableSource;
      await table.open();
      table.opened?.();
      await settle();
      const said: TableChange[] = [];
      let landed: Promise<unknown> | null = null;
      const stop = table.subscribe((change) => {
        said.push(change);
        if (change.kind !== 'select' || landed) return;
        const rowId = change.rowIds[0];
        const oldValue = insertedName(said, rowId);
        landed = Promise.resolve().then(() => table.edit({ rowId, columnId: 'Name', oldValue, newValue: 'fromScript' }));
      });
      table.addEntry({ section: 'design', className: 'Simulink.Parameter', rename: true });
      await waitFor('the rename to be sent', () => landed !== null);
      await landed;
      await settle();
      stop();
      assert.deepStrictEqual(failures(said), [], 'nothing was said in the banner, and nothing repainted wide');
      assert.ok(entryNames(new TextDecoder().decode(doc.serialize().bytes)).includes('fromScript'), 'the saved bytes hold the name sent');
    } finally {
      ws.dispose();
    }
  });
});
