// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/liveEdit.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonRenameRepaint.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/undoOfTableEdit.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/undoRepaintsFromModel.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonDirtyEventRepaint.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonRebuildDuringWrite.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonViewRereadAsRead.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonEditorNumbers.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/alignmentEdit.test.ts at c73da3c.
//
// The JSON table editor's edits and its following of the text, run against view's JSON dictionary
// engine over the page's TextStore, which stands in for the TextDocument: a text view's edit is the
// store's `apply`, VS Code's Undo and Redo the table's own messages (which the extension's suites
// could not send, so they wrote an undo's bytes back by hand; here the store's undo does it), a save
// and a reload the store's. A table that splices what it is sent, as the webview does, and asks for
// the whole payload when a splice misses, stands in for fakeTable. The Usage column's graph, cold or
// built, is a stand-in of the engine's `usage` hook. Left with vscode, as VS Code's and not the
// engine's: the windows, tabs and view types a file opens in, the plain-text editor's own UI
// (showTextDocument, editor.edit), the webview's html, extension activation, a binary .slx or .sldd
// routed to its own view, and the live gate's copy of a saved file.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, insertEntryRows, spliceEntryRows } from '../../src/model/index.js';
import { JsonEngine, type JsonUsageFill } from '../../src/model/edit/jsonEngine.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { serveTable } from '../../src/serve/index.js';
import { entryOf, readSldd } from '../binaryEngine/harness.js';
import { chunkOf, diskOf, entryNames, file, open, settle, waitFor, WORKSPACE_DATA, WORKSPACE_PARAMS, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The `{...}` span of the entries[] element whose "name" is `name`. */
function spanOf(text: string, name: string): { offset: number; length: number } {
  const idx = text.indexOf(`"name": ${JSON.stringify(name)}`);
  assert.ok(idx >= 0, `the document spells the entry "${name}"`);
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

const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
const nameOf = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');
const rowNamed = (rows: any[], name: string): any => {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
};
const entryRowNames = (rows: any[]): string[] => rows.filter(isEntryRow).map(nameOf);
const errorsIn = (posts: any[]): string[] => posts.filter((m) => m.type === 'error').map((m) => String(m.message));
const quiet = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A table of `engine` across a channel that holds the rows it is sent, as the webview does: a
 * setRows replaces them, an updateEntryRows or insertEntryRows is spliced over them, and a splice
 * that misses asks for the whole payload again (`ready`), counted (fakeTable's readyAsks).
 */
function tableOf(engine: JsonEngine) {
  const posts: any[] = [];
  let rows: any[] = [];
  let asks = 0;
  const hooks: ((msg: any) => void)[] = [];
  let hear: (m: unknown) => void = () => {};
  const source = engine.view();
  const apply = (msg: any): void => {
    if (msg.type === 'setRows') {
      rows = msg.rows;
      return;
    }
    if (msg.type !== 'updateEntryRows' && msg.type !== 'insertEntryRows') return;
    const next =
      msg.type === 'updateEntryRows'
        ? spliceEntryRows(rows, msg.entryRowId, msg.rows)
        : insertEntryRows(rows, msg.sectionRowId, msg.beforeRowId, msg.rows);
    if (next) {
      rows = next;
      return;
    }
    asks++;
    queueMicrotask(() => hear({ type: 'ready' }));
  };
  const stop = serveTable(source, {
    postMessage: (m) => {
      const msg = JSON.parse(JSON.stringify(m));
      posts.push(msg);
      apply(msg);
      for (const hook of hooks) hook(msg);
    },
    onMessage: (listener) => ((hear = listener), () => (hear = () => {})),
  });
  return {
    source,
    posts,
    send: (m: Record<string, unknown>) => hear(m),
    rows: () => rows,
    readyAsks: () => asks,
    onPost: (hook: (msg: any) => void) => void hooks.push(hook),
    close: () => {
      stop();
      source.dispose();
    },
  };
}

/** A Usage graph of the engine's: cold until a fill builds it (a turn or `ms` away), then built. */
function usageGraph(ms = 20) {
  let built = false;
  const usage: JsonUsageFill = {
    fill: async () => {
      await quiet(ms);
      built = true;
    },
    fillNow: () => built,
  };
  return { usage, invalidate: () => void (built = false), built: () => built };
}

/** A JSON dictionary in an engine of its own, its text the page's store; no table yet. */
function engineOf(rel: string, bytes: Uint8Array = file(rel), usage?: JsonUsageFill) {
  const registry = new DocumentRegistry(createSession());
  const text = createTextStore(new TextDecoder().decode(bytes));
  const uri = `file:///work/${rel.slice(rel.lastIndexOf('/') + 1)}`;
  const engine = new JsonEngine({ registry, uri, text, registers: createRegisters(), disk: diskOf(bytes), ...(usage ? { usage } : {}) });
  return { engine, text, registry, uri };
}

/** `engine`'s table, opened and painted. */
async function painted(engine: JsonEngine) {
  const table = tableOf(engine);
  table.send({ type: 'ready' });
  await waitFor('the first paint', () => table.posts.some((m) => m.type === 'setRows' || m.type === 'error'));
  await settle();
  return table;
}

/** A replacement of entry `name`'s element as another writer (a text view) makes one. */
async function replaceEntry(o: Pick<Opened, 'text'>, name: string, change: (record: any) => void, indent: string | number = 2): Promise<void> {
  const text = o.text.text;
  const span = spanOf(text, name);
  const record = JSON.parse(text.slice(span.offset, span.offset + span.length));
  change(record);
  assert.ok(await o.text.apply([{ offset: span.offset, length: span.length, text: JSON.stringify(record, null, indent) }]), 'the edit applied');
}

describe('Data Explorer .sldd live edit', () => {
  it('editing the text document while the table is open does not error', async () => {
    const o = await open(WORKSPACE_DATA);
    const from = o.view.posts.length;
    // A whitespace edit ahead of the JSON, so it stays valid JSON: the change listener re-parses.
    assert.strictEqual(await o.type(0, 0, ' '), true, 'the edit applied');
    await settle();
    assert.ok(o.text.dirty, 'the document is now dirty (unsaved edit present)');
    assert.deepStrictEqual(errorsIn(o.view.posts.slice(from)), [], 'and the table took it without an error');
  });

  it('a scoped entry-span replacement (simulating applyEdit) updates the doc without crashing', async () => {
    const o = await open(WORKSPACE_DATA);
    const oldText = o.text.text;
    const span = spanOf(oldText, 'Number');
    // The entry with value 42, at the file's 2-space indent, 10 spaces deep (indent.repeat(5)).
    const indent = '  ';
    const entryObj = { name: 'Number', metadata: JSON.parse(oldText.slice(span.offset, span.offset + span.length)).metadata, value: 42 };
    const lines = JSON.stringify(entryObj, null, indent).split('\n');
    const entryText = lines.map((l, i) => (i === 0 ? l : indent.repeat(5) + l)).join('\n');
    assert.strictEqual(await o.type(span.offset, span.length, entryText), true, 'the edit applied');
    await settle();
    const newText = o.text.text;
    assert.notStrictEqual(newText, oldText, 'the document text changed');
    JSON.parse(newText);
    const newSpan = spanOf(newText, 'Number');
    assert.ok(newText.slice(newSpan.offset, newSpan.offset + newSpan.length).includes('"value": 42'));
    // Scoped diff: everything before and after the entry span is byte-identical.
    assert.strictEqual(newText.slice(0, newSpan.offset), oldText.slice(0, span.offset));
    assert.strictEqual(newText.slice(newSpan.offset + newSpan.length), oldText.slice(span.offset + span.length));
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.strictEqual(o.view.posts.filter((m) => m.type === 'updateEntryRows').pop()?.rows[0]?.Value, '42', 'the table followed it');
  });

  it('table->text sync: an edit made in the table is the text a text view of the document shows', async () => {
    const o = await open(WORKSPACE_DATA);
    const oldText = o.text.text;
    const row = rowNamed(o.view.posts.find((m) => m.type === 'setRows').rows, 'Number');
    o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '1', newValue: '99' });
    await settle();
    const newText = o.text.text;
    assert.notStrictEqual(newText, oldText, 'the document text changed');
    assert.ok(newText.slice(spanOf(newText, 'Number').offset).includes('"value": 99'), 'the new value is visible in the text');
    JSON.parse(newText);
  });

  it('a text-view edit dirties the shared document (single source of truth)', async () => {
    const o = await open(WORKSPACE_DATA);
    assert.strictEqual(o.text.dirty, false, 'the shared document starts clean');
    o.view.posts.length = 0;
    assert.strictEqual(await o.type(0, 0, ' '), true, 'the text edit applied');
    // The change listener answers it by repainting: the whole table for a change outside every
    // entry, as this one is, or one entry's rows.
    await waitFor('the change listener to repaint the table for the text edit', () =>
      o.view.posts.some((m) => m.type === 'setRows' || m.type === 'updateEntryRows'),
    );
    await waitFor('the text edit to dirty the shared document', () => o.text.dirty);
    assert.ok(o.text.dirty, 'the shared document is dirty after a text-view edit');
  });

  it('an invalid JSON edit is handled gracefully (no crash)', async () => {
    const o = await open(WORKSPACE_DATA);
    o.view.posts.length = 0;
    assert.strictEqual(await o.type(0, 0, '}{ not json '), true);
    await settle();
    // The listener re-parses, catches, and says so in the banner instead of throwing.
    assert.match(errorsIn(o.view.posts)[0] ?? '', /^Failed to parse data\.sldd: /);
  });

  it('opening a JSON .sldd as the table succeeds and the document is initially clean', async () => {
    const o = await open(WORKSPACE_DATA);
    assert.strictEqual(o.view.posts.find((m) => m.type === 'setRows')?.editable, true, 'the table is editable');
    assert.strictEqual(o.text.dirty, false, 'a freshly opened table is not dirty');
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
  });
});

describe('A JSON .sldd table repaints a rename over the rows it painted', () => {
  it('a rename is confirmed in place: no full payload asked for, none sent', async () => {
    const { engine, text } = engineOf(WORKSPACE_DATA);
    const table = await painted(engine);
    const row = rowNamed(table.rows(), 'Number');
    table.posts.length = 0;
    table.send({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: 'Number', newValue: 'Number2' });
    await waitFor('the rename to reach the document', () => entryNames(text.text).includes('Number2'));
    await settle(8);
    assert.strictEqual(table.readyAsks(), 0, 'every repaint landed on a run the table holds');
    assert.ok(!table.posts.some((m) => m.type === 'setRows'), `the table was never rebuilt (posts ${JSON.stringify(table.posts.map((m) => m.type))})`);
    assert.ok(table.posts.filter((m) => m.type === 'updateEntryRows').length >= 2, 'painted, then confirmed');
    assert.deepStrictEqual(entryRowNames(table.rows()), entryNames(text.text), 'the table says what the file says');
  });

  it('a rename the document refuses is taken back over the run it painted', async () => {
    const { engine, text } = engineOf(WORKSPACE_DATA);
    const table = await painted(engine);
    const row = rowNamed(table.rows(), 'Number');
    // The text refuses an edit whose text moved after it was read: a change to another entry,
    // asked for ahead of the rename, lands first, and the rename was stated against the text before it.
    const before = text.text;
    const pi = before.indexOf('"name": "PI"');
    assert.ok(pi >= 0, 'the fixture spells the entry PI');
    const valueAt = before.indexOf('"value"', pi);
    assert.ok(valueAt > pi, 'and its value');
    table.posts.length = 0;
    const ahead = text.apply([{ offset: valueAt, length: 0, text: ' ' }]);
    table.send({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: 'Number', newValue: 'Number2' });
    assert.ok(await ahead, 'the change ahead of the rename applied');
    await waitFor('the refusal to be reported', () => table.posts.some((m) => m.type === 'error'));
    await settle(8);
    assert.ok(!entryNames(text.text).includes('Number2'), 'the rename never reached the file');
    assert.strictEqual(table.readyAsks(), 0, 'the repair landed on the run the paint left');
    assert.deepStrictEqual(entryRowNames(table.rows()), entryNames(text.text), 'the table says what the file says');
  });
});

describe('A JSON .sldd table paints the undo of its own edit', () => {
  it('one entry repainted, back to the value the file had, table never rebuilt', async () => {
    const o = await open(WORKSPACE_DATA);
    const opened = o.view.posts.filter((m) => m.type === 'setRows').pop();
    // The entry "Number" holds a scalar 1: one editable cell, and one element in the text.
    const row = opened.rows.find((r: any) => String(r.ID).endsWith('/Number'));
    assert.ok(row, 'the table has a row for the entry Number');
    assert.strictEqual(row.Value, '1', 'and it opens on the value the file spells');
    const before = o.text.text;
    const span = spanOf(before, 'Number');
    o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '1', newValue: '77' });
    await waitFor('the edit to reach the document', () => o.text.text !== before);
    const written = spanOf(o.text.text, 'Number');
    assert.strictEqual(written.offset, span.offset, 'only that entry’s own span changed');

    // Now the undo, the text's own.
    o.view.posts.length = 0;
    await o.undo();
    assert.strictEqual(o.text.text, before, 'the document is back to what it was');
    assert.ok(!o.view.posts.some((m) => m.type === 'setRows'), `the table was never rebuilt (saw ${JSON.stringify(o.view.posts.map((m) => m.type))})`);
    const repaints = o.view.posts.filter((m) => m.type === 'updateEntryRows');
    assert.ok(repaints.length >= 1, 'the entry was repainted');
    const undone = repaints[repaints.length - 1];
    assert.strictEqual(undone.entryRowId, row.ID, 'over the run the table holds it under');
    const back = undone.rows.find((r: any) => r.ID === row.ID);
    assert.ok(back, 'the repaint carries the entry’s own row');
    assert.strictEqual(back.Value, '1', 'showing the value the undo brought back');
    assert.notStrictEqual(back.Status, 'Modified', 'and unmodified again, as the file is');
  });
});

