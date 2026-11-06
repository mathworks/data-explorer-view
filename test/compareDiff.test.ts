// Copyright 2026 The MathWorks, Inc.
//
// Two documents' rows compared (diffSides): which row of one is which row of the other, how each
// stands, what differs, in what order the lines come, and how the entries are counted.
//
// The sides are made up here, row by row, so each rule is seen alone: a real file has every rule
// at once (test/compareRead.test.ts reads real ones). What matters most is the matching, as every
// other answer follows from it: a row matched with the wrong one reads as two changes the user
// did not make, and one left unmatched as an add and a remove. Rows match by their section and
// their name path (a struct field by its path inside its entry, a block by its path through the
// model), and where one name is held by several rows (a dictionary may hold two entries of a name
// in one section), by class first and then by order. The keys a view draws its lines by must come
// out the same from two diffs of the same documents, and be plain enough to put in an id.
import { describe, expect, it } from 'vitest';
import { diffSides, diffSummary, type DocumentDiff, type RowDiff } from '../src/model/compare/diff.js';
import type { DiffSide } from '../src/model/compare/readSide.js';
import type { PropertyGroup } from '../src/model/inspector/piBuilder.js';
import { COLUMN_LABELS } from '../src/model/rows/rowBuilder.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';

/** A made-up row: its name, its cells, and the rows under it. */
interface Made {
  label: string;
  cells: Partial<Record<string, string>> & { _blockPath?: string; element?: true };
  children: Made[];
}
const r = (label: string, cells: Made['cells'] = {}, children: Made[] = []): Made => ({ label, cells, children });

const SIDE_COLUMNS = ['Name', 'Value', 'DataType', 'UsedBy', 'Status', 'Kind', 'Class', 'Description', 'Min', 'lastModified'];

/**
 * A side of made-up rows, by section key ('' for a MAT-file's variables: no heading): ids
 * `${uri}/${key}/${path}#${n}`, headings `section:${key}` labelled by `labels[key] ?? key`,
 * columns ['Name','Value','DataType','UsedBy','Status','Kind','Class','Description','Min','lastModified'],
 * columnLabels those keys' COLUMN_LABELS (rowBuilder.ts: 'Data Type', 'Usage', 'Last Modified', the rest
 * their key), a cell key `element` setting `Name.element`, any other key the row's cell of that name.
 * `pages` are by an entry's label.
 */
function sideOf(uri: string, sections: Record<string, Made[]>, pages?: Record<string, PropertyGroup[]>, labels: Record<string, string> = {}): DiffSide {
  const rows: TreeTableRow[] = [];
  const pageMap = new Map<string, PropertyGroup[]>();
  let n = 0;
  const add = (made: Made, key: string, parent: string | null, path: string[], entry: boolean): void => {
    const here = [...path, made.label];
    const ID = `${uri}/${key}/${here.join('/')}#${n++}`;
    const { element, ...cells } = made.cells;
    rows.push({
      ID,
      parent,
      Name: { label: made.label, ...(element ? { element: true } : {}) },
      Value: '',
      DataType: '',
      Description: '',
      Status: '',
      ...cells,
    });
    if (entry && pages?.[made.label]) pageMap.set(ID, pages[made.label]);
    for (const child of made.children) add(child, key, ID, here, false);
  };
  for (const [key, entries] of Object.entries(sections)) {
    let parent: string | null = null;
    if (key !== '') {
      parent = `section:${key}`;
      rows.push({ ID: parent, parent: null, Name: { label: labels[key] ?? key }, Value: '', DataType: '', Description: '', Status: '' });
    }
    for (const made of entries) add(made, key, parent, [], true);
  }
  return {
    docUri: uri,
    rows,
    columns: SIDE_COLUMNS,
    columnLabels: Object.fromEntries(SIDE_COLUMNS.map((c) => [c, COLUMN_LABELS[c]])),
    ...(pages ? { pages: pageMap } : {}),
  };
}

const A = 'file:///a/x.sldd';
const B = 'file:///b/x.sldd';

/** The section `key`'s lines. */
const linesOf = (diff: DocumentDiff, key = 'design'): readonly RowDiff[] => diff.sections.find((s) => s.key === key)!.rows;
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
  for (const section of diff.sections) walk(section.rows);
  return out;
}

