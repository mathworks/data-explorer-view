// Copyright 2026 The MathWorks, Inc.
//
// The Search view's wiring: <dex-search-panel> asks for a query once the typing pauses, and is
// answered with the matches among the names of the files open and, when a folder is shown, the
// folder's name index. A result picked opens its file on its row.
//
// The open files' names are read off the rows their tables hold (namesOfRows), the same records the
// folder's index takes from the same file, so a file is searched once, by whichever list has it,
// and an open one by its own: what its table shows, unsaved edits and all, rather than what the
// index read from its disk. The folder's index answers in its own time (a first build reads every
// file), so the panel says it is searching meanwhile, and the answer to a query the typing has
// moved past is dropped.

import type { NameRecord } from '../../../model/search/nameExtract.js';
import type { NameIndex } from '../../../model/search/nameIndex.js';
import { searchEntries, sortNameRecords } from '../../../model/search/searchItems.js';
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

/** Wire `panel` to the open files and the folder; `scope(folderName)` says what it searches. */
export function connectSearchPane(panel: DexSearchPanel, context: SearchPaneContext): { scope(folderName: string | null): void; dispose(): void } {
  let asked = 0;
  const onQuery = (e: CustomEvent<{ query: string }>): void => {
    const query = e.detail.query;
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
      panel.results = searchEntries(mergeSearchRecords(open, []), query);
      return;
    }
    panel.searching = true;
    index.list().then(
      (folder) => {
        if (ask !== asked) return;
        panel.results = searchEntries(mergeSearchRecords(open, folder), query);
        panel.searching = false;
      },
      (err) => {
        if (ask !== asked) return;
        // The folder's names could not be read: the open files' are still searched.
        context.failed(`Could not search the folder: ${message(err)}`);
        panel.results = searchEntries(mergeSearchRecords(open, []), query);
        panel.searching = false;
      },
    );
  };
  const onOpen = (e: CustomEvent<{ sourceUri: string; revealName: string }>): void => context.open(e.detail.sourceUri, e.detail.revealName);
  panel.addEventListener('dex-search-query', onQuery);
  panel.addEventListener('dex-search-open', onOpen);
  return {
    scope(folderName) {
      panel.scope = folderName ? `Open files and ${folderName}` : 'Open files';
    },
    dispose() {
      asked++;
      panel.removeEventListener('dex-search-query', onQuery);
      panel.removeEventListener('dex-search-open', onOpen);
    },
  };
}
