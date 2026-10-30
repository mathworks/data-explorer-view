// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/readOnlyCellEdit.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/descriptionApplies.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/sparseNoGrid.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/variantBankEdit.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/slddStreamObjectEdits.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/functionRenameThroughEditors.test.ts at c73da3c
//
// A cell of a text dictionary as its table edits it, run against view's JSON dictionary engine
// through the messages its table sends: a read-only cell refused, a Description shown and saved only
// where the object has one, a sparse array offered no grid, a VariantBank's own columns, an object
// inside a pasted MAT stream, and a service function's rename carried into the catalog. These are
// the suites' text-dictionary halves, the ones test/binaryEngine left for the JSON engine; their
// compressed-binary halves are there, and the copies between the two editors are here, over one
// session and one set of registers. Left with vscode: every MAT-file half and the read-only model
// view's (the MAT-file table's and the model table's), and sparseNoGrid's premise that findFiles
// never lists its fixtures (VS Code's). VS Code's undo of a write is applied, as there, as the
// inverse edit of the text; a save is the text written and the store told.
import * as assert from 'node:assert';
import { createSession, editRefusalText, ingest } from 'data-explorer-core';
import { unzipSync } from 'fflate';
import { beforeAll, describe, it } from 'vitest';
import { createRegisters, type Registers } from '../../src/model/index.js';
import type { TextStoreChange } from '../../src/model/edit/hooks.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { entryOf as dictEntryOf, membersOf, open as openBinaryEngine, readSldd } from '../binaryEngine/harness.js';
import { chunkOf, entryRow, file, isEntryRow, nameOf, open, settle, waitFor, WORKSPACE_PARAMS, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('An edit of a read-only cell is refused, with its reason, and changes nothing', () => {
  /** What a refused edit leaves on the view: the validation dialog, then a repaint of that row. */
  const refusal = (posts: any[]) => {
    const at = posts.findIndex((p) => p.type === 'validationError');
    assert.ok(at >= 0, 'the edit is answered with a validation error');
    return { error: posts[at], after: posts.slice(at + 1) };
  };

  it('in a JSON dictionary: the text is not written', async () => {
    const j = await open(WORKSPACE_PARAMS, undefined, { as: 'ro.sldd' });
    const row = entryRow(j.view.posts, 'gravity');
    const version = j.text.version;
    j.view.posts.length = 0;
    j.view.send({ type: 'edit', rowId: row.ID, columnId: 'Kind', oldValue: row.Kind, newValue: 'Numeric Type' });
    await waitFor('the answer', () => j.view.posts.some((p) => p.type === 'validationError'));
    const { error, after } = refusal(j.view.posts);
    assert.match(error.reason, /^Cannot edit "gravity": the Kind of gravity is read-only here\./);
    await waitFor('the row painted again', () => after.length > 0 || j.view.posts.some((p) => p.type === 'updateEntryRows'));
    await settle(20);
    assert.strictEqual(j.text.version, version, 'the text was not written');
    assert.strictEqual(j.text.dirty, false);
  });
});

const NEW_TEXT = 'gravity in metres per second squared';

describe('A Description is shown and saved where the object has one, and refused where it has none', () => {
  /** The validation error a refused edit is answered with. */
  const refusalIn = async (posts: any[]): Promise<any> => {
    await waitFor('the refusal', () => posts.some((p) => p.type === 'validationError'));
    return posts.find((p) => p.type === 'validationError');
  };

  /** The view offers a Description column, labelled. */
  const assertDescriptionColumn = (posts: any[]) => {
    const payload = posts.filter((p) => p.type === 'setRows').pop();
    assert.ok(payload?.columns?.includes('Description'), `the Description column is offered (${payload?.columns})`);
    assert.strictEqual(payload.columnLabels?.Description, 'Description');
  };

  const editDescription = (view: { send(m: any): void }, row: any, newValue: string) =>
    view.send({ type: 'edit', rowId: row.ID, columnId: 'Description', oldValue: String(row.Description ?? ''), newValue });

  // Core's two answers, by what the row is: a plain variable is a value, and core says it has no
  // Description; an object of a class without the property is refused as MATLAB's own error for
  // setting an unknown property is worded.
  const REFUSAL: Record<string, RegExp> = {
    scalarD: /^Cannot edit "scalarD": an? \S.* has no Description\.$/,
    MyLUT: /^Cannot edit "MyLUT": Unrecognized property 'Description' for class 'Simulink\.LookupTable'\.$/,
  };

  it('in a JSON dictionary', async () => {
    const j = await open(WORKSPACE_PARAMS, undefined, { as: 'desc.sldd' });
    assertDescriptionColumn(j.view.posts);
    // Read off the first paint before any case clears the posts it searches.
    const [scalarD, lut, gravity] = ['scalarD', 'MyLUT', 'gravity'].map((n) => entryRow(j.view.posts, n));

    for (const [name, row] of [
      ['scalarD', scalarD],
      ['MyLUT', lut],
    ] as const) {
      assert.strictEqual(row._descriptionApplies, false, `${name} has no Description`);
      assert.strictEqual(row._descriptionEditable, false);
      const version = j.text.version;
      j.view.posts.length = 0;
      editDescription(j.view, row, 'typed anyway');
      const error = await refusalIn(j.view.posts);
      assert.match(error.reason, REFUSAL[name]);
      await settle(20);
      assert.strictEqual(j.text.version, version, `${name}: the text was not written`);
      assert.strictEqual(j.text.dirty, false);
    }

    assert.strictEqual(gravity._descriptionApplies, true, 'a Simulink.Parameter has a Description');
    j.view.posts.length = 0;
    editDescription(j.view, gravity, NEW_TEXT);
    await waitFor('the edit written', () => j.text.text.includes(NEW_TEXT));
    assert.ok(!j.view.posts.some((p) => p.type === 'validationError'), 'the edit was not refused');
    const saved = readSldd(j.save(), (dict) => dictEntryOf(dict, 'gravity').toRow().Description);
    assert.strictEqual(saved, NEW_TEXT, 'the Description survives a fresh read of the saved file');
  });
});

// 2-D, within the grid's size cap, and sparse: class and shape alone would admit each. Paths are by
// Name label from the entry down; a Parameter's grid would sit on its entry row, which shows the
// Value's literal, and on its Value row.
const SPARSE = [
  'spAllZero',
  'spBig',
  'spComplex',
  'spDiag',
  'spLogical',
  'spNonFinite',
  'spSingle',
  'pSp',
  'pSp/Value',
  'pSpComplex',
  'pSpComplex/Value',
  'pSpLogical',
  'pSpLogical/Value',
  'st/sp',
];

// The dense twins, same classes and shapes, with the cell count of each grid.
const DENSE: Record<string, number> = {
  dAllZero: 12,
  dComplex: 12,
  dDiag: 100,
  dLogical: 6,
  dNonFinite: 4,
  dSingle: 6,
  pDense: 9,
  'pDense/Value': 9,
};

/** Each row by its path of Name labels from the entry down. Section headers are not part of a path. */
function rowsByPath(rows: any[]): Map<string, any> {
  const byId = new Map(rows.map((r) => [r.ID, r]));
  const pathOf = (row: any): string => {
    const parent = byId.get(row.parent);
    const label = String(row.Name?.label ?? row.Name);
    return parent && !String(parent.ID).startsWith('section:') ? `${pathOf(parent)}/${label}` : label;
  };
  const out = new Map<string, any>();
  for (const row of rows) if (!String(row.ID).startsWith('section:')) out.set(pathOf(row), row);
  return out;
}

/** The engine's answer to a glyph click on the row with this id. */
async function fetchMatrix(view: { posts: any[]; send(m: any): void }, nodeId: string): Promise<any> {
  const answered = () => view.posts.find((p) => p.type === 'matrixCells' && p.nodeId === nodeId);
  view.send({ type: 'requestMatrix', nodeId });
  await waitFor(`the matrixCells answer for ${nodeId}`, () => !!answered());
  return answered();
}

describe('a sparse array is offered no Variable Editor grid', () => {
  const SPARSE_TEXT = 'test-integration/fixtures/sparse/sparse_text.sldd';

  /** The rows of the first whole-table paint. */
  const paint = (posts: any[]): any[] => {
    const failed = posts.find((p) => p.type === 'error');
    assert.ok(!failed, `the tab posted an error: ${failed?.message}`);
    return posts.find((p) => p.type === 'setRows').rows;
  };

  it('sparse_text.sldd: no sparse row carries a glyph, and a click on one fetches no grid', async () => {
    const o = await open(SPARSE_TEXT);
    const rows = rowsByPath(paint(o.view.posts));
    // The rows are there; only the glyph is not.
    for (const path of SPARSE) assert.ok(rows.get(path), `sparse_text.sldd has a row for ${path}`);
    // EXACTLY the dense twins carry one: no sparse row, and nothing else either.
    const stamped = [...rows]
      .filter(([, r]) => r._matrix)
      .map(([p]) => p)
      .sort();
    assert.deepStrictEqual(stamped, Object.keys(DENSE).sort(), 'sparse_text.sldd: the rows with a grid glyph');
    // A fetch for a sparse row answers with the reason and no cells, from the same gate the glyph
    // comes from. The dense twin asked the same way is the control.
    const control = await fetchMatrix(o.view, rows.get('dDiag').ID);
    assert.strictEqual(control.matrix?.cells?.length, 100, 'sparse_text.sldd: dDiag fetched by its row ID');
    for (const path of ['spDiag', 'pSp']) {
      const answer = await fetchMatrix(o.view, rows.get(path).ID);
      assert.strictEqual(answer.matrix, undefined, `sparse_text.sldd: ${path} fetched no grid`);
      assert.strictEqual(answer.message, 'This value could not be read as a table.');
    }
  });

  it('sparse_text.sldd: every dense twin carries its glyph, and a click on it fetches every cell', async () => {
    const o = await open(SPARSE_TEXT);
    const rows = rowsByPath(paint(o.view.posts));
    for (const [path, cells] of Object.entries(DENSE)) {
      const row = rows.get(path);
      assert.ok(row?._matrix, `sparse_text.sldd: ${path} carries a grid glyph`);
      const answer = await fetchMatrix(o.view, row._matrix.nodeId);
      assert.strictEqual(answer.matrix?.cells?.length, cells, `sparse_text.sldd: ${path} fetched its ${cells} cells`);
    }
  });
});

/** The columns a bank's and a coder info's fields are shown in: the id, the label its header reads, and the picker group it is under. */
const OFFERED_COLUMNS: Array<[string, string, string]> = [
  ['headerFile', 'Header File', 'Code Generation'],
  ['bankName', 'Bank Name', 'Variant Bank'],
  ['variantConditions', 'Variant Conditions', 'Variant Bank'],
  ['allChoicesCoderInfo', 'All Choices Coder Info', 'Variant Bank'],
  ['activeChoiceCoderInfo', 'Active Choice Coder Info', 'Variant Bank'],
  ['definitionFile', 'Definition File', 'Code Generation'],
  ['preStatement', 'Pre Statement', 'Code Generation'],
  ['postStatement', 'Post Statement', 'Code Generation'],
  ['qualifier', 'Qualifier', 'Code Generation'],
];

/** One edit of each kind, as the table sends it, what the cell shows after it, and the saveobj field it is written into. */
interface CellEdit {
  entry: string;
  column: string;
  from: string;
  typed: string;
  shown: string;
  field: string;
  saved: unknown;
}

const cellOf = (conditions: string[]) => ({
  _array_type: 'Cell',
  _dimensions: [1, conditions.length],
  _elements: conditions,
});

const CELL_EDITS: CellEdit[] = [
  // Text cells.
  { entry: 'vbN', column: 'bankName', from: 'bankA', typed: 'bankB', shown: 'bankB', field: 'Name', saved: 'bankB' },
  { entry: 'vbN', column: 'allChoicesCoderInfo', from: 'ciA', typed: 'ciB', shown: 'ciB', field: 'AllChoicesCoderInfo', saved: 'ciB' },
  { entry: 'vbN', column: 'activeChoiceCoderInfo', from: 'ciB', typed: 'ciA', shown: 'ciA', field: 'ActiveChoiceCoderInfo', saved: 'ciA' },
  { entry: 'ciB', column: 'headerFile', from: '', typed: 'h.h', shown: 'h.h', field: 'HeaderFile', saved: 'h.h' },
  { entry: 'ciB', column: 'definitionFile', from: '', typed: 'd.c', shown: 'd.c', field: 'DefinitionFile', saved: 'd.c' },
  // A cell literal, saved as a cell of the conditions in MATLAB's spelling.
  {
    entry: 'vbN',
    column: 'variantConditions',
    from: "{'V == 1','V == 2'}",
    typed: "{'V==1','V == 3'}",
    shown: "{'V == 1','V == 3'}",
    field: 'VariantConditions',
    saved: cellOf(['V == 1', 'V == 3']),
  },
  // The two textArea cells, one with a line break.
  { entry: 'ciB', column: 'preStatement', from: '', typed: 'pre\nline two', shown: 'pre\nline two', field: 'PreStatement', saved: 'pre\nline two' },
  { entry: 'ciB', column: 'postStatement', from: '', typed: 'post', shown: 'post', field: 'PostStatement', saved: 'post' },
  // The select cell, saved in MATLAB's spelling of the choice.
  { entry: 'ciB', column: 'qualifier', from: 'None', typed: 'Volatile', shown: 'Volatile', field: 'Qualifier', saved: 'Volatile' },
];

/** Edits MATLAB refuses, and its words for each (core's, relayed as they are). */
const CELL_REFUSALS: Array<{ entry: string; column: string; from: string; typed: string; reason: string }> = [
  {
    entry: 'vbN',
    column: 'bankName',
    from: 'bankA',
    typed: '1bad',
    reason: `'Name' property for Simulink.VariantBank must be a valid C identifier that does not start with "rt".`,
  },
  {
    entry: 'vbN',
    column: 'variantConditions',
    from: "{'V == 1','V == 2'}",
    typed: 'V == 1',
    reason: "'VariantConditions' property for Simulink.VariantBank must be a cell array.",
  },
  {
    entry: 'vbN',
    column: 'allChoicesCoderInfo',
    from: 'ciA',
    typed: '_a',
    reason: "'AllChoicesCoderInfo' value '_a' must be a valid variable name corresponding to Simulink.VariantBankCoderInfo object.",
  },
  { entry: 'ciB', column: 'headerFile', from: '', typed: 'a.c', reason: "Change file extension 'c' to header file extension '.h' or '.hpp'." },
  {
    entry: 'ciB',
    column: 'qualifier',
    from: 'None',
    typed: 'Restrict',
    reason: "Error setting property 'Qualifier' of class 'VariantBankCoderInfo': There is no enumerated value named 'Restrict'.",
  },
];

/** A cell's text, editability, editor and options, without the keys a pooled cell carries as undefined. */
const cell = (c: any) => ({
  text: c?.text,
  editable: c?.editable,
  editor: c?.editor,
  ...(c?.options !== undefined ? { options: c.options } : {}),
});

/** The bank's or coder info's saveobj fields, as a JSON dictionary's text holds them. */
function fieldsOf(text: string, name: string): any {
  const entry = ((chunkOf(text).entries ?? []) as any[]).find((e) => e.name === name);
  assert.ok(entry, `the text holds the entry "${name}"`);
  return entry.value._elements[0]._custom_save._elements[0];
}

describe('A VariantBank and a VariantBankCoderInfo are edited in their own columns, and saved', () => {
  const VARIANTBANK = 'test-integration/fixtures/classes/variantbank_r2027a_text.sldd';
  let copies = 0;
  const rowNamed = (rows: any[], name: string): any => {
    const row = rows.find((r) => isEntryRow(r) && r.Name?.label === name);
    assert.ok(row, `the table has an entry row for "${name}"`);
    return row;
  };

  /** Open `bytes` (the fixture by default) under a name of its own, and wait for the first paint. */
  async function openIn(bytes?: Uint8Array) {
    const o = await open(VARIANTBANK, bytes, { as: `variantbank_${++copies}.sldd` });
    const failed = o.view.posts.find((p) => p.type === 'error');
    assert.ok(!failed, `the tab posted an error: ${failed?.message}`);
    const setRows = o.view.posts.find((p) => p.type === 'setRows');
    return { o, setRows, rows: setRows.rows as any[] };
  }

  /** The table offers `column`: the host lists it among the columns, under its label and picker group. */
  function assertOffered(setRows: any, column: string): void {
    const offered = OFFERED_COLUMNS.find(([c]) => c === column);
    assert.ok(offered, `${column} is one of this suite's columns`);
    const [, label, group] = offered;
    const { columns, columnLabels, columnGroups } = setRows;
    assert.ok(columns.includes(column), `the table offers a ${column} column (columns: ${columns.join(', ')})`);
    assert.strictEqual(columnLabels[column], label, `headed "${label}"`);
    assert.strictEqual(columnGroups[column], group, `in the picker's ${group} group`);
  }

  /**
   * One cell edit, exactly as the table sends it, and what came of it: the text before and after
   * it, the refusal if there was one, and the entry's repainted row. Waits for the edit to land or
   * be refused, and for its entry to be repainted.
   */
  async function edit(opened: Awaited<ReturnType<typeof openIn>>, entry: string, column: string, oldValue: string, newValue: string) {
    const { o } = opened;
    const before = o.text.text;
    const from = o.view.posts.length;
    const rowId = rowNamed(opened.rows, entry).ID;
    o.view.send({ type: 'edit', rowId, columnId: column, oldValue, newValue });
    const since = () => o.view.posts.slice(from);
    const repainted = () => since().some((p) => p.type === 'updateEntryRows' && p.entryRowId === rowId);
    await waitFor(
      'the edit to land or be refused, and its entry to be repainted',
      () => ((o.text.text !== before || since().some((p) => p.type === 'validationError')) && repainted()) || since().some((p) => p.type === 'error'),
    );
    const failed = since().find((p) => p.type === 'error');
    assert.ok(!failed, `the edit posted an error: ${failed?.message}`);
    const repaints = since().filter((p) => p.type === 'updateEntryRows' && p.entryRowId === rowId);
    const repaint = repaints.length ? repaints[repaints.length - 1].rows.find((r: any) => r.ID === rowId) : undefined;
    return { before, after: o.text.text, refusal: since().find((p) => p.type === 'validationError'), repaint };
  }

  it("JSON: the first paint offers the bank's and the coder info's columns, and the rows fill them", async () => {
    const opened = await openIn();
    for (const [column] of OFFERED_COLUMNS) assertOffered(opened.setRows, column);
    const vbN = rowNamed(opened.rows, 'vbN');
    for (const [column, text] of [
      ['bankName', 'bankA'],
      ['variantConditions', "{'V == 1','V == 2'}"],
      ['allChoicesCoderInfo', 'ciA'],
      ['activeChoiceCoderInfo', 'ciB'],
    ]) {
      assert.deepStrictEqual(cell(vbN[column]), { text, editable: true, editor: 'text' }, `vbN's ${column} cell`);
    }
    const ciA = rowNamed(opened.rows, 'ciA');
    assert.deepStrictEqual(cell(ciA.headerFile), { text: 'h.h', editable: true, editor: 'text' }, "ciA's Header File");
    assert.deepStrictEqual(cell(ciA.definitionFile), { text: 'd.c', editable: true, editor: 'text' }, "ciA's Definition File");
    assert.deepStrictEqual(cell(ciA.preStatement), { text: 'pre', editable: true, editor: 'textArea' }, "ciA's Pre Statement");
    assert.deepStrictEqual(cell(ciA.postStatement), { text: 'post', editable: true, editor: 'textArea' }, "ciA's Post Statement");
    assert.deepStrictEqual(
      cell(ciA.qualifier),
      { text: 'Const', editable: true, editor: 'select', options: ['None', 'Const', 'Volatile', 'ConstVolatile'] },
      "ciA's Qualifier, a choice of MATLAB's four",
    );
    // A coder info has no Description in MATLAB, and core says so on the row.
    assert.strictEqual(ciA._descriptionEditable, false, 'a coder info offers no Description');
    assert.notStrictEqual(vbN._descriptionEditable, false, 'a bank keeps its Description');
  });

  it('JSON: an edit of each kind commits, is shown as MATLAB spells it, and is saved', async () => {
    const opened = await openIn();
    const original = opened.o.text.text;
    for (const e of CELL_EDITS) {
      const mark = opened.o.view.posts.length;
      assertOffered(opened.setRows, e.column);
      assert.strictEqual(rowNamed(opened.rows, e.entry)[e.column]?.text, e.from, `${e.entry}'s ${e.column} reads as read`);
      const { before, after, refusal, repaint } = await edit(opened, e.entry, e.column, e.from, e.typed);
      assert.strictEqual(refusal, undefined, `${e.column}: accepted (refused: ${refusal?.reason})`);
      assert.notStrictEqual(after, before, `${e.column}: the edit reached the JSON dictionary`);
      assert.ok(repaint, `${e.column}: the entry was repainted`);
      assert.strictEqual(repaint[e.column]?.text, e.shown, `${e.column}: its cell shows ${JSON.stringify(e.shown)}`);
      assert.strictEqual(repaint[e.column]?.editable, true, `${e.column}: and is still editable`);
      assert.deepStrictEqual(fieldsOf(after, e.entry)[e.field], e.saved, `${e.column}: written into ${e.field}`);
      // The write's own change event only confirms the paint above, by painting the entry again; it
      // has to land here, not inside the next edit.
      await waitFor('the write’s own change event to repaint the entry', () =>
        opened.o.view.posts.slice(mark).filter((p) => p.type === 'updateEntryRows' || p.type === 'setRows').length >= 2,
      );
    }
    assert.ok(opened.o.text.dirty, 'the editor holds unsaved edits');

    // Nothing but the edited fields changed: every other field of the two edited entries, and every
    // other entry. (An edited entry's metadata takes a new modification stamp.)
    const edited = new Set(CELL_EDITS.map((e) => e.entry));
    const expected = chunkOf(original).entries as any[];
    for (const e of CELL_EDITS) expected.find((x) => x.name === e.entry).value._elements[0]._custom_save._elements[0][e.field] = e.saved;
    const now = chunkOf(opened.o.text.text).entries as any[];
    assert.deepStrictEqual(
      now.map((x) => x.name),
      expected.map((x) => x.name),
      'the same entries, in order',
    );
    for (const [i, x] of expected.entries()) {
      if (edited.has(x.name)) assert.deepStrictEqual(now[i].value, x.value, `${x.name}: only the edited fields changed`);
      else assert.deepStrictEqual(now[i], x, `${x.name}: unchanged`);
    }

    const saved = opened.o.save();
    assert.strictEqual(dec(saved), opened.o.text.text, 'the save wrote what the editor holds');

    // Read back through a fresh engine, from the saved file: every edit is there.
    const reread = await openIn(saved);
    for (const e of CELL_EDITS) {
      assert.strictEqual(rowNamed(reread.rows, e.entry)[e.column]?.text, e.shown, `${e.entry}'s ${e.column} reads back as saved`);
    }
    // And the fields no edit touched read back as MATLAB wrote them.
    assert.strictEqual(rowNamed(reread.rows, 'ciA').qualifier?.text, 'Const', "ciA's Qualifier is as read");
    assert.strictEqual(rowNamed(reread.rows, 'vbN').Description, 'desc A', "vbN's Description is as read");
  });

  it("JSON: an edit MATLAB refuses shows core's message and changes nothing", async () => {
    const opened = await openIn();
    const original = opened.o.text.text;
    for (const r of CELL_REFUSALS) {
      assertOffered(opened.setRows, r.column);
      const { after, refusal, repaint } = await edit(opened, r.entry, r.column, r.from, r.typed);
      assert.ok(refusal, `${r.column} ${JSON.stringify(r.typed)}: refused`);
      // Named as core names a refused edit of a row (editRefusalText).
      assert.strictEqual(refusal.reason, `Cannot edit "${r.entry}": ${r.reason}`, `${r.column}: in MATLAB's words, as core gives them`);
      assert.strictEqual(refusal.invalidValue, r.typed, `${r.column}: naming what was typed`);
      assert.strictEqual(refusal.previousValue, r.from, `${r.column}: and what the cell held`);
      assert.strictEqual(after, original, `${r.column}: the JSON dictionary is unchanged`);
      assert.ok(repaint, `${r.column}: the entry was repainted`);
      assert.strictEqual(repaint[r.column]?.text, r.from, `${r.column}: and its cell is back to what it held`);
    }
    assert.strictEqual(opened.o.text.dirty, false, 'the editor holds no unsaved change');
  });
});

// --- an object inside a value stream ------------------------------------------------------

const STREAM_BINARY = 'test/fixtures/sldd-stream-objects/stream_objects_binary.sldd';
const STREAM_TEXT = 'test/fixtures/sldd-stream-objects/stream_objects_text.sldd';
const BINARY_FIXTURE = 'stream_objects_binary.sldd';
const CHUNK_XML = 'data/chunk0.xml';

/** The entries MATLAB wrote as hex: each one's whole Value is a stream. */
const STREAMS = ['arr', 'cPh', 'nested', 'pSp', 'pStruct', 'sPh', 'sTh', 'shared', 'sigH'];

/**
 * What core takes an edit of, node by node, in every entry of the binary fixture: the stream
 * entries' objects, by the property the stream stores a value for and a rule writes, the parts of
 * the value that are no object, and the two XML entries, as they always edited. Every node not
 * listed takes none.
 */
const OFFERED: Record<string, string[]> = {
  arr: ['Name'],
  'arr.ps': ['Name'],
  'arr.ps(1)': ['Value', 'Description'],
  'arr.ps(2)': ['Value', 'Description'],
  'arr.sp': ['Name'],
  'arr.sp(1,2)': ['Value'],
  cPh: ['Name'],
  'cPh{1}': ['Value', 'Description'],
  'cPh{1}.Value': ['Value'],
  'cPh{1}.Value(1)': ['Value'],
  'cPh{1}.Value(2)': ['Value'],
  'cPh{1}.Value(3)': ['Value'],
  'cPh{2}(1,2)': ['Value'],
  nested: ['Name'],
  'nested.inner': ['Name'],
  'nested.inner.p': ['Name', 'Value', 'Description'],
  'nested.sp': ['Name'],
  'nested.sp(1,2)': ['Value'],
  pSp: ['Name', 'Min', 'Max', 'Description'],
  pStruct: ['Name'],
  'pStruct.p': ['Name'],
  'pStruct.p.Value.a': ['Name', 'Value'],
  'pStruct.p.Value.b': ['Name', 'Value'],
  'pStruct.p.Value.b(1)': ['Value'],
  'pStruct.p.Value.b(2)': ['Value'],
  'pStruct.sp': ['Name'],
  'pStruct.sp(1,2)': ['Value'],
  sPh: ['Name'],
  // And a Unit, which the stream writes as a dictionary writes one of an object outside one.
  'sPh.p': ['Name', 'Value', 'Min', 'Max', 'Unit', 'Description'],
  'sPh.q': ['Name', 'Value'],
  'sPh.sp': ['Name'],
  'sPh.sp(1,2)': ['Value'],
  sTh: ['Name'],
  'sTh.t': ['Name', 'Value', 'Max'],
  'sTh.sp': ['Name'],
  'sTh.sp(1,2)': ['Value'],
  shared: ['Name'],
  'shared.a': ['Name', 'Value', 'Description'],
  'shared.b': ['Name', 'Value', 'Description'],
  'shared.sp': ['Name'],
  'shared.sp(1,2)': ['Value'],
  sigH: ['Name'],
  'sigH.sig': ['Name', 'Min', 'Max', 'Unit', 'Description'],
  'sigH.sp': ['Name'],
  'sigH.sp(1,2)': ['Value'],
  plainP: ['Name', 'Value', 'Min', 'Max', 'Unit', 'Description', 'storageClass'],
  plainS: ['Name'],
  'plainS.x': ['Name', 'Value'],
};

/** The words core refuses a part of a stream with that no rule writes, as an encoded value always had them. */
const ENCODED_REASON = /is stored as an encoded MATLAB value that this editor can show but not write, so it is read-only\.$/;

/** One edit: at the node with MATLAB path `path`, the property `prop` set to `text`. */
type Edit = [path: string, prop: string, text: string];

const subtree = (n: any): any[] => [n, ...((n.children ?? []) as any[]).flatMap(subtree)];

/** The node at MATLAB path `path`, among the entries of a dictionary's Design Data. */
function nodeAt(root: any, path: string): any {
  for (const entry of root.getSection('design').children as any[]) {
    for (const node of subtree(entry)) if (node.matlabPath === path) return node;
  }
  assert.fail(`the dictionary holds a node at ${path}`);
}

/** A dictionary as a fresh core session reads it: what reopening the file shows. */
const reopened = (bytes: Uint8Array, filename: string): any => ingest(createSession(), bytes, { filename });

/** What a reopen shows of a node: its value and the properties an edit in a stream writes. */
const shown = (node: any): string => JSON.stringify([node.displayValue, node.Description, node.Min, node.Max, node.Unit, node.DataType]);

/** That each of `names` reads back from a save, row for row, as the editor showed it before the save. */
function assertReadsAsEdited(back: any, model: any, names: string[]): void {
  const rows = (root: any, name: string) => subtree(nodeAt(root, name)).map((n) => `${n.matlabPath} ${shown(n)}`);
  for (const name of names) assert.deepStrictEqual(rows(back, name), rows(model, name), `${name} reads back as the editor showed it`);
}

/** Core's own save of `bytes` after `edits`, made as a host makes them (setActive, then editProperty). */
function coreSaved(bytes: Uint8Array, filename: string, edits: Edit[]): Uint8Array {
  const session = createSession();
  const root: any = ingest(session, bytes, { filename });
  session.setActiveContext(root);
  for (const [path, prop, text] of edits) {
    const node = nodeAt(root, path);
    session.setActive(root, node);
    assert.strictEqual(session.editProperty(node.id, prop, text), true, `core takes ${path} ${prop} = ${text}`);
  }
  const out: any = session.serializeSource(root.name);
  return out.kind === 'binary' ? out.bytes : enc(out.text);
}

/** Core's refusal of one edit, on a fresh read of `bytes`. */
function coreRefusal(bytes: Uint8Array, filename: string, [path, prop, text]: Edit): string {
  const session = createSession();
  const root: any = ingest(session, bytes, { filename });
  session.setActiveContext(root);
  const node = nodeAt(root, path);
  session.setActive(root, node);
  const result: any = session.editProperty(node.id, prop, text);
  assert.ok(result && result.error, `core refuses ${path} ${prop} = ${text}`);
  return String(result.reason);
}

/** What the table offers an editor for in a row, as the webview decides it (dex-tree-table _cellEditTarget). */
function offeredBy(row: any): string[] {
  const keys: string[] = [];
  if (row.Name?.editable) keys.push('Name');
  if (row.Value && typeof row.Value === 'object' ? row.Value.editable : row._valueEditable) keys.push('Value');
  for (const [key, c] of Object.entries(row)) {
    if (key !== 'Name' && key !== 'Value' && c && typeof c === 'object' && (c as any).editable === true) keys.push(key);
  }
  if (row._descriptionEditable !== false) keys.push('Description');
  return keys.sort();
}

/** The newest row the table was sent for `nodeId`. */
function rowOf(posts: any[], nodeId: string): any {
  for (let i = posts.length - 1; i >= 0; i--) {
    const msg = posts[i];
    if (msg.type !== 'setRows' && msg.type !== 'updateEntryRows' && msg.type !== 'insertEntryRows') continue;
    const row = (msg.rows as any[]).find((r) => r.ID === nodeId);
    if (row) return row;
  }
  assert.fail(`the table was sent a row for ${nodeId}`);
}

const problemsIn = (posts: any[]) => posts.filter((m) => m.type === 'error' || m.type === 'validationError' || m.type === 'refused');

/** Every node of `root`'s stream entries and controls, each with what its newest row offers. */
function offeredInTable(root: any, posts: any[]): Record<string, string[]> {
  const got: Record<string, string[]> = {};
  for (const entry of root.getSection('design').children as any[]) {
    for (const node of subtree(entry)) {
      const keys = offeredBy(rowOf(posts, node.id));
      if (keys.length > 0) got[node.matlabPath] = keys;
    }
  }
  return got;
}

const sorted = (offered: Record<string, string[]>) => Object.fromEntries(Object.entries(offered).map(([k, v]) => [k, [...v].sort()]));

/**
 * Where each element of a stream ends: an 8-byte preamble, then each element's 8-byte tag (its
 * type, then its byte count) and its data padded to 8 bytes. A stream an edit can be written into
 * is two elements: the value, then the subsystem its objects ride in.
 */
function elementEnds(bytes: Uint8Array, count: number): number[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ends: number[] = [];
  let at = 8;
  while (ends.length < count && at + 8 <= bytes.length) {
    at += 8 + Math.ceil(view.getUint32(at + 4, true) / 8) * 8;
    ends.push(at);
  }
  return ends;
}

/** A text dictionary's cdata as bytes: six bits a character, offset by 0x20, a trailing part byte dropped. */
function sixBit(text: string): Uint8Array {
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < text.length; i++) {
    acc = ((acc << 6) | ((text.charCodeAt(i) - 0x20) & 0x3f)) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 0xff);
    }
  }
  return Uint8Array.from(out);
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** A chunk cut before each entry: the text before the first, and each entry's text up to the next, by name. */
function chunkEntries(xml: string): { head: string; entries: Map<string, string> } {
  const [head, ...parts] = xml.split(/(?=<Object Class="DD\.ENTRY">)/);
  const entries = new Map<string, string>();
  for (const part of parts) {
    const name = /<P Name="Name" Class="char">([^<]*)<\/P>/.exec(part);
    assert.ok(name, 'each entry of the chunk spells its name');
    entries.set(name![1], part);
  }
  return { head, entries };
}

