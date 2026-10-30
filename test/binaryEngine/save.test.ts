// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test-integration/suite/binarySlddSaveGate.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/binarySlddSaveSafety.test.ts at c73da3c.
// Ported from data-explorer-vscode test-integration/suite/binarySlddSaveLanding.test.ts at c73da3c.
//
// The binary dictionary editor's save, backup and revert, run against view's binary dictionary
// engine: the save gate on the path that writes the user's file and not on a hot-exit backup's, a
// save reading the dictionary once, an edit landing while a save writes, Save As to another file,
// and a revert that cannot read the disk. A save is the engine's (beginSave, then saved once the
// bytes are on disk, or notSaved), and the round VS Code's save runs again when the stack moved
// under it is the extension's settledSave, modelled here by `settledSave`. Left with vscode, as
// the host's and not the engine's: the write itself (writeUserFile and safeWrite's replace, the
// file's mode, a folder made again, a read-only file), the disk stamp and the conflict prompt a
// restored backup's first save can ask, the backup id and its formats, and Save As onto the file
// itself or another name of it (sameFile), which the host routes to a save.
import * as assert from 'node:assert';
import { describe, it } from 'vitest';
import { unzipSync, zipSync } from 'fflate';
import { chunkOf, entryOf, entryRow, file, open, PARAMS, readSldd, WORKSPACE_BINARY, type Opened } from './harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** A payload the reader cannot recover, so the gate must refuse it. */
const UNREADABLE = '<Root><unterminated';
const CHUNK = 'data/chunk0.xml';

/** The first entry of the first non-empty section. */
function firstEntry(root: any): any {
  for (const section of (root?.children ?? []) as any[]) {
    if (section.children.length > 0) return section.children[0];
  }
  return null;
}

/** The engine's chunk, set behind its back: bytes no edit would write. */
const setChunk = (o: Opened, xml: string): void => void ((o.engine as any).chunk = xml);

/**
 * A save of the file itself as the extension's saveCustomDocument makes one (settledSave.ts): a
 * round (the engine's save, its bytes "written" on an await) run again while the stack moved under
 * the one before, and the save point moved once, to where the last round read the document.
 * `during` is what lands on the first round's await. Resolves with the bytes the last round wrote;
 * a round the gate refuses throws, after the rounds before it wrote.
 */
async function settledSave(o: Opened, written: (bytes: Uint8Array) => void, during?: () => void): Promise<void> {
  for (let round = 0; ; round++) {
    const at = o.index.here();
    const moves = o.index.moves;
    const save = o.engine.beginSave();
    if (round === 0) during?.();
    await Promise.resolve();
    written(save.bytes);
    o.engine.saved(save);
    if (o.index.moves === moves) {
      o.index.saved(at);
      return;
    }
  }
}

/** A rename of `from` to `to`, through the table, as the table makes one. */
function rename(o: Opened, to: string, from = 'Kp'): void {
  const entry = (o.model()?.children ?? []).flatMap((s: any) => s.children).find((e: any) => e.name === from);
  assert.ok(entry, `the document's model holds ${from}`);
  o.view.send({ type: 'edit', rowId: entry.id, columnId: 'Name', oldValue: from, newValue: to });
  assert.ok(o.engine.chunkXml.includes(`>${to}<`), `the edit renamed ${from} to ${to}`);
}

/** The names the latest whole paint of `o`'s table shows. */
const shown = (o: Opened): string[] => {
  const paint = [...o.view.posts].reverse().find((p) => p.type === 'setRows');
  return ((paint?.rows ?? []) as any[]).filter((r) => String(r.parent ?? '').startsWith('section:')).map((r) => r.Name?.label);
};