describe('A JSON .sldd table paints an undo from the model', () => {
  /** Entry "Array"'s last element set to `value`, as a foreign single-range edit. */
  const editArrayEntry = (o: Pick<Opened, 'text'>, value: number) =>
    replaceEntry(o, 'Array', (record) => {
      assert.ok(Array.isArray(record.value), 'the fixture entry holds the array this edit changes');
      record.value = [...record.value.slice(0, -1), value];
    });

  it('sends the rows without waiting for a cold usage graph', async () => {
    const graph = usageGraph();
    const o = await open(WORKSPACE_DATA, undefined, { usage: graph.usage });
    // The state after any workspace change: the graph is gone, and the next query rebuilds it.
    graph.invalidate();
    o.view.posts.length = 0;
    await editArrayEntry(o, 4242);
    const paints = () => o.view.posts.filter((m) => m.type === 'updateEntryRows').length;
    await waitFor('the rows at once, and again once the graph is built', () => paints() >= 2);
    await quiet(100);
    assert.strictEqual(paints(), 2, `the rows went out at once and again with Usage filled in (saw ${JSON.stringify(o.view.posts.map((m) => m.type))})`);
    assert.ok(!o.view.posts.some((m) => m.type === 'setRows'), 'and the table was never rebuilt');
  });

  it('sends them once when the graph is already built', async () => {
    const graph = usageGraph();
    const o = await open(WORKSPACE_DATA, undefined, { usage: graph.usage });
    await editArrayEntry(o, 101);
    await waitFor('the warm-up edit’s paint, and the usage graph it reads', () => o.view.posts.some((m) => m.type === 'updateEntryRows') && graph.built());
    await quiet(50);
    o.view.posts.length = 0;
    await editArrayEntry(o, 202);
    await waitFor('the edit’s paint', () => o.view.posts.some((m) => m.type === 'updateEntryRows'));
    await quiet(100);
    assert.deepStrictEqual(
      o.view.posts.filter((m) => m.type === 'updateEntryRows' || m.type === 'setRows').map((m) => m.type),
      ['updateEntryRows'],
      `one paint for one change (saw ${JSON.stringify(o.view.posts.map((m) => m.type))})`,
    );
  });
});

