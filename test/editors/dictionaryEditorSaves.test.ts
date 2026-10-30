// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/dictionaryEditorSaves.test.ts at c73da3c,
// with its helpers (tools/editorSaves.ts) over view's dictionary engines.
//
// What a dictionary engine saves after an edit is what core saves after the same edit, for edits at
// every depth: a field, an element of a struct array, a cell inside cells, a member of a Parameter's
// struct Value, a Bus element; values, a property, renames, an Add and a Delete.
//
// Neither engine saves through core's serializeSource, which is what an edit sweep of core judges
// against MATLAB. The JSON engine writes the edited entry's text itself into its text, and saves the
// text; the binary engine splices the entry into the chunk it read and zips it with its own save. So
// each is held here to core's save of the same model edit: the JSON file to its text (but for each
// entry's lastmod, the clock of the save), the binary file to what a fresh read of it shows, row for
// row.
//
// The two numbers past 2^63 are there for the JSON writer: a double JSON.stringify spells as an
// integer literal is a dictionary MATLAB cannot open, so a change to how core writes a text
// dictionary's numbers has to reach the engine's own writer too, or the two saves part here.
//
// The last edit types a cell over cLeaves{9}, a complex [1+2i 3-4i] the file holds as a MAT stream.
// The JSON engine repaints the table before it writes the entry, and the repaint asks every row
// whether it can take an Add or a Delete. Through core v1.52.0 that question, for an element of a
// cell edited under a stream, changed the value it was asked about. Two cases below hold the JSON
// engine to the value as typed, without core's save to compare with.
//
// The fixtures are the R2027a text and binary dictionaries of core's edit-bash parity set.
import * as assert from 'node:assert';
import { addChildToModel, createSession, findOwningEntry, ingest, removeChildFromModel } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { shownCells, waitFor } from '../matEngine/harness.js';
import { file, open as openJson, settle } from '../jsonEngine/harness.js';
import { open as openBinary } from '../binaryEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** An edit at the node whose matlabPath is `path`: `key` is the column a value/prop edit names. */
interface Edit {
  path: string;
  op: 'value' | 'prop' | 'name' | 'add' | 'delete';
  key?: string;
  text?: string;
}

interface Answer {
  answer: 'written' | 'refused' | 'error' | 'none' | 'absent' | 'saveRefused';
  reason?: string;
  bytes?: Uint8Array;
}

const isSection = (n: any) => n?.constructor?.name === 'SectionNode';

/** The row node at `path` (a matlabPath), or null. */
function nodeAt(root: any, path: string): any {
  return (root?.flatten?.() ?? []).find((n: any) => !n.isContainer && !isSection(n) && n.matlabPath === path) ?? null;
}

/** The text a row shows for `key`, which the table seeds its editor with and sends as oldValue. */
function shownText(row: any, key: string): string {
  if (key === 'Name') return String(row?.Name?.label ?? '');
  const cell = row?.[key];
  if (cell && typeof cell === 'object') return String(cell.text ?? '');
  return String(cell ?? '');
}

const columnOf = (edit: Edit): string => (edit.op === 'name' ? 'Name' : (edit.key ?? 'Value'));

/** The message the table sends for `edit` on `node`. */
function messageFor(node: any, edit: Edit): any {
  if (edit.op === 'add') return { type: 'addChild', rowId: node.id };
  if (edit.op === 'delete') return { type: 'delete', rowIds: [node.id] };
  const key = columnOf(edit);
  return { type: 'edit', rowId: node.id, columnId: key, oldValue: shownText(node.toRow(), key), newValue: edit.text ?? '' };
}

function refusalIn(posts: any[]): Answer | null {
  const v = posts.find((p) => p.type === 'validationError');
  if (v) return { answer: 'refused', reason: String(v.reason) };
  const e = posts.find((p) => p.type === 'error');
  if (e) return { answer: 'error', reason: String(e.message) };
  return null;
}

/**
 * `edits` of the JSON dictionary `bytes`, in a fresh JSON engine, each answered before the next is
 * sent, then its text saved once.
 */
async function jsonEditorSave(bytes: Uint8Array, edits: Edit | Edit[]): Promise<Answer> {
  const j = await openJson('values_text.sldd', bytes);
  try {
    let refused: Answer | null = null;
    for (const edit of Array.isArray(edits) ? edits : [edits]) {
      const node = nodeAt(j.model(), edit.path);
      if (!node) return { answer: 'absent' };
      const version = j.text.version;
      const mark = j.view.posts.length;
      j.view.send(messageFor(node, edit));
      const after = () => j.view.posts.slice(mark);
      try {
        await waitFor('the edit answered', () => j.text.version !== version || refusalIn(after()) !== null);
      } catch {
        return { answer: 'none' };
      }
      await settle();
      const answer = refusalIn(after());
      if (j.text.version === version) return answer ?? { answer: 'none' };
      refused ??= answer;
    }
    const saved = j.save();
    return refused ? { ...refused, bytes: saved } : { answer: 'written', bytes: saved };
  } finally {
    j.view.close();
  }
}

