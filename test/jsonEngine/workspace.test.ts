// Copyright 2026 The MathWorks, Inc.
// @vitest-environment happy-dom
//
// A JSON dictionary edited in the page: createWorkspace({editing}) opens one on the JSON dictionary
// engine, over a text of the page's own whose undo stack, dirty state and saves are the document's,
// and the Doc saves it (serialize, saved, notSaved) and says when it is dirty. One over the text-sync
// limit, as the extension keeps one, opens read-only. Its table is an EditableTableSource
// connectTable({editing}) wires a table to; it shares the workspace's clipboard with the
// workspace's compressed dictionaries and MAT-files.
import * as assert from 'node:assert';
import { TEXT_SYNC_LIMIT } from 'data-explorer-core';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, isEditable, type Doc, type Notice, type TableChange, type Workspace } from '../../src/model/index.js';
import { connectTable, defineTreeTable } from '../../src/widgets/tree-table/index.js';
import { chunkOf as binaryChunkOf, entryOf as dictEntryOf, PARAMS, readSldd } from '../binaryEngine/harness.js';
import { fixture } from '../matEngine/harness.js';
import { chunkOf, entryNames, file, isEntryRow, nameOf, settle, WORKSPACE_DATA, WORKSPACE_PARAMS } from './harness.js';

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

const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** The entry row named `name` in a paint of `doc`'s table. */
async function entryRowOf(doc: Doc, name: string): Promise<any> {
  const row = (await doc.table.open()).rows.find((r: any) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `${doc.name} has an entry row for "${name}"`);
  return row;
}

/** The Value of the Simulink.Parameter gravity, as the saved text spells it. */
const gravityIn = (bytes: Uint8Array): unknown =>
  (chunkOf(dec(bytes)).entries as any[]).find((e) => e.name === 'gravity').value._elements[0]._properties.Value;

/** Set the Value of the entry or variable `name` through `doc`'s table, and let the write land. */
async function editValue(doc: Doc, name: string, value: string): Promise<void> {
  const row = (await doc.table.open()).rows.find((r: any) => nameOf(r) === name);
  assert.ok(row, `${doc.name} has a row for "${name}"`);
  (doc.table as any).edit({ rowId: row.ID, columnId: 'Value', oldValue: String(row.Value ?? ''), newValue: value });
  await settle();
}

/** Where the entry named `name` is in a dictionary's `text`: its object, from its `{` to its `}`. */
function entrySpan(text: string, name: string): { start: number; end: number } {
  const at = text.indexOf(`"name": "${name}"`);
  assert.ok(at > 0, `the text holds an entry "${name}"`);
  const start = text.lastIndexOf('{', at);
  let depth = 0;
  let inString = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return { start, end: i + 1 };
  }
  throw new Error(`the entry "${name}" does not close`);
}

/** Set gravity to `value` through the table, and let the write land. */
async function editGravity(doc: Doc, value: string): Promise<void> {
  const row = await entryRowOf(doc, 'gravity');
  (doc.table as any).edit({ rowId: row.ID, columnId: 'Value', oldValue: String(row.Value), newValue: value });
  await settle();
}

