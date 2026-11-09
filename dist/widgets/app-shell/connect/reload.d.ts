import type { Doc } from '../../../model/source/workspace.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { ConfirmOptions } from '../dex-confirm-dialog.js';
/** What a tab is to the gate: its file, its name, its document, and the table its banner is in. */
export interface ReloadTab {
    path: string;
    name: string;
    doc?: Doc;
    table?: DexTreeTable;
    /** The bytes its file holds as the shell last read or wrote them: a read of the change sets them. */
    bytes?: Uint8Array;
}
/** What the gate reads and asks. */
export interface ReloadGateOptions<T> {
    /** The file's bytes as the disk holds them now. */
    read(path: string): Promise<Uint8Array>;
    /**
     * The file of `tab`, which has unsaved edits, changed on disk: whether to reload it. A rejection
     * is no answer. Asked about the tab, not its name, so a question that waits its turn can be
     * dropped for a tab that closed meanwhile.
     */
    confirm(tab: T): Promise<boolean>;
    /**
     * Whether `tab` is still open (and its shell up): a change, an answer or a read that lands after
     * it closed is not acted on, since its document is disposed by then.
     */
    isOpen(tab: T): boolean;
    /** A clean document of `tab` took the disk's file, unasked. */
    reloaded?(tab: T): void;
    /** The disk's file of `tab` could not be read or taken: why, as its table's banner says it. */
    failed?(tab: T, message: string): void;
}
/**
 * What a file changed on disk does to its tab: changedOnDisk for each change a watcher (or a save
 * written over) reports; the gate asks, reads and acts, one change at a time per tab.
 */
export declare class ReloadGate<T extends ReloadTab> {
    private readonly options;
    /** The tabs being asked about a change, until the answer is acted on; one change at a time each. */
    private readonly asking;
    /**
     * Tabs whose answer is being acted on (their file read); those whose file changed meanwhile; and
     * those of them told meanwhile that the document holds what the disk does not (a save written over).
     */
    private readonly acting;
    private readonly changedAgain;
    private readonly againUnsaved;
    /** A gate that reads, asks and checks a tab is open through `options`. */
    constructor(options: ReloadGateOptions<T>);
    /**
     * The file of `tab` holds another program's file. `unsaved`: the document holds what the disk does
     * not, its unsaved edits or a save another program then wrote over, so the user is asked.
     * `written`: the latter, which the document's `dirty` does not show, so it holds whenever it is
     * acted on (a watcher's `unsaved` is the document's `dirty` then, and read again when it is).
     */
    changedOnDisk(tab: T, unsaved: boolean, written?: boolean): Promise<void>;
    /** Keep the document over the disk's file, or take that file; `unsaved` as for changedOnDisk. */
    takeChange(tab: T, keep: boolean, unsaved: boolean): Promise<void>;
    /**
     * Read the file of `tab` and keep the document over it (`keep`) or take it in its place; a read
     * or a take that fails says so in its table's banner and to `failed`, and a clean document that
     * took the file unasked tells `reloaded`. Nothing for a tab that closed meanwhile.
     */
    actOnChange(tab: T, keep: boolean, unsaved: boolean): Promise<void>;
    private fail;
}
/**
 * What the in-page confirm dialog asks when a file with unsaved edits changed on disk, for a host
 * with no question of its own (`confirmReload`): the Electron app's native wording. Kept, the next
 * save writes the page's file over the other program's, and a MAT-file (and a model's workspace)
 * marks none of the variables only the other program changed Modified (Doc.keepOver), so the
 * detail says so; a dictionary marks them. Keep My Edits is the answer that loses nothing now.
 */
export declare function reloadQuestion(name: string): ConfirmOptions;
