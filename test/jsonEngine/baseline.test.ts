// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/jsonBaselineFollowsDisk.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/twoTabBaseline.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/closedTabRelease.test.ts at c73da3c
//
// What a JSON dictionary's Modified marks are measured against (the file on disk), and what its
// tables share and give back: run against view's JSON dictionary engine over the page's TextStore.
// VS Code's reload and revert are the store's `reset` after the file changed; an edit in the text
// view is its `apply`; a save the file written and `saved`; the file's whole-file reads are counted
// through the engine's own disk hook, which the extension could only count through a file system of
// its own. Two tables of one engine are the extension's two panels of one document. Left with
// vscode: closedTabRelease's two read-only cases (the binary editor's CustomDocument, a model's) and
// its read-only document closing beside a text table, which is BinaryEditorProvider's document
// sharing the text table's srcId: in view a workspace opens a uri once, and nothing but a JSON table
// counts a hold on its tree.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters } from '../../src/model/index.js';
import { JsonEngine } from '../../src/model/edit/jsonEngine.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { diskOf, file, isEntryRow, nameOf, open, settle, tableOf, viewOf, waitFor, WORKSPACE_DATA, type View } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const marked = (rows: any[]): string[] => rows.filter((r) => isEntryRow(r) && r.Status === 'Modified').map(nameOf);

/** The entry row named `name` in the table as it stands. */
function rowNamed(rows: any[], name: string): any {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
}

/** The `{...}` span of the entries[] element whose "name" is `name`. */
function spanOf(text: string, name: string): { offset: number; length: number } {
  const idx = text.indexOf(`"name": ${JSON.stringify(name)}`);
  assert.ok(idx >= 0, `the text spells the entry "${name}"`);
  const start = text.lastIndexOf('{', idx);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return { offset: start, length: i + 1 - start };
  }
  throw new Error(`no element span for "${name}"`);
}

/** `text` with the entry Number holding `value` — as another tool would write it. */
function withNumber(text: string, value: number): string {
  const span = spanOf(text, 'Number');
  const record = JSON.parse(text.slice(span.offset, span.offset + span.length));
  record.value = value;
  return text.slice(0, span.offset) + JSON.stringify(record, null, '\t') + text.slice(span.offset + span.length);
}

/** data.sldd in an engine whose one table has not asked for its rows yet: the webview still loading. */
function unopened() {
  const bytes = file(WORKSPACE_DATA);
  const store = createTextStore(dec(bytes));
  const disk = diskOf(bytes);
  const engine = new JsonEngine({
    registry: new DocumentRegistry(createSession()),
    uri: 'file:///work/data.sldd',
    name: 'data.sldd',
    text: store,
    registers: createRegisters(),
    disk,
  });
  return { engine, text: store, disk };
}

/** Ask `view` for its rows, as its webview's `ready` does, and wait for them. */
async function ready(view: View): Promise<void> {
  view.send({ type: 'ready' });
  await waitFor('the first paint', () => view.posts.some((m) => m.type === 'setRows'));
}

describe('A JSON .sldd table marks what differs from the file on disk', () => {
  it('a file changed on disk and reloaded is not marked Modified', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'json_baseline_reload_copy.sldd' });
    const next = withNumber(o.text.text, 7);
    o.disk.write(enc(next));
    await o.text.reset(next);
    assert.ok(!o.text.dirty, 'the reloaded document has nothing to save');
    await waitFor('the table to show the value the file now holds', () => rowNamed(tableOf(o.view.posts), 'Number').Value === '7');
    await settle(20);

    assert.deepStrictEqual(marked(tableOf(o.view.posts)), [], 'no entry differs from the file, so none is marked');
  });

  it('a revert to a file changed on disk clears the marks', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'json_baseline_revert_copy.sldd' });
    // An unsaved edit in the table, then another tool changes the same entry on disk.
    const row = rowNamed(tableOf(o.view.posts), 'Number');
    o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '1', newValue: '77' });
    await waitFor('the edit to make the document dirty', () => o.text.dirty);
    await waitFor('the edit to be marked', () => marked(tableOf(o.view.posts)).includes('Number'));
    const onDisk = withNumber(dec(o.disk.bytes), 9);
    o.disk.write(enc(onDisk));

    await o.text.reset(onDisk);
    await waitFor('the revert to bring the file back', () => !o.text.dirty && o.text.text === onDisk);
    await waitFor('the table to show the value the file holds', () => rowNamed(tableOf(o.view.posts), 'Number').Value === '9');
    await settle(20);

    assert.deepStrictEqual(marked(tableOf(o.view.posts)), [], 'the document is the file again, so nothing is marked');
  });

  it('a document already dirty when the table opens marks what differs from the file', async () => {
    const d = unopened();
    const edited = withNumber(d.text.text, 55);
    assert.ok(await d.text.apply([{ offset: 0, length: d.text.text.length, text: edited }]), 'the edit applied');
    await waitFor('the document to be dirty', () => d.text.dirty);

    const view = viewOf(d.engine);
    await ready(view);
    await waitFor('the entry the file does not hold to be marked', () => marked(tableOf(view.posts)).includes('Number'));
    await settle(20);

    assert.deepStrictEqual(marked(tableOf(view.posts)), ['Number'], 'that entry, and only it');
    view.close();
  });

  it('an edit to a clean document does not read the file to tell it from a reload', async () => {
    // A reload says itself only by leaving the text equal to the file, so a change to a clean
    // document is checked against the file; a file that has not changed since the document last
    // matched it cannot have been reloaded, which its stamp says without a read.
    const o = await open(WORKSPACE_DATA, undefined, { as: 'json_baseline_no_read.sldd' });
    await settle(20);
    let reads = 0;
    const read = o.disk.read;
    o.disk.read = () => (reads++, read());

    const next = withNumber(o.text.text, 8);
    assert.ok(await o.type(0, o.text.text.length, next), 'the edit applied');
    await waitFor('the document to be dirty', () => o.text.dirty);
    await waitFor('the table to show the edit', () => rowNamed(tableOf(o.view.posts), 'Number').Value === '8');
    await settle(20);

    assert.strictEqual(reads, 0, 'the file was not read');
    assert.deepStrictEqual(marked(tableOf(o.view.posts)), ['Number'], 'and the edit is marked as the change it is');
  });

  it('a webview that has not asked for its rows yet is sent none, whatever repaints', async () => {
    const d = unopened();
    const view = viewOf(d.engine);
    assert.ok(await d.text.apply([{ offset: 0, length: 0, text: ' ' }]), 'the edit applied');
    // And was saved.
    d.disk.write(enc(d.text.text));
    d.text.saved(d.text.version);
    await settle(20);
    assert.deepStrictEqual(
      view.posts.filter((m) => m.type === 'setRows' || m.type === 'updateEntryRows').map((m) => m.type),
      [],
      'nothing was painted before the webview asked',
    );

    await ready(view);
    assert.deepStrictEqual(marked(tableOf(view.posts)), [], 'saved, so nothing is marked');
    view.close();
  });
});