const HEX_VALUE = /<P Name="Value" Class="([^"]*)" Encoding="hex" EncodedLength="(\d+)">([^<]*)<\/P>/;

/** An entry's hex Value: its tag's Class and EncodedLength, its text, and the bytes its digits spell. */
function hexValue(entry: string): { tag: string; cls: string; encodedLength: number; digits: number; bytes: Uint8Array } {
  const m = HEX_VALUE.exec(entry);
  assert.ok(m, `the entry holds a hex Value (${entry.slice(0, 160)})`);
  const digits = m![3].replace(/\s+/g, '');
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(digits.substr(2 * i, 2), 16);
  return { tag: m![0], cls: m![1], encodedLength: Number(m![2]), digits: digits.length, bytes };
}

/** The text dictionary's name, as core's tests name the one they make (probe_sldd_stream_objects). */
const PASTED_TEXT = 'orig_text.sldd';

/**
 * The text fixture with every hex entry of the binary one pasted in, as a host pastes one (the
 * entry's serialize(), deep-copied, read into Design Data) and as core then saves it: each one's
 * value the cdata of the stream the binary dictionary holds.
 */
function pastedText(binary: Uint8Array, text: Uint8Array): string {
  const session = createSession();
  const bin: any = ingest(session, binary, { filename: BINARY_FIXTURE });
  const txt: any = ingest(session, text, { filename: PASTED_TEXT });
  for (const entry of bin.getSection('design').children as any[]) {
    const record = entry.serialize();
    if (record?.value?._type === 'encoded') txt.getSection('design').parseEntry(JSON.parse(JSON.stringify(record)));
  }
  return (session.serializeSource(txt.name) as any).text;
}

