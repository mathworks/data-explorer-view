// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/refusedPasteDrop.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/multiPasteSelection.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/crossDocumentMove.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/crossSectionDrag.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/mptPasteDrop.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/matClipboard.test.ts at c73da3c.
// Ported from data-explorer-vscode test/clipMarkRoundTrip.test.ts at c73da3c.
// Ported from data-explorer-vscode test/multiPasteAtomicity.test.ts at c73da3c.
//
// The binary dictionary editor's clipboard and row drags, run against view's binary dictionary
// engine, every document of a case on one session and one set of registers, as a window's are: the
// binary half of each of those suites. The JSON halves wait for the JSON engine (C3), and so does
// every case whose other document was the JSON editor itself; where the other document was a JSON
// dictionary only to be somewhere else to paste into, it is a second binary dictionary here (the
// edit bash's values_binary.sldd, MATLAB-written, so a paste can land in it). The two unit tests'
// cases are the binary editor's half of what they pin, through the engine: the clip-mark key read
// back by its own repaint, and a refused multi-paste through its own paste.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { describe, it } from 'vitest';
import { createRegisters, dropDecision, type ClipboardItem } from '../../src/model/index.js';
import { buildContextMenuItems } from '../../src/widgets/tree-table/menuItems.js';
import { emptyMat, fixture, open as openMat, namesOf, readMat, variableOf, type Opened as MatOpened } from '../matEngine/harness.js';
import {
  chunkNames,
  chunkOf,
  entryOf,
  entryRow,
  errorsIn,
  file,
  isEntryRow,
  nameOf,
  open,
  PARAMS,
  readSldd,
  shownCells,
  tableOf,
  viewOf,
  waitFor,
  type Opened,
} from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The edit bash's MATLAB-written binary dictionary: a paste can land in it, and it holds no gravity. */
const VALUES = 'test-integration/fixtures/editbash/values_binary.sldd';

const quiet = () => new Promise((resolve) => setTimeout(resolve, 20));

/** A window: one session and one set of registers for every document a case opens. */
function windowOf() {
  const registers = createRegisters();
  const session = createSession();
  return {
    registers,
    session,
    bin: (as: string, rel = PARAMS, bytes = file(rel)) => open(rel, bytes, { as, registers, session }),
    mat: (as: string, bytes: Uint8Array) => openMat(as, bytes, { as, registers, session }),
  };
}

const entriesOf = (model: any): any[] => ((model?.children ?? []) as any[]).flatMap((s: any) => s.children ?? []);

/** The rows of a table's last whole paint. */
const paintedRows = (posts: any[]): any[] => posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];

/** An entry row by name, of `rows`. */
function rowOf(rows: any[], name: string): any {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
}

/** Send a gesture to a binary dictionary's view and wait for its edit, or its word. */
async function onBinary(tab: Opened, msg: any, what = msg.type): Promise<void> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
}

/** Send a gesture to a MAT-file's view and wait for it to be answered: an edit pushed, or a word. */
async function onMat(tab: MatOpened, msg: any, what = msg.type): Promise<void> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
}

/** A MAT-file's variable row by name, as the table holds it now. */
function variableRow(posts: any[], name: string): any {
  const row = tableOf(posts).find((r) => r.parent == null && nameOf(r) === name);
  assert.ok(row, `the table has a row for "${name}"`);
  return row;
}

/** Only `columns` of each row of `cells`. */
function columnsOf(cells: Record<string, Record<string, string>>, columns: string[]): Record<string, Record<string, string>> {
  return Object.fromEntries(
    Object.entries(cells).map(([at, row]) => [at, Object.fromEntries(columns.filter((c) => c in row).map((c) => [c, row[c]]))]),
  );
}

// What a value IS, as either format's table shows it: the columns both formats' rows carry.
const VALUE_COLUMNS = ['Name', 'Value', 'Class', 'DataType', 'Min', 'Max', 'Unit', 'Description', 'dimensions', 'complexity'];

/** The binary dictionary's live entry `name`. */
const binaryEntry = (b: Opened, name: string): any => entryOf(b.model(), name);

/** `bytes` (a zip) with its data part rewritten by `edit`, the rest of the zip as MATLAB wrote it. */
function withChunk(bytes: Uint8Array, edit: (xml: string) => string): Uint8Array {
  const parts = unzipSync(bytes);
  parts['data/chunk0.xml'] = strToU8(edit(strFromU8(parts['data/chunk0.xml'])));
  return zipSync(parts);
}

/** `text` with the first `from` after `marker` replaced by `to`. */
function replaceAfter(text: string, marker: string, from: string, to: string): string {
  const at = text.indexOf(marker);
  assert.ok(at >= 0, `the fixture spells ${marker}`);
  const hit = text.indexOf(from, at);
  assert.ok(hit >= 0, `the fixture spells ${from} after ${marker}`);
  return text.slice(0, hit) + to + text.slice(hit + from.length);
}

// --- refusedPasteDrop.test.ts --------------------------------------------------------------------

