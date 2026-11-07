// Copyright 2026 The MathWorks, Inc.
//
// A compare's two readings of a cell (compare/cellText.ts): the text a row shows in a column, as
// the table reads it to search and sort, and whether two such texts say the same.
//
// The first must be the table's own reading (test/compareCellParity.test.ts holds the two together
// over real fixtures and over these same shapes); here, each cell shape the table draws, one by one
// (compare/cellShapes.ts). The second is what makes
// a compare worth reading: a Value retyped from `1` to `1.0`, or a matrix written with commas
// instead of spaces, is the same number, and a compare that marked it changed would bury the real
// differences among ones the user cannot see. It fails closed: a text that is not plainly a
// MATLAB numeric literal compares as text, and so does a number a double cannot hold exactly.
import { describe, expect, it } from 'vitest';
import { cellTextOf, sameCellText } from '../src/model/compare/cellText.js';
import { CELL_SHAPES, rowWith } from './compare/cellShapes.js';

describe('cellTextOf', () => {
  it.each(CELL_SHAPES)('reads $what', ({ cells, column, text }) => {
    expect(cellTextOf(rowWith(cells), column)).toBe(text);
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
    // Trailing zeros are no significant digits: a double holds this one exactly.
    ['1.0000000000000000', '1'],
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
    // The imaginary part takes its sign from the operator alone: this is no literal, so it is text.
    ['1+-2i', '1-2i'],
  ];
  it.each(differ)('%j and %j differ (tolerance %s)', (a, b, tolerance) => {
    expect(sameCellText(a, b, tolerance)).toBe(false);
    expect(sameCellText(b, a, tolerance)).toBe(false);
  });
});
