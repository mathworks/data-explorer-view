// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/cutPasteUndo.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/heldPaste.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/typeLink.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/sharedNameEntries.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/jsonInspectorRefresh.test.ts at c73da3c.
//
// The JSON table editor's gestures — a cut and paste and its one undo, a held-down paste, a Data
// Type link, two entries of one name, the Property Inspector following the entry it shows — run
// against view's JSON dictionary engine over the page's TextStore. Where the extension's suites
// could only simulate the editor's write-back (a WorkspaceEdit of the move's text, an undo's bytes
// written back by hand, because the test host could not drive the webview or its undo), the case
// makes the gesture through the table's own messages and undoes it with the text's own undo. The
// inspector is wired to the engine as activate() wires the provider (its `changed` hook, the
// provider's `onChanged`, answered with the selection's re-resolve). Left with vscode: the undo
// canary of a host whose `undo` reaches no editor, the plain-text editor's own undo stack, and
// handleNavigate's opening of the link's file, of which only the target's read-back is the engine's.
import * as assert from 'node:assert';
import { createSession, getSectionMetadata } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, InspectorSelection, srcIdToUriString } from '../../src/model/index.js';
import { InspectorPage } from '../../src/host/index.js';
import { JsonEngine } from '../../src/model/edit/jsonEngine.js';
import { createTextStore } from '../../src/model/edit/textStore.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { chunkOf, diskOf, entryNames, file, open, settle, viewOf, waitFor, WORKSPACE_DATA, WORKSPACE_PARAMS } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
const nameOf = (row: any): string => row?.Name?.label ?? String(row?.ID ?? '');
const rowNamed = (rows: any[], name: string): any => {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
};
const lastRows = (posts: any[]): any[] => posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];
const errorsIn = (posts: any[]): string[] => posts.filter((m) => m.type === 'error').map((m) => String(m.message));
const quiet = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

describe('Data Explorer .sldd lazy-cut move — one edit, one undo', () => {
  it('a same-document move applies as ONE edit and a single undo restores the original', async () => {
    const o = await open(WORKSPACE_PARAMS, undefined, { as: 'move.sldd' });
    const originalText = o.text.text;
    assert.strictEqual(o.text.dirty, false, 'the document starts clean');
    // A plain MATLAB variable, which Other Data takes, so a cut of it from Design Data is a real move.
    const source = rowNamed(lastRows(o.view.posts), 'scalarD');
    o.view.send({ type: 'cut', rowIds: [source.ID] });
    const writes: number[] = [];
    const watching = o.text.onChange((change) => {
      if (change.changes.length > 0) writes.push(change.changes.length);
    });
    try {
      o.view.send({ type: 'paste', rowId: 'section:other' });
      await waitFor('the move to land', () => o.text.text !== originalText);
      await settle();
    } finally {
      watching();
    }
    assert.deepStrictEqual(writes, [1], 'the move is one edit of the text');
    assert.ok(o.text.dirty, 'the document is dirty after the move');
    JSON.parse(o.text.text);
    const moved = (chunkOf(o.text.text).entries as any[]).filter((e) => e.name === 'scalarD');
    assert.strictEqual(moved.length, 1);
    assert.strictEqual(moved[0].metadata?.namespace, getSectionMetadata('other').namespace, 'and it is in Other Data');
    // A SINGLE undo restores the ORIGINAL byte for byte: had the move been two edits, one undo
    // would leave a partial, dirty state.
    await o.undo();
    assert.strictEqual(o.text.text, originalText, 'one undo restored the original text exactly');
    assert.strictEqual(o.text.dirty, false, 'and the document is clean again (a full single-step undo)');
  });

  it('cross-document source delete applies as its own edit (separate undo step)', async () => {
    const registers = createRegisters();
    const source = await open(WORKSPACE_DATA, undefined, { as: 'source.sldd', registers });
    const target = await open(WORKSPACE_DATA, undefined, { as: 'target.sldd', registers });
    const sourceText = source.text.text;
    const targetText = target.text.text;
    const before = entryNames(sourceText).length;
    source.view.send({ type: 'cut', rowIds: [rowNamed(lastRows(source.view.posts), 'Number').ID] });
    target.view.send({ type: 'paste', rowId: 'section:other' });
    await waitFor('the source delete to land', () => entryNames(source.text.text).length === before - 1);
    await settle();
    assert.ok(!entryNames(source.text.text).includes('Number'), 'exactly that entry was removed from the source document');
    assert.ok(source.text.dirty, 'the source document is dirty (its own revertible edit)');
    assert.notStrictEqual(target.text.text, targetText, 'and the target took the paste');
    // Its own undo step, on the source's own stack: the target keeps what it took.
    const pasted = target.text.text;
    await source.undo();
    assert.strictEqual(source.text.text, sourceText, "the source's one undo puts the entry back");
    assert.strictEqual(target.text.text, pasted, 'and leaves the target as it was');
  });
});

