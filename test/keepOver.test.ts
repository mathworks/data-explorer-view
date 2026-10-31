// Copyright 2026 The MathWorks, Inc.
//
// Doc.keepOver(bytes): another program changed the file, and the user keeps the document's edits
// instead of reading the change (an app's "Keep My Edits"). The document and its undo stack stay; no
// step of the stack is the file any more, so it is dirty until a save lands or a reload; a
// dictionary's Status column is measured from the file as it now is; and the next save writes the
// document over the file, which its save gate does not refuse for what the other program changed.
// For each of the page's three editing engines.
import * as assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, type Doc, type Notice, type Workspace } from '../src/model/index.js';
import { file, PARAMS } from './binaryEngine/harness.js';
import { fixture } from './matEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
});

function workspace(notices: Notice[] = []): Workspace {
  const ws = createWorkspace({ editing: true, notify: (n) => void notices.push(n) });
  workspaces.push(ws);
  return ws;
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

interface Kind {
  label: string;
  bytes: () => Uint8Array;
  name: string;
  /** The entry the user edits, its Value before and after. */
  edited: [name: string, was: string, now: string];
  /** The entry the other program changes, its Value before and after. */
  other: [name: string, was: string, now: string];
  /** Whether the Status column is measured from the file's bytes (a dictionary's), or marks the edits (a MAT-file's). */
  measured: boolean;
}

const KINDS: Kind[] = [
  { label: 'a JSON dictionary', bytes: () => file('test/fixtures/params.sldd'), name: 'params.sldd', edited: ['Kp', '1', '10'], other: ['Ki', '3', '30'], measured: true },
  { label: 'a compressed dictionary', bytes: () => file(PARAMS), name: 'params_binary.sldd', edited: ['gravity', '9.81', '9.8'], other: ['i32Scalar', '42', '43'], measured: true },
  { label: 'a MAT-file', bytes: () => fixture('pv_basic.mat'), name: 'pv_basic.mat', edited: ['p', '5', '6'], other: ['q', '5', '50'], measured: false },
];

/** The top-level rows of a whole paint of `doc`'s table. */
async function rowsOf(doc: Doc): Promise<any[]> {
  return (await doc.table.open()).rows.filter((r: any) => r.parent == null || String(r.parent).startsWith('section:'));
}

const rowOf = (rows: any[], name: string) => {
  const row = rows.find((r) => r.Name?.label === name);
  assert.ok(row, `a row for ${name}`);
  return row;
};
const valueOf = (row: any): string => String(typeof row.Value === 'object' ? row.Value?.text : row.Value);

/** Edit `name`'s Value from `was` to `now`, through the table, and wait for it to land. */
async function setValue(doc: Doc, name: string, was: string, now: string): Promise<void> {
  const row = rowOf(await rowsOf(doc), name);
  await (doc.table as any).edit({ rowId: row.ID, columnId: 'Value', oldValue: was, newValue: now });
  await settle();
}

/** The file as another program saved it, with `other`'s Value changed: what the disk then holds. */
async function changedOutside(kind: Kind): Promise<Uint8Array> {
  const doc = await workspace().open(kind.bytes(), kind.name, `file:///other/${kind.name}`);
  await setValue(doc, ...kind.other);
  return doc.serialize().bytes;
}

/** `bytes` read back, the Value of each entry named. */
async function valuesIn(kind: Kind, bytes: Uint8Array, names: string[]): Promise<string[]> {
  const doc = await workspace().open(bytes, kind.name, `file:///back/${kind.name}`);
  const rows = await rowsOf(doc);
  return names.map((n) => valueOf(rowOf(rows, n)));
}

describe('Doc.keepOver(bytes): the edits kept over a change on disk', () => {
  for (const kind of KINDS) {
    const [edited, , now] = kind.edited;
    const [other, otherWas, otherNow] = kind.other;

    it(`${kind.label}: stays dirty through undo and redo, and is marked against the file as it is now`, async () => {
      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      const heard: boolean[] = [];
      doc.onDirty((d) => void heard.push(d));
      await doc.keepOver(await changedOutside(kind));
      await settle();
      assert.strictEqual(doc.dirty, true);
      const rows = await rowsOf(doc);
      assert.strictEqual(valueOf(rowOf(rows, edited)), now, 'the edit is kept');
      assert.strictEqual(valueOf(rowOf(rows, other)), otherWas, 'and the change on disk is not read');
      assert.strictEqual(rowOf(rows, edited).Status, 'Modified');
      // A dictionary's Status column says what the next save would write other than the disk holds.
      assert.strictEqual(rowOf(rows, other).Status === 'Modified', kind.measured, `${other}'s Status`);
      doc.table.undo();
      await settle();
      assert.strictEqual(doc.dirty, true, 'undone back to the file as opened, which the disk no longer holds');
      doc.table.redo();
      await settle();
      assert.strictEqual(doc.dirty, true);
      assert.ok(!heard.includes(false), `never heard clean (${heard.join(', ')})`);
    });

    it(`${kind.label}: the next save writes the document over the file, and is clean`, async () => {
      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      await doc.keepOver(await changedOutside(kind));
      // Not refused for what the other program changed: the gate is held to the document's own read.
      const save = doc.serialize();
      assert.deepStrictEqual(await valuesIn(kind, save.bytes, [edited, other]), [now, otherWas], 'the document, over the change on disk');
      doc.saved(save.at);
      await settle();
      assert.strictEqual(doc.dirty, false);
      const rows = await rowsOf(doc);
      assert.deepStrictEqual(
        rows.filter((r) => r.Status === 'Modified').map((r) => r.Name?.label),
        [],
        'and nothing is marked: the disk holds the document',
      );
    });

    it(`${kind.label}: a reload after it reads the disk, clean, with nothing to undo`, async () => {
      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      const disk = await changedOutside(kind);
      await doc.keepOver(disk);
      await doc.reload(disk);
      await settle();
      assert.strictEqual(doc.dirty, false);
      const rows = await rowsOf(doc);
      assert.strictEqual(valueOf(rowOf(rows, other)), otherNow);
      assert.deepStrictEqual(
        rows.filter((r) => r.Status === 'Modified').map((r) => r.Name?.label),
        [],
        'and nothing is marked',
      );
    });

    it(`${kind.label}: a save begun before it and landing after is clean, unless an edit came after the save read the document`, async () => {
      const [, was] = kind.edited;
      for (const keep of [true, false]) {
        for (const after of ['nothing', 'an edit', 'an undo and another edit'] as const) {
          const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
          await setValue(doc, ...kind.edited);
          const save = doc.serialize();
          if (after === 'an edit') await setValue(doc, edited, now, `${now}1`);
          if (after === 'an undo and another edit') {
            // Back where the save read the document, over another one.
            doc.table.undo();
            await settle();
            await setValue(doc, edited, was, `${was}7`);
          }
          if (keep) await doc.keepOver(await changedOutside(kind));
          doc.saved(save.at);
          await settle();
          assert.strictEqual(doc.dirty, after !== 'nothing', `${after} after the save read it, ${keep ? '' : 'not '}kept over`);
        }
      }
    });

    it(`${kind.label}: a clean document kept over turns dirty, and says so`, async () => {
      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      const heard: boolean[] = [];
      doc.onDirty((d) => void heard.push(d));
      await doc.keepOver(await changedOutside(kind));
      await settle();
      assert.strictEqual(doc.dirty, true);
      assert.deepStrictEqual(heard, [true]);
    });
  }

  for (const kind of KINDS.filter((k) => k.measured)) {
    const [other] = kind.other;

    it(`${kind.label}: the table open on it hears its Status column move`, async () => {
      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      const heard: any[] = [];
      const stop = doc.table.subscribe((change: any) => void heard.push(change));
      await doc.keepOver(await changedOutside(kind));
      await settle();
      stop();
      const painted = heard.flatMap((c) => c.view?.rows ?? c.rows ?? []);
      assert.strictEqual(painted.find((r: any) => r.Name?.label === other)?.Status, 'Modified', `${other} in a repaint (${heard.map((c) => c.kind).join(', ')})`);
    });

    it(`${kind.label}: kept over before its first paint, or just after a reload, it is marked against the disk`, async () => {
      const disk = await changedOutside(kind);
      const unpainted = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await unpainted.keepOver(disk);
      assert.strictEqual(rowOf(await rowsOf(unpainted), other).Status, 'Modified', 'before the first paint');
      const reloaded = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(reloaded, ...kind.edited);
      await reloaded.reload(kind.bytes());
      await reloaded.keepOver(disk);
      assert.strictEqual(rowOf(await rowsOf(reloaded), other).Status, 'Modified', 'just after a reload');
    });
  }

  it('says why, and stays dirty, where the bytes on disk do not read', async () => {
    for (const kind of KINDS.filter((k) => k.measured)) {
      const notices: Notice[] = [];
      const doc = await workspace(notices).open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      await doc.keepOver(new TextEncoder().encode('not a dictionary'));
      await settle();
      assert.strictEqual(doc.dirty, true, kind.label);
      assert.match(notices.map((n) => n.message).join('\n'), /could not be read, so its Status column is still measured/, kind.label);
      doc.table.undo();
      await settle();
      assert.strictEqual(doc.dirty, true, `${kind.label}: undone, and still no step is the file`);
    }
  });

  it('reads the bytes, as reload does, for a document the page does not edit', async () => {
    const ws = createWorkspace();
    workspaces.push(ws);
    const doc = await ws.open(file('test/fixtures/params.sldd'), 'params.sldd', 'file:///w/params.sldd');
    const changed = await changedOutside(KINDS[0]);
    await doc.keepOver(changed);
    assert.strictEqual(doc.dirty, false);
    assert.strictEqual(valueOf(rowOf(await rowsOf(doc), 'Ki')), '30');
  });
});
