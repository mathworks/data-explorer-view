// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/refusedPasteDrop.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/multiPasteSelection.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/crossDocumentMove.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/crossSectionDrag.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/mptPasteDrop.test.ts at c73da3c
// Ported from data-explorer-vscode test-integration/suite/matClipboard.test.ts at c73da3c
// Ported from data-explorer-vscode test/cutPasteEndToEnd.test.ts at c73da3c
// Ported from data-explorer-vscode test/dropEndToEnd.test.ts at c73da3c
// Ported from data-explorer-vscode test/multiSelectInvariants.test.ts at c73da3c
//
// The JSON dictionary editor's clipboard and row drags, run against view's JSON dictionary engine
// over the page's own text, every document of a case on one session and one set of registers, as a
// window's are: the JSON half of each of those suites, and the cases of the MAT-file and binary
// ports whose other document was the JSON editor itself (there core's read of the dictionary,
// openDictionary, or a second binary dictionary), here the real engine. The three unit tests
// modelled what the JSON editor's paste and drop do with its pure transforms; here they are the
// engine's own gestures on the same fixture, and their pure-function cases stay with the
// transforms. A JSON gesture paints at once and writes its text a turn later, so each case waits
// for the text to move, or for a word.
import * as assert from 'node:assert';
import { createSession } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { createRegisters, dropDecision, isNoopTransfer } from '../../src/model/index.js';
import { DocumentRegistry } from '../../src/model/workspace/SlddModel.js';
import { buildContextMenuItems } from '../../src/widgets/tree-table/menuItems.js';
import {
  buffer,
  emptyMat,
  fixture as matFixture,
  namesOf,
  open as openMat,
  readMat,
  twiceNamedMat,
  variableOf,
  type Opened as MatOpened,
} from '../matEngine/harness.js';
import { entryOf, open as openBinary, PARAMS as BINARY_PARAMS, readSldd, type Opened as BinaryOpened } from '../binaryEngine/harness.js';
import {
  chunkOf,
  entryNames,
  entryRow,
  errorsIn,
  file,
  isEntryRow,
  nameOf,
  open,
  settle,
  shownCells,
  tableOf,
  waitFor,
  WORKSPACE_DATA,
  WORKSPACE_PARAMS,
  viewOf,
  type Opened,
} from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** The turns a gesture's queued steps take, and a little more: for a word that must not come. */
const quiet = async (): Promise<void> => {
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 20));
};

/** A window: one session, one registry over it and one set of registers for every document a case opens. */
function windowOf() {
  const registers = createRegisters();
  const session = createSession();
  const registry = new DocumentRegistry(session);
  return {
    registers,
    session,
    registry,
    json: (as: string, rel = WORKSPACE_PARAMS, bytes = file(rel)) => open(rel, bytes, { as, registers, registry }),
    bin: (as: string, rel = BINARY_PARAMS) => openBinary(rel, file(rel), { as, registers, session }),
    mat: (as: string, bytes: Uint8Array) => openMat(as, bytes, { as, registers, session }),
  };
}

/** The rows of a table's last whole paint. */
const paintedRows = (posts: any[]): any[] => posts.filter((m) => m.type === 'setRows').pop()?.rows ?? [];

/** An entry row by name, of `rows`. */
function rowOf(rows: any[], name: string): any {
  const row = rows.find((r) => isEntryRow(r) && nameOf(r) === name);
  assert.ok(row, `the table has an entry row for "${name}"`);
  return row;
}

const entriesOf = (model: any): any[] => ((model?.children ?? []) as any[]).flatMap((s: any) => s.children ?? []);

/** Send a gesture to a JSON dictionary's view and wait for its write, or its word. */
async function onJson(tab: Opened, msg: any, what = msg.type): Promise<void> {
  const version = tab.text.version;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.text.version > version || errorsIn(tab.view.posts).length > 0);
  await settle();
}

/** Send a gesture to a MAT-file's view and wait for it to be answered: an edit pushed, or a word. */
async function onMat(tab: MatOpened, msg: any, what = msg.type): Promise<void> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
}

/** Send a gesture to a binary dictionary's view and wait for its edit, or its word. */
async function onBinary(tab: BinaryOpened, msg: any, what = msg.type): Promise<void> {
  const edits = tab.events.length;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`the ${what} to land or be refused`, () => tab.events.length > edits || errorsIn(tab.view.posts).length > 0);
}

/** `text` with the first `from` after `marker` replaced by `to`: one entry's flag, flipped. */
function replaceAfter(text: string, marker: string, from: string, to: string): string {
  const at = text.indexOf(marker);
  assert.ok(at >= 0, `the fixture spells ${marker}`);
  const hit = text.indexOf(from, at);
  assert.ok(hit >= 0, `the fixture spells ${from} after ${marker}`);
  return text.slice(0, hit) + to + text.slice(hit + from.length);
}

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

// --- refusedPasteDrop.test.ts --------------------------------------------------------------------

const ENTRY = 'mat2x2';
// Its pasted copies: the uniquifier appends a number.
const COPY = /^mat2x2\d+$/;
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

/** The live entry node the engine's tree holds for `name`. */
const liveEntry = (j: Opened, name: string): any => entriesOf(j.model()).find((e) => e.name === name);

/** Send `msg` and wait for the engine to refuse it, or to write the document. */
async function answered(tab: Opened, msg: any): Promise<void> {
  const version = tab.text.version;
  tab.view.posts.length = 0;
  tab.view.send(msg);
  await waitFor(`an answer to ${msg.type}`, () => errorsIn(tab.view.posts).length > 0 || tab.text.version > version);
  // A second answer: an error after the write, or a write after the refusal.
  await quiet();
}

