// Copyright 2026 The MathWorks, Inc.
//
// A save begun before `doc.reload(bytes)` and landing after it. The reload read the disk while the
// save was writing, so whichever of the two the file now holds, the document is not known to be it:
// it is dirty. For each of the page's three editing engines. (A host that follows the README checks a
// change it hears while a save is being written once that save is done, so it does not reload then.)
import * as assert from 'node:assert';
import { afterEach, describe, it } from 'vitest';
import { createWorkspace, type Doc, type Workspace } from '../src/model/index.js';
import { file, PARAMS } from './binaryEngine/harness.js';
import { fixture } from './matEngine/harness.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
});

function workspace(): Workspace {
  const ws = createWorkspace({ editing: true });
  workspaces.push(ws);
  return ws;
}

const settle = async () => {
  for (let i = 0; i < 4; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

const KINDS: { label: string; bytes: () => Uint8Array; name: string; edited: [string, string, string]; other: [string, string, string] }[] = [
  { label: 'a JSON dictionary', bytes: () => file('test/fixtures/params.sldd'), name: 'params.sldd', edited: ['Kp', '1', '10'], other: ['Ki', '3', '30'] },
  { label: 'a compressed dictionary', bytes: () => file(PARAMS), name: 'params_binary.sldd', edited: ['gravity', '9.81', '9.8'], other: ['i32Scalar', '42', '43'] },
  { label: 'a MAT-file', bytes: () => fixture('pv_basic.mat'), name: 'pv_basic.mat', edited: ['p', '5', '6'], other: ['q', '5', '50'] },
];

/** Edit `name`'s Value from `was` to `now`, through the table, and wait for it to land. */
async function setValue(doc: Doc, name: string, was: string, now: string): Promise<void> {
  const row = (await doc.table.open()).rows.find((r: any) => r.Name?.label === name);
  assert.ok(row, `a row for ${name}`);
  await (doc.table as any).edit({ rowId: row.ID, columnId: 'Value', oldValue: was, newValue: now });
  await settle();
}

describe('a save begun before a reload and landing after it', () => {
  for (const kind of KINDS) {
    it(`${kind.label}: is dirty`, async () => {
      // The file as another program saved it, with `other` changed: what the reload reads.
      const outside = await workspace().open(kind.bytes(), kind.name, `file:///other/${kind.name}`);
      await setValue(outside, ...kind.other);
      const disk = outside.serialize().bytes;

      const doc = await workspace().open(kind.bytes(), kind.name, `file:///w/${kind.name}`);
      await setValue(doc, ...kind.edited);
      const save = doc.serialize();
      await doc.reload(disk);
      await settle();
      assert.strictEqual(doc.dirty, false, 'the reload holds what the disk did');
      doc.saved(save.at);
      await settle();
      assert.strictEqual(doc.dirty, true, 'the file may hold the save, the document holds the reload');
    });
  }
});