/** `edit` of the binary dictionary `bytes`, in a fresh binary engine, then its own save. */
async function binaryEditorSave(bytes: Uint8Array, edit: Edit): Promise<Answer> {
  const b = await openBinary('values_binary.sldd', bytes);
  try {
    const node = nodeAt(b.model(), edit.path);
    if (!node) return { answer: 'absent' };
    const mark = b.view.posts.length;
    // This engine answers an edit, an Add and a Delete synchronously.
    b.view.send(messageFor(node, edit));
    const refused = refusalIn(b.view.posts.slice(mark));
    if (b.events.length === 0) return refused ?? { answer: 'none' };
    let saved: Uint8Array;
    try {
      saved = b.save();
    } catch (err) {
      return { answer: 'saveRefused', reason: err instanceof Error ? err.message : String(err) };
    }
    return refused ? { ...refused, bytes: saved } : { answer: 'written', bytes: saved };
  } finally {
    b.view.close();
  }
}

/**
 * The same model edit the engines make (the setter inside mutateSubtree, and core's own Add and
 * Delete), on a fresh read of `bytes` in a session of its own, saved by core's serializeSource. An
 * entry deleted whole is the one shape this does not make.
 */
function coreSave(bytes: Uint8Array, filename: string, edit: Edit): Uint8Array {
  const session: any = createSession();
  const root: any = ingest(session, bytes, { filename });
  try {
    const node = nodeAt(root, edit.path);
    if (!node) throw new Error(`no node at ${edit.path}`);
    if (edit.op === 'add') session.mutateSubtree(findOwningEntry(node), () => addChildToModel(node));
    else if (edit.op === 'delete') session.mutateSubtree(findOwningEntry(node), () => removeChildFromModel(node));
    else {
      const result = session.mutateSubtree(findOwningEntry(node), () => node.setProperty(columnOf(edit), edit.text ?? ''));
      if (result !== true) throw new Error(`core refused ${edit.path}: ${JSON.stringify(result)}`);
    }
    const out = session.serializeSource(root.name);
    return out.kind === 'binary' ? out.bytes : new TextEncoder().encode(out.text);
  } finally {
    session.removeDataSource?.(root.name);
  }
}

const EDITS: Edit[] = [
  { path: 'dRow(1)', op: 'value', key: 'Value', text: '7' },
  { path: 'strRow(1)', op: 'value', key: 'Value', text: '"abc"' },
  { path: 'sLeaves.dScalar', op: 'value', key: 'Value', text: '[1;2;3]' },
  { path: 'sArr(1).a', op: 'value', key: 'Value', text: '+5' },
  { path: 'cLeaves{1}', op: 'value', key: 'Value', text: '[1 2 3]' },
  { path: 'sNest.c{2}.s.f', op: 'value', key: 'Value', text: '0' },
  { path: 'cNest{1}{2}{1}', op: 'value', key: 'Value', text: '[1 2; 3 4]' },
  { path: 'pStruct.Value.a', op: 'value', key: 'Value', text: '-3.25' },
  { path: 'pStruct.Value.inner.x', op: 'value', key: 'Value', text: '.5' },
  { path: 'pStructArr.Value(1).a', op: 'value', key: 'Value', text: '-0' },
  { path: 'pInt8.Value(1)', op: 'value', key: 'Value', text: 'NaN' },
  { path: 'sHoldsParam.p', op: 'prop', key: 'Min', text: '0' },
  { path: 'bus.e1', op: 'prop', key: 'complexity', text: 'complex' },
  { path: 'sNest.c{2}.s', op: 'name', text: 'zz_new' },
  { path: 'pStruct.Value.inner.x', op: 'name', text: 'zz_new' },
  { path: 'sLeaves.dRow', op: 'add' },
  { path: 'saCell(2).c{1}', op: 'add' },
  { path: 'pStruct.Value.inner.y', op: 'add' },
  { path: 'cNest{1}{2}{1}', op: 'delete' },
  { path: 'pStruct.Value.b(1)', op: 'delete' },
  { path: 'sArr(2).b', op: 'value', key: 'Value', text: '18446744073709551615' },
  { path: 'cNest{1}{2}{2}', op: 'value', key: 'Value', text: '-9223372036854775808' },
  { path: 'cLeaves{9}', op: 'value', key: 'Value', text: '{[1 2], true}' },
];
const CELL_OVER_STREAM = EDITS[EDITS.length - 1];