describe('A JSON .sldd table repaints only for changes that happened', () => {
  it('the dirty-state event carries no changes, and costs no repaint', async () => {
    const o = await open(WORKSPACE_DATA);
    o.view.posts.length = 0;
    // Watch the change stream directly, so a pass cannot come from the store not firing the empty change.
    let empties = 0;
    let withChanges = 0;
    const watching = o.text.onChange((change) => {
      if (change.changes.length === 0) empties++;
      else withChanges++;
    });
    try {
      await replaceEntry(o, 'Array', (record) => {
        assert.ok(Array.isArray(record.value), 'the fixture entry holds the array this edit changes');
        record.value = [...record.value.slice(0, -1), 4242];
      });
      await waitFor('both changes, and the repaint of the edited entry', () => withChanges >= 1 && empties >= 1 && o.view.posts.some((m) => m.type === 'updateEntryRows'));
      await settle(8);
    } finally {
      watching();
    }
    assert.strictEqual(withChanges, 1, 'the edit arrived as one content change');
    // The case's premise, not its claim: the one dirty-state change (clean to dirty) did arrive, so
    // the claim below is of a table that heard it.
    assert.strictEqual(empties, 1, `the empty dirty-state change arrived, once (saw ${empties})`);
    const kinds = o.view.posts.map((m) => m.type);
    assert.deepStrictEqual(
      kinds.filter((k) => k === 'updateEntryRows' || k === 'setRows'),
      ['updateEntryRows'],
      `one entry repainted, and the table never rebuilt (saw ${JSON.stringify(kinds)})`,
    );
  });
});

