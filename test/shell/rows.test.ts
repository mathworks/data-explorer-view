// Copyright 2026 The MathWorks, Inc.
//
// A table's rows by id (connect/rows.ts): what the location bar's path and the Explorer's marked
// section climb a selected row's parents through. The rows are the table's own array, which the
// table replaces whole on every change (a paint, one entry's repaint, a row's children answered),
// so the array is the cache's key: each is indexed once, a row gone from the next one is gone, and
// a child the table merged in later is found as soon as it is there.
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { graphNameOf, rowIn, sectionOf } from '../../src/widgets/app-shell/connect/rows.js';

const row = (ID: string, parent: string | null, label = ID): TreeTableRow => ({ ID, parent, Name: { label } }) as TreeTableRow;
const PAINT: readonly TreeTableRow[] = [
  row('section:design', null, 'Design Data'),
  row('e:Bus', 'section:design', 'Bus'),
  row('section:config', null, 'Configurations'),
];

describe('rowIn', () => {
  it('finds a row of the array by its id, and nothing for an id it does not hold', () => {
    expect(rowIn(PAINT, 'e:Bus')?.Name.label).toBe('Bus');
    expect(rowIn(PAINT, 'nope')).toBeUndefined();
    expect(rowIn([], 'e:Bus')).toBeUndefined();
  });

  it('answers from the array it is given: a child merged in later is found, an entry removed is not', () => {
    // A lazy row's children, answered and merged in: a new array.
    const opened = [...PAINT, row('e:Bus/a', 'e:Bus', 'a')];
    expect(rowIn(PAINT, 'e:Bus/a')).toBeUndefined();
    expect(rowIn(opened, 'e:Bus/a')?.parent).toBe('e:Bus');
    // The entry deleted: the next array has neither it nor its child.
    const deleted = opened.filter((r) => r.ID !== 'e:Bus' && r.parent !== 'e:Bus');
    expect(rowIn(deleted, 'e:Bus')).toBeUndefined();
    expect(rowIn(deleted, 'e:Bus/a')).toBeUndefined();
    // And the arrays already asked still answer as they were.
    expect(rowIn(opened, 'e:Bus')?.Name.label).toBe('Bus');
  });

  it('keeps the first row of an id an array holds twice, as a find would', () => {
    const twice = [row('x', null, 'first'), row('x', null, 'second')];
    expect(rowIn(twice, 'x')?.Name.label).toBe('first');
  });
});

describe('sectionOf', () => {
  it("is the top-level section a row is in, the section's own row included", () => {
    const opened = [...PAINT, row('e:Bus/a', 'e:Bus', 'a')];
    expect(sectionOf(opened, 'e:Bus/a')).toBe('section:design');
    expect(sectionOf(opened, 'e:Bus')).toBe('section:design');
    expect(sectionOf(opened, 'section:config')).toBe('section:config');
  });

  it('is none for a row under no section (a MAT-file variable), an unknown row, or a broken chain', () => {
    const mat = [row('v:ParamMat', null), row('v:ParamMat/Value', 'v:ParamMat')];
    expect(sectionOf(mat, 'v:ParamMat/Value')).toBeUndefined();
    expect(sectionOf(PAINT, 'gone')).toBeUndefined();
    expect(sectionOf([row('orphan', 'missing')], 'orphan')).toBeUndefined();
    expect(sectionOf([row('a', 'b'), row('b', 'a')], 'a')).toBeUndefined();
  });
});

describe('graphNameOf', () => {
  it("is a block's key, and else the name of the entry a row is in, as the graph reveals it", () => {
    const opened = [...PAINT, row('e:Bus/a', 'e:Bus', 'a'), row('e:Bus/a/b', 'e:Bus/a', 'b')];
    expect(graphNameOf(opened, 'e:Bus')).toBe('Bus');
    expect(graphNameOf(opened, 'e:Bus/a/b')).toBe('Bus');
    const mat = [row('v:ParamMat', null, 'ParamMat'), row('v:ParamMat/Value', 'v:ParamMat', 'Value')];
    expect(graphNameOf(mat, 'v:ParamMat/Value')).toBe('ParamMat');
    const block = { ...row('b:Gain', 'b:Sub', 'Gain'), _blockKey: '7' } as TreeTableRow;
    expect(graphNameOf([row('b:Sub', null, 'Sub'), block], 'b:Gain')).toBe('7');
  });

  it("is none for a section's row, an unknown row, or a broken chain", () => {
    expect(graphNameOf(PAINT, 'section:design')).toBeUndefined();
    expect(graphNameOf(PAINT, 'gone')).toBeUndefined();
    expect(graphNameOf([row('a', 'b'), row('b', 'a')], 'a')).toBeUndefined();
  });
});