/** The `{…}` span of the element of `entries` named `name`: the braces walked, those in strings skipped. */
function entrySpan(text: string, name: string): { start: number; end: number } {
  const at = text.indexOf(`"name": ${JSON.stringify(name)},`);
  assert.ok(at >= 0, `the document spells the entry "${name}"`);
  assert.strictEqual(text.indexOf(`"name": ${JSON.stringify(name)},`, at + 1), -1, `and spells it once`);
  const start = text.lastIndexOf('{', at);
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
    else if (ch === '}' && --depth === 0) return { start, end: i + 1 };
  }
  assert.fail(`the entry "${name}" closes`);
}

/** `text` with each entry of `names` cut out: what an edit of only those entries leaves alone. */
function outside(text: string, names: string[]): string {
  const spans = names.map((name) => ({ name, ...entrySpan(text, name) })).sort((a, b) => a.start - b.start);
  let out = '';
  let at = 0;
  for (const s of spans) {
    out += text.slice(at, s.start) + `<${s.name}>`;
    at = s.end;
  }
  return out + text.slice(at);
}

const entryOf = (text: string, name: string) => {
  const { start, end } = entrySpan(text, name);
  return JSON.parse(text.slice(start, end));
};

/** The stream a cdata value spells, checked to be a value and its subsystem, its text nothing more but MATLAB's NUL padding. */
function cdataStream(value: any, name: string): Uint8Array {
  assert.deepStrictEqual(Object.keys(value), ['_type', '_value'], `${name}'s value is cdata and nothing else`);
  assert.strictEqual(value._type, 'cdata');
  const bytes = sixBit(value._value);
  const ends = elementEnds(bytes, 2);
  assert.strictEqual(ends.length, 2, `${name}'s stream holds a value and its subsystem`);
  const stream = bytes.subarray(0, ends[1]);
  const body = value._value.replace(/\u0000+$/, '');
  assert.strictEqual(body.length, Math.ceil((stream.length * 8) / 6), `${name}'s text spells its stream and nothing more`);
  return stream;
}