describe('A refused paste or drop into a JSON .sldd', () => {
  it('leaves no entry behind in the model: the next paste gets the name it was owed', async () => {
    const w = windowOf();
    const j = await w.json('refused_paste_name.sldd');
    const source = rowOf(paintedRows(j.view.posts), ENTRY);
    j.view.send({ type: 'copy', rowIds: [source.ID] });
    const before = j.text.text;

    const restore = refuse(liveEntry(j, ENTRY), 'serialize', (self) => COPY.test(String(self.name)));
    try {
      await answered(j, { type: 'paste', rowId: source.ID });
    } finally {
      restore();
    }
    assert.deepStrictEqual(errorsIn(j.view.posts), [`Failed to apply edit: ${REFUSAL}`], 'the refusal is reported');
    assert.strictEqual(j.text.text, before, 'and the document is untouched');
    assert.strictEqual(j.text.dirty, false, 'and still clean');

    // The same paste, now allowed. The name is the one a paste with no failure before it gets: the
    // refused copy must not be standing in the namespace it was uniquified against.
    await answered(j, { type: 'paste', rowId: source.ID });
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'the second paste lands');
    const added = j.names().filter((n) => !entryNames(before).includes(n));
    assert.deepStrictEqual(added, [`${ENTRY}1`], 'and its copy is the first one, not the second');
  });

  it('after a refused same-document cut, the cut entry is still there to edit', async () => {
    const w = windowOf();
    const j = await w.json('refused_cut_edit.sldd');
    const rows = paintedRows(j.view.posts);
    const source = rowOf(rows, ENTRY);
    const element = rows.find((r) => r.parent === source.ID);
    assert.ok(element, `${ENTRY} has element rows`);
    const before = j.text.text;

    // A real refusal, no stub: a matrix cannot become a Constant, and Architectural Data makes a
    // pasted variable one. The cut takes the source out of the model before that rule runs.
    j.view.send({ type: 'cut', rowIds: [source.ID] });
    await answered(j, { type: 'paste', rowId: 'section:arch' });
    const refusals = errorsIn(j.view.posts);
    assert.strictEqual(refusals.length, 1, 'the paste is refused');
    assert.match(refusals[0], /must be scalar and numeric/);
    assert.strictEqual(j.text.text, before, 'and the document is untouched');

    // The cut entry is still in the file and on screen; the edit must find it in the model too.
    await answered(j, { type: 'edit', rowId: element.ID, columnId: 'Value', oldValue: '1', newValue: '9' });
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'the edit is applied, not "Could not locate"');
    const value = (chunkOf(j.text.text).entries as any[]).find((e) => e.name === ENTRY)?.value;
    assert.match(JSON.stringify(value), /9/, 'and the file holds the new element');
  });

  it('a drag that cannot start says why, and holds nothing', async () => {
    const w = windowOf();
    const j = await w.json('refused_drag_start.sldd');
    const source = rowOf(paintedRows(j.view.posts), ENTRY);
    const restore = refuse(liveEntry(j, ENTRY), 'serialize', (self) => self.name === ENTRY);
    try {
      j.view.posts.length = 0;
      j.view.send({ type: 'dragStart', rowIds: [source.ID] });
      await waitFor('the drag start to be refused', () => errorsIn(j.view.posts).length > 0);
    } finally {
      restore();
    }
    assert.deepStrictEqual(errorsIn(j.view.posts), [DRAG_REFUSAL], "the refusal is reported, in core's words");
    assert.strictEqual(w.registers.getDrag(), null, 'and the drag register is empty');
  });

  it('a refused drop ends the drag, and leaves no entry behind either', async () => {
    const w = windowOf();
    const j = await w.json('refused_drop.sldd');
    const source = rowOf(paintedRows(j.view.posts), ENTRY);
    const before = j.text.text;
    // Copied FIRST, for the paste at the end: that paste asks what the drop left in the model, so
    // nothing between the two may touch it.
    j.view.send({ type: 'copy', rowIds: [source.ID] });
    j.view.send({ type: 'dragStart', rowIds: [source.ID] });
    await waitFor('the drag to start', () => w.registers.getDrag() !== null);

    const restore = refuse(liveEntry(j, ENTRY), 'serialize', (self) => COPY.test(String(self.name)));
    try {
      await answered(j, { type: 'drop', rowId: source.ID, mode: 'copy' });
    } finally {
      restore();
    }
    assert.deepStrictEqual(errorsIn(j.view.posts), [`Failed to apply edit: ${REFUSAL}`], 'the refusal is reported');
    assert.strictEqual(j.text.text, before, 'and the document is untouched');
    assert.strictEqual(w.registers.getDrag(), null, 'and the drag is over');

    // The drop's half of the model repair, asked the same way as the paste's above.
    await answered(j, { type: 'paste', rowId: source.ID });
    const added = j.names().filter((n) => !entryNames(before).includes(n));
    assert.deepStrictEqual(added, [`${ENTRY}1`], 'the next copy gets the first name');
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

/**
 * Copy `names` and paste them back into the section they came from, through the JSON engine: the
 * gesture that duplicates, so the new entries have to be uniquified (`Bus` → `Bus1`) and their ids
 * cannot be confused with the originals'.
 */
async function pasteIntoJson(as: string, names: string[]) {
  const w = windowOf();
  const j = await w.json(as);
  const rows = paintedRows(j.view.posts);
  const sources = names.map((name) => rowOf(rows, name));
  const before = j.text.text;
  const versionBefore = j.text.version;
  j.view.send({ type: 'copy', rowIds: sources.map((r) => r.ID) });
  j.view.posts.length = 0;
  // The anchor is a row in the target section: the row the user right-clicked.
  j.view.send({ type: 'paste', rowId: sources[0].ID });
  await waitFor(
    'the paste to be applied or refused',
    () => j.view.posts.some((m) => m.type === 'error') || (j.text.version > versionBefore && j.view.posts.some((m) => m.type === 'selectRows')),
  );
  // An error reported after the paste landed.
  await quiet();
  assert.ok(!j.view.posts.some((m) => m.type === 'error'), `no error was reported (${JSON.stringify(errorsIn(j.view.posts))})`);
  return { before, after: j.text.text, versions: j.text.version - versionBefore, posts: j.view.posts, rows };
}

/** The same gesture on the binary dictionary, for the pairing case. */
async function pasteIntoBinary(as: string, names: string[]) {
  const w = windowOf();
  const b = await w.bin(as);
  const sources = names.map((name) => rowOf(paintedRows(b.view.posts), name));
  b.view.send({ type: 'copy', rowIds: sources.map((r) => r.ID) });
  b.view.posts.length = 0;
  b.view.send({ type: 'paste', rowId: sources[0].ID });
  await waitFor('the paste to be applied or refused', () => b.view.posts.some((m) => m.type === 'error' || m.type === 'selectRows'));
  assert.ok(!b.view.posts.some((m) => m.type === 'error'), `no error was reported (${JSON.stringify(errorsIn(b.view.posts))})`);
  return { posts: b.view.posts };
}

describe('Pasting several entries, on a JSON .sldd', () => {
  it('selects EVERY entry it added, not just the last', async () => {
    const run = await pasteIntoJson('json_paste_many.sldd', ['MyBus', 'MyAlias', 'MyEnum']);
    // What the file gained: three copies, uniquified against the namespace they joined, appended,
    // so file order is paste order.
    const added = entryNames(run.after).filter((n) => !entryNames(run.before).includes(n));
    assert.strictEqual(added.length, 3, `three entries were added to the file (got ${JSON.stringify(added)})`);
    assert.strictEqual(run.versions, 1, 'one write, so one undo step');
    const asked = selectionAsked(run.posts);
    assert.deepStrictEqual(
      asked.map((id) => id.slice(id.lastIndexOf('/') + 1)),
      added,
      `all three pasted entries are selected, in the order they were appended (got ${JSON.stringify(asked)})`,
    );
  });

  it('every id it names is a row the table was actually given', async () => {
    const run = await pasteIntoJson('json_paste_ids.sldd', ['MyBus', 'MyAlias']);
    const painted = paintedRowIds(run.posts);
    for (const id of selectionAsked(run.posts)) assert.ok(painted.has(id), `the table holds a row for the selected id ${id}`);
    const sourceIds = new Set(run.rows.map((r: any) => r.ID));
    for (const id of selectionAsked(run.posts)) assert.ok(!sourceIds.has(id), `${id} is a row the paste created, not the one it copied`);
  });

  it('a single-entry paste still names exactly that one', async () => {
    const run = await pasteIntoJson('json_paste_one.sldd', ['MyBus']);
    const added = entryNames(run.after).filter((n) => !entryNames(run.before).includes(n));
    const asked = selectionAsked(run.posts);
    assert.strictEqual(asked.length, 1, `one entry pasted, one row selected (got ${JSON.stringify(asked)})`);
    assert.deepStrictEqual([asked[0].slice(asked[0].lastIndexOf('/') + 1)], added, 'and it is the copy');
    assert.ok(chunkOf(run.after).entries.some((e: any) => e.name === added[0]), 'which the file spells too');
  });
});

describe('Pasting several entries, on both .sldd formats', () => {
  it('the two formats agree on how many rows a paste selects', async () => {
    const json = await pasteIntoJson('json_paste_pair.sldd', ['MyBus', 'MyAlias']);
    const binary = await pasteIntoBinary('binary_paste_pair.sldd', ['MyBus', 'MyAlias']);
    assert.strictEqual(
      selectionAsked(json.posts).length,
      selectionAsked(binary.posts).length,
      'two entries pasted, two rows selected, whichever format is open',
    );
    assert.strictEqual(selectionAsked(json.posts).length, 2, 'and that count is two');
  });
});

// --- crossDocumentMove.test.ts -------------------------------------------------------------------

const MOVED = 'gravity';

/** A source tab: its rows, whether it still holds the moved entry, and how to close it. */
interface Source {
  rows: any[];
  send: (msg: any) => void;
  /** Close the tab: its document-scoped teardown is what takes the deleter away. */
  close: () => void;
  holds: () => boolean;
}

async function jsonSource(w: ReturnType<typeof windowOf>, as: string): Promise<Source> {
  const j = await w.json(as);
  return {
    rows: paintedRows(j.view.posts),
    send: j.view.send,
    close: () => j.view.close(),
    holds: () => entryNames(j.text.text).includes(MOVED),
  };
}

async function binarySource(w: ReturnType<typeof windowOf>, as: string): Promise<Source> {
  const b = await w.bin(as);
  return {
    rows: paintedRows(b.view.posts),
    send: b.view.send,
    close: () => b.view.close(),
    holds: () => b.engine.chunkXml.includes(`>${MOVED}</P>`),
  };
}

/**
 * Cut the entry in `source`, optionally close the source tab, then paste into a JSON copy of
 * data.sldd. Answers what the target's view was told and what the two documents hold afterwards.
 */
async function cutAndPaste(w: ReturnType<typeof windowOf>, source: Source, closeSourceFirst: boolean, targetName: string) {
  source.send({ type: 'cut', rowIds: [rowOf(source.rows, MOVED).ID] });
  assert.strictEqual(w.registers.getClipboard()?.mode, 'cut', 'the cut is on the clipboard');
  if (closeSourceFirst) source.close();
  const target = await w.json(targetName, WORKSPACE_DATA);
  const version = target.text.version;
  target.view.posts.length = 0;
  target.view.send({ type: 'paste', rowId: 'section:design' });
  await waitFor('the paste to land or be refused', () => target.text.version > version || errorsIn(target.view.posts).length > 0);
  // The source delete runs after the paste's write, and its report after that.
  await waitFor('the move to finish', () => w.registers.getClipboard() === null);
  await quiet();
  return { errors: errorsIn(target.view.posts), targetHas: target.names().includes(MOVED), sourceHolds: source.holds() };
}

for (const [format, openSource] of [
  ['JSON', jsonSource],
  ['compressed-binary', binarySource],
] as const) {
  describe(`A cut from a ${format} .sldd, pasted into another dictionary`, () => {
    const tag = format === 'JSON' ? 'json' : 'bin';

    it('removes the original when its tab is still open, and says nothing', async () => {
      const w = windowOf();
      const source = await openSource(w, `xdoc_src_open_${tag}.sldd`);
      const run = await cutAndPaste(w, source, false, `xdoc_dst_open_${tag}.sldd`);
      assert.deepStrictEqual(run.errors, [], 'nothing to report');
      assert.ok(run.targetHas, `${MOVED} landed in the target`);
      assert.ok(!run.sourceHolds, 'and left the source');
    });

    it('says the original could not be removed when its tab was closed after the cut, and loses nothing', async () => {
      const w = windowOf();
      const source = await openSource(w, `xdoc_src_closed_${tag}.sldd`);
      const run = await cutAndPaste(w, source, true, `xdoc_dst_closed_${tag}.sldd`);
      assert.deepStrictEqual(
        run.errors,
        [`Pasted here, but the original in xdoc_src_closed_${tag}.sldd could not be removed: its table is no longer open. Remove it there by hand.`],
        'the target view says what is left to do',
      );
      assert.ok(run.targetHas, `${MOVED} landed in the target`);
      assert.ok(run.sourceHolds, 'and is still in the source: two copies, neither lost');
    });
  });
}

// --- crossSectionDrag.test.ts --------------------------------------------------------------------

const DESIGN_ENTRY = 'MyAlias';
const ARCH_ENTRY = 'MyBus';

/** What the table would show for a drop of the in-flight drag onto `sectionName`. */
function predicted(posts: any[], painted: any, sectionName: string) {
  const drag = posts.filter((m) => m.type === 'dragState').pop();
  assert.ok(drag?.descriptor, 'the engine broadcast a drag descriptor');
  const rule = (painted.rules as any[]).find((r) => r.sectionName === sectionName);
  assert.ok(rule, `the dictionary has a ${sectionName} section`);
  return dropDecision(drag.descriptor, { docUri: painted.docUri, ...rule }, 'move');
}

/** Entry name -> its derived flag, from what a dictionary's text holds now. */
const derivedOf = (text: string): Map<string, string> =>
  new Map<string, string>((chunkOf(text).entries as any[]).map((e) => [e.name, String(e.metadata?.isderived)]));

describe('A drag across two sections, on a JSON .sldd', () => {
  it('is predicted as a move, and the drop moves the design entry into arch', async () => {
    const text = replaceAfter(decode(file(WORKSPACE_PARAMS)), `"name": "${ARCH_ENTRY}"`, '"isderived": "0"', '"isderived": "1"');
    const w = windowOf();
    const j = await w.json('cross_section_drag.sldd', WORKSPACE_PARAMS, encode(text));
    const rows = paintedRows(j.view.posts);
    const painted = j.view.posts.filter((m) => m.type === 'sectionRules').pop();
    const derived = () => derivedOf(j.text.text);
    const before = derived();
    assert.strictEqual(before.get(DESIGN_ENTRY), '0', `${DESIGN_ENTRY} starts in Design Data`);
    assert.strictEqual(before.get(ARCH_ENTRY), '1', `${ARCH_ENTRY} starts in Architectural Data`);

    j.view.posts.length = 0;
    j.view.send({ type: 'dragStart', rowIds: [rowOf(rows, DESIGN_ENTRY).ID, rowOf(rows, ARCH_ENTRY).ID] });
    await waitFor('the drag descriptor', () => j.view.posts.some((m) => m.type === 'dragState' && m.descriptor));

    // The prediction, from what the engine sent. Onto arch it was a silent no-op.
    const ontoArch = predicted(j.view.posts, painted, 'arch');
    assert.strictEqual(ontoArch.noop, false, 'onto arch: not refused as a no-op');
    assert.strictEqual(ontoArch.canDrop, true, 'onto arch: allowed');
    const ontoDesign = predicted(j.view.posts, painted, 'design');
    assert.strictEqual(ontoDesign.noop, false, 'onto design: not a no-op either');
    assert.strictEqual(ontoDesign.canDrop, true, 'onto design: allowed');

    // The drop the table now lets through.
    j.view.posts.length = 0;
    j.view.send({ type: 'drop', rowId: 'section:arch', mode: 'move' });
    await waitFor('the drop to be applied or refused', () => errorsIn(j.view.posts).length > 0 || derived().get(DESIGN_ENTRY) === '1');
    await quiet();
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'the drop is applied');

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

/** The params.sldd text with the two entries re-classed and MyBus moved into arch. */
function mptJson(original: string): string {
  let text = replaceAfter(original, `"name": "${PARAM}"`, '"Simulink.Parameter"', '"mpt.Parameter"');
  text = replaceAfter(text, `"name": "${SIGNAL}"`, '"Simulink.Signal"', '"mpt.Signal"');
  return replaceAfter(text, `"name": "${ARCH_ENTRY}"`, '"isderived": "0"', '"isderived": "1"');
}

describe('A paste and a drop of an mpt entry, on a JSON .sldd', () => {
  it('are offered and applied in Design Data, and refused in Architectural Data', async () => {
    const w = windowOf();
    const j = await w.json('mpt_paste_drop.sldd', WORKSPACE_PARAMS, encode(mptJson(decode(file(WORKSPACE_PARAMS)))));
    const rows = paintedRows(j.view.posts);
    const painted = j.view.posts.filter((m) => m.type === 'sectionRules').pop();
    const snapshot = () => j.text.text;
    const mpt = () =>
      (chunkOf(j.text.text).entries as any[])
        .filter((e) => String(e.value?._array_class ?? '').startsWith('mpt.'))
        .map((e) => `${e.name} ${e.value._array_class} ${e.metadata?.isderived}`)
        .sort();
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
    const answer = async (msg: any): Promise<void> => {
      const before = snapshot();
      j.view.posts.length = 0;
      j.view.send(msg);
      await waitFor(`an answer to ${msg.type}`, () => errorsIn(j.view.posts).length > 0 || snapshot() !== before);
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
    j.view.posts.length = 0;
    j.view.send({ type: 'copy', rowIds: [param.ID, signal.ID] });
    await waitFor('the clipboard state', () => j.view.posts.some((m) => m.type === 'clipboardState' && m.items?.length === 2));
    const clip = j.view.posts.filter((m) => m.type === 'clipboardState').pop();
    const overDesign = pasteItemOver(clip, param, 'design');
    assert.ok(!overDesign.disabled, `Paste over a design row is offered (reason: ${overDesign.reason})`);
    const overArch = pasteItemOver(clip, archRow, 'arch');
    assert.strictEqual(overArch.disabled, true, 'Paste over an arch row is not offered');
    assert.strictEqual(overArch.reason, REFUSED_IN_ARCH);

    // The paste the menu now offers lands, and each copy keeps its class.
    await answer({ type: 'paste', rowId: param.ID });
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'the paste into design is applied');
    const afterPaste = mpt();
    assert.strictEqual(afterPaste.length, 4, `two mpt copies were added: ${afterPaste.join(', ')}`);
    assert.deepStrictEqual(
      afterPaste.map((e) => e.split(' ').slice(1).join(' ')).sort(),
      ['mpt.Parameter 0', 'mpt.Parameter 0', 'mpt.Signal 0', 'mpt.Signal 0'],
      'both copies are in design, with their classes',
    );

    // The engine still refuses the same paste over the arch row, which the menu does not offer.
    const beforeArch = snapshot();
    await answer({ type: 'paste', rowId: archRow.ID });
    const refusal = errorsIn(j.view.posts);
    assert.strictEqual(refusal.length, 1, `one refusal: ${refusal.join(' | ')}`);
    assert.ok(refusal[0].includes('A "mpt.Parameter" entry is not allowed in Architectural Data.'), `the refusal names the class and the section: ${refusal[0]}`);
    assert.strictEqual(snapshot(), beforeArch, 'and the document is untouched');

    // A drag of the same two rows: the cursor allows a copy onto design, and refuses arch.
    j.view.posts.length = 0;
    j.view.send({ type: 'dragStart', rowIds: [param.ID, signal.ID] });
    await waitFor('the drag descriptor', () => j.view.posts.some((m) => m.type === 'dragState' && m.descriptor));
    const drag = j.view.posts.filter((m) => m.type === 'dragState').pop().descriptor;
    const ontoDesign = dropDecision(drag, { docUri: painted.docUri, ...ruleOf('design') }, 'copy');
    assert.strictEqual(ontoDesign.canDrop, true, `a copy onto design is allowed (${ontoDesign.tooltip})`);
    const ontoArch = dropDecision(drag, { docUri: painted.docUri, ...ruleOf('arch') }, 'copy');
    assert.strictEqual(ontoArch.canDrop, false, 'a copy onto arch is refused');
    assert.strictEqual(ontoArch.tooltip, REFUSED_IN_ARCH);

    // And the drop the cursor allows lands too.
    await answer({ type: 'drop', rowId: 'section:design', mode: 'copy' });
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'the drop onto design is applied');
    const afterDrop = mpt();
    assert.strictEqual(afterDrop.length, 6, `two more mpt copies were added: ${afterDrop.join(', ')}`);
    assert.ok(afterDrop.every((e) => e.endsWith(' 0')), 'every copy is in design');
  });
});

// --- matClipboard.test.ts: the cases with a JSON dictionary in them ------------------------------

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

/** The JSON dictionary's entry `name` as its text says now, read by core. */
const jsonEntry = <T>(j: Opened, name: string, read: (entry: any) => T): T => readSldd(encode(j.text.text), (dict) => read(entryOf(dict, name)));

/** A cut's move finishes with the source's delete, after the paste; the clipboard empties first. */
const moveDone = (w: ReturnType<typeof windowOf>) => waitFor('the cut to be spent', () => w.registers.getClipboard() === null);

describe('MAT-file clipboard and row drags, between a MAT-file and a JSON dictionary', () => {
  it('a cut dims its rows, a copy dashes them, and the mark goes with the clipboard', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('mark.sldd');
    m.view.send({ type: 'cut', rowIds: [variableRow(m.view.posts, 'x').ID] });
    await waitFor('the cut row repainted', () => variableRow(m.view.posts, 'x').Name?.clipboardMode === 'cut');
    assert.strictEqual(variableRow(m.view.posts, 'q').Name?.clipboardMode, undefined, 'only the cut variable');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'q').ID] });
    await waitFor('the copied row repainted', () => variableRow(m.view.posts, 'q').Name?.clipboardMode === 'copy');
    assert.strictEqual(variableRow(m.view.posts, 'x').Name?.clipboardMode, undefined, 'and the cut is no longer marked');
    // A copy in another document takes the mark away from this one.
    j.view.send({ type: 'copy', rowIds: [entryRow(j.view.posts, 'gravity').ID] });
    await waitFor('the mark gone', () => variableRow(m.view.posts, 'q').Name?.clipboardMode === undefined);
    const state = m.view.posts.filter((p) => p.type === 'clipboardState').pop();
    assert.strictEqual(state.sourceDocUri, j.engine.uri, 'this view was told what the clipboard holds now');
  });

  // A whole repaint builds its rows and then waits on the Usage column; a copy landing in that
  // wait repaints the rows it marks at once, ahead of the older rows, which then land over them.
  it('a copy made while the rows are on their way is marked once they land, in a MAT-file and a dictionary', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const x = variableRow(m.view.posts, 'x').ID;
    m.view.posts.length = 0;
    m.view.send({ type: 'ready' });
    m.view.send({ type: 'copy', rowIds: [x] });
    await waitFor('the repaint', () => m.view.posts.some((p) => p.type === 'setRows'));
    await waitFor('the mark on the copied row', () => tableOf(m.view.posts).find((r) => r.ID === x)?.Name?.clipboardMode === 'copy');

    const j = await w.json('marks.sldd');
    const gravity = entryRow(j.view.posts, 'gravity').ID;
    j.view.posts.length = 0;
    j.view.send({ type: 'ready' });
    j.view.send({ type: 'cut', rowIds: [gravity] });
    await waitFor('the repaint', () => j.view.posts.some((p) => p.type === 'setRows'));
    await waitFor('the mark on the cut entry', () => tableOf(j.view.posts).find((r) => r.ID === gravity)?.Name?.clipboardMode === 'cut');
    await waitFor("the MAT-file's copy unmarked", () => tableOf(m.view.posts).find((r) => r.ID === x)?.Name?.clipboardMode === undefined);
  });

  it('a MAT-file copy pasted into a JSON dictionary lands there, and leaves the MAT-file as it was', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 'x').ID, variableRow(m.view.posts, 'p').ID] });
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(j.view.posts), []);
    assert.ok(j.names().includes('x') && j.names().includes('p'), 'both landed');
    assert.strictEqual(j.text.dirty, true);
    for (const name of ['x', 'p']) {
      assert.deepStrictEqual(
        jsonEntry(j, name, (e) => columnsOf(shownCells(e), VALUE_COLUMNS)),
        columnsOf(shownCells(variableOf(m, name)), VALUE_COLUMNS),
        `${name} reads in the dictionary as the variable it was copied from`,
      );
    }
    assert.strictEqual(m.events.length, 0);
    assert.strictEqual(m.index.dirty, false);
    assert.ok(w.registers.getClipboard(), 'a copy stays on the clipboard');
  });

  it("a MAT-file cut pasted into a JSON dictionary moves the variable: its removal is the MAT-file's own undo step", async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    m.view.send({ type: 'cut', rowIds: [variableRow(m.view.posts, 'x').ID] });
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the original taken out', () => !namesOf(m).includes('x'));
    assert.deepStrictEqual(errorsIn(j.view.posts), []);
    assert.ok(j.names().includes('x'));
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str']);
    assert.strictEqual(m.events.length, 1, 'ONE edit in the MAT-file');
    assert.strictEqual(m.events[0].label, 'Move (remove source)');
    assert.strictEqual(m.index.dirty, true);
    m.undo();
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x'], 'its undo puts the original back');
    assert.strictEqual(m.index.dirty, false);
  });

  it('JSON dictionary entries pasted into a MAT-file: a plain value, a struct, a Parameter with its properties, a Bus with its elements', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const d = await w.json('source.sldd');
    const names = ['charStr', 'myStruct', 'gravity', 'MyBus'];
    d.view.send({ type: 'copy', rowIds: names.map((n) => entryRow(d.view.posts, n).ID) });
    await onMat(m, { type: 'paste', rowId: variableRow(m.view.posts, 'q').ID });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.deepStrictEqual(namesOf(m), ['p', 'q', 'str', 'x', ...names]);
    assert.strictEqual(m.events.length, 1, 'ONE edit for the four');
    for (const name of names) {
      assert.deepStrictEqual(
        columnsOf(shownCells(variableOf(m, name)), VALUE_COLUMNS),
        jsonEntry(d, name, (e) => columnsOf(shownCells(e), VALUE_COLUMNS)),
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
    await moveDone(w);
    await waitFor('the original taken out of the dictionary', () => !d.names().includes('gravity'));
    assert.deepStrictEqual(errorsIn(fresh.view.posts), []);
    assert.deepStrictEqual(namesOf(fresh), ['gravity']);
  });

  // What a dictionary of one kind cannot hold is that dictionary's paste to refuse, since a copy
  // does not know where it will land: a function handle travels (a text dictionary holds one as
  // its literal), and the binary dictionary's paste refuses it as it writes the entry's XML.
  it("a function handle copied out of a MAT-file pastes into a JSON dictionary, and is refused by a binary one in core's words", async () => {
    const w = windowOf();
    const m = await w.mat('handles.mat', matFixture('nested_handles.mat'));
    const j = await w.json('target.sldd');
    const b = await w.bin('bin.sldd');
    const xmlRefusal = (w.session as any).copyRefusal(variableOf(m, 's_fh').id, 'xml');
    assert.ok(xmlRefusal, 'core says a binary dictionary cannot hold it');
    m.view.send({ type: 'copy', rowIds: [variableRow(m.view.posts, 's_fh').ID] });
    assert.ok(w.registers.getClipboard(), 'it can be copied');
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(j.view.posts), []);
    assert.ok(j.names().includes('s_fh'), 'a text dictionary takes it');
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

  it('row drags between a MAT-file and both dictionary formats, both ways, moving and copying', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('json.sldd');
    const b = await w.bin('bin.sldd');
    // Row ids as first painted: a gesture's own repaint of a dictionary is entry-scoped.
    const [jGravity, jStruct, bGravity] = [entryRow(j.view.posts, 'gravity').ID, entryRow(j.view.posts, 'myStruct').ID, entryRow(b.view.posts, 'gravity').ID];

    // MAT-file -> JSON dictionary, moved: the original leaves as the MAT-file's own edit.
    m.view.send({ type: 'dragStart', rowIds: [variableRow(m.view.posts, 'x').ID] });
    await onJson(j, { type: 'drop', rowId: jGravity, mode: 'move' });
    await waitFor('the original moved out', () => !namesOf(m).includes('x'));
    assert.ok(j.names().includes('x'));
    assert.strictEqual(m.events.length, 1);
    assert.strictEqual(w.registers.getDrag(), null);

    // MAT-file -> binary dictionary, copied.
    m.view.send({ type: 'dragStart', rowIds: [variableRow(m.view.posts, 'str').ID] });
    await onBinary(b, { type: 'drop', rowId: 'section:design', mode: 'copy' });
    assert.ok(b.names().includes('str'));
    assert.ok(namesOf(m).includes('str'), 'a copy leaves its original');

    // JSON dictionary -> MAT-file, moved: the entry leaves the dictionary's text.
    j.view.send({ type: 'dragStart', rowIds: [jStruct] });
    await onMat(m, { type: 'drop', rowId: '', mode: 'move' });
    await waitFor('the entry moved out of the JSON dictionary', () => !j.names().includes('myStruct'));
    assert.ok(namesOf(m).includes('myStruct'));

    // Binary dictionary -> MAT-file, moved: the entry leaves the dictionary's chunk.
    b.view.send({ type: 'dragStart', rowIds: [bGravity] });
    await onMat(m, { type: 'drop', rowId: variableRow(m.view.posts, 'p').ID, mode: 'move' });
    await waitFor('the entry moved out of the binary dictionary', () => !b.names().includes('gravity'));
    assert.ok(namesOf(m).includes('gravity'));
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    // The drop ends the drag once the source's delete has answered, a turn after the entry left it.
    await waitFor('the drop to end the drag', () => w.registers.getDrag() === null);
  });

  it('saved after a cross-format paste, and read back: the values are what was copied', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('both.sldd');
    const b = await w.bin('bin.sldd');
    const [x, p] = [variableRow(m.view.posts, 'x').ID, variableRow(m.view.posts, 'p').ID];
    const names = ['charStr', 'myStruct', 'gravity', 'MyBus'];
    j.view.send({ type: 'copy', rowIds: names.map((n) => entryRow(j.view.posts, n).ID) });
    await onMat(m, { type: 'paste', rowId: '' });
    const matSaved = m.save();
    assert.strictEqual(m.index.dirty, false, 'saved');
    for (const name of names) {
      assert.deepStrictEqual(
        readMat(matSaved, (mat) => columnsOf(shownCells(mat.children.find((v: any) => v.name === name)), VALUE_COLUMNS)),
        jsonEntry(j, name, (e) => columnsOf(shownCells(e), VALUE_COLUMNS)),
        `${name}, saved into the MAT-file and read back`,
      );
    }

    m.view.send({ type: 'copy', rowIds: [x, p] });
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    const jsonSaved = j.save();
    assert.strictEqual(j.text.dirty, false, 'the JSON dictionary saved');
    await onBinary(b, { type: 'paste', rowId: 'section:design' });
    const binarySaved = b.save();
    for (const name of ['x', 'p']) {
      const want = columnsOf(shownCells(variableOf(m, name)), VALUE_COLUMNS);
      assert.deepStrictEqual(readSldd(jsonSaved, (d) => columnsOf(shownCells(entryOf(d, name)), VALUE_COLUMNS)), want, `${name} in the saved JSON dictionary`);
      assert.deepStrictEqual(readSldd(binarySaved, (d) => columnsOf(shownCells(entryOf(d, name)), VALUE_COLUMNS)), want, `${name} in the saved binary dictionary`);
    }
  });
});

