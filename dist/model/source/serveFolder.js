const messageOf = (err) => (err instanceof Error ? err.message : String(err));
/** The one reason a question is refused: it names nothing the host listed. */
const NOT_LISTED = 'Not a file of the folder.';
function isRecord(x) {
    return typeof x === 'object' && x !== null;
}
/**
 * Answer the page's end of `port` (folderReader) from `folder`, until `dispose()`:
 *
 * - `list` with the folder's files, `folder.files.list()`, which this keeps as the listing, with
 *   `folder.reader(files)` its reader, and `truncated` when the listing says it was cut short;
 * - `version`, `bytes` and `projectStore` with what that reader answers for the file of the
 *   listing whose uriString is the question's `uri`, exactly, given the listing's own SourceFile;
 * - every other question about a file `refused`, with nothing read: a uri the listing does not
 *   hold (outside the folder, with `..`, a look-alike prefix, another scheme or spelling), none,
 *   one asked before any listing, an `ask` the wire does not have;
 * - a throw or a rejection with its message, for the page's call to reject with.
 *
 * The page is not trusted: what reaches the reader is only ever a file the folder listed, so a
 * reader that trusts its caller's SourceFile (core's reads its `path`) is never handed the page's.
 * A project store is whatever the reader's `projectStore` answers for a listed file, which need
 * not be a project's marker: a reader decides which files have a store, and one that reads the
 * folder beside any file it is given lets the page read that much.
 *
 * `changed(uris?)` says the folder changed. Any other message is left alone, for whatever else
 * listens on the port (a table's, for one).
 *
 * In Electron's main process, over a `MessageChannelMain` port given to the page (README, "Serve a
 * folder from Electron's main process"):
 * ```ts
 * const served = serveFolder(
 *   { files: { list: async () => listedFiles(await listFolder(root)) }, reader },
 *   portFromMainPort(port1),
 * );
 * watchFolder(root, (paths) => served.changed(paths?.map(sourceUri))); // core's node/folder
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
    // The fields a question's answer carries: its value, and for a listing cut short `truncated`.
    const answer = (id, question) => {
        Promise.resolve()
            .then(question)
            .then(({ value, ...more }) => {
            const message = { type: 'folderAnswer', id, value: value ?? null, ...more };
            post(message, value instanceof ArrayBuffer ? value : undefined);
        }, (err) => post({ type: 'folderAnswer', id, error: messageOf(err) }));
    };
    const list = async () => {
        const asked = ++listsAsked;
        const listed = await folder.files.list();
        // Read before the copy, which does not keep it.
        const truncated = listed.truncated === true;
        const files = [...listed];
        const reader = folder.reader(files);
        if (asked > listKept) {
            listKept = asked;
            listing = { files: new Map(files.map((file) => [file.uriString, file])), reader };
        }
        // Just what the wire carries: a listing's own objects may hold more, and what cannot be cloned.
        return { files: files.map(({ uriString, path }) => ({ uriString, path })), truncated };
    };
    const refuse = (id) => post({ type: 'folderAnswer', id, refused: NOT_LISTED });
    const unlisten = port.onMessage((m) => {
        if (!isRecord(m) || m.type !== 'folderRequest' || typeof m.id !== 'number')
            return;
        const { id, ask } = m;
        switch (ask) {
            case 'list':
                return answer(id, async () => {
                    const { files, truncated } = await list();
                    return truncated ? { value: files, truncated: true } : { value: files };
                });
            case 'version':
            case 'bytes':
            case 'projectStore': {
                // The listing's own file, by an exact match of its uri: no other is ever read.
                const now = listing;
                const file = typeof m.uri === 'string' ? now?.files.get(m.uri) : undefined;
                if (!now || !file)
                    return refuse(id);
                return answer(id, async () => ({ value: await now.reader[ask](file) }));
            }
            default:
                return refuse(id);
        }
    });
    return {
        changed(uris) {
            post(uris ? { type: 'folderChanged', uris: [...uris] } : { type: 'folderChanged' });
        },
        dispose() {
            stopped = true;
            unlisten();
        },
    };
}
