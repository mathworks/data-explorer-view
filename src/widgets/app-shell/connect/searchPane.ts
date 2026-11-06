// Copyright 2026 The MathWorks, Inc.
//
// The Search view's wiring: <dex-search-panel> asks for a query once the typing pauses, and is
// answered with the matches among the names of the files open and, when a folder is shown, the
// folder's name index. A result picked opens its file on its row.
//
// The open files' names are read off the rows their tables hold (namesOfRows), the same records the
// folder's index takes from the same file, so a file is searched once, by whichever list has it,
// and an open one by its own: what its table shows, unsaved edits and all, rather than what the
// index read from its disk, with each entry's value and type beside its name. The matches are
// ranked as the prototype's were (searchRanked: the name, the value or the type, a prefix before a
// substring before the name's letters in order), so Enter on the first row takes the best; a
// folder's entries, whose index reads names alone, match by name.
//
// The folder's index answers in its own time (a first build reads every file), so the panel says
// it is searching meanwhile, and the answer to a query the typing has moved past is dropped. An
// index that cannot be read says so once, not on every query, until it answers again. Once the
// folder's names are read again after a change, the query in the box is asked again, so the
// results on show are the folder's as it is now (as the folder's own search box, gone for this
// view, kept them).

import type { NameRecord } from '../../../model/search/nameExtract.js';
import type { NameIndex } from '../../../model/search/nameIndex.js';
import { sortNameRecords } from '../../../model/search/searchItems.js';
import { searchRanked } from '../../../model/search/searchRank.js';
import type { DexSearchPanel } from '../modules/dex-search-panel.js';

/** What the panel searches, and what a pick does. */
export interface SearchPaneContext {
  /** The open files' name records, from the rows their tables hold now. */
  openRecords(): NameRecord[];
  /** The shown folder's name index, or none with no folder shown. */
  folderNames(): NameIndex | undefined;
  /** Open the file of `sourceUri`, as a preview, on the row `revealName` names. */
  open(sourceUri: string, revealName: string): void;
  /** Say that the search could not be made, in words for a person. */
  failed(message: string): void;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * The records a search runs over: every open file's, then the folder's of the files not open (an
 * open file's own names win over what the index read from its disk), sorted as a result list shows
 * them.
 */
export function mergeSearchRecords(open: readonly NameRecord[], folder: readonly NameRecord[]): NameRecord[] {
  const opened = new Set(open.map((r) => r.sourceUri));
  return sortNameRecords([...open, ...folder.filter((r) => !opened.has(r.sourceUri))]);
}

/** The Search view, wired: what it searches, said; asked again; let go of. */
export interface SearchPane {
  /** Say what is searched: the open files, and the folder `folderName` if one is shown. */
  scope(folderName: string | null): void;
  /** The names searched changed (the folder's, read again): the query in the box, if any, is asked again. */
  again(): void;
  dispose(): void;
}

/** Wire `panel` to the open files and the folder. */
export function connectSearchPane(panel: DexSearchPanel, context: SearchPaneContext): SearchPane {
  let asked = 0;
  // The index whose last answer was a failure, said already.
  let refused: NameIndex | null = null;
  const run = (query: string): void => {
    const ask = ++asked;
    if (query.trim() === '') {
      panel.searching = false;
      panel.results = [];
      return;
    }
    const open = context.openRecords();
    const index = context.folderNames();
    if (!index) {
      panel.searching = false;
      panel.results = searchRanked(mergeSearchRecords(open, []), query);
      return;
    }
    panel.searching = true;
    index.list().then(
      (folder) => {
        if (refused === index) refused = null;
        if (ask !== asked) return;
        panel.results = searchRanked(mergeSearchRecords(open, folder), query);
        panel.searching = false;
      },
      (err) => {
        if (ask !== asked) return;
        // The folder's names could not be read: the open files' are still searched.
        if (refused !== index) context.failed(`Could not search the folder: ${message(err)}`);
        refused = index;
        panel.results = searchRanked(mergeSearchRecords(open, []), query);
        panel.searching = false;
      },
    );
  };
  const onQuery = (e: CustomEvent<{ query: string }>): void => run(e.detail.query);
  const onOpen = (e: CustomEvent<{ sourceUri: string; revealName: string }>): void => context.open(e.detail.sourceUri, e.detail.revealName);
  panel.addEventListener('dex-search-query', onQuery);
  panel.addEventListener('dex-search-open', onOpen);
  return {
    scope(folderName) {
      panel.scope = folderName ? `Open files and ${folderName}` : 'Open files';
    },
    again() {
      // An empty box shows no results, and has nothing to ask.
      if (panel.query.trim() !== '') run(panel.query);
    },
    dispose() {
      asked++;
      panel.removeEventListener('dex-search-query', onQuery);
      panel.removeEventListener('dex-search-open', onOpen);
    },
  };
}
