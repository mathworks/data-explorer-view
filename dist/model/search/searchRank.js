import { MAX_SEARCH_RESULTS, searchItem } from './searchItems.js';
// The ranks, best first: the strength, then the field.
const NAME_PREFIX = 0;
const VALUE_PREFIX = 1;
const TYPE_PREFIX = 2;
const NAME_SUBSTRING = 3;
const VALUE_SUBSTRING = 4;
const TYPE_SUBSTRING = 5;
const WHERE_SUBSTRING = 6;
const NAME_FUZZY = 7;
/** Whether `text` holds the letters of `query` in order (both folded). */
function holdsInOrder(text, query) {
    let at = 0;
    for (const ch of query) {
        at = text.indexOf(ch, at);
        if (at < 0)
            return false;
        at += ch.length;
    }
    return true;
}
/** How `record` matches `q` (trimmed and folded): its rank, or -1 for no match. */
function rankOf(record, q) {
    const name = record.name.toLowerCase();
    if (name.startsWith(q))
        return NAME_PREFIX;
    const value = (record.value ?? '').toLowerCase();
    if (value.startsWith(q))
        return VALUE_PREFIX;
    const types = [record.dataType, record.className].filter((t) => !!t).map((t) => t.toLowerCase());
    if (types.some((t) => t.startsWith(q)))
        return TYPE_PREFIX;
    if (name.includes(q))
        return NAME_SUBSTRING;
    if (value.includes(q))
        return VALUE_SUBSTRING;
    if (types.some((t) => t.includes(q)))
        return TYPE_SUBSTRING;
    if ((record.blockPath ?? '').toLowerCase().includes(q) || record.sourceLabel.toLowerCase().includes(q))
        return WHERE_SUBSTRING;
    return holdsInOrder(name, q) ? NAME_FUZZY : -1;
}
/**
 * The records `query` matches, best first (see the head of this file), at most `max`. None for an
 * empty query, or spaces alone: the list stays empty until the user types.
 */
export function rankEntries(records, query, max = MAX_SEARCH_RESULTS) {
    const q = query.trim().toLowerCase();
    if (!q)
        return [];
    const found = [];
    records.forEach((record, index) => {
        const rank = rankOf(record, q);
        if (rank >= 0)
            found.push({ record, rank, index });
    });
    found.sort((a, b) => a.rank - b.rank || a.index - b.index);
    return found.slice(0, Math.max(0, max)).map((f) => f.record);
}
/** The rows a ranked search for `query` shows (rankEntries, as searchItem makes each), at most `max`. */
export function searchRanked(records, query, max = MAX_SEARCH_RESULTS) {
    return rankEntries(records, query, max).map(searchItem);
}
