// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/dirtyLifecycle.test.ts at cc8cb1b.
// Runs against view's JSON dictionary engine (src/model/edit/jsonEngine.ts, jsonView.ts) through the
// messages its table sends (test/jsonEngine/harness.ts): the JSON twin of
// test/binaryEngine/entryScoped.test.ts's dirty-state describe.
//
// The extension's suite could not run its provider (it imports `vscode`), so it rebuilt the
// lifecycle from the modules the provider is made of (SlddModel, slddBaseline, rowBuilder,
// entrySplice). Here the composition is the engine itself, and each step maps to it:
//   - the on-open baseline is the engine's first paint (a document opened clean);
//   - editEntry (setProperty, reserialize, splice) is the table's `edit` message, which writes the
//     entry's span into the text; its refusal is the `validationError` the table is posted;
//   - "re-parse the working copy and diff against the baseline" (computeModified, then buildRows
//     with modifiedNames) is a wide repaint (repaintAll re-parses the text), read off the rows'
//     Status column: the modified set is the entry rows marked Modified;
//   - a save is the harness's save (the file written, the text saved); a raw text edit is the
//     store's `apply`; a revert is the store's `reset` to the file's text.
import { describe, it, expect } from 'vitest';
import { entryRow, isEntryRow, nameOf, open, settle, waitFor, WORKSPACE_DATA, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The names of the entry rows `rows` marks Modified: the modified set the Status column shows. */
const modifiedIn = (rows: any[]): Set<string> => new Set(rows.filter((r) => isEntryRow(r) && r.Status === 'Modified').map(nameOf));

/** The whole table painted again from the text: re-parsed, diffed against the baseline, every row rebuilt. */
async function wide(o: Opened): Promise<any[]> {
  const at = o.view.posts.length;
  await o.view.source.repaintAll();
  const paint = o.view.posts.slice(at).find((p) => p.type === 'setRows');
  expect(paint, 'the whole table was painted').toBeDefined();
  return paint.rows;
}

/**
 * A cell edit from the table, as the provider's applyEdit takes it: the new full document text once
 * it is written, or `{ error }` (the refusal the table is posted) when the edit is refused.
 */
async function editEntry(o: Opened, entryName: string, columnId: string, newValue: string): Promise<string | { error: string }> {
  const row = entryRow(o.view.posts, entryName);
  const at = o.view.posts.length;
  const version = o.text.version;
  o.view.send({ type: 'edit', rowId: row.ID, columnId, oldValue: '', newValue });
  await waitFor(`the ${columnId} edit of ${entryName} to be written or refused`, () =>
    o.text.version !== version || o.view.posts.slice(at).some((p) => p.type === 'validationError' || p.type === 'error'),
  );
  await settle();
  const refusal = o.view.posts.slice(at).find((p) => p.type === 'validationError' || p.type === 'error');
  if (refusal) return { error: refusal.reason ?? refusal.message };
  return o.text.text;
}

describe('.sldd dirty-state / Modified lifecycle', () => {
  it('1. an edit marks exactly that entry Modified vs the baseline', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'life-edit.sldd' });

    // The on-open baseline, captured from the original content by the first paint.
    const base = o.view.posts.find((p) => p.type === 'setRows').rows;
    expect(modifiedIn(base).size).toBe(0);

    // Edit Number's value 1 -> 42 (the table's edit, written as the entry's span).
    const out = await editEntry(o, 'Number', 'Value', '42');
    expect(typeof out).toBe('string');

    // Re-parse the working copy and diff against the baseline.
    const rows = await wide(o);
    const modified = modifiedIn(rows);
    expect(modified).toEqual(new Set(['Number']));
    expect(modified.size).toBe(1);

    // The paint shows Status=Modified only on the edited entry's row.
    const numberRow = rows.find((r: any) => r.Name?.label === 'Number');
    expect(numberRow.Status).toBe('Modified');
    const siblingRow = rows.find((r: any) => r.Name?.label === 'PI');
    expect(siblingRow.Status).toBeFalsy();
  });

  it('2. save resets the baseline so no rows are Modified', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'life-save.sldd' });

    const newText = (await editEntry(o, 'Number', 'Value', '42')) as string;
    expect(typeof newText).toBe('string');
    // Sanity: it IS modified before save.
    expect(modifiedIn(await wide(o)).size).toBe(1);

    // saveCustomDocument: the text written, which the next repaint re-baselines to.
    const at = o.view.posts.length;
    o.save();
    await waitFor('the save to repaint the table', () => o.view.posts.slice(at).some((p) => p.type === 'setRows'));
    await settle();

    const rows = await wide(o);
    expect(modifiedIn(rows).size).toBe(0);
    expect(rows.some((r: any) => r.Status === 'Modified')).toBe(false);
  });

  it('3. a text-level content change is detected the same way', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'life-text.sldd' });
    const fixtureText = o.text.text;

    // A raw JSON text edit: change PI's value in the text directly.
    const editedText = fixtureText.replace('"value": 3.141592653589793', '"value": 3.14');
    expect(editedText).not.toBe(fixtureText); // the replacement actually changed the text
    expect(() => JSON.parse(editedText)).not.toThrow();
    // As a text view writes it: one replacement, of the characters that differ.
    const offset = fixtureText.indexOf('3.141592653589793');
    expect(await o.type(offset, '3.141592653589793'.length, '3.14'), 'the text edit applied').toBe(true);
    expect(o.text.text).toBe(editedText);
    await settle();

    const modified = modifiedIn(await wide(o));
    expect(modified.has('PI')).toBe(true);
    expect(modified.size).toBe(1);
  });

  it('4. revert restores baseline cleanliness', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'life-revert.sldd' });
    const fixtureText = o.text.text;

    const newText = (await editEntry(o, 'Number', 'Value', '42')) as string;
    expect(typeof newText).toBe('string');
    expect(modifiedIn(await wide(o)).size).toBe(1);

    // revertCustomDocument: the document reads the ORIGINAL disk content again.
    await o.text.reset(new TextDecoder().decode(o.disk.bytes));
    await waitFor('the revert to bring the file back', () => !o.text.dirty && o.text.text === fixtureText);
    await settle(20);
    expect(modifiedIn(await wide(o)).size).toBe(0);
  });

  it('5. an invalid edit is rejected with no text change', async () => {
    const o = await open(WORKSPACE_DATA, undefined, { as: 'life-invalid.sldd' });
    const before = o.text.text;

    // Non-numeric value for a numeric entry.
    const badValue = await editEntry(o, 'Number', 'Value', 'not_a_number');
    expect(typeof badValue).toBe('object');
    expect((badValue as { error: string }).error).toBeTruthy();

    // Invalid MATLAB name (starts with a digit).
    const badName = await editEntry(o, 'char', 'Name', '123bad');
    expect(typeof badName).toBe('object');
    expect((badName as { error: string }).error).toBeTruthy();

    // Neither reached the text.
    expect(o.text.text).toBe(before);
    expect(o.text.dirty).toBe(false);
  });
});