/** What two engines of a case share, as the editors of one window share them. */
interface Window {
  registry?: DocumentRegistry;
  session?: ReturnType<typeof createSession>;
  registers?: Registers;
}

/** A window of one session and one set of registers, for a copy between the two engines. */
function oneWindow(): Required<Window> {
  const session = createSession();
  return { session, registry: new DocumentRegistry(session), registers: createRegisters() };
}

/** `original` open in the JSON engine as `copyName`, painted through a table across a channel. */
async function openText(copyName: string, original: string, window: Window = {}) {
  const o: Opened = await open(STREAM_TEXT, enc(original), { as: copyName, registry: window.registry, registers: window.registers });
  // Every change that replaced text, as onDidChangeTextDocument's with content changes.
  const changes: TextStoreChange[] = [];
  const stop = o.text.onChange((change) => void (change.changes.length > 0 && changes.push(change)));
  const view = o.view;
  const model = () => o.model();
  const paints = (from: number) => view.posts.slice(from).filter((m) => m.type === 'setRows' || m.type === 'updateEntryRows').length;

  /** One cell edit, as the table sends it, waited for until it is written and its echo painted, or refused; the posts it caused. */
  const edit = async ([path, prop, text]: Edit): Promise<any[]> => {
    const node = nodeAt(model(), path);
    const mark = view.posts.length;
    const version = o.text.version;
    view.send({ type: 'edit', rowId: node.id, columnId: prop, oldValue: '', newValue: text });
    await waitFor(`${path} ${prop} = ${text} to be written or refused`, () => o.text.version > version || problemsIn(view.posts.slice(mark)).length > 0);
    // A write paints the entry before it is made, and again from its own change; a refusal paints it back, once.
    await waitFor(`the repaint after ${path} ${prop} = ${text}`, () => paints(mark) >= (o.text.version > version ? 2 : 1));
    return view.posts.slice(mark);
  };

  /** Apply `patches` to the text as VS Code's undo or redo would, and wait for the table to repaint from it. */
  const apply = async (what: string, patches: { offset: number; length: number; text: string }[]) => {
    const mark = view.posts.length;
    const count = changes.length;
    assert.ok(await o.text.apply(patches), `the ${what} applied`);
    await waitFor(`the ${what} to land`, () => changes.length > count);
    await waitFor(`the repaint after the ${what}`, () => paints(mark) >= 1);
  };

  /** Save, and read back what the file now holds. */
  const save = (): string => dec(o.save());

  const close = () => {
    view.close();
    stop();
  };
  return { o, text: o.text, view, changes, model, edit, apply, save, close };
}

