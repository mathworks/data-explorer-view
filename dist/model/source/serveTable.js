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
        case 'sectionRules':
            return { type: 'sectionRules', docUri: change.docUri, rules: change.rules };
        case 'clipboard':
            return { type: 'clipboardState', ...change.state };
        case 'drag':
            return { type: 'dragState', descriptor: change.descriptor };
        case 'select':
            return { type: 'selectRows', rowIds: change.rowIds };
        case 'beginRename':
            return { type: 'beginRename', rowId: change.rowId };
        case 'invalid':
            return { type: 'validationError', reason: change.reason, invalidValue: change.invalidValue, previousValue: change.previousValue };
        case 'refused':
            return { type: 'refused', title: change.title, reason: change.reason };
        case 'editText':
            return {
                type: 'editText',
                rowId: change.rowId,
                text: change.text,
                ...(change.reason === undefined ? {} : { reason: change.reason }),
            };
    }
}
/** The messages of the wire a table's end sends, by type, so that what is not one goes to `extra`. */
const WIRE_CLIENT_TYPES = new Set([
    'ready',
    'select',
    'requestChildren',
    'requestMatrix',
    'edit',
    'copy',
    'cut',
    'delete',
    'paste',
    'addChild',
    'addEntry',
    'undo',
    'redo',
    'dragStart',
    'dragEnd',
    'drop',
    'requestEditText',
]);
/**
 * Answer the table's end of `port` from `source`, until the returned function is called:
 *
 * - `ready` with `setRows` (the source's `open()`), or `error` with why it cannot be shown; after
 *   the `setRows`, the source is told (`opened`), for what it says after a paint;
 * - `requestChildren` with `childRows`, `requestMatrix` with `matrixCells`;
 * - `select` with `showProps` for the selection's first row, or `empty`;
 * - and every change the source makes, as it makes it: `setRows`, `updateEntryRows`,
 *   `insertEntryRows` or `error`, and an editable source's `sectionRules`, `clipboardState`,
 *   `dragState`, `selectRows`, `beginRename`, `validationError`, `refused` and `editText`.
 *
 * An editing message (`edit`, `copy`, `cut`, `delete`, `paste`, `addChild`, `addEntry`, `undo`,
 * `redo`, `dragStart`, `dragEnd`, `drop`, `requestEditText`) is handed to the source's command of
 * the same name, there and then: synchronously, in arrival order, with its fields as the table sent
 * them (the source judges them). A source without the command, a read-only one, is not asked.
 *
 * Any other message goes to `options.extra.receive` when there is one, and is otherwise left
 * alone, for whatever else listens on the port.
 */
export function serveTable(source, port, options = {}) {
    let stopped = false;
    const extra = options.extra;
    const post = (message) => {
        if (!stopped)
            port.postMessage(message);
    };
    const setRows = (view) => ({ type: 'setRows', ...view, ...(extra?.setRows?.(view) ?? {}) });
    // A source's answers are total (TableSource); one that rejects anyway (a source relayed from
    // further away, closed meanwhile) has nothing left to say, and is not told to the port.
    const answer = (question, toMessage) => {
        question.then((value) => post(toMessage(value)), () => { });
    };
    const unsubscribe = source.subscribe((change) => post(change.kind === 'replaceAll' ? setRows(change.view) : changeMessage(change)));
    // The commands, where the source has them. Read once: a source is what it is.
    const editing = source;
    const unlisten = port.onMessage((m) => {
        if (typeof m !== 'object' || m === null)
            return;
        const msg = m;
        if (!WIRE_CLIENT_TYPES.has(msg.type)) {
            extra?.receive?.(msg);
            return;
        }
        switch (msg.type) {
            case 'ready':
                source.open().then((view) => {
                    post(setRows(view));
                    // What the source says after a paint follows the rows it is about.
                    if (!stopped)
                        source.opened?.();
                }, (err) => post({ type: 'error', message: messageOf(err) }));
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
            // The commands: called here, before anything is awaited, with what the table sent.
            case 'edit':
                return editing.edit?.({ rowId: msg.rowId, columnId: msg.columnId, oldValue: msg.oldValue, newValue: msg.newValue });
            case 'copy':
                return editing.copy?.(msg.rowIds);
            case 'cut':
                return editing.cut?.(msg.rowIds);
            case 'delete':
                return editing.delete?.(msg.rowIds);
            case 'paste':
                return editing.paste?.(msg.rowId);
            case 'addChild':
                return editing.addChild?.(msg.rowId);
            case 'addEntry':
                return editing.addEntry?.({ section: msg.section, className: msg.className, rename: msg.rename });
            case 'undo':
                return editing.undo?.();
            case 'redo':
                return editing.redo?.();
            case 'dragStart':
                return editing.dragStart?.(msg.rowIds);
            case 'dragEnd':
                return editing.dragEnd?.();
            case 'drop':
                return editing.drop?.(msg.rowId, msg.mode);
            case 'requestEditText':
                return editing.requestEditText?.(msg.rowId);
        }
    });
    return () => {
        stopped = true;
        unsubscribe();
        unlisten();
    };
}
