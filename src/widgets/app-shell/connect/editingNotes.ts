// Copyright 2026 The MathWorks, Inc.
//
// What the shell says, in a toast and the Log, of an editing gesture a table ran (TableHandle's
// `ran`): the prototype's words for Copy, Cut, Paste and Delete, whichever way the gesture came (the
// toolbar, a chord, the palette, the menu); and of table rows dropped onto the Explorer, in the same
// words. Pure: connectShell says it.

import type { DragMode } from '../../../model/actions/dropDecision.js';
import type { EditingRun } from '../../tree-table/editingWire.js';

/**
 * What a table's editing gesture did, as the prototype's toasts said it: Copy and Cut, a Paste of
 * something, and Delete with how many entries it took. None for the rest, whose table shows them.
 */
export function ranNote({ actionId, count }: EditingRun): string | undefined {
  if (actionId === 'copy') return 'Copied to clipboard';
  if (actionId === 'cut') return 'Cut to clipboard';
  if (actionId === 'paste' && count > 0) return 'Pasted';
  if (actionId === 'delete' && count > 0) return count === 1 ? 'Entry deleted' : `${count} entries deleted`;
  return undefined;
}

/**
 * What a drop of table rows onto the Explorer did, as an edit's toast says it: how many entries it
 * moved or copied, and `where` they went ("Design Data in plant.sldd", or a MAT-file's name).
 */
export function dropNote(mode: DragMode, count: number, where: string): string {
  return `${count === 1 ? 'Entry' : `${count} entries`} ${mode === 'copy' ? 'copied' : 'moved'} to ${where}`;
}
