// Copyright 2026 The MathWorks, Inc.
//
// A file changed on disk while its tab is open. A clean document takes what the disk holds now; one
// with unsaved edits asks first, once however many changes arrive while it asks, and keeps its edits
// over the change unless told to reload (keepOver: dirty until a save, whatever is undone).
//
// Lifted from data-explorer-app src/renderer/app.ts:286-376 at 0983920, where it was closures over
// the page's tabs and `window.dex`: here a class over what it reads (the host's file, its question,
// whether a tab is still open), so the shell holds one and the rules stay out of connectShell. The
// question the in-page dialog asks for a host with none of its own is reloadQuestion, below.

import { extOf } from 'data-explorer-core';
import type { Doc } from '../../../model/source/workspace.js';
import type { DexTreeTable } from '../../tree-table/dex-tree-table.js';
import type { ConfirmOptions } from '../dex-confirm-dialog.js';

/** What a tab is to the gate: its file, its name, its document, and the table its banner is in. */
export interface ReloadTab {
  path: string;
  name: string;
  doc?: Doc;
  table?: DexTreeTable;
}

/** What the gate reads and asks. */
export interface ReloadGateOptions<T> {
  /** The file's bytes as the disk holds them now. */
  read(path: string): Promise<Uint8Array>;
  /**
   * The file of `tab`, which has unsaved edits, changed on disk: whether to reload it. A rejection
   * is no answer. Asked about the tab, not its name, so a question that waits its turn can be
   * dropped for a tab that closed meanwhile.
   */
  confirm(tab: T): Promise<boolean>;
  /**
   * Whether `tab` is still open (and its shell up): a change, an answer or a read that lands after
   * it closed is not acted on, since its document is disposed by then.
   */
  isOpen(tab: T): boolean;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class ReloadGate<T extends ReloadTab> {
  /** The tabs being asked about a change, until the answer is acted on; one change at a time each. */
  private readonly asking = new Map<T, Promise<void>>();
  /**
   * Tabs whose answer is being acted on (their file read); those whose file changed meanwhile; and
   * those of them told meanwhile that the document holds what the disk does not (a save written over).
   */
  private readonly acting = new Set<T>();
  private readonly changedAgain = new Set<T>();
  private readonly againUnsaved = new Set<T>();

  constructor(private readonly options: ReloadGateOptions<T>) {}

  /**
   * The file of `tab` holds another program's file. `unsaved`: the document holds what the disk does
   * not, its unsaved edits or a save another program then wrote over, so the user is asked.
   * `written`: the latter, which the document's `dirty` does not show, so it holds whenever it is
   * acted on (a watcher's `unsaved` is the document's `dirty` then, and read again when it is).
   */
  changedOnDisk(tab: T, unsaved: boolean, written = false): Promise<void> {
    const pending = this.asking.get(tab);
    if (pending) {
      // While it asks, the read after the answer takes this too; once it reads, the file may be
      // newer than what it read, so it is looked at again when this one is done.
      if (this.acting.has(tab)) {
        this.changedAgain.add(tab);
        if (written) this.againUnsaved.add(tab);
      }
      return pending;
    }
    if (!tab.doc) return Promise.resolve();
    const run = (
      unsaved
        ? // No answer (the window went), or one for a tab that has closed since: nothing to act on.
          this.options.confirm(tab).then((reload) => (this.options.isOpen(tab) ? this.takeChange(tab, !reload, true) : undefined), () => undefined)
        : this.takeChange(tab, false, false)
    )
      .finally(() => this.asking.delete(tab))
      .then(() => {
        const unsavedAgain = this.againUnsaved.delete(tab);
        if (!this.changedAgain.delete(tab) || !tab.doc || !this.options.isOpen(tab)) return;
        return this.changedOnDisk(tab, unsavedAgain || tab.doc.dirty);
      });
    this.asking.set(tab, run);
    return run;
  }

  /** Keep the document over the disk's file, or take that file; `unsaved` as for changedOnDisk. */
  async takeChange(tab: T, keep: boolean, unsaved: boolean): Promise<void> {
    this.acting.add(tab);
    try {
      await this.actOnChange(tab, keep, unsaved);
    } finally {
      this.acting.delete(tab);
    }
  }

  async actOnChange(tab: T, keep: boolean, unsaved: boolean): Promise<void> {
    if (!tab.doc) return;
    // Kept, whatever the document reads by the answer: a save of it may have landed meanwhile, under
    // the other program's write, or an undo (on macOS the menu bar's Edit > Undo can reach the page
    // under the question's sheet). Either way the document as it stands is what the user keeps.
    let bytes: Uint8Array;
    try {
      bytes = await this.options.read(tab.path);
    } catch (err) {
      if (!this.options.isOpen(tab)) return;
      const what = keep ? `read ${tab.name} again` : `reload ${tab.name}`;
      if (tab.table) tab.table.banners = { error: `Failed to ${what}: ${message(err)}` };
      // The file is gone, or cannot be read: a document that holds what the disk does not stays
      // unsaved, kept or not, since there is nothing to take in its place.
      if (unsaved) await tab.doc?.keepOver(new Uint8Array()).catch(() => undefined);
      return;
    }
    // Closed while its file was read: its document is gone.
    if (!this.options.isOpen(tab)) return;
    // Taking the disk's file over a clean document: if it was edited (or saved, and that save written
    // over) while the file was read, it holds what the disk does not now, so it is asked about instead.
    if (!keep && !unsaved && (tab.doc.dirty || this.againUnsaved.has(tab))) {
      this.changedAgain.add(tab);
      return;
    }
    try {
      if (keep) await tab.doc.keepOver(bytes);
      else await tab.doc.reload(bytes);
    } catch (err) {
      const what = keep ? `read ${tab.name} again` : `reload ${tab.name}`;
      if (tab.table) tab.table.banners = { error: `Failed to ${what}: ${message(err)}` };
    }
  }
}

/**
 * What the in-page confirm dialog asks when a file with unsaved edits changed on disk, for a host
 * with no question of its own (`confirmReload`): the Electron app's native wording. Kept, the next
 * save writes the page's file over the other program's, and a MAT-file (and a model's workspace)
 * marks none of the variables only the other program changed Modified (Doc.keepOver), so the
 * detail says so; a dictionary marks them. Keep My Edits is the answer that loses nothing now.
 */
export function reloadQuestion(name: string): ConfirmOptions {
  const ext = extOf(name);
  const kept =
    ext === '.mat'
      ? "If you keep them, saving writes this MAT-file over the other program's changes, " +
        'including variables only it changed, which are not marked Modified.'
      : ext === '.slx'
        ? "If you keep them, saving writes this model over the other program's changes, " +
          'including workspace variables only it changed, which are not marked Modified.'
        : 'If you keep them, the entries the other program changed are marked Modified, and saving ' +
          'writes your version over its changes.';
  return {
    title: 'File Changed on Disk',
    message: `${name} changed on disk.`,
    detail: `Reload it and lose your unsaved edits, or keep them? ${kept}`,
    buttons: [
      { id: 'reload', label: 'Reload', kind: 'danger' },
      { id: 'keep', label: 'Keep My Edits', kind: 'primary' },
    ],
    cancelId: 'keep',
  };
}
