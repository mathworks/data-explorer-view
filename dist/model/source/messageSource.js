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
/**
 * A TableSource answered by a host across `port`, in the wire format (wire.ts).
 *
 * `open()` says `ready` and resolves with the next `setRows` (or rejects with the next `error`);
 * `children()` and `matrix()` ask with `requestChildren` and `requestMatrix`; `inspect()` sends a
 * `select` and resolves with the `showProps` or `empty` that answers it. Every later `setRows`,
 * `updateEntryRows`, `insertEntryRows` and `error` reaches the subscribers as a TableChange.
 *
 * The returned `dispose()` stops listening, and rejects what is still waiting.
 */
export function messageSource(port) {
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
        };
    };
    const stop = port.onMessage((m) => {
        if (!isRecord(m))
            return;
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
