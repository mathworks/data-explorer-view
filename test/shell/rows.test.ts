// Copyright 2026 The MathWorks, Inc.
//
// A table's rows by id (connect/rows.ts): what the location bar's path and the Explorer's marked
// section climb a selected row's parents through. The rows are the table's own array, which the
// table replaces whole on every change (a paint, one entry's repaint, a row's children answered),
// so the array is the cache's key: each is indexed once, a row gone from the next one is gone, and
// a child the table merged in later is found as soon as it is there. And the entry a link from
// outside the shell names (ShellHandle.openAt, a link copied from a row): which row an entry's
// name, and its section's label, select; and what name and label a row's entry is linked by.
import { describe, expect, it } from 'vitest';
import type { TreeTableRow } from '../../src/model/rows/tableRow.js';
import { entryOf, graphNameOf, rowIn, rowOfEntry, sectionOf } from '../../src/widgets/app-shell/connect/rows.js';

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

// A dictionary's sections, an entry with a field, a name two sections hold, and a block by its key;
// and a MAT-file's variable, under no section.
const LINKED: readonly TreeTableRow[] = [
  row('section:design', null, 'Design Data'),
  row('e:Kp', 'section:design', 'Kp'),
  row('e:Bus', 'section:design', 'Bus'),
  row('e:Bus/Speed', 'e:Bus', 'Speed'),
  row('section:other', null, 'Other Data'),
  row('o:Kp', 'section:other', 'Kp'),
  row('section:blocks', null, 'Model Elements'),
  { ...row('b:65', 'section:blocks', 'Gain'), _blockKey: '65' } as TreeTableRow,
];
const MAT: readonly TreeTableRow[] = [row('m:P', null, 'ParamMat'), row('m:P/x', 'm:P', 'x')];
const idOf = (found: TreeTableRow | undefined) => found?.ID;

describe('rowOfEntry', () => {
  it('is the entry of that name, the first section\'s where two sections hold one', () => {
    expect(idOf(rowOfEntry(LINKED, 'Kp'))).toBe('e:Kp');
  });

  it('is the entry of that name in the section of that label, given one', () => {
    expect(idOf(rowOfEntry(LINKED, 'Kp', 'Other Data'))).toBe('o:Kp');
  });

  it('is a nested row of that name where no entry has it, as a link selects one', () => {
    expect(idOf(rowOfEntry(LINKED, 'Speed'))).toBe('e:Bus/Speed');
  });

  it('is only an entry, given a section: a nested row of that name is none', () => {
    expect(rowOfEntry(LINKED, 'Speed', 'Design Data')).toBeUndefined();
  });

  it("is never a section's own row, which is no entry", () => {
    expect(rowOfEntry(LINKED, 'Design Data')).toBeUndefined();
  });

  it('is a block by its key, which no cell prints', () => {
    expect(idOf(rowOfEntry(LINKED, '65'))).toBe('b:65');
  });

  it('is none for a section the table has none of, or for no name', () => {
    expect(rowOfEntry(LINKED, 'Kp', 'Nope')).toBeUndefined();
    expect(rowOfEntry(LINKED, '')).toBeUndefined();
  });

  it("is a MAT-file's variable by its name, and none in a section, which a MAT-file has none of", () => {
    expect(idOf(rowOfEntry(MAT, 'ParamMat'))).toBe('m:P');
    expect(rowOfEntry(MAT, 'ParamMat', 'Design Data')).toBeUndefined();
  });
});

describe('entryOf', () => {
  it("is the entry a nested row is in, and its section's label", () => {
    expect(entryOf(LINKED, 'e:Bus/Speed')).toEqual({ entry: 'Bus', section: 'Design Data' });
  });

  it("is an entry itself, and its section's label", () => {
    expect(entryOf(LINKED, 'e:Kp')).toEqual({ entry: 'Kp', section: 'Design Data' });
  });

  it("is none for a section's own row", () => {
    expect(entryOf(LINKED, 'section:design')).toBeUndefined();
  });

  it("is a MAT-file's variable with no section at all", () => {
    const found = entryOf(MAT, 'm:P/x');
    expect(found).toEqual({ entry: 'ParamMat' });
    expect(found).not.toHaveProperty('section');
  });

  it('is none for a row the table does not hold', () => {
    expect(entryOf(LINKED, 'nope')).toBeUndefined();
  });

  it('is none for a parent chain that loops', () => {
    expect(entryOf([row('a', 'b'), row('b', 'a')], 'a')).toBeUndefined();
  });
});
