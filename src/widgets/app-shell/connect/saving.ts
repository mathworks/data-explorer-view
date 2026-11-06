// Copyright 2026 The MathWorks, Inc.
//
// Saving a tab's document, and settling unsaved edits before tabs or the window close. The page
// takes the bytes (Doc.serialize), the host writes them (ShellHost), and the document is told how
// that went (saved or notSaved), as view's README "Edit a file" has it. DOM-free.
//
// Lifted from data-explorer-app src/renderer/saving.ts at 0983920. The host is a ShellHost rather
// than the app's `window.dex`, and settle asks a function, which is the host's own question or
// the shell's in-page dialog (closeQuestion, below, is what that dialog asks).

import type { Doc } from '../../../model/source/workspace.js';
import type { ConfirmOptions } from '../dex-confirm-dialog.js';
import type { CloseAnswer, ShellHost } from './types.js';

export interface Savable {
  path: string;
  name: string;
  doc?: Doc;
}

/**
 * How a save ended: over its own file (and whether another program then wrote over it), at another
 * path (Save As), or not at all (and why, if it failed).
 */
export type SaveResult = { kind: 'saved'; overwritten?: boolean } | { kind: 'saved-as'; path: string } | { kind: 'not-saved'; error?: string };

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class Saver {
  private readonly queues = new WeakMap<Savable, Promise<unknown>>();

  constructor(private readonly host: Pick<ShellHost, 'saveFile' | 'saveFileAs'>) {}

  /**
   * Save `tab`'s document over its file, or (`as`) where the user says. A tab's saves run one at
   * a time, in the order asked, so the last one asked is the one on disk.
   */
  save(tab: Savable, as = false): Promise<SaveResult> {
    const run = (this.queues.get(tab) ?? Promise.resolve()).then(() => this.write(tab, as));
    this.queues.set(tab, run);
    return run;
  }

  private async write(tab: Savable, as: boolean): Promise<SaveResult> {
    const doc = tab.doc;
    // A .mdl, or a document with nothing to write.
    if (!doc?.editable) return { kind: 'not-saved' };
    if (!as && !doc.dirty) return { kind: 'saved' };
    let out: ReturnType<Doc['serialize']>;
    try {
      out = doc.serialize();
    } catch (err) {
      return { kind: 'not-saved', error: message(err) };
    }
    try {
      const to = as ? await this.host.saveFileAs(tab.path, out.bytes) : { path: tab.path, ...(await this.host.saveFile(tab.path, out.bytes)) };
      if (to?.path === tab.path) {
        // The bytes landed, as the file's newest write when the write resolved; another program's
        // after it is a change over the document's own (view's Doc.keepOver).
        doc.saved(out.at);
        return to.overwritten ? { kind: 'saved', overwritten: true } : { kind: 'saved' };
      }
      // Cancelled, or written elsewhere: this document's file holds what it held.
      doc.notSaved(out.at);
      return to === null ? { kind: 'not-saved' } : { kind: 'saved-as', path: to.path };
    } catch (err) {
      doc.notSaved(out.at);
      return { kind: 'not-saved', error: message(err) };
    }
  }
}

/**
 * Whether `tabs` may close: none has unsaved edits, or the user says to discard them, or to save
 * them and every save succeeds (`save`, which says why one did not). `confirm` asks the user,
 * once, about the names of the unsaved ones.
 */
export async function settle<T extends Savable>(
  tabs: readonly T[],
  confirm: (names: string[]) => Promise<CloseAnswer>,
  save: (tab: T) => Promise<boolean>,
): Promise<boolean> {
  const dirty = tabs.filter((t) => t.doc?.dirty);
  if (dirty.length === 0) return true;
  const answer = await confirm(dirty.map((t) => t.name));
  if (answer !== 'save') return answer === 'discard';
  for (const tab of dirty) if (!(await save(tab))) return false;
  return true;
}

/**
 * What the in-page confirm dialog asks before files with unsaved edits close, for a host with no
 * question of its own (`confirmClose`): the Electron app's native wording, with its buttons as
 * CloseAnswers. Save is the answer most people want; Don't Save throws work away.
 */
export function closeQuestion(names: readonly string[]): ConfirmOptions {
  const one = names.length === 1;
  return {
    title: one ? 'Save Changes' : 'Save Changes to Files',
    message: one ? `Do you want to save the changes you made to ${names[0]}?` : `Do you want to save the changes you made to ${names.length} files?`,
    detail: `${one ? '' : `${names.join('\n')}\n\n`}Your changes will be lost if you don't save them.`,
    buttons: [
      { id: 'save', label: one ? 'Save' : 'Save All', kind: 'primary' },
      { id: 'discard', label: "Don't Save", kind: 'danger' },
      { id: 'cancel', label: 'Cancel' },
    ],
    cancelId: 'cancel',
  };
}

/** The CloseAnswer a closeQuestion's button id is; anything else is Cancel. */
export function closeAnswerOf(id: string): CloseAnswer {
  return id === 'save' || id === 'discard' ? id : 'cancel';
}
