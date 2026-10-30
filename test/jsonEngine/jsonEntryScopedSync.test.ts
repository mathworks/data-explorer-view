// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/jsonEntryScopedSync.test.ts at cc8cb1b.
// Runs against view's JSON dictionary engine (src/model/edit/jsonEngine.ts, jsonView.ts: the
// provider lifted) through the messages its table sends (test/jsonEngine/harness.ts). Only the cases
// whose assertions core's ports did not carry are here, under their vscode titles: the rows ON
// SCREEN. Core's test/jsonEntryScopedSync.test.ts and jsonEntryScopedSyncOps.test.ts hold the scan,
// the plan and the model after the op, and compare core's rows with the Status column taken off;
// what they left to view is the webview's half (spliceEntryRows of the run the repaint names), the
// Status ("Modified") mark the narrow repaint computes from one entry against the one the wide
// repaint computes from every entry, and narrow === wide over view's own rows.
//
// The extension's suite could not run its provider (it imports `vscode`), so it rebuilt the two
// repaint paths from the modules they are made of. Here they are the engine's own:
//   - type(offset, length, text): another writer's change of the text (the store's `apply`); the
//     narrow repaint the engine posts (updateEntryRows) is the op, its entryRowId the row id on
//     screen, its rows narrowPaint(entry), and its entry the node they paint, in the tree the
//     engine holds now. A whole paint instead is the "no plan" null;
//   - hostWrote: the table's own cell edit, which writes the entry's span and remembers the pair;
//     known(undoOf(written)) and known(written.submitted) are the table's Undo and Redo of it;
//   - widePaint(): the engine's repaintAll, which re-parses the text and re-registers the tree.
// The refusals (no plan) and the scanner are core's alone, and stay there. So is WHICH planner
// answered an undo: the engine falls back from the remembered pair (planKnownChange) to the scan
// (planEntrySync), and both paint the same narrow repaint, so what is held here is that repaint.
import { findEntrySpan } from 'data-explorer-core';
import { describe, it, expect } from 'vitest';
import { spliceEntryRows } from '../../src/model/index.js';
import { entryOf } from '../binaryEngine/harness.js';
import { open as openEngine, settle, waitFor, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const FIXTURE = 'test/fixtures/numeric_json.sldd';

/** The offset of `needle`'s single occurrence in `source`, or a failure. */
function only(source: string, needle: string): number {
  const at = source.indexOf(needle);
  expect(at, `"${needle}" appears in the fixture`).toBeGreaterThanOrEqual(0);
  expect(source.indexOf(needle, at + 1), `"${needle}" appears only once`).toBe(-1);
  return at;
}

/** The narrow repaint the engine posted since `at`, as the op it stands for; null when it repainted wide. */
function opSince(o: Opened, at: number): { rowIdOnScreen: string; rows: any[]; entry: any } | null {
  const since = o.view.posts.slice(at);
  if (since.some((p) => p.type === 'setRows')) return null;
  const repaint = since.find((p) => p.type === 'updateEntryRows');
  if (!repaint) return null;
  const entry = ((o.model()?.children ?? []) as any[]).flatMap((s: any) => s.children).find((e: any) => e.id === repaint.rows[0]?.ID);
  expect(entry, 'the rows the repaint painted are an entry of the tree the engine holds').toBeTruthy();
  return { rowIdOnScreen: repaint.entryRowId, rows: repaint.rows, entry };
}

// One open document, with the engine's two repaint paths side by side.
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

  /** Type into the text view: the narrow repaint the engine posts, or null for "repaint wide". */
  const type = async (offset: number, length: number, replacement: string) => {
    const at = o.view.posts.length;
    expect(await o.type(offset, length, replacement), 'the text change landed').toBe(true);
    await settle();
    return opSince(o, at);
  };

  /** The table's own cell edit of one entry, written: the pair the engine remembers. */
  const hostWrote = async (entryName: string, columnId: string, newValue: string): Promise<void> => {
    const entry = entryNamed(entryName);
    expect(entry, `${entryName} is an entry of the tree`).toBeTruthy();
    const before = o.text.text;
    const at = o.view.posts.length;
    o.view.send({ type: 'edit', rowId: entry.id, columnId, oldValue: '', newValue });
    await waitFor(`the ${entryName} edit to be written`, () => o.text.text !== before);
    await settle();
    expect(
      o.view.posts.slice(at).filter((p) => p.type === 'error' || p.type === 'validationError'),
      `the ${entryName} edit applied`,
    ).toEqual([]);
  };

  /** The table's Undo (or Redo) of the engine's own edit: the narrow repaint, or null. */
  const history = async (step: 'undo' | 'redo') => {
    const at = o.view.posts.length;
    await (step === 'undo' ? o.undo() : o.redo());
    return opSince(o, at);
  };

  const entryNamed = (name: string) => entryOf(o.model(), name);

  return { o, doc, widePaint, type, hostWrote, undo: () => history('undo'), redo: () => history('redo'), entryNamed };
}

