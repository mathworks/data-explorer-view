import type { Doc } from '../../../model/source/workspace.js';
import type { ConfirmOptions } from '../dex-confirm-dialog.js';
import type { CloseAnswer, ShellHost } from './types.js';
/** A tab, as a save sees it: its file, its name, and its document, once read. */
export interface Savable {
    /** The file the document saves over. */
    path: string;
    /** What a refusal and a question name it by. */
    name: string;
    /** Its document; none before its file is read, which has nothing to save. */
    doc?: Doc;
    /** The bytes its file holds as the shell last read or wrote them: a save onto it sets them. */
    bytes?: Uint8Array;
}
/**
 * How a save ended: over its own file (and whether another program then wrote over it), at another
 * path (Save As), or not at all (and why, if it failed).
 */
export type SaveResult = {
    kind: 'saved';
    overwritten?: boolean;
} | {
    kind: 'saved-as';
    path: string;
} | {
    kind: 'not-saved';
    error?: string;
};
/** Saves tabs' documents through the host, one save of a tab at a time. */
export declare class Saver {
    private readonly host;
    private readonly queues;
    /** Saves through `host`'s saveFile and saveFileAs. */
    constructor(host: Pick<ShellHost, 'saveFile' | 'saveFileAs'>);
    /**
     * Save `tab`'s document over its file, or (`as`) where the user says. A tab's saves run one at
     * a time, in the order asked, so the last one asked is the one on disk.
     */
    save(tab: Savable, as?: boolean): Promise<SaveResult>;
    private write;
}
/**
 * Whether `tabs` may close: none has unsaved edits, or the user says to discard them, or to save
 * them and every save succeeds (`save`, which says why one did not). `confirm` asks the user,
 * once, about the names of the unsaved ones.
 */
export declare function settle<T extends Savable>(tabs: readonly T[], confirm: (names: string[]) => Promise<CloseAnswer>, save: (tab: T) => Promise<boolean>): Promise<boolean>;
/**
 * What the in-page confirm dialog asks before files with unsaved edits close, for a host with no
 * question of its own (`confirmClose`): the Electron app's native wording, with its buttons as
 * CloseAnswers. Save is the answer most people want; Don't Save throws work away.
 */
export declare function closeQuestion(names: readonly string[]): ConfirmOptions;
/** The CloseAnswer a closeQuestion's button id is; anything else is Cancel. */
export declare function closeAnswerOf(id: string): CloseAnswer;