/** The binary fixture, open in the binary engine as `copyName` and painted through a table across a channel. */
async function openBinary(copyName: string, window: Window = {}) {
  const bytes = file(STREAM_BINARY);
  const b = await openBinaryEngine(STREAM_BINARY, bytes, { as: copyName, session: window.session, registers: window.registers });
  assert.ok(b.view.posts.some((m) => m.type === 'setRows'), 'the first paint sent the whole table');

  /** One cell edit, as the table sends it; the posts it caused (the binary engine answers at once). */
  const edit = ([path, prop, text]: Edit): any[] => {
    const node = nodeAt(b.model(), path);
    const mark = b.view.posts.length;
    b.view.send({ type: 'edit', rowId: node.id, columnId: prop, oldValue: '', newValue: text });
    return b.view.posts.slice(mark);
  };
  return { b, view: b.view, model: () => b.model(), chunkXml: () => b.engine.chunkXml, original: membersOf(bytes), edit, save: () => b.save(), close: () => b.view.close() };
}

/** The Value tag core's own save writes for `name` after `edits` of the binary fixture. */
function coreValueTag(bytes: Uint8Array, edits: Edit[], name: string): string {
  return hexValue(chunkEntries(dec(unzipSync(coreSaved(bytes, BINARY_FIXTURE, edits))[CHUNK_XML])).entries.get(name)!).tag;
}