const TEXT = () => file('test-integration/fixtures/editbash/values_text.sldd');
const BINARY = () => file('test-integration/fixtures/editbash/values_binary.sldd');
const label = (e: Edit) => `${e.op} ${e.path}${e.key && e.op === 'prop' ? '.' + e.key : ''}${e.text !== undefined ? ' = ' + e.text : ''}`;
// When an entry was last modified is the save's clock, not the edit.
const withoutClock = (bytes: Uint8Array) => new TextDecoder().decode(bytes).replace(/("lastmod": ?")[^"]*"/g, '$1<T>"');
/** The Value a fresh read of a dictionary shows at `path`. */
function valueAt(bytes: Uint8Array, filename: string, path: string): string {
  const row = nodeAt(ingest(createSession(), bytes, { filename }), path)?.toRow();
  return String(row?.Value?.text ?? row?.Value ?? '(no row)');
}
/** What a fresh read of a dictionary shows of every entry, row for row. */
function shownBy(bytes: Uint8Array, filename: string): Record<string, unknown> {
  const root: any = ingest(createSession(), bytes, { filename });
  const out: Record<string, unknown> = {};
  for (const section of root.children ?? []) for (const entry of section.children ?? []) out[`${section.name}/${entry.name}`] = shownCells(entry);
  return out;
}

describe('A dictionary editor saves an edit as core saves it', () => {
  it('JSON .sldd: the saved TextDocument is the text core writes', async () => {
    const original = TEXT();
    const wrong: string[] = [];
    for (const [i, edit] of EDITS.entries()) {
      const saved = await jsonEditorSave(original, edit);
      if (!saved.bytes || saved.answer !== 'written') {
        wrong.push(`${label(edit)}: the editor ${saved.answer} it (${saved.reason ?? ''})`);
        continue;
      }
      if (withoutClock(saved.bytes) !== withoutClock(coreSave(original, 'values_text.sldd', edit))) {
        wrong.push(`${label(edit)}: the editor's save is not core's`);
      }
      // The comparison can fail: core's save of another value is another text.
      if (i === 0) {
        const other = coreSave(original, 'values_text.sldd', { ...edit, text: '8' });
        assert.notStrictEqual(withoutClock(saved.bytes), withoutClock(other), 'a save of 8 is told from a save of 7');
      }
    }
    assert.deepStrictEqual(wrong, []);
  });

  it('JSON .sldd: a cell typed over an element held as a MAT stream is saved as typed', async () => {
    const saved = await jsonEditorSave(TEXT(), CELL_OVER_STREAM);
    assert.strictEqual(saved.answer, 'written', saved.reason);
    assert.strictEqual(valueAt(saved.bytes!, 'values_text.sldd', 'cLeaves{9}'), '{[1 2], true}');
  });

  it('JSON .sldd: a Delete right after that edit deletes the one element', async () => {
    const saved = await jsonEditorSave(TEXT(), [CELL_OVER_STREAM, { path: 'cLeaves{9}{1}(1)', op: 'delete' }]);
    assert.strictEqual(saved.answer, 'written', saved.reason);
    assert.strictEqual(valueAt(saved.bytes!, 'values_text.sldd', 'cLeaves{9}{1}'), '2');
    assert.strictEqual(valueAt(saved.bytes!, 'values_text.sldd', 'cLeaves{9}{2}'), 'true');
  });

  it("binary .sldd: the saved file reads back as core's save does", async () => {
    const original = BINARY();
    const wrong: string[] = [];
    for (const [i, edit] of EDITS.entries()) {
      const saved = await binaryEditorSave(original, edit);
      if (!saved.bytes || saved.answer !== 'written') {
        wrong.push(`${label(edit)}: the editor ${saved.answer} it (${saved.reason ?? ''})`);
        continue;
      }
      const ours = shownBy(saved.bytes, 'values_binary.sldd');
      const cores = shownBy(coreSave(original, 'values_binary.sldd', edit), 'values_binary.sldd');
      try {
        assert.deepStrictEqual(ours, cores);
      } catch {
        wrong.push(`${label(edit)}: the editor's save reads back otherwise than core's`);
      }
      if (i === 0) {
        const other = shownBy(coreSave(original, 'values_binary.sldd', { ...edit, text: '8' }), 'values_binary.sldd');
        assert.notDeepStrictEqual(ours, other, 'a save of 8 is told from a save of 7');
      }
    }
    assert.deepStrictEqual(wrong, []);
  });
});
