// Copyright 2026 The MathWorks, Inc.
//
// A document's sections and their entries (readEntries), as the app's command line lists them
// (`info`) and as a folder check reads each file's entries (checkFolder).
//
// What this protects is that an entry is the row right under a section heading, every one of them,
// and nothing below one. A model's struct field or a matrix's cell is a row too, and a reader that
// took every row would count it as an entry. And however small the paint's budget, the entries
// come whole: the paint holds back what lies below an entry, never an entry, so readEntries asks
// `children()` only for a heading whose entries the paint left out altogether, which this package's
// sources never do (a made-up source stands in for one that might).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorkspace, type Workspace, type WorkspaceOptions } from '../src/model/source/workspace.js';
import { readEntries } from '../src/model/source/entries.js';
import type { ChildRows, TableSource, TableView } from '../src/model/source/tableSource.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, 'fixtures', name)));
const shellFixture = (name: string): Uint8Array => new Uint8Array(readFileSync(join(import.meta.dirname, 'shell/fixtures', name)));

const workspaces: Workspace[] = [];
afterEach(() => {
  for (const ws of workspaces.splice(0)) ws.dispose();
});

/** The table of `bytes` opened as `name` in a workspace of its own. */
async function tableOf(bytes: Uint8Array, name: string, options: WorkspaceOptions = {}): Promise<TableSource> {
  const ws = createWorkspace(options);
  workspaces.push(ws);
  return (await ws.open(bytes, name, `file:///w/${name}`)).table;
}

/** `table`, with each call of `open` and `children` counted. */
function counted(table: TableSource): { table: TableSource; calls: { open: number; children: number } } {
  const calls = { open: 0, children: 0 };
  const wrapped: TableSource = {
    open: () => {
      calls.open++;
      return table.open();
    },
    children: (rowId) => {
      calls.children++;
      return table.children(rowId);
    },
    matrix: (nodeId) => table.matrix(nodeId),
    inspect: (selection, options) => table.inspect(selection, options),
    subscribe: (listener) => table.subscribe(listener),
  };
  return { table: wrapped, calls };
}

const labels = (rows: readonly TreeTableRow[]): string[] => rows.map((r) => r.Name.label);

describe('readEntries', () => {
  it("lists a dictionary's four sections, each with the entries right under its heading", async () => {
    const sections = await readEntries(await tableOf(fixture('params.sldd'), 'params.sldd'));
    expect(sections.map((s) => s.key)).toEqual(['design', 'arch', 'config', 'other']);
    expect(sections.map((s) => s.label)).toEqual(['Design Data', 'Architectural Data', 'Configurations', 'Other Data']);
    expect(sections.map((s) => labels(s.entries))).toEqual([['Kp', 'Uo', 'Ki'], [], [], []]);
    expect(sections.map((s) => s.heading?.ID)).toEqual(['section:design', 'section:arch', 'section:config', 'section:other']);
  });

  it("lists a MAT-file's variables as one section with no heading, and not their cells", async () => {
    const sections = await readEntries(await tableOf(fixture('nd_numeric.mat'), 'nd_numeric.mat'));
    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe('');
    expect(sections[0].label).toBe('');
    expect(sections[0].heading).toBeUndefined();
    expect(labels(sections[0].entries)).toEqual(['Mat', 'Nd', 'Nd4', 'Vec']);
    // A matrix's cells are its rows' elements: none of them is an entry.
    expect(sections[0].entries.some((r) => r.Name.element)).toBe(false);
  });

  it("lists a model's sections, and its workspace's variables but not a struct's fields", async () => {
    const sections = await readEntries(await tableOf(shellFixture('slxcases.slx'), 'slxcases.slx'));
    expect(sections.map((s) => s.key)).toEqual(['blocks', 'workspace', 'config', 'references', 'dataSources']);
    expect(sections.map((s) => s.entries.length)).toEqual([5, 8, 2, 1, 1]);
    // `inner` is a struct whose fields `mode` and `gain` are rows under it, not entries.
    expect(labels(sections[1].entries)).toEqual(['cfg', 'flag', 'grid', 'inner', 'label', 'names', 'span', 'tau']);
  });

  it('gives every entry under a small row budget, and asks for nothing below them', async () => {
    const whole = await readEntries(await tableOf(fixture('numeric_json.sldd'), 'numeric_json.sldd'));
    const small = counted(await tableOf(fixture('numeric_json.sldd'), 'numeric_json.sldd', { rowBudget: 2 }));
    const design = (await readEntries(small.table)).find((s) => s.key === 'design')!;
    expect(design.entries).toHaveLength(20);
    expect(design.entries.map((r) => r.ID)).toEqual(whole.find((s) => s.key === 'design')!.entries.map((r) => r.ID));

    const mat = counted(await tableOf(fixture('nd_numeric.mat'), 'nd_numeric.mat', { rowBudget: 2 }));
    const [variables] = await readEntries(mat.table);
    // Each variable's cells were held back, and stay so: an entry's own `_lazy` is left alone.
    expect(variables.entries.map((r) => [r.Name.label, r._lazy])).toEqual([
      ['Mat', true],
      ['Nd', true],
      ['Nd4', true],
      ['Vec', true],
    ]);
    expect(small.calls.children + mat.calls.children).toBe(0);
  });

  it('fetches the entries of a heading the paint held back, once, and nothing under them', async () => {
    let children = 0;
    const unasked = (): never => {
      throw new Error('not asked of a held-back heading');
    };
    const row = (ID: string, parent: string | null, label: string, extra: Partial<TreeTableRow> = {}): TreeTableRow =>
      ({ ID, parent, Name: { label }, Value: '', DataType: '', Description: '', Status: '', ...extra }) as TreeTableRow;
    const source: TableSource = {
      open: async (): Promise<TableView> => ({
        docUri: 'file:///w/made.sldd',
        rows: [row('section:design', null, 'Design Data', { _lazy: true })],
        columns: ['Name'],
        columnLabels: {},
        columnGroups: {},
        editable: false,
      }),
      children: async (rowId): Promise<ChildRows> => {
        children++;
        return {
          nodeId: rowId,
          rows: [row('e1', 'section:design', 'A', { _lazy: true }), row('e1/f', 'e1', 'field'), row('e2', 'section:design', 'B')],
          truncated: 0,
        };
      },
      matrix: unasked,
      inspect: unasked,
      subscribe: unasked,
    };
    const sections = await readEntries(source);
    expect(sections.map((s) => [s.key, s.label])).toEqual([['design', 'Design Data']]);
    expect(labels(sections[0].entries)).toEqual(['A', 'B']);
    expect(children).toBe(1);
  });

  it('reads the entries of a view the caller already has, without opening the table again', async () => {
    const { table, calls } = counted(await tableOf(fixture('params.sldd'), 'params.sldd'));
    const view = await table.open();
    const shown = { ...view, rows: view.rows.filter((r) => r.Name.label !== 'Ki') };
    calls.open = 0;
    const sections = await readEntries(table, shown);
    expect(labels(sections.find((s) => s.key === 'design')!.entries)).toEqual(['Kp', 'Uo']);
    expect(calls.open).toBe(0);
  });

  it('rejects as the table does, with its banner text, for a file that does not read', async () => {
    const table = await tableOf(new TextEncoder().encode('x'), 'bad.sldd');
    await expect(readEntries(table)).rejects.toThrow(/^Failed to parse bad\.sldd/);
  });
});