describe('createWorkspace({editing}): a JSON dictionary edited in the page', () => {
  it('opens a JSON dictionary to edit; one over the text-sync limit, and one that is not JSON, stay read-only', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    assert.strictEqual(doc.kind, 'dictionary');
    assert.strictEqual(doc.editable, true);
    assert.ok(isEditable(doc.table));
    assert.strictEqual((await doc.table.open()).editable, true);
    // The extension keeps a JSON dictionary VS Code cannot sync as a TextDocument read-only.
    const text = dec(file(WORKSPACE_DATA));
    const large = new TextEncoder().encode(text + ' '.repeat(TEXT_SYNC_LIMIT + 1 - text.length));
    const big = await ws.open(large, 'large.sldd');
    assert.strictEqual(big.editable, false, 'over the text-sync limit');
    assert.ok(!isEditable(big.table));
    assert.ok((await big.table.open()).rows.length > 0, 'and still shows its entries');
    // Text that is not JSON: still opens, read-only, and its table says why.
    const broken = await ws.open(new TextEncoder().encode('{"not": json'), 'broken.sldd');
    assert.strictEqual(broken.editable, false);
    await assert.rejects(broken.table.open());
  });

  it('an edit makes it dirty, its undo clean, and a save of it clean, said each time it changes', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    await doc.table.open();
    const dirty: boolean[] = [];
    doc.onDirty((d) => void dirty.push(d));
    await editGravity(doc, '9.8');
    assert.strictEqual(doc.dirty, true);
    (doc.table as any).undo();
    await settle();
    assert.strictEqual(doc.dirty, false);
    (doc.table as any).redo();
    await settle();
    const save = doc.serialize();
    assert.strictEqual(gravityIn(save.bytes), 9.8);
    assert.strictEqual(doc.dirty, true, 'dirty until the bytes are written');
    doc.saved(save.at);
    assert.strictEqual(doc.dirty, false);
    await settle();
    assert.deepStrictEqual(dirty, [true, false, true, false]);
  });

  it('a save whose bytes were never written leaves it as it was, and the next save writes the edit', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    await doc.table.open();
    await editGravity(doc, '9.8');
    const first = doc.serialize();
    doc.notSaved(first.at);
    await settle();
    assert.strictEqual(doc.dirty, true);
    assert.strictEqual((await entryRowOf(doc, 'gravity')).Status, 'Modified', 'and the Status column still says so');
    const second = doc.serialize();
    assert.strictEqual(gravityIn(second.bytes), 9.8);
    doc.saved(second.at);
    assert.strictEqual(doc.dirty, false);
    await settle();
    assert.strictEqual((await entryRowOf(doc, 'gravity')).Status, '', 'saved: the file holds it');
  });

  it('a save of text the document has since moved on from measures the Status column from what was written', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    await doc.table.open();
    await editGravity(doc, '9.8');
    const save = doc.serialize();
    // An edit lands while the bytes are being written.
    const scalarD = await entryRowOf(doc, 'scalarD');
    (doc.table as any).edit({ rowId: scalarD.ID, columnId: 'Value', oldValue: String(scalarD.Value), newValue: '42' });
    await settle();
    doc.saved(save.at);
    await settle();
    assert.strictEqual(doc.dirty, true, 'the edit since is not saved');
    assert.strictEqual((await entryRowOf(doc, 'gravity')).Status, '', 'what was written is the file');
    assert.strictEqual((await entryRowOf(doc, 'scalarD')).Status, 'Modified', 'and what came after it is not');
  });

  it('a reload takes the new bytes, empties the undo stack, and is clean', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    await doc.table.open();
    const changes = heard(doc);
    await editGravity(doc, '9.8');
    assert.strictEqual(doc.dirty, true);
    const saved = doc.serialize();
    doc.notSaved(saved.at);
    await doc.reload(file(WORKSPACE_PARAMS));
    await settle();
    assert.strictEqual(doc.dirty, false);
    assert.ok(
      changes.some((c) => c.kind === 'replaceAll' || c.kind === 'updateEntry'),
      'the new file is painted',
    );
    assert.strictEqual((await entryRowOf(doc, 'gravity')).Value, '9.81');
    (doc.table as any).undo();
    await settle();
    assert.strictEqual(doc.dirty, false, 'nothing from before the reload is undone');
    assert.strictEqual(gravityIn(doc.serialize().bytes), 9.81);
  });

  // VS Code runs a document's saves one at a time; a page may have two in flight (a double save, an
  // autosave), and the older can land last. The file then holds it, and the newest edit is unsaved.
  it('a save that lands after a newer one leaves it dirty until the next save, as a MAT-file and a compressed dictionary are', async () => {
    const ws = workspace();
    const cases: [name: string, bytes: Uint8Array, row: string, older: string, newer: string][] = [
      ['params.sldd', file(WORKSPACE_PARAMS), 'gravity', '9.8', '9.7'],
      ['params_binary.sldd', file(PARAMS), 'gravity', '9.8', '9.7'],
      ['cases.mat', fixture('cases.mat'), 'scalarD', '42', '43'],
    ];
    const answers: Record<string, { afterNewer: boolean; afterOlder: boolean; told: boolean[]; afterNext: boolean; next: string }> = {};
    for (const [name, bytes, row, a, b] of cases) {
      const doc = await ws.open(bytes, name);
      assert.strictEqual(doc.editable, true, `${name} is edited in the page`);
      await doc.table.open();
      const told: boolean[] = [];
      doc.onDirty((d) => void told.push(d));
      await editValue(doc, row, a);
      const older = doc.serialize();
      await editValue(doc, row, b);
      const newer = doc.serialize();
      doc.saved(newer.at);
      await settle();
      const afterNewer = doc.dirty;
      doc.saved(older.at);
      await settle();
      const afterOlder = doc.dirty;
      if (name === 'params.sldd') {
        assert.strictEqual((await entryRowOf(doc, 'gravity')).Status, 'Modified', 'measured from the file, which holds the older edit');
      }
      // The next save writes the newest edit, and is clean.
      const next = doc.serialize();
      doc.saved(next.at);
      await settle();
      const reread = (await workspace().open(next.bytes, name)).table.open();
      const value = String((await reread).rows.find((r: any) => nameOf(r) === row)?.Value);
      answers[name] = { afterNewer, afterOlder, told, afterNext: doc.dirty, next: value === b ? 'the newest edit' : value };
    }
    const answer = { afterNewer: false, afterOlder: true, told: [true, false, true, false], afterNext: false, next: 'the newest edit' };
    assert.deepStrictEqual(answers, { 'params.sldd': answer, 'params_binary.sldd': answer, 'cases.mat': answer });
  });

  it('a file with a byte order mark keeps it: saved unedited it is the same bytes, and an edit saves behind it', async () => {
    const ws = workspace();
    const plain = file(WORKSPACE_PARAMS);
    const marked = new Uint8Array([0xef, 0xbb, 0xbf, ...plain]);
    const doc = await ws.open(marked, 'params.sldd');
    assert.strictEqual(doc.editable, true);
    await doc.table.open();
    assert.deepStrictEqual(doc.serialize().bytes, marked, 'byte for byte');
    await editGravity(doc, '9.8');
    const save = doc.serialize();
    assert.deepStrictEqual([...save.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    assert.strictEqual(gravityIn(save.bytes), 9.8);
    // A reload takes the new file's: without one, it saves without one.
    await doc.reload(plain);
    assert.deepStrictEqual(doc.serialize().bytes, plain);
  });

  it('saves a cell edit as the file with that entry rewritten and every other byte as it was, and the file reads back with it', async () => {
    const ws = workspace();
    const original = dec(file(WORKSPACE_PARAMS));
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    await doc.table.open();
    await editGravity(doc, '9.8');
    const save = doc.serialize();
    doc.saved(save.at);
    const written = dec(save.bytes);
    const was = entrySpan(original, 'gravity');
    const now = entrySpan(written, 'gravity');
    assert.strictEqual(written.slice(0, now.start), original.slice(0, was.start), 'every byte before the entry is the file\'s');
    assert.strictEqual(written.slice(now.end), original.slice(was.end), 'and every byte after it');
    assert.strictEqual(doc.dirty, false);
    assert.deepStrictEqual(doc.serialize().bytes, save.bytes, 'the next save writes the same bytes');
    const again = await workspace().open(save.bytes, 'params.sldd');
    const gravity = await entryRowOf(again, 'gravity');
    assert.deepStrictEqual([gravity.Value, gravity.Status], ['9.8', ''], 'read back from the file, the edit is in it');
  });

  it('saves a delete as the file without that entry and the comma before it, and every other byte as it was', async () => {
    const ws = workspace();
    const original = dec(file(WORKSPACE_PARAMS));
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    const row = await entryRowOf(doc, 'u8Scalar');
    (doc.table as any).delete([row.ID]);
    await settle();
    const save = doc.serialize();
    doc.saved(save.at);
    const span = entrySpan(original, 'u8Scalar');
    const comma = original.lastIndexOf(',', span.start);
    assert.strictEqual(original.slice(comma + 1, span.start).trim(), '', 'the comma is the one before the entry');
    assert.strictEqual(dec(save.bytes), original.slice(0, comma) + original.slice(span.end));
    assert.strictEqual(doc.dirty, false);
    const again = await workspace().open(save.bytes, 'params.sldd');
    const names = (await again.table.open()).rows.filter(isEntryRow).map(nameOf);
    assert.ok(names.length > 0 && !names.includes('u8Scalar'), 'read back from the file, the entry is gone');
  });

  it("a workspace's JSON and compressed dictionaries share its clipboard: an entry cut from one pastes into the other, and leaves its source", async () => {
    const ws = workspace();
    const json = await ws.open(file(WORKSPACE_DATA), 'data.sldd');
    const binary = await ws.open(file(PARAMS), 'params.sldd');
    await binary.table.open();
    const pi = await entryRowOf(json, 'PI');
    const binaryHeard = heard(binary);
    (json.table as any).cut([pi.ID]);
    assert.ok(binaryHeard.some((c) => c.kind === 'clipboard' && c.state.canPaste), 'every table is told what the clipboard holds');
    (binary.table as any).paste('section:design');
    await settle();
    assert.strictEqual(binary.dirty, true);
    assert.strictEqual(json.dirty, true, "the cut's source lost the entry, as an edit of its own");
    assert.ok(!entryNames(dec(json.serialize().bytes)).includes('PI'), 'the JSON dictionary no longer holds it');
    const saved = binary.serialize().bytes;
    assert.ok(readSldd(saved, (d) => !!dictEntryOf(d, 'PI')), 'the compressed dictionary holds it');
    assert.ok(binaryChunkOf(saved).includes('>PI<'));
  });

  it("a workspace's MAT-file and JSON dictionary share its clipboard: a variable cut from one pastes into the other, and leaves its source", async () => {
    const ws = workspace();
    const mat = await ws.open(fixture('pv_basic.mat'), 'gains.mat');
    const json = await ws.open(file(WORKSPACE_DATA), 'data.sldd');
    await mat.table.open();
    await json.table.open();
    const jsonHeard = heard(json);
    (mat.table as any).cut([`binedit:${mat.uri}/x`]);
    assert.ok(jsonHeard.some((c) => c.kind === 'clipboard' && c.state.canPaste), 'every table is told what the clipboard holds');
    (json.table as any).paste('section:design');
    await settle();
    assert.strictEqual(json.dirty, true);
    assert.strictEqual(mat.dirty, true, "the cut's source lost the variable, as an edit of its own");
    assert.ok(entryNames(dec(json.serialize().bytes)).includes('x'), 'the dictionary holds it');
  });

  it('wired to a table with connectTable({editing}): the gestures edit it, and its rules follow its rows', async () => {
    const ws = workspace();
    const doc = await ws.open(file(WORKSPACE_PARAMS), 'params.sldd');
    const gravity = await entryRowOf(doc, 'gravity');
    const table = document.createElement('dex-tree-table') as any;
    document.body.append(table);
    const seen: string[] = [];
    doc.table.subscribe((c) => void seen.push(c.kind));
    const handle = connectTable(table, doc.table, { editing: true });
    await settle();
    await table.updateComplete;
    assert.deepStrictEqual(seen.slice(0, 2), ['sectionRules', 'clipboard'], 'what follows a paint, after it');
    assert.strictEqual(table.canAdd, true);
    table.dispatchEvent(new CustomEvent('dex-edit-completed', { detail: { rowId: gravity.ID, columnId: 'Value', oldValue: '9.81', newValue: '9.8' } }));
    await settle();
    assert.strictEqual(doc.dirty, true);
    assert.strictEqual(table.rows.find((r: any) => r.ID === gravity.ID).Value, '9.8');
    handle.dispose();
  });
});
