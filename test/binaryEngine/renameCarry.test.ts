// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/archRenameCarry.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/functionRenameThroughEditors.test.ts at c73da3c.
//
// A rename that a compressed dictionary's System Composer catalog has to follow, run against view's
// binary dictionary engine: the catalog (`interfaceDictionary.xml`) is a zip member the editor only
// passes through, so carrying the rename into it is a member swap on the same undo step, which a
// save writes, an undo puts back byte for byte, and a revert reads back from the file. The
// extension's archRenameCarry composed the edit itself, the provider's applyEdit minus the message
// that starts it; here every rename is the table's own `edit` message, the provider's applyEdit
// whole, as functionRenameThroughEditors sends it. A revert is the engine's `replace` with the
// file's bytes, and one that cannot read the file its `revertToSaved`. The text editor's half of
// functionRenameThroughEditors waits for the JSON engine (C3).
import * as assert from 'node:assert';
import { SC_PART_XML, createSession, editRefusalText, ingest, scXmlRenamePatch } from 'data-explorer-core';
import { unzipSync, zipSync } from 'fflate';
import { describe, it } from 'vitest';
import { errorsIn, file, isEntryRow, membersOf, nameOf, open, readSldd, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const ARCH_BINARY = 'test/fixtures/arch_binary.sldd';
const SERVICE_BINARY = 'test/fixtures/arch_service_binary.sldd';
const CHUNK_XML = 'data/chunk0.xml';

/** The parts of a saved `.sldd`: its chunk and every other member. */
function partsOf(bytes: Uint8Array): { chunkXml: string; zipMeta: Record<string, Uint8Array> } {
  const zip = membersOf(bytes);
  const zipMeta: Record<string, Uint8Array> = {};
  for (const [member, data] of Object.entries(zip)) if (member !== CHUNK_XML) zipMeta[member] = data;
  return { chunkXml: dec(zip[CHUNK_XML]), zipMeta };
}

/** How each entry of a saved `.sldd` classifies, as core reads the chunk and the catalog together. */
const kindsOf = (bytes: Uint8Array): Record<string, string> =>
  readSldd(bytes, (dict) => {
    const out: Record<string, string> = {};
    for (const section of dict.children as any[]) for (const entry of section.children as any[]) out[entry.name] = entry.kind;
    return out;
  });

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

/** The row the table holds for `step`, from the newest paint that carries it. */
function rowOf(posts: any[], step: Step): any {
  for (let i = posts.length - 1; i >= 0; i--) {
    const msg = posts[i];
    if (msg.type !== 'setRows' && msg.type !== 'updateEntryRows') continue;
    const rows = msg.rows as any[];
    const entry = rows.find((r) => isEntryRow(r) && nameOf(r) === step.entry);
    if (!entry) continue;
    if (step.fn === undefined) return entry;
    const fn = rows.find((r) => r.parent === entry.ID && nameOf(r) === step.fn);
    if (fn) return fn;
  }
  assert.fail(`the table was sent a row for ${step.fn ?? step.entry} under ${step.entry}`);
}

/** The `edit` message the table posts for a committed rename of `row`. */
const renameMessage = (row: any, to: string) => ({ type: 'edit', rowId: row.ID, columnId: 'Name', oldValue: nameOf(row), newValue: to });

const refusalsIn = (posts: any[]) => posts.filter((m) => m.type === 'validationError');
const problemsIn = (posts: any[]) => posts.filter((m) => m.type === 'error' || m.type === 'validationError');

/** Send one rename through the table, as it posts one; the posts it caused. */
function rename(o: Opened, step: Step): any[] {
  const row = rowOf(o.view.posts, step);
  const mark = o.view.posts.length;
  o.view.send(renameMessage(row, step.to));
  return o.view.posts.slice(mark);
}

// --- archRenameCarry.test.ts ---------------------------------------------------------------------

describe('Architectural rename carries into the System Composer catalog', () => {
  it('a save writes the renamed entry with the catalog that still classifies it', async () => {
    const bytes = file(ARCH_BINARY);
    const original = partsOf(bytes);
    assert.strictEqual(kindsOf(bytes).StructType, 'Struct Type', 'the fixture starts classified');
    const o = await open(ARCH_BINARY, bytes, { as: 'arch_rename_save.sldd' });
    const part = scXmlRenamePatch(original.zipMeta, 'StructType', 'Wheel');
    assert.ok(part, 'the catalog names this entry, so the rename has a part to carry');

    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'StructType', to: 'Wheel' })), [], 'the rename was accepted');
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], part!.after, 'the edit swapped the catalog member on the document');

    const saved = o.save();
    assert.ok(partsOf(saved).chunkXml.includes('>Wheel<'), 'the saved chunk spells the new name');
    assert.strictEqual(
      kindsOf(saved).Wheel,
      'Struct Type',
      'and the saved catalog still models it as a struct type — without the carry it re-reads as a Data Interface',
    );
  });

  it('undo restores the catalog member byte for byte, and a save writes that back', async () => {
    const bytes = file(ARCH_BINARY);
    const original = partsOf(bytes);
    const o = await open(ARCH_BINARY, bytes, { as: 'arch_rename_undo.sldd' });
    const before = o.engine.chunkXml;
    const part = scXmlRenamePatch(original.zipMeta, 'StructType', 'Wheel')!;
    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'StructType', to: 'Wheel' })), []);
    assert.strictEqual(o.events.length, 1, 'the document edit reached the stack');

    o.undo();
    assert.strictEqual(o.engine.chunkXml, before, 'undo restored the chunk');
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and the catalog member, byte for byte');

    o.redo();
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], part.after, 'redo swapped it back');

    // What undo leaves behind is what a save writes — both surfaces or neither.
    o.undo();
    const saved = partsOf(o.save());
    assert.strictEqual(saved.chunkXml, original.chunkXml, 'the saved chunk is the undone one');
    assert.deepStrictEqual(saved.zipMeta[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and so is the saved catalog');
  });

  it('a save writes a renamed service function in the chunk and in the catalog', async () => {
    // The catalog's copy of a service interface's function: without the carry the saved chunk says
    // `compute` and the saved catalog still says `f`, which MATLAB reads as two functions.
    const bytes = file(SERVICE_BINARY);
    const original = partsOf(bytes);
    const o = await open(SERVICE_BINARY, bytes, { as: 'arch_rename_function_save.sldd' });
    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'ServiceInterface', fn: 'f', to: 'compute' })), []);
    const held = o.engine.parts[SC_PART_XML];
    assert.notDeepStrictEqual(held, original.zipMeta[SC_PART_XML], 'the edit swapped the catalog member on the document');
    const saved = o.save();
    const parts = partsOf(saved);
    assert.deepStrictEqual(parts.zipMeta[SC_PART_XML], held, 'and the save wrote the member the document held');
    assert.ok(parts.chunkXml.includes('>compute<'), 'the saved chunk spells the new name');
    assert.ok(parts.chunkXml.includes('y = compute(u)'), 'and the Prototype that declares it');
    // Exactly the function's two sites: the data interface named f and g's argument g stay.
    assert.strictEqual(
      dec(parts.zipMeta[SC_PART_XML]),
      replacedOnce(dec(original.zipMeta[SC_PART_XML]), [
        ['<p_FunctionPrototype>y = f(u)</p_FunctionPrototype>', '<p_FunctionPrototype>y = compute(u)</p_FunctionPrototype>'],
        ['<p_Name>f</p_Name>\n        </p_FunctionElements>', '<p_Name>compute</p_Name>\n        </p_FunctionElements>'],
      ]),
      'the saved catalog renames the function at its p_Name and p_FunctionPrototype, and nowhere else',
    );
    assert.strictEqual(kindsOf(saved).ServiceInterface, 'Service Interface', 'and still models the entry');
  });

  it('undo of a service function rename restores the catalog member byte for byte, and a save writes that back', async () => {
    const bytes = file(SERVICE_BINARY);
    const original = partsOf(bytes);
    const o = await open(SERVICE_BINARY, bytes, { as: 'arch_rename_function_undo.sldd' });
    const before = o.engine.chunkXml;
    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'ServiceInterface', fn: 'f', to: 'compute' })), []);
    const after = o.engine.parts[SC_PART_XML];
    assert.strictEqual(o.events.length, 1, 'the rename is ONE edit on the undo stack');

    o.undo();
    assert.strictEqual(o.engine.chunkXml, before, 'undo restored the chunk');
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and the catalog member, byte for byte');

    o.redo();
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], after, 'redo swapped it back');

    o.undo();
    const saved = partsOf(o.save());
    assert.strictEqual(saved.chunkXml, original.chunkXml, 'the saved chunk is the undone one');
    assert.deepStrictEqual(saved.zipMeta[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and so is the saved catalog');
  });

  it('a revert brings the catalog back from disk too, not just the chunk', async () => {
    // A revert re-reads the file, and one that restored only data/chunk0.xml would leave the patched
    // catalog in place: an entry called StructType beside a catalog that defines Wheel.
    const bytes = file(ARCH_BINARY);
    const original = partsOf(bytes);
    const o = await open(ARCH_BINARY, bytes, { as: 'arch_rename_revert.sldd' });
    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'StructType', to: 'Wheel' })), []);

    o.engine.replace(o.disk());
    assert.strictEqual(o.engine.chunkXml, original.chunkXml, 'the revert re-read the chunk');
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and the pass-through catalog with it');

    assert.strictEqual(kindsOf(o.save()).StructType, 'Struct Type', 'so the reverted file is the file it was');
  });

  it('a revert that cannot read the disk puts the catalog back as last read too, not just the chunk', async () => {
    // A revert that fails puts the document back to the file as it last read it — and, for the
    // reason above, the catalog with the chunk.
    const bytes = file(ARCH_BINARY);
    const original = partsOf(bytes);
    const o = await open(ARCH_BINARY, bytes, { as: 'arch_rename_revert_unread.sldd' });
    assert.deepStrictEqual(problemsIn(rename(o, { entry: 'StructType', to: 'Wheel' })), []);

    // The file is gone: what the revert reads is no dictionary, and changes nothing.
    assert.throws(() => o.engine.replace(new Uint8Array([1, 2, 3])));
    o.engine.revertToSaved();
    assert.strictEqual(o.engine.chunkXml, original.chunkXml, 'the chunk as last read');
    assert.deepStrictEqual(o.engine.parts[SC_PART_XML], original.zipMeta[SC_PART_XML], 'and the pass-through catalog with it');
  });
});

