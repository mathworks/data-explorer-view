// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/jsonStructuralNarrow.test.ts at cc8cb1b.
// Runs against view's JSON dictionary engine (src/model/edit/jsonEngine.ts, jsonView.ts: the
// provider lifted) through the messages its table sends (test/jsonEngine/harness.ts). Only the cases
// whose assertions core's ports did not carry are here, under their vscode titles: the rows ON
// SCREEN. Core's test/jsonStructuralNarrowOps.test.ts holds the model after each edit and its undo,
// compared as core's rows with the Status column taken off; what it left to view is the webview's
// half (each remove, replace and insert placed in the rows on screen by spliceEntryRows and
// insertEntryRows), the Status ("Modified") marks, and narrow === wide over view's own rows. Core's
// jsonStructuralNarrow.test.ts and jsonStructuralNarrowOps.test.ts also hold planKnownOps' two
// refusal cases, findEntryBySelector and findEntryByName, which paint nothing and are not here.
//
// The extension's suite could not run its provider (it imports `vscode`), so it rebuilt each
// structural edit from the text transforms and entry ops it is made of, and painted the ops
// itself (paintOps). Here the edit is the table's own gesture, and the paint the engine's:
//   - delete, add child, delete of many rows: the table's `delete` and `addChild`;
//   - paste: a `copy` of the entry, then a `paste` on the section's header row;
//   - a same-document move: a `cut` of the sources, then a `paste` on the header row of the
//     dictionary's next section (Architectural Data). The vscode cases pasted back into the
//     source's own section, which their hand-built composition allowed; the provider (and the
//     engine, transfer.ts) answers that as a no-op and writes nothing, so a move that lands is
//     between two sections. The engine removes the sources first, in the same write, so the
//     copies keep their names;
//   - Cmd+Z and its redo: the table's `undo` and `redo`, recognised from the ops the engine kept;
//   - paintOps: the engine's updateEntryRows and insertEntryRows folded into the rows the last
//     whole paint posted, each one asserted to land, as the webview folds them;
//   - widePaint(): the engine's repaintAll, which re-parses the text and re-registers the tree.
// Every gesture and every recognised undo is held to have painted narrowly (no whole paint), which
// the vscode cases were by construction. The copy and the cut mark their sources on screen: the
// rows a paste is compared with are taken after a copy (whose mark stays) and before a cut (whose
// mark the paste spends). The vscode cases' own bookkeeping (the op pairs they built) is the
// engine's inside, and is held to what it paints instead.
import { planDeletion } from 'data-explorer-core';
import { describe, it, expect } from 'vitest';
import { insertEntryRows, spliceEntryRows } from '../../src/model/index.js';
import { entryOf } from '../binaryEngine/harness.js';
import { open as openEngine, settle, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIXTURE = 'test/fixtures/numeric_json.sldd';

/**
 * The rows the table holds now: the last whole paint, with every narrow repaint after it folded in
 * the way the webview folds them — an empty replacement for a removal, the entry's fresh rows for a
 * replace, and the insert that has to be told its place.
 */
function paintOps(posts: any[]): any[] {
  let out: any[] = [];
  for (const p of posts) {
    if (p.type === 'setRows') {
      out = p.rows;
      continue;
    }
    if (p.type !== 'updateEntryRows' && p.type !== 'insertEntryRows') continue;
    const kind = p.type === 'insertEntryRows' ? 'insert' : p.rows.length === 0 ? 'remove' : 'replace';
    const next =
      p.type === 'updateEntryRows' ? spliceEntryRows(out, p.entryRowId, p.rows) : insertEntryRows(out, p.sectionRowId, p.beforeRowId, p.rows);
    expect(next, `the table could place the ${kind}`).not.toBeNull();
    out = next!;
  }
  return out;
}

/** One open document, with the engine's two repaint paths side by side. */
async function open(as: string) {
  const o = await openEngine(FIXTURE, undefined, { as });
  const doc = {
    get text() {
      return o.text.text;
    },
  };

  // post(): the wide repaint — re-parse, diff every entry, rebuild every row.
  const widePaint = async (): Promise<any[]> => {
    const at = o.view.posts.length;
    await o.view.source.repaintAll();
    const paint = o.view.posts.slice(at).find((p) => p.type === 'setRows');
    expect(paint, 'the whole table was painted').toBeDefined();
    return paint.rows;
  };

  /** The tree registered for this document — what liveModel() hands the edit path. */
  const model = () => {
    const m = o.model();
    expect(m, 'the document has a registered tree to edit').toBeTruthy();
    return m as any;
  };

  /** A gesture of the table that writes the text: resolves once its write has landed, with what it posted. */
  const gesture = async (message: Record<string, unknown>): Promise<any[]> => {
    const at = o.view.posts.length;
    const version = o.text.version;
    o.view.send(message);
    await waitFor(`the ${message.type} to be written`, () => o.text.version !== version);
    await settle();
    const posts = o.view.posts.slice(at);
    expect(
      posts.filter((p) => p.type === 'error' || p.type === 'refused' || p.type === 'validationError'),
      `${message.type}: nothing was refused or failed`,
    ).toEqual([]);
    // Painted as the rows it changed: a whole paint here would make every comparison below one
    // of a re-parse with itself.
    expect(posts.some((p) => p.type === 'setRows'), `${message.type}: painted narrowly`).toBe(false);
    return posts;
  };

  /**
   * The table's Undo or Redo: the posts it answered with. `recognised` is whether the engine knew
   * its own edit coming back (planKnownOps): repainted from the ops it kept, not wide.
   */
  const history = async (step: 'undo' | 'redo'): Promise<{ posts: any[]; recognised: boolean }> => {
    const at = o.view.posts.length;
    await (step === 'undo' ? o.undo() : o.redo());
    const posts = o.view.posts.slice(at);
    const recognised = !posts.some((p) => p.type === 'setRows') && posts.some((p) => p.type === 'updateEntryRows' || p.type === 'insertEntryRows');
    return { posts, recognised };
  };

  /** The rows on screen. */
  const onScreen = () => paintOps(o.view.posts);
  const entryNamed = (name: string) => entryOf(o.model(), name);
  const sectionRowOf = (section: any) => `section:${section.name}`;

  return { o, doc, widePaint, model, gesture, history, onScreen, entryNamed, sectionRowOf };
}

// ---------------------------------------------------------------------------------------
// The forward edits.
// ---------------------------------------------------------------------------------------
describe('JSON .sldd structural edit — narrow === wide', () => {
  it('delete: the entry’s run leaves the table and no other row moves', async () => {
    const d = await open('struct-delete.sldd');
    const before = await d.widePaint();
    const entry = d.entryNamed('Number');
    const entryRowId = entry.id;

    await d.gesture({ type: 'delete', rowIds: [entryRowId] });

    const narrow = d.onScreen();
    expect(narrow.some((r: any) => r.ID === entryRowId), 'the deleted run is gone').toBe(false);
    expect(narrow.length).toBe(before.length - 1);
    // The id the delete took away must stop resolving, or a later op could still find it.
    expect(d.o.session.findNodeById(entryRowId)).toBeNull();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('add child: only the owning entry’s rows are rebuilt, and the new child resolves', async () => {
    const d = await open('struct-add-child.sldd');
    const before = await d.widePaint();
    const entry = d.entryNamed('Struct');
    const entryRowId = entry.id;

    const posts = await d.gesture({ type: 'addChild', rowId: entryRowId });
    const selectId = posts.filter((p) => p.type === 'selectRows').pop()?.rowIds?.[0];

    const narrow = d.onScreen();
    expect(selectId, 'the new child is the row to select').toBeTruthy();
    expect(narrow.some((r: any) => r.ID === selectId), 'its row is on screen').toBe(true);
    expect(d.o.session.findNodeById(selectId), 'and it resolves for the next edit').toBeTruthy();
    // Every row outside the entry is untouched — the point of the whole path.
    const others = (rows: any[]) => rows.filter((r) => !String(r.ID).startsWith(entryRowId));
    expect(others(narrow)).toEqual(others(before));
    expect(narrow).toEqual(await d.widePaint());
  });

  it('delete child: the owning entry’s rows, one row shorter', async () => {
    const d = await open('struct-del-child.sldd');
    await d.widePaint();
    const entry = d.entryNamed('Struct');
    const child = entry.children[0];
    expect(child, 'the fixture’s Struct has a field to delete').toBeTruthy();
    const childId = child.id;

    await d.gesture({ type: 'delete', rowIds: [childId] });

    const narrow = d.onScreen();
    expect(narrow.some((r: any) => r.ID === childId), 'the deleted field’s row is gone').toBe(false);
    expect(d.o.session.findNodeById(childId), 'and its id no longer resolves').toBeNull();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('delete of MANY rows: one write, and narrow === wide', async () => {
    // The gesture the whole change is for: a mixed selection — one whole entry, one
    // nested child of another entry — deleted as ONE edit. Two writes here would make
    // Cmd+Z take back half of it.
    const d = await open('struct-delete-many.sldd');
    await d.widePaint();
    const struct = d.entryNamed('Struct');
    const number = d.entryNamed('Number');
    const child = struct.children[0];
    expect(child, 'the fixture’s Struct has a field').toBeTruthy();
    const goneIds = [number.id, child.id];

    const plan = planDeletion([number.id, child.id], (id: string) => d.o.session.findNodeById(id));
    expect(plan.entries.map((e: any) => e.name)).toEqual(['Number']);
    expect(plan.childGroups.map((g: any) => g.entry.name)).toEqual(['Struct']);

    const version = d.o.text.version;
    await d.gesture({ type: 'delete', rowIds: goneIds });
    expect(d.o.text.version, 'one write').toBe(version + 1);

    const narrow = d.onScreen();
    for (const id of goneIds) {
      expect(narrow.some((r: any) => r.ID === id), `${id} is gone from the table`).toBe(false);
    }
    expect(narrow).toEqual(await d.widePaint());
  });

  it('paste: the new entry’s rows are inserted where a re-parse would put them', async () => {
    const d = await open('struct-paste.sldd');
    const section = d.model().children[0];
    // The copy marks its source on screen, as the whole paint marks it: taken before the rows
    // the paste is compared with, so that both carry the mark.
    d.o.view.send({ type: 'copy', rowIds: [d.entryNamed('Number').id] });
    await settle();
    const before = await d.widePaint();

    const posts = await d.gesture({ type: 'paste', rowId: d.sectionRowOf(section) });
    const applied = posts.filter((p) => p.type === 'insertEntryRows');

    expect(applied).toHaveLength(1);
    const fresh = d.o.session.findNodeById(applied[0].rows[0].ID) as any;
    expect(fresh.name, 'the copy is renamed within the namespace').toBe('Number1');
    expect(d.o.session.findNodeById(fresh.id), 'the pasted entry is indexed').toBe(d.entryNamed('Number1'));

    const narrow = d.onScreen();
    expect(narrow.length).toBe(before.length + 1);
    expect(narrow).toEqual(await d.widePaint());
  });

  it('a same-document move: the source’s rows leave, the copy’s arrive under its own name', async () => {
    const d = await open('struct-move.sldd');
    // Into the next section: a cut pasted back into the section it came from is the no-op it is
    // (transfer.ts, in the extension's provider too), so a move that lands is between sections.
    const section = d.model().children[1];
    const source = d.entryNamed('PI');
    const before = await d.widePaint();
    // The cut marks its source on screen, and the paste spends it.
    d.o.view.send({ type: 'cut', rowIds: [source.id] });
    await settle();

    // The source goes first, from the text AND from the model — the paste's uniqueness check
    // reads the model's namespace, and a source still standing there would push the copy to
    // "PI1".
    const posts = await d.gesture({ type: 'paste', rowId: d.sectionRowOf(section) });
    const added = posts.filter((p) => p.type === 'insertEntryRows');

    expect(d.o.session.findNodeById(added[0].rows[0].ID).name, 'the copy keeps the moved name').toBe('PI');
    const narrow = d.onScreen();
    expect(narrow.length).toBe(before.length);
    expect(narrow).toEqual(await d.widePaint());
  });

  it('a TWO-source move: both sources leave, both copies arrive, and undo puts them back', async () => {
    // Each undo op is captured against the model as it stands at that moment, and
    // patchOfPairs REVERSES the undo list, so the inverses replay last-removed-first and
    // every insert names the index its entry actually held.
    const d = await open('struct-move-two.sldd');
    // Into the next section: a cut pasted back into the section it came from is the no-op it is
    // (transfer.ts, in the extension's provider too), so a move that lands is between sections.
    const section = d.model().children[1];
    const sources = ['PI', 'Number'].map((n) => d.entryNamed(n));
    const before = await d.widePaint();
    // The cut marks its sources on screen, and the paste spends it.
    d.o.view.send({ type: 'cut', rowIds: sources.map((s: any) => s.id) });
    await settle();
    const textBefore = d.doc.text;

    const posts = await d.gesture({ type: 'paste', rowId: d.sectionRowOf(section) });
    const added = posts.filter((p) => p.type === 'insertEntryRows');

    expect(
      added.map((p: any) => d.o.session.findNodeById(p.rows[0].ID).name),
      'both copies keep their names',
    ).toEqual(['PI', 'Number']);
    const moved = d.onScreen();
    expect(moved.length).toBe(before.length);
    expect(moved, 'the narrow paint of a two-source move').toEqual(await d.widePaint());

    // Cmd+Z: the text comes back as it was, and the REVERSED inverses replay over the model.
    const undo = await d.history('undo');
    expect(d.doc.text, 'the text comes back as it was').toBe(textBefore);
    expect(undo.recognised, 'the inverses the host kept are what is replayed').toBe(true);
    const undone = d.onScreen();
    expect(undone, 'undo of a two-source move').toEqual(await d.widePaint());
  });
});

// ---------------------------------------------------------------------------------------
// Undo and redo of a structural edit: what an undo of a delete or a paste means is not in its
// bytes, so the engine keeps the ops with the pair it remembers and recognises which direction
// came back.
// ---------------------------------------------------------------------------------------
describe('JSON .sldd structural edit — undo and redo, from the ops the host kept', () => {
  it('undo of a delete puts the entry back where it was — narrow === wide', async () => {
    const d = await open('struct-undo-delete.sldd');
    const before = await d.widePaint();
    const entryRowId = d.entryNamed('Number').id;

    await d.gesture({ type: 'delete', rowIds: [entryRowId] });

    // Cmd+Z: the bytes written back at the same offset, and only that.
    const undo = await d.history('undo');
    expect(undo.recognised, 'the host recognises its own delete coming back').toBe(true);

    const narrow = d.onScreen();
    expect(narrow, 'the table is what it was before the delete').toEqual(before);
    expect(d.o.session.findNodeById(entryRowId), 'and the restored id resolves again').toBeTruthy();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('redo of a delete takes the entry away again — narrow === wide', async () => {
    const d = await open('struct-redo-delete.sldd');
    await d.widePaint();
    const entryRowId = d.entryNamed('Number').id;

    await d.gesture({ type: 'delete', rowIds: [entryRowId] });
    const deleted = d.onScreen();

    // Undone...
    expect((await d.history('undo')).recognised).toBe(true);
    // ...and redone.
    const redo = await d.history('redo');
    expect(redo.recognised, 'the redo is the same edit forwards').toBe(true);

    const narrow = d.onScreen();
    expect(narrow).toEqual(deleted);
    expect(narrow).toEqual(await d.widePaint());
  });

  it('undo of a many-row delete restores every row in one step', async () => {
    // One remembered edit, one patch, both directions — and the inverses in the order that
    // puts each entry back at the index it held.
    const d = await open('struct-undo-delete-many.sldd');
    const before = await d.widePaint();
    const a = d.entryNamed('Number');
    const b = d.entryNamed('Struct');
    const textBefore = d.doc.text;

    await d.gesture({ type: 'delete', rowIds: [a.id, b.id] });

    const undo = await d.history('undo');
    expect(d.doc.text, 'the undo restores the text exactly').toBe(textBefore);
    expect(undo.recognised, 'the host recognises its own multi-row delete coming back').toBe(true);

    const narrow = d.onScreen();
    expect(narrow, 'the table is what it was before the delete').toEqual(before);
    expect(narrow).toEqual(await d.widePaint());
  });

  it('undo of a MIXED many-row delete brings the nested child back too', async () => {
    // A child leaving rewrites its entry's span, and an undo writes that span back; without
    // the owning entry among the remembered pairs the field is back in the text and still
    // missing from the model and the table: narrow ≠ wide.
    const d = await open('struct-undo-delete-mixed.sldd');
    const before = await d.widePaint();
    const struct = d.entryNamed('Struct');
    const number = d.entryNamed('Number');
    const childId = struct.children[0].id;
    const textBefore = d.doc.text;

    await d.gesture({ type: 'delete', rowIds: [number.id, childId] });
    const deleted = d.onScreen();
    expect(deleted.some((r: any) => r.ID === childId), 'the field is gone').toBe(false);

    const undo = await d.history('undo');
    expect(d.doc.text, 'the undo restores the text exactly').toBe(textBefore);
    expect(undo.recognised, 'the host recognises its own mixed delete coming back').toBe(true);

    const narrow = d.onScreen();
    expect(narrow, 'the table is what it was before the delete').toEqual(before);
    expect(d.o.session.findNodeById(childId), 'and the field resolves for the next edit').toBeTruthy();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('undo of a paste takes the pasted entry away — narrow === wide', async () => {
    const d = await open('struct-undo-paste.sldd');
    const section = d.model().children[0];
    d.o.view.send({ type: 'copy', rowIds: [d.entryNamed('Number').id] });
    await settle();
    const before = await d.widePaint();

    await d.gesture({ type: 'paste', rowId: d.sectionRowOf(section) });

    const undo = await d.history('undo');
    expect(undo.recognised, 'the host recognises its own paste coming back').toBe(true);

    const narrow = d.onScreen();
    expect(narrow).toEqual(before);
    expect(narrow).toEqual(await d.widePaint());
  });

  it('undo of a MOVE undoes its two halves in reverse — narrow === wide', async () => {
    // The order is the whole reason patchOfPairs reverses: the copy has to go before the
    // source comes back, or two entries answer to one name, hence to one id.
    const d = await open('struct-undo-move.sldd');
    // Into the next section: a cut pasted back into the section it came from is the no-op it is
    // (transfer.ts, in the extension's provider too), so a move that lands is between sections.
    const section = d.model().children[1];
    const source = d.entryNamed('PI');
    const before = await d.widePaint();
    // The cut marks its source on screen, and the paste spends it.
    d.o.view.send({ type: 'cut', rowIds: [source.id] });
    await settle();
    const textBefore = d.doc.text;

    await d.gesture({ type: 'paste', rowId: d.sectionRowOf(section) });

    const undo = await d.history('undo');
    expect(d.doc.text, 'the undo restores the text exactly').toBe(textBefore);
    expect(undo.recognised, 'the host recognises the move coming back').toBe(true);

    const narrow = d.onScreen();
    expect(narrow).toEqual(before);
    expect(narrow).toEqual(await d.widePaint());
  });
});
