import { type CommandTarget } from '../../../model/shell/commands.js';
import { type TableSource } from '../../../model/source/tableSource.js';
import type { DexCommandWindow } from '../modules/dex-command-window.js';
import type { OpenTab } from './documents.js';
/** What the window runs its lines over. */
export interface TerminalContext {
    /** The active tab: the document a line typed now acts on. */
    active(): OpenTab | undefined;
    /** Every open tab, for `sources`. */
    tabs(): readonly OpenTab[];
    /** Save `tab`, for `save`: what to say, or a rejection saying why it was not saved. */
    save(tab: OpenTab): Promise<string>;
}
/**
 * Run `act`, a queued command of `source`'s, and settle a task after the first change it brings
 * (SETTLING: not the clipboard's state, a drag's, a rename asked for), by when the write that
 * follows it in the same task is done; or after `wait` ms, for a command that brings none. Rejects
 * at once, listening no more, for a command that throws.
 */
export declare function settleAfter(source: TableSource, act: () => void, wait?: number): Promise<void>;
/**
 * The CommandTarget of `tab` among `tabs`: the commands a document the page edits takes (edit,
 * add, delete, save) only where it does, as the table offers them only there.
 */
export declare function commandTarget(tab: OpenTab | undefined, tabs: readonly OpenTab[], save: (tab: OpenTab) => Promise<string>): CommandTarget;
/** Run `window`'s lines over the active tab; idle() settles once every line run so far has. */
export declare function connectTerminal(window: DexCommandWindow, context: TerminalContext): {
    idle(): Promise<void>;
    dispose(): void;
};
