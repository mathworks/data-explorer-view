import type { NameRecord } from '../../../model/search/nameExtract.js';
import type { NameIndex } from '../../../model/search/nameIndex.js';
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
/**
 * The records a search runs over: every open file's, then the folder's of the files not open (an
 * open file's own names win over what the index read from its disk), sorted as a result list shows
 * them.
 */
export declare function mergeSearchRecords(open: readonly NameRecord[], folder: readonly NameRecord[]): NameRecord[];
/** Wire `panel` to the open files and the folder; `scope(folderName)` says what it searches. */
export declare function connectSearchPane(panel: DexSearchPanel, context: SearchPaneContext): {
    scope(folderName: string | null): void;
    dispose(): void;
};
