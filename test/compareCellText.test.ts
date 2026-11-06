// Copyright 2026 The MathWorks, Inc.
//
// A compare's two readings of a cell (compare/cellText.ts): the text a row shows in a column, as
// the table reads it to search and sort, and whether two such texts say the same.
//
// The first must be the table's own reading (test/compareCellParity.test.ts holds the two together
// over real fixtures); here, each cell shape the table draws, one by one. The second is what makes
// a compare worth reading: a Value retyped from `1` to `1.0`, or a matrix written with commas
// instead of spaces, is the same number, and a compare that marked it changed would bury the real
// differences among ones the user cannot see. It fails closed: a text that is not plainly a
// MATLAB numeric literal compares as text, and so does a number a double cannot hold exactly.
import { describe, expect, it } from 'vitest';
import { cellTextOf, sameCellText } from '../src/model/compare/cellText.js';
import type { TreeTableRow } from '../src/model/rows/tableRow.js';

/** A row with these cells. */
const rowWith = (cells: Record<string, unknown>): TreeTableRow =>
  ({ ID: 'r', parent: null, Name: { label: 'x' }, Value: '', DataType: '', Description: '', Status: '', ...cells }) as TreeTableRow;

describe('cellTextOf', () => {
  it('reads a plain string as it is', () => {
    expect(cellTextOf(rowWith({ Value: '1' }), 'Value')).toBe('1');
  });

  it("reads a cell object's text", () => {
    expect(cellTextOf(rowWith({ Value: { text: 'x', editable: true } }), 'Value')).toBe('x');
  });

  it("reads a Data Type with its qualifier, as it is on screen", () => {
    expect(cellTextOf(rowWith({ DataType: { prefix: 'Bus: ', text: 'Cmd' } }), 'DataType')).toBe('Bus: Cmd');
  });

  it("reads a Data Type's links joined as the table joins them", () => {
    expect(cellTextOf(rowWith({ DataType: { links: [{ text: 'a' }, { text: 'b' }] } }), 'DataType')).toBe('a, b');
  });

  it("reads a block's parameter links as property=name(source)", () => {
    const row = rowWith({ DataType: { paramLinks: [{ property: 'Gain', paramName: 'k', source: 'params.sldd' }] } });
    expect(cellTextOf(row, 'DataType')).toBe('Gain=k(params.sldd)');
  });

  it('reads no Description where the object has none', () => {
    expect(cellTextOf(rowWith({ Description: 'd', _descriptionApplies: false }), 'Description')).toBe('');
    expect(cellTextOf(rowWith({ Description: 'd' }), 'Description')).toBe('d');
  });

  it('reads no cell, a null one and a shapeless one as empty', () => {
    expect(cellTextOf(rowWith({ Min: null }), 'Min')).toBe('');
    expect(cellTextOf(rowWith({}), 'Min')).toBe('');
    expect(cellTextOf(rowWith({ Min: {} }), 'Min')).toBe('');
  });

  it('reads the Name as its label', () => {
    expect(cellTextOf(rowWith({ Name: { label: 'Kp', iconId: 'x' } }), 'Name')).toBe('Kp');
  });

  it("reads another column's editable cell by its text", () => {
    expect(cellTextOf(rowWith({ Min: { text: '0', editable: true, editor: 'text' } }), 'Min')).toBe('0');
  });
});

describe('sameCellText', () => {
  const same: [string, string, number?][] = [
    ['1', '1'],
    ['1', '1.0'],
    ['1e3', '1000'],
    ['[1 2; 3 4]', '[1,2;3,4]'],
    ['[1 2 3]', '[1, 2, 3]'],
    ['[]', '[ ]'],
    ['Inf', 'Inf'],
    ['NaN', 'NaN'],
    ['1+2i', '1 + 2i'],
    ['[1+2i 3]', '[1+2i, 3]'],
    ['', ''],
    ['0.1', '0.1000001', 1e-6],
    ['[1 2]', '[1 2.0000001]', 1e-6],
  ];
  it.each(same)('%j and %j say the same (tolerance %s)', (a, b, tolerance) => {
    expect(sameCellText(a, b, tolerance)).toBe(true);
    expect(sameCellText(b, a, tolerance)).toBe(true);
  });

  const differ: [string, string, number?][] = [
    ['[1 2 3]', '[1 2]'],
    ['[1 2; 3 4]', '[1 2 3 4]'],
    ['-Inf', 'Inf'],
    ["'1'", "'1.0'"],
    ['true', '1'],
    ['9007199254740993', '9007199254740992'],
    ['', '0'],
    ['0.1', '0.1000001'],
    ['0.1', '0.2', 1e-6],
    ['<1x3 double>', '<1x3 double >'],
  ];
  it.each(differ)('%j and %j differ (tolerance %s)', (a, b, tolerance) => {
    expect(sameCellText(a, b, tolerance)).toBe(false);
    expect(sameCellText(b, a, tolerance)).toBe(false);
  });
});
