import type { EditingRun } from '../../tree-table/editingWire.js';
/**
 * What a table's editing gesture did, as the prototype's toasts said it: Copy and Cut, a Paste of
 * something, and Delete with how many entries it took. None for the rest, whose table shows them.
 */
export declare function ranNote({ actionId, count }: EditingRun): string | undefined;