const ENTRY = 'mat2x2';
const REFUSAL = 'Value of "mat2x2" would write 134217728 bytes no data backs';
// What a drag start says of an entry that will not serialize, in core's words (copyRefusal): the
// stub's error is an Error named MatWriteError rather than core's class, so core words it as a
// writing that failed, quoting it.
const DRAG_REFUSAL = `Cannot copy "${ENTRY}": it could not be written (${REFUSAL}). Nothing was copied.`;

/**
 * Make `method` throw a MatWriteError for every node `when` picks, on the prototype in `node`'s chain
 * that owns it. Returns the undo, which every caller runs in a `finally`: the prototype is shared by
 * every test in the run.
 */
function refuse(node: any, method: string, when: (self: any) => boolean): () => void {
  let owner = node;
  while (owner && !Object.prototype.hasOwnProperty.call(owner, method)) owner = Object.getPrototypeOf(owner);
  assert.ok(owner, `a prototype of ${node?.name} owns ${method}`);
  const original = owner[method];
  owner[method] = function (this: any, ...args: unknown[]) {
    if (when(this)) {
      const err = new Error(REFUSAL);
      err.name = 'MatWriteError';
      throw err;
    }
    return original.apply(this, args);
  };
  return () => {
    owner[method] = original;
  };
}

describe('A refused drag or drop on a compressed-binary .sldd', () => {
  it('a drag that cannot start says why, and holds nothing', async () => {
    const w = windowOf();
    const b = await w.bin('refused_drag_start_bin.sldd');
    const source = entryRow(b.view.posts, ENTRY);
    const restore = refuse(
      entriesOf(b.model()).find((e) => e.name === ENTRY),
      'serialize',
      (self) => self.name === ENTRY,
    );
    try {
      b.view.posts.length = 0;
      b.view.send({ type: 'dragStart', rowIds: [source.ID] });
      await waitFor('the drag start to be refused', () => errorsIn(b.view.posts).length > 0);
    } finally {
      restore();
    }
    assert.deepStrictEqual(errorsIn(b.view.posts), [DRAG_REFUSAL], "the refusal is reported, in core's words");
    assert.strictEqual(w.registers.getDrag(), null, 'and the drag register is empty');
  });

  it('a refused drop ends the drag', async () => {
    const w = windowOf();
    const b = await w.bin('refused_drop_bin.sldd');
    const source = entryRow(b.view.posts, ENTRY);
    const before = b.engine.chunkXml;
    b.view.send({ type: 'dragStart', rowIds: [source.ID] });
    await waitFor('the drag to start', () => w.registers.getDrag() !== null);
    // A real refusal: a matrix dropped into Architectural Data, which makes it a Constant.
    b.view.posts.length = 0;
    b.view.send({ type: 'drop', rowId: 'section:arch', mode: 'copy' });
    await waitFor('the refusal', () => errorsIn(b.view.posts).length > 0);
    await waitFor('the refused drop to end the drag', () => w.registers.getDrag() === null);
    assert.match(errorsIn(b.view.posts)[0], /must be scalar and numeric/);
    assert.strictEqual(b.engine.chunkXml, before, 'the document is untouched');
    assert.strictEqual(w.registers.getDrag(), null, 'and the drag is over');
  });
});

// --- multiPasteSelection.test.ts -----------------------------------------------------------------

/** The ids the last `selectRows` the host sent asks for. */
function selectionAsked(posts: any[]): string[] {
  const asked = posts.filter((m) => m.type === 'selectRows').pop();
  assert.ok(asked, 'the host named a selection for the paste to land on');
  assert.ok(Array.isArray(asked.rowIds), '`selectRows` carries an ARRAY of ids');
  return asked.rowIds as string[];
}

/** Every row id the host painted into the table after the gesture (paste rows arrive here). */
function paintedRowIds(posts: any[]): Set<string> {
  const ids = new Set<string>();
  for (const msg of posts) {
    if (msg.type === 'insertEntryRows' || msg.type === 'updateEntryRows' || msg.type === 'setRows') {
      for (const row of (msg.rows ?? []) as any[]) ids.add(row.ID);
    }
  }
  return ids;
}

const BINARY_ENTRIES = ['MyBus', 'MyAlias', 'MyEnum'];

/** Copy `names` and paste them back into the section they came from: the gesture that duplicates. */
async function pasteIntoBinary(as: string, names: string[]) {
  const w = windowOf();
  const b = await w.bin(as);
  const rows = paintedRows(b.view.posts);
  const before = b.names();
  const sources = names.map((name) => rowOf(rows, name));
  b.view.send({ type: 'copy', rowIds: sources.map((r) => r.ID) });
  b.view.posts.length = 0;
  b.view.send({ type: 'paste', rowId: sources[0].ID });
  await waitFor('the paste to be applied or refused', () => b.view.posts.some((m) => m.type === 'error' || m.type === 'selectRows'));
  assert.ok(!b.view.posts.some((m) => m.type === 'error'), `no error was reported (${JSON.stringify(errorsIn(b.view.posts))})`);
  return { posts: b.view.posts, rows, before, after: b.names(), xml: b.engine.chunkXml, edits: b.events.length };
}