describe('A JSON .sldd table keeps a structural edit a wide repaint overtook', () => {
  it('a delete whose write a reloading webview overtook stays deleted, on screen and in the tree', async () => {
    const { engine, text, registry, uri } = engineOf(WORKSPACE_DATA);
    const table = await painted(engine);
    const row = rowNamed(table.rows(), 'Number');
    // The webview reloads the moment the delete has painted — after the host has handed the text
    // the write, before it lands — and asks for its rows.
    let reloaded = false;
    table.onPost((msg) => {
      if (reloaded || msg.type !== 'updateEntryRows' || msg.rows.length !== 0) return;
      reloaded = true;
      queueMicrotask(() => table.send({ type: 'ready' }));
    });
    table.send({ type: 'delete', rowIds: [row.ID] });
    await waitFor('the delete to reach the document', () => !entryNames(text.text).includes('Number'));
    assert.ok(reloaded, 'the webview reloaded between the paint and the write');
    await waitFor('the rows to say what the file says', () => !entryRowNames(table.rows()).includes('Number'));
    await settle(8);
    assert.ok(!entryRowNames(table.rows()).includes('Number'), 'the deleted entry stays off the screen');
    assert.deepStrictEqual(entryRowNames(table.rows()), entryNames(text.text), 'the table lists exactly the entries the file does');
    assert.strictEqual(registry.findNode(uri, row.ID), null, 'and the tree the next edit builds on has let it go');
  });

  it('a delete made while a wide repaint is still on its way is not painted over by it', async () => {
    const graph = usageGraph(50);
    const { engine, text, registry, uri } = engineOf(WORKSPACE_DATA, undefined, graph.usage);
    const table = await painted(engine);
    await quiet(80);
    const row = rowNamed(table.rows(), 'Number');
    const paints = table.posts.filter((m) => m.type === 'setRows').length;
    // A wide repaint that has to wait for a cold usage graph, and a delete in the same breath.
    graph.invalidate();
    table.send({ type: 'ready' });
    table.send({ type: 'delete', rowIds: [row.ID] });
    await waitFor('the delete to reach the document', () => !entryNames(text.text).includes('Number'));
    await waitFor('the wide repaint to land', () => table.posts.filter((m) => m.type === 'setRows').length > paints);
    await quiet(150);
    assert.deepStrictEqual(entryRowNames(table.rows()), entryNames(text.text), `the table lists exactly the entries the file does (posts ${JSON.stringify(table.posts.map((m) => m.type))})`);
    assert.strictEqual(registry.findNode(uri, row.ID), null, 'and the tree has let the entry go');
  });

  it('two tabs of one document both land their wide repaints, together and after a change', async () => {
    const { engine, text } = engineOf(WORKSPACE_DATA);
    const left = tableOf(engine);
    const right = tableOf(engine);
    const landed = (t: ReturnType<typeof tableOf>) => t.posts.filter((m) => m.type === 'setRows').length;
    left.send({ type: 'ready' });
    right.send({ type: 'ready' });
    await waitFor('both tabs to paint', () => landed(left) > 0 && landed(right) > 0);
    // A change outside every entry, which neither tab can repaint narrowly: both go wide at once.
    assert.ok(await text.apply([{ offset: 0, length: 0, text: ' ' }]), 'the edit applied');
    await waitFor('both tabs to repaint the change', () => landed(left) > 1 && landed(right) > 1);
    await settle(8);
    const steady = [landed(left), landed(right)];
    await settle(8);
    assert.deepStrictEqual([landed(left), landed(right)], steady, 'and then both stop');
    assert.deepStrictEqual(entryRowNames(left.rows()), entryNames(text.text), 'the left tab says what the file says');
    assert.deepStrictEqual(entryRowNames(right.rows()), entryNames(text.text), 'and so does the right');
  });

  it('a full repaint still in flight when the last tab closes leaves nothing behind it', async () => {
    const graph = usageGraph(50);
    const { engine, text, registry, uri } = engineOf(WORKSPACE_DATA, undefined, graph.usage);
    const table = await painted(engine);
    await quiet(80);
    graph.invalidate();
    table.send({ type: 'ready' });
    table.close();
    const posted = table.posts.length;
    assert.ok(registry.peekModel(uri) === null, 'the close released the tree');
    assert.ok(await text.apply([{ offset: 0, length: 0, text: ' ' }]), 'the text moved under the repaint');
    await quiet(150);
    assert.ok(registry.peekModel(uri) === null, 'no tree is registered for a document no tab shows');
    assert.deepStrictEqual(table.posts.slice(posted).map((m) => m.type), [], 'and nothing was posted to the closed table');
  });
});

