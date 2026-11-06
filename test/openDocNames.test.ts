// Copyright 2026 The MathWorks, Inc.
//
// An open document's entry names, read off its table's rows (namesOfRows), so a search can offer
// the files a page has open when no folder is indexed: a file dropped on the page, or opened from
// a dialog.
//
// What this protects is PARITY with the folder's index. A page with a folder searches both, the
// folder's names (namesOfFile, through namesFromSldd / namesFromMat / namesFromSlx) and the open
// documents', and the two must say the same thing about the same file: a record the rows give and
// the scan does not is a hit that appears only while the file is open, and one the scan gives and
// the rows do not is a hit that disappears when it opens. A block's record matters most, because
// its `selectName` is what the search reveals it by. So every case opens a real fixture in a
// workspace, as an app does (read-only, and with `editing`, whose documents paint their own
// rows), and holds the records to the scan's of the same bytes.
//
// What a table shows and the index does not take stays out, and the fixtures were chosen to have
// some of it: a bus's elements, a struct's fields and a matrix's cells (rows under an entry), a
// model's configuration sets, references and data sources (sections of no name kind).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { newSourceCache } from 'data-explorer-core';
import { createWorkspace } from '../src/model/source/workspace.js';
import { sourceUri } from '../src/model/source/sourceUri.js';
import type { DocKind } from '../src/model/source/readDocument.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';
import { namesOfFile } from '../src/model/search/nameScan.js';
import { namesFromSldd, type NameRecord } from '../src/model/search/nameExtract.js';
import { searchEntries } from '../src/model/search/searchItems.js';
import { namesOfRows } from '../src/model/search/openDocNames.js';

const FIXTURES = join(import.meta.dirname, 'fixtures');

