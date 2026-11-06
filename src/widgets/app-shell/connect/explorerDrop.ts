// Copyright 2026 The MathWorks, Inc.
//
// Table rows dragged onto the Explorer: onto an open file's row, or one of its sections', whichever
// tab is on screen, as the prototype's Workspace tree took them. The Explorer draws and asks (its
// `dropPredictor`, its `dex-explorer-drop`); this answers from the target tab's table, which predicts
// and makes the drop exactly as a drop on one of its own rows (TableHandle's `dropDecision` and
// `drop`): so the Explorer invites no drop the table would refuse, and makes none by another path.
// The drop is one edit of the target's document, undone by its Undo; a move takes the entries out of
// the document they came from in one edit of that one, as a drop between two tables does.
//
// What is the shell's to say: the drag in flight is the workspace's (its registers tell it), and one
// from a document that may not be edited is a copy whatever the keys say (its table allows no move);
// a document that may not be edited takes no drop, and says so, as does a section that takes no
// entry (a model's Model Elements); a drop that would do nothing (onto the section every entry came
// from) shows nothing. A file's row lands where documentDrop says, which its tooltip names. Once
// dropped it is said as an edit is ("Entry moved to Design Data in plant.sldd"); a refusal, which the
// target's table says in its banner, perhaps not on screen, is said too.

import type { DragMode } from '../../../model/actions/dropDecision.js';
import type { DragDescriptor } from '../../../model/source/wire.js';
import type { DexExplorer, ExplorerDropDetail, ExplorerDropTarget, ExplorerDropVerdict } from '../dex-explorer.js';
import type { OpenTab } from './documents.js';
import { dropNote } from './editingNotes.js';
import { rowIn } from './rows.js';

/** What the Explorer's drops are answered from. */
export interface ExplorerDrops {
  /** The drag of table rows in flight, as the workspace's registers last told it; null for none. */
  drag(): DragDescriptor | null;
  /** The open tab of an Explorer file id. */
  tabOf(fileId: string): OpenTab | undefined;
  /** The open tab of the document opened under `uri`. */
  tabOfUri(uri: string): OpenTab | undefined;
  /** Say what a drop did. */
  dropped(text: string): void;
  /** A mark of what the workspace has said so far, taken as a drop is handed over, for `refused`. */
  mark(): number;
  /**
   * Say why the document refused a drop the Explorer took, unless the workspace said it since `since`
   * (a mark): a move that left its original behind is said by both.
   */
  refused(text: string, since: number): void;
}

/** Where a drop the Explorer takes lands: the tab, its table's row, the mode, and how to name the place. */
interface Landing {
  tab: OpenTab;
  rowId: string;
  mode: DragMode;
  where: string;
}

// A row of `tab`'s table by its id, as its name reads, for the words: a section's heading.
const labelOf = (tab: OpenTab, rowId: string): string => rowIn(tab.table?.rows ?? [], rowId)?.Name.label ?? rowId;

/** Answer `explorer`'s drops with `on`; returns what stops it. */
export function connectExplorerDrop(explorer: DexExplorer, on: ExplorerDrops): () => void {
  // What a drop on `target` would do with the keys asking `keys`, and where it lands where it is taken;
  // null for nothing to show (no drag of entries, a file that has no table yet, a drop that does nothing).
  const judge = (target: ExplorerDropTarget, keys: DragMode): { verdict: ExplorerDropVerdict; landing?: Landing } | null => {
    const drag = on.drag();
    if (!drag || drag.items.length === 0) return null;
    const tab = on.tabOf(target.fileId);
    const handle = tab?.handle;
    // A file still being read, a project on its page, one that could not be read: no table to drop into.
    if (!tab || !handle?.view) return null;
    const from = on.tabOfUri(drag.docUri);
    const mode: DragMode = from && !from.handle?.view?.editable ? 'copy' : keys;
    if (!handle.view.editable) return { verdict: { canDrop: false, tooltip: `${tab.name} is read-only` } };
    const decision = handle.dropDecision(target.sectionId ?? null, mode);
    if (!decision) {
      // A section with no rule, in a document that has rules (it answers for itself as a whole):
      // one that takes no entry. Anything else is no drop to judge.
      if (target.sectionId === undefined || !handle.dropDecision(null, mode)) return null;
      return { verdict: { canDrop: false, tooltip: `Nothing can be dropped in ${labelOf(tab, target.sectionId)}` } };
    }
    if (decision.noop) return null;
    if (!decision.canDrop) return { verdict: { canDrop: false, tooltip: decision.tooltip } };
    // A file's row lands in one of its sections (none for a document that is one target): it says which.
    const into = target.sectionId === undefined && decision.rowId !== '' ? ` into ${labelOf(tab, decision.rowId)}` : '';
    const where = decision.rowId === '' ? tab.name : `${labelOf(tab, decision.rowId)} in ${tab.name}`;
    return { verdict: { canDrop: true, effect: mode, tooltip: `${decision.tooltip}${into}` }, landing: { tab, rowId: decision.rowId, mode, where } };
  };

  explorer.dropPredictor = (target, keys) => judge(target, keys)?.verdict ?? null;

  const onDrop = (e: CustomEvent<ExplorerDropDetail>): void => {
    const { fileId, sectionId, mode } = e.detail;
    const landing = judge(sectionId === undefined ? { fileId } : { fileId, sectionId }, mode)?.landing;
    if (!landing) return;
    // Handed over now, in the drop's own event: the drag's end, which follows, lets the entries go.
    const since = on.mark();
    void landing.tab.handle!.drop(landing.rowId, landing.mode).then((result) => {
      if (result.dropped) on.dropped(dropNote(landing.mode, result.count, landing.where));
      else if (result.reason) on.refused(result.reason, since);
    });
  };
  explorer.addEventListener('dex-explorer-drop', onDrop);
  return () => {
    explorer.removeEventListener('dex-explorer-drop', onDrop);
    explorer.dropPredictor = null;
  };
}
