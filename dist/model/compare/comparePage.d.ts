import type { InspectorView } from '../source/tableSource.js';
import type { CompareLine } from './compareRows.js';
/** The inspector's page for a compare's selected line (InspectorFeed's page); no line, no groups. */
export declare function comparePage(line: CompareLine | undefined, names: {
    left: string;
    right: string;
}, columnLabels: Readonly<Record<string, string>>): InspectorView;
