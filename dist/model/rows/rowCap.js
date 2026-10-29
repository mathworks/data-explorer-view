/**
 * The most rows one payload may carry.
 *
 * Chosen for the WORST row shape rather than the measured one. Rows from the file
 * above average 366 bytes of JSON, which would allow ~1.4M of them under V8's
 * limit; but a row's size is the data's, not the format's — a long name, a wide
 * value, a usage cell naming a dozen blocks — and a 10x heavier row is ordinary. At
 * 100,000 even that row shape lands near 360 MiB, inside the limit; at 200,000 it
 * does not. The measured cost at this cap is 34.5 MiB and 58 ms to serialize, which
 * is a wait, not a hang.
 *
 * It is deliberately far above any table a person reads top to bottom. Anything
 * near it is a file being browsed with the search box, and the rows past it were
 * never going to be scrolled to.
 */
export const MAX_TABLE_ROWS = 100_000;
/**
 * The first `max` rows, and the count there would have been.
 *
 * Truncating the TAIL rather than sampling is what keeps the tree walkable: every
 * builder here emits a parent before its children (a depth-first pre-order walk of
 * the node tree), so a prefix of the rows is a set in which every row's parent is
 * also present. The webview builds its tree from each row's `parent` id, so a cut
 * anywhere else would leave rows whose parent never arrived — orphans it cannot
 * place, under a twisty that opens onto nothing.
 *
 * A cut subtree does leave a parent row showing fewer children than it has. That is
 * what the banner is for: an incomplete table that says so beats a complete one
 * that never loads, and both beat the spinner.
 */
export function capRows(rows, max = MAX_TABLE_ROWS) {
    if (rows.length <= max) {
        return { rows, total: rows.length };
    }
    return { rows: rows.slice(0, max), total: rows.length };
}
/**
 * The banner for a capped payload, folding in whatever the parse already had to say.
 *
 * The cap takes the HEADLINE when it fires, and core's own headline moves down into
 * the details. Both are true, but they are not equally large: a parse that lost one
 * part of a file describes a gap in the table, while a cap describes where the table
 * stops. Which rows are missing is the one thing the user cannot work out from the
 * rows in front of them, so it is the line that goes first.
 *
 * The sentence does NOT suggest searching for a row past the cap. The search box
 * filters the payload, and the dropped rows are not in it — advice that cannot work
 * is worse than none, because it reads as the table being broken rather than short.
 *
 * `undefined` in and nothing dropped gives `undefined` out — the payload carries no
 * banner and the strip clears, exactly as before this existed.
 */
export function rowCapBanner(capped, parse) {
    const dropped = capped.total - capped.rows.length;
    if (dropped <= 0) {
        return parse;
    }
    const shown = capped.rows.length.toLocaleString('en-US');
    const total = capped.total.toLocaleString('en-US');
    return {
        headline: `This file has more rows than one table can show: these are the first ${shown} of ${total}, ` +
            'and the rest are not in this view.',
        details: parse ? [parse.headline, ...parse.details] : [],
    };
}