describe('binary dictionary engine: the save gate vs the hot-exit backup', () => {
  it('a save refuses a payload that does not re-parse, and hands back nothing to write', async () => {
    const o = await open(WORKSPACE_BINARY);
    rename(o, 'Ki');
    setChunk(o, UNREADABLE);
    assert.throws(() => o.engine.beginSave(), /Refusing to save/, 'the gate refuses the write: there are no bytes to write');
    assert.throws(() => o.engine.serialize(), /Refusing to save/, 'and a Save As to another file too');
    assert.strictEqual(o.index.dirty, true, 'and the document is still unsaved — the whole point of refusing');
  });

  it('a backup skips the gate, and still restores the payload it snapshotted', async () => {
    const o = await open(WORKSPACE_BINARY);
    // An edit, of the kind a backup is asked for after.
    const before = o.engine.chunkXml;
    assert.ok(before.includes('>Kp<'), 'the fixture payload spells the entry name');
    const edited = before.replace('>Kp<', '>Ki<');
    setChunk(o, edited);

    const backup = o.engine.backup();
    // Restored as a restart restores it: the backup's bytes opened as the document.
    const restored = await open(WORKSPACE_BINARY, backup, { fromBackup: true });
    assert.strictEqual(restored.engine.chunkXml, edited, 'reopening from the backup gives the edited payload back');
    restored.engine.dispose();

    // A payload the reader cannot recover still backs up — no gate, so no re-parse between an edit
    // and the user's next keystroke — while saving that same payload is still refused.
    setChunk(o, UNREADABLE);
    const second = o.engine.backup();
    assert.ok(second.byteLength > 0, 'the backup was made without the gate');
    assert.strictEqual(new TextDecoder().decode(unzipSync(second)[CHUNK]), UNREADABLE);
    assert.throws(() => o.engine.beginSave(), /Refusing to save/, 'the gate still stands where it matters');
  });

  it('a save reads the dictionary once, and paints the tree it read', async () => {
    const o = await open(WORKSPACE_BINARY);
    assert.strictEqual(((o.engine as any).views as Set<unknown>).size, 1, 'the real view is the one that repaints');

    // Every read of the payload is followed by registering what it read: counting registrations is
    // how many trees this save built. One: the gate's, reused.
    const session = o.session as any;
    const realAdd = session.addDataSource;
    let registrations = 0;
    session.addDataSource = (...args: unknown[]) => {
      registrations++;
      return realAdd.apply(session, args);
    };
    try {
      o.save();
    } finally {
      session.addDataSource = realAdd;
    }
    assert.strictEqual(registrations, 1, 'a save builds ONE tree, with a real view painting');

    const root: any = o.model();
    assert.ok(root, 'the save registered the tree it read');
    assert.strictEqual(firstEntry(root).name, 'Kp', 'built from the payload it wrote');
    assert.deepStrictEqual(
      [...(o.engine as any).baseline.modified(root)],
      [],
      'and baselined that same tree, so the save leaves no row wearing a Modified mark',
    );

    // Said the other way round, with stand-in views: every one is asked for the registered tree.
    const seen: unknown[] = [];
    const views = (o.engine as any).views as Set<{ repaintAll(from?: unknown): void; repaintOps(a: unknown[]): void }>;
    views.clear();
    for (const _tag of ['a', 'b']) views.add({ repaintAll: (from) => void seen.push(from), repaintOps: () => undefined });
    o.save();
    assert.deepStrictEqual(seen, ['registered', 'registered'], 'every view paints the tree the save registered, instead of parsing the payload again');
  });

  it('an edit landing on the save’s write is not overwritten by the gate’s stale read', async () => {
    const o = await open(WORKSPACE_BINARY);
    const gated = o.engine.chunkXml;
    const raced = gated.replace('>Kp<', '>Kz<');
    // The bytes are read before the first await; an edit arrives while they are being written.
    const save = o.engine.beginSave();
    setChunk(o, raced);
    o.engine.saved(save);

    const root: any = o.model();
    assert.strictEqual(firstEntry(root).name, 'Kz', 'the registered tree describes the document, not the read the gate happened to have');
    assert.deepStrictEqual([...(o.engine as any).baseline.modified(root)], [], 'and the baseline was captured from that same tree');
    assert.strictEqual(chunkOf(save.bytes), gated, 'the write is of the gated text');
  });
});

describe('binary dictionary engine: an edit landing on a save', () => {
  it('is written by that save before it resolves, and the document is clean', async () => {
    const o = await open(WORKSPACE_BINARY);
    const before = o.engine.chunkXml;
    assert.ok(before.includes('>Kp<'), 'the payload spells the entry this test renames');
    const after = before.replace('>Kp<', '>Ki<');
    let disk = o.original;
    await settledSave(o, (bytes) => (disk = bytes), () => (o.engine as any).pushEdit('Edit Name', before, after));
    assert.strictEqual(chunkOf(disk), after, 'the edit that landed is on disk');
    assert.strictEqual(o.index.dirty, false, 'as VS Code, which calls the document saved, shows it');
  });
});

