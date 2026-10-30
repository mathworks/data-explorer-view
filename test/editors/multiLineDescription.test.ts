// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/multiLineDescription.test.ts at c73da3c.
//
// A Description of several lines, through each editing engine: the edit the table posts is written
// with every line break, saved, and a fresh open of the saved file shows it exactly; and an edit that
// repeats the Description as it is writes nothing.
//
// The files are MATLAB's own (test-integration/fixtures/multiline): the same three
// Simulink.Parameter objects in a MAT-file, a text dictionary and a binary one, whose Descriptions
// MATLAB wrote with an LF, with a CR LF (which MATLAB's text dictionary writes as LF), and on one
// line. The webview's half, that the table posts exactly the text the user sees and nothing for an
// editor only opened, is test/multiLineDescriptionRows.test.ts. The extension's suite also copies
// each save for a MATLAB live gate outside its repo; that stays with the extension.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { file } from '../jsonEngine/harness.js';
import { waitFor } from '../matEngine/harness.js';
import { BINARY_EDITOR, MAT_EDITOR, TEXT_EDITOR, quiet, type EditorKind, type EditorTab } from './tabs.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const LF = "two\nlines, it's";

/** An engine, and the MATLAB-written file of the multiline fixtures it opens. */
interface Format extends EditorKind {
  file: string;
}

const FORMATS: Format[] = [
  { ...MAT_EDITOR, file: 'multiline_r2027a.mat' },
  { ...TEXT_EDITOR, file: 'multiline_r2027a_text.sldd' },
  { ...BINARY_EDITOR, file: 'multiline_r2027a_binary.sldd' },
];

const fixture = (name: string): Uint8Array => file(`test-integration/fixtures/multiline/${name}`);

/** The Description core reads of a node. */
const description = (node: any): string => node.toRow().Description;

/** The Description's character codes, so a failure shows which line break went where. */
const codes = (text: string): string => [...text].map((c) => c.charCodeAt(0)).join(' ');

describe('A multi-line Description is written exactly as typed, in every table editor', () => {
  const editDescription = (tab: EditorTab, row: any, newValue: string) =>
    tab.view.send({ type: 'edit', rowId: row.ID, columnId: 'Description', oldValue: String(row.Description), newValue });

  const refusalsIn = (posts: any[]) => posts.filter((p) => p.type === 'validationError' || p.type === 'error');

  for (const format of FORMATS) {
    // pCRLF as MATLAB wrote it: its text dictionary writes the CR LF as LF, the other two keep it.
    const crlfHeld = format.file.endsWith('_text.sldd') ? 'first line\nsecond line' : 'first line\r\nsecond line';

    it(`in ${format.name}: a line added to a two-line Description is saved, and reopens, exactly`, async () => {
      const tab = await format.open(`edit-${format.file}`, fixture(format.file));
      const row = tab.row('pLF');
      assert.strictEqual(row.Description, LF, 'the Description MATLAB wrote');
      const typed = `${LF}\nand a third`;
      editDescription(tab, row, typed);
      await waitFor('the edit to reach the document', () => tab.edited());
      assert.deepStrictEqual(refusalsIn(tab.view.posts), [], 'the edit was taken');

      const saved = tab.save();
      assert.strictEqual(codes(format.readBack(saved, 'pLF', description)), codes(typed), 'a fresh read of the saved file');
      const reopened = await format.open(`reopen-${format.file}`, saved);
      assert.strictEqual(codes(reopened.row('pLF').Description), codes(typed), 'the saved file reopened in a new editor');
      assert.strictEqual(reopened.row('pOne').Description, 'one line', 'the other entries as MATLAB wrote them');
    });

    it(`in ${format.name}: an edit of a CR LF Description keeps the line break the file held`, async () => {
      const tab = await format.open(`crlf-${format.file}`, fixture(format.file));
      const row = tab.row('pCRLF');
      assert.strictEqual(codes(row.Description), codes(crlfHeld), 'the Description MATLAB wrote');
      const typed = crlfHeld.replace('second line', 'second line, edited');
      editDescription(tab, row, typed);
      await waitFor('the edit to reach the document', () => tab.edited());
      const saved = tab.save();
      assert.strictEqual(codes(format.readBack(saved, 'pCRLF', description)), codes(typed), 'a fresh read of the saved file');
      const reopened = await format.open(`crlf-reopen-${format.file}`, saved);
      assert.strictEqual(codes(reopened.row('pCRLF').Description), codes(typed), 'the saved file reopened in a new editor');
    });

    it(`in ${format.name}: an edit that repeats a multi-line Description writes nothing`, async () => {
      const tab = await format.open(`same-${format.file}`, fixture(format.file));
      for (const name of ['pLF', 'pCRLF']) {
        const row = tab.row(name);
        editDescription(tab, row, String(row.Description));
        await quiet();
      }
      assert.deepStrictEqual(refusalsIn(tab.view.posts), [], 'nothing was refused either');
      assert.strictEqual(tab.edited(), false, 'no edit reached the document');
      assert.strictEqual(tab.dirty(), false, 'the document is clean');
    });
  }
});
