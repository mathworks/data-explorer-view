const messageOf = (err) => (err instanceof Error ? err.message : String(err));
function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
/**
 * Answer the page's end of `port` (folderReader) from `folder`, until `dispose()`:
 *
 * - `list` with the folder's files, `folder.files.list()`, which this keeps as the listing, with
 *   `folder.reader(files)` its reader;
 * - `version`, `bytes` and `projectStore` with what that reader answers for the file of the
 *   listing the question names, or null for one it does not hold;
 * - a throw or a rejection with its message, for the page's call to reject with.
 *
 * `changed()` says the folder changed. Any other message is left alone, for whatever else listens
 * on the port (a table's, for one).
 *
 * In Electron's main process, over a `MessageChannelMain` port given to the page:
 * ```ts
 * const served = serveFolder({ files, reader }, {
 *   postMessage: (message) => port.postMessage(message),
 *   onMessage: (listener) => {
 *     const hear = (e: Electron.MessageEvent) => listener(e.data);
 *     port.on('message', hear);
 *     port.start();
 *     return () => port.off('message', hear);
 *   },
 * });
 * watcher.on('change', () => served.changed());
 * ```
 */
export function serveFolder(folder, port, options = {}) {
    let stopped = false;
    // The last listing that answered, and its reader: what each question about a file is answered
    // from. A listing asked before another that has answered already is not kept.
    let listing = null;
    let listsAsked = 0;
    let listKept = 0;
    const post = (message, bytes) => {
        if (stopped)
            return;
        if (bytes && options.transfer)
            port.postMessage(message, [bytes]);
        else
            port.postMessage(message);
    };
    const answer = (id, question) => {
        Promise.resolve()
            .then(question)
            .then((value) => {
            const message = { type: 'folderAnswer', id, value: value ?? null };
            post(message, value instanceof ArrayBuffer ? value : undefined);
        }, (err) => post({ type: 'folderAnswer', id, error: messageOf(err) }));
    };
    const list = async () => {
        const asked = ++listsAsked;
        const files = [...(await folder.files.list())];
        const reader = folder.reader(files);
        if (asked > listKept) {
            listKept = asked;
            listing = { files: new Map(files.map((file) => [file.uriString, file])), reader };
        }
        // Just what the wire carries: a listing's own objects may hold more, and what cannot be cloned.
        return files.map(({ uriString, path }) => ({ uriString, path }));
    };
    const unlisten = port.onMessage((m) => {
        if (!isRecord(m) || m.type !== 'folderRequest' || typeof m.id !== 'number')
            return;
        const { id, ask } = m;
        switch (ask) {
            case 'list':
                return answer(id, list);
            case 'version':
            case 'bytes':
            case 'projectStore': {
                const now = listing;
                const file = typeof m.uri === 'string' ? now?.files.get(m.uri) : undefined;
                return answer(id, async () => (now && file ? now.reader[ask](file) : null));
            }
        }
    });
    return {
        changed() {
            post({ type: 'folderChanged' });
        },
        dispose() {
            stopped = true;
            unlisten();
        },
    };
}