// ---------------------------------------------------------------------------------------
// The sync: one text change, one entry op, one repaint.
// ---------------------------------------------------------------------------------------
describe('JSON .sldd narrow text sync — narrow === wide', () => {
  it('repaints one entry for a value typed in the text view', async () => {
    const d = await open('json-sync-value.sldd');
    const before = await d.widePaint();
    const at = only(d.doc.text, '"value": 1\n');

    const op = await d.type(at + '"value": '.length, 1, '42');
    expect(op, 'a value typed inside one entry is one entry op').not.toBeNull();
    expect(op!.rowIdOnScreen).toBe(op!.entry.id);

    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow, 'the entry the op names is on screen').not.toBeNull();
    // The edited cell really changed, and the entry is now marked Modified — the two
    // things the user is watching for.
    const row = narrow!.find((r: any) => r.ID === op!.entry.id)!;
    expect(row.Value).toBe('42');
    expect(row.Status).toBe('Modified');
    // Compare LAST: widePaint re-parses and RE-REGISTERS, which replaces the tree the op
    // above was applied to.
    expect(narrow).toEqual(await d.widePaint());
  });

  it('repaints one entry for a nested field typed in the text view', async () => {
    // A change inside an entry's children is still a change to the ENTRY: the record is
    // the whole element, so nothing here has to know how a struct is built inside.
    const d = await open('json-sync-nested.sldd');
    const before = await d.widePaint();
    const struct = only(d.doc.text, '"name": "NestedStruct"');
    const at = d.doc.text.indexOf('"field2": 4', struct);
    expect(at).toBeGreaterThan(struct);

    const op = await d.type(at + '"field2": '.length, 1, '7');
    expect(op).not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow).not.toBeNull();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('addresses the PRE-rename row id when a name is typed over', async () => {
    const d = await open('json-sync-rename.sldd');
    const before = await d.widePaint();
    const at = only(d.doc.text, '"name": "Number"');

    const op = await d.type(at + '"name": "'.length, 'Number'.length, 'Numeral');
    expect(op, 'a rename resolves through the uuid the text still spells').not.toBeNull();
    // The rows on screen carry the OLD id; the rebuilt entry carries the new one.
    expect(op!.rowIdOnScreen).toContain('/Number');
    expect(op!.entry.id).toContain('/Numeral');

    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow, 'the run under the pre-rename id is the one to replace').not.toBeNull();
    expect(narrow!.some((r: any) => r.ID === op!.rowIdOnScreen)).toBe(false);
    expect(narrow!.some((r: any) => r.ID === op!.entry.id)).toBe(true);
    // INVARIANT 3 of the binary path, which holds here for the same reason: the ids the
    // repaint paints must still resolve, or the NEXT edit on that row cannot find it.
    expect(d.o.session.findNodeById(op!.entry.id)).toBe(op!.entry);
    expect(d.o.session.findNodeById(op!.rowIdOnScreen)).toBeNull();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('repaints the same rows for a whole-element replace — a table cell edit', async () => {
    // What SlddTextEditorProvider.applyEdit produces: a range replace of the entry's whole
    // `{...}` span with its reserialization. The change touches both braces, so it is only
    // narrow if the scan accepts an exact-span change.
    const d = await open('json-sync-element.sldd');
    const before = await d.widePaint();
    const span = findEntrySpan(d.doc.text, 'PI')!;
    const element = d.doc.text.slice(span.offset, span.offset + span.length);

    const op = await d.type(span.offset, span.length, element.replace('3.141592653589793', '3.14'));
    expect(op, 'replacing one element is one entry op').not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow).not.toBeNull();
    expect(narrow!.find((r: any) => r.ID === op!.entry.id)!.Value).toBe('3.14');
    expect(narrow).toEqual(await d.widePaint());
  });

  it('leaves every other entry’s rows untouched', async () => {
    // The point of the whole path: 317,000 rows do not move because one of them changed.
    const d = await open('json-sync-untouched.sldd');
    const before = await d.widePaint();
    const at = only(d.doc.text, '"value": 1\n');
    const op = (await d.type(at + '"value": '.length, 1, '9'))!;
    const narrow = spliceEntryRows(before, op.rowIdOnScreen, op.rows)!;

    const others = (rows: any[]) => rows.filter((r) => !r.ID.startsWith(op.entry.id));
    expect(others(narrow)).toEqual(others(before));
    expect(narrow.length).toBe(before.length);
  });
});

