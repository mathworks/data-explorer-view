// Copyright 2026 The MathWorks, Inc.
//
// What the Properties view says of a compare's selected line (comparePage): for a changed row each
// difference as before → after, for a row only one side has its cells there, for a row alike its
// cells, and for a section heading its entries counted.
//
// The compare's tables show one row's cells each; this page is where the user reads a change
// whole, a property no column shows among them (a configuration set's solver), and where a long
// value fits. An empty side reads "(empty)", so a cleared Description does not look like nothing
// happened, and an array compared only as far as its element rows go says so.
import { describe, expect, it } from 'vitest';
import { comparePage } from '../src/model/compare/comparePage.js';
import { compareRows } from '../src/model/compare/compareRows.js';
import { diffSides } from '../src/model/compare/diff.js';
import type { PropertyGroup } from '../src/model/inspector/piBuilder.js';
import { r, sideOf } from './compare/made.js';

const NAMES = { left: 'a.sldd', right: 'b.sldd' };
const page = (groups: PropertyGroup[]): PropertyGroup[] => groups;
const prop = (name: string, value: string) => ({ name, value, editable: false, type: 'text' });

/** The compare of the two made-up sides, laid out with every line, and its column headings. */
function layout() {
  const pages = (stop: string) => ({ Fast: [{ title: 'Solver', properties: [{ name: 'StopTime', value: stop }] }] });
  const a = sideOf(
    'file:///a/a.sldd',
    {
      design: [r('Kp', { Value: '1', Description: 'gain' }), r('Uo', { Value: '2', Class: 'double' }), r('Ki', { Value: '3', Class: 'double' }), r('big', { Value: '<1x20000 double>', Class: 'double' })],
      config: [r('Fast', { Class: 'Simulink.ConfigSet' })],
    },
    pages('10'),
    { design: 'Design Data' },
  );
  const b = sideOf(
    'file:///b/b.sldd',
    {
      design: [r('Kp', { Value: '5' }), r('Ki', { Value: '3', Class: 'double' }), r('Param', { Class: 'Simulink.Parameter' }), r('big', { Value: '<1x20000 double>', Class: 'double' })],
      config: [r('Fast', { Class: 'Simulink.ConfigSet' })],
    },
    pages('20'),
    { design: 'Design Data' },
  );
  const diff = diffSides(a, b, { properties: true });
  return { diff, rows: compareRows(diff, { onlyDifferences: false }) };
}

const lineOf = (rows: ReturnType<typeof compareRows>, label: string) => rows.lines.find((line) => line.row?.path.at(-1) === label)!;

describe('comparePage', () => {
  it("counts a section heading's entries", () => {
    const { diff, rows } = layout();
    expect(comparePage(rows.byId.get('section:design'), NAMES, diff.columnLabels)).toEqual({
      rowId: 'section:design',
      groups: page([{ title: 'Design Data', properties: [prop('Entries', '1 changed, 1 added, 1 removed')] }]),
    });
  });

  it('lists a changed row\'s differences, before → after, an empty side as "(empty)"', () => {
    const { diff, rows } = layout();
    const kp = lineOf(rows, 'Kp');
    expect(comparePage(kp, NAMES, diff.columnLabels)).toEqual({
      rowId: kp.id,
      groups: [{ title: 'Differences: a.sldd → b.sldd', properties: [prop('Value', '1 → 5'), prop('Description', 'gain → (empty)')] }],
    });
  });

  it("names an inspector property by its group", () => {
    const { diff, rows } = layout();
    const fast = lineOf(rows, 'Fast');
    expect(comparePage(fast, NAMES, diff.columnLabels).groups).toEqual([
      { title: 'Differences: a.sldd → b.sldd', properties: [prop('Solver › StopTime', '10 → 20')] },
    ]);
  });

  it("shows an added row's cells from b, and a removed row's from a", () => {
    const { diff, rows } = layout();
    expect(comparePage(lineOf(rows, 'Param'), NAMES, diff.columnLabels).groups).toEqual([{ title: 'Only in b.sldd', properties: [prop('Class', 'Simulink.Parameter')] }]);
    expect(comparePage(lineOf(rows, 'Uo'), NAMES, diff.columnLabels).groups).toEqual([{ title: 'Only in a.sldd', properties: [prop('Value', '2'), prop('Class', 'double')] }]);
  });

  it("shows a row alike on both sides by its cells, and says when an array was compared only in part", () => {
    const { diff, rows } = layout();
    expect(comparePage(lineOf(rows, 'Ki'), NAMES, diff.columnLabels).groups).toEqual([{ title: 'No differences', properties: [prop('Value', '3'), prop('Class', 'double')] }]);
    const big = lineOf(rows, 'big');
    expect(big.row!.partial).toBe(true);
    expect(comparePage(big, NAMES, diff.columnLabels).groups).toEqual([
      { title: 'No differences', properties: [prop('Value', '<1x20000 double>'), prop('Class', 'double'), prop('Note', 'Only the elements the table lists were compared.')] },
    ]);
  });

  it('says that a changed array was compared only in part', () => {
    const elements = (v: string) => [r('v(1)', { element: true, Value: v })];
    const diff = diffSides(
      sideOf('file:///a/a.mat', { '': [r('v', { Value: '<1x20000 double>', Class: 'double' }, elements('1'))] }),
      sideOf('file:///b/b.mat', { '': [r('v', { Value: '<1x20000 double>', Class: 'single' }, elements('1'))] }),
    );
    const line = compareRows(diff).lines[0];
    expect(comparePage(line, NAMES, diff.columnLabels).groups).toEqual([
      { title: 'Differences: a.sldd → b.sldd', properties: [prop('Class', 'double → single'), prop('Note', 'Only the elements the table lists were compared.')] },
    ]);
  });

  it('shows nothing for no line', () => {
    expect(comparePage(undefined, NAMES, {})).toEqual({ groups: [] });
  });
});