describe('MAT-file pastes and drops refused, with a JSON dictionary on the other side', () => {
  /** Asserts the MAT-file took nothing: no edit, still clean, the same variables. */
  const unchanged = (m: MatOpened, names: string[]) => {
    assert.strictEqual(m.events.length, 0, 'no edit reached the stack');
    assert.strictEqual(m.index.dirty, false);
    assert.deepStrictEqual(namesOf(m), names);
  };

  it("what a MAT-file cannot take is refused in core's words, nothing changes, and a cut keeps its source", async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('source.sldd');
    const was = namesOf(m);

    j.view.send({ type: 'copy', rowIds: [entryRow(j.view.posts, 'MyEnum').ID] });
    await onMat(m, { type: 'paste', rowId: '' });
    assert.deepStrictEqual(errorsIn(m.view.posts), [
      'Cannot paste "MyEnum" into "gains.mat": it is an enumeration\'s definition, which a MAT-file does not hold: ' +
        'MATLAB defines an enumeration in a class file or a data dictionary. Nothing was pasted.',
    ]);
    unchanged(m, was);

    j.view.send({ type: 'cut', rowIds: [entryRow(j.view.posts, 'MyLUT').ID] });
    await onMat(m, { type: 'paste', rowId: '' });
    assert.match(errorsIn(m.view.posts)[0], /^Cannot paste "MyLUT" into "gains\.mat": it is a Simulink\.LookupTable, /);
    unchanged(m, was);
    assert.strictEqual(w.registers.getClipboard()?.mode, 'cut', 'the cut is kept for another try');
    // A source delete the refusal must not make.
    await quiet();
    assert.ok(j.names().includes('MyLUT'), 'and its source keeps the entry');

    // All of them or none: a value core will not make as it was copied refuses the whole paste.
    j.view.send({ type: 'copy', rowIds: [entryRow(j.view.posts, 'charStr').ID, entryRow(j.view.posts, 'pInt16').ID] });
    await onMat(m, { type: 'paste', rowId: '' });
    assert.match(errorsIn(m.view.posts)[0], /^Cannot paste "pInt16" into "gains\.mat": pInt16\.Value is a 1x1 int16/);
    unchanged(m, was);
  });

  it('a read-only MAT-file is no target, and says why', async () => {
    const w = windowOf();
    const junk = new Uint8Array([...matFixture('pv_basic.mat'), 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    const ro = await w.mat('tail.mat', junk);
    const j = await w.json('source.sldd');
    assert.deepStrictEqual(ro.view.posts.find((p) => p.type === 'sectionRules').rules, [], 'no drop or paste rule');
    const was = namesOf(ro);
    j.view.send({ type: 'copy', rowIds: [entryRow(j.view.posts, 'charStr').ID] });
    await onMat(ro, { type: 'paste', rowId: '' });
    assert.match(errorsIn(ro.view.posts)[0], /^Read-only: Cannot save "tail\.mat": /);
    unchanged(ro, was);
    j.view.send({ type: 'dragStart', rowIds: [entryRow(j.view.posts, 'charStr').ID] });
    await onMat(ro, { type: 'drop', rowId: '', mode: 'move' });
    assert.match(errorsIn(ro.view.posts)[0], /^Read-only: /);
    unchanged(ro, was);
    assert.strictEqual(w.registers.getDrag(), null);
    assert.ok(j.names().includes('charStr'), 'the refused move left its source alone');
  });

  it('a move whose original became one of two of its name is pasted, and the original kept, said', async () => {
    const w = windowOf();
    const a = await w.mat('back.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    // The file is read again holding two x (an outside change, with no unsaved edit): the cut's
    // original is now one of two.
    await a.engine.replace(buffer(twiceNamedMat()));
    await waitFor('the reload', () => namesOf(a).join() === 'x,str,x');
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the report', () => errorsIn(j.view.posts).length > 0);
    assert.deepStrictEqual(errorsIn(j.view.posts), [
      'Pasted here, but the original in back.mat could not be removed: it holds more than one "x", and a move takes its original out by name. Remove it there by hand.',
    ]);
    assert.ok(j.names().includes('x'), 'the paste landed');
    assert.deepStrictEqual(namesOf(a), ['x', 'str', 'x'], 'and nothing was guessed at in the MAT-file');
    assert.strictEqual(a.events.length, 0);
  });

  it('a move whose source delete core recorded and then threw is answered by what the file holds: done', async () => {
    const w = windowOf();
    const a = await w.mat('throws.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    const session = w.session as any;
    const deleteNodesById = session.deleteNodesById;
    session.deleteNodesById = (...args: unknown[]) => {
      const done = deleteNodesById.apply(session, args);
      throw new Error(`after the delete (${done})`);
    };
    try {
      await onJson(j, { type: 'paste', rowId: 'section:design' });
      await moveDone(w);
      await waitFor('the original taken out', () => !namesOf(a).includes('x'));
      // A report the move must not make.
      await quiet();
    } finally {
      session.deleteNodesById = deleteNodesById;
    }
    assert.deepStrictEqual(errorsIn(j.view.posts), [], 'no "remove it there by hand" for an original that is gone');
    assert.ok(j.names().includes('x'));
    assert.strictEqual(a.events.length, 1, 'the delete is an edit the stack was handed');
    a.undo();
    assert.ok(namesOf(a).includes('x'), 'and its undo puts the original back');
  });

  // A cut is lazy and a MAT-file's variable is told by name alone, so between the cut and the
  // paste the original can be deleted and another variable given its name. The cut carries who
  // the original was (originOf), and the move takes out only that one.
  const giveNameX = async (a: MatOpened, from: string) => {
    // A variable of the name `x` that is not the one cut: an Add, renamed.
    await onMat(a, { type: 'addEntry', section: '', className: 'MatlabVariable', rename: false });
    const added = namesOf(a).find((n) => !from.split(',').includes(n))!;
    await onMat(a, { type: 'edit', rowId: variableOf(a, added).id, columnId: 'Name', oldValue: added, newValue: 'x' });
    assert.ok(namesOf(a).includes('x'), 'another variable now holds the name');
  };

  it('a cut whose variable was deleted and its name given to another: the paste lands, and the other is left alone', async () => {
    const w = windowOf();
    const a = await w.mat('cut.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'delete', rowIds: [variableOf(a, 'x').id] });
    await giveNameX(a, namesOf(a).join());
    const other = variableOf(a, 'x');
    const edits = a.events.length;
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the report', () => errorsIn(j.view.posts).length > 0);
    assert.deepStrictEqual(errorsIn(j.view.posts), [
      'Pasted here; the original in cut.mat is no longer there to remove: the "x" it holds now is another variable, which was left as it is.',
    ]);
    assert.ok(j.names().includes('x'), 'the paste landed');
    assert.strictEqual(variableOf(a, 'x'), other, 'and the variable that holds the name now was not taken out');
    assert.strictEqual(a.events.length, edits, 'no edit in the MAT-file');
  });

  it('a cut whose variable was renamed and its name given to another: nothing is taken out, and the renamed one is named', async () => {
    const w = windowOf();
    const a = await w.mat('renamed.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'edit', rowId: variableOf(a, 'x').id, columnId: 'Name', oldValue: 'x', newValue: 'y' });
    await giveNameX(a, namesOf(a).join());
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the report', () => errorsIn(j.view.posts).length > 0);
    assert.deepStrictEqual(errorsIn(j.view.posts), [
      'Pasted here, but the original in renamed.mat could not be removed: the "x" it holds now is another variable, and the one taken is now "y". Remove it there by hand.',
    ]);
    assert.ok(namesOf(a).includes('x') && namesOf(a).includes('y'), 'both are where they were');
  });

  it('a cut whose variable was edited, or deleted and the delete undone, is still the one taken, and moves', async () => {
    const w = windowOf();
    const a = await w.mat('same.mat', matFixture('pv_basic.mat'));
    const j = await w.json('target.sldd');
    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'x').ID] });
    await onMat(a, { type: 'edit', rowId: variableOf(a, 'x').id, columnId: 'Value', oldValue: '[1 2 3]', newValue: '[4 5]' });
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the original moved out', () => !namesOf(a).includes('x'));
    assert.deepStrictEqual(errorsIn(j.view.posts), []);

    a.view.send({ type: 'cut', rowIds: [variableRow(a.view.posts, 'p').ID] });
    await onMat(a, { type: 'delete', rowIds: [variableOf(a, 'p').id] });
    a.undo();
    assert.ok(namesOf(a).includes('p'), 'the delete is undone');
    await onJson(j, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await waitFor('the original moved out', () => !namesOf(a).includes('p'));
    assert.deepStrictEqual(errorsIn(j.view.posts), []);
    assert.ok(j.names().includes('p'));
  });

  it('the drag register is let go of after a drop that landed, one refused, and one that failed', async () => {
    const w = windowOf();
    const m = await w.mat('gains.mat', matFixture('pv_basic.mat'));
    const j = await w.json('source.sldd');

    j.view.send({ type: 'dragStart', rowIds: [entryRow(j.view.posts, 'charStr').ID] });
    await onMat(m, { type: 'drop', rowId: '', mode: 'copy' });
    assert.deepStrictEqual(errorsIn(m.view.posts), []);
    assert.ok(namesOf(m).includes('charStr'));
    assert.strictEqual(w.registers.getDrag(), null, 'landed');

    j.view.send({ type: 'dragStart', rowIds: [entryRow(j.view.posts, 'MyEnum').ID] });
    await onMat(m, { type: 'drop', rowId: '', mode: 'copy' });
    assert.match(errorsIn(m.view.posts)[0], /^Cannot paste "MyEnum" into "gains\.mat"/);
    assert.strictEqual(w.registers.getDrag(), null, 'refused');

    const session = w.session as any;
    const paste = session.pasteEntries;
    session.pasteEntries = () => {
      throw new Error('the paste broke');
    };
    try {
      j.view.send({ type: 'dragStart', rowIds: [entryRow(j.view.posts, 'myStruct').ID] });
      m.view.posts.length = 0;
      m.view.send({ type: 'drop', rowId: '', mode: 'move' });
      await waitFor('the failure said', () => errorsIn(m.view.posts).length > 0);
    } finally {
      session.pasteEntries = paste;
    }
    assert.deepStrictEqual(errorsIn(m.view.posts), ['Failed to apply edit: the paste broke']);
    assert.strictEqual(w.registers.getDrag(), null, 'failed');
    assert.ok(j.names().includes('myStruct'), 'a failed move takes nothing out of its source');
  });
});

// --- cutPasteEndToEnd.test.ts, dropEndToEnd.test.ts, multiSelectInvariants.test.ts --------------

// The unit tests' fixture: ten derived entries in `arch` and an EMPTY `design`. The two sections
// share one namespace (the split is purely `isderived`), so flipping the first entry's flag moves
// `AliasType` into design: the mixed fixture, in memory only.
const ARCH = 'test/fixtures/arch.sldd';
const archText = decode(file(ARCH));
const mixedText = archText.replace('"isderived": "1"', '"isderived": "0"');

/** A dictionary of the arch fixture (or `text`), its first rows and its posted section rules. */
async function archTab(w: ReturnType<typeof windowOf>, as: string, text = archText) {
  const o = await w.json(as, ARCH, encode(text));
  const rows = paintedRows(o.view.posts);
  const painted = o.view.posts.filter((m) => m.type === 'sectionRules').pop();
  assert.ok(painted, 'the engine posted its section rules');
  /** The drop target `sectionName` is, as the table predicts against it. */
  const target = (sectionName: string) => {
    const rule = (painted.rules as any[]).find((r) => r.sectionName === sectionName);
    assert.ok(rule, `the dictionary has a ${sectionName} section`);
    return { docUri: painted.docUri, ...rule };
  };
  return { o, rows, painted, target, id: (name: string) => rowOf(rows, name).ID };
}

interface ReadEntry {
  name: string;
  isDerived: boolean;
  className: string;
  kind: string;
}

/**
 * A section of what the document's text says now, read afresh by core as a reopen reads it: the
 * unit tests' oracle, which read each result back with getModel after an invalidate.
 */
const sectionOf = (o: Opened, name: string): ReadEntry[] =>
  readSldd(encode(o.text.text), (dict: any) => {
    const section = (dict.children as any[]).find((s: any) => s.name === name);
    assert.ok(section, `the document has a ${name} section`);
    return (section.children as any[]).map((c: any) => ({ name: c.name, isDerived: c.isDerived, className: c.className, kind: c.kind }));
  });
const namesIn = (o: Opened, section: string): string[] => sectionOf(o, section).map((c) => c.name);
const childOf = (o: Opened, section: string, name: string): ReadEntry | undefined => sectionOf(o, section).find((c) => c.name === name);

/** Start a drag of `rowIds` and answer the descriptor the engine broadcast for it. */
async function dragOf(o: Opened, rowIds: string[]): Promise<any> {
  o.view.posts.length = 0;
  o.view.send({ type: 'dragStart', rowIds });
  await waitFor('the drag descriptor', () => o.view.posts.some((m) => m.type === 'dragState' && m.descriptor));
  return o.view.posts.filter((m) => m.type === 'dragState' && m.descriptor).pop().descriptor;
}

describe('cut/paste end-to-end — same-document cut+paste is a MOVE that keeps the name', () => {
  it('cuts an arch Data Interface and pastes into Design Data: gone from arch, kept name in design', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'cutpaste-move.sldd');
    const version = o.text.version;
    // The cut marks the clipboard; NO text edit happens yet (lazy).
    o.view.send({ type: 'cut', rowIds: [id('DataInterface')] });
    assert.deepStrictEqual(w.registers.getClipboard()?.items.map((i) => i.sourceSection), ['arch']);
    await settle();
    assert.strictEqual(o.text.version, version, 'the cut wrote nothing');

    // Pasted into design (a different section): the source goes first, in the same text, so the
    // whole move is one edit and the freed name is kept.
    await onJson(o, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    await quiet();
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.strictEqual(o.text.version - version, 1, 'one combined edit, one undo step');
    assert.ok(!namesIn(o, 'arch').includes('DataInterface'), 'left arch');
    const moved = childOf(o, 'design', 'DataInterface');
    assert.ok(moved, 'arrived in design, under its own name');
    assert.strictEqual(moved.isDerived, false, 'rebound to design (isderived rewritten)');
  });
});

describe('cut/paste end-to-end — same-section cut+paste is a no-op', () => {
  it('pasting a cut back into its own section would just delete-and-re-add — the handler refuses', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'cutpaste-noop.sldd');
    const before = o.text.text;
    const version = o.text.version;
    o.view.send({ type: 'cut', rowIds: [id('DataInterface')] });
    o.view.posts.length = 0;
    // Aimed at the cut entry's own row, which resolves to the section it came from.
    o.view.send({ type: 'paste', rowId: id('DataInterface') });
    await waitFor('the cut to be spent', () => w.registers.getClipboard() === null);
    // An edit or a word the no-op must not make.
    await quiet();
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.strictEqual(o.text.version, version, 'no edit');
    assert.strictEqual(o.text.text, before);
    assert.ok(namesIn(o, 'arch').includes('DataInterface'), 'the entry stays where it was');
  });
});

