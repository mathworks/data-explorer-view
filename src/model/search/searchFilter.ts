// Copyright 2026 The MathWorks, Inc.
// The match/cap rule behind a search over a folder's entry names. From the VS Code extension's
// searchFilter.ts, which its QuickPick overlay filters with; searchItems.ts is what each match
// reads as.
import type { NameRecord } from './nameExtract.js';

// Filter the name index for the overlay. An empty/whitespace query returns no
// matches (the list stays empty until the user types). Otherwise a case-
// insensitive substring match on the entry name, its source label, OR — for a block
// — its path through the model, preserving input order and capped at `max`. The cap
// guards the QuickPick, which has no virtual scrolling: a broad query over a large
// index is truncated rather than handed over whole.
//
// The path is searchable because it is the only thing that distinguishes one `Gain`
// from another, so "the Gain in Controller" has to be expressible; and because
// `Controller` is a block a user knows the name of while its own row is not in this
// index (a subsystem has no parameter reference of its own to be recorded by).
// Whatever matches here must also be VISIBLE on the item searchItem builds — a list that
// filters the results again by its label and description (VS Code's QuickPick does) would
// otherwise drop a match on a field it does not show.
export function filterEntries(records: NameRecord[], query: string, max: number): NameRecord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: NameRecord[] = [];
  for (const rec of records) {
    if (
      rec.name.toLowerCase().includes(q) ||
      rec.sourceLabel.toLowerCase().includes(q) ||
      (rec.blockPath ?? '').toLowerCase().includes(q)
    ) {
      matches.push(rec);
      if (matches.length >= max) break;
    }
  }
  return matches;
}
