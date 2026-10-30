// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/longValueEdit.test.ts at c73da3c.
//
// A value too long to show stays editable, in every editing engine. An array of 500 doubles is typed
// into a variable's or an entry's Value and saved; opened again, its cell shows a summary
// (`<1x500 double>`), the row says it takes an editor of its whole text (`_hasEditText`) without
// carrying it, and the editor opening asks for it (`requestEditText`), which the engine answers with
// the whole value written out (`editText`). That text committed as it is writes nothing; one element
// changed in it is saved, and the file then holds the array with that element changed. The
// webview's half, that the editor is seeded with the answer and posts the whole text, is
// test/treeTableWholeValue.test.ts.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { fixture, waitFor } from '../matEngine/harness.js';
import { file } from '../jsonEngine/harness.js';
import { BINARY_EDITOR, MAT_EDITOR, TEXT_EDITOR, quiet, type EditorKind, type EditorTab } from './tabs.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LONG = '[' + Array.from({ length: 500 }, (_, i) => i + 1).join(' ') + ']';
const EDITED = LONG.replace('[1 2 ', '[7 2 ');

const CASES: { editor: EditorKind; ext: string; bytes: () => Uint8Array; name: string }[] = [
  { editor: MAT_EDITOR, ext: '.mat', bytes: () => fixture('cases.mat'), name: 'rowVec' },
  { editor: TEXT_EDITOR, ext: '.sldd', bytes: () => file('test-integration/fixtures/workspace/params.sldd'), name: 'colVec' },
  { editor: BINARY_EDITOR, ext: '.sldd', bytes: () => file('test-integration/fixtures/sldd/params_binary.sldd'), name: 'colVec' },
];

const shown = (cell: any): string => (cell && typeof cell === 'object' ? String(cell.text ?? '') : String(cell ?? ''));
const problemsIn = (posts: any[]) => posts.filter((p) => p.type === 'validationError' || p.type === 'error');

describe('A value shown as a summary for its size is edited as its whole text, in every table editor', () => {
  /** Send the edit the table sends for `row`, and wait for it to reach the document. */
  const edit = async (tab: EditorTab, row: any, oldValue: string, newValue: string) => {
    tab.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue, newValue });
    await waitFor('the edit to reach the document', () => tab.edited() || problemsIn(tab.view.posts).length > 0);
    assert.deepStrictEqual(problemsIn(tab.view.posts), [], 'the edit was taken');
  };

  /** Ask for `row`'s whole Value text as the table does when its editor opens, and answer the reply. */
  const editTextOf = async (tab: EditorTab, row: any): Promise<any> => {
    const mark = tab.view.posts.length;
    tab.view.send({ type: 'requestEditText', rowId: row.ID });
    await waitFor('the whole text', () => tab.view.posts.slice(mark).some((p) => p.type === 'editText'));
    return tab.view.posts.slice(mark).find((p) => p.type === 'editText');
  };

  for (const c of CASES) {
    it(`in ${c.editor.name}: an array of 500 typed, saved, reopened, and one element of it edited`, async () => {
      const first = await c.editor.open(`typed${c.ext}`, c.bytes());
      const before = first.row(c.name);
      await edit(first, before, shown(before.Value), LONG);
      const saved = first.save();

      const second = await c.editor.open(`reopened${c.ext}`, saved);
      const row = second.row(c.name);
      assert.strictEqual(shown(row.Value), '<1x500 double>', 'the cell shows a summary');
      assert.strictEqual(row._valueEditable, true, 'and takes an editor');
      assert.strictEqual(row._hasEditText, true, 'of its whole text');
      assert.ok(!('_editText' in row), 'which the row does not carry');

      const reply = await editTextOf(second, row);
      assert.deepStrictEqual(reply, { type: 'editText', rowId: row.ID, text: LONG }, 'the whole value, as core writes it');

      second.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: reply.text, newValue: reply.text });
      await quiet();
      assert.strictEqual(second.edited(), false, 'the whole text committed as it is writes nothing');
      assert.deepStrictEqual(problemsIn(second.view.posts), []);

      await edit(second, row, reply.text, EDITED);
      const resaved = second.save();
      assert.strictEqual(
        c.editor.readBack(resaved, c.name, (n, session) => session.editText(n.id)),
        EDITED,
        'the saved file holds the array with that one element changed',
      );
    });
  }
});
