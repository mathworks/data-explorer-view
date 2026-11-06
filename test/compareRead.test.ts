// Copyright 2026 The MathWorks, Inc.
//
// Real documents compared: every row of a side read through its table's source (readDiffSide),
// two sources compared (diffDocuments), and two files compared from their bytes with no page
// (diffFiles), for each kind of file this package opens.
//
// This file has no environment line, on purpose: it runs in vitest's node environment, with no
// DOM at all, which is how the command line's `diff` runs these same functions. That it passes
// here is what says a terminal (or Electron's main process, or a worker) can compare two files.
//
// The second version of each file is made in the test, by an edit through its engine
// (compare/derive.ts), so the difference expected is the one edit made: an entry's Value, a
// deleted entry, a new one, a compressed dictionary's struct field, a MAT-file's matrix element, a
// model workspace's variable. Around it, everything else must read the same, which is as much a
// part of the answer: a compare that found differences the edit did not make would be noise.
import { afterEach, describe, expect, it } from 'vitest';
import { DataModel } from 'data-explorer-core';
import { diffDocuments, diffFiles } from '../src/model/compare/diffDocuments.js';
import { readDiffSide } from '../src/model/compare/readSide.js';
import type { DocumentDiff, RowDiff } from '../src/model/compare/diff.js';
import { createWorkspace, sourceUri, type TableSource, type Workspace, type WorkspaceOptions } from '../src/model/index.js';
import { derive, fixtureBytes, rowNamed, settle } from './compare/derive.js';

let workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces) ws.dispose();
  workspaces = [];
  // Nothing here registers in core's module-level session, which the VS Code extension uses.
  expect(DataModel.getDataSourceIds()).toEqual([]);
});

/** A workspace this test disposes after it. */
function workspace(options: WorkspaceOptions = {}): Workspace {
  const ws = createWorkspace(options);
  workspaces.push(ws);
  return ws;
}

/** The table of `bytes` opened as `name` under `/w/`, in a workspace of its own. */
async function tableOf(bytes: Uint8Array, name: string, options: WorkspaceOptions = {}): Promise<TableSource> {
  return (await workspace(options).open(bytes, name, sourceUri(`/w/${name}`))).table;
}

const section = (diff: DocumentDiff, key: string) => diff.sections.find((s) => s.key === key)!;
/** Each line's last name and status. */
const shapeOf = (rows: readonly RowDiff[]): string[] => rows.map((row) => `${row.path[row.path.length - 1]} ${row.status}`);
/** Every line of the diff, entries and the rows under them. */
function everyRow(diff: DocumentDiff): RowDiff[] {
  const out: RowDiff[] = [];
  const walk = (rows: readonly RowDiff[]): void => {
    for (const row of rows) {
      out.push(row);
      walk(row.children);
    }
  };
  for (const s of diff.sections) walk(s.rows);
  return out;
}
const lineAt = (diff: DocumentDiff, path: string[]): RowDiff => {
  const row = everyRow(diff).find((r) => r.path.join('\u0000') === path.join('\u0000'));
  if (!row) throw new Error(`no line ${path.join(' / ')}`);
  return row;
};

/** params.sldd with Kp 1 → 5, Uo deleted, and a new Simulink.Parameter (named Param) in design. */
const editedParams = (): Promise<Uint8Array> =>
  derive(fixtureBytes('params.sldd'), 'params.sldd', async (table, rows) => {
    await table.edit({ rowId: rowNamed(rows, 'Kp').ID, columnId: 'Value', oldValue: '1', newValue: '5' });
    await settle();
    table.delete([rowNamed(rows, 'Uo').ID]);
    await settle();
    table.addEntry({ section: 'design', className: 'Simulink.Parameter', rename: false });
  });

