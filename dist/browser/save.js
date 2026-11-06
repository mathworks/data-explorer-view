// Copyright 2026 The MathWorks, Inc.
//
// Saving in a browser. A file the page reads through a handle (Chromium's pickers, a shown folder's
// handle, a drop there) is written in place, once the user lets the page write it: the browser
// writes a temporary file and moves it over the old one when the stream closes, as core's safe write
// does on the desktop. A file the page has only as a File (Firefox, Safari, a drop with no handles)
// or as bytes (the app's own, a new file the page keeps) cannot be written in place, so its Save is a
// download under its name, and so is Save As with no save picker. A download marks the document
// saved, since the user has the file; the page reads the file as it downloaded it from then on, so
// the tab, and the file opened again, show what was saved, and the shell says the file was
// downloaded rather than saved. The messages are the user's to read: connectShell shows a save's
// rejection in its dialog.
//
// Lifted from data-explorer-app src/web/save.ts at b13a860.
import { extOf } from 'data-explorer-core';
import { pickedNothing, wantedGesture } from './fsAccess.js';
/** How long a download's URL is kept: the browser reads it after the click, not during it. */
export const REVOKE_MS = 60_000;
/**
 * Write `bytes` over the open file `path`, in place, or, for a file the page has no handle to, hand
 * them to the browser as a download under its name (made in `document`), which the page then holds
 * as the file.
 */
export async function saveFile(files, path, bytes, document) {
    const file = files.get(path);
    if (!file)
        throw new Error('Not a file this page has open.');
    if (file.source.kind !== 'handle')
        return downloaded(files, path, bytes, document);
    await askToWrite(file.source.handle, file.name);
    await write(file.source.handle, bytes);
    // The browser does not say whether another program wrote the file after this write: none is known to.
    return { overwritten: false };
}
/**
 * Write the open file `path`'s `bytes` where the user says, a file of its own kind: the path
 * written (`path` itself for a Save As onto it), or null when the user cancels. With no save picker
 * the bytes are downloaded, as a Save of a file with no handle is, and the answer is `path`: the
 * user has the file, so the document is saved.
 */
export async function saveFileAs(files, path, bytes, deps) {
    const name = files.get(path)?.name ?? path.slice(path.lastIndexOf('/') + 1);
    if (!deps.window.showSaveFilePicker)
        return { path, ...downloaded(files, path, bytes, deps.document) };
    const ext = extOf(name);
    let handle;
    try {
        handle = await deps.window.showSaveFilePicker({
            suggestedName: name,
            types: ext ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { 'application/octet-stream': [ext] } }] : undefined,
        });
    }
    catch (err) {
        if (pickedNothing(err))
            return null;
        if (wantedGesture(err))
            throw new Error('The browser shows its save dialog only after a click or a key press. Use Save As again from one.');
        throw err;
    }
    // The save picker's handle may be written: the user chose it to be.
    await write(handle, bytes);
    // A file the page has a path for (the open file itself, or another it has open) keeps it, and is
    // read from now on through the handle the page may write; any other is a new file.
    const known = await files.pathOf(handle);
    if (known)
        files.replace(known, { kind: 'handle', handle });
    return { path: known ?? (await files.addPicked(handle.name, { kind: 'handle', handle })), overwritten: false };
}
/** Leave to write `handle`, the file `name`, asked of the user if the page has none; the browser keeps a yes. */
async function askToWrite(handle, name) {
    const h = handle;
    const mode = { mode: 'readwrite' };
    // A browser without the calls decides in createWritable.
    if (!h.queryPermission || !h.requestPermission || (await h.queryPermission(mode)) === 'granted')
        return;
    let answer;
    try {
        answer = await h.requestPermission(mode);
    }
    catch (err) {
        // Asked with no click or key press leading to it: a save as the page closes, say.
        if (wantedGesture(err)) {
            throw new Error(`The browser asks about writing ${name} only after a click or a key press. Save again from a click or a key press, or use Save As.`);
        }
        throw err;
    }
    if (answer !== 'granted')
        throw new Error(`The browser was not allowed to write ${name}. Use Save As.`);
}
async function write(handle, bytes) {
    const stream = await handle.createWritable();
    try {
        // A document's bytes are never shared memory, which the DOM's types allow and a write does not.
        await stream.write(bytes);
        await stream.close();
    }
    catch (err) {
        // The file keeps what it held: the browser drops the temporary file.
        await stream.abort().catch(() => undefined);
        throw err;
    }
}
/**
 * The open file `path`'s `bytes` handed to the browser as a download under its name, and held by the
 * page as the file from now on: what it reads of it is what was saved.
 */
function downloaded(files, path, bytes, document) {
    download(document, files.get(path)?.name ?? path.slice(path.lastIndexOf('/') + 1), bytes);
    files.replace(path, { kind: 'bytes', bytes: bytes.slice() });
    return { overwritten: false, downloaded: true };
}
/** Hand `bytes` to the browser as a download named `name`. */
export function download(document, name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}
