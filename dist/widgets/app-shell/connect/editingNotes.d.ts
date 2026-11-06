import type { DragMode } from '../../../model/actions/dropDecision.js';
import type { EditingRun } from '../../tree-table/editingWire.js';
/**
 * What a table's editing gesture did, as the prototype's toasts said it: Copy and Cut, a Paste of
 * something, and Delete with how many entries it took. None for the rest, whose table shows them.
 */
export declare function ranNote({ actionId, count }: EditingRun): string | undefined;
/**
 * What a drop of table rows onto the Explorer did, as an edit's toast says it: how many entries it
 * moved or copied, and `where` they went ("Design Data in plant.sldd", or a MAT-file's name).
 */
export declare function dropNote(mode: DragMode, count: number, where: string): string;
