/** A cell's text: '' for no cell (null too, which `typeof` calls an object), an object's `text`, else the value. */
function textOf(value) {
    if (value === null || value === undefined)
        return '';
    if (typeof value === 'object')
        return String(value.text ?? '');
    return String(value);
}
/** Whether a cell is in its object form, safe to read fields off: not null. */
const isObject = (value) => value !== null && typeof value === 'object';
/**
 * The text `row` shows in `column`, as `<dex-tree-table>` reads it to search and sort: Name its
 * label; a cell its string or its `text`; Data Type with its qualifier (`prefix`), its links' or its
 * parameter links' texts joined as the table joins them; Description '' where the object has none
 * (`_descriptionApplies: false`); anything else '' for no cell. (Usage's link groups are not read:
 * no compare reads that column.)
 */
export function cellTextOf(row, column) {
    switch (column) {
        case 'Name':
            return row.Name?.label || '';
        case 'DataType': {
            const cell = row.DataType;
            if (isObject(cell) && 'paramLinks' in cell)
                return cell.paramLinks.map((p) => `${p.property}=${p.paramName}${p.source ? `(${p.source})` : ''}`).join(', ');
            if (isObject(cell) && 'links' in cell)
                return cell.links.map((l) => l.text).join(', ');
            // The qualifier is on screen (`Bus: Cmd`), so a type that moved from a bus to an enum of
            // the same name is a difference.
            if (isObject(cell) && typeof cell.prefix === 'string')
                return cell.prefix + textOf(cell);
            return textOf(cell);
        }
        case 'Description':
            return row._descriptionApplies === false ? '' : textOf(row.Description);
        default:
            return textOf(row[column]);
    }
}
/** An unsigned real: digits with an optional fraction and exponent, Inf, or NaN. */
const UREAL = String.raw `(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|Inf|NaN)`;
/** A real, signed: Inf may carry a sign, NaN not (MATLAB writes no -NaN). */
const REAL = String.raw `(?:[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|Inf)|NaN)`;
/** A real alone. */
const REAL_ONLY = new RegExp(`^(${REAL})$`);
/** An imaginary alone: `2i`, `-3.5j`, `i`. */
const IMAG_ONLY = new RegExp(`^(${REAL})?([ij])$`);
/** A complex with no spaces around its operator (as an element of a matrix must be): `1+2i`, `1-i`. */
const COMPLEX = new RegExp(`^(${REAL})([+-])(${UREAL})?[ij]$`);
/** A complex scalar, which may space its operator as MATLAB shows one: `1 + 2i`. */
const COMPLEX_SPACED = new RegExp(`^(${REAL}) *([+-]) *(${UREAL})?[ij]$`);
/** A real literal's value. Number() reads `Inf` as NaN, so the words are read here. */
function realOf(text) {
    if (text === 'NaN')
        return NaN;
    const body = text.replace(/^[+-]/, '');
    const negative = text.startsWith('-');
    if (body === 'Inf')
        return negative ? -Infinity : Infinity;
    return Number(text);
}
/**
 * How many significant digits a literal is written with: its mantissa's digits from the first
 * non-zero to the last, so `1.0` has one and `0.0012` two (trailing zeros add nothing a double
 * cannot hold). Inf and NaN have none.
 */
function significantDigits(text) {
    const mantissa = text.replace(/^[+-]/, '').split(/[eE]/)[0];
    if (!/\d/.test(mantissa))
        return 0;
    return mantissa.replace('.', '').replace(/^0+/, '').replace(/0+$/, '').length;
}
/** One element's text as an element, or null: a real, an imaginary, or (`spaced` for a scalar) a complex. */
function elementOf(text, spaced) {
    let reText;
    let imText;
    let m;
    if ((m = REAL_ONLY.exec(text))) {
        reText = m[1];
        imText = '0';
    }
    else if ((m = IMAG_ONLY.exec(text))) {
        reText = '0';
        imText = m[1] ?? '1';
    }
    else if ((m = (spaced ? COMPLEX_SPACED : COMPLEX).exec(text))) {
        reText = m[1];
        imText = m[2] + (m[3] ?? '1');
    }
    else {
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
function numericOf(text) {
    const t = text.trim();
    if (t === '')
        return null;
    if (!t.startsWith('[')) {
        const e = elementOf(t, true);
        return e && { rows: 1, cols: 1, re: [e.re], im: [e.im], digits: [e.digits] };
    }
    if (!t.endsWith(']'))
        return null;
    const inner = t.slice(1, -1).trim();
    if (inner === '')
        return { rows: 0, cols: 0, re: [], im: [], digits: [] };
    const out = { rows: 0, cols: 0, re: [], im: [], digits: [] };
    for (const rowText of inner.split(';')) {
        // A comma with spaces around it is one separator, and so is a run of spaces; an empty element
        // (`[1,,2]`, `[1 2;]`) is no literal.
        const elements = rowText.trim().split(/ *, *| +/);
        if (out.rows === 0)
            out.cols = elements.length;
        else if (elements.length !== out.cols)
            return null;
        for (const elText of elements) {
            const e = elText === '' ? null : elementOf(elText, false);
            if (!e)
                return null;
            out.re.push(e.re);
            out.im.push(e.im);
            out.digits.push(e.digits);
        }
        out.rows++;
    }
    return out;
}
/** Two parts alike: NaN as NaN, an infinity only as itself, two finite numbers within `tolerance`. */
function samePart(a, b, tolerance) {
    if (Number.isNaN(a) || Number.isNaN(b))
        return Number.isNaN(a) && Number.isNaN(b);
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return a === b;
    return a === b || Math.abs(a - b) <= tolerance;
}
/**
 * Whether two cells' texts say the same: the same text, or both MATLAB numeric literals of one
 * shape (a scalar, `[1 2; 3 4]`, `[1, 2, 3]`, `[]`, `Inf`, `NaN`, `1+2i`) whose elements differ by
 * at most `tolerance` (default 0: equal as doubles, so `1` and `1.0` are the same). NaN is NaN;
 * Inf is only Inf of its sign; an element written with more than 15 significant digits is compared
 * by its text (a double would round an int64). Anything that is not such a literal compares as text.
 */
export function sameCellText(a, b, tolerance = 0) {
    if (a === b)
        return true;
    const x = numericOf(a);
    const y = numericOf(b);
    if (!x || !y || x.rows !== y.rows || x.cols !== y.cols)
        return false;
    for (let k = 0; k < x.re.length; k++) {
        if (x.digits[k] !== null || y.digits[k] !== null) {
            if (x.digits[k] !== y.digits[k])
                return false;
            continue;
        }
        if (!samePart(x.re[k], y.re[k], tolerance) || !samePart(x.im[k], y.im[k], tolerance))
            return false;
    }
    return true;
}
