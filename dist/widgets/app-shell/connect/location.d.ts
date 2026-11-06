import type { TreeTableRow } from '../../../model/rows/tableRow.js';
import type { LocationSegment } from '../dex-location-bar.js';
/** A place the user can be: a tab and a row in it, the tab's file (no row), or Root (no tab). */
export interface ShellPlace {
    tabId: string | null;
    rowId: string | null;
}
/** Whether two places are the same place: what the shell's NavHistory compares them by. */
export declare function samePlace(a: ShellPlace, b: ShellPlace): boolean;
/** A segment of the bar, and the place it stands for. */
export interface LocationStep extends LocationSegment {
    place: ShellPlace;
}
/** The active tab, as the bar names its file. */
export interface LocationTab {
    id: string;
    name: string;
    path: string;
    /** The file segment's tooltip: its path, as the host says it (ShellHost.pathTitle). Default the path. */
    title?: string;
}
/**
 * The bar's segments for `rowId` in `tab` (or the file, for null; or Root, for no tab), and the
 * place Up goes to (null at Root, which has nothing above it). `preview`, at Root: the file
 * selected in the graph, a dimmed segment after Root whose place is Root still (the shell opens
 * its file when it is pressed).
 */
export declare function locationOf(tab: LocationTab | null, rowId: string | null, rowOf: (rowId: string) => TreeTableRow | undefined, rootLabel?: string, preview?: LocationSegment): {
    segments: LocationStep[];
    up: ShellPlace | null;
};
