// Copyright 2026 The MathWorks, Inc.
//
// One side of a compare, read: every row of a document, none held back, its table's columns, and
// (when asked) each entry's inspector page. What diffSides (diff.ts) compares, two at a time.
//
// The rows are the ones the table draws, read through the document's TableSource, so a compare
// reads every kind of file the table shows (dictionaries, models, MAT-files) through one door and
// reads them as the user sees them. A paint holds back what lies past its row budget (`_lazy`,
// lazyRows.ts): a compare cannot leave it out, as a difference in it would go unseen, so each such
// row's children are asked for, and theirs in turn. What bounds the reading is `maxRows`, a size
// past which the user is told the file is too large to compare rather than left waiting.
//
// Nothing here touches a DOM: a TableSource is the same in a page (a workspace's document), in a
// terminal and in a worker, which is how the command line's `diff` reads its two files.
import { uriBasename } from '../ids/pathUtil.js';
import { isSectionRowId } from '../ids/sectionRowId.js';
/** The most rows a side holds by default: past it a compare would keep the user waiting, and the page short of memory. */
const MAX_ROWS = 1_000_000;
/** The most entries whose pages a side reads by default: one inspect each. */
const MAX_PAGES = 5_000;
/** The most pages asked for at once: enough to keep a source across a channel busy, not to flood it. */
const PAGES_IN_FLIGHT = 32;
/** An entry: a row right under a section heading, or a top-level row of a document with no sections (a MAT-file's variable). */
const isEntry = (row) => row.parent !== null ? isSectionRowId(row.parent) : !isSectionRowId(row.ID);
/** A row as a side holds it: as it is, or without the `_lazy` its fetched children make untrue. */
function fetched(row) {
    if (!row._lazy)
        return row;
    const { _lazy: _held, ...rest } = row;
    return rest;
}
/** Each entry's page, in the entries' order, at most PAGES_IN_FLIGHT asked at once. */
async function pagesOf(source, entries) {
    const groups = new Array(entries.length);
    let next = 0;
    const worker = async () => {
        while (next < entries.length) {
            const i = next++;
            groups[i] = (await source.inspect(entries[i].ID)).groups;
        }
    };
    await Promise.all(Array.from({ length: Math.min(PAGES_IN_FLIGHT, entries.length) }, worker));
    return new Map(entries.map((entry, i) => [entry.ID, groups[i]]));
}
/**
 * Every row of the document `source` shows: `open()`'s (or `shown`'s) rows, then for each row held
 * back (`_lazy`) none of whose children are among them, `children()` once, the rows it answers that
 * are held back in turn; each such row then carries no `_lazy`. With `properties`, each entry's
 * `inspect()` page. Rejects as `open()` does (the table's banner text) and past `maxRows`. DOM-free:
 * runs wherever a TableSource does.
 */
export async function readDiffSide(source, options = {}) {
    const view = options.shown?.view ?? (await source.open());
    const first = options.shown?.rows ?? view.rows;
    const maxRows = options.maxRows ?? MAX_ROWS;
    const tooMany = () => new Error(`${decodeURIComponent(uriBasename(view.docUri))} has more than ${maxRows.toLocaleString('en-US')} rows to compare.`);
    // The rows that have a child among the rows read so far: a held-back row among them was opened
    // since the paint (its children fetched by the table), and is not asked again.
    const parents = new Set(first.map((row) => row.parent));
    const rows = [];
    // Each held-back row's children go right after it, so the side reads in the table's order.
    const take = async (list) => {
        for (const row of list) {
            if (rows.length >= maxRows)
                throw tooMany();
            rows.push(fetched(row));
            if (!row._lazy || parents.has(row.ID))
                continue;
            const answer = await source.children(row.ID);
            for (const child of answer.rows)
                parents.add(child.parent);
            await take(answer.rows);
        }
    };
    await take(first);
    const side = { docUri: view.docUri, rows, columns: view.columns, columnLabels: view.columnLabels };
    if (!options.properties)
        return side;
    const entries = rows.filter(isEntry);
    if (entries.length > (options.maxPages ?? MAX_PAGES))
        return { ...side, pagesSkipped: true };
    return { ...side, pages: await pagesOf(source, entries) };
}
