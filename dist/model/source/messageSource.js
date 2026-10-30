function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
const COULD_NOT_READ = 'This value could not be read as a table.';
/** The answer a matrix request gets from a `matrixCells`: its cells, or why there are none. */
function matrixPage(nodeId, m) {
    return isRecord(m.matrix)
        ? { nodeId, matrix: m.matrix }
        : { nodeId, message: typeof m.message === 'string' ? m.message : COULD_NOT_READ };
}
/** First asked, first answered, per node id. */
class Waiting {
    constructor() {
        this.byId = new Map();
    }
    add(id) {
        return new Promise((resolve, reject) => {
            const list = this.byId.get(id) ?? [];
            list.push({ resolve, reject });
            this.byId.set(id, list);
        });
    }
    take(id) {
        const list = this.byId.get(id);
        const first = list?.shift();
        if (list && list.length === 0)
            this.byId.delete(id);
        return first;
    }
    rejectAll(err) {
        for (const list of this.byId.values())
            for (const p of list)
                p.reject(err);
        this.byId.clear();
    }
}
/** A rule's or a list's items that are records, the only ones a table can read a fact from. */
const records = (list) => list.filter(isRecord);
/** The host's clipboard as a `clipboard` change carries it, from a `clipboardState`, in the order the extension's host spells it. */
function clipboardStatus(m) {
    return {
        canPaste: !!m.canPaste,
        mode: m.mode === 'cut' || m.mode === 'copy' ? m.mode : null,
        ...(typeof m.sourceDocUri === 'string' ? { sourceDocUri: m.sourceDocUri } : {}),
        items: Array.isArray(m.items) ? records(m.items) : [],
    };
}
/** The drag a `dragState` says is in flight, or null: no drag, or one whose items are not a list. */
function dragDescriptor(d) {
    return isRecord(d) && Array.isArray(d.items) ? { ...d, items: records(d.items) } : null;
}
/** The messages of the wire this source hears, by type, so that what is not one goes to `extra`. */
const WIRE_HOST_TYPES = new Set([
    'setRows',
    'error',
    'updateEntryRows',
    'insertEntryRows',
    'childRows',
    'matrixCells',
    'showProps',
    'empty',
    'sectionRules',
    'clipboardState',
    'dragState',
    'selectRows',
    'beginRename',
    'validationError',
    'refused',
    'editText',
]);
/**
 * A TableSource answered by a host across `port`, in the wire format (wire.ts), which also takes
 * edits.
 *
 * `open()` says `ready` and resolves with the next `setRows` (or rejects with the next `error`);
 * `children()` and `matrix()` ask with `requestChildren` and `requestMatrix`; `inspect()` sends a
 * `select` and resolves with the `showProps` or `empty` that answers it. Every later `setRows`,
 * `updateEntryRows`, `insertEntryRows` and `error` reaches the subscribers as a TableChange.
 *
 * Each command posts its editing message at once (`edit()` an `edit`, `undo()` an `undo`), and
 * each editing message the host sends reaches the subscribers as the change it carries:
 * `sectionRules`, `clipboardState` (a `clipboard`), `dragState` (a `drag`), `selectRows` (a
 * `select`), `beginRename`, `validationError` (an `invalid`), `refused` and `editText`.
 *
 * The returned `dispose()` stops listening, and rejects what is still waiting.
 */