// --- functionRenameThroughEditors.test.ts: the binary editor -------------------------------------

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
function coreSaved(content: Uint8Array, filename: string, steps: Step[]): any {
  const session = createSession();
  const src: any = ingest(session, content, { filename });
  steps.forEach((step) => assert.strictEqual(nodeOf(src, step).setProperty('Name', step.to), true, `core accepts ${step.fn ?? step.entry} -> ${step.to}`));
  const out = session.serializeSource(src.name);
  session.removeDataSource(src.name);
  assert.ok(out, 'core can write this dictionary');
  return out;
}

/** What core says when it refuses `step` on `content`. */
function coreRefusal(content: Uint8Array, filename: string, step: Step): string {
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

/** A copy of the binary fixture (its members rewritten by `edit` first), open in an engine. */
async function openBinary(copyName: string, edit?: (zip: Record<string, Uint8Array>) => void) {
  const zip = unzipSync(file(SERVICE_BINARY));
  edit?.(zip);
  const bytes = zipSync(zip);
  const o = await open(SERVICE_BINARY, bytes, { as: copyName });
  assert.ok(o.view.posts.some((m) => m.type === 'setRows'), 'the first paint sent the whole table');
  return { o, bytes, original: zip, save: () => membersOf(o.save()) };
}

/** The catalog member core's own save writes after `steps`. */
const coreSavedMember = (bytes: Uint8Array, steps: Step[]): string => {
  const out = coreSaved(bytes, 'arch_service_binary.sldd', steps);
  assert.strictEqual(out.kind, 'binary');
  return dec(unzipSync(out.bytes)[SC_PART_XML]);
};

describe('A service function rename through the binary editor carries into the catalog', () => {
  it('one rename swaps the member for one with the function’s p_Name and p_FunctionPrototype, on one undo step', async () => {
    const b = await openBinary('fn_rename_binary_one.sldd');
    assert.deepStrictEqual(problemsIn(rename(b.o, ONE_RENAME[0])), [], 'the rename was accepted');
    assert.strictEqual(b.o.events.length, 1, 'one edit');
    assert.ok(b.o.engine.chunkXml.includes('y = compute(u)'), 'the entry’s Prototype follows the Name');
    assert.strictEqual(
      dec(b.o.engine.parts[SC_PART_XML]),
      replacedOnce(dec(b.original[SC_PART_XML]), [
        ['<p_FunctionPrototype>y = f(u)</p_FunctionPrototype>', '<p_FunctionPrototype>y = compute(u)</p_FunctionPrototype>'],
        ['<p_Name>f</p_Name>\n        </p_FunctionElements>', '<p_Name>compute</p_Name>\n        </p_FunctionElements>'],
      ]),
      'the catalog moves at the function’s two sites: the data interface named f stays',
    );
    const saved = b.save();
    assert.ok(dec(saved[CHUNK_XML]).includes('y = compute(u)'), 'the saved chunk holds the rename');
    assert.strictEqual(dec(saved[SC_PART_XML]), coreSavedMember(b.bytes, ONE_RENAME), 'the saved catalog is the one core’s own save writes');
  });

  for (const [label, steps] of SEQUENCES) {
    it(`writes the catalog core’s own save writes: ${label}`, async () => {
      const b = await openBinary(`fn_rename_binary_${label.replace(/\W+/g, '_')}.sldd`);
      for (const step of steps) {
        assert.deepStrictEqual(problemsIn(rename(b.o, step)), [], `${step.fn ?? step.entry} -> ${step.to} was accepted`);
      }
      assert.strictEqual(b.o.events.length, steps.length, 'one edit per rename');
      const saved = b.save();
      assert.strictEqual(dec(saved[SC_PART_XML]), coreSavedMember(b.bytes, steps), 'the saved catalog is the one core’s own save writes');
    });
  }

  it('a function the catalog does not list leaves the member untouched', async () => {
    // The catalog stops listing `g`: drop its function element, so `g` is in the chunk alone.
    const b = await openBinary('fn_rename_binary_unlisted.sldd', (zip) => {
      const xml = dec(zip[SC_PART_XML]);
      const listed = xml.match(/\n *<p_FunctionElements [^>]*uuid="fe-g">[\s\S]*?<\/p_FunctionElements>/g) ?? [];
      assert.strictEqual(listed.length, 1, 'the fixture’s catalog lists g once');
      zip[SC_PART_XML] = enc(xml.replace(listed[0], ''));
    });
    const step: Step = { entry: 'ServiceInterface', fn: 'g', to: 'h' };
    const member = b.o.engine.parts[SC_PART_XML];
    assert.deepStrictEqual(problemsIn(rename(b.o, step)), [], 'the rename was accepted');
    assert.strictEqual(b.o.events.length, 1, 'one edit');
    assert.ok(b.o.engine.chunkXml.includes('[a,b] = h(g)'), 'the entry was renamed');
    assert.strictEqual(b.o.engine.parts[SC_PART_XML], member, 'and the member is the one read, unswapped');
    const saved = b.save();
    assert.deepStrictEqual(saved[SC_PART_XML], b.original[SC_PART_XML], 'so the save writes it as read');
    assert.strictEqual(dec(saved[SC_PART_XML]), coreSavedMember(b.bytes, [step]), 'as core’s own save leaves it');
  });

  it('a rename the Prototype cannot follow is refused with core’s reason, and writes nothing', async () => {
    const b = await openBinary('fn_rename_binary_refused.sldd', (zip) => {
      zip[CHUNK_XML] = enc(replacedOnce(dec(zip[CHUNK_XML]), [['>y = f(u)<', '>y = step(u)<']]));
    });
    const chunk = b.o.engine.chunkXml;
    const member = b.o.engine.parts[SC_PART_XML];
    const posts = rename(b.o, ONE_RENAME[0]);
    const refusals = refusalsIn(posts);
    assert.strictEqual(refusals.length, 1, `one validationError (${JSON.stringify(posts.map((m) => m.type))})`);
    const reason = coreRefusal(b.bytes, 'arch_service_binary.sldd', ONE_RENAME[0]);
    assert.ok(reason.includes("'f' cannot be renamed: its Prototype 'y = step(u)'"), reason);
    assert.strictEqual(refusals[0].reason, reason, 'carrying core’s own reason');
    assert.strictEqual(b.o.events.length, 0, 'no edit');
    assert.strictEqual(b.o.engine.chunkXml, chunk, 'the chunk is as read');
    assert.strictEqual(b.o.engine.parts[SC_PART_XML], member, 'and so is the member');
    assert.deepStrictEqual(errorsIn(posts), [], 'and nothing else was said');
  });

  it('undo is one step, and puts the member back byte for byte', async () => {
    const b = await openBinary('fn_rename_binary_undo.sldd');
    const chunk = b.o.engine.chunkXml;
    const member = b.o.engine.parts[SC_PART_XML];
    assert.deepStrictEqual(problemsIn(rename(b.o, ONE_RENAME[0])), [], 'the rename was accepted');
    assert.strictEqual(b.o.events.length, 1, 'one edit, so one step on the undo stack');
    assert.strictEqual(dec(b.o.engine.parts[SC_PART_XML]), coreSavedMember(b.bytes, ONE_RENAME), 'the edit swapped in core’s catalog');

    b.o.undo();
    assert.strictEqual(b.o.engine.chunkXml, chunk, 'undo restored the chunk');
    assert.strictEqual(b.o.engine.parts[SC_PART_XML], member, 'and the member read from the file');
    const saved = b.save();
    assert.deepStrictEqual(saved[SC_PART_XML], b.original[SC_PART_XML], 'which a save writes byte for byte');
  });
});
