// Copyright 2026 The MathWorks, Inc.
//
// Copied from data-explorer-vscode src/host/editTextRequest.ts at c73da3c, with core's session
// passed in rather than read from core's module-level one, and the answer an `editText` change
// returned rather than a message posted. The extension keeps its own copy until its editors move
// onto view's sources; keep the two alike (view's CI reports a vscode commit to that file).
//
// The answer to a table's `requestEditText`: the whole text of a Value the row shows as a summary
// for its size, which seeds the editor the user is opening (core's editText). The row carries only
// a marker that there is one (`_hasEditText`): the text can run to 200,000 characters, and a file
// of a thousand long values would send it a thousand times with every repaint. Null where there is
// none any more (the value changed under the request), with core's reason where it gives one
// (valueEditRefusal). Said alike by every editable table.
import type { Session } from 'data-explorer-core';

/** The part of core's session the answer asks. */
export type EditTextSession = Pick<Session, 'editText' | 'valueEditRefusal'>;

/**
 * The answer to the request for `rowId`'s text. `findNode` resolves the row as the source's own
 * edits do; `describe` spells a source id in core's reason as the file's name.
 */
export function answerEditTextRequest(
  session: EditTextSession,
  findNode: (rowId: string) => any,
  rowId: string,
  describe: (text: string) => string,
): { kind: 'editText'; rowId: string; text: string | null; reason?: string } {
  const node = findNode(rowId);
  const text = node ? session.editText(node.id) : null;
  const reason = text === null && node ? session.valueEditRefusal(node.id) : null;
  return { kind: 'editText', rowId, text, ...(reason ? { reason: describe(reason) } : {}) };
}
