/**
 * The answer to the request for `rowId`'s text. `findNode` resolves the row as the source's own
 * edits do; `describe` spells a source id in core's reason as the file's name.
 */
export function answerEditTextRequest(session, findNode, rowId, describe) {
    const node = findNode(rowId);
    const text = node ? session.editText(node.id) : null;
    const reason = text === null && node ? session.valueEditRefusal(node.id) : null;
    return { kind: 'editText', rowId, text, ...(reason ? { reason: describe(reason) } : {}) };
}