describe('Two pastes sent before the first has written, on a JSON .sldd', () => {
  const ENTRY = 'gravity';
  const VARIABLE = 'scalarD';
  const OTHER_NAMESPACE = getSectionMetadata('other').namespace;

  it('a copy pasted twice lands twice, under two names, in a file that still parses', async () => {
    const o = await open(WORKSPACE_PARAMS, undefined, { as: 'held_paste_copy.sldd' });
    const source = rowNamed(lastRows(o.view.posts), ENTRY);
    o.view.send({ type: 'copy', rowIds: [source.ID] });
    const before = entryNames(o.text.text);
    o.view.posts.length = 0;
    o.view.send({ type: 'paste', rowId: source.ID });
    o.view.send({ type: 'paste', rowId: source.ID });
    await waitFor('both pastes to land', () => {
      try {
        return entryNames(o.text.text).length >= before.length + 2 || errorsIn(o.view.posts).length > 0;
      } catch {
        return false;
      }
    });
    await settle();
    assert.deepStrictEqual(errorsIn(o.view.posts), [], 'neither paste failed');
    chunkOf(o.text.text);
    const added = entryNames(o.text.text).filter((n) => !before.includes(n));
    assert.deepStrictEqual(added.sort(), [`${ENTRY}1`, `${ENTRY}2`], 'two copies, each its own name');
  });

  it('a cut pasted twice moves once, and the second paste says the clipboard is empty', async () => {
    const o = await open(WORKSPACE_PARAMS, undefined, { as: 'held_paste_cut.sldd' });
    const source = rowNamed(lastRows(o.view.posts), VARIABLE);
    const before = entryNames(o.text.text);
    // Into Other Data, so the move is real rather than the same-section no-op.
    o.view.send({ type: 'cut', rowIds: [source.ID] });
    o.view.posts.length = 0;
    const version = o.text.version;
    o.view.send({ type: 'paste', rowId: 'section:other' });
    o.view.send({ type: 'paste', rowId: 'section:other' });
    await waitFor('the move and the second answer', () => o.text.version > version && errorsIn(o.view.posts).length > 0);
    await settle();
    assert.deepStrictEqual(errorsIn(o.view.posts), ['Nothing to paste — the clipboard is empty.']);
    assert.deepStrictEqual(entryNames(o.text.text).sort(), [...before].sort(), 'the same entries, none duplicated');
    const moved = (chunkOf(o.text.text).entries as any[]).filter((e) => e.name === VARIABLE);
    assert.strictEqual(moved.length, 1, `one ${VARIABLE}`);
    assert.strictEqual(moved[0].metadata?.namespace, OTHER_NAMESPACE, 'and it is in Other Data');
  });
});