describe('cut/paste end-to-end — cross-DOCUMENT cut+paste', () => {
  it('cuts an entry in doc A and pastes into doc B: removed from A, present (uniquified) in B', async () => {
    const w = windowOf();
    const a = await archTab(w, 'cutpaste-A.sldd');
    const b = await archTab(w, 'cutpaste-B.sldd');
    a.o.view.send({ type: 'cut', rowIds: [a.id('DataInterface')] });
    await onJson(b.o, { type: 'paste', rowId: 'section:design' });
    await moveDone(w);
    // A's delete is its own edit, after B's.
    await waitFor('the original taken out of A', () => !entryNames(a.o.text.text).includes('DataInterface'));
    await quiet();
    assert.deepStrictEqual(errorsIn(b.o.view.posts), []);
    assert.ok(!namesIn(a.o, 'arch').includes('DataInterface'), 'removed from A');
    // B already holds "DataInterface" (it is a copy of the fixture), so the paste uniquifies.
    assert.ok(namesIn(b.o, 'design').includes('DataInterface1'), 'present in B, uniquified');
  });
});

describe('cut/paste end-to-end — copy+paste leaves the source and uniquifies', () => {
  it('copies an arch Data Interface into design: still in arch, duplicated as a uniquified design entry', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'cutpaste-copy.sldd');
    o.view.send({ type: 'copy', rowIds: [id('DataInterface')] });
    await onJson(o, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.ok(namesIn(o, 'arch').includes('DataInterface'), 'the source stays');
    const copy = childOf(o, 'design', 'DataInterface1');
    assert.ok(copy, 'uniquified, since the source still holds the name');
    assert.strictEqual(copy.isDerived, false, 'rebound to design');
  });

  it('a copy stays on the clipboard for re-paste, producing a second uniquified entry', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'cutpaste-copy2.sldd');
    o.view.send({ type: 'copy', rowIds: [id('DataInterface')] });
    await onJson(o, { type: 'paste', rowId: 'section:design' });
    assert.ok(w.registers.getClipboard(), 'the copy is still on the clipboard');
    await onJson(o, { type: 'paste', rowId: 'section:design' });
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    const names = namesIn(o, 'design');
    assert.ok(names.includes('DataInterface1'));
    assert.ok(names.includes('DataInterface2'), 'the second paste uniquifies again');
  });
});

