// Copyright 2026 The MathWorks, Inc.
//
// New in a browser (ShellHost.newFile): where the shell's new data dictionary goes. The shell makes
// the dictionary and writes it at its first Save; the host only says where. Chromium's save picker
// gives a handle the page may write, so the file the user names there is saved in place from then
// on, as one opened through a picker is. A browser with none (Firefox, Safari) has no way to name a
// file on disk, so the page keeps the file itself, under the name the shell offered, and its Save
// downloads it, as Save As does there.

import { extOf } from 'data-explorer-core';
import { pickedNothing, wantedGesture } from './fsAccess.js';
import type { WebFiles } from './files.js';
import { download, type SaveDeps } from './save.js';

/** The new files a browser host makes, and the Save of the ones the page keeps itself. */
export class NewFiles {
  /** The new files the page keeps, with no file on disk: each Save of one downloads it. */
  private readonly kept = new Set<string>();

  /** New files among `files`, picked and downloaded through `deps`. */
  constructor(
    private readonly files: WebFiles,
    private readonly deps: SaveDeps,
  ) {}

  /**
   * Where a new file goes, `suggestedName` offered: its path, or null when the user cancels. With
   * the save picker, the file chosen (a file the page has a path for keeps it, and is read from then
   * on through the picker's handle, which the page may write); with none, a file the page keeps.
   */
  async make(suggestedName: string): Promise<string | null> {
    if (!this.deps.window.showSaveFilePicker) {
      const path = await this.files.addPicked(suggestedName, { kind: 'bytes', bytes: new Uint8Array() });
      this.kept.add(path);
      return path;
    }
    const ext = extOf(suggestedName);
    let handle: FileSystemFileHandle;
    try {
      handle = await this.deps.window.showSaveFilePicker({
        suggestedName,
        types: ext ? [{ description: `${ext.slice(1).toUpperCase()} file`, accept: { 'application/octet-stream': [ext] } }] : undefined,
      });
    } catch (err) {
      if (pickedNothing(err)) return null;
      if (wantedGesture(err)) throw new Error('The browser shows its save dialog only after a click or a key press. Use New again from one.');
      throw err;
    }
    const known = await this.files.pathOf(handle);
    if (known) {
      this.files.replace(known, { kind: 'handle', handle });
      return known;
    }
    return this.files.addPicked(handle.name, { kind: 'handle', handle });
  }

  /** Whether `path` is a new file the page keeps, whose Save is `save`'s. */
  keeps(path: string): boolean {
    return this.kept.has(path);
  }

  /** Save the kept new file `path`: a download of `bytes` under its name, which the page then holds as the file. */
  save(path: string, bytes: Uint8Array): { overwritten: boolean } {
    const name = this.files.get(path)?.name ?? path.slice(path.lastIndexOf('/') + 1);
    download(this.deps.document, name, bytes);
    this.files.replace(path, { kind: 'bytes', bytes: bytes.slice() });
    return { overwritten: false };
  }
}