function bytesOf(name: string): ArrayBuffer {
  const b = readFileSync(join(FIXTURES, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

const pathOf = (name: string): string => `/w/${name}`;

/** The rows a table paints for the fixture, and the kind of document it opened as. */
async function rowsOf(name: string, editing: boolean, bytes = bytesOf(name)): Promise<{ rows: TreeTableRow[]; kind: DocKind }> {
  const ws = createWorkspace({ editing });
  try {
    const doc = await ws.open(bytes, name.split('/').pop()!, sourceUri(pathOf(name)));
    return { rows: (await doc.table.open()).rows, kind: doc.kind };
  } finally {
    ws.dispose();
  }
}

/** What the folder's index records for the same bytes, under the same uri. */
function folderNames(name: string, bytes = bytesOf(name)): Promise<NameRecord[]> {
  const file = { uriString: sourceUri(pathOf(name)), path: pathOf(name) };
  return namesOfFile(newSourceCache(), { version: async () => 'v1', bytes: async () => bytes, dirtyBytes: () => null }, file);
}

async function openNames(name: string, editing: boolean): Promise<NameRecord[]> {
  const { rows, kind } = await rowsOf(name, editing);
  return namesOfRows(rows, sourceUri(pathOf(name)), kind);
}

// Each kind the index reads, and in each, the shapes that tempt a row walk to take too much.
const CASES: [string, string][] = [
  ['params.sldd', 'a JSON dictionary'],
  ['arch.sldd', 'a JSON dictionary of interfaces, whose elements are rows under their entry'],
  ['numeric_json.sldd', 'a JSON dictionary of twenty values'],
  ['compressed.sldd', 'a compressed dictionary'],
  ['nested_objects.sldd', 'a compressed dictionary whose cell and struct hold rows of their own'],
  ['arch_binary.sldd', 'a compressed dictionary of interfaces'],
  ['nd_numeric.mat', 'a MAT-file of matrices, each cell a row under its variable'],
  ['mcos/object_props.mat', 'a MAT-file of objects'],
  ['shadow_ws.slx', 'a model with a workspace variable and two blocks'],
  ['sid_blocks.slx', 'a model with two blocks named Gain in two systems and a block with no name'],
  ['mcos/mcosfix.slx', 'a model with seven workspace variables and a configuration set'],
  ['legacy_ctrl.mdl', 'an .mdl, whose blocks are keyed by name, with a reference and two data sources'],
  ['model_with_refs.slx', 'a model with nothing named'],
];

describe('namesOfRows gives the records the folder index gives the same file', () => {
  for (const editing of [false, true]) {
    describe(editing ? 'in an editing workspace' : 'in a read-only workspace', () => {
      it.each(CASES)('%s, %s', async (name) => {
        const expected = await folderNames(name);
        expect(await openNames(name, editing)).toEqual(expected);
      });
    });
  }

  it('finds names in the fixtures, so the parity above is not between two empty lists', async () => {
    const counts = await Promise.all(CASES.map(async ([name]) => (await openNames(name, false)).length));
    expect(counts).toEqual([3, 10, 20, 1, 2, 3, 4, 3, 3, 3, 7, 2, 0]);
  });

  it("carries a block's key and path, which the search reveals it by", async () => {
    const records = await openNames('sid_blocks.slx', false);
    expect(records).toEqual([
      { name: 'Gain', sourceUri: 'file:///w/sid_blocks.slx', sourceLabel: 'sid_blocks.slx', kind: 'block', selectName: '15', blockPath: 'Gain' },
      { name: 'Gain', sourceUri: 'file:///w/sid_blocks.slx', sourceLabel: 'sid_blocks.slx', kind: 'block', selectName: '24', blockPath: 'Inner/Gain' },
      {
        name: '<SID: 65>',
        sourceUri: 'file:///w/sid_blocks.slx',
        sourceLabel: 'sid_blocks.slx',
        kind: 'block',
        selectName: '65',
        blockPath: 'Inner/<SID: 65>',
      },
    ]);
    // And a search over them reveals each block by its key, never by the label two of them share.
    expect(searchEntries(records, 'inner').map((item) => item.revealName)).toEqual(['24', '65']);
  });

  it("lists a model's workspace variables before its blocks, as namesFromSlx does", async () => {
    expect((await openNames('shadow_ws.slx', false)).map((r) => `${r.kind}:${r.name}`)).toEqual([
      'workspace:Kp',
      'block:WsGain',
      'block:DictOnly',
    ]);
  });

  it('keeps every occurrence of a name a dictionary holds twice', async () => {
    // The shape a paste across namespaces leaves: the same name a second time, with its own uuid.
    const text = readFileSync(join(FIXTURES, 'params.sldd'), 'utf8');
    const entry = /\{\s*"name": "Kp",[\s\S]*?\n\t{5}\}/.exec(text);
    if (!entry) throw new Error('params.sldd no longer spells its entries the way this test edits');
    const bytes = new TextEncoder().encode(text.replace(entry[0], `${entry[0]},\n${entry[0].replace('fixture-uuid-Kp', 'fixture-uuid-Kp2')}`));
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const { rows, kind } = await rowsOf('dup.sldd', false, buffer);
    const records = namesOfRows(rows, sourceUri(pathOf('dup.sldd')), kind);
    expect(records.map((r) => r.name)).toEqual(['Kp', 'Kp', 'Uo', 'Ki']);
    expect(records).toEqual(await folderNames('dup.sldd', buffer));
  });

  // The uri it is given, not the one the rows were painted under: an app may open a file under
  // one id and search it under its folder's. And the file's name by the index's own rule, spaces
  // and all, so the two lists group a hit under the same heading.
  it("names each record's file from the uri it is given, as the index names it", async () => {
    const { rows, kind } = await rowsOf('params.sldd', false);
    const uri = 'file:///w/sub/plant%20data.sldd';
    const records = namesOfRows(rows, uri, kind);
    expect(new Set(records.map((r) => `${r.sourceUri} ${r.sourceLabel}`))).toEqual(
      new Set([`${uri} ${namesFromSldd(['Kp'], uri)[0]!.sourceLabel}`]),
    );
  });
});

describe('namesOfRows over rows as a table holds them', () => {
  // Hand-made rows, for the rules a fixture cannot show on its own.
  const row = (ID: string, parent: string | null, label: string, extra: Record<string, unknown> = {}): TreeTableRow => ({
    ID,
    parent,
    Name: { label },
    Value: '',
    DataType: '',
    Description: '',
    Status: '',
    ...extra,
  });

  it('has nothing for a project, which opens on a page and not in a table', () => {
    expect(namesOfRows([row('section:design', null, 'Design Data'), row('a', 'section:design', 'a')], 'file:///w/p.prj', 'project')).toEqual([]);
  });

  it('drops a row with no name, as the index drops an entry with none', () => {
    const rows = [row('section:design', null, 'Design Data'), row('x', 'section:design', ''), row('y', 'section:design', 'y')];
    expect(namesOfRows(rows, 'file:///w/d.sldd', 'dictionary').map((r) => r.name)).toEqual(['y']);
    expect(namesOfRows([row('m', null, ''), row('n', null, 'n')], 'file:///w/v.mat', 'mat').map((r) => r.name)).toEqual(['n']);
  });

  it('takes a block only with its key, since without one the search could not reveal it', () => {
    const rows = [
      row('section:blocks', null, 'Model Elements'),
      row('b1', 'section:blocks', 'Gain', { _blockKey: '7', _blockPath: 'Sub/Gain' }),
      row('b2', 'section:blocks', 'Lost'),
    ];
    expect(namesOfRows(rows, 'file:///w/m.slx', 'model')).toEqual([
      { name: 'Gain', sourceUri: 'file:///w/m.slx', sourceLabel: 'm.slx', kind: 'block', selectName: '7', blockPath: 'Sub/Gain' },
    ]);
  });

  it("falls back to a block's label for its path when the row has none", () => {
    const rows = [row('section:blocks', null, 'Model Elements'), row('b1', 'section:blocks', 'Gain', { _blockKey: '7' })];
    expect(namesOfRows(rows, 'file:///w/m.slx', 'model')[0]!.blockPath).toBe('Gain');
  });
});

describe('namesOfRows with cells', () => {
  // For the app shell's ranked search, which matches on what a table shows beside the name and
  // says what each match is. The records are the index's otherwise: the parity above holds.
  it("adds each entry's Value, Data Type and Class as its row shows them, and nothing else", async () => {
    const { rows, kind } = await rowsOf('params.sldd', true);
    const uri = sourceUri(pathOf('params.sldd'));
    const records = namesOfRows(rows, uri, kind, { cells: true });
    expect(records.map(({ value, dataType, className, ...rest }) => rest)).toEqual(namesOfRows(rows, uri, kind));
    expect(records.find((r) => r.name === 'Kp')).toMatchObject({ value: '1', dataType: 'double', className: 'double' });
  });

  it("gives a block its type and no value, and an object its class", async () => {
    const model = await rowsOf('shadow_ws.slx', false);
    const blocks = namesOfRows(model.rows, sourceUri(pathOf('shadow_ws.slx')), model.kind, { cells: true }).filter((r) => r.kind === 'block');
    expect(blocks.map((r) => [r.name, r.value, r.dataType, r.className])).toEqual([
      ['WsGain', undefined, 'Gain', undefined],
      ['DictOnly', undefined, 'Constant', undefined],
    ]);
    const mat = await rowsOf('mcos/object_props.mat', false);
    const vars = namesOfRows(mat.rows, sourceUri(pathOf('mcos/object_props.mat')), mat.kind, { cells: true });
    expect(vars.find((r) => r.name === 'v')).toMatchObject({ value: '<1x1 Vehicle>', className: 'Vehicle' });
  });
});
