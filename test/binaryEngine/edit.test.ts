// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/binarySlddEdit.test.ts at c73da3c, and
// from test-integration/suite/binarySlddUndo.test.ts at c73da3c: the binary dictionary editor
// opened, painted, saved through its gate, and its undo and redo, run against view's binary
// dictionary engine. What the extension's cases could only reach by calling into the document
// (pushEdit, its views) they reach the same way here; each also has the case through the table's
// own messages, which a page can send and the extension's suites could not.
import * as assert from 'node:assert';
import { applyEntryOps, createSession, entryRecord } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, createWorkspace, type Registers } from '../../src/model/index.js';
import { BinaryEngine, EditStack, EditStackIndex } from '../../src/host/index.js';
import { chunkOf, entryRow, file, membersOf, open, PARAMS, WORKSPACE_BINARY, waitFor } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The first entry of the first non-empty section. */
function firstEntry(root: any): any {
  for (const section of root.children as any[]) {
    if (section.children.length > 0) return section.children[0];
  }
  return null;
}

describe('binary dictionary engine: open, paint, save', () => {
  it('opens a compressed-binary .sldd as a writable document and paints it', async () => {
    const o = await open(WORKSPACE_BINARY);
    assert.ok(o.engine.chunkXml.includes('<Object Class="DD.ENTRY">'), 'chunkXml decoded');
    const set = o.view.posts.find((p) => p.type === 'setRows');
    assert.strictEqual(set.editable, true);
    assert.ok(o.model(), 'the paint registered the document');
  });

  // The pass-through bag is the one place the data member must NOT appear: the saved bytes cannot
  // say so, since a save spreads the bag and then re-inserts the member from chunkXml. Asserted on
  // both bags that get built: the open's and a reload's.
  it('the pass-through parts exclude the member the chunk is edited as', async () => {
    const bytes = file(WORKSPACE_BINARY);
    const o = await open(WORKSPACE_BINARY, bytes);
    const members = Object.keys(membersOf(bytes));
    assert.ok(members.includes('data/chunk0.xml'), 'fixture carries the data member');
    assert.ok(!Object.keys(o.engine.parts).includes('data/chunk0.xml'), 'the open excluded the data member');
    assert.deepStrictEqual(Object.keys(o.engine.parts).sort(), members.filter((m) => m !== 'data/chunk0.xml').sort(), 'every other member carried through');
    o.engine.replace(bytes);
    assert.ok(!Object.keys(o.engine.parts).includes('data/chunk0.xml'), 'a reload excluded it too');
    assert.deepStrictEqual(Object.keys(o.engine.parts).sort(), members.filter((m) => m !== 'data/chunk0.xml').sort(), 'a reload carried every other member through');
  });

  // `meta.path` is what lets a model's `x@my params.sldd` link find this open dictionary: core
  // tries the srcId's own basename first, and the srcId is built from the uri, which
  // percent-encodes. Asserted after both registrations, the paint and the save's.
  it('registers the source under the DECODED basename, before and after a save', async () => {
    const o = await open(WORKSPACE_BINARY, undefined, { uri: 'file:///work/my%20params.sldd' });
    const registered = () => o.model()?.meta?.path;
    assert.ok(o.engine.srcId.includes('my%20params.sldd'), 'srcId is percent-encoded');
    assert.strictEqual(registered(), 'my params.sldd', 'the paint registered the decoded basename');
    o.save();
    assert.strictEqual(registered(), 'my params.sldd', 'the save registered the same spelling');
  });

  // Both shapes of unreadable chunkXml, because the reader no longer throws for either: it reports
  // `source-unreadable` and answers an empty dictionary, which is the content the gate must refuse
  // to write. The second is the dangerous one: well-formed XML under the wrong root reads as a
  // dictionary with zero entries.
  for (const [label, chunk] of [
    ['malformed', '<not valid<<<'],
    ['well-formed but not a dictionary', '<Other Class="DD.THING"/>'],
  ] as const) {
    it(`the save gate rejects ${label} chunkXml and hands back nothing`, async () => {
      const o = await open(WORKSPACE_BINARY);
      (o.engine as any).chunk = chunk;
      assert.throws(() => o.engine.beginSave(), /^Error: Refusing to save/);
      assert.throws(() => o.engine.serialize(), /^Error: Refusing to save/);
      assert.strictEqual(o.disk(), o.original, 'nothing was written');
    });
  }

  it('a throw in what follows a paint is said as the paint failing, after the rows, and goes no further', async () => {
    const inner = createRegisters();
    let broken = false;
    const registers: Registers = {
      ...inner,
      clipboardState: () => {
        if (broken) throw new Error('the registers broke');
        return inner.clipboardState();
      },
    };
    const o = await open(PARAMS, undefined, { registers });
    broken = true;
    let from = o.view.posts.length;
    o.view.send({ type: 'ready' });
    await waitFor('the paint', () => o.view.posts.slice(from).some((p) => p.type === 'error'));
    assert.deepStrictEqual(o.view.posts.slice(from).map((p) => p.type), ['setRows', 'sectionRules', 'error']);
    assert.strictEqual(o.view.posts.pop().message, 'Failed to parse params_binary.sldd: the registers broke');
    from = o.view.posts.length;
    let changed = 0;
    (o.engine as any).options.changed = () => changed++;
    o.engine.repaintAll();
    assert.deepStrictEqual(o.view.posts.slice(from).map((p) => p.type), ['setRows', 'sectionRules', 'error'], 'a repaint the same');
    assert.strictEqual(changed, 1, 'and the repaint still ends in `changed`');
  });

  it('is named by the last segment of its uri path, decoded, as VS Code names one', async () => {
    const o = await open(PARAMS, undefined, { uri: 'file:///work/a%5Cmy%20params.sldd?x=1' });
    assert.strictEqual(o.engine.metaPath, 'my params.sldd');
    assert.strictEqual(o.model().meta.path, 'my params.sldd', 'and registered under it');
  });

  it('save round-trips: the saved bytes unzip, with data/chunk0.xml and every pass-through part', async () => {
    const o = await open(WORKSPACE_BINARY);
    const zip = membersOf(o.save());
    assert.ok(zip['data/chunk0.xml'], 'chunk0.xml present after save');
    // This minimal fixture carries metadata/mwcoreProperties.xml: it survives the re-zip.
    assert.ok(zip['metadata/mwcoreProperties.xml'], 'pass-through OPC part preserved');
  });

  // The extension hands a JSON dictionary that reached this editor back to the view that routes on
  // the bytes. An engine is never made of one: it throws, and the workspace opens it read-only.
  it('is not made of a JSON-text .sldd: the workspace opens one read-only', async () => {
    const json = file('test/fixtures/params.sldd');
    assert.throws(
      () =>
        new BinaryEngine({
          session: createSession(),
          uri: 'file:///work/data.sldd',
          bytes: json,
          sink: new EditStack(),
          index: new EditStackIndex(),
          registers: createRegisters(),
        }),
    );
    const ws = createWorkspace({ editing: true });
    try {
      const doc = await ws.open(json, 'data.sldd');
      assert.strictEqual(doc.editable, false);
      assert.strictEqual((await doc.table.open()).editable, false);
    } finally {
      ws.dispose();
    }
  });
});

