/**
 * What the Raw pane shows for a row: a text and the language it is in (`text` for one in none), a
 * value's bytes, drawn as a hex dump, or why there is nothing to show.
 */
export type RawView = {
    /** What `text` is written in: JSON and XML are coloured; `text` is drawn as it is. */
    format: 'json' | 'xml' | 'text';
    /** The text, as a copy of it would hold it. */
    text: string;
} | {
    format: 'hex';
    /** The bytes, as the value was read from the file. The node's own: do not write to them. */
    bytes: Uint8Array;
} | {
    format: 'none';
    /** Why there is nothing to show, in a sentence the pane shows as it is. */
    reason: string;
};
/** What the pane says for a row that has no raw form, or a row id that names nothing. */
export declare const NO_RAW_DATA = "No raw data for this row.";
/** A RawView of nothing, saying `reason`. */
export declare const noRaw: (reason?: string) => RawView;
/**
 * A node's raw form, by the prototype's rules: the bytes it was read from (`_rawBytes`, which
 * core keeps on a MAT-file's variable and on a model workspace's), as a dump; otherwise its record
 * (`serialize()`), as JSON two spaces deep; otherwise nothing. Total: a node that throws, or is
 * not a node at all, has none.
 */
export declare function rawOfNode(node: unknown): RawView;
/**
 * A value as JSON, two spaces deep: null and undefined (no record) are nothing. A BigInt, which
 * JSON has no number for (core's MAT reader holds a 64-bit integer as one), is written as its
 * digits, quoted; a value JSON cannot write at all (a cycle) is its text, as ts fell back to.
 */
export declare function rawOfValue(value: unknown): RawView;
/**
 * How many bytes `formatHex` dumps unless told: 64 KB, 4,096 lines. A matrix can be hundreds of
 * megabytes, and a dump of all of it would take the page as long to lay out as to read.
 */
export declare const HEX_LIMIT: number;
/**
 * `bytes` as a hex dump, 16 bytes a line, as ts drew its MAT-file values: the offset (8 hex
 * digits), the bytes, and what they read as in ASCII, a dot for a byte that does not print. At most
 * `max` bytes (HEX_LIMIT unless given), then a line saying how many more there are.
 */
export declare function formatHex(bytes: Uint8Array, max?: number): string;
/**
 * What a token is, which the pane colours it by. JSON's: an object's `key`, a `string`, a
 * `number`, a `literal` (true, false, null), `punct` (the brackets, commas and colons). XML's: a
 * `tag` name, an `attr` name, its value (a `string`), a `comment`, `punct` (the angle brackets and
 * the equals sign). Both: `text`, for whitespace, an element's content, and whatever is not the
 * language at all.
 */
export type RawTokenKind = 'key' | 'string' | 'number' | 'literal' | 'punct' | 'tag' | 'attr' | 'comment' | 'text';
/** One run of a text and what it is. Every token's `text` is at least one character. */
export interface RawToken {
    kind: RawTokenKind;
    text: string;
}
/**
 * The tokens of a JSON text. A string is a key where a colon follows it (past whitespace). Total:
 * a string left open ends at the end of its line (JSON has no line breaks in a string), so the
 * rest is still read; anything else that is not JSON is `text`.
 */
export declare function tokenizeJson(text: string): RawToken[];
/**
 * The tokens of an XML text: elements, declarations, comments and CDATA sections, as an entry of
 * a compressed dictionary is written. Total: a comment, a CDATA section or an attribute value left
 * open runs to the end of the text, a `<` that starts no tag is text, and a tag left open ends
 * where the next one starts.
 */
export declare function tokenizeXml(text: string): RawToken[];