describe('An object inside a text .sldd value stream (pasted cdata), edited in the text editor', () => {
  const binary = file(STREAM_BINARY);
  const original = pastedText(binary, file(STREAM_TEXT));

  beforeAll(() => {
    // What these cases need of it: each stream entry the cdata of the stream the binary one holds.
    const hex = chunkEntries(dec(unzipSync(binary)[CHUNK_XML])).entries;
    for (const name of STREAMS) {
      assert.ok(sameBytes(cdataStream(entryOf(original, name).value, name), hexValue(hex.get(name)!).bytes), `${name} is pasted as its stream`);
    }
  });

  /** Core's own save of the text dictionary after `edits`, as text. */
  const coreText = (edits: Edit[]) => dec(coreSaved(enc(original), PASTED_TEXT, edits));

  /** The stream core's own save writes for `name` after `edits` of the binary dictionary. */
  const coreBinaryStream = (edits: Edit[], name: string) =>
    hexValue(chunkEntries(dec(unzipSync(coreSaved(binary, BINARY_FIXTURE, edits))[CHUNK_XML])).entries.get(name)!).bytes;

  /** That `saved` is `original` with only `names` written, each its cdata alone, the stream the same edits write into the binary dictionary. */
  function assertOnlyCdataChanged(saved: string, edits: Edit[], names: string[]): void {
    assert.strictEqual(outside(saved, names), outside(original, names), 'every byte outside the edited entries is as it was');
    const core = coreText(edits);
    for (const name of names) {
      const was = entryOf(original, name);
      const now = entryOf(saved, name);
      assert.notStrictEqual(now.value._value, was.value._value, `${name} was written`);
      assert.strictEqual(now.name, was.name);
      const { lastmod: _a, ...meta } = now.metadata;
      const { lastmod: _b, ...metaWas } = was.metadata;
      assert.deepStrictEqual(meta, metaWas, `${name}'s metadata is as it was, but for its lastmod`);
      const stream = cdataStream(now.value, name);
      assert.ok(sameBytes(stream, coreBinaryStream(edits, name)), `${name}'s stream is the one the same edits write into the binary dictionary`);
      assert.deepStrictEqual(now.value, entryOf(core, name).value, `${name}'s cdata is the one core's own save writes`);
    }
  }

  it('the table offers an editor for each property core takes in a stream, and for nothing else there', async () => {
    const t = await openText('stream_txt_offered.sldd', original);
    try {
      // The stream entries only: the text fixture's own two entries are not the binary one's.
      const inStreams = (offered: Record<string, string[]>) =>
        Object.fromEntries(Object.entries(offered).filter(([path]) => STREAMS.includes(/^[A-Za-z]\w*/.exec(path)![0])));
      assert.deepStrictEqual(inStreams(sorted(offeredInTable(t.model(), t.view.posts))), inStreams(sorted(OFFERED)));
    } finally {
      t.close();
    }
  });

  it('a Value and a Description edited in cdata save as that cdata alone, the stream the binary dictionary would hold', async () => {
    const EDITS: Edit[] = [
      ['sPh.p', 'Value', '7'],
      ['sPh.p', 'Description', 'new description'],
      ['pSp', 'Description', 'sparse described'],
      ['shared.a', 'Value', '40'],
    ];
    const t = await openText('stream_txt_edit.sldd', original);
    try {
      for (const e of EDITS) assert.deepStrictEqual(problemsIn(await t.edit(e)), [], `${e.join(' ')} was taken`);
      assert.strictEqual(t.changes.length, EDITS.length, 'one write an edit');
      assert.strictEqual(rowOf(t.view.posts, nodeAt(t.model(), 'sPh.p').id).Value, '7');
      assert.strictEqual(rowOf(t.view.posts, nodeAt(t.model(), 'shared.b').id).Value, '40', 'the other field of the shared handle shows it');

      const saved = t.save();
      assertOnlyCdataChanged(saved, EDITS, ['sPh', 'pSp', 'shared']);
      const back = reopened(enc(saved), PASTED_TEXT);
      assert.deepStrictEqual([nodeAt(back, 'sPh.p').displayValue, nodeAt(back, 'sPh.p').Description], ['7', 'new description']);
      assert.strictEqual(nodeAt(back, 'pSp').Description, 'sparse described');
      assert.deepStrictEqual([nodeAt(back, 'shared.a').displayValue, nodeAt(back, 'shared.b').displayValue], ['40', '40']);
      assertReadsAsEdited(back, t.model(), ['sPh', 'pSp', 'shared']);
    } finally {
      t.close();
    }
  });

  it('undone, the document is the bytes it opened with; redone, the edit, and the entry takes the next one', async () => {
    const t = await openText('stream_txt_undo.sldd', original);
    try {
      assert.deepStrictEqual(problemsIn(await t.edit(['sPh.p', 'Value', '7'])), [], 'the edit was taken');
      assert.strictEqual(t.changes.length, 1, 'in one write');
      assert.strictEqual(t.changes[0].changes.length, 1, 'of one span');
      const written = t.changes[0].changes[0];
      const edited = t.text.text;

      // VS Code's undo of that write: what it replaced, written back over it.
      await t.apply('undo', [
        { offset: written.rangeOffset, length: written.text.length, text: original.slice(written.rangeOffset, written.rangeOffset + written.rangeLength) },
      ]);
      assert.strictEqual(t.text.text, original, 'the document is the bytes it opened with');
      assert.strictEqual(nodeAt(t.model(), 'sPh.p').displayValue, '5', 'the model is as read');
      assert.strictEqual(rowOf(t.view.posts, nodeAt(t.model(), 'sPh.p').id).Value, '5', 'and so is the row');

      // And its redo.
      await t.apply('redo', [{ offset: written.rangeOffset, length: written.rangeLength, text: written.text }]);
      assert.strictEqual(t.text.text, edited, 'the document is the edited bytes');
      assert.strictEqual(nodeAt(t.model(), 'sPh.p').displayValue, '7', 'the model holds the edit');
      assert.strictEqual(rowOf(t.view.posts, nodeAt(t.model(), 'sPh.p').id).Value, '7', 'and so does the row');

      // The entry the redo was read back into still holds its stream, and takes an edit into it.
      assert.deepStrictEqual(problemsIn(await t.edit(['sPh.p', 'Description', 'after redo'])), [], 'the edit after the redo was taken');
      const saved = t.save();
      assertOnlyCdataChanged(
        saved,
        [
          ['sPh.p', 'Value', '7'],
          ['sPh.p', 'Description', 'after redo'],
        ],
        ['sPh'],
      );
      const back = reopened(enc(saved), PASTED_TEXT);
      assert.deepStrictEqual([nodeAt(back, 'sPh.p').displayValue, nodeAt(back, 'sPh.p').Description], ['7', 'after redo']);
    } finally {
      t.close();
    }
  });

  it("what core refuses in a stream is refused by the table in core's words, and nothing is written", async () => {
    const REFUSED: [Edit, RegExp][] = [
      [['sPh.p', 'DataType', 'single'], ENCODED_REASON],
      [['sPh.q', 'Value', '"abc"'], /^Cannot edit "sPh": sPh\.q would hold a string, which a save does not write into its MAT stream\.$/],
      [['sTh.t', 'Description', 'x'], /^Cannot edit "sTh": sTh\.t\.Description is at its class default/],
      [['sPh.p', 'Min', '20'], /^Cannot edit "sPh": sPh\.p\.Min \(20\) would be greater than its Max \(10\)/],
    ];
    const t = await openText('stream_txt_refused.sldd', original);
    try {
      for (const [e, words] of REFUSED) {
        const posts = await t.edit(e);
        const refusals = posts.filter((m) => m.type === 'validationError');
        assert.strictEqual(refusals.length, 1, `${e.join(' ')}: one refusal (${JSON.stringify(posts.map((m) => m.type))})`);
        assert.match(refusals[0].reason, words, `${e.join(' ')}: in the words for it`);
        assert.strictEqual(refusals[0].reason, coreRefusal(enc(original), PASTED_TEXT, e), `${e.join(' ')}: core's own`);
      }
      assert.strictEqual(t.changes.length, 0, 'no write');
      assert.strictEqual(t.text.text, original);
      assert.strictEqual(t.text.dirty, false);
    } finally {
      t.close();
    }
  });
});

