// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/readOnlyCellEdit.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/descriptionApplies.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/sparseNoGrid.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/typeLinkBinary.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/variantBankEdit.test.ts at c73da3c
//
// A cell of a compressed-binary dictionary as its table edits it, run against view's binary
// dictionary engine through the messages its table sends: a read-only cell refused, a Description
// shown and saved only where the object has one, a sparse array offered no grid, a Data Type link
// that names its document, and a VariantBank's and a VariantBankCoderInfo's own columns. Each
// suite's compressed-binary half is here; its text-dictionary half waits for the JSON engine (C3),
// and its MAT-file half and its read-only model view are the other engines' and views'. Following a
// link (handleNavigate) is the extension's: what view keeps of it is the rule that reads a link's
// target back to its document (srcIdToUriString).
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { binaryEditSrcId } from '../../src/host/index.js';
import { buildRows, srcIdToUriString } from '../../src/model/index.js';
import { entryOf, entryRow, open, PARAMS, readSldd, waitFor } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('An edit of a read-only cell is refused, with its reason, and changes nothing', () => {
  /** What a refused edit leaves on the view: the validation dialog, then a repaint of that row. */
  const refusal = (posts: any[]) => {
    const at = posts.findIndex((p) => p.type === 'validationError');
    assert.ok(at >= 0, 'the edit is answered with a validation error');
    return { error: posts[at], after: posts.slice(at + 1) };
  };

  it('in a binary dictionary: no edit is pushed', async () => {
    const b = await open(PARAMS, undefined, { as: 'ro.sldd' });
    const row = entryRow(b.view.posts, 'gravity');
    const chunk = b.engine.chunkXml;
    b.view.posts.length = 0;
    b.view.send({ type: 'edit', rowId: row.ID, columnId: 'Kind', oldValue: row.Kind, newValue: 'Numeric Type' });
    const { error } = refusal(b.view.posts);
    assert.match(error.reason, /^Cannot edit "gravity": the Kind of gravity is read-only here\./);
    assert.ok(b.view.posts.some((p) => p.type === 'updateEntryRows'), 'the row painted again');
    assert.strictEqual(b.events.length, 0, 'no edit reached the stack');
    assert.strictEqual(b.engine.chunkXml, chunk);
    assert.strictEqual(b.index.dirty, false);
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

  it('in a binary dictionary', async () => {
    const b = await open(PARAMS, undefined, { as: 'desc.sldd' });
    assertDescriptionColumn(b.view.posts);
    const [scalarD, lut, gravity] = ['scalarD', 'MyLUT', 'gravity'].map((n) => entryRow(b.view.posts, n));

    for (const [name, row] of [
      ['scalarD', scalarD],
      ['MyLUT', lut],
    ] as const) {
      assert.strictEqual(row._descriptionApplies, false, `${name} has no Description`);
      const chunk = b.engine.chunkXml;
      b.view.posts.length = 0;
      editDescription(b.view, row, 'typed anyway');
      const error = await refusalIn(b.view.posts);
      assert.match(error.reason, REFUSAL[name]);
      assert.strictEqual(b.events.length, 0, `${name}: no edit reached the stack`);
      assert.strictEqual(b.engine.chunkXml, chunk);
      assert.strictEqual(b.index.dirty, false);
    }

    assert.strictEqual(gravity._descriptionApplies, true, 'a Simulink.Parameter has a Description');
    b.view.posts.length = 0;
    editDescription(b.view, gravity, NEW_TEXT);
    await waitFor('the edit pushed', () => b.events.length > 0);
    assert.ok(!b.view.posts.some((p) => p.type === 'validationError'), 'the edit was not refused');
    const saved = readSldd(b.save(), (dict) => entryOf(dict, 'gravity').toRow().Description);
    assert.strictEqual(saved, NEW_TEXT, 'the Description survives a fresh read of the saved file');
  });
});

// 2-D, within the grid's size cap, and sparse: class and shape alone would admit each. Paths are by
// Name label from the entry down.
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
  const SPARSE_BINARY = 'test-integration/fixtures/sparse/sparse_binary.sldd';

  /** The rows of the first whole-table paint. */
  const paint = (posts: any[]): any[] => {
    const failed = posts.find((p) => p.type === 'error');
    assert.ok(!failed, `the tab posted an error: ${failed?.message}`);
    return posts.find((p) => p.type === 'setRows').rows;
  };

  it('sparse_binary.sldd: no sparse row carries a glyph, and a click on one fetches no grid', async () => {
    const o = await open(SPARSE_BINARY);
    const rows = rowsByPath(paint(o.view.posts));
    for (const path of SPARSE) assert.ok(rows.get(path), `the file has a row for ${path}`);
    // EXACTLY the dense twins carry one: no sparse row, and nothing else either.
    const stamped = [...rows]
      .filter(([, r]) => r._matrix)
      .map(([p]) => p)
      .sort();
    assert.deepStrictEqual(stamped, Object.keys(DENSE).sort(), 'the rows with a grid glyph');
    // A fetch for a sparse row answers with the reason and no cells, from the same gate the glyph
    // comes from. The dense twin asked the same way is the control.
    const control = await fetchMatrix(o.view, rows.get('dDiag').ID);
    assert.strictEqual(control.matrix?.cells?.length, 100, 'dDiag fetched by its row ID');
    for (const path of ['spDiag', 'pSp']) {
      const answer = await fetchMatrix(o.view, rows.get(path).ID);
      assert.strictEqual(answer.matrix, undefined, `${path} fetched no grid`);
      assert.strictEqual(answer.message, 'This value could not be read as a table.');
    }
  });

  it('sparse_binary.sldd: every dense twin carries its glyph, and a click on it fetches every cell', async () => {
    const o = await open(SPARSE_BINARY);
    const rows = rowsByPath(paint(o.view.posts));
    for (const [path, cells] of Object.entries(DENSE)) {
      const row = rows.get(path);
      assert.ok(row?._matrix, `${path} carries a grid glyph`);
      const answer = await fetchMatrix(o.view, row._matrix.nodeId);
      assert.strictEqual(answer.matrix?.cells?.length, cells, `${path} fetched its ${cells} cells`);
    }
  });
});