/** The rows of the latest whole paint `view` received. */
const lastRows = (view: View): any[] => view.posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];

/** The Status cell of the top-level entry row named `name`. */
const statusOf = (rows: any[], name: string): unknown => rowNamed(rows, name).Status;

/** A whole repaint of this view, and the rows it painted. */
async function repaint(view: View): Promise<any[]> {
  view.posts.length = 0;
  await ready(view);
  return lastRows(view);
}

describe('A JSON .sldd open in two tabs is one document', () => {
  /** Change entry `name`'s value in the text, leaving it dirty, and let `view` repaint it. */
  async function editEntry(o: Awaited<ReturnType<typeof open>>, name: string, view: View): Promise<void> {
    const span = spanOf(o.text.text, name);
    const record = JSON.parse(o.text.text.slice(span.offset, span.offset + span.length));
    assert.ok(Array.isArray(record.value), 'the fixture entry holds the array this edit changes');
    record.value = [...record.value.slice(0, -1), 4242];
    const from = view.posts.length;
    assert.ok(await o.type(span.offset, span.length, JSON.stringify(record, null, 2)), 'the edit applied');
    await waitFor(`the open tab to repaint ${name} after the edit`, () =>
      view.posts.slice(from).some((m) => m?.type === 'updateEntryRows' || m?.type === 'setRows'),
    );
  }

  it('the surviving tab keeps its Modified marks when the other tab closes', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'two_tab_baseline_copy.sldd' });
    const first = o.view;
    assert.notStrictEqual(statusOf(await repaint(first), 'Array'), 'Modified', 'nothing is Modified against the on-open baseline');

    await editEntry(o, 'Array', first);
    assert.strictEqual(statusOf(await repaint(first), 'Array'), 'Modified', 'the edited entry is Modified in the tab that edited it');

    // A second tab on the SAME document must not re-baseline to the edited text.
    const second = viewOf(o.engine);
    assert.strictEqual(statusOf(await repaint(second), 'Array'), 'Modified', 'the second tab shows the edit as Modified too — one document, one baseline');
    assert.strictEqual(statusOf(await repaint(first), 'Array'), 'Modified', 'and opening it did not clear the first tab’s marks');

    // Close the first tab. The document is still open and still edited.
    first.close();
    assert.strictEqual(statusOf(await repaint(second), 'Array'), 'Modified', 'the surviving tab still shows the edit as Modified');
    second.close();
  });

  it('a move out of the surviving tab can still delete from the source', async () => {
    const registers = createRegisters();
    const o = await open(WORKSPACE_DATA, undefined, { as: 'two_tab_deleter_copy.sldd', registers });
    const first = o.view;
    const second = viewOf(o.engine);
    await repaint(first);
    await repaint(second);

    // Closing one tab must not unregister the DOCUMENT's deleter: the deleter is what completes the
    // source half of a cross-document move dragged out of the other tab.
    first.close();
    assert.ok(o.text.text.includes('"name": "Array1"'), 'the entry to move is there to begin with');
    await registers.deleteFromSource(o.engine.uri, ['Array1']);
    await waitFor('the source-delete half of the move to reach the document', () => !o.text.text.includes('"name": "Array1"'));
    assert.ok(!o.text.text.includes('"name": "Array1"'), 'the surviving tab completed the source-delete half of the move');
    second.close();
  });
});

describe('a closed tab releases what it registered', () => {
  const painted = (posts: any[]): boolean => posts.some((p) => p?.type === 'setRows');

  it('a text table releases its source when its last view closes, and not before', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'two_views.sldd' });
    const first = o.view;
    assert.ok(painted(first.posts), 'the first tab’s rows');
    const second = viewOf(o.engine);
    second.send({ type: 'ready' });
    await waitFor('the second tab’s rows', () => painted(second.posts));
    assert.ok(o.session.hasDataSource(o.engine.uri), 'the open document registered its dictionary');

    first.close();
    assert.ok(o.session.hasDataSource(o.engine.uri), 'a split panel closing leaves the dictionary to the one still showing it');

    second.close();
    assert.ok(!o.session.hasDataSource(o.engine.uri), 'the last view closing released the dictionary');
  });
});