// ---------------------------------------------------------------------------------------
// An undo or a redo of an edit the host itself wrote: recognised from the pair it remembers
// (planKnownChange), so the changed element is the text in hand and nothing is looked for.
// ---------------------------------------------------------------------------------------
describe('JSON .sldd narrow text sync — undo and redo of the host’s own edit', () => {
  it('plans an undo from the bytes it wrote over — narrow === wide', async () => {
    const d = await open('json-known-undo.sldd');
    const before = await d.widePaint();
    await d.hostWrote('PI', 'Value', '3.14');

    const op = await d.undo();
    expect(op, 'an undo of a remembered edit is one entry op').not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow, 'the entry the op names is on screen').not.toBeNull();
    // Back to the value the file opened with, and back to unmodified with it.
    const row = narrow!.find((r: any) => r.ID === op!.entry.id)!;
    expect(row.Value).toBe('3.141592653589793');
    expect(row.Status).not.toBe('Modified');
    // Compare LAST: widePaint re-parses and re-registers the tree.
    expect(narrow).toEqual(await d.widePaint());
  });

  it('plans a redo — the same edit, forwards', async () => {
    const d = await open('json-known-redo.sldd');
    await d.widePaint();
    await d.hostWrote('PI', 'Value', '3.14');
    // Undone, then done again: what the second Ctrl-Y reports is the original submission.
    expect(await d.undo()).not.toBeNull();
    const before = await d.widePaint();

    const op = await d.redo();
    expect(op, 'a redo of a remembered edit is one entry op').not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow!.find((r: any) => r.ID === op!.entry.id)!.Value).toBe('3.14');
    expect(narrow).toEqual(await d.widePaint());
  });

  it('resolves an undone rename through the uuid, not the name', async () => {
    // The one case where the name in hand is NOT the name the model holds: the model was
    // renamed by the edit being undone. The uuid is what survives it (see resolve).
    const d = await open('json-known-rename.sldd');
    await d.widePaint();
    await d.hostWrote('Number', 'Name', 'Numeral');
    const before = await d.widePaint();

    const op = await d.undo();
    expect(op, 'the entry still answers to the uuid the undone text spells').not.toBeNull();
    expect(op!.rowIdOnScreen, 'the rows on screen carry the renamed id').toContain('/Numeral');
    expect(op!.entry.id, 'and the rebuilt entry carries the name that came back').toContain('/Number');
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow).not.toBeNull();
    expect(narrow).toEqual(await d.widePaint());
  });

  it('recognises an older edit in the ring — two edits, undone in reverse', async () => {
    // VS Code undoes as far back as the user asks, so one remembered edit is not enough: the
    // second undo is of the FIRST edit, whose offset is only meaningful once the second has
    // been taken back.
    const d = await open('json-known-ring.sldd');
    await d.hostWrote('Number', 'Value', '11');
    await d.hostWrote('PI', 'Value', '3.14');

    expect(await d.undo(), 'the newest edit comes back first').not.toBeNull();
    const before = await d.widePaint();
    const op = await d.undo();
    expect(op, 'and then the one before it').not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow!.find((r: any) => r.ID === op!.entry.id)!.Value).toBe('1');
    expect(narrow).toEqual(await d.widePaint());
  });
});

// ---------------------------------------------------------------------------------------
// An entry the file spells without a uuid: the name is the fallback.
// ---------------------------------------------------------------------------------------
describe('JSON .sldd narrow text sync — an entry with no uuid', () => {
  /** Replace one entry's whole element in the document text. `widePaint` rebuilds the tree. */
  const rewriteElement = async (d: Awaited<ReturnType<typeof open>>, name: string, element: string) => {
    const span = findEntrySpan(d.doc.text, name);
    expect(span, `${name} has a span in the text`).not.toBeNull();
    expect(await d.o.type(span!.offset, span!.length, element), `${name} was rewritten`).toBe(true);
    await settle();
  };

  it('resolves an entry that declares no metadata at all by its name', async () => {
    const d = await open('json-nouuid-name.sldd');
    // No uuid to resolve through, and no namespace or isderived either — so the section
    // check has to read "absent on both sides" as agreement rather than as a move to
    // another section, which is the only other thing it could conclude.
    await rewriteElement(d, 'Number', '{"name": "Number", "value": 1}');
    const before = await d.widePaint();
    expect(d.entryNamed('Number').metadata, 'the tree holds it with no metadata').toBeFalsy();

    const at = only(d.doc.text, '{"name": "Number", "value": 1}');
    const op = await d.type(at + '{"name": "Number", "value": '.length, 1, '11');
    expect(op, 'the name is the fallback when the text spells no uuid').not.toBeNull();
    const narrow = spliceEntryRows(before, op!.rowIdOnScreen, op!.rows);
    expect(narrow, 'the entry the op names is on screen').not.toBeNull();
    expect(narrow!.find((r: any) => r.ID === op!.entry.id)!.Value).toBe('11');
    // Compare LAST: widePaint re-parses and re-registers the tree.
    expect(narrow).toEqual(await d.widePaint());
  });
});
