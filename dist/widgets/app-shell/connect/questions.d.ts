import type { ConfirmOptions, DexConfirmDialog, PromptOptions } from '../dex-confirm-dialog.js';
import type { CloseAnswer, ShellHost } from './types.js';
/** The in-page questions, as connectShell asks them. */
export interface Questions {
    /** Ask `question` once the questions before it are answered, unless `still` says by then it need not be: its answer's id. */
    ask(question: ConfirmOptions, still?: () => boolean): Promise<string>;
    /** Ask for a line of text in the dialog (its prompt), once the questions before it are answered: the text, or null. */
    prompt(options: PromptOptions): Promise<string | null>;
    /** Something closed: the question up, if `still` now says it need not be asked, goes, answered with its cancel. */
    recheck(): void;
}
/** Questions asked in `dialog`; `beforeAsking` runs as each is shown (the shell closes its popovers then). */
export declare function inPageQuestions(dialog: DexConfirmDialog, beforeAsking: () => void): Questions;
/**
 * The shell's two questions: the host's own where it has them (a native dialog), the in-page ones
 * where it has none. The answer to a reload question is said in the Log (`log`): reloaded, the
 * edits are gone; kept, the next save writes over the other program's change, which is worth a
 * warning. A reload question that waits its turn is dropped for a tab no longer `open`.
 */
export declare function shellPrompts<T extends {
    name: string;
}>(host: ShellHost, questions: Questions, options: {
    open(tab: T): boolean;
    log(level: 'info' | 'warning', message: string): void;
}): {
    confirmClose(names: string[]): Promise<CloseAnswer>;
    confirmReload(tab: T): Promise<boolean>;
};