describe('diffSides', () => {
  it('matches entries by name whatever their order', () => {
    const diff = diffSides(sideOf(A, { design: [r('Kp'), r('Ki')] }), sideOf(B, { design: [r('Ki'), r('Kp')] }));
    expect(shapeOf(linesOf(diff))).toEqual(['Kp same', 'Ki same']);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 0, same: 2 });
  });

  it('says what was added, removed and changed, with each differing column', () => {
    const diff = diffSides(
      sideOf(A, { design: [r('Kp', { Value: '1' }), r('Uo', { Value: '2' })] }),
      sideOf(B, { design: [r('Kp', { Value: '5', Description: 'gain' }), r('Param', { Class: 'Simulink.Parameter' })] }),
    );
    const [kp, param, uo] = linesOf(diff);
    expect(shapeOf(linesOf(diff))).toEqual(['Kp changed', 'Param added', 'Uo removed']);
    expect(kp.properties).toEqual([
      { column: 'Value', label: 'Value', before: '1', after: '5' },
      { column: 'Description', label: 'Description', before: '', after: 'gain' },
    ]);
    expect(uo.a).toBeDefined();
    expect(uo.b).toBeUndefined();
    expect(param.a).toBeUndefined();
    expect(param.b?.Name.label).toBe('Param');
    expect(diff.counts).toEqual({ changed: 1, added: 1, removed: 1, same: 0 });
  });

  it("matches a struct field by its path inside its entry", () => {
    const diff = diffSides(
      sideOf(A, { design: [r('cfg', { Value: '<1x1 struct>' }, [r('mode', { Value: 'fast' }), r('gain', { Value: '2' })])] }),
      sideOf(B, { design: [r('cfg', { Value: '<1x1 struct>' }, [r('gain', { Value: '3' }), r('mode', { Value: 'fast' }), r('extra', { Value: '1' })])] }),
    );
    const [cfg] = linesOf(diff);
    expect(cfg.status).toBe('same');
    expect(cfg.changedBelow).toBe(true);
    expect(shapeOf(cfg.children)).toEqual(['mode same', 'extra added', 'gain changed']);
    expect(cfg.children[1].path).toEqual(['cfg', 'extra']);
    expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1, same: 0 });
  });

  it('pairs entries of one name by class first', () => {
    const diff = diffSides(
      sideOf(A, { design: [r('p', { Class: 'double', Value: '1' }), r('p', { Class: 'Simulink.Parameter', Value: '2' })] }),
      sideOf(B, { design: [r('p', { Class: 'Simulink.Parameter', Value: '2' }), r('p', { Class: 'double', Value: '3' })] }),
    );
    const [double, param] = linesOf(diff);
    expect(double.status).toBe('changed');
    expect(double.properties).toEqual([{ column: 'Value', label: 'Value', before: '1', after: '3' }]);
    expect(param.status).toBe('same');
    expect(param.a?.Class).toBe('Simulink.Parameter');
    expect(double.key).not.toBe(param.key);
    expect(double.key.endsWith('~0')).toBe(true);
    expect(param.key.endsWith('~1')).toBe(true);
  });

  it('pairs the entries of one name left over in order, across classes', () => {
    const diff = diffSides(
      sideOf(A, { design: [r('p', { Class: 'double' }), r('p', { Class: 'single' })] }),
      sideOf(B, { design: [r('p', { Class: 'int8' }), r('p', { Class: 'double' })] }),
    );
    const [double, single] = linesOf(diff);
    expect(double.status).toBe('same');
    expect(double.b?.Class).toBe('double');
    expect(single.status).toBe('changed');
    expect(single.properties).toEqual([{ column: 'Class', label: 'Class', before: 'single', after: 'int8' }]);
  });

  it('removes the one more of a name one side has', () => {
    const diff = diffSides(
      sideOf(A, { design: [r('p', { Class: 'double', Value: '1' }), r('p', { Class: 'double', Value: '2' })] }),
      sideOf(B, { design: [r('p', { Class: 'double', Value: '1' })] }),
    );
    expect(shapeOf(linesOf(diff))).toEqual(['p same', 'p removed']);
    expect(linesOf(diff)[1].a?.Value).toBe('2');
  });

  it("matches a model's blocks by their path", () => {
    const diff = diffSides(
      sideOf(A, { blocks: [r('Gain', { _blockPath: 'Gain' }), r('Gain', { _blockPath: 'Sub/Gain' })] }),
      sideOf(B, { blocks: [r('Gain', { _blockPath: 'Sub/Gain', Description: 'x' }), r('Gain', { _blockPath: 'Gain' })] }),
    );
    const lines = linesOf(diff, 'blocks');
    expect(lines.map((row) => [row.path, row.status])).toEqual([
      [['Gain'], 'same'],
      [['Sub/Gain'], 'changed'],
    ]);
    expect(lines[1].properties.map((p) => p.column)).toEqual(['Description']);
    expect(lines.some((row) => row.key.includes('~'))).toBe(false);
  });

  it('compares numbers by their value', () => {
    const diff = diffSides(
      sideOf(A, { design: [r('Kp', { Value: '1' }), r('v', { Value: '[1 2 3]' })] }),
      sideOf(B, { design: [r('Kp', { Value: '1.0' }), r('v', { Value: '[1, 2, 3]' })] }),
    );
    expect(shapeOf(linesOf(diff))).toEqual(['Kp same', 'v same']);
  });

  it('takes two numbers within the tolerance for the same', () => {
    const a = sideOf(A, { design: [r('x', { Value: '0.1' })] });
    const b = sideOf(B, { design: [r('x', { Value: '0.1000001' })] });
    expect(linesOf(diffSides(a, b))[0].status).toBe('changed');
    expect(linesOf(diffSides(a, b, { tolerance: 1e-6 }))[0].status).toBe('same');
  });

  it("compares entries' inspector pages when asked, and both sides have them", () => {
    const general: PropertyGroup = {
      title: 'General',
      properties: [
        { name: 'Name', value: 'Fast' },
        { name: 'Class', value: 'Simulink.ConfigSet' },
      ],
    };
    const before = { Fast: [general, { title: 'Solver', properties: [{ name: 'StopTime', value: '10' }] }] };
    const after = {
      Fast: [
        general,
        {
          title: 'Solver',
          properties: [
            { name: 'StopTime', value: '20' },
            { name: 'Extra', value: 'x' },
          ],
        },
      ],
    };
    const entries = { config: [r('Fast', { Class: 'Simulink.ConfigSet' })] };
    const a = sideOf(A, entries, before);
    const b = sideOf(B, entries, after);

    const plain = diffSides(a, b);
    expect(linesOf(plain, 'config')[0].status).toBe('same');
    expect(plain.propertiesCompared).toBe(false);

    const paged = diffSides(a, b, { properties: true });
    expect(linesOf(paged, 'config')[0].status).toBe('changed');
    expect(linesOf(paged, 'config')[0].properties).toEqual([
      { column: 'inspector:Solver/StopTime', label: 'StopTime', group: 'Solver', before: '10', after: '20' },
      { column: 'inspector:Solver/Extra', label: 'Extra', group: 'Solver', before: '', after: 'x' },
    ]);
    expect(paged.propertiesCompared).toBe(true);

    const half = diffSides(a, sideOf(B, entries), { properties: true });
    expect(linesOf(half, 'config')[0].status).toBe('same');
    expect(half.propertiesCompared).toBe(false);
  });

  it('skips the columns every save and every folder change rewrites, unless asked', () => {
    const a = sideOf(A, { design: [r('x', { UsedBy: 'm1', Status: '', Kind: 'Parameter', lastModified: '2026-01-01' })] });
    const b = sideOf(B, { design: [r('x', { UsedBy: 'm2', Status: 'Modified', Kind: 'Signal', lastModified: '2026-11-06' })] });
    const diff = diffSides(a, b);
    expect(linesOf(diff)[0].status).toBe('same');
    expect(diff.columns).toEqual(['Value', 'DataType', 'Class', 'Description', 'Min']);
    const asked = diffSides(a, b, { columns: ['Value', 'Status'] });
    expect(linesOf(asked)[0].status).toBe('changed');
    expect(linesOf(asked)[0].properties).toEqual([{ column: 'Status', label: 'Status', before: '', after: 'Modified' }]);
  });

  it('matches sections by their key', () => {
    const diff = diffSides(sideOf(A, { design: [r('x')], other: [] }), sideOf(B, { design: [r('x')], arch: [r('y')], other: [] }));
    expect(diff.sections.map((s) => [s.key, s.status])).toEqual([
      ['design', 'same'],
      ['arch', 'added'],
      ['other', 'same'],
    ]);
    const arch = diff.sections[1];
    expect(shapeOf(arch.rows)).toEqual(['y added']);
    expect(arch.a).toBeUndefined();
    expect(arch.b?.ID).toBe('section:arch');
    expect(arch.counts).toEqual({ added: 1, removed: 0, changed: 0, same: 0 });
  });

  it("reads a MAT-file's variables as one section with no heading", () => {
    const diff = diffSides(sideOf('file:///a/x.mat', { '': [r('x'), r('y')] }), sideOf('file:///b/x.mat', { '': [r('y')] }));
    expect(diff.sections).toHaveLength(1);
    const [section] = diff.sections;
    expect(section.key).toBe('');
    expect(section.label).toBe('');
    expect(section.a).toBeUndefined();
    expect(section.b).toBeUndefined();
    expect(shapeOf(section.rows)).toEqual(['x removed', 'y same']);
  });

  it('keeps only the sections asked for, by key or label, ignoring case', () => {
    const labels = { design: 'Design Data' };
    const a = sideOf(A, { design: [r('x', { Value: '1' })], other: [r('o')] }, undefined, labels);
    const b = sideOf(B, { design: [r('x', { Value: '2' })], other: [] }, undefined, labels);
    for (const sections of [['DESIGN'], ['Design Data']]) {
      const diff = diffSides(a, b, { sections });
      expect(diff.sections.map((s) => s.key)).toEqual(['design']);
      expect(diff.sections[0].label).toBe('Design Data');
      expect(diff.counts).toEqual({ added: 0, removed: 0, changed: 1, same: 0 });
    }
  });

  it("puts a row only in b after its nearest preceding match, in a's order", () => {
    const diff = diffSides(sideOf(A, { design: [r('x'), r('y'), r('z')] }), sideOf(B, { design: [r('w'), r('x'), r('q'), r('z')] }));
    expect(shapeOf(linesOf(diff))).toEqual(['w added', 'x same', 'q added', 'y removed', 'z same']);
  });

  it('says an array is compared only as far as its element rows go', () => {
    const elements = [r('v(1)', { element: true }), r('v(2)', { element: true }), r('v(3)', { element: true })];
    const diff = diffSides(
      sideOf(A, { '': [r('v', { Value: '<1x20000 double>', Class: 'double' }, elements), r('w', { Value: '[1 2 3]', Class: 'double' }, elements)] }),
      sideOf(B, { '': [r('v', { Value: '<1x20000 double>', Class: 'double' }, elements), r('w', { Value: '[1 2 3]', Class: 'double' }, elements)] }),
    );
    const [v, w] = linesOf(diff, '');
    expect(v.partial).toBe(true);
    expect(w.partial).toBeUndefined();
  });

  it('keys each line the same way every time, plainly and once', () => {
    const a = sideOf(A, {
      design: [r('p', { Class: 'double' }), r('p', { Class: 'single' }), r('a b/c~d', {}, [r('f')])],
      blocks: [r('Gain', { _blockPath: 'Sub/Gain' })],
    });
    const b = sideOf(B, { design: [r('p', { Class: 'double' }), r('new')], blocks: [r('Gain', { _blockPath: 'Sub/Gain' })] });
    const keys = everyRow(diffSides(a, b)).map((row) => row.key);
    expect(everyRow(diffSides(a, b)).map((row) => row.key)).toEqual(keys);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9%~/._!*'()-]+$/);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('sums up the counts that are not 0', () => {
    expect(diffSummary({ changed: 3, added: 1, removed: 2, same: 9 })).toBe('3 changed, 1 added, 2 removed');
    expect(diffSummary({ changed: 0, added: 1, removed: 0, same: 0 })).toBe('1 added');
    expect(diffSummary({ changed: 0, added: 0, removed: 0, same: 4 })).toBe('No differences');
  });
});