describe('drop end-to-end — cross-section MOVE within one document', () => {
  it('moves an arch Data Interface into Design Data: gone from arch, a genuine design entry keeping its name', async () => {
    const w = windowOf();
    const { o, id, target } = await archTab(w, 'e2e-move.sldd');
    // Predict first: the table would show "Convert Data Interface to Bus".
    const decision = dropDecision(await dragOf(o, [id('DataInterface')]), target('design'), 'move');
    assert.strictEqual(decision.canDrop, true);
    assert.strictEqual(decision.tooltip, 'Convert Data Interface to Bus');

    await onJson(o, { type: 'drop', rowId: 'section:design', mode: 'move' });
    await quiet();
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.ok(!namesIn(o, 'arch').includes('DataInterface'), 'left arch');
    const moved = childOf(o, 'design', 'DataInterface');
    assert.ok(moved, 'arrived in design');
    assert.strictEqual(moved.isDerived, false, 'now a genuine design entry (isderived rewritten)');
    // A MOVE frees the source name, so the drop keeps it; the document's SystemComposer catalog is
    // keyed by NAME and only the entries array is rewritten, so it is still a Data Interface.
    assert.strictEqual(moved.className, 'Simulink.Bus', 'the underlying class is unchanged by the move');
    assert.strictEqual(moved.kind, 'Data Interface', 'the name-keyed catalog still classifies it');
    assert.strictEqual(w.registers.getDrag(), null, 'and the drop ended the drag');
  });
});