describe('Pasting several entries, on a compressed-binary .sldd', () => {
  it('selects EVERY entry it added, as one edit', async () => {
    const run = await pasteIntoBinary('binary_paste_many.sldd', BINARY_ENTRIES);
    const asked = selectionAsked(run.posts);
    assert.strictEqual(asked.length, 3, `all three pasted entries are selected (got ${JSON.stringify(asked)})`);
    assert.deepStrictEqual(
      asked.map((id) => id.slice(id.lastIndexOf('/') + 1)),
      BINARY_ENTRIES.map((n) => `${n}1`),
      'and they are the copies, in paste order',
    );
    assert.strictEqual(run.edits, 1, 'the whole paste is one undoable edit');
    // The 40 entries the file already had, plus three copies.
    assert.strictEqual((run.xml.match(/Class="DD\.ENTRY"/g) ?? []).length, 43, 'and the file gained three entries');
    for (const name of BINARY_ENTRIES) assert.ok(run.xml.includes(`>${name}1</P>`), `the copy "${name}1" was written out`);
  });

  // The pairing case holds this count to the JSON editor's, which waits for the JSON engine: here
  // the binary half of it.
  it('the two formats agree on how many rows a paste selects (the binary half)', async () => {
    const binary = await pasteIntoBinary('binary_paste_pair.sldd', ['MyBus', 'MyAlias']);
    assert.strictEqual(selectionAsked(binary.posts).length, 2, 'two entries pasted, two rows selected');
  });

  // The JSON suite's two other cases are about the gesture, which this format makes too.
  it('every id it names is a row the table was actually given', async () => {
    const run = await pasteIntoBinary('binary_paste_ids.sldd', ['MyBus', 'MyAlias']);
    const painted = paintedRowIds(run.posts);
    for (const id of selectionAsked(run.posts)) assert.ok(painted.has(id), `the table holds a row for the selected id ${id}`);
    const sourceIds = new Set(run.rows.map((r: any) => r.ID));
    for (const id of selectionAsked(run.posts)) assert.ok(!sourceIds.has(id), `${id} is a row the paste created, not the one it copied`);
  });

  it('a single-entry paste still names exactly that one', async () => {
    const run = await pasteIntoBinary('binary_paste_one.sldd', ['MyBus']);
    const added = run.after.filter((n) => !run.before.includes(n));
    const asked = selectionAsked(run.posts);
    assert.strictEqual(asked.length, 1, `one entry pasted, one row selected (got ${JSON.stringify(asked)})`);
    assert.deepStrictEqual([asked[0].slice(asked[0].lastIndexOf('/') + 1)], added, 'and it is the copy');
  });
});

// --- crossDocumentMove.test.ts -------------------------------------------------------------------

const MOVED = 'gravity';

/**
 * Cut the entry in `source`, optionally close the source's table, then paste into another binary
 * dictionary. Answers what the target's view was told and what the two documents hold afterwards.
 */
async function cutAndPaste(w: ReturnType<typeof windowOf>, source: Opened, closeSourceFirst: boolean, targetName: string) {
  source.view.send({ type: 'cut', rowIds: [entryRow(source.view.posts, MOVED).ID] });
  assert.strictEqual(w.registers.getClipboard()?.mode, 'cut', 'the cut is on the clipboard');
  if (closeSourceFirst) source.view.close();
  const target = await w.bin(targetName, VALUES);
  const edits = target.events.length;
  target.view.posts.length = 0;
  target.view.send({ type: 'paste', rowId: 'section:design' });
  await waitFor('the paste to land or be refused', () => target.events.length > edits || errorsIn(target.view.posts).length > 0);
  // The source delete runs after the paste's write, and its report after that.
  await waitFor('the move to finish', () => w.registers.getClipboard() === null);
  await quiet();
  return {
    errors: errorsIn(target.view.posts),
    targetHas: target.names().includes(MOVED),
    sourceHolds: source.engine.chunkXml.includes(`>${MOVED}</P>`),
  };
}

describe('A cut from a compressed-binary .sldd, pasted into another dictionary', () => {
  it('removes the original when its tab is still open, and says nothing', async () => {
    const w = windowOf();
    const source = await w.bin('xdoc_src_open_bin.sldd');
    const run = await cutAndPaste(w, source, false, 'xdoc_dst_open_bin.sldd');
    assert.deepStrictEqual(run.errors, [], 'nothing to report');
    assert.ok(run.targetHas, `${MOVED} landed in the target`);
    assert.ok(!run.sourceHolds, 'and left the source');
  });

  it('says the original could not be removed when its tab was closed after the cut, and loses nothing', async () => {
    const w = windowOf();
    const source = await w.bin('xdoc_src_closed_bin.sldd');
    const run = await cutAndPaste(w, source, true, 'xdoc_dst_closed_bin.sldd');
    assert.deepStrictEqual(
      run.errors,
      ['Pasted here, but the original in xdoc_src_closed_bin.sldd could not be removed: its table is no longer open. Remove it there by hand.'],
      'the target view says what is left to do',
    );
    assert.ok(run.targetHas, `${MOVED} landed in the target`);
    assert.ok(run.sourceHolds, 'and is still in the source: two copies, neither lost');
  });
});

// --- crossSectionDrag.test.ts --------------------------------------------------------------------

const DESIGN_ENTRY = 'MyAlias';
const ARCH_ENTRY = 'MyBus';

