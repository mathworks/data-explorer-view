import { type DragMode, type DragSource, type DropDecision } from './dropDecision.js';
import { type SectionRule } from './sectionRules.js';
/** Where a drop onto a whole document lands, and what it would do there. */
export interface DocumentDrop {
    /** The section's name, as its rule spells it: WHOLE_FILE_SECTION ('') for a document that is one target. */
    sectionName: string;
    /** What the drop would do there, as a drop on that section's heading is predicted. */
    decision: DropDecision;
}
/**
 * Where the drag `source`, let go over the document `docUri` as a whole in `mode`, lands among the
 * sections its `rules` describe, and what it would do there; null for a document with no rule, which
 * takes no drop anywhere (one that may not be edited).
 */
export declare function documentDrop(source: DragSource, docUri: string, rules: readonly SectionRule[], mode: DragMode): DocumentDrop | null;
