import type { Session } from 'data-explorer-core';
/** The part of core's session the answer asks. */
export type EditTextSession = Pick<Session, 'editText' | 'valueEditRefusal'>;
/**
 * The answer to the request for `rowId`'s text. `findNode` resolves the row as the source's own
 * edits do; `describe` spells a source id in core's reason as the file's name.
 */
export declare function answerEditTextRequest(session: EditTextSession, findNode: (rowId: string) => any, rowId: string, describe: (text: string) => string): {
    kind: 'editText';
    rowId: string;
    text: string | null;
    reason?: string;
};