// The editable binary dictionary prefixes its srcId (`binedit:` + the uri) so its model cannot
// collide with a read-only view's of the same file. Core then builds `MyAlias@binedit:file:///…`,
// which is not a uri, and has to be read back to this file.
describe('a Data Type link out of an editable binary .sldd', () => {
  const TYPELINK = 'test-integration/fixtures/typelink/typelink_binary.sldd';
  const URI = 'file:///work/typelink/typelink_binary.sldd';

  type Cell = { prefix?: string; text: string; linkTarget?: string } | string;

  /** Painted the way the engine paints it: registration happens on paint. */
  async function rows(): Promise<{ all: Record<string, any>[]; srcId: string }> {
    const o = await open(TYPELINK, undefined, { uri: URI });
    const node = o.model();
    assert.ok(node, 'the paint registered the document as a source');
    return { all: buildRows(node as any) as Record<string, any>[], srcId: o.engine.srcId };
  }

  const dataTypeOf = (all: Record<string, any>[], name: string): Cell => {
    const row = all.find((r) => r.Name?.label === name);
    assert.ok(row, `the fixture holds an entry named ${name}`);
    return row!.DataType as Cell;
  };

  it('the target names this document by its PREFIXED srcId', async () => {
    const { all, srcId } = await rows();
    assert.strictEqual(srcId, binaryEditSrcId(URI), 'the document registered its prefixed srcId');
    const cell = dataTypeOf(all, 'Kp');
    assert.ok(typeof cell === 'object' && cell !== null, 'Kp Data Type came through as a link cell');
    assert.strictEqual((cell as { text: string }).text, 'MyAlias');
    // What core actually emits, prefix and all: the string the click carries.
    assert.strictEqual((cell as { linkTarget?: string }).linkTarget, `MyAlias@${srcId}`);
  });

  it('the target reads back to this file, not to a binedit: uri', async () => {
    // The extension follows the link (handleNavigate); what reads it back to a document is view's
    // srcIdToUriString, the pair of the prefix.
    const { all } = await rows();
    const cell = dataTypeOf(all, 'Kp') as { linkTarget: string };
    const src = cell.linkTarget.slice(cell.linkTarget.indexOf('@') + 1);
    assert.strictEqual(srcIdToUriString(src), URI, 'the link round-tripped to its own document');
  });

  it('a built-in and a non-type name stay plain text here too', async () => {
    const { all } = await rows();
    assert.strictEqual(dataTypeOf(all, 'Gain'), 'double');
    assert.strictEqual(dataTypeOf(all, 'Borrowed'), 'Kp');
  });
});

