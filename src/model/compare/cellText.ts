// Copyright 2026 The MathWorks, Inc.
//
// The two readings a compare makes of a cell: the text a row shows in a column, and whether two
// such texts say the same.
//
// THE TABLE'S TEXT
//
// A compare marks a row changed where a cell's text differs, and the user then reads the two rows
// in two tables, so the text compared must be the text drawn: `<dex-tree-table>`'s _getCellText,
// which it also searches and sorts by. The model may not import a widget, so cellTextOf is a copy
// of that reading, and test/compareCellParity.test.ts holds the two together over every row and
// column of real files. A cell is a string or an object with its `text`; Data Type has three more
// shapes (a qualifier, links, a block's parameter links), and Description reads empty where the
// row's object has none, as the table draws it not applicable.
//
// THE SAME NUMBER
//
// A Value retyped from `1` to `1.0`, or a matrix written `[1,2;3,4]` where it was `[1 2; 3 4]`, is
// the same value to MATLAB, and a compare that marked it changed would bury the differences that
// matter among ones the user cannot see. So two texts that are both MATLAB numeric literals of one
// shape compare by their elements' values, within a tolerance. The grammar is narrow and fails
// closed: whatever is not plainly such a literal (`true`, `'1'`, `<1x3 double>`, `[1 2;]`) compares
// as text, which can only call two equal values different, never two different ones the same. A
// number a double cannot hold exactly (more than 15 significant digits: an int64's
// 9007199254740993 reads as ...992) compares by its text for the same reason.
import type { TreeTableRow } from '../rows/tableRow.js';

/** A cell's text: '' for no cell (null too, which `typeof` calls an object), an object's `text`, else the value. */
function textOf(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return String((value as { text?: unknown }).text ?? '');
  return String(value);
}

/** Whether a cell is in its object form, safe to read fields off: not null. */
const isObject = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object';

/** One of a block's parameter links (usageCells.ParamLink), as the Data Type cell lists them. */
interface ParamLinkText {
  property: string;
  paramName: string;
  source?: string;
}

/**
 * The text `row` shows in `column`, as `<dex-tree-table>` reads it to search and sort: Name its
 * label; a cell its string or its `text`; Data Type with its qualifier (`prefix`), its links' or its
 * parameter links' texts joined as the table joins them; Description '' where the object has none
 * (`_descriptionApplies: false`); anything else '' for no cell. (Usage's link groups are not read:
 * no compare reads that column.)
 */
export function cellTextOf(row: TreeTableRow, column: string): string {
  switch (column) {
    case 'Name':
      return row.Name?.label || '';
    case 'DataType': {
      const cell = row.DataType as unknown;
      if (isObject(cell) && 'paramLinks' in cell)
        return (cell.paramLinks as ParamLinkText[]).map((p) => `${p.property}=${p.paramName}${p.source ? `(${p.source})` : ''}`).join(', ');
      if (isObject(cell) && 'links' in cell) return (cell.links as { text: string }[]).map((l) => l.text).join(', ');
      // The qualifier is on screen (`Bus: Cmd`), so a type that moved from a bus to an enum of
      // the same name is a difference.
      if (isObject(cell) && typeof cell.prefix === 'string') return cell.prefix + textOf(cell);
      return textOf(cell);
    }
    case 'Description':
      return row._descriptionApplies === false ? '' : textOf(row.Description);
    default:
      return textOf(row[column]);
  }
}

/**
 * A numeric literal read: its shape, each element's real and imaginary parts in reading order, and
 * for each element its text where it has more than 15 significant digits (null where a double holds
 * it exactly), by which it is then compared.
 */
interface Numeric {
  rows: number;
  cols: number;
  re: number[];
  im: number[];
  digits: (string | null)[];
}

/** One element read: its parts, and its text where a double cannot hold it. */
interface Element {
  re: number;
  im: number;
  digits: string | null;
}

/** An unsigned real: digits with an optional fraction and exponent, Inf, or NaN. */
const UREAL = String.raw`(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|Inf|NaN)`;
/** A real, signed: Inf may carry a sign, NaN not (MATLAB writes no -NaN). */
const REAL = String.raw`(?:[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|Inf)|NaN)`;
/** A real alone. */
const REAL_ONLY = new RegExp(`^(${REAL})$`);
/** An imaginary alone: `2i`, `-3.5j`, `i`. */
const IMAG_ONLY = new RegExp(`^(${REAL})?([ij])$`);
/** A complex with no spaces around its operator (as an element of a matrix must be): `1+2i`, `1-i`. */
const COMPLEX = new RegExp(`^(${REAL})([+-])(${UREAL})?[ij]$`);
/** A complex scalar, which may space its operator as MATLAB shows one: `1 + 2i`. */
const COMPLEX_SPACED = new RegExp(`^(${REAL}) *([+-]) *(${UREAL})?[ij]$`);