describe('diffFiles', () => {
  it('compares a JSON dictionary and its edited version', async () => {
    const diff = await diffFiles(
      { bytes: fixtureBytes('params.sldd'), name: 'params.sldd', path: '/a/params.sldd' },
      { bytes: await editedParams(), name: 'params.sldd', path: '/b/params.sldd' },
    );
    expect(diff.a).toBe('file:///a/params.sldd');
    expect(diff.b).toBe('file:///b/params.sldd');
    const design = section(diff, 'design');
    expect(shapeOf(design.rows)).toEqual(['Kp changed', 'Uo removed', 'Ki same', 'Param added']);
    expect(design.rows[0].properties).toEqual([{ column: 'Value', label: 'Value', before: '1', after: '5' }]);
    for (const key of ['arch', 'config', 'other']) {
      expect(section(diff, key).status).toBe('same');
      expect(section(diff, key).rows).toEqual([]);
    }
    expect(diff.counts).toEqual({ changed: 1, removed: 1, added: 1, same: 1 });
  });

  it('reads a JSON dictionary and its compressed twin alike', async () => {
    const diff = await diffFiles({ bytes: fixtureBytes('rt_text.sldd'), name: 'rt_text.sldd' }, { bytes: fixtureBytes('rt_bin.sldd'), name: 'rt_bin.sldd' });
    expect(everyRow(diff).filter((row) => row.status !== 'same').map((row) => [row.path, row.properties])).toEqual([]);
    expect(diff.counts).toMatchObject({ changed: 0, added: 0, removed: 0 });
    expect(diff.counts.same).toBeGreaterThan(0);
  });

  it("finds a compressed dictionary's changed struct field", async () => {
    const edited = await derive(fixtureBytes('rt_bin.sldd'), 'rt_bin.sldd', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'Wheels', 'gadget').ID, columnId: 'Value', oldValue: '4', newValue: '42' });
    });
    const diff = await diffFiles({ bytes: fixtureBytes('rt_bin.sldd'), name: 'rt_bin.sldd', path: '/a/rt_bin.sldd' }, { bytes: edited, name: 'rt_bin.sldd', path: '/b/rt_bin.sldd' });
    const wheels = lineAt(diff, ['gadget', 'Wheels']);
    expect(wheels.status).toBe('changed');
    expect(wheels.properties).toEqual([{ column: 'Value', label: 'Value', before: '4', after: '42' }]);
    expect(lineAt(diff, ['gadget']).changedBelow).toBe(true);
    expect(everyRow(diff).filter((row) => row.status !== 'same').map((row) => row.path)).toEqual([['gadget', 'Wheels']]);
    expect(diff.counts.changed).toBe(1);
  });

  it('compares two MAT-files, a matrix element by element', async () => {
    const edited = await derive(fixtureBytes('nd_numeric.mat'), 'nd_numeric.mat', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'Mat').ID, columnId: 'Value', oldValue: '[1 2 3; 4 5 6]', newValue: '[1 2 3; 4 5 7]' });
    });
    const diff = await diffFiles({ bytes: fixtureBytes('nd_numeric.mat'), name: 'nd_numeric.mat', path: '/a/nd_numeric.mat' }, { bytes: edited, name: 'nd_numeric.mat', path: '/b/nd_numeric.mat' });
    expect(diff.sections.map((s) => s.key)).toEqual(['']);
    const mat = lineAt(diff, ['Mat']);
    expect(mat.status).toBe('changed');
    expect(mat.properties.map((p) => p.column)).toEqual(['Value']);
    expect(lineAt(diff, ['Mat', 'Mat(2,3)']).status).toBe('changed');
    expect(lineAt(diff, ['Mat', 'Mat(2,2)']).status).toBe('same');
    expect(lineAt(diff, ['Nd']).status).toBe('same');
    expect(lineAt(diff, ['Nd']).changedBelow).toBe(false);
    expect(diff.counts.changed).toBe(1);
  });

  it("compares a model's workspace, and finds its blocks alike", async () => {
    const edited = await derive(fixtureBytes('slxcases.slx', true), 'slxcases.slx', async (table, rows) => {
      await table.edit({ rowId: rowNamed(rows, 'tau').ID, columnId: 'Value', oldValue: '0.25', newValue: '0.5' });
    });
    const diff = await diffFiles({ bytes: fixtureBytes('slxcases.slx', true), name: 'slxcases.slx', path: '/a/slxcases.slx' }, { bytes: edited, name: 'slxcases.slx', path: '/b/slxcases.slx' });
    const tau = lineAt(diff, ['tau']);
    expect(tau.status).toBe('changed');
    expect(tau.properties).toEqual([{ column: 'Value', label: 'Value', before: '0.25', after: '0.5' }]);
    const blocks = section(diff, 'blocks');
    expect(blocks.rows.length).toBeGreaterThan(0);
    expect(blocks.rows.every((row) => row.status === 'same' && !row.changedBelow)).toBe(true);
    expect(diff.counts.changed).toBe(1);
  });

  it('refuses a project, a file of no kind it reads, and a file that cannot be read', async () => {
    const text = (s: string) => new TextEncoder().encode(s);
    const params = { bytes: fixtureBytes('params.sldd'), name: 'params.sldd' };
    await expect(diffFiles({ bytes: text('<x/>'), name: 'MyProj.prj' }, params)).rejects.toThrow('MyProj.prj is a project, which opens on a page: compare compares data files.');
    await expect(diffFiles(params, { bytes: text('x'), name: 'notes.txt' })).rejects.toThrow(
      'notes.txt is not a file compare reads: it compares data dictionaries (.sldd), models (.slx, .mdl) and MAT-files (.mat).',
    );
    await expect(diffFiles(params, { bytes: text('x'), name: 'bad.sldd' })).rejects.toThrow(/^Failed to parse bad\.sldd/);
  });

  it('reads each file in a session of its own, even two under one path', async () => {
    const bytes = fixtureBytes('params.sldd');
    const diff = await diffFiles({ bytes, name: 'params.sldd', path: '/w/params.sldd' }, { bytes, name: 'params.sldd', path: '/w/params.sldd' });
    expect(diff.counts).toEqual({ changed: 0, added: 0, removed: 0, same: 3 });
    // The afterEach's check: both workspaces are gone.
  });
});