describe('An entry holding a value stream, copied between the editors, keeps its stream and takes edits there', () => {
  const binary = file(STREAM_BINARY);
  const text = dec(file(STREAM_TEXT));

  it('edited in the binary editor, pasted into the text editor and edited again: the cdata of the stream both edits write', async () => {
    const window = oneWindow();
    const b = await openBinary('stream_carry_bin.sldd', window);
    const t = await openText('stream_carry_txt.sldd', text, window);
    try {
      assert.deepStrictEqual(problemsIn(b.edit(['sPh.p', 'Description', 'carried'])), [], 'the edit in the binary editor was taken');
      b.view.send({ type: 'copy', rowIds: [nodeAt(b.model(), 'sPh').id] });
      const mark = t.view.posts.length;
      t.view.send({ type: 'paste', rowId: 'section:design' });
      await waitFor('the paste to be written or refused', () => t.changes.length > 0 || problemsIn(t.view.posts.slice(mark)).length > 0);
      assert.deepStrictEqual(problemsIn(t.view.posts.slice(mark)), [], 'the paste was taken');
      await waitFor('the pasted entry in the model', () => (t.model().getSection('design').children as any[]).some((e) => e.name === 'sPh'));

      const pasted = entryOf(t.text.text, 'sPh');
      const edited = hexValue(chunkEntries(b.chunkXml()).entries.get('sPh')!).bytes;
      assert.ok(sameBytes(cdataStream(pasted.value, 'sPh'), edited), 'pasted, its cdata is the stream the binary editor holds, edit and all');
      assert.strictEqual(rowOf(t.view.posts, nodeAt(t.model(), 'sPh.p').id)._valueEditable, true, 'and its Parameter offers its Value');

      assert.deepStrictEqual(problemsIn(await t.edit(['sPh.p', 'Value', '7'])), [], 'the edit in the text editor was taken');
      const saved = t.save();
      const both: Edit[] = [
        ['sPh.p', 'Description', 'carried'],
        ['sPh.p', 'Value', '7'],
      ];
      const twin = hexValue(chunkEntries(dec(unzipSync(coreSaved(binary, BINARY_FIXTURE, both))[CHUNK_XML])).entries.get('sPh')!).bytes;
      assert.ok(sameBytes(cdataStream(entryOf(saved, 'sPh').value, 'sPh'), twin), 'saved, the stream both edits write into the binary dictionary');
      const back = reopened(enc(saved), PASTED_TEXT);
      assert.deepStrictEqual([nodeAt(back, 'sPh.p').displayValue, nodeAt(back, 'sPh.p').Description], ['7', 'carried']);
      assert.strictEqual(outside(saved, ['sPh']).replace(/,\s*<sPh>/, ''), text, 'and the rest of the text dictionary is as it was');
    } finally {
      t.close();
      b.close();
    }
  });

  it('pasted from the text editor into the binary editor and edited: hex of the stream the edit writes, its EncodedLength exact', async () => {
    const window = oneWindow();
    const t = await openText('stream_carry_back_txt.sldd', pastedText(binary, enc(text)), window);
    const b = await openBinary('stream_carry_back_bin.sldd', window);
    try {
      // Into a binary dictionary that holds no sPh: the fixture's own, its sPh deleted.
      b.view.send({ type: 'delete', rowIds: [nodeAt(b.model(), 'sPh').id] });
      assert.ok(!chunkEntries(b.chunkXml()).entries.has('sPh'), 'the delete reached the document');
      t.view.send({ type: 'copy', rowIds: [nodeAt(t.model(), 'sPh').id] });
      const before: string = b.chunkXml();
      const mark = b.view.posts.length;
      b.view.send({ type: 'paste', rowId: 'section:design' });
      await waitFor('the paste to be written or refused', () => b.chunkXml() !== before || problemsIn(b.view.posts.slice(mark)).length > 0);
      assert.deepStrictEqual(problemsIn(b.view.posts.slice(mark)), [], 'the paste was taken');
      const pasted = hexValue(chunkEntries(b.chunkXml()).entries.get('sPh')!);
      const matlab = hexValue(chunkEntries(dec(b.original[CHUNK_XML])).entries.get('sPh')!);
      assert.strictEqual(pasted.tag, matlab.tag, 'pasted, its Value is the hex MATLAB wrote for it');

      assert.deepStrictEqual(problemsIn(b.edit(['sPh.p', 'Value', '7'])), [], 'the edit was taken');
      const bytes = b.save();
      const hex = hexValue(chunkEntries(dec(membersOf(bytes)[CHUNK_XML])).entries.get('sPh')!);
      assert.strictEqual(hex.encodedLength, hex.bytes.length, 'its EncodedLength is the byte count its hex spells');
      assert.strictEqual(hex.tag, coreValueTag(binary, [['sPh.p', 'Value', '7']], 'sPh'), "its stream is the one core's own save writes");
      const back = reopened(bytes, BINARY_FIXTURE);
      assert.strictEqual(nodeAt(back, 'sPh.p').displayValue, '7');
    } finally {
      b.close();
      t.close();
    }
  });
});

// --- a service function's rename ---------------------------------------------------------

const ARCH_TEXT = 'test/fixtures/arch.sldd';
const TEXT_FIXTURE = 'arch.sldd';
const CATALOG_KEY = '"__MW_TEXT_PART__/simulink/systemcomposer/interfaceDictionary"';

/** A textual dictionary's catalog part: from its key to the end of the text. */
function catalogPartOf(text: string): string {
  const at = text.indexOf(CATALOG_KEY);
  assert.ok(at > 0, 'the dictionary has a catalog part');
  return text.slice(at);
}

/** `text` with each `from` replaced by its `to`, checking first that `from` occurs exactly once. */
function replacedOnce(text: string, pairs: [from: string, to: string][]): string {
  return pairs.reduce((out, [from, to]) => {
    assert.strictEqual(out.split(from).length - 1, 1, `"${from}" occurs exactly once`);
    return out.replace(from, () => to);
  }, text);
}

/** One rename: of the entry `entry`, or of its function `fn`, to `to`. */
interface Step {
  entry: string;
  fn?: string;
  to: string;
}

const ONE_RENAME: Step[] = [{ entry: 'ServiceInterface', fn: 'f', to: 'compute' }];

/** The sequences a rename has to get right in an editor that writes as it goes. */
const SEQUENCES: [label: string, steps: Step[]][] = [
  [
    'the interface renamed first, then its function',
    [
      { entry: 'ServiceInterface', to: 'Svc' },
      { entry: 'Svc', fn: 'f', to: 'compute' },
    ],
  ],
  [
    'a chain',
    [
      { entry: 'ServiceInterface', fn: 'f', to: 'compute' },
      { entry: 'ServiceInterface', fn: 'compute', to: 'step' },
    ],
  ],
];

/** The node `step` names in a tree of sections, entries and their rows. */
function nodeOf(root: any, step: Step): any {
  const entry = (root.children as any[]).flatMap((s: any) => s.children as any[]).find((e: any) => e.name === step.entry);
  assert.ok(entry, `core's tree has an entry named ${step.entry}`);
  if (step.fn === undefined) return entry;
  const fn = (entry.children as any[]).find((c: any) => c.name === step.fn);
  assert.ok(fn, `${step.entry} has a function named ${step.fn}`);
  return fn;
}

/** Core's own save of `content` after `steps` ran on a fresh session's tree. */
function coreRenamed(content: Uint8Array, filename: string, steps: Step[]): any {
  const session = createSession();
  const src: any = ingest(session, content, { filename });
  steps.forEach((step) => assert.strictEqual(nodeOf(src, step).setProperty('Name', step.to), true, `core accepts ${step.fn ?? step.entry} -> ${step.to}`));
  const out = session.serializeSource(src.name);
  session.removeDataSource(src.name);
  assert.ok(out, 'core can write this dictionary');
  return out;
}

/** What core says when it refuses `step` on `content`. */
function coreRenameRefusal(content: Uint8Array, filename: string, step: Step): string {
  const session = createSession();
  const src: any = ingest(session, content, { filename });
  const node = nodeOf(src, step);
  const result = node.setProperty('Name', step.to);
  assert.ok(result && typeof result === 'object' && result.error, 'core refuses this rename too');
  // As every editor shows it, naming the row (editRefusalText).
  const said = editRefusalText(node, 'Name', String(result.reason));
  session.removeDataSource(src.name);
  return said;
}

