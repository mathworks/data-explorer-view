// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/slddStreamObjectEdits.test.ts at c73da3c
//
// An edit of a Simulink.Parameter's or a Simulink.Signal's property INSIDE a binary dictionary value
// that is a MAT stream, run against view's binary dictionary engine through the messages its table
// sends, and saved. A binary dictionary holds an entry's whole Value as hex when the value also
// holds something its XML cannot spell (here a sparse array beside the objects); core takes an edit
// of an allow-listed property of an object in such a stream and writes it by swapping that object's
// cells in the stream's subsystem, EncodedLength the exact byte count.
//
// The engine splices each edited entry into the chunk it keeps as text (core's spliceEntryObject),
// and its save gate compares that chunk with the file's, entry by entry. So this asks: does the
// table offer the cells core takes and no others, does the edit reach the saved bytes, does the gate
// let it through, does every other entry stay the bytes it was, and do undo and redo hold. The
// suite's text-dictionary half, and the copies between the two editors, wait for the JSON engine
// (C3).
//
// The fixture is core's (test/fixtures/sldd-stream-objects, which MATLAB wrote). What a save holds
// is cut from it with string slicing and a walk of the stream's element tags, never read with the
// code under test; what it reads as is asked of a fresh core session; and the stream the engine
// writes is held to the one core's own save writes for the same edits.
import * as assert from 'node:assert';
import { createSession, ingest } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { file, membersOf, open, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const BINARY = 'test/fixtures/sldd-stream-objects/stream_objects_binary.sldd';
const BINARY_FIXTURE = 'stream_objects_binary.sldd';
const CHUNK_XML = 'data/chunk0.xml';

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

// --- reading a dictionary, without the engine --------------------------------------------

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

/** That each of `names` reads back from a save, row for row, as the engine showed it before the save. */
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
  return out.bytes;
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
  for (const [key, cell] of Object.entries(row)) {
    if (key !== 'Name' && key !== 'Value' && cell && typeof cell === 'object' && (cell as any).editable === true) keys.push(key);
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

// --- a MAT stream, read by hand ----------------------------------------------------------

/**
 * Where each element of a stream ends: an 8-byte preamble, then each element's 8-byte tag (its type,
 * then its byte count) and its data padded to 8 bytes — getByteStreamFromArray's layout.
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

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

// --- a binary dictionary's chunk, cut by hand ---------------------------------------------

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
const LASTMOD = /<P Name="LastMod" Class="char">[^<]*<\/P>/;

/** An entry's hex Value: its tag's Class and EncodedLength, its text, and the bytes its digits spell. */
function hexValue(entry: string): { tag: string; cls: string; encodedLength: number; digits: number; bytes: Uint8Array } {
  const m = HEX_VALUE.exec(entry);
  assert.ok(m, `the entry holds a hex Value (${entry.slice(0, 160)})`);
  const digits = m![3].replace(/\s+/g, '');
  const bytes = new Uint8Array(digits.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(digits.substr(2 * i, 2), 16);
  return { tag: m![0], cls: m![1], encodedLength: Number(m![2]), digits: digits.length, bytes };
}

/**
 * That `saved`'s chunk is `original`'s with only the Value and the LastMod of the entries in `edited`
 * changed, each still a stream of a value and its subsystem whose EncodedLength is its byte count,
 * the value's bytes as they were; and that its other members are the file's.
 */
function assertOnlyStreamsChanged(original: Record<string, Uint8Array>, saved: Record<string, Uint8Array>, edited: string[]): void {
  assert.deepStrictEqual(Object.keys(saved).sort(), Object.keys(original).sort(), 'the package holds the members it held');
  for (const member of Object.keys(original)) {
    if (member !== CHUNK_XML) assert.ok(sameBytes(saved[member], original[member]), `${member} is the bytes it was`);
  }
  const was = chunkEntries(dec(original[CHUNK_XML]));
  const now = chunkEntries(dec(saved[CHUNK_XML]));
  assert.strictEqual(now.head, was.head, 'the text before the first entry is as it was');
  assert.deepStrictEqual([...now.entries.keys()], [...was.entries.keys()], 'the entries are the ones there were, in their order');
  for (const [name, text] of was.entries) {
    const after = now.entries.get(name)!;
    if (!edited.includes(name)) {
      assert.strictEqual(after, text, `${name}, which no edit touched, is the bytes MATLAB wrote`);
      continue;
    }
    assert.notStrictEqual(after, text, `${name} was written`);
    const before = hexValue(text);
    const hex = hexValue(after);
    const mask = (entry: string, tag: string) => entry.replace(tag, '<VALUE/>').replace(LASTMOD, '<LASTMOD/>');
    assert.strictEqual(mask(after, hex.tag), mask(text, before.tag), `${name} changes in its Value and its LastMod alone`);
    assert.strictEqual(hex.cls, before.cls, `${name}'s Value keeps its Class`);
    assert.strictEqual(hex.digits, 2 * hex.bytes.length, `${name}'s hex is whole bytes`);
    assert.strictEqual(hex.encodedLength, hex.bytes.length, `${name}'s EncodedLength is the byte count its hex spells`);
    const ends = elementEnds(hex.bytes, 3);
    assert.deepStrictEqual(ends.slice(1), [hex.bytes.length], `${name}'s stream is a value and its subsystem, and nothing more`);
    const valueEnd = elementEnds(before.bytes, 1)[0];
    assert.strictEqual(ends[0], valueEnd, `${name}'s value element is as long as it was`);
    assert.ok(sameBytes(hex.bytes.subarray(0, valueEnd), before.bytes.subarray(0, valueEnd)), `${name}'s value element is the bytes it was`);
  }
}

// --- the binary engine -------------------------------------------------------------------

/** The binary fixture, open in the engine and painted through a table across a channel. */
async function openBinary() {
  const bytes = file(BINARY);
  const original = membersOf(bytes);
  // No waits in here: the engine answers `ready`, `edit` and `addChild` synchronously.
  const b: Opened = await open(BINARY, bytes, { as: BINARY_FIXTURE });
  assert.ok(b.view.posts.some((m) => m.type === 'setRows'), 'the first paint sent the whole table');

  /** One cell edit, as the table sends it; the posts it caused. */
  const edit = ([path, prop, text]: Edit): any[] => {
    const node = nodeAt(b.model(), path);
    const mark = b.view.posts.length;
    b.view.send({ type: 'edit', rowId: node.id, columnId: prop, oldValue: '', newValue: text });
    return b.view.posts.slice(mark);
  };

  /** Save, and read back the members the file now holds. */
  const save = (): Record<string, Uint8Array> => membersOf(b.save());
  return { bytes, original, b, edit, save };
}

/** The Value tag core's own save writes for `name` after `edits` of the binary fixture. */
function coreValueTag(bytes: Uint8Array, edits: Edit[], name: string): string {
  const saved = membersOf(coreSaved(bytes, BINARY_FIXTURE, edits));
  return hexValue(chunkEntries(dec(saved[CHUNK_XML])).entries.get(name)!).tag;
}

describe('An object inside a binary .sldd value stream, edited in the binary editor', () => {
  it('the table offers an editor for each property core takes in a stream, and for nothing else there', async () => {
    const { b } = await openBinary();
    assert.deepStrictEqual(sorted(offeredInTable(b.model(), b.view.posts)), sorted(OFFERED));
  });

  it('a Value and a Description edited in hex save as that stream, its EncodedLength exact, every other entry as MATLAB wrote it', async () => {
    const EDITS: Edit[] = [
      ['sPh.p', 'Value', '7'],
      ['sPh.p', 'Description', 'new description'],
      ['pSp', 'Description', 'sparse described'],
      ['cPh{1}.Value(2)', 'Value', '20'],
    ];
    const s = await openBinary();
    for (const e of EDITS) assert.deepStrictEqual(problemsIn(s.edit(e)), [], `${e.join(' ')} was taken`);
    assert.strictEqual(s.b.events.length, EDITS.length, 'one undo step an edit');
    // Painted from the edited model, before any save.
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'sPh.p').id).Value, '7');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'sPh.p').id).Description, 'new description');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'cPh{1}.Value(2)').id).Value, '20');

    const saved = s.save();
    assertOnlyStreamsChanged(s.original, saved, ['sPh', 'pSp', 'cPh']);
    const now = chunkEntries(dec(saved[CHUNK_XML])).entries;
    for (const name of ['sPh', 'pSp', 'cPh']) {
      assert.strictEqual(hexValue(now.get(name)!).tag, coreValueTag(s.bytes, EDITS, name), `${name}'s stream is the one core's own save writes`);
    }

    const back = reopened(s.b.disk(), BINARY_FIXTURE);
    assert.strictEqual(nodeAt(back, 'sPh.p').displayValue, '7');
    assert.strictEqual(nodeAt(back, 'sPh.p').Description, 'new description');
    assert.strictEqual(nodeAt(back, 'pSp').Description, 'sparse described');
    assert.strictEqual(nodeAt(back, 'cPh{1}.Value').displayValue, '[1 20 3]');
    assertReadsAsEdited(back, s.b.model(), ['sPh', 'pSp', 'cPh']);
  });

  it('undone, the save writes the stream MATLAB wrote; redone, the edit, and the entry takes the next one', async () => {
    const s = await openBinary();
    const original = s.b.engine.chunkXml;
    assert.deepStrictEqual(problemsIn(s.edit(['sPh.p', 'Value', '7'])), [], 'the edit was taken');
    const edited = s.b.engine.chunkXml;
    assert.notStrictEqual(edited, original, 'and reached the document');

    s.b.undo();
    assert.strictEqual(s.b.engine.chunkXml, original, 'undo restored the chunk');
    assert.strictEqual(nodeAt(s.b.model(), 'sPh.p').displayValue, '5', 'and the model');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'sPh.p').id).Value, '5', 'and the row');
    let saved = s.save();
    assert.strictEqual(dec(saved[CHUNK_XML]), dec(s.original[CHUNK_XML]), 'saved undone, the chunk is the bytes MATLAB wrote');

    s.b.redo();
    assert.strictEqual(s.b.engine.chunkXml, edited, 'redo restored the edited chunk');
    assert.strictEqual(nodeAt(s.b.model(), 'sPh.p').displayValue, '7', 'and the model');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'sPh.p').id).Value, '7', 'and the row');
    // The entry redo rebuilt from the chunk it restored still holds its stream, and takes an edit into it.
    assert.deepStrictEqual(problemsIn(s.edit(['sPh.p', 'Description', 'after redo'])), [], 'the edit after the redo was taken');
    saved = s.save();
    assertOnlyStreamsChanged(s.original, saved, ['sPh']);
    const both: Edit[] = [
      ['sPh.p', 'Value', '7'],
      ['sPh.p', 'Description', 'after redo'],
    ];
    assert.strictEqual(
      hexValue(chunkEntries(dec(saved[CHUNK_XML])).entries.get('sPh')!).tag,
      coreValueTag(s.bytes, both, 'sPh'),
      "the stream is the one core's own save writes for both edits",
    );
    const back = reopened(s.b.disk(), BINARY_FIXTURE);
    assert.deepStrictEqual([nodeAt(back, 'sPh.p').displayValue, nodeAt(back, 'sPh.p').Description], ['7', 'after redo']);
  });

  it("what core refuses in a stream is refused by the table in core's words, and nothing is written", async () => {
    const REFUSED: [Edit, RegExp][] = [
      // No rule writes a Parameter's DataType; the stream's whole value is a struct, edited a field
      // at a time, so it takes no Value typed over it; and a string beside the objects is one the
      // value written anew could not hold.
      [['sPh.p', 'DataType', 'single'], ENCODED_REASON],
      [['sPh', 'Value', '1'], /^Cannot edit the Value of "sPh": it is a struct, whose fields are edited one at a time\.$/],
      [['sPh.q', 'Value', '"abc"'], /^Cannot edit "sPh": sPh\.q would hold a string, which a save does not write into its MAT stream\.$/],
      // An allow-listed property the stream holds no value for, and one the rules refuse.
      [['sTh.t', 'Description', 'x'], /^Cannot edit "sTh": sTh\.t\.Description is at its class default/],
      [['sPh.p', 'Min', '20'], /^Cannot edit "sPh": sPh\.p\.Min \(20\) would be greater than its Max \(10\)/],
      [['pSp', 'Value', '[1 2]'], /^Cannot edit "pSp": pSp\.Value is a sparse double/],
    ];
    const s = await openBinary();
    const original = s.b.engine.chunkXml;
    for (const [e, words] of REFUSED) {
      const posts = s.edit(e);
      const refusals = posts.filter((m) => m.type === 'validationError');
      assert.strictEqual(refusals.length, 1, `${e.join(' ')}: one refusal (${JSON.stringify(posts.map((m) => m.type))})`);
      assert.match(refusals[0].reason, words, `${e.join(' ')}: in the words for it`);
      assert.strictEqual(refusals[0].reason, coreRefusal(s.bytes, BINARY_FIXTURE, e), `${e.join(' ')}: core's own`);
      assert.strictEqual(s.b.engine.chunkXml, original, `${e.join(' ')}: the chunk is as it was`);
    }
    assert.strictEqual(s.b.events.length, 0, 'no edit was pushed');
    assert.strictEqual(nodeAt(s.b.model(), 'sPh.p').displayValue, '5', 'the model is as read');
    const saved = s.save();
    assert.strictEqual(dec(saved[CHUNK_XML]), dec(s.original[CHUNK_XML]), 'and a save writes the bytes MATLAB wrote');
  });

  it('a handle two fields share is edited through one, shown by both, written once; the other takes no edit of its own', async () => {
    const s = await openBinary();
    assert.deepStrictEqual(problemsIn(s.edit(['shared.a', 'Value', '40'])), [], 'the edit was taken');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'shared.b').id).Value, '40', 'the other field shows it at once');
    assert.strictEqual(rowOf(s.b.view.posts, nodeAt(s.b.model(), 'shared.b').id)._valueEditable, false, 'and offers no editor of its own');
    const posts = s.edit(['shared.b', 'Value', '41']);
    assert.match(
      posts.find((m) => m.type === 'validationError')?.reason ?? '',
      /^Cannot edit "shared": shared\.b is one object with shared\.a \(one handle\)/,
      'an edit through it is refused',
    );
    const saved = s.save();
    assertOnlyStreamsChanged(s.original, saved, ['shared']);
    assert.strictEqual(
      hexValue(chunkEntries(dec(saved[CHUNK_XML])).entries.get('shared')!).tag,
      coreValueTag(s.bytes, [['shared.a', 'Value', '40']], 'shared'),
      "the stream is the one core's own save writes",
    );
    const back = reopened(s.b.disk(), BINARY_FIXTURE);
    assert.deepStrictEqual([nodeAt(back, 'shared.a').displayValue, nodeAt(back, 'shared.b').displayValue], ['40', '40']);
  });

  it('an element added to a Value in a stream, and an edit after the entry is renamed, save as core saves them', async () => {
    const s = await openBinary();
    // An element added to a Parameter's array Value, as the table's Add Child sends it.
    const mark = s.b.view.posts.length;
    s.b.view.send({ type: 'addChild', rowId: nodeAt(s.b.model(), 'cPh{1}.Value').id });
    assert.deepStrictEqual(problemsIn(s.b.view.posts.slice(mark)), [], 'the element was added');
    assert.strictEqual(nodeAt(s.b.model(), 'cPh{1}.Value').displayValue, '[1 2 3 0]');
    // The entry holding a stream keeps its rename, and the stream takes an edit after it.
    assert.deepStrictEqual(problemsIn(s.edit(['sPh', 'Name', 'sPhRenamed'])), [], 'the rename was taken');
    assert.deepStrictEqual(problemsIn(s.edit(['sPhRenamed.p', 'Value', '7'])), [], 'the edit after it was taken');

    const saved = s.save();
    const now = chunkEntries(dec(saved[CHUNK_XML])).entries;
    assert.ok(!now.has('sPh') && now.has('sPhRenamed'), 'the entry is saved under its new name');
    const sPh = chunkEntries(dec(s.original[CHUNK_XML])).entries.get('sPh')!;
    const renamed = now.get('sPhRenamed')!;
    const hex = hexValue(renamed);
    assert.strictEqual(hex.encodedLength, hex.bytes.length, "the renamed entry's EncodedLength is its byte count");
    assert.strictEqual(hex.tag, coreValueTag(s.bytes, [['sPh.p', 'Value', '7']], 'sPh'), 'its stream is the one the edit writes without the rename');
    assert.strictEqual(
      renamed.replace(hex.tag, '').replace(LASTMOD, '').replace('>sPhRenamed<', '>sPh<'),
      sPh.replace(hexValue(sPh).tag, '').replace(LASTMOD, ''),
      'and the rest of it is the bytes it was, but for its name',
    );
    // The element added: core's own save of the same gesture.
    const session = createSession();
    const root: any = ingest(session, s.bytes, { filename: BINARY_FIXTURE });
    session.setActiveContext(root);
    session.setActive(root, nodeAt(root, 'cPh{1}.Value'));
    assert.ok(session.addChildTo(nodeAt(root, 'cPh{1}.Value').id), 'core adds the element too');
    const core = membersOf((session.serializeSource(root.name) as any).bytes);
    assert.strictEqual(
      hexValue(now.get('cPh')!).tag,
      hexValue(chunkEntries(dec(core[CHUNK_XML])).entries.get('cPh')!).tag,
      "cPh's stream is the one core's own save writes",
    );

    const back = reopened(s.b.disk(), BINARY_FIXTURE);
    assert.strictEqual(nodeAt(back, 'cPh{1}.Value').displayValue, '[1 2 3 0]');
    assert.strictEqual(nodeAt(back, 'sPhRenamed.p').displayValue, '7');
  });
});