describe('A JSON .sldd re-reads an edited entry from its text as the file read does', () => {
  const NAME = 'hugeExtent';
  // A 1x1 struct whose field f is a cell declaring an extent of 1e400 rows, beside a plain field.
  const VALUE =
    '{"_array_type": "Struct", "_dimensions": [1, 1], "_elements": [{"f": {"_array_type": "Cell", "_dimensions": [1e400, 0], "_elements": []}, "g": 1}], "_fields": ["f", "g"]}';

  /** data.sldd with the entry added as hand-typed text, its metadata the fixture's own in full. */
  function dictionaryText(): string {
    const json = JSON.parse(new TextDecoder().decode(file(WORKSPACE_DATA)));
    const entries = json.__MW_TEXT_PARTS__['__MW_TEXT_PART__/data/chunk0'].__MW_TEXT_content.entries;
    const metadata = { ...entries[0].metadata, uuid: '00000000-0000-4000-8000-00000000f122' };
    assert.deepStrictEqual(Object.keys(metadata), ['uuid', 'namespace', 'lastmod', 'modifiedby', 'isderived']);
    entries.push({ name: NAME, metadata, value: '@@VALUE@@' });
    return JSON.stringify(json, null, 2).replace('"@@VALUE@@"', VALUE);
  }

  const errorsOf = (posts: any[]): string[] => posts.filter((m) => m.type === 'error' || m.type === 'validationError').map((m) => JSON.stringify(m));
  const paintedKinds = (posts: any[]): string[] => posts.map((m) => m.type).filter((t) => /Rows$/.test(t));

  /** The repaint of `entryRowId` a step sent, after checking it sent nothing else of note. */
  function onlyEntryRepaint(posts: any[], entryRowId: string, step: string): any[] {
    assert.deepStrictEqual(errorsOf(posts), [], `${step}: no error was reported`);
    assert.ok(!posts.some((m) => m.type === 'setRows'), `${step}: the table was not rebuilt (saw ${JSON.stringify(paintedKinds(posts))})`);
    const repaints = posts.filter((m) => m.type === 'updateEntryRows');
    assert.ok(repaints.length >= 1, `${step}: the entry was repainted`);
    const last = repaints[repaints.length - 1];
    assert.strictEqual(last.entryRowId, entryRowId, `${step}: over the run the table holds it under`);
    return last.rows;
  }

  it('an entry holding 1e400: the text edit syncs unmodified, and a table edit after it writes', async () => {
    const o = await open(WORKSPACE_DATA, new TextEncoder().encode(dictionaryText()), { as: 'json_reread_as_read_copy.sldd' });
    const opened = o.view.posts.filter((m) => m.type === 'setRows').pop().rows as any[];
    const entryRow = opened.find((r: any) => String(r.ID).endsWith(`/${NAME}`));
    assert.ok(entryRow, `the table has a row for ${NAME}`);
    assert.notStrictEqual(entryRow.Status, 'Modified', 'it opens unmodified, as the file read accepts it');

    // 1. An edit in the text view, inside the entry's element: a space before the 1e400.
    o.view.posts.length = 0;
    const before = o.text.text;
    const at = before.indexOf('1e400');
    assert.ok(at >= 0 && before.indexOf('1e400', at + 1) < 0, 'the document spells 1e400 once');
    assert.ok(await o.type(at, 0, ' '), 'the text edit applied');
    await waitFor('the text edit to repaint', () => o.view.posts.some((m) => m.type === 'updateEntryRows' || m.type === 'setRows'));
    await settle();
    const synced = onlyEntryRepaint(o.view.posts, entryRow.ID, 'the text edit');
    const syncedEntry = synced.find((r: any) => r.ID === entryRow.ID);
    assert.ok(syncedEntry, 'the repaint carries the entry’s own row');
    assert.notStrictEqual(syncedEntry.Status, 'Modified', 'the re-read entry is what the file read made of the same text');
    const gRow = synced.find((r: any) => r.parent === entryRow.ID && r.Name?.label === 'g');
    assert.ok(gRow, 'the repaint carries the field g');
    assert.strictEqual(gRow.Value, '1');

    // 2. A table edit of the same entry, after the re-read: the field beside the extent.
    o.view.posts.length = 0;
    const version = o.text.version;
    o.view.send({ type: 'edit', rowId: gRow.ID, columnId: 'Value', oldValue: '1', newValue: '2' });
    await waitFor('the table edit to reach the document, or be refused', () => o.text.version > version || errorsOf(o.view.posts).length > 0);
    // The edit paints its entry before it writes, and again from the write's own change.
    await waitFor('the write’s own change to repaint the entry', () => errorsOf(o.view.posts).length > 0 || o.view.posts.filter((m) => m.type === 'updateEntryRows' || m.type === 'setRows').length >= 2);
    assert.deepStrictEqual(errorsOf(o.view.posts), [], 'the table edit was not refused');
    assert.ok(o.text.version > version, 'the table edit reached the document');
    const written = chunkOf(o.text.text).entries.find((e: any) => e.name === NAME);
    assert.strictEqual(written?.value?._elements?.[0]?.g, 2, 'the document holds the edited field');
    assert.deepStrictEqual(written.value._elements[0].f._dimensions, [null, 0], 'and the extent written back as the file read writes it');
    const span = spanOf(o.text.text, NAME);
    assert.strictEqual(span.offset, spanOf(before, NAME).offset, 'only that entry’s own span changed');

    // 3. The undo of that table edit: the text's own. The host recognises its own edit coming back and
    // re-reads the element, which is the document's text again: not Modified.
    const typedText = before.slice(0, at) + ' ' + before.slice(at);
    o.view.posts.length = 0;
    await o.undo();
    assert.strictEqual(o.text.text, typedText, 'the document is back to the typed text');
    const undone = onlyEntryRepaint(o.view.posts, entryRow.ID, 'the undo');
    const undoneEntry = undone.find((r: any) => r.ID === entryRow.ID);
    assert.ok(undoneEntry, 'the repaint carries the entry’s own row');
    assert.notStrictEqual(undoneEntry.Status, 'Modified', 'back to what the file read made of it');
    assert.strictEqual(undone.find((r: any) => r.ID === gRow.ID)?.Value, '1', 'with the field back');
  });
});