describe('drop end-to-end — cross-section COPY leaves the source', () => {
  it('copies an arch Data Interface into design: still in arch, duplicated in design', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'e2e-copy.sldd');
    await dragOf(o, [id('DataInterface')]);
    await onJson(o, { type: 'drop', rowId: 'section:design', mode: 'copy' });
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.ok(namesIn(o, 'arch').includes('DataInterface'), 'the source stays');
    const copy = childOf(o, 'design', 'DataInterface1');
    assert.ok(copy, 'uniquified to DataInterface1');
    // A name the SystemComposer catalog does not classify: the Kind falls back to the class.
    assert.strictEqual(copy.className, 'Simulink.Bus');
    assert.strictEqual(copy.kind, 'Bus');
  });
});

describe('drop end-to-end — cross-DOCUMENT move', () => {
  it('moves an entry from doc A into doc B: removed from A, present in B', async () => {
    const w = windowOf();
    const a = await archTab(w, 'e2e-A.sldd');
    const b = await archTab(w, 'e2e-B.sldd');
    await dragOf(a.o, [a.id('DataInterface')]);
    await onJson(b.o, { type: 'drop', rowId: 'section:design', mode: 'move' });
    await waitFor('the original taken out of A', () => !entryNames(a.o.text.text).includes('DataInterface'));
    await quiet();
    assert.deepStrictEqual(errorsIn(b.o.view.posts), []);
    assert.ok(!namesIn(a.o, 'arch').includes('DataInterface'), 'removed from A');
    assert.ok(namesIn(b.o, 'design').includes('DataInterface1'), 'present in B');
  });
});

