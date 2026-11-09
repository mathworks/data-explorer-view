// Copyright 2026 The MathWorks, Inc.
//
// Saving in a browser. A file the page reads through a handle (Chromium's pickers, a shown folder's
// handle, a drop there) is written in place, once the user lets the page write it: the browser
// writes a temporary file and moves it over the old one when the stream closes, as core's safe write
// does on the desktop. A file the page has only as a File (Firefox, Safari) may be read and not
// written, so Save says to use Save As, which there downloads the bytes. The messages are the user's
// to read: connectShell shows a save's rejection in its dialog.
//
// Lifted from data-explorer-app src/web/save.ts at b13a860.

import { extOf } from 'data-explorer-core';
import { pickedNothing, wantedGesture, type FilePickers, type HandlePermissions } from './fsAccess.js';
import type { WebFiles } from './files.js';

/** The window and document a save is made in. */
export interface SaveDeps {
  /** Where the save picker is looked for. */
  window: FilePickers;
  /** Where a download's link is made, when there is no save picker. */
  document: Document;
}

/** How long a download's URL is kept: the browser reads it after the click, not during it. */
export const REVOKE_MS = 60_000;

/** Write `bytes` over the open file `path`, in place. */
export async function saveFile(files: WebFiles, path: string, bytes: Uint8Array): Promise<{ overwritten: boolean }> {
  const file = files.get(path);
  if (!file) throw new Error('Not a file this page has open.');
  if (file.source.kind !== 'handle') {
    throw new Error(`The browser lets the page read ${file.name} but not write it in place. Use Save As.`);
  }
  await askToWrite(file.source.handle, file.name);
  await write(file.source.handle, bytes);
  // The browser does not say whether another program wrote the file after this write: none is known to.
  return { overwritten: false };
}

/**
 * Write the open file `path`'s `bytes` where the user says, a file of its own kind: the path
 * written (`path` itself for a Save As onto it), or null when the user cancels. With no save picker
 * the bytes are downloaded, and the answer is `path`: the user has the file, so the document is saved.
 */
export async function saveFileAs(
  files: WebFiles,
  path: string,
  bytes: Uint8Array,
  deps: SaveDeps,
): Promise<{ path: string; overwritten: boolean } | null> {
  const name = files.get(path)?.name ?? path.slice(path.lastIndexOf('/') + 1);
  if (!deps.window.showSaveFilePicker) {
    download(deps.document, name, bytes);
    return { path, overwritten: false };
  }
  const ext = extOf(name);
  let handle: FileSystemFileHandle;
  try {
    handle = await deps.window.showSaveFilePicker({
      suggestedName: name,
      types: ext ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { 'application/octet-stream': [ext] } }] : undefined,
    });
  } catch (err) {
    if (pickedNothing(err)) return null;
    if (wantedGesture(err)) throw new Error('The browser shows its save dialog only after a click or a key press. Use Save As again from one.');
    throw err;
  }
  // The save picker's handle may be written: the user chose it to be.
  await write(handle, bytes);
  // A file the page has a path for (the open file itself, or another it has open) keeps it, and is
  // read from now on through the handle the page may write; any other is a new file.
  const known = await files.pathOf(handle);
  if (known) files.replace(known, { kind: 'handle', handle });
  return { path: known ?? (await files.addPicked(handle.name, { kind: 'handle', handle })), overwritten: false };
}

/** Leave to write `handle`, the file `name`, asked of the user if the page has none; the browser keeps a yes. */
async function askToWrite(handle: FileSystemFileHandle, name: string): Promise<void> {
  const h = handle as FileSystemFileHandle & HandlePermissions;
  const mode = { mode: 'readwrite' } as const;
  // A browser without the calls decides in createWritable.
  if (!h.queryPermission || !h.requestPermission || (await h.queryPermission(mode)) === 'granted') return;
  let answer: PermissionState;
  try {
    answer = await h.requestPermission(mode);
  } catch (err) {
    // Asked with no click or key press leading to it: a save as the page closes, say.
    if (wantedGesture(err)) {
      throw new Error(`The browser asks about writing ${name} only after a click or a key press. Save again from a click or a key press, or use Save As.`);
    }
    throw err;
  }
  if (answer !== 'granted') throw new Error(`The browser was not allowed to write ${name}. Use Save As.`);
}

async function write(handle: FileSystemFileHandle, bytes: Uint8Array): Promise<void> {
  const stream = await handle.createWritable();
  try {
    // A document's bytes are never shared memory, which the DOM's types allow and a write does not.
    await stream.write(bytes as Uint8Array<ArrayBuffer>);
    await stream.close();
  } catch (err) {
    // The file keeps what it held: the browser drops the temporary file.
    await stream.abort().catch(() => undefined);
    throw err;
  }
}

/** Hand `bytes` to the browser as a download named `name`. */
function download(document: Document, name: string, bytes: Uint8Array): void {
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
}