/** Entry name -> IsDerived, from a binary .sldd's data/chunk0.xml. */
function derivedOfXml(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const obj of xml.split('<Object Class="DD.ENTRY">').slice(1)) {
    const name = /<P Name="Name" Class="char">([^<]*)<\/P>/.exec(obj)?.[1];
    const derived = /<P Name="IsDerived" Class="char">([^<]*)<\/P>/.exec(obj)?.[1] ?? '0';
    assert.ok(name, 'every DD.ENTRY spells a Name');
    out.set(name!, derived);
  }
  return out;
}

/** What the table would show for a drop of the in-flight drag onto `sectionName`. */
function predicted(posts: any[], painted: any, sectionName: string) {
  const drag = posts.filter((m) => m.type === 'dragState').pop();
  assert.ok(drag?.descriptor, 'the engine broadcast a drag descriptor');
  const rule = (painted.rules as any[]).find((r) => r.sectionName === sectionName);
  assert.ok(rule, `the dictionary has a ${sectionName} section`);
  return dropDecision(drag.descriptor, { docUri: painted.docUri, ...rule }, 'move');
}

describe('A drag across two sections, on a compressed-binary .sldd', () => {
  it('is predicted as a move, and the drop moves the design entry into arch', async () => {
    // The chunk is the only part changed, so the zip is otherwise MATLAB's.
    const bytes = withChunk(file(PARAMS), (xml) =>
      replaceAfter(xml, `<P Name="Name" Class="char">${ARCH_ENTRY}</P>`, '<P Name="IsDerived" Class="char">0</P>', '<P Name="IsDerived" Class="char">1</P>'),
    );
    const w = windowOf();
    const b = await w.bin('cross_section_drag_bin.sldd', PARAMS, bytes);
    const rows = paintedRows(b.view.posts);
    const painted = b.view.posts.filter((m) => m.type === 'sectionRules').pop();
    const derived = () => derivedOfXml(b.engine.chunkXml);
    const before = derived();
    assert.strictEqual(before.get(DESIGN_ENTRY), '0', `${DESIGN_ENTRY} starts in Design Data`);
    assert.strictEqual(before.get(ARCH_ENTRY), '1', `${ARCH_ENTRY} starts in Architectural Data`);

    b.view.posts.length = 0;
    b.view.send({ type: 'dragStart', rowIds: [rowOf(rows, DESIGN_ENTRY).ID, rowOf(rows, ARCH_ENTRY).ID] });
    await waitFor('the drag descriptor', () => b.view.posts.some((m) => m.type === 'dragState' && m.descriptor));

    // The prediction, from what the engine sent. Onto arch it was a silent no-op.
    const ontoArch = predicted(b.view.posts, painted, 'arch');
    assert.strictEqual(ontoArch.noop, false, 'onto arch: not refused as a no-op');
    assert.strictEqual(ontoArch.canDrop, true, 'onto arch: allowed');
    const ontoDesign = predicted(b.view.posts, painted, 'design');
    assert.strictEqual(ontoDesign.noop, false, 'onto design: not a no-op either');
    assert.strictEqual(ontoDesign.canDrop, true, 'onto design: allowed');

    // The drop the table now lets through.
    b.view.posts.length = 0;
    b.view.send({ type: 'drop', rowId: 'section:arch', mode: 'move' });
    await waitFor('the drop to be applied or refused', () => errorsIn(b.view.posts).length > 0 || derived().get(DESIGN_ENTRY) === '1');
    await quiet();
    assert.deepStrictEqual(errorsIn(b.view.posts), [], 'the drop is applied');

    const after = derived();
    assert.strictEqual(after.get(DESIGN_ENTRY), '1', `${DESIGN_ENTRY} moved into Architectural Data`);
    assert.strictEqual(after.get(ARCH_ENTRY), '1', `${ARCH_ENTRY} is still in Architectural Data`);
    assert.deepStrictEqual([...after.keys()].sort(), [...before.keys()].sort(), 'every entry keeps its own name: nothing renamed, added or lost');
    for (const [name, flag] of before) {
      if (name !== DESIGN_ENTRY) assert.strictEqual(after.get(name), flag, `${name} stays where it was`);
    }
  });
});

// --- mptPasteDrop.test.ts ------------------------------------------------------------------------

const PARAM = 'gravity';
const SIGNAL = 'sig1';
const REFUSED_IN_ARCH = 'Simulink Parameter cannot be in Architectural Data';

/** `name class isderived` for each mpt entry of a binary .sldd's data/chunk0.xml, sorted. */
function mptOfXml(xml: string): string[] {
  const out: string[] = [];
  for (const obj of xml.split('<Object Class="DD.ENTRY">').slice(1)) {
    const name = /<P Name="Name" Class="char">([^<]*)<\/P>/.exec(obj)?.[1];
    const derived = /<P Name="IsDerived" Class="char">([^<]*)<\/P>/.exec(obj)?.[1] ?? '0';
    const cls = /<Element Class="([^"]*)">/.exec(obj)?.[1] ?? '';
    if (cls.startsWith('mpt.')) out.push(`${name} ${cls} ${derived}`);
  }
  return out.sort();
}