describe('a Data Type link resolves back to the document it came from', () => {
  const FIXTURE = 'test-integration/fixtures/typelink/typelink.sldd';
  const URI = 'file:///work/typelink/typelink.sldd';
  type Cell = { prefix?: string; text: string; linkTarget?: string } | string;
  const dataTypeOf = (rows: any[], name: string): Cell => {
    const row = rows.find((r) => r.Name?.label === name);
    assert.ok(row, `the fixture holds an entry named ${name}`);
    return row.DataType as Cell;
  };

  it('the target names this document by its full uri', async () => {
    const o = await open(FIXTURE, undefined, { uri: URI });
    const cell = dataTypeOf(lastRows(o.view.posts), 'Kp');
    assert.ok(typeof cell === 'object' && cell !== null, 'Kp Data Type came through as a link cell');
    assert.strictEqual((cell as { text: string }).text, 'MyAlias');
    // The whole point: `MyAlias@file:///…/typelink.sldd`, not `MyAlias@typelink.sldd`.
    assert.strictEqual((cell as { linkTarget?: string }).linkTarget, `MyAlias@${URI}`);
  });

  it('the target reads back to the same file', async () => {
    const o = await open(FIXTURE, undefined, { uri: URI });
    const cell = dataTypeOf(lastRows(o.view.posts), 'Kp') as { linkTarget: string };
    const at = cell.linkTarget.indexOf('@');
    assert.strictEqual(srcIdToUriString(cell.linkTarget.slice(at + 1)), URI, 'the link round-tripped to its own document');
  });

  it('a built-in and a non-type name stay plain text', async () => {
    const o = await open(FIXTURE, undefined, { uri: URI });
    const rows = lastRows(o.view.posts);
    assert.strictEqual(dataTypeOf(rows, 'Gain'), 'double');
    assert.strictEqual(dataTypeOf(rows, 'Borrowed'), 'Kp');
  });
});

describe('two entries with one name in one section, in the text editor', () => {
  const TWIN = 'gravity';
  const SHARED = 'Some items in this file share a name, so they cannot be edited or deleted here.';
  const CORE_SAYS = "Two entries in Design Data are named 'gravity'. Neither can be edited or deleted until the file gives one of them another name.";

  /** params.sldd with a second `gravity` right after the first, under a uuid of its own. */
  function withTwin(original: string): string {
    const doc = JSON.parse(original);
    const entries: any[] = doc.__MW_TEXT_PARTS__['__MW_TEXT_PART__/data/chunk0'].__MW_TEXT_content.entries;
    const at = entries.findIndex((e) => e.name === TWIN);
    assert.ok(at >= 0, `the fixture holds ${TWIN}`);
    const twin = JSON.parse(JSON.stringify(entries[at]));
    twin.metadata.uuid = 'f1-50-second-gravity';
    entries.splice(at + 1, 0, twin);
    return JSON.stringify(doc, null, '\t');
  }
  const valuesOf = (text: string, name: string): string[] =>
    ((chunkOf(text).entries ?? []) as any[])
      .filter((e) => e.name === name)
      .map((e) => `${e.metadata?.uuid} ${JSON.stringify(e.value?._elements?.[0]?._properties?.Value ?? e.value)}`);

  let copies = 0;
  async function openTwins() {
    const bytes = new TextEncoder().encode(withTwin(new TextDecoder().decode(file(WORKSPACE_PARAMS))));
    const o = await open(WORKSPACE_PARAMS, bytes, { as: `shared_name_${++copies}.sldd` });
    assert.deepStrictEqual(errorsIn(o.view.posts), [], 'the file opens');
    return { o, paint: o.view.posts.find((p) => p.type === 'setRows') };
  }

  /** Send `msg`, and wait for the host to refuse it or to change the document. */
  async function answered(o: Awaited<ReturnType<typeof open>>, msg: any) {
    const before = o.text.text;
    o.view.posts.length = 0;
    o.view.send(msg);
    await waitFor(`an answer to ${msg.type}`, () => o.text.text !== before || errorsIn(o.view.posts).length > 0);
    await settle(8);
    return { before, errors: errorsIn(o.view.posts) };
  }

  it('the banner says the names are shared, and counts nothing as unread', async () => {
    const { paint } = await openTwins();
    const twins = (paint.rows as any[]).filter((r) => isEntryRow(r) && nameOf(r) === TWIN);
    assert.strictEqual(twins.length, 2, 'both entries are on screen');
    assert.ok(paint.warnings, 'the paint carries a banner');
    assert.strictEqual(paint.warnings.headline, SHARED);
    assert.deepStrictEqual(paint.warnings.details, [CORE_SAYS], "core's message is below it");
  });

  it('a cell edit on a twin is refused, and the file is untouched', async () => {
    const { o, paint } = await openTwins();
    const row = rowNamed(paint.rows, TWIN);
    const { before, errors } = await answered(o, { type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '9.81', newValue: '1' });
    assert.deepStrictEqual(valuesOf(o.text.text, TWIN), valuesOf(before, TWIN), 'neither gravity was edited');
    assert.strictEqual(o.text.text, before, 'the document is untouched');
    assert.strictEqual(errors.length, 1, `one refusal: ${errors.join(' | ')}`);
  });

  it('an entry with a name of its own still edits as before', async () => {
    const { o, paint } = await openTwins();
    const row = rowNamed(paint.rows, 'scalarD');
    const { errors } = await answered(o, { type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: '3.14', newValue: '42' });
    assert.deepStrictEqual(errors, [], 'the edit is applied');
    const scalarD = ((chunkOf(o.text.text).entries ?? []) as any[]).find((e) => e.name === 'scalarD');
    assert.strictEqual(scalarD?.value, 42, 'and lands in the text');
  });
});