describe('drop end-to-end — a MOVE whose rows span two sections (V-002)', () => {
  it('design/AliasType + arch/DataInterface onto arch: both end in arch under their own names', async () => {
    const w = windowOf();
    const { o, id, target } = await archTab(w, 'e2e-mixed.sldd', mixedText);
    assert.deepStrictEqual(namesIn(o, 'design'), ['AliasType']);

    // Predicted as a move. It used to be refused as a same-section no-op.
    const decision = dropDecision(await dragOf(o, [id('AliasType'), id('DataInterface')]), target('arch'), 'move');
    assert.strictEqual(decision.noop, false);
    assert.strictEqual(decision.canDrop, true);

    await onJson(o, { type: 'drop', rowId: 'section:arch', mode: 'move' });
    await quiet();
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    const archNames = namesIn(o, 'arch');
    assert.ok(archNames.includes('AliasType'));
    assert.ok(archNames.includes('DataInterface'));
    assert.deepStrictEqual(archNames.filter((n) => /^(AliasType|DataInterface)\d+$/.test(n)), [], 'no renamed copies');
    assert.strictEqual(childOf(o, 'arch', 'AliasType')?.isDerived, true);
    assert.deepStrictEqual(sectionOf(o, 'design'), [], 'nothing is left in design');
  });
});

