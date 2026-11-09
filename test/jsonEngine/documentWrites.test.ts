// Copyright 2026 The MathWorks, Inc.
//
// One JSON dictionary's writes, one text state at a time ACROSS everything that writes it: every
// table of the document, and the source half of a cross-document move out of it, take turns on the
// document's one queue (writeQueue.ts). Two tables of one document share its tree, so an edit in one
// sent while the other's add is on its way finds the entry the add made in the tree and not in the
// text, as within one table (editAfterStructural.test.ts); a move's source delete computed while an
// edit of that document is on its way is refused, and the original is left behind.
//
// Also here: what a closed table's queued gesture does (nothing: it has nowhere to paint, and would
// read the released tree back into the registry), what a write that throws or is refused costs the
// edits behind it (nothing: they land over the text as it is, and the banner says the failure once),
// and two moves the opposite ways between two documents at once, which must both finish (each lets
// its own document's queue go once its paste half is written, before it waits on the other's). And a
// replacing copy (a compare's Copy to Right, dropReplacing), which takes its turn as a drop does.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, type Registers, type TableChange } from '../../src/model/index.js';
import { JsonEngine } from '../../src/model/edit/jsonEngine.js';
import type { TextStore } from '../../src/model/edit/hooks.js';
import { createTextStore, type PageTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { diskOf, entryNames, entryRow, file, open, settle, viewOf, waitFor, WORKSPACE_DATA, WORKSPACE_PARAMS, type View } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const ADD = { type: 'addEntry', section: 'design', className: 'Simulink.Parameter', rename: true };

/** Every change `source` says from now on, and how to stop hearing them. */
function hear(view: View): { said: TableChange[]; stop: () => void } {
  const said: TableChange[] = [];
  return { said, stop: view.source.subscribe((c) => void said.push(c)) };
}

const errors = (said: TableChange[]): string[] => said.flatMap((c) => (c.kind === 'error' ? [c.message] : []));

/** The Name of the row an insert painted under `rowId`. */
function insertedName(said: TableChange[], rowId: string): string {
  for (const change of said) {
    if (change.kind !== 'insertEntry') continue;
    const row: any = change.rows.find((r: any) => r.ID === rowId);
    if (row) return row.Name?.label;
  }
  throw new Error(`no insert painted a row ${rowId}`);
}

/** The row of `name` in `text`, as a fresh table of it paints it. */
async function rowIn(text: string, name: string): Promise<any> {
  const back = await open(WORKSPACE_PARAMS, new TextEncoder().encode(text), { as: 'reopened.sldd' });
  return entryRow(back.view.posts, name);
}

/**
 * The page's store with every write held a task, as an extension host's WorkspaceEdit round-trips
 * before its document moves, and checked against the version it was asked over when it lands (a
 * TextDocument's refusal). `failNext` makes the next write throw as it is asked for, or be rejected.
 */
interface LateStore extends TextStore {
  store: PageTextStore;
  failNext: 'throw' | 'reject' | null;
}
function lateStore(rel: string): LateStore {
  const store = createTextStore(new TextDecoder().decode(file(rel)));
  const late = Object.create(store) as LateStore;
  late.store = store;
  late.failNext = null;
  late.apply = (patches, label) => {
    const fail = late.failNext;
    late.failNext = null;
    if (fail === 'throw') throw new Error('the store threw');
    const asked = store.version;
    return new Promise<boolean>((resolve, reject) =>
      setTimeout(() => {
        if (fail === 'reject') reject(new Error('the store rejected the write'));
        else if (store.version !== asked) resolve(false);
        else void store.apply(patches, label).then(resolve);
      }, 0),
    );
  };
  return late;
}

/** A table of a dictionary over `text`, under `as`, its first rows painted. */
async function tableOver(
  text: TextStore,
  as: string,
  rel: string,
  opts: { registers?: Registers; registry?: DocumentRegistry } = {},
): Promise<{ engine: JsonEngine; view: View; registry: DocumentRegistry }> {
  const registry = opts.registry ?? new DocumentRegistry(createSession());
  const engine = new JsonEngine({
    registry,
    uri: `file:///work/${as}`,
    name: as,
    text,
    registers: opts.registers ?? createRegisters(),
    disk: diskOf(file(rel)),
  });
  const view = viewOf(engine);
  view.send({ type: 'ready' });
  await waitFor(`${as}'s first rows`, () => view.posts.some((p) => p.type === 'setRows'));
  await settle();
  return { engine, view, registry };
}

describe('Two tables of one JSON dictionary', () => {
  it("edits in one, sent as the other's add says its selection, wait for that write and land", async () => {
    const o = await open(WORKSPACE_PARAMS);
    const other = viewOf(o.engine);
    other.send({ type: 'ready' });
    await waitFor("the other table's rows", () => other.posts.some((p) => p.type === 'setRows'));
    await settle();
    const here = hear(o.view);
    const there = hear(other);
    let landed: Promise<unknown> | null = null;
    const stop = o.view.source.subscribe((change) => {
      if (change.kind !== 'select' || landed) return;
      const rowId = change.rowIds[0];
      const name = insertedName(here.said, rowId);
      // The other tab renames the entry this one just added, and edits another, a microtask on.
      queueMicrotask(() => {
        landed = Promise.all([
          other.source.edit({ rowId, columnId: 'Name', oldValue: name, newValue: 'fromTheOtherTab' }),
          other.source.edit({ rowId: entryRow(other.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' }),
        ]);
      });
    });
    o.view.send(ADD);
    await waitFor('the edits to be sent', () => landed !== null);
    await landed;
    await settle();
    stop();
    here.stop();
    there.stop();
    assert.deepStrictEqual([...errors(here.said), ...errors(there.said)], [], 'neither table said a word in its banner');
    assert.ok(o.names().includes('fromTheOtherTab'), 'the text holds the added entry under the name the other tab sent');
    assert.strictEqual((await rowIn(o.text.text, 'gravity')).Value, '9.8', "and the other tab's Value edit");
  });
});

describe("A table's queued gesture, the table closed before its turn", () => {
  for (const [what, gesture] of [
    ['a delete', (o: Awaited<ReturnType<typeof open>>) => ({ type: 'delete', rowIds: [entryRow(o.view.posts, 'gravity').ID] })],
    ['an add', () => ({ type: 'addEntry', section: 'design', className: 'Simulink.Parameter', rename: false })],
  ] as const) {
    it(`${what} writes nothing, and no tree is held again`, async () => {
      const o = await open(WORKSPACE_PARAMS);
      const version = o.text.version;
      const names = o.names();
      let sent = false;
      const stop = o.view.source.subscribe((change) => {
        if (change.kind !== 'select' || sent) return;
        sent = true;
        // Behind the first add's write, which is on its way; then the table closes, as a tab does.
        o.view.send(gesture(o));
        o.view.close();
      });
      o.view.send({ ...ADD, rename: false });
      await waitFor('the gesture to be sent', () => sent);
      await settle();
      stop();
      assert.strictEqual(o.text.version, version + 1, "the first add's write, which had begun, and nothing for the gesture");
      assert.strictEqual(o.names().length, names.length + 1);
      assert.ok(o.names().includes('gravity'), 'nothing was deleted');
      assert.strictEqual(o.model(), null, 'the closed table released its tree, and the gesture did not read it back in');
    });
  }
});

describe('A write that fails, and the edits queued behind it', () => {
  it('a store that throws as the write is asked for: the edit says why once, and the next lands', async () => {
    const text = lateStore(WORKSPACE_PARAMS);
    const { view } = await tableOver(text, 'throws.sldd', WORKSPACE_PARAMS);
    const { said, stop } = hear(view);
    const version = text.store.version;
    text.failNext = 'throw';
    const first = view.source.edit({ rowId: entryRow(view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    const second = view.source.edit({ rowId: entryRow(view.posts, 'negD').ID, columnId: 'Name', oldValue: 'negD', newValue: 'negDRenamed' });
    await Promise.all([first, second]);
    await settle();
    stop();
    assert.deepStrictEqual(errors(said), ['Failed to apply edit: the store threw'], 'the failure, said once');
    assert.strictEqual(text.store.version, version + 1, 'one write: the second edit');
    assert.ok(entryNames(text.store.text).includes('negDRenamed'), 'which landed');
    assert.strictEqual((await rowIn(text.store.text, 'gravity')).Value, '9.81', 'and the first is not in the text');
  });

  it("an add whose write is rejected: the edit queued behind it lands over the text as it is, and the banner says it once", async () => {
    const text = lateStore(WORKSPACE_PARAMS);
    const { view } = await tableOver(text, 'rejects.sldd', WORKSPACE_PARAMS);
    const { said, stop } = hear(view);
    const version = text.store.version;
    const names = entryNames(text.store.text);
    let edited: Promise<unknown> | null = null;
    const stopEdit = view.source.subscribe((change) => {
      if (change.kind !== 'select' || edited) return;
      edited = view.source.edit({ rowId: entryRow(view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    });
    text.failNext = 'reject';
    view.send(ADD);
    await waitFor('the edit to be sent', () => edited !== null);
    await edited;
    await settle();
    stop();
    stopEdit();
    assert.deepStrictEqual(errors(said), ['Failed to apply edit: the store rejected the write'], "the add's failure, said once");
    assert.strictEqual(text.store.version, version + 1, 'one write: the edit');
    assert.deepStrictEqual(entryNames(text.store.text), names, 'no add in the text');
    assert.strictEqual((await rowIn(text.store.text, 'gravity')).Value, '9.8', 'and the edit is, at the right place');
    const shown = said.filter((c) => c.kind === 'replaceAll').pop() as any;
    assert.ok(shown, 'the table was painted again from the text');
    assert.ok(!shown.view.rows.some((r: any) => !names.includes(r.Name?.label) && String(r.parent ?? '').startsWith('section:')), 'without the add');
  });
});

describe('A move out of a JSON dictionary', () => {
  it('with an edit of the source on its way: the source delete waits for it, and takes the original', async () => {
    const registers = createRegisters();
    const registry = new DocumentRegistry(createSession());
    const text = lateStore(WORKSPACE_PARAMS);
    const source = await tableOver(text, 'moved_from.sldd', WORKSPACE_PARAMS, { registers, registry });
    const target = await open(WORKSPACE_DATA, undefined, { as: 'moved_to.sldd', registers, registry });
    const { said, stop } = hear(target.view);
    source.view.send({ type: 'cut', rowIds: [entryRow(source.view.posts, 'gravity').ID] });
    assert.strictEqual(registers.getClipboard()?.mode, 'cut');
    // An edit of the source, on its way to its text; and, at once, the paste of the cut.
    const edited = source.view.source.edit({ rowId: entryRow(source.view.posts, 'negD').ID, columnId: 'Value', oldValue: '-1', newValue: '-2' });
    target.view.send({ type: 'paste', rowId: 'section:design' });
    await edited;
    await waitFor('the move to finish', () => registers.getClipboard() === null);
    await waitFor('the source delete to land', () => !entryNames(text.store.text).includes('gravity'), 50);
    await settle();
    stop();
    assert.deepStrictEqual(errors(said), [], 'the target said nothing: the original was taken');
    assert.ok(target.names().includes('gravity'), 'the entry is in the target');
    assert.strictEqual((await rowIn(text.store.text, 'negD')).Value, '-2', "and the source's own edit is in its text");
  });

  it('two moves the opposite ways between two documents at once both finish', async () => {
    const registers = createRegisters();
    const registry = new DocumentRegistry(createSession());
    const a = await open(WORKSPACE_PARAMS, undefined, { as: 'both_a.sldd', registers, registry });
    const b = await open(WORKSPACE_DATA, undefined, { as: 'both_b.sldd', registers, registry });
    const heardA = hear(a.view);
    const heardB = hear(b.view);
    // PI is cut out of b for a paste in a; gravity is dragged out of a for a drop in b.
    b.view.send({ type: 'cut', rowIds: [entryRow(b.view.posts, 'PI').ID] });
    a.view.send({ type: 'dragStart', rowIds: [entryRow(a.view.posts, 'gravity').ID] });
    a.view.send({ type: 'paste', rowId: 'section:design' });
    b.view.send({ type: 'drop', rowId: 'section:design', mode: 'move' });
    await waitFor('both moves to finish', () => {
      const inA = a.names();
      const inB = b.names();
      return inA.includes('PI') && !inA.includes('gravity') && inB.includes('gravity') && !inB.includes('PI');
    });
    await settle();
    heardA.stop();
    heardB.stop();
    assert.deepStrictEqual([...errors(heardA.said), ...errors(heardB.said)], [], 'neither said a word');
  });
});

describe("A replacing copy into a JSON dictionary (a compare's Copy to Right)", () => {
  it("with an edit of it in another table on its way: the copy waits for that write, and both land", async () => {
    const registers = createRegisters();
    const registry = new DocumentRegistry(createSession());
    const from = await open(WORKSPACE_PARAMS, undefined, { as: 'copied_from.sldd', registers, registry });
    await from.view.source.edit({ rowId: entryRow(from.view.posts, 'gravity').ID, columnId: 'Value', oldValue: '9.81', newValue: '9.5' });
    await settle();
    const text = lateStore(WORKSPACE_PARAMS);
    const target = await tableOver(text, 'copied_over.sldd', WORKSPACE_PARAMS, { registers, registry });
    const other = viewOf(target.engine);
    other.send({ type: 'ready' });
    await waitFor("the other table's rows", () => other.posts.some((p) => p.type === 'setRows'));
    await settle();
    const here = hear(target.view);
    const there = hear(other);
    const names = entryNames(text.store.text);
    from.view.send({ type: 'dragStart', rowIds: [entryRow(from.view.posts, 'gravity').ID] });
    // An edit of the target in its other table, on its way to the text; and, at once, the copy of
    // the source's gravity over the target's.
    const edited = other.source.edit({ rowId: entryRow(other.posts, 'negD').ID, columnId: 'Value', oldValue: '-1', newValue: '-2' });
    const copied = target.view.source.dropReplacing('section:design', [entryRow(target.view.posts, 'gravity').ID]);
    from.view.send({ type: 'dragEnd' });
    await Promise.all([edited, copied]);
    await settle();
    here.stop();
    there.stop();
    assert.deepStrictEqual([...errors(here.said), ...errors(there.said)], [], 'neither table said a word in its banner');
    assert.deepStrictEqual([...entryNames(text.store.text)].sort(), [...names].sort(), 'the copy took the place of the entry of its name');
    assert.strictEqual((await rowIn(text.store.text, 'gravity')).Value, '9.5', 'the copy is in the text');
    assert.strictEqual((await rowIn(text.store.text, 'negD')).Value, '-2', "and the other table's edit");
  });
});
