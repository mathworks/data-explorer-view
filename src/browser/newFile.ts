// Copyright 2026 The MathWorks, Inc.
//
// New in a browser (ShellHost.newFile): where the shell's new data dictionary goes. Chromium's save
// picker gives a handle the page may write, so the file the user names there is saved in place from
// then on, as one opened through a picker is. A browser with none (Firefox, Safari) has no way to
// name a file on disk, so the page keeps the file itself, under the name the shell offered, and its
// Save downloads it, as the Save of any file the page has no handle to does (save.ts).
//
// Chromium makes the file its save picker names, or empties the one that was there, as the picker
// closes, before the page has said a word. A New the user then discarded would leave a file of no
// bytes, which neither MATLAB nor the shell opens; so a new dictionary is written there at once, the
// one the shell opens (MATLAB's own, model/source/newDictionary.ts). Not over a file the page has
// open, though: what the user had there is in that file's tab, which the shell writes back.

import { extOf, isSlddFile } from 'data-explorer-core';
import { newDictionaryBytes } from '../model/source/newDictionary.js';
import { pickedNothing, wantedGesture } from './fsAccess.js';
import type { WebFiles } from './files.js';
import { saveFile, type SaveDeps } from './save.js';

/** The new files a browser host makes, and which of them the page keeps itself. */
export class NewFiles {
  /** The new files the page keeps, with no file on disk: each Save of one downloads it (save.ts). */
  private readonly kept = new Set<string>();

  /** New files among `files`, picked and downloaded through `deps`. */
  constructor(
    private readonly files: WebFiles,
    private readonly deps: SaveDeps,
  ) {}

  /**
   * Where a new file goes, `suggestedName` offered: its path, or null when the user cancels. With
   * the save picker, the file chosen (a file the page has a path for keeps it, and is read from then
   * on through the picker's handle, which the page may write), a new dictionary written there unless
   * the page has it open (`open`) or its name is not a dictionary's; with none, a file the page keeps,
   * holding a new dictionary until a Save.
   */
  async make(suggestedName: string, open: (path: string) => boolean): Promise<string | null> {
    if (!this.deps.window.showSaveFilePicker) {
      const path = await this.files.addPicked(suggestedName, { kind: 'bytes', bytes: newDictionaryBytes() });
      this.kept.add(path);
      return path;
    }
    const ext = extOf(suggestedName);
    let handle: FileSystemFileHandle;
    try {
      handle = await this.deps.window.showSaveFilePicker({
        suggestedName,
        types: ext ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { 'application/octet-stream': [ext] } }] : undefined,
        // A file of the kind offered, not any file the user types a name for: the picker empties it.
        excludeAcceptAllOption: true,
      });
    } catch (err) {
      if (pickedNothing(err)) return null;
      if (wantedGesture(err)) throw new Error('The browser shows its save dialog only after a click or a key press. Use New again from one.');
      throw err;
    }
    const known = await this.files.pathOf(handle);
    if (known) this.files.replace(known, { kind: 'handle', handle });
    const path = known ?? (await this.files.addPicked(handle.name, { kind: 'handle', handle }));
    if (!open(path) && isSlddFile(handle.name)) await saveFile(this.files, path, newDictionaryBytes(), this.deps.document);
    return path;
  }

  /** Whether `path` is a new file the page keeps, with no file on disk to watch. */
  keeps(path: string): boolean {
    return this.kept.has(path);
  }
}