describe('A paste and a drop of an mpt entry, on a compressed-binary .sldd', () => {
  it('are offered and applied in Design Data, and refused in Architectural Data', async () => {
    // The real MATLAB-written file, with only the chunk changed.
    const bytes = withChunk(file(PARAMS), (xml) => {
      let out = replaceAfter(xml, `<P Name="Name" Class="char">${PARAM}</P>`, '<Element Class="Simulink.Parameter">', '<Element Class="mpt.Parameter">');
      out = replaceAfter(out, `<P Name="Name" Class="char">${SIGNAL}</P>`, '<Element Class="Simulink.Signal">', '<Element Class="mpt.Signal">');
      return replaceAfter(out, `<P Name="Name" Class="char">${ARCH_ENTRY}</P>`, '<P Name="IsDerived" Class="char">0</P>', '<P Name="IsDerived" Class="char">1</P>');
    });
    const w = windowOf();
    const b = await w.bin('mpt_paste_drop_bin.sldd', PARAMS, bytes);
    const rows = paintedRows(b.view.posts);
    const painted = b.view.posts.filter((m) => m.type === 'sectionRules').pop();
    const snapshot = () => b.engine.chunkXml;
    const mpt = () => mptOfXml(b.engine.chunkXml);
    const ruleOf = (sectionName: string): any => {
      const rule = (painted.rules as any[]).find((r) => r.sectionName === sectionName);
      assert.ok(rule, `the dictionary has a ${sectionName} section`);
      return rule;
    };
    /** The Paste item the table would show over `row`: table-main's menuFor, on the posted facts. */
    const pasteItemOver = (clip: any, row: any, sectionName: string): any => {
      const rule = ruleOf(sectionName);
      const items = buildContextMenuItems({
        rows,
        selectedRowIds: [row.ID],
        anchorRowId: row.ID,
        clipboard: { canPaste: clip.canPaste, mode: clip.mode, items: clip.items },
        editable: true,
        hasTextView: true,
        pasteTarget: { sectionLabel: rule.sectionLabel, isDerived: rule.isDerived, allowedTypes: rule.allowedTypes },
      } as any);
      const paste = items.find((i) => i.id === 'paste');
      assert.ok(paste, 'the menu has a Paste item');
      return paste;
    };
    /** Send `msg`, and wait for the engine to refuse it or to change the document. */
    const answered = async (msg: any): Promise<void> => {
      const before = snapshot();
      b.view.posts.length = 0;
      b.view.send(msg);
      await waitFor(`an answer to ${msg.type}`, () => errorsIn(b.view.posts).length > 0 || snapshot() !== before);
      await quiet();
    };

    const param = rowOf(rows, PARAM);
    const signal = rowOf(rows, SIGNAL);
    const archRow = rowOf(rows, ARCH_ENTRY);
    assert.deepStrictEqual(mpt(), [`${PARAM} mpt.Parameter 0`, `${SIGNAL} mpt.Signal 0`], 'the two mpt entries');

    // The rules the engine posted say what a paste admits: the mpt classes into design only.
    for (const cls of ['mpt.Parameter', 'mpt.Signal']) {
      assert.ok(ruleOf('design').allowedTypes.includes(cls), `Design Data's posted rule admits ${cls}`);
      assert.ok(!ruleOf('arch').allowedTypes.includes(cls), `Architectural Data's posted rule does not admit ${cls}`);
    }

    // Copy both. The Paste item over a design row is offered, and over an arch row it says why not.
    b.view.posts.length = 0;
    b.view.send({ type: 'copy', rowIds: [param.ID, signal.ID] });
    await waitFor('the clipboard state', () => b.view.posts.some((m) => m.type === 'clipboardState' && m.items?.length === 2));
    const clip = b.view.posts.filter((m) => m.type === 'clipboardState').pop();
    const overDesign = pasteItemOver(clip, param, 'design');
    assert.ok(!overDesign.disabled, `Paste over a design row is offered (reason: ${overDesign.reason})`);
    const overArch = pasteItemOver(clip, archRow, 'arch');
    assert.strictEqual(overArch.disabled, true, 'Paste over an arch row is not offered');
    assert.strictEqual(overArch.reason, REFUSED_IN_ARCH);

    // The paste the menu now offers lands, and each copy keeps its class.
    await answered({ type: 'paste', rowId: param.ID });
    assert.deepStrictEqual(errorsIn(b.view.posts), [], 'the paste into design is applied');
    const afterPaste = mpt();
    assert.strictEqual(afterPaste.length, 4, `two mpt copies were added: ${afterPaste.join(', ')}`);
    assert.deepStrictEqual(
      afterPaste.map((e) => e.split(' ').slice(1).join(' ')).sort(),
      ['mpt.Parameter 0', 'mpt.Parameter 0', 'mpt.Signal 0', 'mpt.Signal 0'],
      'both copies are in design, with their classes',
    );

    // The engine still refuses the same paste over the arch row, which the menu does not offer.
    const beforeArch = snapshot();
    await answered({ type: 'paste', rowId: archRow.ID });
    const refusal = errorsIn(b.view.posts);
    assert.strictEqual(refusal.length, 1, `one refusal: ${refusal.join(' | ')}`);
    assert.ok(refusal[0].includes('A "mpt.Parameter" entry is not allowed in Architectural Data.'), `the refusal names the class and the section: ${refusal[0]}`);
    assert.strictEqual(snapshot(), beforeArch, 'and the document is untouched');

    // A drag of the same two rows: the cursor allows a copy onto design, and refuses arch.
    b.view.posts.length = 0;
    b.view.send({ type: 'dragStart', rowIds: [param.ID, signal.ID] });
    await waitFor('the drag descriptor', () => b.view.posts.some((m) => m.type === 'dragState' && m.descriptor));
    const drag = b.view.posts.filter((m) => m.type === 'dragState').pop().descriptor;
    const ontoDesign = dropDecision(drag, { docUri: painted.docUri, ...ruleOf('design') }, 'copy');
    assert.strictEqual(ontoDesign.canDrop, true, `a copy onto design is allowed (${ontoDesign.tooltip})`);
    const ontoArch = dropDecision(drag, { docUri: painted.docUri, ...ruleOf('arch') }, 'copy');
    assert.strictEqual(ontoArch.canDrop, false, 'a copy onto arch is refused');
    assert.strictEqual(ontoArch.tooltip, REFUSED_IN_ARCH);

    // And the drop the cursor allows lands too.
    await answered({ type: 'drop', rowId: 'section:design', mode: 'copy' });
    assert.deepStrictEqual(errorsIn(b.view.posts), [], 'the drop onto design is applied');
    const afterDrop = mpt();
    assert.strictEqual(afterDrop.length, 6, `two more mpt copies were added: ${afterDrop.join(', ')}`);
    assert.ok(afterDrop.every((e) => e.endsWith(' 0')), 'every copy is in design');
  });
});