describe('The JSON dictionary editor writes numbers as MATLAB writes them', () => {
  // What is typed where (`at`: the row's place under the entry; [] the entry itself), how the
  // document must spell it, and how JSON.stringify spelled it.
  const EDITS = [
    { entry: 'gravity', at: [], typed: '18446744073709551615', written: /"Value": 18446744073709552000\.0\b/, not: /18446744073709552000(?!\.0)/ },
    { entry: 'myStruct', at: [0], typed: '-9223372036854775808', written: /"a": -9223372036854776000\.0\b/, not: /-9223372036854776000(?!\.0)/ },
    { entry: 'myStruct', at: [1, 0], typed: '1e300', written: /\b1e300\b/, not: /1e\+300/ },
  ];

  it('a huge double typed at an entry and at an element is written with a fraction of zero, and saved so', async () => {
    const o = await open(WORKSPACE_PARAMS, undefined, { as: 'numbers.sldd' });
    const rows = (o.view.posts.filter((m) => m.type === 'setRows').pop()?.rows ?? []) as any[];
    for (const e of EDITS) {
      let row = rowNamed(rows, e.entry);
      for (const step of e.at) row = rows.filter((r) => r.parent === row.ID)[step];
      assert.ok(row, `the table has a row ${e.at.join('/')} under ${e.entry}`);
      const version = o.text.version;
      const cell = row.Value;
      o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: typeof cell === 'object' ? cell.text : String(cell), newValue: e.typed });
      await waitFor(`the edit of ${e.entry} to reach the document`, () => o.text.version !== version);
      assert.ok(!o.view.posts.some((m) => m.type === 'validationError' || m.type === 'error'), `${e.typed} was taken`);
      assert.match(o.text.text, e.written, `the document spells ${e.typed} as MATLAB does`);
      assert.doesNotMatch(o.text.text, e.not, 'and not as JSON.stringify did');
    }
    const saved = o.save();
    // A fresh read of the saved file holds the doubles typed.
    const read = readSldd(saved, (dict) => {
      const struct = entryOf(dict, 'myStruct');
      return [entryOf(dict, 'gravity').serialize().value, struct.children[0], struct.children[1].children[0]].map((n: any, i) =>
        i === 0 ? n._elements[0]._properties.Value : Number(n.toRow().Value),
      );
    });
    assert.deepStrictEqual(read, [18446744073709551615, -9223372036854775808, 1e300]);
  });
});

