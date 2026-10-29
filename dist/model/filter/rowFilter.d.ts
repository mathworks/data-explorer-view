/** The subset of a table row this module needs in order to walk the tree. */
export interface FilterableRow {
    ID: string;
    parent: string | null;
}
export type FilterTerm = {
    column: string | null;
    text: string;
};
/** Every comparison the box understands. `~=` is normalized to `!=`. */
export type FilterOp = 'contains' | '=' | '!=' | '>' | '<' | '>=' | '<=';
/**
 * One condition the user typed. Emitted alongside the predicates so the chip
 * strip, the highlighter and the header popup all read the same answer.
 */
export interface FilterToken {
    /** Exactly as typed, so Backspace can round-trip a chip back into the input. */
    raw: string;
    /** Span in the source text. Removing a chip is a splice, not a re-serialize. */
    start: number;
    end: number;
    /** Resolved column key; null means "every visible column" (a bare term). */
    column: string | null;
    /** What the chip shows. Null for a bare term. */
    columnLabel: string | null;
    op: FilterOp;
    /** Unquoted, as typed. Empty is legal: `Unit=` asks for empty cells. */
    value: string;
    /**
     * Why this token is not doing what its text appears to ask.
     *   'unknown-column'    — `notacol:abc`; DOES filter, but as ordinary text
     *   'non-numeric-bound' — `Value>abc`; contributes no predicate at all
     */
    warning?: 'unknown-column' | 'non-numeric-bound';
}
/** The columns a table has, and the label each one prints in its header. */
export interface ColumnVocabulary {
    labels: Record<string, string> | null;
    /** Every column the table has, visible or not. Null = do not restrict. */
    keys: string[] | null;
}
export declare const SUBSTRING_FILTER_COLUMNS: Map<string, string>;
export declare function parseFilterExpression<T extends FilterableRow>(text: string, searchColumns: string[], getCellText: (row: T, col: string) => string, vocabulary?: ColumnVocabulary): {
    tokens: FilterToken[];
    predicates: Array<(row: T) => boolean>;
    terms: FilterTerm[];
};
export declare function filterRows<T extends FilterableRow>(rows: T[], text: string, searchColumns: string[], getCellText: (row: T, col: string) => string, stickyRowIds: Set<string>, vocabulary?: ColumnVocabulary): T[];
/**
 * The text one condition is spelled as. Used BOTH by the header popup's `writes:`
 * preview and by the text it applies, so the preview cannot promise one thing and
 * do another — and by nothing else, so there is one speller.
 */
export declare function formatToken(columnLabel: string, op: FilterOp, value: string): string;
/**
 * `text` with one token spliced out, closing the gap it leaves. Splices by SPAN
 * rather than re-serializing the survivors, so a value's own spacing and quoting
 * come through untouched.
 *
 * `trimEnd()`, not `.replace(/\s+$/, '')`, which removes the same characters but is
 * anchored at the end only: from each character of a run of whitespace that is not at
 * the end, the engine takes the rest of the run, fails on what follows, and gives it back
 * a character at a time, so 100,000 spaces anywhere before the chip took over 8 s. The
 * start needs no such change: `^\s+` is tried at one position only.
 */
export declare function removeToken(text: string, token: FilterToken): string;