// --- matClipboard.test.ts: between a MAT-file and a binary dictionary ----------------------------

describe('MAT-file clipboard and row drags, between a MAT-file and a binary dictionary', () => {
  // The dictionary half of the case: a binary dictionary's cut made while its rows are on their
  // way (the open answered, its rows not yet delivered) is marked once they land, and takes the
  // MAT-file's copy mark away.
  it('a copy made while the rows are on their way is marked once they land, in a MAT-file and a dictionary', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', fixture('pv_basic.mat'));
    const x = variableRow(m.view.posts, 'x').ID;
    m.view.posts.length = 0;
    m.view.send({ type: 'ready' });
    m.view.send({ type: 'copy', rowIds: [x] });
    await waitFor('the repaint', () => m.view.posts.some((p) => p.type === 'setRows'));
    await waitFor('the mark on the copied row', () => tableOf(m.view.posts).find((r) => r.ID === x)?.Name?.clipboardMode === 'copy');

    const b = await w.bin('marks.sldd');
    const gravity = entryRow(b.view.posts, 'gravity').ID;
    b.view.posts.length = 0;
    b.view.send({ type: 'ready' });
    b.view.send({ type: 'cut', rowIds: [gravity] });
    await waitFor('the repaint', () => b.view.posts.some((p) => p.type === 'setRows'));
    await waitFor('the mark on the cut entry', () => tableOf(b.view.posts).find((r) => r.ID === gravity)?.Name?.clipboardMode === 'cut');
    await waitFor("the MAT-file's copy unmarked", () => tableOf(m.view.posts).find((r) => r.ID === x)?.Name?.clipboardMode === undefined);
  });

  it('a MAT-file copy and cut pasted into a binary dictionary', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', fixture('pv_basic.mat'));
    const b = await w.bin('target.sldd');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'p').ID] });
    await onBinary(b, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(b.view.posts), []);
    assert.ok(b.names().includes('p'), 'the copy landed');
    assert.deepStrictEqual(columnsOf(shownCells(binaryEntry(b, 'p')), VALUE_COLUMNS), columnsOf(shownCells(variableOf(m, 'p')), VALUE_COLUMNS));
    assert.strictEqual(m.events.length, 0, 'the copy changed nothing in the MAT-file');

    m.view.send({ type: 'cut', rowIds: [variableRow(m.view.posts, 'str').ID] });
    await onBinary(b, { type: 'paste', rowId: 'section:design' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the original taken out', () => !namesOf(m).includes('str'));
    assert.deepStrictEqual(errorsIn(b.view.posts), []);
    assert.ok(b.names().includes('str'));
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'x']);
    assert.strictEqual(m.events.length, 1);
    assert.strictEqual(b.events.length, 2, 'two pastes, two edits in the dictionary');
  });

  it('binary dictionary entries pasted into a MAT-file: a plain value, a struct, a Parameter with its properties, a Bus with its elements', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', fixture('pv_basic.mat'));
    const d = await w.bin('source.sldd');
    const names = ['charStr', 'myStruct', 'gravity', 'MyBus'];
    d.view.send({ type: 'copy', rowIds: names.map((n) => entryRow(d.view.posts, n).ID) });
    await onMat(m, { type: 'paste', rowId: variableRow(m.view.posts, 'q').ID });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x', ...names]);
    assert.strictEqual(m.events.length, 1, 'ONE edit for the four');
    for (const name of names) {
      assert.deepStrictEqual(
        columnsOf(shownCells(variableOf(m, name)), VALUE_COLUMNS),
        columnsOf(shownCells(binaryEntry(d, name)), VALUE_COLUMNS),
        `${name} is what was copied`,
      );
    }
    const gravity = shownCells(variableOf(m, 'gravity'))['.'];
    assert.deepStrictEqual([gravity.Value, gravity.Min, gravity.Max, gravity.Unit, gravity.Description], ['9.81', '0', '100', 'm/s^2', 'gravity accel']);
    assert.deepStrictEqual(Object.values(shownCells(variableOf(m, 'MyBus'))).map((r) => r.Name), ['MyBus', 'x', 'y'], 'the Bus came with its elements');

    // A cut: the entry leaves the dictionary once it has landed here.
    const fresh = await w.mat('fresh.mat', emptyMat());
    d.view.send({ type: 'cut', rowIds: [entryRow(d.view.posts, 'gravity').ID] });
    await onMat(fresh, { type: 'paste', rowId: '' });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    await waitFor('the original taken out of the dictionary', () => !d.names().includes('gravity'));
    assert.deepStrictEqual(errorsIn(fresh.view.posts), []);
    assert.deepStrictEqual(namesOf(fresh), ['gravity']);
  });

  // The binary half: a function handle travels (a text dictionary holds one as its literal), and
  // the binary dictionary's paste refuses it as it writes the entry's XML, in the words core's
  // copyRefusal(id, 'xml') gives.
  it("a function handle copied out of a MAT-file is refused by a binary dictionary in core's words", async () => {
    const w = windowOf();
    const m = await w.mat('handles.mat', fixture('nested_handles.mat'));
    const b = await w.bin('bin.sldd');
    const xmlRefusal = (w.session as any).copyRefusal(variableOf(m, 's_fh').id, 'xml');
    assert.ok(xmlRefusal, 'core says a binary dictionary cannot hold it');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 's_fh').ID] });
    assert.ok(w.registers.getClipboard(), 'it can be copied');
    const chunk = b.engine.chunkXml;
    await onBinary(b, { type: 'paste', rowId: 'section:design' });
    const [said] = errorsIn(b.view.posts);
    assert.ok(said, 'the binary dictionary refused it');
    assert.ok(
      said.includes(xmlRefusal.replace(/^Cannot copy "s_fh" into a binary dictionary: /, '').replace(/ Nothing was copied\.$/, '').replace(/\.$/, '')),
      `in the words core's copyRefusal gives (${said})`,
    );
    assert.strictEqual(b.engine.chunkXml, chunk, 'and wrote nothing');
    assert.strictEqual(b.events.length, 0);
  });

  it('row drags between a MAT-file and a binary dictionary, both ways, moving and copying', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', fixture('pv_basic.mat'));
    const b = await w.bin('bin.sldd');
    const bGravity = entryRow(b.view.posts, 'gravity').ID;

    // MAT-file -> binary dictionary, moved: the original leaves as the MAT-file's own edit.
    m.view.send({ type: 'dragStart', rowIds: [variableRow(m.view.posts, 'x').ID] });
    await onBinary(b, { type: 'drop', rowId: 'section:design', mode: 'move' });
    await waitFor('the original moved out', () => !namesOf(m).includes('x'));
    assert.ok(b.names().includes('x'));
    assert.strictEqual(m.events.length, 1);
    await waitFor('the drop to end the drag', () => w.registers.getDrag() === null);

    // MAT-file -> binary dictionary, copied.
    m.view.send({ type: 'dragStart', rowIds: [variableRow(m.view.posts, 'str').ID] });
    await onBinary(b, { type: 'drop', rowId: 'section:design', mode: 'copy' });
    assert.ok(b.names().includes('str'));
    assert.ok(namesOf(m).includes('str'), 'a copy leaves its original');

    // Binary dictionary -> MAT-file, moved: the entry leaves the dictionary's chunk.
    b.view.send({ type: 'dragStart', rowIds: [bGravity] });
    await onMat(m, { type: 'drop', rowId: variableRow(m.view.posts, 'p').ID, mode: 'move' });
    await waitFor('the entry moved out of the binary dictionary', () => !b.names().includes('gravity'));
    assert.ok(namesOf(m).includes('gravity'));
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    await waitFor('the drop to end the drag', () => w.registers.getDrag() === null);
  });

  // The binary half: a MAT-file's variables pasted into a binary dictionary, saved, and read back.
  it('saved after a cross-format paste, and read back: the values are what was copied', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', fixture('pv_basic.mat'));
    const b = await w.bin('bin.sldd');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'x').ID, variableRow(m.view.posts, 'p').ID] });
    await onBinary(b, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(b.view.posts), []);
    const saved = b.save();
    for (const name of ['x', 'p']) {
      const want = columnsOf(shownCells(variableOf(m, name)), VALUE_COLUMNS);
      assert.deepStrictEqual(readSldd(saved, (d) => columnsOf(shownCells(entryOf(d, name)), VALUE_COLUMNS)), want, `${name} in the saved binary dictionary`);
    }
    // The MAT-file's own values read back as they were copied, whatever the dictionary wrote.
    assert.deepStrictEqual(readMat(m.original, (mat) => mat.children.map((v: any) => v.name)), ['p', 'q', 'str', 'x']);
  });
});