describe('drop end-to-end — same-section move is a no-op', () => {
  it('dropDecision refuses a same-doc same-section move (no delete/re-add)', async () => {
    const w = windowOf();
    const { o, id, target } = await archTab(w, 'e2e-noop.sldd');
    const decision = dropDecision(await dragOf(o, [id('DataInterface')]), target('arch'), 'move');
    assert.strictEqual(decision.noop, true);
    assert.strictEqual(decision.canDrop, false);

    // And the engine, sent the drop the table would not send, makes no edit of it.
    const before = o.text.text;
    o.view.posts.length = 0;
    o.view.send({ type: 'drop', rowId: 'section:arch', mode: 'move' });
    await waitFor('the drag to end', () => w.registers.getDrag() === null);
    await quiet();
    assert.deepStrictEqual(errorsIn(o.view.posts), []);
    assert.strictEqual(o.text.text, before, 'no delete, no re-add');
  });
});

describe('drop end-to-end — rejected drop is predicted and never performed', () => {
  it('a ServiceInterface dropped into design is rejected, and the engine refuses the drop', async () => {
    const w = windowOf();
    const { o, id, target } = await archTab(w, 'e2e-reject.sldd');
    const decision = dropDecision(await dragOf(o, [id('ServiceInterface')]), target('design'), 'copy');
    assert.strictEqual(decision.canDrop, false);
    assert.strictEqual(decision.tooltip, 'Service Interface cannot be in Design Data');

    // And the host agrees: it refuses the drop, and writes nothing.
    const before = o.text.text;
    await onJson(o, { type: 'drop', rowId: 'section:design', mode: 'copy' });
    await quiet();
    assert.strictEqual(errorsIn(o.view.posts).length, 1, `refused (${JSON.stringify(errorsIn(o.view.posts))})`);
    assert.strictEqual(o.text.text, before, 'and the document is untouched');
    assert.strictEqual(w.registers.getDrag(), null, 'and the drag is over');
  });
});

describe('a multi-row gesture keeps each source’s own section', () => {
  it('the clipboard and the drag register both record one per item', async () => {
    const w = windowOf();
    const { o, id } = await archTab(w, 'invariants.sldd', mixedText);
    const sel = [id('AliasType'), id('DataInterface')];
    o.view.send({ type: 'copy', rowIds: sel });
    const clip = w.registers.getClipboard()!.items;
    assert.deepStrictEqual(clip.map((i) => `${i.sourceSection}/${String(i.payload.name)}`), ['design/AliasType', 'arch/DataInterface']);

    // V-002: the drag register carries the section per item, as the clipboard does.
    await dragOf(o, sel);
    const dragSections = w.registers.getDrag()!.items.map((i) => i.sourceSection);
    assert.deepStrictEqual(dragSections, ['design', 'arch']);
    assert.deepStrictEqual(dragSections, clip.map((i) => i.sourceSection));
  });
});

describe('a drag across two sections is a move, not a no-op (V-002)', () => {
  // The whole engine-to-table path: the rows the engine's drag start takes, out as the descriptor
  // it broadcasts, handed to dropDecision as table-main's predictDrop hands it.
  const predict = async (names: string[], onto: string) => {
    const w = windowOf();
    const { o, id, target } = await archTab(w, 'invariants.sldd', mixedText);
    return dropDecision(await dragOf(o, names.map(id)), target(onto), 'move');
  };

  it('design/AliasType + arch/DataInterface onto arch: allowed, and not refused as a no-op', async () => {
    const d = await predict(['AliasType', 'DataInterface'], 'arch');
    assert.strictEqual(d.noop, false);
    assert.strictEqual(d.canDrop, true);
    assert.strictEqual(d.cursor, 'move');
  });

  it('the same pair onto design: allowed', async () => {
    const d = await predict(['AliasType', 'DataInterface'], 'design');
    assert.strictEqual(d.noop, false);
    assert.strictEqual(d.canDrop, true);
  });

  it('two rows of one section dropped back onto it are still the no-op', async () => {
    const d = await predict(['DataInterface', 'StructType'], 'arch');
    assert.strictEqual(d.noop, true);
    assert.strictEqual(d.canDrop, false);
  });
});

describe('a drag is a no-op exactly where the same cut and paste is (V-002)', () => {
  // The host side's rule is transfer.ts's isNoopMove, for a paste AND a drop. Here each pair is also
  // run: the engine's paste of the same cut makes no edit and says nothing exactly where the rule
  // says it is the no-op.
  const CASES: { name: string; sel: (id: (name: string) => string, rows: any[]) => string[] }[] = [
    { name: 'one design entry', sel: (id) => [id('AliasType')] },
    { name: 'one arch entry', sel: (id) => [id('DataInterface')] },
    { name: 'two arch entries', sel: (id) => [id('DataInterface'), id('StructType')] },
    { name: 'design then arch', sel: (id) => [id('AliasType'), id('DataInterface')] },
    { name: 'arch then design', sel: (id) => [id('DataInterface'), id('AliasType')] },
    { name: 'everything (Ctrl+A)', sel: (_id, rows) => rows.map((r) => r.ID) },
  ];
  const SECTIONS = ['design', 'arch', 'config', 'other'];

  it('the fixture has exactly the sections the matrix covers', async () => {
    const { painted } = await archTab(windowOf(), 'noop-sections.sldd', mixedText);
    assert.deepStrictEqual((painted.rules as any[]).map((r) => r.sectionName).sort(), [...SECTIONS].sort());
  });

  let n = 0;
  for (const { name, sel } of CASES) {
    for (const section of SECTIONS) {
      it(`${name} onto ${section}`, async () => {
        const w = windowOf();
        const { o, id, rows, target } = await archTab(w, `noop-${n++}.sldd`, mixedText);
        const ids = sel(id, rows);

        // The prediction, from the descriptor the engine broadcast; then the drag is let go of.
        const drop = dropDecision(await dragOf(o, ids), target(section), 'move');
        o.view.send({ type: 'dragEnd' });
        assert.strictEqual(w.registers.getDrag(), null, 'the drag ended');

        // The same rows cut: the rule, asked of what the cut put on the clipboard.
        o.view.send({ type: 'cut', rowIds: ids });
        const clip = w.registers.getClipboard();
        assert.ok(clip?.items.length, 'the selection names entries');
        const pasteIsNoop = isNoopTransfer({ items: clip!.items, sourceDocUri: clip!.sourceDocUri, move: true }, o.engine.uri, section);
        assert.strictEqual(drop.noop, pasteIsNoop, `drop no-op: ${drop.noop}, paste no-op: ${pasteIsNoop}`);

        // And the paste itself, run.
        const version = o.text.version;
        o.view.posts.length = 0;
        o.view.send({ type: 'paste', rowId: `section:${section}` });
        await waitFor(
          'the paste to land, be refused, or be spent',
          () => o.text.version > version || errorsIn(o.view.posts).length > 0 || w.registers.getClipboard() === null,
        );
        await quiet();
        const nothingDone = o.text.version === version && errorsIn(o.view.posts).length === 0;
        assert.strictEqual(nothingDone, pasteIsNoop, `the engine's paste ${nothingDone ? 'did nothing' : 'acted'} (${JSON.stringify(errorsIn(o.view.posts))})`);
      });
    }
  }
});

// The repaint half of a clipboard broadcast, which data-explorer-vscode test/editorHub.test.ts held
// ("posts clipboardState AND repaints every registered webview", deleted with vscode's V4): every
// table of the document is told the state, and repaints the rows it marks, not only the table the
// copy came from, which repaints its own as it copies. A second table of one document hears it only
// through the registers' broadcast.
describe('a clipboard broadcast, on a JSON .sldd', () => {
  it('a clipboard broadcast repaints the marked rows', async () => {
    const o = await open(WORKSPACE_PARAMS);
    const second = viewOf(o.engine);
    second.send({ type: 'ready' });
    await waitFor("the second table's rows", () => second.posts.some((p) => p.type === 'setRows'));
    await settle();
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
