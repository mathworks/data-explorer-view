import { sortEntries } from '../hierarchy/folderEntries.js';
import { folderFileList } from '../hierarchy/folderList.js';
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
const ENTRY_KINDS = new Set(['folder', 'data', 'other']);
// An entry of another shape is left out, as a listing's file is: a row needs its name, its path
// and what it is. Copied, so what a row keeps is the three fields alone.
function entriesOf(value) {
    if (!Array.isArray(value))
        throw new Error("The folder's host sent no entries of the folder.");
    return sortEntries(value
        .filter((e) => isRecord(e) && typeof e.name === 'string' && typeof e.path === 'string' && ENTRY_KINDS.has(e.kind))
        .map(({ name, path, kind }) => ({ name, path, kind })));
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
 * (wire.ts): its `list()`, its reads (`version`, `bytes`, `projectStore`) and a folder's
 * `entries(dir)` are questions to the host, and a call rejects with the host's message when its
 * listing, its reader or its listing of a folder threw. It reads
 * the files of the host's last listing, whichever `files` it is given, so one reader serves every
 * build of a hierarchy:
 *
 * ```ts
 * const folder = folderReader(portFromMessagePort(port));
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
            // Uris that are not a list are no hint at all: read it all again.
            const uris = Array.isArray(m.uris) ? m.uris.filter((u) => typeof u === 'string') : undefined;
            for (const listener of [...listeners]) {
                if (uris)
                    listener(uris);
                else
                    listener();
            }
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
        else {
            const refused = typeof m.refused === 'string';
            pending.resolve({
                value: refused ? null : m.value,
                truncated: m.truncated === true,
                refused,
                ...(!refused && 'entries' in m ? { entries: { of: m.entries } } : {}),
            });
        }
    });
    // A question names a file (`uri`), or for `entries` a folder (`dir`), or nothing (`list`).
    const ask = (what, about = {}) => {
        if (closed)
            return Promise.reject(new Error('This folder reader is closed.'));
        const id = ++lastId;
        const request = {
            type: 'folderRequest',
            id,
            ask: what,
            ...(about.file ? { uri: about.file.uriString } : {}),
            ...(about.dir !== undefined ? { dir: about.dir } : {}),
        };
        return new Promise((resolve, reject) => {
            waiting.set(id, { resolve, reject });
            port.postMessage(request);
        });
    };
    return {
        list: async () => {
            const { value, truncated } = await ask('list');
            return folderFileList(filesOf(value), truncated);
        },
        version: async (file) => {
            const { value } = await ask('version', { file });
            return typeof value === 'string' ? value : null;
        },
        bytes: async (file) => bytesOf((await ask('bytes', { file })).value),
        projectStore: async (file) => storeOf((await ask('projectStore', { file })).value),
        entries: async (dir) => {
            // No `entries` (a host older than the field answered its listing of files), or refused (a
            // host with no `entries`): the host lists none, which is no failure, but a tree of the
            // index's files alone.
            const { entries } = await ask('list', { dir });
            return entries ? entriesOf(entries.of) : null;
        },
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