// --- clipMarkRoundTrip.test.ts: the clip-mark key read back by the engine's own repaint ----------

describe('the clip-mark key reads back as the entry it marks, through the engine', () => {
  for (const rel of [PARAMS, 'test/fixtures/arch_binary.sldd']) {
    it(`every copyable row of ${rel.slice(rel.lastIndexOf('/') + 1)}: a cut marks exactly its entry, and the next cut moves the mark`, async () => {
      const w = windowOf();
      const b = await w.bin('clipmark.sldd', rel);
      const rows = paintedRows(b.view.posts);
      const entryOfRow = (row: any): string => {
        let at = row;
        while (at && !String(at.parent ?? '').startsWith('section:')) at = rows.find((r) => r.ID === at.parent);
        return at.ID;
      };
      let checked = 0;
      for (const row of rows) {
        if (String(row.ID).startsWith('section:') || !row._canCopy) continue;
        b.view.send({ type: 'cut', rowIds: [row.ID] });
        assert.strictEqual(w.registers.getClipboard()?.items.length, 1, `row ${row.ID} cuts one entry`);
        const marked = tableOf(b.view.posts)
          .filter((r) => r.Name && typeof r.Name === 'object' && r.Name.clipboardMode === 'cut')
          .map((r) => r.ID);
        assert.deepStrictEqual(marked, [entryOfRow(row)], `the cut of ${row.ID} marks its entry, and only it`);
        checked++;
      }
      assert.ok(checked > 3, `${checked} rows checked`);
    });
  }
});

