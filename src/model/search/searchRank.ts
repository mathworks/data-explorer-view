// Copyright 2026 The MathWorks, Inc.
// The app shell's search over entry names, ranked: the best match first, as the prototype's search
// ranked the entries of its open files. searchFilter.ts is the VS Code extension's rule (a substring
// of the name, the file or the block's path, in the records' order), which its QuickPick filters
// with and which stays as it is; this one is for a list a person reads from the top and presses
// Enter on, so the order is what matters.
//
// WHAT IS MATCHED, AND HOW STRONGLY
//
// An entry's name, its value and what it is (its data type and its class), as an open document's
// table shows them (namesOfRows with `cells`); a folder's index has names alone, and is matched on
// them. Each field is matched by the strongest of three, case ignored:
//
//   prefix     the text begins with the query          "gain" → Gain
//   substring  the text holds it                       "gain" → Kp_gain
//   fuzzy      the name holds its letters, in order    "kpg"  → Kp_gain
//
// The strength comes first, then the field: a name before a value before a type, at one strength.
// So "int8" lists an entry named int8Limit before every entry whose type is int8, and both before a
// name that only holds the letters. Where an entry is (a block's path through its model, its file's
// name) is matched as the extension matches it, as a substring, after every field of the entry
// itself: "contr" finds the blocks inside Controller, after an entry named Controls.
//
// A fuzzy match is the NAME's alone. It is for a name half remembered or typed short; a value is
// digits and punctuation, in which almost any short query's letters can be found in order, and a
// type is a word of a few dozen a person types whole or by its start.
//
// Within one strength and field, the records keep the order they came in (sortNameRecords: by
// name, then by file). The cap applies after the ranking, so a broad query keeps its best matches
// rather than the first records it reached.
import type { NameRecord } from './nameExtract.js';
import { MAX_SEARCH_RESULTS, searchItem, type SearchItem } from './searchItems.js';

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
function holdsInOrder(text: string, query: string): boolean {
  let at = 0;
  for (const ch of query) {
    at = text.indexOf(ch, at);
    if (at < 0) return false;
    at += ch.length;
  }
  return true;
}

/** How `record` matches `q` (trimmed and folded): its rank, or -1 for no match. */
function rankOf(record: NameRecord, q: string): number {
  const name = record.name.toLowerCase();
  if (name.startsWith(q)) return NAME_PREFIX;
  const value = (record.value ?? '').toLowerCase();
  if (value.startsWith(q)) return VALUE_PREFIX;
  const types = [record.dataType, record.className].filter((t): t is string => !!t).map((t) => t.toLowerCase());
  if (types.some((t) => t.startsWith(q))) return TYPE_PREFIX;
  if (name.includes(q)) return NAME_SUBSTRING;
  if (value.includes(q)) return VALUE_SUBSTRING;
  if (types.some((t) => t.includes(q))) return TYPE_SUBSTRING;
  if ((record.blockPath ?? '').toLowerCase().includes(q) || record.sourceLabel.toLowerCase().includes(q)) return WHERE_SUBSTRING;
  return holdsInOrder(name, q) ? NAME_FUZZY : -1;
}

/**
 * The records `query` matches, best first (see the head of this file), at most `max`. None for an
 * empty query, or spaces alone: the list stays empty until the user types.
 */
export function rankEntries(records: readonly NameRecord[], query: string, max: number = MAX_SEARCH_RESULTS): NameRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const found: { record: NameRecord; rank: number; index: number }[] = [];
  records.forEach((record, index) => {
    const rank = rankOf(record, q);
    if (rank >= 0) found.push({ record, rank, index });
  });
  found.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return found.slice(0, Math.max(0, max)).map((f) => f.record);
}

/** The rows a ranked search for `query` shows (rankEntries, as searchItem makes each), at most `max`. */
export function searchRanked(records: readonly NameRecord[], query: string, max: number = MAX_SEARCH_RESULTS): SearchItem[] {
  return rankEntries(records, query, max).map(searchItem);
}
