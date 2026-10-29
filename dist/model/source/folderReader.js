function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
function filesOf(value) {
    if (!Array.isArray(value))
        throw new Error("The folder's host sent no list of its files.");
    return value
        .filter((f) => isRecord(f) && typeof f.uriString === 'string' && typeof f.path === 'string')
        .map(({ uriString, path }) => ({ uriString, path }));
}
function bytesOf(value) {
    if (value instanceof ArrayBuffer)
        return value;
    // A channel that sends a typed array for bytes (Electron's IPC sends a Buffer as a Uint8Array).
    if (ArrayBuffer.isView(value))
        return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
    return null;
}
function storeOf(value) {
    if (!isRecord(value) || Array.isArray(value))
        return null;
    return Object.fromEntries(Object.entries(value).filter(([, text]) => typeof text === 'string'));
}
/**
 * A folder whose files are read by a host across `port` (serveFolder), in the wire format
 * (wire.ts): its `list()` and its reads (`version`, `bytes`, `projectStore`) are questions to the
 * host, and a call rejects with the host's message when its listing or its reader threw. It reads
 * the files of the host's last listing, whichever `files` it is given, so one reader serves every
 * build of a hierarchy:
 *
 * ```ts
 * const folder = folderReader(port);
 * const hierarchy = new FolderHierarchy({ files: folder, reader: () => folder });
 * folder.onChange(() => hierarchy.rebuild());
 * ```
 *
 * `dispose()` stops listening, and rejects what is still waiting.
 */
export function folderReader(port) {
    let lastId = 0;
    let closed = false;
    const waiting = new Map();
    const listeners = new Set();
    const stop = port.onMessage((m) => {
        if (!isRecord(m))
            return;
        if (m.type === 'folderChanged') {
            for (const listener of [...listeners])
                listener();
            return;
        }
        if (m.type !== 'folderAnswer' || typeof m.id !== 'number')
            return;
        const pending = waiting.get(m.id);
        if (!pending)
            return;
        waiting.delete(m.id);
        if (typeof m.error === 'string')
            pending.reject(new Error(m.error));
        else
            pending.resolve(m.value);
    });
    const ask = (what, file) => {
        if (closed)
            return Promise.reject(new Error('This folder reader is closed.'));
        const id = ++lastId;
        const request = { type: 'folderRequest', id, ask: what, ...(file ? { uri: file.uriString } : {}) };
        return new Promise((resolve, reject) => {
            waiting.set(id, { resolve, reject });
            port.postMessage(request);
        });
    };
    return {
        list: async () => filesOf(await ask('list')),
        version: async (file) => {
            const version = await ask('version', file);
            return typeof version === 'string' ? version : null;
        },
        bytes: async (file) => bytesOf(await ask('bytes', file)),
        projectStore: async (file) => storeOf(await ask('projectStore', file)),
        onChange(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        dispose() {
            if (closed)
                return;
            closed = true;
            stop();
            const err = new Error('This folder reader is closed.');
            for (const pending of waiting.values())
                pending.reject(err);
            waiting.clear();
            listeners.clear();
        },
    };
}
