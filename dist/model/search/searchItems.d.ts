import type { EntryKind, NameRecord } from './nameExtract.js';
/** The icon (an id of the package's icons/) each kind of entry shows, as it renders elsewhere. */
export declare const SEARCH_ICONS: Readonly<Record<EntryKind, string>>;
/**
 * How many matches a search shows at once. A result list without virtual scrolling (VS Code's
 * QuickPick has none) opens and filters sluggishly over tens of thousands of entries, so a broad
 * query is truncated rather than shown whole.
 */
export declare const MAX_SEARCH_RESULTS = 500;
/** One match, as a result list shows it. */
export interface SearchItem {
    /** The entry's name. */
    label: string;
    /** Where it is: a block's path through its model (when it adds to the name), then the file's name. */
    description: string;
    /** Its icon's id (SEARCH_ICONS). */
    iconId: string;
    /** The name to reveal it by in its file's table (`selectByName`): a block's key, its SID, else the name. */
    revealName: string;
    /** The record it shows. */
    entry: NameRecord;
}
/** A record as a result row. */
export declare function searchItem(rec: NameRecord): SearchItem;
/** The records in the order a result list shows them: by name, then by file. Sorts in place. */
export declare function sortNameRecords(records: NameRecord[]): NameRecord[];
/**
 * The rows a search for `query` shows: none for an empty query (the list stays empty until the
 * user types), else the matches (filterEntries) in the records' order, at most `max`.
 */
export declare function searchEntries(records: NameRecord[], query: string, max?: number): SearchItem[];