// The page's own: VS Code runs a document's saves one at a time, and a page may land them in any
// order. The file then holds the last to land, and the document what it holds.
describe('binary dictionary engine: saves that land out of order', () => {
  it('leave it dirty over the older file, and the next save writes the newest edit', async () => {
    const o = await open(PARAMS);
    const gravity = (bytes: Uint8Array): string => readSldd(bytes, (dict) => String(entryOf(dict, 'gravity').toRow().Value));
    const edit = (value: string): void => {
      const row = entryRow(o.view.posts, 'gravity');
      o.view.send({ type: 'edit', rowId: row.ID, columnId: 'Value', oldValue: String(row.Value), newValue: value });
    };
    const land = (save: ReturnType<typeof o.engine.beginSave>): void => {
      o.engine.saved(save);
      o.index.saved(save.at);
    };
    edit('1');
    const a = o.engine.beginSave();
    edit('2');
    const b = o.engine.beginSave();
    edit('3');
    const c = o.engine.beginSave();
    // The newest lands first, then the oldest, then the one between: the file holds b's bytes, and
    // no edit since the last of them was begun says the entry differs from it.
    land(c);
    land(a);
    land(b);
    assert.strictEqual(gravity(b.bytes), '2');
    assert.strictEqual(o.index.dirty, true, 'the file is older than the document');
    let next: ReturnType<typeof o.engine.beginSave> | undefined;
    assert.doesNotThrow(() => (next = o.engine.beginSave()), 'the gate takes the edits the file does not hold');
    land(next!);
    assert.strictEqual(gravity(next!.bytes), '3');
    assert.strictEqual(o.index.dirty, false);
    // Nothing left over: the save after it is held to it, as one save after another is.
    edit('4');
    const last = o.engine.beginSave();
    land(last);
    assert.strictEqual(gravity(last.bytes), '4');
  });
});

describe('binary dictionary engine: a backup, a Save As and a revert of the user’s file', () => {
  it('a restored backup of a file nobody changed since saves', async () => {
    const o = await open(WORKSPACE_BINARY);
    rename(o, 'Ki');
    const backup = o.engine.backup();
    o.engine.dispose();
    const restored = await open(WORKSPACE_BINARY, backup, { fromBackup: true });
    assert.strictEqual(restored.index.dirty, true, 'a restored backup is unsaved');
    assert.ok(chunkOf(restored.save()).includes('>Ki<'), 'the restored edit is on disk');
    assert.strictEqual(restored.index.dirty, false);
  });

  it('Save As onto another file writes that file, and leaves this one alone', async () => {
    const o = await open(WORKSPACE_BINARY);
    const read = o.engine.chunkXml;
    rename(o, 'Ki');
    const other = o.engine.serialize();
    assert.ok(chunkOf(other).includes('>Ki<'), 'the copy holds the edit');
    assert.strictEqual(o.index.dirty, true, 'the document is still unsaved: a Save As to another file moves no save point');
    assert.strictEqual((o.engine as any).savedChunk.xml, read, 'still held to the file it read');
    assert.ok(chunkOf(o.save()).includes('>Ki<'), 'and its own save still writes the edit');
  });

  // A revert the host could not read the disk for (the file is gone, or no dictionary): the host
  // marks the stack reverted, as VS Code shows it clean, and the engine puts the document back to
  // the file as it last read or wrote it.
  it('a revert that cannot read the disk puts the document back to the file as last saved', async () => {
    const o = await open(WORKSPACE_BINARY);
    rename(o, 'Ki');
    o.save();
    rename(o, 'Kd', 'Ki');
    o.index.reverted();
    o.engine.revertToSaved();
    assert.strictEqual(o.index.dirty, false);
    assert.ok(o.engine.chunkXml.includes('>Ki<') && !o.engine.chunkXml.includes('>Kd<'), 'the document is the file as saved');
    assert.ok(shown(o).includes('Ki') && !shown(o).includes('Kd'), 'and so is the table');
  });

  it('a revert onto a zip with no dictionary in it is refused, and puts the document back to the file as last read', async () => {
    const o = await open(WORKSPACE_BINARY);
    const read = o.engine.chunkXml;
    rename(o, 'Ki');
    const zip = unzipSync(file(WORKSPACE_BINARY));
    delete zip[CHUNK];
    const edited = o.engine.chunkXml;
    assert.throws(() => o.engine.replace(zipSync(zip)), /data\/chunk0\.xml/, 'refused, naming what is missing');
    assert.strictEqual(o.engine.chunkXml, edited, 'and the refusal changed nothing');
    o.index.reverted();
    o.engine.revertToSaved();
    assert.strictEqual(o.index.dirty, false);
    assert.strictEqual(o.engine.chunkXml, read, 'the document is the file as it was read');
    assert.ok(shown(o).includes('Kp') && !shown(o).includes('Ki'), 'and so is the table');
    assert.strictEqual(entryRow(o.view.posts, 'Kp').Name.label, 'Kp');
  });
});
