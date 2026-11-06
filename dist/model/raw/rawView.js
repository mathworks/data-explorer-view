// Copyright 2026 The MathWorks, Inc.
//
// What the Raw pane shows for a row, and the two things it does with it: a hex dump of bytes, and
// the tokens of a JSON or an XML text, which it colours.
//
// A row's raw form is what core holds for it, unrendered: the record it would write, as JSON or as
// XML, or the bytes a value was read from, as a dump. The prototype's rules for a node are
// rawOfNode's (its RawViewerProjector): the bytes where the node keeps them, otherwise the record
// its serialize() gives, as JSON. What each kind of document answers for its rows, a dictionary's
// entry as the file would hold it among them, is rawOfRow.ts.
//
// ts coloured the text with highlight.js. This package takes no dependency for it: the two
// tokenizers below are small, total (any text, malformed or cut short, is read, and nothing
// throws), and give back exactly the text they were given, so the pane shows the record and only
// the record whatever the colouring made of it.
//
// DOM-free, like all of src/model.
/** What the pane says for a row that has no raw form, or a row id that names nothing. */
export const NO_RAW_DATA = 'No raw data for this row.';
/** A RawView of nothing, saying `reason`. */
export const noRaw = (reason = NO_RAW_DATA) => ({ format: 'none', reason });
/**
 * A node's raw form, by the prototype's rules: the bytes it was read from (`_rawBytes`, which
 * core keeps on a MAT-file's variable and on a model workspace's), as a dump; otherwise its record
 * (`serialize()`), as JSON two spaces deep; otherwise nothing. Total: a node that throws, or is
 * not a node at all, has none.
 */
export function rawOfNode(node) {
    if (node === null || typeof node !== 'object')
        return noRaw();
    const n = node;
    if (n._rawBytes instanceof Uint8Array && n._rawBytes.length > 0)
        return { format: 'hex', bytes: n._rawBytes };
    if (typeof n.serialize !== 'function')
        return noRaw();
    let value;
    try {
        value = n.serialize.call(node);
    }
    catch {
        return noRaw();
    }
    return rawOfValue(value);
}
/**
 * A value as JSON, two spaces deep: null and undefined (no record) are nothing. A BigInt, which
 * JSON has no number for (core's MAT reader holds a 64-bit integer as one), is written as its
 * digits, quoted; a value JSON cannot write at all (a cycle) is its text, as ts fell back to.
 */
export function rawOfValue(value) {
    if (value === null || value === undefined)
        return noRaw();
    let text;
    try {
        text = JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
    }
    catch {
        return { format: 'text', text: String(value) };
    }
    // JSON.stringify gives undefined for what it writes nothing of: a function, a symbol.
    return text === undefined ? noRaw() : { format: 'json', text };
}
// --- The hex dump ----------------------------------------------------------------------------------
/**
 * How many bytes `formatHex` dumps unless told: 64 KB, 4,096 lines. A matrix can be hundreds of
 * megabytes, and a dump of all of it would take the page as long to lay out as to read.
 */
export const HEX_LIMIT = 64 * 1024;
const HEX_COLUMN = 16 * 3 - 1;
/**
 * `bytes` as a hex dump, 16 bytes a line, as ts drew its MAT-file values: the offset (8 hex
 * digits), the bytes, and what they read as in ASCII, a dot for a byte that does not print. At most
 * `max` bytes (HEX_LIMIT unless given), then a line saying how many more there are.
 */
export function formatHex(bytes, max = HEX_LIMIT) {
    const shown = Math.min(bytes.length, Math.max(0, Math.floor(max)));
    const lines = [];
    for (let at = 0; at < shown; at += 16) {
        const end = Math.min(at + 16, shown);
        const hex = [];
        let ascii = '';
        for (let i = at; i < end; i++) {
            const b = bytes[i];
            hex.push(b.toString(16).padStart(2, '0'));
            ascii += b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.';
        }
        // A short last line keeps its ASCII column under the others'.
        lines.push(`${at.toString(16).padStart(8, '0')}  ${hex.join(' ').padEnd(HEX_COLUMN)}  ${ascii}`);
    }
    const more = bytes.length - shown;
    if (more > 0)
        lines.push(`… ${more.toLocaleString('en-US')} more ${more === 1 ? 'byte' : 'bytes'}`);
    return lines.join('\n');
}
/** The tokens being built, with each run of `text` kept as one token. */
class Tokens {
    constructor() {
        this.list = [];
    }
    push(kind, text) {
        if (text === '')
            return;
        const last = this.list.at(-1);
        if (kind === 'text' && last?.kind === 'text')
            last.text += text;
        else
            this.list.push({ kind, text });
    }
}
/** The end of the match of sticky `re` at `at` in `text`, or `at` where it does not match. */
function matchEnd(re, text, at) {
    re.lastIndex = at;
    return re.test(text) ? re.lastIndex : at;
}
// JSON's number, as strictly as JSON spells one: a malformed one is read as far as it is a number.
const JSON_NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
const JSON_WORD = /[A-Za-z_$][\w$]*/y;
const WHITESPACE = /\s+/y;
const JSON_LITERALS = new Set(['true', 'false', 'null']);
/**
 * The tokens of a JSON text. A string is a key where a colon follows it (past whitespace). Total:
 * a string left open ends at the end of its line (JSON has no line breaks in a string), so the
 * rest is still read; anything else that is not JSON is `text`.
 */
