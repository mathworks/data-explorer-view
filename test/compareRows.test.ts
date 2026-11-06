// Copyright 2026 The MathWorks, Inc.
//
// A compare laid out line by line (compareRows): the rows each of the compare's two tables is
// given, and the marks on them.
//
// The two tables of a compare tab keep their lines side by side: the same row ids in the same
// order on both, so that a row's expansion, selection and scroll can follow from one table to the
// other by id. Where one side has no row for a line, its table is given a blank one (a gap), so
// the lines below still meet. This holds that the two lists agree line for line, that each line
// carries the mark its side draws (added, removed, changed with the columns that differ, or a
// gap), that "Show only differences" leaves out exactly the lines with nothing to show, and that
// a copied row follows no link and asks for nothing more (no held-back children, no matrix): the
// compare's tables only show.
import { describe, expect, it } from 'vitest';
import { compareRows } from '../src/model/compare/compareRows.js';
import { diffSides } from '../src/model/compare/diff.js';
import { r, sideOf } from './compare/made.js';

const A = 'file:///a/x.sldd';
const B = 'file:///b/x.sldd';

/** The sides every case but the struct's and the MAT-file's compares. */
const sides = () =>
  [
    sideOf(A, { design: [r('Kp', { Value: '1' }), r('Uo', { Value: '2' }), r('Ki', { Value: '3' })], arch: [], other: [] }),
    sideOf(B, { design: [r('Kp', { Value: '5', Description: 'gain' }), r('Ki', { Value: '3' }), r('Param', { Class: 'Simulink.Parameter' })], arch: [], other: [] }),
  ] as const;

/** The line of the row named `label`. */
const idOf = (layout: ReturnType<typeof compareRows>, label: string): string =>
  layout.lines.find((line) => line.row && line.row.path[line.row.path.length - 1] === label)!.id;

