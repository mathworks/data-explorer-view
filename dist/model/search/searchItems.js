import { filterEntries } from './searchFilter.js';
/** The icon (an id of the package's icons/) each kind of entry shows, as it renders elsewhere. */
export const SEARCH_ICONS = {
    sldd: 'wsDefault',
    mat: 'wsNumeric',
    workspace: 'wsParameters',
    block: 'wsSignal',
};
/**
 * How many matches a search shows at once. A result list without virtual scrolling (VS Code's
 * QuickPick has none) opens and filters sluggishly over tens of thousands of entries, so a broad
 * query is truncated rather than shown whole.
 */
export const MAX_SEARCH_RESULTS = 500;
/** A record as a result row. */
export function searchItem(rec) {
    // A block's path goes in front of the file name, because with one row per block a model can
    // answer a search with four hits all reading `Gain` and the path is what says which is which.
    // Only when it adds something: a block in the root system has the path `Gain`, which would
    // just repeat the label. The file name stays either way — it is the coarser fact, and the only
    // one a non-block hit has.
    const where = rec.blockPath && rec.blockPath !== rec.name ? rec.blockPath + ' · ' : '';
    return {
        label: rec.name,
        description: where + rec.sourceLabel,
        iconId: SEARCH_ICONS[rec.kind],
        revealName: rec.selectName ?? rec.name,
        entry: rec,
    };
}
/** The records in the order a result list shows them: by name, then by file. Sorts in place. */
export function sortNameRecords(records) {
    return records.sort((a, b) => a.name.localeCompare(b.name) || a.sourceLabel.localeCompare(b.sourceLabel));
}
/**
 * The rows a search for `query` shows: none for an empty query (the list stays empty until the
 * user types), else the matches (filterEntries) in the records' order, at most `max`.
 */
export function searchEntries(records, query, max = MAX_SEARCH_RESULTS) {
    return filterEntries(records, query, max).map(searchItem);
}