describe('readDiffSide', () => {
  it('fetches the rows a paint held back', async () => {
    const bytes = fixtureBytes('nd_numeric.mat');
    const held = await tableOf(bytes, 'nd_numeric.mat', { rowBudget: 3 });
    expect((await held.open()).rows.some((row) => row._lazy)).toBe(true);
    const side = await readDiffSide(held);
    expect(side.rows.some((row) => row._lazy)).toBe(false);
    const whole = await readDiffSide(await tableOf(bytes, 'nd_numeric.mat'));
    expect(new Set(side.rows.map((row) => row.ID))).toEqual(new Set(whole.rows.map((row) => row.ID)));
    expect(side.rows.length).toBe(whole.rows.length);
    // Parents before children.
    const seen = new Set<string>();
    for (const row of side.rows) {
      if (row.parent !== null) expect(seen.has(row.parent)).toBe(true);
      seen.add(row.ID);
    }
  });

  it('starts from the rows shown, and asks open() nothing more', async () => {
    const table = await tableOf(fixtureBytes('params.sldd'), 'params.sldd');
    let opens = 0;
    const counted: TableSource = {
      open: () => (opens++, table.open()),
      children: (rowId) => table.children(rowId),
      matrix: (nodeId) => table.matrix(nodeId),
      inspect: (selection, options) => table.inspect(selection, options),
      subscribe: (listener) => table.subscribe(listener),
    };
    const view = await counted.open();
    expect(opens).toBe(1);
    const side = await readDiffSide(counted, { shown: { view, rows: view.rows.filter((row) => row.Name.label !== 'Ki') } });
    expect(opens).toBe(1);
    expect(side.rows.some((row) => row.Name.label === 'Ki')).toBe(false);
    expect(side.rows.some((row) => row.Name.label === 'Kp')).toBe(true);
    expect(side.docUri).toBe('file:///w/params.sldd');
    expect(side.columns).toEqual(view.columns);
  });

  it("reads each entry's inspector page when asked, and none past maxPages", async () => {
    const table = await tableOf(fixtureBytes('params.sldd'), 'params.sldd');
    const { rows } = await table.open();
    const side = await readDiffSide(table, { properties: true });
    expect([...side.pages!.keys()]).toEqual(['Kp', 'Uo', 'Ki'].map((label) => rowNamed(rows, label).ID));
    for (const groups of side.pages!.values()) expect(groups.length).toBeGreaterThan(0);
    expect(side.pagesSkipped).toBeUndefined();

    const skipped = await readDiffSide(table, { properties: true, maxPages: 2 });
    expect(skipped.pages).toBeUndefined();
    expect(skipped.pagesSkipped).toBe(true);
    expect((await readDiffSide(table)).pages).toBeUndefined();
  });

  it('refuses a side of more rows than maxRows', async () => {
    const table = await tableOf(fixtureBytes('nd_numeric.mat'), 'nd_numeric.mat');
    await expect(readDiffSide(table, { maxRows: 5 })).rejects.toThrow('nd_numeric.mat has more than 5 rows to compare.');
  });
});

describe('diffDocuments', () => {
  it("compares two open documents as diffFiles compares their bytes", async () => {
    const before = fixtureBytes('params.sldd');
    const after = await editedParams();
    const ws = workspace({ editing: true });
    const a = await ws.open(before, 'params.sldd', sourceUri('/a/params.sldd'));
    const b = await ws.open(after, 'params.sldd', sourceUri('/b/params.sldd'));
    const open = await diffDocuments(a.table, b.table);
    const bytes = await diffFiles({ bytes: before, name: 'params.sldd', path: '/a/params.sldd' }, { bytes: after, name: 'params.sldd', path: '/b/params.sldd' });
    const shape = (diff: DocumentDiff) => ({ counts: diff.counts, rows: everyRow(diff).map((row) => [row.path, row.status]) });
    expect(shape(open)).toEqual(shape(bytes));
    expect(open.counts).toEqual({ changed: 1, removed: 1, added: 1, same: 1 });
  });
});
