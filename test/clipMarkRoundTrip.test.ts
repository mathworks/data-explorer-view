// Copyright 2026 The MathWorks, Inc.
//
// Ported from data-explorer-vscode test/clipMarkRoundTrip.test.ts at cc8cb1b.
// Its JSON-dictionary loop and its three clipMarkKey/splitClipMarkKey cases, run against view's row stamp,
// view's copy of buildClipboardSnapshot (given core's session) and core's findEntryByName; its binary
// loop is not ported here (view's binary engine tests, test/binaryEngine/clipboard.test.ts, cover it).
//
// The cut/copy mark on a table's rows is one key spelled in two places: the row stamp that
// dims a row (rowStamp.ts, through clipMarkKey) and the repaint that runs when the clipboard
// changes, which reads each key back with splitClipMarkKey and findEntryByName to know which
// entries to repaint (both providers' clipboard listeners). Both build the key from what a
// copy put on the clipboard (buildClipboardSnapshot: each item's payload name and its own
// source section). If the two paths ever read a key differently, the narrow repaint would
// repaint some other entry, or none, and the dimmed row would stay dimmed after the paste.
//
// So for every entry of real dictionaries, a copy of its row (or of a row under it) is put
// through both: the stamp must mark exactly that entry's row, and the split must find exactly
// that entry.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DataModel, findEntryByName } from 'data-explorer-core';
import {
  buildRows,
  clipMarkKey,
  splitClipMarkKey,
  type ClipMark,
} from '../src/model/index.js';
import { getModel, invalidate, findNode } from '../src/host/index.js';
import { buildClipboardSnapshot as buildWith } from '../src/host/index.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The extension's builder reads core's module-level session; view's is given it.
const buildClipboardSnapshot = (rowIds: unknown, find: (rowId: string) => any) => buildWith(DataModel, rowIds, find);

const fixture = (p: string) => fileURLToPath(new URL(`./${p}`, import.meta.url));

/** The providers' clipMarkOfDoc, for one clipboard's items. */
function markOf(items: { payload: Record<string, unknown>; sourceSection: string }[], mode: 'cut' | 'copy'): ClipMark {
  const keys = new Set<string>();
  for (const it of items) {
    const name = it.payload.name;
    if (typeof name === 'string' && name) keys.add(clipMarkKey(it.sourceSection, name));
  }
  return { keys, mode };
}

function roundTrip(model: any, find: (id: string) => any): number {
  const rows = buildRows(model) as any[];
  let checked = 0;
  for (const row of rows) {
    if (String(row.ID).startsWith('section:') || !row._canCopy) continue;
    const items = buildClipboardSnapshot([row.ID], find);
    expect(items, `row ${row.ID} copies one entry`).toHaveLength(1);
    const entry = (() => {
      let n = find(row.ID);
      while (n && !n.isEntry) n = n.parent;
      return n;
    })();
    const mark = markOf(items, 'cut');
    // The stamp: exactly the entry's own row is dimmed.
    const marked = (buildRows(model, undefined, mark) as any[])
      .filter((r) => r.Name && typeof r.Name === 'object' && r.Name.clipboardMode === 'cut')
      .map((r) => r.ID);
    expect(marked, `copy of ${row.ID}`).toEqual([entry.id]);
    // The repaint: the key reads back as that same entry.
    for (const key of mark.keys) {
      const { section, name } = splitClipMarkKey(key);
      expect(findEntryByName(model, section, name), `key for ${row.ID}`).toBe(entry);
    }
    checked++;
  }
  return checked;
}

describe('the clip-mark key reads back as the entry it marks', () => {
  for (const file of ['parity/artifacts/text/params.sldd', 'fixtures/arch.sldd']) {
    it(`every copyable row of ${file}`, () => {
      const uri = `test://clipmark/${file}`;
      invalidate(uri);
      const model = getModel(uri, 'x.sldd', readFileSync(fixture(file), 'utf8'));
      expect(roundTrip(model, (id) => findNode(uri, id))).toBeGreaterThan(3);
      invalidate(uri);
    });
  }
});

describe('clipMarkKey and splitClipMarkKey', () => {
  it('round-trip a section and a name, the empty section of a MAT-file included', () => {
    for (const [section, name] of [
      ['design', 'Kp'],
      ['', 'x'],
      ['arch', 'name with spaces/and.dots'],
      ['other', ''],
    ]) {
      expect(splitClipMarkKey(clipMarkKey(section, name))).toEqual({ section, name });
    }
  });

  it('read a key with no section separator as a name in no section', () => {
    expect(splitClipMarkKey('Kp')).toEqual({ section: '', name: 'Kp' });
  });

  it('keep two entries of one name in two sections apart', () => {
    expect(clipMarkKey('design', 'Bus')).not.toBe(clipMarkKey('arch', 'Bus'));
  });
});
