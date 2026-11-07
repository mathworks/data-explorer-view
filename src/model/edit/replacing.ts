// Copyright 2026 The MathWorks, Inc.
//
// What every editable view does alike before a copy that replaces entries (a compare's Copy to
// Right; TransferRequest.replacing): the rows it names, turned into the entries the copy takes the
// place of, or the copy refused where one is gone. View's own, beside transfer.ts rather than in it,
// so that the policy stays close to the VS Code extension's copy of it.
import { entrySelectorOf, owningEntryOf, type EntrySelector } from 'data-explorer-core';
import type { TransferRegister } from './transfer.js';

/** What a replacing copy says of a row whose entry is no longer in its document `name`. */
export const replacedGone = (name: string): string => `An entry to replace is no longer in ${name}.`;

/**
 * The entries a replacing copy takes the place of, from the rows that name them: each row's entry
 * (a row inside an entry stands for its entry, as a copy carries whole entries), by the selector the
 * commit takes it out by, once each. Null where a row finds no node: the entry is no longer in the
 * document, and the copy is refused before anything changes.
 */
export function replacedEntries(rowIds: readonly string[], findNode: (rowId: string) => unknown): EntrySelector[] | null {
  const out: EntrySelector[] = [];
  const seen = new Set<string>();
  for (const rowId of rowIds) {
    const entry = owningEntryOf(findNode(rowId) as Parameters<typeof owningEntryOf>[0]);
    if (!entry) return null;
    const selector = entrySelectorOf(entry);
    const key = `${selector.name}\u0000${selector.uuid ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(selector);
  }
  return out;
}

/**
 * The entries of `rowIds` a replacing copy into the document `name` takes the place of, or null
 * where one is gone, and then the copy is refused here: the drag ends, as a drop ends it whatever
 * became of it (runTransfer), so no table goes on predicting a drop already tried, and `report`
 * says why.
 */
export function replacingOrRefuse(
  rowIds: readonly string[],
  findNode: (rowId: string) => unknown,
  register: TransferRegister,
  name: string,
  report: (message: string) => void,
): EntrySelector[] | null {
  const selectors = replacedEntries(rowIds, findNode);
  if (selectors) return selectors;
  register.clear();
  register.broadcast();
  report(replacedGone(name));
  return null;
}
