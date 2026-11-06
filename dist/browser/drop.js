// Copyright 2026 The MathWorks, Inc.
//
// What a drop from the OS holds, as the browser host reads it: files and folders. Chromium hands
// a handle for each item (`getAsFileSystemHandle`): a file's reads the file as it is now and may be
// written, like a picked one, and a folder's is listed afresh each time, like one from the
// directory picker. Firefox and Safari hand an entry (`webkitGetAsEntry`): a file is its File, and a
// folder is read through once, at the drop, into the files it holds then, as an
// `<input webkitdirectory>` gives them, up to FOLDER_FILE_LIMIT files. A browser with neither, or a drop with no items, has only
// the drop's Files, among which a folder cannot be told from a file: each is taken for a file, and
// one that is a folder fails to read in its tab.
//
// Everything is asked of the DataTransfer before the first await. Its items can be read only while
// the drop event is being handled (the drag data store is protected once the listener returns),
// while the promises and entries they hand out live on; so dropSources is called from the drop
// listener itself, as installFileDrop calls its `drop`, and not after anything is awaited.
import { FOLDER_FILE_LIMIT, skipDirectory } from './walk.js';
/**
 * The files and folders of a drop, in the order they were dropped. Call it from the drop's
 * listener (see the file's header): what the drop holds is asked for at once, and read after. A
 * folder read through its entries stops at `limit` files, and says it did (BrowserDir `truncated`).
 */
export function dropSources(data, limit = FOLDER_FILE_LIMIT) {
    const items = Array.from(data.items ?? []).filter((item) => item.kind === 'file');
    if (items.length === 0) {
        return Promise.resolve(Array.from(data.files, (file) => ({ kind: 'file', name: file.name, source: { kind: 'file', file } })));
    }
    const asked = items.map((item) => ({
        handle: item.getAsFileSystemHandle?.(),
        entry: item.webkitGetAsEntry?.() ?? null,
        file: item.getAsFile(),
    }));
    return Promise.all(asked.map((item) => readItem(item, limit))).then((all) => all.filter((item) => item !== null));
}
/** What one item is: through its handle where there is one, else its entry, else its File. */
async function readItem({ handle, entry, file }, limit) {
    // A handle the browser would not give (a drop from another page, say) leaves the entry and the File.
    const h = handle ? await handle.catch(() => null) : null;
    if (h?.kind === 'directory')
        return { kind: 'folder', dir: { kind: 'handle', handle: h } };
    if (h?.kind === 'file')
        return { kind: 'file', name: h.name, source: { kind: 'handle', handle: h } };
    if (entry?.isDirectory) {
        const read = { files: [], truncated: false, limit };
        await entryFiles(entry, '', read);
        return { kind: 'folder', dir: { kind: 'list', root: entry.name, files: read.files, truncated: read.truncated } };
    }
    return file ? { kind: 'file', name: file.name, source: { kind: 'file', file } } : null;
}
const fileOf = (entry) => new Promise((resolve, reject) => entry.file(resolve, reject)).catch(() => null);
/**
 * The files under the directory entry `dir` into `read`, each by its path in the dropped folder
 * (`prefix` the path of `dir` in it), until `read.limit` files are read and one more is found,
 * which sets `truncated`. A directory the listing would not enter is not read at all: a
 * node_modules can hold more files than the rest of the folder. One that cannot be read, or a file
 * that cannot, is passed over, as listDirectory passes over a directory it cannot read.
 */
async function entryFiles(dir, prefix, read) {
    const reader = dir.createReader();
    // readEntries answers a batch at a time (Chromium's are 100 long), and an empty one at the end.
    for (;;) {
        let batch;
        try {
            batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        }
        catch {
            return;
        }
        if (batch.length === 0)
            return;
        // A batch's files are asked for together; its directories are walked one at a time after, so
        // the walk stops where the limit falls.
        const entries = batch.filter((entry) => entry.isFile);
        const files = await Promise.all(entries.map(fileOf));
        for (const [i, file] of files.entries()) {
            if (!file)
                continue;
            if (read.files.length === read.limit) {
                read.truncated = true;
                return;
            }
            read.files.push({ rel: prefix + entries[i].name, file });
        }
        for (const entry of batch) {
            if (!entry.isDirectory || skipDirectory(entry.name))
                continue;
            await entryFiles(entry, `${prefix}${entry.name}/`, read);
            if (read.truncated)
                return;
        }
    }
}