// --- multiPasteAtomicity.test.ts: a refused multi-paste leaves the live section untouched ---------

describe('a rejected multi-paste leaves the live section untouched (binary .sldd)', () => {
  it('rejects the whole paste without adding the allowed payload, and the next copy gets the first name', async () => {
    const w = windowOf();
    const b = await w.bin('atomic.sldd');
    const rows = paintedRows(b.view.posts);
    const section = (b.model().children as any[]).find((s: any) => s.children.length > 0);
    const goodEntry = section.children[0];
    const good = goodEntry.serialize() as Record<string, unknown>;
    // The fixture holds no section-illegal entry, so the payload the allow-list rejects is made: the
    // gate reads `value._array_class`, which is what a real serialized ServiceBus carries.
    const bad = { name: 'Illegal', value: { _array_class: 'Simulink.ServiceBus' } } as Record<string, unknown>;
    assert.strictEqual(section.allowsType('Simulink.ServiceBus'), false, 'the section restricts its types');
    const item = (payload: Record<string, unknown>, className: string): ClipboardItem => ({
      payload,
      sourceSection: section.name,
      className,
      arrayClass: className,
      kind: 'Bus',
      isMatlabVariable: false,
      isScalarNumeric: false,
    });
    w.registers.setClipboard([item(good, String(goodEntry.className ?? '')), item(bad, 'Simulink.ServiceBus')], 'copy', 'file:///work/other.sldd');
    const names = section.children.map((c: any) => c.name);
    const chunk = b.engine.chunkXml;
    await onBinary(b, { type: 'paste', rowId: `section:${section.name}` });
    assert.match(errorsIn(b.view.posts)[0] ?? '', /not allowed|ServiceBus/i);
    assert.deepStrictEqual(section.children.map((c: any) => c.name), names, 'the allowed payload was not grafted on');
    assert.strictEqual(b.engine.chunkXml, chunk, 'and the chunk is untouched');
    assert.strictEqual(b.events.length, 0);

    // The same entry pasted alone gets the first name a paste with no refusal before it gets.
    const before = b.names();
    b.view.send({ type: 'copy', rowIds: [rowOf(rows, goodEntry.name).ID] });
    await onBinary(b, { type: 'paste', rowId: `section:${section.name}` });
    assert.deepStrictEqual(errorsIn(b.view.posts), [], 'the paste lands');
    assert.deepStrictEqual(
      b.names().filter((n) => !before.includes(n)),
      [`${goodEntry.name}1`],
      'and its copy is the first one, not the second',
    );
  });
});

// The repaint half of a clipboard broadcast, which data-explorer-vscode test/editorHub.test.ts held
// ("posts clipboardState AND repaints every registered webview", deleted with vscode's V4): every
// table of the document is told the state, and repaints the rows it marks, not only the table the
// copy came from, which repaints its own as it copies. A second table of one document hears it only
// through the registers' broadcast.
describe('a clipboard broadcast, on a compressed-binary .sldd', () => {
  it('a clipboard broadcast repaints the marked rows', async () => {
    const o = await open(PARAMS);
    const second = viewOf(o.engine);
    second.send({ type: 'ready' });
    await waitFor("the second table's rows", () => second.posts.some((p) => p.type === 'setRows'));
    const gravity = entryRow(o.view.posts, 'gravity').ID;
    const from = second.posts.length;
    o.view.send({ type: 'copy', rowIds: [gravity] });
    await waitFor('the copied row marked in the other table', () => tableOf(second.posts).find((r) => r.ID === gravity)?.Name?.clipboardMode === 'copy');
    const state = second.posts.slice(from).filter((p) => p.type === 'clipboardState').pop();
    assert.ok(state, 'the other table was told the clipboard state');
    assert.deepStrictEqual([state.type, state.canPaste, state.mode], ['clipboardState', true, 'copy']);
    second.close();
  });
});