export function messageSource(port, options = {}) {
    let docUri = '';
    const opens = [];
    const children = new Waiting();
    const matrices = new Waiting();
    const inspects = [];
    const listeners = new Set();
    const emit = (change) => {
        for (const listener of [...listeners])
            listener(change);
    };
    /** The table and its host are out of step: ask for the whole table, which arrives as a change. */
    const resync = () => port.postMessage({ type: 'ready' });
    const viewOf = (m) => {
        // A host that leaves the uri out keeps the one it gave before.
        if (typeof m.docUri === 'string')
            docUri = m.docUri;
        return {
            docUri,
            rows: Array.isArray(m.rows) ? m.rows : [],
            columns: Array.isArray(m.columns) ? m.columns : [],
            columnLabels: isRecord(m.columnLabels) ? m.columnLabels : {},
            columnGroups: isRecord(m.columnGroups) ? m.columnGroups : {},
            editable: !!m.editable,
            ...(typeof m.notice === 'string' ? { notice: m.notice } : {}),
            ...(isRecord(m.warnings) ? { warnings: m.warnings } : {}),
            // A list of classes, and only the names in it: anything else is no list, every tile.
            ...(isRecord(m.add) && Array.isArray(m.add.classes)
                ? { add: { classes: m.add.classes.filter((c) => typeof c === 'string') } }
                : {}),
        };
    };
    /** Send a command: nothing waits for an answer. */
    const send = (message) => port.postMessage(message);
    const stop = port.onMessage((m) => {
        if (!isRecord(m))
            return;
        if (!WIRE_HOST_TYPES.has(m.type)) {
            options.extra?.(m);
            return;
        }
        switch (m.type) {
            case 'setRows': {
                const view = viewOf(m);
                const open = opens.shift();
                if (open)
                    open.resolve(view);
                else
                    emit({ kind: 'replaceAll', view });
                return;
            }
            case 'error': {
                const message = typeof m.message === 'string' ? m.message : String(m.message);
                const open = opens.shift();
                if (open)
                    open.reject(new Error(message));
                else
                    emit({ kind: 'error', message });
                return;
            }
            case 'updateEntryRows':
                // Rows that are not a list are not "no rows", which would remove the entry.
                if (typeof m.entryRowId !== 'string' || !Array.isArray(m.rows))
                    return resync();
                return emit({ kind: 'updateEntry', entryRowId: m.entryRowId, rows: m.rows });
            case 'insertEntryRows':
                if (typeof m.sectionRowId !== 'string' || !Array.isArray(m.rows))
                    return resync();
                return emit({
                    kind: 'insertEntry',
                    sectionRowId: m.sectionRowId,
                    ...(typeof m.beforeRowId === 'string' ? { beforeRowId: m.beforeRowId } : {}),
                    rows: m.rows,
                });
            case 'childRows': {
                // Rows that are not a list are no answer at all, not "no children".
                if (typeof m.nodeId !== 'string' || !Array.isArray(m.rows))
                    return;
                const truncated = typeof m.truncated === 'number' ? m.truncated : 0;
                children.take(m.nodeId)?.resolve({ nodeId: m.nodeId, rows: m.rows, truncated });
                return;
            }
            case 'matrixCells':
                if (typeof m.nodeId !== 'string')
                    return;
                matrices.take(m.nodeId)?.resolve(matrixPage(m.nodeId, m));
                return;
            case 'showProps':
            case 'empty': {
                const asked = inspects.shift();
                if (!asked)
                    return;
                const groups = m.type === 'showProps' && Array.isArray(m.groups) ? m.groups : [];
                asked.pending.resolve(m.type === 'showProps' && asked.first !== undefined ? { rowId: asked.first, groups } : { groups });
                return;
            }
            case 'sectionRules':
                // A host that leaves the uri out means the document it has shown.
                if (typeof m.docUri === 'string')
                    docUri = m.docUri;
                return emit({ kind: 'sectionRules', docUri, rules: Array.isArray(m.rules) ? records(m.rules) : [] });
            case 'clipboardState':
                return emit({ kind: 'clipboard', state: clipboardStatus(m) });
            case 'dragState':
                return emit({ kind: 'drag', descriptor: dragDescriptor(m.descriptor) });
            case 'selectRows':
                return emit({ kind: 'select', rowIds: Array.isArray(m.rowIds) ? m.rowIds.filter((id) => typeof id === 'string') : [] });
            case 'beginRename':
                if (typeof m.rowId !== 'string')
                    return;
                return emit({ kind: 'beginRename', rowId: m.rowId });
            case 'validationError':
                return emit({ kind: 'invalid', reason: String(m.reason ?? ''), invalidValue: m.invalidValue, previousValue: m.previousValue });
            case 'refused':
                return emit({ kind: 'refused', title: String(m.title ?? ''), reason: String(m.reason ?? '') });
            case 'editText':
                if (typeof m.rowId !== 'string')
                    return;
                return emit({
                    kind: 'editText',
                    rowId: m.rowId,
                    text: typeof m.text === 'string' ? m.text : null,
                    ...(typeof m.reason === 'string' ? { reason: m.reason } : {}),
                });
        }
    });
    return {
        open() {
            return new Promise((resolve, reject) => {
                opens.push({ resolve, reject });
                port.postMessage({ type: 'ready' });
            });
        },
        children(rowId) {
            const answer = children.add(rowId);
            port.postMessage({ type: 'requestChildren', nodeId: rowId });
            return answer;
        },
        matrix(nodeId) {
            const answer = matrices.add(nodeId);
            port.postMessage({ type: 'requestMatrix', nodeId });
            return answer;
        },
        inspect(selection) {
            const rowIds = typeof selection === 'string' ? [selection] : [...selection];
            return new Promise((resolve, reject) => {
                inspects.push({ first: rowIds[0], pending: { resolve, reject } });
                port.postMessage({ type: 'select', rowIds });
            });
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        edit({ rowId, columnId, oldValue, newValue }) {
            send({ type: 'edit', rowId, columnId, oldValue, newValue });
        },
        copy(rowIds) {
            send({ type: 'copy', rowIds: [...rowIds] });
        },
        cut(rowIds) {
            send({ type: 'cut', rowIds: [...rowIds] });
        },
        delete(rowIds) {
            send({ type: 'delete', rowIds: [...rowIds] });
        },
        paste(rowId) {
            send({ type: 'paste', rowId });
        },
        addChild(rowId) {
            send({ type: 'addChild', rowId });
        },
        addEntry({ section, className, rename }) {
            send({ type: 'addEntry', section, className, rename });
        },
        undo() {
            send({ type: 'undo' });
        },
        redo() {
            send({ type: 'redo' });
        },
        dragStart(rowIds) {
            send({ type: 'dragStart', rowIds: [...rowIds] });
        },
        dragEnd() {
            send({ type: 'dragEnd' });
        },
        drop(rowId, mode) {
            send({ type: 'drop', rowId, mode });
        },
        requestEditText(rowId) {
            send({ type: 'requestEditText', rowId });
        },
        dispose() {
            stop();
            const closed = new Error('This source is closed.');
            for (const open of opens.splice(0))
                open.reject(closed);
            for (const asked of inspects.splice(0))
                asked.pending.reject(closed);
            children.rejectAll(closed);
            matrices.rejectAll(closed);
            listeners.clear();
        },
    };
}
/**
 * The pages a host sends a property inspector across `port`, in the wire format: each `showProps`
 * and `empty` is a page, and a matrix is asked for with `requestMatrix`. Its first listener says
 * `ready`, which asks the host for what the inspector shows now.
 *
 * For an inspector whose host follows a table elsewhere (another page, another webview); an
 * inspector beside its table follows the table's handle instead.
 */
export function inspectorFeed(port) {
    const listeners = new Set();
    const matrices = new Waiting();
    let ready = false;
    const stop = port.onMessage((m) => {
        if (!isRecord(m))
            return;
        if (m.type === 'showProps' || m.type === 'empty') {
            const view = { groups: m.type === 'showProps' && Array.isArray(m.groups) ? m.groups : [] };
            for (const listener of [...listeners])
                listener(view);
        }
        else if (m.type === 'matrixCells' && typeof m.nodeId === 'string') {
            matrices.take(m.nodeId)?.resolve(matrixPage(m.nodeId, m));
        }
    });
    return {
        onPage(listener) {
            listeners.add(listener);
            if (!ready) {
                ready = true;
                port.postMessage({ type: 'ready' });
            }
            return () => void listeners.delete(listener);
        },
        matrix(nodeId) {
            const answer = matrices.add(nodeId);
            port.postMessage({ type: 'requestMatrix', nodeId });
            return answer;
        },
        dispose() {
            stop();
            matrices.rejectAll(new Error('This feed is closed.'));
            listeners.clear();
        },
    };
}