const childrenOf = (rows: any[], id: string): any[] => rows.filter((r) => r.parent === id);

/** The row the table holds for `step`, from the newest paint that carries it. */
function renameRowOf(posts: any[], step: Step): any {
  for (let i = posts.length - 1; i >= 0; i--) {
    const msg = posts[i];
    if (msg.type !== 'setRows' && msg.type !== 'updateEntryRows') continue;
    const rows = msg.rows as any[];
    const entry = rows.find((r) => isEntryRow(r) && nameOf(r) === step.entry);
    if (!entry) continue;
    if (step.fn === undefined) return entry;
    const fn = childrenOf(rows, entry.ID).find((r) => nameOf(r) === step.fn);
    if (fn) return fn;
  }
  assert.fail(`the table was sent a row for ${step.fn ?? step.entry} under ${step.entry}`);
}

/** The `edit` message the table posts for a committed rename of `row`. */
const renameMessage = (row: any, to: string) => ({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: nameOf(row), newValue: to });

const refusalsIn = (posts: any[]) => posts.filter((m) => m.type === 'validationError');
const renameProblemsIn = (posts: any[]) => posts.filter((m) => m.type === 'error' || m.type === 'validationError');

/** The text fixture (rewritten by `edit` first), open in the JSON engine as `copyName`. */
async function openArch(copyName: string, edit: (text: string) => string = (text) => text) {
  const original = edit(dec(file(ARCH_TEXT)));
  const t = await openText(copyName, original);

  /** Send one rename and wait for it to be written or refused; the posts it caused. */
  const rename = async (step: Step): Promise<any[]> => {
    const row = renameRowOf(t.view.posts, step);
    const mark = t.view.posts.length;
    const version = t.text.version;
    t.view.send(renameMessage(row, step.to));
    await waitFor(`the rename to ${step.to} to be written or refused`, () => t.text.version > version || renameProblemsIn(t.view.posts.slice(mark)).length > 0);
    // A write paints the entry before it is made, and again from its own change: a rename that
    // carried the catalog is several ranges, which takes the wide repaint, and the next step reads
    // its row from that. A refusal paints the entry back, once.
    const paints = () => t.view.posts.slice(mark).filter((m) => m.type === 'setRows' || m.type === 'updateEntryRows').length;
    await waitFor(`the repaint after the rename to ${step.to}`, () => paints() >= (t.text.version > version ? 2 : 1));
    return t.view.posts.slice(mark);
  };
  return { ...t, original, rename };
}

describe('A service function rename through the text editor carries into the catalog', () => {
  it('one rename writes the function’s p_Name and p_FunctionPrototype, in the same write as the entry', async () => {
    const t = await openArch('fn_rename_text_one.sldd');
    try {
      const posts = await t.rename(ONE_RENAME[0]);
      assert.deepStrictEqual(renameProblemsIn(posts), [], 'the rename was accepted');

      assert.strictEqual(t.changes.length, 1, 'one write');
      assert.strictEqual(t.changes[0].changes.length, 3, 'holding the entry span, p_Name and p_FunctionPrototype');
      const text = t.text.text;
      assert.ok(text.includes('"Prototype": "y = compute(u,v)"'), 'the entry’s Prototype follows the Name');
      assert.strictEqual(
        catalogPartOf(text),
        replacedOnce(catalogPartOf(t.original), [
          ['"p_FunctionPrototype": "y = f(u,v)"', '"p_FunctionPrototype": "y = compute(u,v)"'],
          ['"p_Name": "f"', '"p_Name": "compute"'],
        ]),
        'the catalog moves at the function’s two sites and nowhere else',
      );

      const core = coreRenamed(enc(t.original), TEXT_FIXTURE, ONE_RENAME);
      assert.strictEqual(core.kind, 'text');
      const onDisk = t.save();
      assert.strictEqual(catalogPartOf(onDisk), catalogPartOf(core.text), 'the saved catalog is the one core’s own save writes');
    } finally {
      t.close();
    }
  });

  for (const [label, steps] of SEQUENCES) {
    it(`writes the catalog core’s own save writes: ${label}`, async () => {
      const t = await openArch(`fn_rename_text_${label.replace(/\W+/g, '_')}.sldd`);
      try {
        for (const step of steps) {
          assert.deepStrictEqual(renameProblemsIn(await t.rename(step)), [], `${step.fn ?? step.entry} -> ${step.to} was accepted`);
        }
        assert.strictEqual(t.changes.length, steps.length, 'one write per rename');
        const core = coreRenamed(enc(t.original), TEXT_FIXTURE, steps);
        assert.strictEqual(catalogPartOf(t.text.text), catalogPartOf(core.text), 'the catalog is the one core’s own save writes');
      } finally {
        t.close();
      }
    });
  }

  it('a function the catalog does not list leaves the catalog untouched', async () => {
    // `f2` is in the entry and not in the catalog, so the rename is the entry span alone.
    const step: Step = { entry: 'ServiceInterface', fn: 'f2', to: 'h' };
    const t = await openArch('fn_rename_text_unlisted.sldd');
    try {
      assert.deepStrictEqual(renameProblemsIn(await t.rename(step)), [], 'the rename was accepted');
      assert.strictEqual(t.changes.length, 1, 'one write');
      assert.strictEqual(t.changes[0].changes.length, 1, 'of the entry span alone');
      const text = t.text.text;
      assert.ok(text.includes('"Prototype": "y = h(u,v)"'), 'the entry was renamed');
      assert.strictEqual(catalogPartOf(text), catalogPartOf(t.original), 'and the catalog is as read');
      assert.strictEqual(catalogPartOf(text), catalogPartOf(coreRenamed(enc(t.original), TEXT_FIXTURE, [step]).text), 'as core’s own save leaves it');
    } finally {
      t.close();
    }
  });

  it('a rename the Prototype cannot follow is refused with core’s reason, and writes nothing', async () => {
    const t = await openArch('fn_rename_text_refused.sldd', (text) => replacedOnce(text, [['"Prototype": "y = f(u,v)"', '"Prototype": "y = step(u,v)"']]));
    try {
      const posts = await t.rename(ONE_RENAME[0]);
      const refusals = refusalsIn(posts);
      assert.strictEqual(refusals.length, 1, `one validationError (${JSON.stringify(posts.map((m) => m.type))})`);
      const reason = coreRenameRefusal(enc(t.original), TEXT_FIXTURE, ONE_RENAME[0]);
      assert.ok(reason.includes("'f' cannot be renamed: its Prototype 'y = step(u,v)'"), reason);
      assert.strictEqual(refusals[0].reason, reason, 'carrying core’s own reason');
      assert.strictEqual(t.changes.length, 0, 'no write');
      assert.strictEqual(t.text.text, t.original);
      assert.strictEqual(t.text.dirty, false);
    } finally {
      t.close();
    }
  });

  it('undo is one step: the inverse of the one write brings back the original bytes', async () => {
    const t = await openArch('fn_rename_text_undo.sldd');
    try {
      assert.deepStrictEqual(renameProblemsIn(await t.rename(ONE_RENAME[0])), [], 'the rename was accepted');
      const core = coreRenamed(enc(t.original), TEXT_FIXTURE, ONE_RENAME);
      assert.strictEqual(catalogPartOf(t.text.text), catalogPartOf(core.text), 'the write carried the catalog');
      assert.strictEqual(t.changes.length, 1, 'in one write, so one step on the undo stack');

      // Each change's range is in the text before the write; in the text after it, a range starts
      // where it did plus what the changes before it grew or shrank by.
      const written = [...t.changes[0].changes].sort((a, b) => a.rangeOffset - b.rangeOffset);
      const inverse: { offset: number; length: number; text: string }[] = [];
      let shift = 0;
      for (const c of written) {
        const start = c.rangeOffset + shift;
        inverse.push({ offset: start, length: c.text.length, text: t.original.slice(c.rangeOffset, c.rangeOffset + c.rangeLength) });
        shift += c.text.length - c.rangeLength;
      }
      assert.ok(await t.text.apply(inverse), 'the undo applied');
      await waitFor('the undo to land', () => t.changes.length === 2);
      assert.strictEqual(t.text.text, t.original, 'the document is the bytes it opened with');
    } finally {
      t.close();
    }
  });
});