describe('binary dictionary engine: undo and redo', () => {
  it('undo and redo restore the payload and the model without re-parsing it', async () => {
    const o = await open(WORKSPACE_BINARY);
    const root: any = o.model();
    const entry = firstEntry(root);
    assert.strictEqual(entry.name, 'Kp', 'the fixture entry is the one this test renames');
    const before = o.engine.chunkXml;
    assert.ok(before.includes('>Kp<'), 'the payload spells the entry name');
    const after = before.replace('>Kp<', '>Ki<');

    // The rename as the edit makes it: the model first, then the edit pushed with a patch that
    // names the entry by the id the OTHER direction leaves behind.
    const beforeRecord = entryRecord(entry);
    const preId: string = entry.id;
    const applied = applyEntryOps(root, [{ kind: 'replace', rowId: preId, record: { ...beforeRecord, name: 'Ki' } }], o.session as any);
    const renamed = (applied[0] as any).entry;
    const postId: string = renamed.id;
    assert.notStrictEqual(postId, preId, 'the rename moved the entry’s id');
    (o.engine as any).pushEdit('Edit Name', before, after, {
      undo: [{ kind: 'replace', rowId: postId, record: beforeRecord }],
      redo: [{ kind: 'replace', rowId: preId, record: entryRecord(renamed) }],
    });

    assert.strictEqual(o.events.length, 1, 'the edit reached the stack');
    assert.strictEqual(o.events[0].label, 'Edit Name');
    assert.strictEqual(o.engine.chunkXml, after, 'the edit swapped the payload');

    o.undo();
    assert.strictEqual(o.engine.chunkXml, before, 'undo restored the payload text');
    assert.strictEqual(o.model(), root, 'undo did NOT re-parse: the same tree is still registered');
    const restored: any = o.session.findNodeById(preId);
    assert.ok(restored, 'the pre-edit row id resolves again, so the next edit on that row works');
    assert.strictEqual(restored.name, 'Kp');
    assert.strictEqual(o.session.findNodeById(postId), null, 'the renamed id is gone with it');

    o.redo();
    assert.strictEqual(o.engine.chunkXml, after, 'redo swapped the payload back');
    assert.strictEqual(o.model(), root, 'redo did not re-parse either');
    assert.strictEqual((o.session.findNodeById(postId) as any)?.name, 'Ki');
    assert.strictEqual(o.session.findNodeById(preId), null, 'and the pre-edit id is gone again');

    // What undo leaves behind is what a save writes.
    o.undo();
    assert.strictEqual(chunkOf(o.save()), before, 'the saved payload is the undone one');
  });

  it('the same rename through the table: one edit, whose undo and redo move the rows and the payload', async () => {
    const o = await open(WORKSPACE_BINARY);
    const before = o.engine.chunkXml;
    const kp = entryRow(o.view.posts, 'Kp');
    o.view.send({ type: 'edit', rowId: kp.ID, columnId: 'Name', oldValue: 'Kp', newValue: 'Ki' });
    assert.strictEqual(o.events.length, 1);
    assert.strictEqual(o.events[0].label, 'Edit Name');
    assert.deepStrictEqual(o.names().slice(0, 1), ['Ki']);
    const update = o.view.posts.filter((p) => p.type === 'updateEntryRows').pop();
    assert.strictEqual(update.entryRowId, kp.ID, 'the run on screen is the one spliced');
    assert.strictEqual(update.rows[0].Name.label, 'Ki');
    o.undo();
    assert.strictEqual(o.engine.chunkXml, before);
    assert.strictEqual(o.index.dirty, false);
    o.redo();
    assert.deepStrictEqual(o.names().slice(0, 1), ['Ki']);
    assert.strictEqual(o.index.dirty, true);
  });

  // A document repaints EVERY view, and chooses the narrow repaint only when the edit carried a
  // patch: an edit that could not state one falls back to the wide repaint.
  it('every open view is repainted, narrowly when the edit says how and wide when it does not', async () => {
    const o = await open(WORKSPACE_BINARY);
    o.view.close();
    await waitFor('the closed view to leave the document', () => (o.engine as any).views.size === 0);
    // Stand-in views, the only way to observe WHICH repaint ran.
    const calls: string[] = [];
    const views = (o.engine as any).views as Set<{ repaintAll(): void; repaintOps(a: unknown[]): void }>;
    for (const tag of ['a', 'b']) {
      views.add({ repaintAll: () => calls.push(`${tag}:all`), repaintOps: () => calls.push(`${tag}:ops`) });
    }
    const root: any = o.model();
    const entry = firstEntry(root);
    const record = entryRecord(entry);
    const before = o.engine.chunkXml;

    (o.engine as any).pushEdit('Edit Name', before, before.replace('>Kp<', '>Ki<'), {
      undo: [{ kind: 'replace', rowId: entry.id, record }],
      redo: [{ kind: 'replace', rowId: entry.id, record }],
    });
    o.stack.undo();
    assert.deepStrictEqual(calls, ['a:ops', 'b:ops'], 'a patched undo repaints both views, narrowly');

    calls.length = 0;
    (o.engine as any).pushEdit('Add child', before, before.replace('>Kp<', '>Ki<'));
    o.stack.undo();
    assert.deepStrictEqual(calls, ['a:all', 'b:all'], 'an undo with nothing to apply repaints both views, wide');
    assert.strictEqual(o.engine.chunkXml, before, 'either way the payload is restored');
  });
});