/** The columns a bank's and a coder info's fields are shown in: the id, the label its header reads, and the picker group it is under. */
const OFFERED: Array<[string, string, string]> = [
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

/** One edit of each kind, as the table sends it: the entry, the column, the cell's text before it, what was typed, and what the cell shows after it. */
interface Edit {
  entry: string;
  column: string;
  from: string;
  typed: string;
  shown: string;
}

const EDITS: Edit[] = [
  // Text cells.
  { entry: 'vbN', column: 'bankName', from: 'bankA', typed: 'bankB', shown: 'bankB' },
  { entry: 'vbN', column: 'allChoicesCoderInfo', from: 'ciA', typed: 'ciB', shown: 'ciB' },
  { entry: 'vbN', column: 'activeChoiceCoderInfo', from: 'ciB', typed: 'ciA', shown: 'ciA' },
  { entry: 'ciB', column: 'headerFile', from: '', typed: 'h.h', shown: 'h.h' },
  { entry: 'ciB', column: 'definitionFile', from: '', typed: 'd.c', shown: 'd.c' },
  // A cell literal, shown in MATLAB's spelling.
  { entry: 'vbN', column: 'variantConditions', from: "{'V == 1','V == 2'}", typed: "{'V==1','V == 3'}", shown: "{'V == 1','V == 3'}" },
  // The two textArea cells, one with a line break.
  { entry: 'ciB', column: 'preStatement', from: '', typed: 'pre\nline two', shown: 'pre\nline two' },
  { entry: 'ciB', column: 'postStatement', from: '', typed: 'post', shown: 'post' },
  // The select cell, in MATLAB's spelling of the choice.
  { entry: 'ciB', column: 'qualifier', from: 'None', typed: 'Volatile', shown: 'Volatile' },
];

/** Edits MATLAB refuses, and its words for each (core's, relayed as they are). */
const REFUSED: Array<{ entry: string; column: string; from: string; typed: string; reason: string }> = [
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

describe('A VariantBank and a VariantBankCoderInfo are edited in their own columns, and saved', () => {
  const VARIANTBANK = 'test-integration/fixtures/classes/variantbank_r2027a_binary.sldd';
  let copies = 0;
  const isEntryRow = (row: any): boolean => String(row.parent ?? '').startsWith('section:');
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
    const offered = OFFERED.find(([c]) => c === column);
    assert.ok(offered, `${column} is one of this suite's columns`);
    const [, label, group] = offered;
    const { columns, columnLabels, columnGroups } = setRows;
    assert.ok(columns.includes(column), `the table offers a ${column} column (columns: ${columns.join(', ')})`);
    assert.strictEqual(columnLabels[column], label, `headed "${label}"`);
    assert.strictEqual(columnGroups[column], group, `in the picker's ${group} group`);
  }

  /** One cell edit, as the table sends it, and what came of it. */
  function edit(opened: Awaited<ReturnType<typeof openIn>>, entry: string, column: string, oldValue: string, newValue: string) {
    const { o } = opened;
    const before = o.engine.chunkXml;
    const from = o.view.posts.length;
    const rowId = rowNamed(opened.rows, entry).ID;
    o.view.send({ type: 'edit', rowId, columnId: column, oldValue, newValue });
    const since = o.view.posts.slice(from);
    const failed = since.find((p) => p.type === 'error');
    assert.ok(!failed, `the edit posted an error: ${failed?.message}`);
    const repaints = since.filter((p) => p.type === 'updateEntryRows' && p.entryRowId === rowId);
    const repaint = repaints.length ? repaints[repaints.length - 1].rows.find((r: any) => r.ID === rowId) : undefined;
    return { before, after: o.engine.chunkXml, refusal: since.find((p) => p.type === 'validationError'), repaint };
  }

  it("binary: the first paint offers the bank's and the coder info's columns, and the rows fill them", async () => {
    const opened = await openIn();
    for (const [column] of OFFERED) assertOffered(opened.setRows, column);
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

  it('binary: an edit of each kind commits, is shown as MATLAB spells it, and is saved', async () => {
    const opened = await openIn();
    for (const e of EDITS) {
      assertOffered(opened.setRows, e.column);
      assert.strictEqual(rowNamed(opened.rows, e.entry)[e.column]?.text, e.from, `${e.entry}'s ${e.column} reads as read`);
      const { before, after, refusal, repaint } = edit(opened, e.entry, e.column, e.from, e.typed);
      assert.strictEqual(refusal, undefined, `${e.column}: accepted (refused: ${refusal?.reason})`);
      assert.notStrictEqual(after, before, `${e.column}: the edit reached the binary dictionary`);
      assert.ok(repaint, `${e.column}: the entry was repainted`);
      assert.strictEqual(repaint[e.column]?.text, e.shown, `${e.column}: its cell shows ${JSON.stringify(e.shown)}`);
      assert.strictEqual(repaint[e.column]?.editable, true, `${e.column}: and is still editable`);
    }
    assert.ok(opened.o.index.dirty, 'the editor holds unsaved edits');

    // Read back through a fresh engine, from the saved file: every edit is there.
    const reread = await openIn(opened.o.save());
    for (const e of EDITS) {
      assert.strictEqual(rowNamed(reread.rows, e.entry)[e.column]?.text, e.shown, `${e.entry}'s ${e.column} reads back as saved`);
    }
    // And the fields no edit touched read back as MATLAB wrote them.
    assert.strictEqual(rowNamed(reread.rows, 'ciA').qualifier?.text, 'Const', "ciA's Qualifier is as read");
    assert.strictEqual(rowNamed(reread.rows, 'vbN').Description, 'desc A', "vbN's Description is as read");
  });

  it("binary: an edit MATLAB refuses shows core's message and changes nothing", async () => {
    const opened = await openIn();
    const original = opened.o.engine.chunkXml;
    for (const r of REFUSED) {
      assertOffered(opened.setRows, r.column);
      const { after, refusal, repaint } = edit(opened, r.entry, r.column, r.from, r.typed);
      assert.ok(refusal, `${r.column} ${JSON.stringify(r.typed)}: refused`);
      // Named as core names a refused edit of a row (editRefusalText).
      assert.strictEqual(refusal.reason, `Cannot edit "${r.entry}": ${r.reason}`, `${r.column}: in MATLAB's words, as core gives them`);
      assert.strictEqual(refusal.invalidValue, r.typed, `${r.column}: naming what was typed`);
      assert.strictEqual(refusal.previousValue, r.from, `${r.column}: and what the cell held`);
      assert.strictEqual(after, original, `${r.column}: the binary dictionary is unchanged`);
      assert.ok(repaint, `${r.column}: the entry was repainted`);
      assert.strictEqual(repaint[r.column]?.text, r.from, `${r.column}: and its cell is back to what it held`);
    }
    assert.strictEqual(opened.o.index.dirty, false, 'the editor holds no unsaved change');
  });
});