export function tokenizeJson(text) {
    const out = new Tokens();
    const n = text.length;
    let i = 0;
    while (i < n) {
        const c = text[i];
        let end;
        if (c === '"') {
            end = i + 1;
            while (end < n) {
                const d = text[end];
                if (d === '\\')
                    end += 2;
                else if (d === '"') {
                    end++;
                    break;
                }
                else if (d === '\n')
                    break;
                else
                    end++;
            }
            end = Math.min(end, n);
            out.push('string', text.slice(i, end));
        }
        else if ('{}[],:'.includes(c)) {
            end = i + 1;
            out.push('punct', c);
        }
        else if ((end = matchEnd(WHITESPACE, text, i)) > i) {
            out.push('text', text.slice(i, end));
        }
        else if ((end = matchEnd(JSON_NUMBER, text, i)) > i) {
            out.push('number', text.slice(i, end));
        }
        else if ((end = matchEnd(JSON_WORD, text, i)) > i) {
            const word = text.slice(i, end);
            out.push(JSON_LITERALS.has(word) ? 'literal' : 'text', word);
        }
        else {
            end = i + 1;
            out.push('text', c);
        }
        i = end;
    }
    // A string with a colon after it is a key. Whitespace runs are tokens of their own only where
    // nothing else is beside them, so the token after a key is the colon, or whitespace then it.
    const tokens = out.list;
    for (let k = 0; k < tokens.length; k++) {
        if (tokens[k].kind !== 'string')
            continue;
        let next = k + 1;
        if (tokens[next]?.kind === 'text' && tokens[next].text.trim() === '')
            next++;
        if (tokens[next]?.kind === 'punct' && tokens[next].text === ':')
            tokens[k].kind = 'key';
    }
    return tokens;
}
// A tag's or an attribute's name: anything up to what ends one.
const XML_NAME = /[^\s<>/?!="']+/y;
/** The end of the run from `at` up to and including `close`, or the end of `text` when it never comes. */
function through(text, at, close) {
    const found = text.indexOf(close, at);
    return found < 0 ? text.length : found + close.length;
}
/**
 * The tokens of an XML text: elements, declarations, comments and CDATA sections, as an entry of
 * a compressed dictionary is written. Total: a comment, a CDATA section or an attribute value left
 * open runs to the end of the text, a `<` that starts no tag is text, and a tag left open ends
 * where the next one starts.
 */
export function tokenizeXml(text) {
    const out = new Tokens();
    const n = text.length;
    let i = 0;
    let inTag = false;
    while (i < n) {
        const c = text[i];
        let end;
        if (!inTag) {
            if (text.startsWith('<!--', i)) {
                end = through(text, i + 4, '-->');
                out.push('comment', text.slice(i, end));
            }
            else if (text.startsWith('<![CDATA[', i)) {
                // Character data: the text it is, as the element's content around it is.
                end = through(text, i + 9, ']]>');
                out.push('text', text.slice(i, end));
            }
            else if (c === '<' && i + 1 < n && /[/?!]/.test(text[i + 1]) && matchEnd(XML_NAME, text, i + 2) > i + 2) {
                end = i + 2;
                out.push('punct', text.slice(i, end));
                inTag = true;
            }
            else if (c === '<' && matchEnd(XML_NAME, text, i + 1) > i + 1) {
                end = i + 1;
                out.push('punct', c);
                inTag = true;
            }
            else {
                const next = text.indexOf('<', i + 1);
                end = next < 0 ? n : next;
                out.push('text', text.slice(i, end));
            }
            // The name right after the bracket is the tag's.
            if (inTag) {
                const nameEnd = matchEnd(XML_NAME, text, end);
                out.push('tag', text.slice(end, nameEnd));
                end = nameEnd;
            }
        }
        else if (c === '>') {
            end = i + 1;
            out.push('punct', c);
            inTag = false;
        }
        else if ((c === '/' || c === '?') && text[i + 1] === '>') {
            end = i + 2;
            out.push('punct', text.slice(i, end));
            inTag = false;
        }
        else if (c === '<') {
            // A tag that opens inside another: the first one ends here, and this one is read as one.
            inTag = false;
            continue;
        }
        else if (c === '"' || c === "'") {
            const close = text.indexOf(c, i + 1);
            end = close < 0 ? n : close + 1;
            out.push('string', text.slice(i, end));
        }
        else if (c === '=') {
            end = i + 1;
            out.push('punct', c);
        }
        else if ((end = matchEnd(XML_NAME, text, i)) > i) {
            out.push('attr', text.slice(i, end));
        }
        else {
            // Whitespace between attributes, or a stray character in the tag.
            end = Math.max(matchEnd(WHITESPACE, text, i), i + 1);
            out.push('text', text.slice(i, end));
        }
        i = end;
    }
    return out.list;
}