describe('JSON .sldd: the Property Inspector follows the entry it shows', () => {
  /** The Value the page was last sent, or undefined before any `showProps`. */
  const shownValue = (sent: any[]): string | undefined =>
    (sent.filter((m) => m.type === 'showProps').pop()?.groups as any[] | undefined)?.flatMap((g) => g.properties).find((p: any) => p.name === 'Value')?.value;

  /** data.sldd in an engine wired to an inspector as activate() wires the provider, its first rows painted. */
  async function wired() {
    const sent: any[] = [];
    const page = new InspectorPage((message) => void sent.push(message));
    page.opened();
    page.loaded();
    const registry = new DocumentRegistry(createSession());
    const selection = new InspectorSelection({ showNode: (node, from) => page.show(node, from), clear: () => page.clear() }, (uri, id) =>
      registry.findNode(uri, id),
    );
    const bytes = file(WORKSPACE_DATA);
    const uri = 'file:///work/json_inspector_refresh_copy.sldd';
    const text = createTextStore(new TextDecoder().decode(bytes));
    const engine = new JsonEngine({
      registry,
      uri,
      text,
      registers: createRegisters(),
      disk: diskOf(bytes),
      changed: () => selection.refresh(uri),
    });
    const view = viewOf(engine);
    view.send({ type: 'ready' });
    await waitFor('the first rows', () => view.posts.some((m) => m.type === 'setRows'));
    await settle();
    const select = (name: string) => selection.show(uri, [rowNamed(lastRows(view.posts), name).ID]);
    return { sent, text, view, select };
  }

  it('a table edit of the shown entry, and its undo, each show its value as it now is', async () => {
    const { sent, text, view, select } = await wired();
    select('Number');
    assert.strictEqual(shownValue(sent), '1');
    const before = text.text;
    view.send({ type: 'edit', rowId: rowNamed(lastRows(view.posts), 'Number').ID, columnId: 'Value', oldValue: '1', newValue: '77' });
    await waitFor('the inspector to show the edit', () => shownValue(sent) === '77');
    await waitFor('the edit to reach the document', () => text.text !== before);
    view.send({ type: 'undo' });
    await waitFor('the inspector to show the undo', () => shownValue(sent) === '1');
    assert.strictEqual(text.text, before);
  });

  it('a change typed into the text view shows in the inspector', async () => {
    const { sent, text, select } = await wired();
    select('Number');
    const span = spanOf(text.text, 'Number');
    const record = JSON.parse(text.text.slice(span.offset, span.offset + span.length));
    record.value = 5;
    assert.ok(await text.apply([{ offset: span.offset, length: span.length, text: JSON.stringify(record, null, '\t') }]), 'the edit applied');
    await waitFor('the inspector to show it', () => shownValue(sent) === '5');
  });

  it('a keystroke in another entry repaints the table and sends the inspector nothing', async () => {
    const { sent, text, view, select } = await wired();
    select('Number');
    const pages = sent.length;
    const repaints = view.posts.length;
    const pi = spanOf(text.text, 'PI');
    const valueAt = text.text.indexOf('"value"', pi.offset);
    assert.ok(valueAt > pi.offset && valueAt < pi.offset + pi.length, 'the fixture spells PI’s value');
    assert.ok(await text.apply([{ offset: valueAt, length: 0, text: ' ' }]), 'the keystroke applied');
    await waitFor('the table to repaint the entry it was in', () => view.posts.slice(repaints).some((m) => m.type === 'updateEntryRows'));
    await quiet(50);
    assert.deepStrictEqual(sent.slice(pages), [], 'the inspector’s page was sent nothing');
  });
});
