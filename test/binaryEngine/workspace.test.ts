// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A compressed dictionary edited in the page: createWorkspace({editing}) opens one on the binary
// dictionary engine, over an undo stack of its own, and the Doc saves it (serialize, saved,
// notSaved) and says when it is dirty. Its table is an EditableTableSource connectTable({editing})
// wires a table to; it shares the workspace's clipboard with the workspace's other documents.
import * as assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, isEditable, type Doc, type Notice, type TableChange, type Workspace } from '../../src/model/index.js';
import { connectTable, defineTreeTable } from '../../src/widgets/tree-table/index.js';
import { fixture } from '../matEngine/harness.js';
import { chunkOf, entryOf, file, PARAMS, readSldd } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

defineTreeTable();

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
  document.body.replaceChildren();
});

function workspace(notices: Notice[] = []): Workspace {
  const ws = createWorkspace({ editing: true, notify: (n) => void notices.push(n) });
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

const entryId = (doc: Doc, name: string) => `binedit:${doc.uri}/design/${name}`;
const valueIn = (bytes: Uint8Array, name: string) => readSldd(bytes, (dict) => String(entryOf(dict, name)?.toRow().Value));

describe('createWorkspace({editing}): a compressed dictionary edited in the page', () => {
  it('opens a compressed dictionary to edit; a JSON one, and one that does not read, stay read-only', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    assert.strictEqual(doc.kind, 'dictionary');
    assert.strictEqual(doc.editable, true);
    assert.ok(isEditable(doc.table));
    assert.strictEqual((await doc.table.open()).editable, true);
    const json = await ws.open(file('test/fixtures/params.sldd'), 'text.sldd');
    assert.strictEqual(json.editable, false, 'a JSON dictionary waits for its engine');
    // A zip with no data part: still opens, read-only, and its table says why.
    const { zipSync } = await import('fflate');
    const empty = await ws.open(zipSync({ 'metadata/mwcoreProperties.xml': new Uint8Array([60, 97, 47, 62]) }), 'empty.sldd');
    assert.strictEqual(empty.editable, false);
    await assert.rejects(empty.table.open());
  });

  it('an edit makes it dirty, its undo clean, and a save of it clean, said each time it changes', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    await doc.table.open();
    const dirty: boolean[] = [];
    doc.onDirty((d) => void dirty.push(d));
    const table = doc.table as any;
    table.edit({ rowId: entryId(doc, 'gravity'), columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    assert.strictEqual(doc.dirty, true);
    table.undo();
    assert.strictEqual(doc.dirty, false);
    table.redo();
    const save = doc.serialize();
    assert.strictEqual(valueIn(save.bytes, 'gravity'), '9.8');
    assert.strictEqual(doc.dirty, true, 'dirty until the bytes are written');
    doc.saved(save.at);
    assert.strictEqual(doc.dirty, false);
    await settle();
    assert.deepStrictEqual(dirty, [true, false, true, false]);
  });

  it('a save whose bytes were never written leaves it as it was, and the next save writes the edit', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    await doc.table.open();
    const changes = heard(doc);
    (doc.table as any).edit({ rowId: entryId(doc, 'gravity'), columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    const first = doc.serialize();
    doc.notSaved(first.at);
    assert.strictEqual(doc.dirty, true);
    const rows = changes.filter((c) => c.kind === 'updateEntry').pop() as any;
    assert.strictEqual(rows.rows[0].Status, 'Modified', 'and the Status column still says so');
    const second = doc.serialize();
    assert.strictEqual(valueIn(second.bytes, 'gravity'), '9.8');
    doc.saved(second.at);
    assert.strictEqual(doc.dirty, false);
  });

  it('a save the gate refuses hands back nothing, and keeps the edit', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    await doc.table.open();
    (doc.table as any).edit({ rowId: entryId(doc, 'gravity'), columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    const engine = (doc as any).engine;
    const chunk = engine.chunk;
    engine.chunk = '<not valid<<<';
    assert.throws(() => doc.serialize(), /^Error: Refusing to save: the document did not re-parse/);
    engine.chunk = chunk;
    assert.strictEqual(doc.dirty, true);
    assert.strictEqual(valueIn(doc.serialize().bytes, 'gravity'), '9.8');
  });

  it('a reload takes the new bytes, empties the undo stack, and is clean; bytes that are not a dictionary keep what it held', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    await doc.table.open();
    const changes = heard(doc);
    (doc.table as any).edit({ rowId: entryId(doc, 'gravity'), columnId: 'Value', oldValue: '9.81', newValue: '9.8' });
    await assert.rejects(doc.reload(new TextEncoder().encode('not a zip')));
    assert.strictEqual(doc.dirty, true, 'a reload that could not read the bytes changes nothing');
    const saved = doc.serialize();
    doc.notSaved(saved.at);
    const other = file(PARAMS);
    await doc.reload(other);
    assert.strictEqual(doc.dirty, false);
    assert.ok(changes.some((c) => c.kind === 'replaceAll'), 'the new file is painted');
    (doc.table as any).undo();
    assert.strictEqual(doc.dirty, false, 'nothing from before the reload is undone');
    assert.strictEqual(valueIn(doc.serialize().bytes, 'gravity'), '9.81');
  });

  it("a workspace's MAT-file and dictionary share its clipboard: a variable cut from one pastes into the other, and leaves its source", async () => {
    const ws = workspace();
    const mat = await ws.open(fixture('pv_basic.mat'), 'gains.mat');
    const dict = await ws.open(file(PARAMS), 'params.sldd');
    await mat.table.open();
    await dict.table.open();
    const dictHeard = heard(dict);
    (mat.table as any).cut([`binedit:${mat.uri}/x`]);
    assert.ok(dictHeard.some((c) => c.kind === 'clipboard' && c.state.canPaste), 'every table is told what the clipboard holds');
    (dict.table as any).paste('section:design');
    await settle();
    assert.strictEqual(dict.dirty, true);
    assert.strictEqual(mat.dirty, true, "the cut's source lost the variable, as an edit of its own");
    const saved = dict.serialize().bytes;
    assert.ok(readSldd(saved, (d) => !!entryOf(d, 'x')), 'the dictionary holds it');
    assert.ok(chunkOf(saved).includes('>x<'));
  });

  it('wired to a table with connectTable({editing}): the gestures edit it, and its rules follow its rows', async () => {
    const ws = workspace();
    const doc = await ws.open(file(PARAMS), 'params.sldd');
    const table = document.createElement('dex-tree-table') as any;
    document.body.append(table);
    const seen: string[] = [];
    doc.table.subscribe((c) => void seen.push(c.kind));
    const handle = connectTable(table, doc.table, { editing: true });
    await settle();
    await table.updateComplete;
    assert.deepStrictEqual(seen.slice(0, 2), ['sectionRules', 'clipboard'], 'what follows a paint, after it');
    assert.strictEqual(table.canAdd, true);
    table.dispatchEvent(
      new CustomEvent('dex-edit-completed', { detail: { rowId: entryId(doc, 'gravity'), columnId: 'Value', oldValue: '9.81', newValue: '9.8' } }),
    );
    await settle();
    assert.strictEqual(doc.dirty, true);
    assert.strictEqual(table.rows.find((r: any) => r.ID === entryId(doc, 'gravity')).Value, '9.8');
    handle.dispose();
  });
});
