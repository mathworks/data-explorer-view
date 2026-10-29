// Copyright 2026 The MathWorks, Inc.
// What a search over a folder's entry names shows: each match as a row of a result list, in the
// order a list shows them, and the name a pick reveals. The text the VS Code extension's QuickPick
// gives each match (its searchSources.ts), so a search in an app reads as the extension's does.
//
// Scoped like the extension's: the named entries a data source contains (dictionary and MAT-file
// variables, model-workspace variables, blocks), not file names and not cell values.
import type { EntryKind, NameRecord } from './nameExtract.js';
import { filterEntries } from './searchFilter.js';

/** The icon (an id of the package's icons/) each kind of entry shows, as it renders elsewhere. */
export const SEARCH_ICONS: Readonly<Record<EntryKind, string>> = {
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
export function searchItem(rec: NameRecord): SearchItem {
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
export function sortNameRecords(records: NameRecord[]): NameRecord[] {
  return records.sort((a, b) => a.name.localeCompare(b.name) || a.sourceLabel.localeCompare(b.sourceLabel));
}

/**
 * The rows a search for `query` shows: none for an empty query (the list stays empty until the
 * user types), else the matches (filterEntries) in the records' order, at most `max`.
 */
export function searchEntries(records: NameRecord[], query: string, max: number = MAX_SEARCH_RESULTS): SearchItem[] {
  return filterEntries(records, query, max).map(searchItem);
}
