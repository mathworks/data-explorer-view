// Copyright 2026 The MathWorks, Inc.
//
// Choosing files and folders in a browser: Chromium's pickers, which give handles the page reads
// again and may write, or elsewhere a hidden file input, whose Files refer to the picked files.
// Picked files are registered in WebFiles and named by the paths it gives them. A browser shows a
// file dialog only for a click or a key press: asked at another time, a picker rejects, and an
// input's dialog never opens (its promise would never settle, and the input would stay in the
// page), so neither is asked then, and the user is told why.
//
// Lifted from data-explorer-app src/web/pick.ts at b13a860; a listed folder's files now carry
// their path in it (walk.ts ListedFile).

import { SUPPORTED_EXTS } from 'data-explorer-core';
import { pickedNothing, wantedGesture, type FilePickers, type UserActivation } from './fsAccess.js';
import type { WebFiles } from './files.js';
import type { BrowserDir } from './walk.js';

/** The extensions the pickers offer: those core reads, as a desktop app's Open dialog offers them. */
export const SUPPORTED = SUPPORTED_EXTS.map((ext) => `.${ext}`);

/** The window and document the pickers are shown in, and whether a click or a key press led here. */
export interface PickDeps {
  /** Where the pickers are looked for. */
  window: FilePickers;
  /** Where a file input is made, when there is no picker. */
  document: Document;
  /** Whether a click or a key press led here. Absent, or without `userActivation`: the browser decides. */
  navigator?: UserActivation;
}

const noGesture = (what: string): Error =>
  new Error(`The browser shows its file dialog only after a click or a key press. Open the ${what} again from one.`);

/** Ask for files to open: their paths, none when the user cancels. */
export async function pickFiles(files: WebFiles, deps: PickDeps): Promise<string[]> {
  if (deps.navigator?.userActivation?.isActive === false) throw noGesture('file');
  if (!deps.window.showOpenFilePicker) {
    const chosen = await chooseWithInput(deps.document, (input) => {
      input.multiple = true;
      input.accept = SUPPORTED.join(',');
    });
    return files.addPick(chosen.map((file) => ({ name: file.name, source: { kind: 'file', file } })));
  }
  let handles: FileSystemFileHandle[];
  try {
    handles = await deps.window.showOpenFilePicker({
      multiple: true,
      types: [{ description: 'Simulink data files', accept: { 'application/octet-stream': SUPPORTED } }],
    });
  } catch (err) {
    if (pickedNothing(err)) return [];
    if (wantedGesture(err)) throw noGesture('file');
    throw err;
  }
  return files.addPick(handles.map((handle) => ({ name: handle.name, source: { kind: 'handle', handle } })));
}

/** Ask for a folder to show; null when the user cancels. */
export async function pickDirectory(deps: PickDeps): Promise<BrowserDir | null> {
  if (deps.navigator?.userActivation?.isActive === false) throw noGesture('folder');
  if (!deps.window.showDirectoryPicker) {
    const chosen = await chooseWithInput(deps.document, (input) => {
      input.webkitdirectory = true;
    });
    // Each file's path starts with the folder's name. A folder with no files in it gives none, and
    // nothing to show.
    const root = chosen[0]?.webkitRelativePath.split('/')[0];
    if (!root) return null;
    return { kind: 'list', root, files: chosen.map((file) => ({ rel: file.webkitRelativePath.split('/').slice(1).join('/'), file })) };
  }
  try {
    return { kind: 'handle', handle: await deps.window.showDirectoryPicker() };
  } catch (err) {
    if (pickedNothing(err)) return null;
    if (wantedGesture(err)) throw noGesture('folder');
    throw err;
  }
}

/**
 * Show the dialog of a hidden file input set up by `set`: the files chosen, none when it is
 * cancelled. A browser without the input's `cancel` event (Safari before 16.4) never says it was;
 * the promise then waits, holding nothing but the input.
 */
function chooseWithInput(document: Document, set: (input: HTMLInputElement) => void): Promise<File[]> {
  const input = document.createElement('input');
  input.type = 'file';
  input.hidden = true;
  set(input);
  return new Promise((resolve) => {
    const done = (chosen: File[]) => {
      input.remove();
      resolve(chosen);
    };
    input.addEventListener('change', () => done([...(input.files ?? [])]), { once: true });
    input.addEventListener('cancel', () => done([]), { once: true });
    // In the document while its dialog is open, as older mobile Safari needs, and gone once answered.
    document.body.append(input);
    input.click();
  });
}