describe('compareRows', () => {
  it('gives both tables the same rows in the same order, a gap where a side has none', () => {
    const layout = compareRows(diffSides(...sides()), { onlyDifferences: false });
    const ids = layout.lines.map((line) => line.id);
    expect(layout.left.rows.map((row) => row.ID)).toEqual(ids);
    expect(layout.right.rows.map((row) => row.ID)).toEqual(ids);
    expect(layout.lines.filter((line) => line.row).map((line) => line.row!.path[0])).toEqual(['Kp', 'Uo', 'Ki', 'Param']);
    expect(ids.filter((id) => id.startsWith('section:'))).toEqual(['section:design', 'section:arch', 'section:other']);

    const uo = idOf(layout, 'Uo');
    const at = (rows: typeof layout.left.rows, id: string) => rows.find((row) => row.ID === id)!;
    expect(at(layout.left.rows, uo).Value).toBe('2');
    expect(at(layout.right.rows, uo).Name.label).toBe('');
    expect(layout.left.marks.get(uo)).toEqual({ kind: 'removed' });
    expect(layout.right.marks.get(uo)).toEqual({ kind: 'gap' });

    const param = idOf(layout, 'Param');
    expect(at(layout.left.rows, param).Name.label).toBe('');
    expect(at(layout.right.rows, param).Name.label).toBe('Param');
    expect(layout.left.marks.get(param)).toEqual({ kind: 'gap' });
    expect(layout.right.marks.get(param)).toEqual({ kind: 'added' });

    const kp = idOf(layout, 'Kp');
    expect(layout.left.marks.get(kp)).toEqual({ kind: 'changed', columns: ['Value', 'Description'] });
    expect(layout.right.marks.get(kp)).toEqual({ kind: 'changed', columns: ['Value', 'Description'] });
    expect(layout.left.marks.has(idOf(layout, 'Ki'))).toBe(false);
    expect(layout.lines.find((line) => line.id === kp)).toMatchObject({ parent: 'section:design', section: 'design', entry: kp, differs: true, differsBelow: false });
    expect(layout.byId.get(kp)).toBe(layout.lines.find((line) => line.id === kp));
  });

  it('leaves out what has no difference in or under it, unless asked to draw everything', () => {
    const only = compareRows(diffSides(...sides()));
    expect(only.lines.map((line) => line.id)).toEqual(['section:design', ...['Kp', 'Uo', 'Param'].map((label) => idOf(only, label))]);
    const all = compareRows(diffSides(...sides()), { onlyDifferences: false });
    expect(all.lines).toHaveLength(7);

    // A struct alike in itself, with a field that changed, stays for its field.
    const struct = compareRows(
      diffSides(
        sideOf(A, { design: [r('cfg', { Value: '<1x1 struct>' }, [r('mode', { Value: 'fast' }), r('gain', { Value: '2' })])] }),
        sideOf(B, { design: [r('cfg', { Value: '<1x1 struct>' }, [r('gain', { Value: '3' }), r('mode', { Value: 'fast' }), r('extra', { Value: '1' })])] }),
      ),
    );
    const cfg = idOf(struct, 'cfg');
    expect(struct.lines.map((line) => line.row?.path.join('.') ?? line.id)).toEqual(['section:design', 'cfg', 'cfg.extra', 'cfg.gain']);
    expect(struct.byId.get(cfg)).toMatchObject({ differs: false, differsBelow: true });
    expect(struct.left.marks.has(cfg)).toBe(false);
    expect(struct.opened).toEqual(['section:design', cfg]);
    // A field's line names its entry's.
    expect(struct.byId.get(idOf(struct, 'gain'))).toMatchObject({ parent: cfg, entry: cfg });
  });

  it('steps through the lines that differ, and opens the lines they are under', () => {
    const layout = compareRows(diffSides(...sides()));
    expect(layout.changes).toEqual(['Kp', 'Uo', 'Param'].map((label) => idOf(layout, label)));
    expect(layout.opened).toEqual(['section:design']);
  });

  it('copies a row to follow no link and ask for nothing more, and blanks a gap', () => {
    const [a, b] = sides();
    const kp = (side: typeof a) => side.rows.find((row) => row.Name.label === 'Kp')!;
    for (const side of [a, b]) {
      Object.assign(kp(side), {
        _lazy: true,
        _matrix: { name: 'Kp', className: 'double', dims: [1, 1], nodeId: 'n' },
        _hasEditText: true,
        UsedBy: 'model',
        Value: { text: kp(side).Value as string, linkTarget: 'file:///a/x.sldd#Kp', editable: true },
        DataType: { paramLinks: [{ property: 'Gain', paramName: 'k', source: 'p.sldd', linkTarget: 'file:///p.sldd#k' }] },
      });
    }
    // A list of links, which the table draws as anchors whatever their targets.
    Object.assign(a.rows.find((row) => row.Name.label === 'Uo')!, { DataType: { links: [{ text: 'T1', linkTarget: 'x#T1' }, { text: 'T2', linkTarget: 'x#T2' }] } });
    const layout = compareRows(diffSides(a, b));
    const id = idOf(layout, 'Kp');
    const copy = layout.left.rows.find((row) => row.ID === id)!;
    expect(copy.parent).toBe('section:design');
    for (const key of ['_lazy', '_matrix', '_hasEditText', 'UsedBy']) expect(copy).not.toHaveProperty(key);
    expect(copy.Value).toEqual({ text: '1', editable: true });
    expect(copy.DataType).toEqual({ paramLinks: [{ property: 'Gain', paramName: 'k', source: 'p.sldd', linkTarget: '' }] });
    // The side's own row is left as it was.
    expect(kp(a)._lazy).toBe(true);

    expect(layout.left.rows.find((row) => row.ID === idOf(layout, 'Uo'))!.DataType).toEqual({ text: 'T1, T2' });

    const gap = layout.right.rows.find((row) => row.ID === idOf(layout, 'Uo'))!;
    expect(gap).toEqual({ ID: idOf(layout, 'Uo'), parent: 'section:design', Name: { label: '' }, Value: '', DataType: '', Description: '', Status: '' });
  });

  it("draws a MAT-file's variables with no heading line", () => {
    const layout = compareRows(diffSides(sideOf('file:///a/x.mat', { '': [r('x'), r('y')] }), sideOf('file:///b/x.mat', { '': [r('y')] })), { onlyDifferences: false });
    expect(layout.lines.some((line) => line.id.startsWith('section:'))).toBe(false);
    expect(layout.lines.map((line) => line.parent)).toEqual([null, null]);
    expect(layout.lines.map((line) => line.section)).toEqual(['', '']);
    expect(layout.changes).toEqual([idOf(layout, 'x')]);
  });
});