describe('a Parameter or Signal Alignment is edited in its table cell, as MATLAB edits it', () => {
  const AUTO = "Cannot set Alignment when StorageClass is 'Auto'.";
  const invalid = (n: number) => `${n} is not a valid alignment boundary. The alignment boundary must be either -1 or a power of two.`;
  const FIXTURE = 'test-integration/fixtures/classes/classes_r2027a_text.sldd';

  /** An entry's `value`, as the text spells it. */
  function valueOf(text: string, name: string): any {
    const entry = ((chunkOf(text).entries ?? []) as any[]).find((e) => e.name === name);
    assert.ok(entry, `the text holds the entry "${name}"`);
    return entry.value;
  }
  const coderInfoOf = (text: string, name: string): any => valueOf(text, name)._elements[0]._properties.CoderInfo;
  const othersOf = (text: string, names: string[]): any[] => ((chunkOf(text).entries ?? []) as any[]).filter((e) => !names.includes(e.name));

  let copies = 0;
  /** A fresh copy of the fixture in the engine, painted the way the webview asks for it. */
  async function openFixture() {
    const o = await open(FIXTURE, undefined, { as: `alignment_${++copies}.sldd` });
    const failed = o.view.posts.find((p) => p.type === 'error');
    assert.ok(!failed, `the tab posted an error: ${failed?.message}`);
    return { o, rows: o.view.posts.find((p) => p.type === 'setRows').rows as any[] };
  }

  /**
   * One cell edit, exactly as the table sends it, and what came of it: the text after it, and the
   * refusal if there was one. Waits for the edit to land or be refused, and for the repaint of its entry.
   */
  async function edit(opened: { o: Opened; rows: any[] }, entry: string, columnId: string, oldValue: string, newValue: string) {
    const { o } = opened;
    const before = o.text.text;
    const from = o.view.posts.length;
    const rowId = rowNamed(opened.rows, entry).ID;
    o.view.send({ type: 'edit', rowId, columnId, oldValue, newValue });
    const since = () => o.view.posts.slice(from);
    const errored = () => since().some((p) => p.type === 'error');
    await waitFor('the edit to reach the document or be refused', () => o.text.text !== before || since().some((p) => p.type === 'validationError') || errored());
    await waitFor('the repaint of the edited entry', () => errored() || since().some((p) => p.type === 'updateEntryRows' && p.entryRowId === rowId));
    await settle();
    const failed = since().find((p) => p.type === 'error');
    assert.ok(!failed, `the edit posted an error: ${failed?.message}`);
    const repaints = since().filter((p) => p.type === 'updateEntryRows' && p.entryRowId === rowId);
    const repaint = repaints.length ? repaints[repaints.length - 1].rows.find((r: any) => r.ID === rowId) : undefined;
    return { before, after: o.text.text, refusal: since().find((p) => p.type === 'validationError'), repaint };
  }

  it('the cell is a text editor under any StorageClass but Auto, and plain text under Auto', async () => {
    const { rows } = await openFixture();
    for (const [name, text] of [
      ['pSC', '-1'],
      ['pAl8', '8'],
      ['pAlM1', '-1'],
      ['sAl16', '16'],
    ]) {
      const cell = rowNamed(rows, name).alignment;
      assert.strictEqual(typeof cell, 'object', `${name}'s Alignment is an editable cell (${JSON.stringify(cell)})`);
      assert.strictEqual(cell.editable, true, `${name}'s Alignment cell is editable`);
      assert.strictEqual(cell.editor, 'text', `${name}'s Alignment is typed into, not chosen from a list`);
      assert.strictEqual(cell.options, undefined, `${name}'s Alignment offers no list`);
      assert.strictEqual(cell.text, text, `${name}'s Alignment shows the value MATLAB saved`);
    }
    assert.strictEqual(rowNamed(rows, 'pNo').alignment, '-1', 'a Parameter under Auto shows -1, read-only');
    assert.strictEqual(rowNamed(rows, 'sigA').alignment, '-1', 'a Signal under Auto shows -1, read-only');
  });

  it('8 on pSC saves the CoderInfo MATLAB saved for pAl8, and changes nothing else', async () => {
    const opened = await openFixture();
    const { before, after, refusal, repaint } = await edit(opened, 'pSC', 'alignment', '-1', '8');
    assert.strictEqual(refusal, undefined, `the edit was accepted (refused: ${refusal?.reason})`);
    assert.notStrictEqual(after, before, 'the edit reached the document');
    const info = coderInfoOf(after, 'pSC');
    assert.deepStrictEqual(info._properties.Alignment, { _type: 'int32', _value: '8' }, 'a typed int32, never a string');
    assert.strictEqual(Object.keys(info._properties)[0], 'Alignment', 'first in CoderInfo, where MATLAB puts it');
    assert.deepStrictEqual(info, coderInfoOf(before, 'pAl8'), "pAl8's CoderInfo, as MATLAB saved it");
    const expected = valueOf(before, 'pSC');
    expected._elements[0]._properties.CoderInfo = coderInfoOf(before, 'pAl8');
    assert.deepStrictEqual(valueOf(after, 'pSC'), expected, 'nothing else in pSC changed');
    assert.deepStrictEqual(othersOf(after, ['pSC']), othersOf(before, ['pSC']), 'no other entry changed');
    assert.ok(repaint, 'the entry was repainted');
    assert.strictEqual(repaint.alignment?.text, '8', 'and its cell shows the new Alignment');
    assert.strictEqual(repaint.alignment?.editable, true, 'still editable');
  });

  it('-1 takes the key back out, which is how MATLAB saves the default', async () => {
    const opened = await openFixture();
    const original = opened.o.text.text;
    const set = await edit(opened, 'pSC', 'alignment', '-1', '8');
    assert.strictEqual(set.refusal, undefined, `8 was accepted (refused: ${set.refusal?.reason})`);
    assert.deepStrictEqual(coderInfoOf(set.after, 'pSC')._properties.Alignment, { _type: 'int32', _value: '8' }, '8 reached the document');
    const back = await edit(opened, 'pSC', 'alignment', '8', '-1');
    assert.strictEqual(back.refusal, undefined, `-1 was accepted (refused: ${back.refusal?.reason})`);
    assert.ok(!('Alignment' in coderInfoOf(back.after, 'pSC')._properties), 'no Alignment key at -1');
    assert.deepStrictEqual(valueOf(back.after, 'pSC'), valueOf(original, 'pSC'), 'pSC is back to what MATLAB wrote');
    assert.deepStrictEqual(othersOf(back.after, ['pSC']), othersOf(original, ['pSC']), 'no other entry changed');
    assert.strictEqual(back.repaint?.alignment?.text, '-1', 'and its cell shows -1');
    // The same on an entry MATLAB itself saved at 8: pAl8 set to -1 saves pAlM1's CoderInfo.
    const pAl8 = await edit(opened, 'pAl8', 'alignment', '8', '-1');
    assert.strictEqual(pAl8.refusal, undefined, `-1 on pAl8 was accepted (refused: ${pAl8.refusal?.reason})`);
    assert.deepStrictEqual(coderInfoOf(pAl8.after, 'pAl8'), coderInfoOf(original, 'pAlM1'), "pAlM1's CoderInfo");
  });

  it('a value MATLAB refuses is refused in its words, and the document is unchanged', async () => {
    const opened = await openFixture();
    const { before, after, refusal, repaint } = await edit(opened, 'pSC', 'alignment', '-1', '3');
    assert.ok(refusal, 'the edit was refused');
    assert.strictEqual(refusal.reason, `Cannot edit "pSC": ${invalid(3)}`, "MATLAB's reason, without its inaccurate 128 bound");
    assert.strictEqual(refusal.invalidValue, '3', 'naming what was typed');
    assert.strictEqual(after, before, 'the document is unchanged');
    assert.strictEqual(repaint?.alignment?.text, '-1', 'and the cell is repainted back to -1');
  });

  it('under StorageClass Auto an Alignment is refused, as MATLAB refuses it', async () => {
    const opened = await openFixture();
    const { before, after, refusal } = await edit(opened, 'pNo', 'alignment', '-1', '8');
    assert.ok(refusal, 'the edit was refused');
    assert.strictEqual(refusal.reason, `Cannot edit "pNo": ${AUTO}`, "MATLAB's reason");
    assert.strictEqual(after, before, 'the document is unchanged');
  });

  it('StorageClass set to Auto resets Alignment, saving the CoderInfo MATLAB saved for pNo', async () => {
    const opened = await openFixture();
    const { before, after, refusal, repaint } = await edit(opened, 'pAl8', 'storageClass', 'ExportedGlobal', 'Auto');
    assert.strictEqual(refusal, undefined, `the edit was accepted (refused: ${refusal?.reason})`);
    assert.notStrictEqual(after, before, 'the edit reached the document');
    assert.deepStrictEqual(coderInfoOf(after, 'pAl8'), coderInfoOf(before, 'pNo'), "pNo's CoderInfo: Auto, and no Alignment");
    assert.strictEqual(repaint?.alignment, '-1', 'and the cell is -1 and read-only again');
  });
});
