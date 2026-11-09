import type { NameRecord } from './nameExtract.js';
import { type SearchItem } from './searchItems.js';
/**
 * The records `query` matches, best first (see the head of this file), at most `max`. None for an
 * empty query, or spaces alone: the list stays empty until the user types.
 */
export declare function rankEntries(records: readonly NameRecord[], query: string, max?: number): NameRecord[];
/** The rows a ranked search for `query` shows (rankEntries, as searchItem makes each), at most `max`. */
export declare function searchRanked(records: readonly NameRecord[], query: string, max?: number): SearchItem[];
