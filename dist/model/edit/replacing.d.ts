import { type EntrySelector } from 'data-explorer-core';
import type { TransferRegister } from './transfer.js';
/** What a replacing copy says of a row whose entry is no longer in its document `name`. */
export declare const replacedGone: (name: string) => string;
/**
 * The entries a replacing copy takes the place of, from the rows that name them: each row's entry
 * (a row inside an entry stands for its entry, as a copy carries whole entries), by the selector the
 * commit takes it out by, once each. Null where a row finds no node: the entry is no longer in the
 * document, and the copy is refused before anything changes.
 */
export declare function replacedEntries(rowIds: readonly string[], findNode: (rowId: string) => unknown): EntrySelector[] | null;
/**
 * The entries of `rowIds` a replacing copy into the document `name` takes the place of, or null
 * where one is gone, and then the copy is refused here: the drag ends, as a drop ends it whatever
 * became of it (runTransfer), so no table goes on predicting a drop already tried, and `report`
 * says why.
 */
export declare function replacingOrRefuse(rowIds: readonly string[], findNode: (rowId: string) => unknown, register: TransferRegister, name: string, report: (message: string) => void): EntrySelector[] | null;
