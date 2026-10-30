// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/binarySlddKeepsUntouched.test.ts at c73da3c.
//
// A binary dictionary edit keeps what it did not touch (the maintainer's D12 and its addendum), run
// against view's binary dictionary engine: the splice (an edited entry written by core's
// spliceEntryObject, laid out as the chunk is, every byte around it as it was), undo and redo
// rebuilding an entry from the text they restore so it keeps its bytes, and the save gate holding
// a save to the chunk as last read or saved, entry by entry. The edits are the table's own messages
// and undo and redo the table's; a chunk is changed behind the engine's back only where a test
// needs bytes no edit would write, which is what the gate is there to catch. A save is the
// engine's, and the round VS Code's save runs again when the stack moved under it is the
// extension's settledSave, modelled by `settledSave`; a revert and the reload after a change made
// outside the editor are the host reading the file and handing the engine its bytes (`replace`).
// Left with vscode: the disk check that refuses a save of a file changed on disk (here, a save
// that fails after its gate is the save given back, `notSaved`) and the Overwrite answer to it.
import * as assert from 'node:assert';
import { serializeEntryToXml } from 'data-explorer-core';
import { describe, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { chunkOf, file, open, PARAMS, waitFor } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

const CHUNK = 'data/chunk0.xml';
/** One line, no UUIDs, and entries the writers spell differently from their bytes. */
const ONE_LINE = 'test/fixtures/object_array_binary.sldd';
/** LF, four-space indentation, entries with UUIDs, and an entry ("a") holding a struct in a struct. */
const OBJECT_PROPS = 'test/fixtures/object_props_binary.sldd';

const toCrlf = (xml: string) => xml.replace(/\n/g, '\r\n');
/** The chunk on one line: the whitespace between its tags removed, as a one-line file has none. */
const toOneLine = (xml: string) => xml.replace(/>\s+</g, '><');

/** A copy of a repository fixture, its chunk changed by `transform`. */
function workingCopy(rel: string, transform?: (xml: string) => string): Uint8Array {
  const zip = unzipSync(file(rel));
  if (transform) zip[CHUNK] = new TextEncoder().encode(transform(new TextDecoder().decode(zip[CHUNK])));
  return zipSync(zip);
}

/**
 * The `<Object>…</Object>` of the entry named `name` in `xml`, cut by hand: these fixtures' entries
 * hold no nested `<Object>`, so the first `</Object>` after the name closes it.
 */
function objectOf(xml: string, name: string): { start: number; end: number; text: string } {
  const at = xml.search(new RegExp(`<P Name="Name"( Class="char")?>${name}</P>`));
  assert.ok(at >= 0, `the chunk spells the entry "${name}"`);
  const start = xml.lastIndexOf('<Object Class="DD.ENTRY">', at);
  const end = xml.indexOf('</Object>', at) + '</Object>'.length;
  return { start, end, text: xml.slice(start, end) };
}

/** The LastMod stamp is the clock's, so two runs of the same edits differ in it and nowhere else. */
const withoutStamps = (xml: string) => xml.replace(/(<P Name="LastMod" Class="char">)[^<]*(<\/P>)/g, '$1(stamp)$2');

/** A document open in an engine of its own, painted, with the file on disk as its saves leave it. */
async function openDoc(rel: string, transform?: (xml: string) => string) {
  const bytes = workingCopy(rel, transform);
  const o = await open(rel, bytes, { as: 'd12.sldd' });
  let disk = bytes;
  const entry = (name: string) => {
    const found = o
      .model()
      .children.flatMap((s: any) => s.children)
      .find((e: any) => e.name === name);
    assert.ok(found, `the model holds the entry "${name}"`);
    return found;
  };
  /** One cell edit of entry `name`, as the table sends it. The handler is synchronous. */
  const edit = (name: string, columnId: string, newValue: string) => {
    const before = o.engine.chunkXml;
    o.view.posts.length = 0;
    o.view.send({ type: 'edit', rowId: entry(name).id, columnId, oldValue: '', newValue });
    const refused = o.view.posts.find((m) => m.type === 'error' || m.type === 'validationError' || m.type === 'refused');
    assert.ok(!refused, `the ${columnId} edit of "${name}" was applied (${JSON.stringify(refused)})`);
    assert.notStrictEqual(o.engine.chunkXml, before, `the ${columnId} edit of "${name}" reached the document`);
  };
  /**
   * The save VS Code asks for (settledSave.ts): rounds of the engine's save, each written on an
   * await, run again while the stack moved under the one before; the save point moved once. A round
   * the gate refuses throws, after the rounds before it wrote.
   */
  const save = async (during?: () => void) => {
    for (let round = 0; ; round++) {
      const at = o.index.here();
      const moves = o.index.moves;
      const s = o.engine.beginSave();
      if (round === 0) during?.();
      await Promise.resolve();
      disk = s.bytes;
      o.engine.saved(s);
      if (o.index.moves === moves) {
        o.index.saved(at);
        return;
      }
    }
  };
  /** A revert: the host reads the file, the stack is marked reverted, the engine takes the bytes. */
  const revert = () => {
    o.index.reverted();
    o.engine.replace(disk);
  };
  /** Change the chunk behind the engine's back. */
  const setChunk = (xml: string) => void ((o.engine as any).chunk = xml);
  /** The table re-reads the chunk, as it does when the webview reloads. */
  const reread = async () => {
    const posts = o.view.posts.length;
    o.view.send({ type: 'ready' });
    await waitFor('the table to be rebuilt', () => o.view.posts.slice(posts).some((m) => m.type === 'setRows'));
  };
  return {
    o,
    chunk: () => o.engine.chunkXml,
    entry,
    edit,
    save,
    revert,
    setChunk,
    reread,
    disk: () => disk,
    setDisk: (bytes: Uint8Array) => void (disk = bytes),
    chunkOnDisk: () => chunkOf(disk),
  };
}

type Doc = Awaited<ReturnType<typeof openDoc>>;

/** The node named `name` below `node`, depth first. */
function descendant(node: any, name: string): any {
  const stack: any[] = [...(node.children ?? [])];
  while (stack.length) {
    const next = stack.shift();
    if (next.name === name) return next;
    stack.unshift(...(next.children ?? []));
  }
  assert.fail(`"${node.name}" holds a node named "${name}"`);
}

/** The bytes of `orig` with MyAlias renamed in the chunk, as another program would write them. */
function changedOutside(disk: Uint8Array): Uint8Array {
  const zip = unzipSync(disk);
  zip[CHUNK] = new TextEncoder().encode(new TextDecoder().decode(zip[CHUNK]).replace('>MyAlias<', '>MyAliasOutside<'));
  return zipSync(zip);
}

describe('binary dictionary engine: an edit keeps what it did not touch (D12)', () => {
  // --- (1) the splice --------------------------------------------------------------------

  for (const [label, fixture, transform, first] of [
    ['an LF chunk', PARAMS, undefined, 'MyAlias'],
    ['a CRLF chunk', PARAMS, toCrlf, 'MyAlias'],
    ['a one-line chunk', ONE_LINE, undefined, 'paramArray'],
  ] as const) {
    it(`three renames keep ${label}'s layout, and every byte outside the entry`, async () => {
      const d = await openDoc(fixture, transform);
      const original = d.chunk();
      const at = objectOf(original, first);
      const before = original.slice(0, at.start);
      const after = original.slice(at.end);
      let name: string = first;
      for (const next of ['Renamed1', 'Renamed2', 'Renamed3']) {
        d.edit(name, 'Name', next);
        name = next;
        const chunk = d.chunk();
        assert.ok(chunk.startsWith(before), `${next}: every byte before the entry is as it was`);
        assert.ok(chunk.endsWith(after), `${next}: every byte after the entry is as it was`);
        const object = chunk.slice(before.length, chunk.length - after.length);
        assert.ok(
          object.startsWith('<Object Class="DD.ENTRY">'),
          `${next}: the entry starts where it started, with no indentation crept in front of it (${JSON.stringify(object.slice(0, 40))})`,
        );
        assert.ok(object.endsWith('</Object>'), `${next}: and ends where an object ends`);
        assert.ok(object.includes(`>${next}<`), `${next}: the entry carries the new name`);
        if (transform === toCrlf) assert.ok(!/(^|[^\r])\n/.test(object), `${next}: every line of the entry ends in CRLF, as the chunk's do`);
        if (fixture === ONE_LINE) assert.ok(!object.includes('\n'), `${next}: the entry is still on the one line`);
      }
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and the save writes the chunk as edited');
    });
  }

  // The structural edits splice through xmlStructuralEdit, not the edit handler: adding a child to
  // a struct and deleting one from it. Entry "a" is a struct of `b` and of `c`, itself a struct.
  for (const [label, transform] of [
    ['an LF chunk', undefined],
    ['a CRLF chunk', toCrlf],
    ['a one-line chunk', toOneLine],
  ] as const) {
    for (const [gesture, act] of [
      ['adding a child', (d: Doc) => d.o.view.send({ type: 'addChild', rowId: descendant(d.entry('a'), 'c').id })],
      ['deleting a child', (d: Doc) => d.o.view.send({ type: 'delete', rowIds: [descendant(d.entry('a'), 'b').id] })],
    ] as const) {
      it(`${gesture} keeps ${label}'s layout, and every byte outside the entry`, async () => {
        const d = await openDoc(OBJECT_PROPS, transform);
        const original = d.chunk();
        const at = objectOf(original, 'a');
        const before = original.slice(0, at.start);
        const after = original.slice(at.end);
        d.o.view.posts.length = 0;
        act(d);
        const refused = d.o.view.posts.find((m) => m.type === 'error' || m.type === 'validationError' || m.type === 'refused');
        assert.ok(!refused, `${gesture} was applied (${JSON.stringify(refused)})`);
        const chunk = d.chunk();
        assert.notStrictEqual(chunk, original, `${gesture} reached the document`);
        assert.ok(chunk.startsWith(before), 'every byte before the entry is as it was');
        assert.ok(chunk.endsWith(after), 'every byte after the entry is as it was');
        const object = chunk.slice(before.length, chunk.length - after.length);
        assert.ok(
          object.startsWith('<Object Class="DD.ENTRY">'),
          `the entry starts where it started, with no indentation crept in front of it (${JSON.stringify(object.slice(0, 40))})`,
        );
        assert.ok(object.endsWith('</Object>'), 'and ends where an object ends');
        if (transform === toOneLine) assert.ok(!object.includes('\n'), 'the entry is still on the one line');
        await d.save();
        assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and the save writes the chunk as edited');
      });
    }
  }

  // --- (2) undo and redo keep the entry's bytes -------------------------------------------

  it('an entry rebuilt by undo is written as the bytes it was read from, and a later edit keeps them', async () => {
    // The reference: one rename of the entry as the file was read.
    const ref = await openDoc(ONE_LINE);
    ref.edit('paramArray', 'Name', 'pB');
    const expected = ref.chunk();

    const d = await openDoc(ONE_LINE);
    const original = d.chunk();
    const bytes = objectOf(original, 'paramArray').text;
    d.edit('paramArray', 'Name', 'pA');
    d.o.undo();
    assert.strictEqual(d.chunk(), original, 'undo restored the chunk');
    assert.strictEqual(
      serializeEntryToXml(d.entry('paramArray')).trim(),
      bytes,
      'the entry undo rebuilt is written as the bytes it came from, not regenerated from the model',
    );
    // The edit after the undo is the one that showed the loss: with no bytes to keep, the whole
    // entry was written from the model.
    d.edit('paramArray', 'Name', 'pB');
    assert.strictEqual(withoutStamps(d.chunk()), withoutStamps(expected), 'renamed after an undo, the entry changes exactly as it does renamed straight from the file');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and that saves');
  });

  it('an entry rebuilt by redo is written as the bytes the edit wrote, and a later edit keeps them', async () => {
    // The reference: the same two renames, with no undo or redo between them.
    const ref = await openDoc(ONE_LINE);
    ref.edit('paramArray', 'Name', 'pA');
    ref.edit('pA', 'Name', 'pB');
    const expected = ref.chunk();

    const d = await openDoc(ONE_LINE);
    d.edit('paramArray', 'Name', 'pA');
    const edited = d.chunk();
    const editedBytes = objectOf(edited, 'pA').text;
    d.o.undo();
    d.o.redo();
    assert.strictEqual(d.chunk(), edited, 'redo restored the edited chunk');
    assert.strictEqual(
      serializeEntryToXml(d.entry('pA')).trim(),
      editedBytes,
      'the entry redo rebuilt is written as the bytes the edit wrote, not regenerated from the model',
    );
    d.edit('pA', 'Name', 'pB');
    assert.strictEqual(withoutStamps(d.chunk()), withoutStamps(expected), 'renamed after a redo, the entry changes exactly as it does with no undo and redo between');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and that saves');
  });

  it('an entry put back by undoing its delete keeps its bytes, and a later edit keeps them', async () => {
    const ref = await openDoc(ONE_LINE);
    ref.edit('paramArray', 'Name', 'pB');
    const expected = ref.chunk();

    const d = await openDoc(ONE_LINE);
    const original = d.chunk();
    const bytes = objectOf(original, 'paramArray').text;
    d.o.view.send({ type: 'delete', rowIds: [d.entry('paramArray').id] });
    assert.ok(!d.chunk().includes('>paramArray<'), 'the delete reached the document');
    d.o.undo();
    assert.strictEqual(d.chunk(), original, 'undo put the entry back in the chunk');
    assert.strictEqual(
      serializeEntryToXml(d.entry('paramArray')).trim(),
      bytes,
      'the entry undo put back is written as the bytes it was read from, not regenerated from the model',
    );
    d.edit('paramArray', 'Name', 'pB');
    assert.strictEqual(withoutStamps(d.chunk()), withoutStamps(expected), 'renamed after the undone delete, the entry changes exactly as it does renamed straight from the file');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and that saves');
  });

  // --- (3) the save gate -----------------------------------------------------------------

  const U8 = '<P Name="Value" Class="uint8">200</P>';
  const u8Object = (xml: string) => objectOf(xml, 'u8Scalar').text;
  // Each a change to the chunk that no edit made, and the name the refusal has to give.
  const corruptions: [label: string, corrupt: (xml: string) => string, named: string, reread?: boolean][] = [
    ['a value of an entry no edit touched', (xml) => xml.replace(U8, U8.replace('200', '201')), '"u8Scalar"'],
    // The reader reads this as it reads the original, so no re-read could see it.
    ['only the spelling of an entry no edit touched', (xml) => xml.replace(U8, U8.replace(' Class', '  Class')), '"u8Scalar"'],
    // The table re-read the chunk, so the model now holds the changed value too, with the changed
    // text as its bytes. Only what the edits recorded tells this entry apart from an edited one.
    ['a value of an entry no edit touched, after the table re-read the chunk', (xml) => xml.replace(U8, U8.replace('200', '201')), '"u8Scalar"', true],
    ['an entry no edit removed', (xml) => xml.replace(u8Object(xml), ''), '"u8Scalar"'],
    [
      'an entry no edit added',
      (xml) => {
        const copy = u8Object(xml).replace('>u8Scalar<', '>u8Copy<').replace(/(<P Name="UUID" Class="char">)[^<]*/, '$1d12-copy');
        return xml.replace(u8Object(xml), u8Object(xml) + '\n    ' + copy);
      },
      '"u8Copy"',
    ],
    [
      'the dictionary’s own settings, outside every entry',
      (xml) => xml.replace('<P Name="AccessBaseWorkspace" Class="logical">0</P>', '<P Name="AccessBaseWorkspace" Class="logical">1</P>'),
      'outside its entries',
    ],
  ];
  for (const [label, corrupt, named, reread] of corruptions) {
    it(`a save that would change ${label} is refused, and the file kept`, async () => {
      const d = await openDoc(PARAMS);
      d.edit('MyAlias', 'Name', 'MyAlias2');
      const edited = d.chunk();
      const changed = corrupt(edited);
      assert.notStrictEqual(changed, edited, 'the test changed the chunk');
      const onDisk = d.disk();

      d.setChunk(changed);
      if (reread) await d.reread();
      await assert.rejects(
        d.save(),
        (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes(named),
        `the gate refuses, naming ${named}`,
      );
      assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

      // The refusal is about those bytes, not about the edit: with them put back, it saves, and the
      // next edit and save are held to the chunk that save wrote.
      d.setChunk(edited);
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), edited, 'the edited chunk saves');
      d.edit('MyAlias2', 'Name', 'MyAlias3');
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and so does the next edit');
      // Undo past both saves: back to the file as it was opened, which saves too.
      d.o.undo();
      d.o.undo();
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), chunkOf(onDisk), 'undone past its saves, the document saves the chunk it was opened with');
    });
  }

  it('a save that would change a part of an edited entry the edit did not touch is refused', async () => {
    const d = await openDoc(PARAMS);
    d.edit('gravity', 'Max', '200');
    const edited = d.chunk();
    const onDisk = d.disk();
    const units = '<P Name="DocUnits" Class="char">m/s^2</P>';
    assert.ok(objectOf(edited, 'gravity').text.includes(units), 'the edited entry keeps its untouched units');

    d.setChunk(edited.replace(units, '<P Name="DocUnits" Class="char">m/s^3</P>'));
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"gravity"') && err.message.includes('DocUnits'),
      'the gate refuses, naming the entry and the part that would change',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

    d.setChunk(edited);
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), edited, 'the edit itself saves');
  });

  it('a save is refused when the check cannot read an edited entry, rather than passed', async () => {
    // A processing instruction inside an entry: the reader reads past it, but the scan the check
    // reads an entry with does not. Here the edit writes the entry whole from the model and drops
    // the instruction, so passing would save a loss nobody asked for.
    const value = '<P Name="Value" Class="double">3.14</P>';
    const d = await openDoc(PARAMS, (xml) => xml.replace(value, value + '\n        <?keep this?>'));
    const onDisk = d.disk();
    d.edit('scalarD', 'Name', 'scalarE');
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"scalarE"') && /cannot (be )?check/.test(err.message),
      'the gate refuses, and says the entry could not be checked',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

    // What the message tells the user to do works: undo that edit, and the rest saves.
    d.o.undo();
    d.edit('sglScalar', 'Name', 'sglRenamed');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'with that edit undone, another one saves');
    assert.ok(d.chunk().includes('<?keep this?>'), 'and the entry nobody edited keeps its instruction');
  });

  // The same case on the routes that rebuild the entry's node after the edit, or give the entry a
  // new key: redo rebuilds the node from the text the edit wrote, and a re-read builds it from the
  // chunk, so asking the node at the save says nothing about the file's bytes; and a rename of an
  // entry with no UUID changes the key the gate pairs it with the file's entry by.
  const PI_VALUE = '<P Name="Value" Class="double">3.14</P>';
  const PI_DESCRIPTION = '<P Name="Description" Class="char">first</P>';
  const uncheckable: [label: string, fixture: string, transform: (xml: string) => string, name: string, renamed: string][] = [
    ['an entry with a UUID', PARAMS, (xml) => xml.replace(PI_VALUE, PI_VALUE + '\n        <?keep this?>'), 'scalarD', 'scalarE'],
    ['an entry with no UUID', ONE_LINE, (xml) => xml.replace(PI_DESCRIPTION, PI_DESCRIPTION + '<?keep this?>'), 'paramArray', 'pZ'],
  ];
  const routes: [label: string, route: (d: Doc) => Promise<void>][] = [
    ['straight after the edit', async () => {}],
    [
      'after Undo and Redo',
      async (d) => {
        d.o.undo();
        d.o.redo();
      },
    ],
    [
      'after Undo, a save, and Redo',
      async (d) => {
        d.o.undo();
        await d.save();
        d.o.redo();
      },
    ],
    ['after the table re-read the chunk', (d) => d.reread()],
  ];
  for (const [entryLabel, fixture, transform, name, renamed] of uncheckable) {
    for (const [routeLabel, route] of routes) {
      // Straight after the edit of an entry with a UUID is the case above.
      if (fixture === PARAMS && routeLabel === 'straight after the edit') continue;
      it(`a save is refused when the check cannot read ${entryLabel}, ${routeLabel}`, async () => {
        const d = await openDoc(fixture, transform);
        d.edit(name, 'Name', renamed);
        assert.ok(!d.chunk().includes('<?keep this?>'), 'the edit wrote the entry whole, without its instruction');
        await route(d);
        assert.ok(!d.chunk().includes('<?keep this?>'), 'and the text to be saved is still without it');
        const onDisk = d.disk();
        await assert.rejects(
          d.save(),
          (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes(`"${renamed}"`) && /cannot (be )?check/.test(err.message),
          'the gate refuses, and says the entry could not be checked',
        );
        assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');
        assert.ok(d.chunkOnDisk().includes('<?keep this?>'), 'so it keeps the instruction');
        await assert.rejects(
          d.save(),
          (err: Error) => /^Refusing to save/.test(err.message) && /cannot (be )?check/.test(err.message),
          'and the next save is refused too: a refused save forgets nothing',
        );

        // Undo that edit, as the message says, and the file saves with the instruction.
        d.o.undo();
        await d.save();
        assert.ok(d.chunkOnDisk().includes('<?keep this?>'), 'with the edit undone, the save keeps it too');
      });
    }
  }

  it('a save is refused when the check cannot read an entry with no UUID renamed twice, after Undo and Redo of both', async () => {
    // Each rename gives the entry another key, so only all three together name the file's entry.
    const [, fixture, transform] = uncheckable[1];
    const d = await openDoc(fixture, transform);
    d.edit('paramArray', 'Name', 'pZ');
    d.edit('pZ', 'Name', 'pY');
    d.o.undo();
    d.o.undo();
    d.o.redo();
    d.o.redo();
    assert.ok(!d.chunk().includes('<?keep this?>'), 'the text to be saved is without the instruction');
    const onDisk = d.disk();
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"pY"') && /cannot (be )?check/.test(err.message),
      'the gate refuses, and says the entry could not be checked',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');
  });

  it('a save is refused when the check cannot read an entry with no UUID renamed, re-read by the table, and renamed back', async () => {
    // The re-read builds the entry's node from the text the first rename wrote, which the check can
    // read, so the rename back records nothing of its own. Only the first rename's record, kept
    // under every key the entry has gone by, still says the file's entry cannot be checked.
    const [, fixture, transform] = uncheckable[1];
    const d = await openDoc(fixture, transform);
    d.edit('paramArray', 'Name', 'pZ');
    await d.reread();
    d.edit('pZ', 'Name', 'paramArray');
    assert.ok(!d.chunk().includes('<?keep this?>'), 'the text to be saved is without the instruction');
    const onDisk = d.disk();
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"paramArray"') && /cannot (be )?check/.test(err.message),
      'the gate refuses, and says the entry could not be checked',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');
    assert.ok(d.chunkOnDisk().includes('<?keep this?>'), 'so it keeps the instruction');

    // Undo both renames, and the file saves with the instruction.
    d.o.undo();
    d.o.undo();
    await d.save();
    const written = d.chunkOnDisk();
    assert.strictEqual(written, d.chunk(), 'with the renames undone, the document saves');
    assert.ok(written.includes('<?keep this?>'), 'and keeps the instruction');
  });

  it('a revert forgets the entries the check could not read: the file it reads is checked anew', async () => {
    const d = await openDoc(PARAMS, (xml) => xml.replace(PI_VALUE, PI_VALUE + '\n        <?keep this?>'));
    d.edit('scalarD', 'Name', 'scalarE');
    await assert.rejects(d.save(), /cannot (be )?check/, 'the edit of the entry the check cannot read is refused');

    // The file changes outside the editor, losing the instruction, and the document is reverted to
    // it: the same entry is now one the check can read, so the same edit of it saves.
    d.setDisk(file(PARAMS));
    d.revert();
    assert.ok(!d.chunk().includes('<?keep this?>'), 'the revert read the file as it is now');
    d.edit('scalarD', 'Name', 'scalarE');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and the edit saves');
  });

  // A save forgets them too. A rename of an entry with no UUID that the check cannot read is
  // recorded under the entry's old name and its new one. Once the rename is undone and a save has
  // written the file, nothing edited against that file is in the record.
  for (const [label, refusedFirst] of [
    ['after a save', false],
    ['after a save, with the rename refused at an earlier save', true],
  ] as const) {
    it(`an entry given the name of an undone rename the check could not read saves, ${label}`, async () => {
      const [, fixture, transform] = uncheckable[1];
      const d = await openDoc(fixture, transform);
      d.edit('paramArray', 'Name', 'pZ');
      if (refusedFirst) await assert.rejects(d.save(), /cannot (be )?check/, 'the rename the check cannot read is refused');
      d.o.undo();
      assert.ok(d.chunk().includes('<?keep this?>'), 'undo put the entry back with its instruction');
      d.edit('usageArray', 'Name', 'uR');
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'another rename saves');

      d.edit('uR', 'Name', 'pZ');
      await d.save();
      const written = d.chunkOnDisk();
      assert.strictEqual(written, d.chunk(), 'and renaming that entry to pZ saves too');
      assert.ok(written.includes('>pZ<') && written.includes('<?keep this?>'), 'with the rename, and the instruction kept');
    });
  }

  // An entry the file does not hold has nothing of the file's to keep, so the refusal above is not
  // for it: a pasted, an added and a moved entry each save.
  const additions: [label: string, act: (d: Doc) => void][] = [
    [
      'a pasted entry',
      (d) => {
        d.o.view.send({ type: 'copy', rowIds: [d.entry('MyAlias').id] });
        d.o.view.send({ type: 'paste', rowId: d.entry('MyAlias').id });
      },
    ],
    ['an added entry', (d) => d.o.view.send({ type: 'addEntry', section: d.entry('MyAlias').parent.name, className: 'Simulink.Parameter', rename: false })],
    [
      'an entry moved to another section',
      (d) => {
        const sections = d.o.model().children.map((s: any) => s.name);
        const moved = d.entry('MyAlias');
        const other = sections.find((n: string) => n !== moved.parent.name);
        assert.ok(other, 'the dictionary has another section');
        d.o.view.send({ type: 'dragStart', rowIds: [moved.id] });
        d.o.view.send({ type: 'drop', rowId: 'section:' + other, mode: 'move' });
      },
    ],
  ];
  for (const [label, act] of additions) {
    it(`${label} saves`, async () => {
      const d = await openDoc(PARAMS);
      const before = d.chunk();
      d.o.view.posts.length = 0;
      act(d);
      const refused = () => d.o.view.posts.find((m) => m.type === 'error' || m.type === 'validationError' || m.type === 'refused');
      await waitFor('the edit to reach the document', () => d.chunk() !== before || !!refused());
      assert.ok(!refused(), `the edit was applied (${JSON.stringify(refused())})`);
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), d.chunk(), 'and the save writes the chunk as edited');
    });
  }

  it('an edit undone, saved, and redone saves', async () => {
    // Redo puts back an edit the last save did not write, so the entry it changes is edited again.
    const d = await openDoc(PARAMS);
    const original = d.chunk();
    d.edit('MyAlias', 'Name', 'MyAliasR');
    const edited = d.chunk();
    d.o.undo();
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), original, 'the undone edit saves as the file was');
    d.o.redo();
    assert.strictEqual(d.chunk(), edited, 'redo put the edit back');
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), edited, 'and the redone edit saves');
  });

  // An edit made while a save is writing. The save gates and zips the text before its first await,
  // so that edit is not in what it writes; the extension's save writes again before it resolves,
  // held to the text it wrote first, with that edit counted as an edit.
  it('an edit made while a save is writing is written by that save, held to the text it wrote first', async () => {
    const d = await openDoc(PARAMS);
    d.edit('MyAlias', 'Name', 'MyAliasR');
    await d.save(() => d.edit('sglScalar', 'Name', 'sglR'));
    const written = d.chunkOnDisk();
    assert.strictEqual(written, d.chunk(), 'the save wrote the document as it stood when it resolved');
    assert.ok(written.includes('>MyAliasR<') && written.includes('>sglR<'), 'with the edit made during it');
    assert.strictEqual(d.o.index.dirty, false, 'and the document is clean, as VS Code shows it');
  });

  it('an edit made while a save is writing, of an entry the check cannot read, fails that save after its first write', async () => {
    // The text the save wrote first still holds the instruction, as the file did, and the edit made
    // during the write drops it. Held to the text the document had moved on to instead, the write
    // the save makes again would find nothing changed and pass the loss.
    const d = await openDoc(PARAMS, (xml) => xml.replace(PI_VALUE, PI_VALUE + '\n        <?keep this?>'));
    d.edit('sglScalar', 'Name', 'sglR');
    const first = d.chunk();
    await assert.rejects(
      d.save(() => {
        d.edit('scalarD', 'Name', 'scalarE');
        assert.ok(!d.chunk().includes('<?keep this?>'), 'the edit made during the write wrote the entry whole, without its instruction');
      }),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"scalarE"') && /cannot (be )?check/.test(err.message),
      'the save is refused for that edit, and says the entry could not be checked',
    );
    assert.strictEqual(d.chunkOnDisk(), first, 'its first write stands, without the edit made during it');
    assert.ok(first.includes('<?keep this?>'), 'so the file keeps the instruction');
    assert.strictEqual(d.o.index.dirty, true, 'and the document stays dirty, as VS Code keeps it after a failed save');

    const onDisk = d.disk();
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"scalarE"') && /cannot (be )?check/.test(err.message),
      'the next save is refused too',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

    // Undo that edit, as the message says, and the file saves with the instruction.
    d.o.undo();
    await d.save();
    assert.strictEqual(d.chunkOnDisk(), first, 'with the edit undone, the document saves as it was written');
  });

  // The same window in a save that fails after its gate (in the extension, the disk check refusing
  // a file changed on disk): a save that fails wrote nothing, so the edits it took go back
  // (`notSaved`), joining the edit made during it rather than replacing it; the save after that
  // writes.
  function refusedAfterTheGate(d: Doc, during: () => void): void {
    const save = d.o.engine.beginSave();
    during();
    d.o.engine.notSaved(save);
  }

  it('an edit made while a save is writing joins the edits it gives back when that save fails after its gate', async () => {
    const d = await openDoc(PARAMS);
    d.edit('MyAlias', 'Name', 'MyAliasR');
    refusedAfterTheGate(d, () => d.edit('sglScalar', 'Name', 'sglR'));
    await d.save();
    const written = d.chunkOnDisk();
    assert.strictEqual(written, d.chunk(), 'the save after it writes the document');
    assert.ok(written.includes('>MyAliasR<') && written.includes('>sglR<'), 'with both edits');
  });

  it('an edit made while a save is writing, of an entry the check cannot read, is refused after that save failed after its gate', async () => {
    // And after the table re-reads the chunk, which builds the entry's node from the edit's text,
    // so only the record made at the edit still says the file's entry cannot be checked.
    const d = await openDoc(PARAMS, (xml) => xml.replace(PI_VALUE, PI_VALUE + '\n        <?keep this?>'));
    d.edit('sglScalar', 'Name', 'sglR');
    refusedAfterTheGate(d, () => d.edit('scalarD', 'Name', 'scalarE'));
    assert.ok(!d.chunk().includes('<?keep this?>'), 'the edit made during the write wrote the entry whole, without its instruction');
    await d.reread();

    const onDisk = d.disk();
    assert.ok(d.chunkOnDisk().includes('<?keep this?>'), 'the file holds the instruction');
    await assert.rejects(
      d.save(),
      (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('"scalarE"') && /cannot (be )?check/.test(err.message),
      'the save after it is refused, and says the entry could not be checked',
    );
    assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

    // Undo that edit, as the message says, and the rest saves with the instruction.
    d.o.undo();
    await d.save();
    const written = d.chunkOnDisk();
    assert.strictEqual(written, d.chunk(), 'with that edit undone, the document saves');
    assert.ok(written.includes('>sglR<') && written.includes('<?keep this?>'), 'with the other edit, and the instruction');
  });

  // An edit counts only against the chunk it was made to. A save, a revert, and the reload that
  // follows a change made outside the editor with nothing unsaved each replace that chunk, so the
  // next save is held to the new one with nothing edited against it yet.
  const replacements: [label: string, replace: (d: Doc) => Promise<void>, named: string][] = [
    ['a save', (d) => d.save(), '"u8X"'],
    ['a revert', async (d) => d.revert(), '"u8Scalar"'],
    [
      'the reload after a change outside the editor',
      async (d) => {
        // Undone, so nothing is unsaved, and the host follows the change silently.
        d.o.undo();
        d.setDisk(changedOutside(d.disk()));
        d.o.engine.replace(d.disk());
        assert.ok(d.chunk().includes('>MyAliasOutside<'), 'the reload');
      },
      '"u8Scalar"',
    ],
  ];
  for (const [label, replace, named] of replacements) {
    it(`an entry edited before ${label} is held to its bytes again, after the table re-read a chunk that changed it`, async () => {
      const d = await openDoc(PARAMS);
      d.edit('u8Scalar', 'Name', 'u8X');
      await replace(d);
      assert.strictEqual(d.chunk(), d.chunkOnDisk(), 'the document holds the file as it is now');

      d.edit('sglScalar', 'Name', 'sglR');
      const edited = d.chunk();
      d.setChunk(edited.replace(U8, U8.replace('200', '201')));
      assert.notStrictEqual(d.chunk(), edited, 'the test changed the chunk');
      await d.reread();

      const onDisk = d.disk();
      await assert.rejects(
        d.save(),
        (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes(`entry ${named} `) && err.message.includes('no edit changed it'),
        `the gate refuses, naming ${named} as an entry no edit changed`,
      );
      assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

      // With the value put back, the edit made since saves.
      d.setChunk(edited);
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), edited, 'with the value put back, the edit saves');
    });
  }

  // A chunk core reads but the gate's scan cannot vouch for: nothing can be compared entry by
  // entry, so the whole chunk is, and it saves only as it was.
  const unscannable: [label: string, transform: (xml: string) => string][] = [
    ['a DOCTYPE before the root', (xml) => xml.replace(/(<\?xml[^>]*\?>)/, '$1<!DOCTYPE DataSource>')],
    [
      'a close tag outside the entries that does not close the element open',
      (xml) => xml.replace('<P Name="AccessBaseWorkspace" Class="logical">0</P>', '<P Name="AccessBaseWorkspace" Class="logical">0</Q>'),
    ],
    ['an attribute value with no quotes in an entry', (xml) => xml.replace('<P Name="DocUnits" Class="char">m/s^2</P>', '<P Name="DocUnits" Class=char>m/s^2</P>')],
  ];
  for (const [label, transform] of unscannable) {
    it(`in a chunk the scan cannot read (${label}), an edit is refused at save, and the chunk saves as it was`, async () => {
      const d = await openDoc(PARAMS, transform);
      const original = d.chunk();
      const onDisk = d.disk();
      d.edit('scalarD', 'Name', 'scalarE');
      await assert.rejects(
        d.save(),
        (err: Error) => /^Refusing to save/.test(err.message) && err.message.includes('compared the whole'),
        'the gate refuses, comparing the whole chunk',
      );
      assert.strictEqual(d.disk(), onDisk, 'and the file on disk is untouched');

      d.o.undo();
      assert.strictEqual(d.chunk(), original, 'undo put the chunk back');
      await d.save();
      assert.strictEqual(d.chunkOnDisk(), original, 'and the chunk as it was saves');
    });
  }
});