/** A real literal's value. Number() reads `Inf` as NaN, so the words are read here. */
function realOf(text: string): number {
  if (text === 'NaN') return NaN;
  const body = text.replace(/^[+-]/, '');
  const negative = text.startsWith('-');
  if (body === 'Inf') return negative ? -Infinity : Infinity;
  return Number(text);
}

/**
 * How many significant digits a literal is written with: its mantissa's digits from the first
 * non-zero to the last, so `1.0` has one and `0.0012` two (trailing zeros add nothing a double
 * cannot hold). Inf and NaN have none.
 */
function significantDigits(text: string): number {
  const mantissa = text.replace(/^[+-]/, '').split(/[eE]/)[0];
  if (!/\d/.test(mantissa)) return 0;
  // Counted by index, not by /0+$/, which backtracks over a long run of zeros (quadratic).
  const digits = mantissa.replace('.', '');
  let start = 0;
  while (start < digits.length && digits[start] === '0') start++;
  let end = digits.length;
  while (end > start && digits[end - 1] === '0') end--;
  return end - start;
}

/** One element's text as an element, or null: a real, an imaginary, or (`spaced` for a scalar) a complex. */
function elementOf(text: string, spaced: boolean): Element | null {
  let reText: string;
  let imText: string;
  let m: RegExpExecArray | null;
  if ((m = REAL_ONLY.exec(text))) {
    reText = m[1];
    imText = '0';
  } else if ((m = IMAG_ONLY.exec(text))) {
    reText = '0';
    imText = m[1] ?? '1';
  } else if ((m = (spaced ? COMPLEX_SPACED : COMPLEX).exec(text))) {
    reText = m[1];
    imText = m[2] + (m[3] ?? '1');
  } else {
    return null;
  }
  const long = significantDigits(reText) > 15 || significantDigits(imText) > 15;
  return { re: realOf(reText), im: realOf(imText), digits: long ? text.replace(/ /g, '') : null };
}

/**
 * A text read as a MATLAB numeric literal, or null where it is not one: a scalar, `[]`, or rows
 * between brackets separated by `;`, each of elements separated by `,` or spaces, every row as long
 * as the first.
 */
function numericOf(text: string): Numeric | null {
  const t = text.trim();
  if (t === '') return null;
  if (!t.startsWith('[')) {
    const e = elementOf(t, true);
    return e && { rows: 1, cols: 1, re: [e.re], im: [e.im], digits: [e.digits] };
  }
  if (!t.endsWith(']')) return null;
  const inner = t.slice(1, -1).trim();
  if (inner === '') return { rows: 0, cols: 0, re: [], im: [], digits: [] };
  const out: Numeric = { rows: 0, cols: 0, re: [], im: [], digits: [] };
  for (const rowText of inner.split(';')) {
    // A comma with spaces around it is one separator, and so is a run of spaces; an empty element
    // (`[1,,2]`, `[1 2;]`) is no literal.
    const elements = rowText.trim().split(/ *, *| +/);
    if (out.rows === 0) out.cols = elements.length;
    else if (elements.length !== out.cols) return null;
    for (const elText of elements) {
      const e = elText === '' ? null : elementOf(elText, false);
      if (!e) return null;
      out.re.push(e.re);
      out.im.push(e.im);
      out.digits.push(e.digits);
    }
    out.rows++;
  }
  return out;
}

/** Two parts alike: NaN as NaN, an infinity only as itself, two finite numbers within `tolerance`. */
function samePart(a: number, b: number, tolerance: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return a === b;
  return a === b || Math.abs(a - b) <= tolerance;
}

/**
 * Whether two cells' texts say the same: the same text, or both MATLAB numeric literals of one
 * shape (a scalar, `[1 2; 3 4]`, `[1, 2, 3]`, `[]`, `Inf`, `NaN`, `1+2i`) whose elements differ by
 * at most `tolerance` (default 0: equal as doubles, so `1` and `1.0` are the same). NaN is NaN;
 * Inf is only Inf of its sign; an element written with more than 15 significant digits is compared
 * by its text (a double would round an int64). Anything that is not such a literal compares as text.
 */
export function sameCellText(a: string, b: string, tolerance = 0): boolean {
  if (a === b) return true;
  const x = numericOf(a);
  const y = numericOf(b);
  if (!x || !y || x.rows !== y.rows || x.cols !== y.cols) return false;
  for (let k = 0; k < x.re.length; k++) {
    if (x.digits[k] !== null || y.digits[k] !== null) {
      if (x.digits[k] !== y.digits[k]) return false;
      continue;
    }
    if (!samePart(x.re[k], y.re[k], tolerance) || !samePart(x.im[k], y.im[k], tolerance)) return false;
  }
  return true;
}
