const messageOf = (err) => (err instanceof Error ? err.message : String(err));
/** A change as the message that carries it. */
function changeMessage(change) {
    switch (change.kind) {
        case 'replaceAll':
            return { type: 'setRows', ...change.view };
        case 'updateEntry':
            return { type: 'updateEntryRows', entryRowId: change.entryRowId, rows: change.rows };
        case 'insertEntry':
            return {
                type: 'insertEntryRows',
                sectionRowId: change.sectionRowId,
                ...(change.beforeRowId === undefined ? {} : { beforeRowId: change.beforeRowId }),
                rows: change.rows,
            };
        case 'error':
            return { type: 'error', message: change.message };
    }
}
/**
 * Answer the table's end of `port` from `source`, until the returned function is called:
 *
 * - `ready` with `setRows` (the source's `open()`), or `error` with why it cannot be shown;
 * - `requestChildren` with `childRows`, `requestMatrix` with `matrixCells`;
 * - `select` with `showProps` for the selection's first row, or `empty`;
 * - and every change the source makes, as it makes it: `setRows`, `updateEntryRows`,
 *   `insertEntryRows` or `error`.
 *
 * Any other message is left alone, for whatever else listens on the port.
 */
export function serveTable(source, port) {
    let stopped = false;
    const post = (message) => {
        if (!stopped)
            port.postMessage(message);
    };
    // A source's answers are total (TableSource); one that rejects anyway (a source relayed from
    // further away, closed meanwhile) has nothing left to say, and is not told to the port.
    const answer = (question, toMessage) => {
        question.then((value) => post(toMessage(value)), () => { });
    };
    const unsubscribe = source.subscribe((change) => post(changeMessage(change)));
    const unlisten = port.onMessage((m) => {
        if (typeof m !== 'object' || m === null)
            return;
        const msg = m;
        switch (msg.type) {
            case 'ready':
                source.open().then((view) => post({ type: 'setRows', ...view }), (err) => post({ type: 'error', message: messageOf(err) }));
                return;
            case 'requestChildren':
                if (typeof msg.nodeId !== 'string')
                    return;
                answer(source.children(msg.nodeId), (rows) => ({ type: 'childRows', ...rows }));
                return;
            case 'requestMatrix': {
                const nodeId = typeof msg.nodeId === 'string' ? msg.nodeId : '';
                answer(source.matrix(nodeId), (page) => ({ type: 'matrixCells', ...page }));
                return;
            }
            case 'select': {
                const rowIds = Array.isArray(msg.rowIds) ? msg.rowIds.filter((id) => typeof id === 'string') : [];
                answer(source.inspect(rowIds), (page) => page.rowId === undefined ? { type: 'empty' } : { type: 'showProps', groups: page.groups });
                return;
            }
        }
    });
    return () => {
        stopped = true;
        unsubscribe();
        unlisten();
    };
}
