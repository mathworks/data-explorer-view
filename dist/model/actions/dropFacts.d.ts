/** The payload-free facts a drop target judges an entry by. */
export interface DropFacts {
    className: string;
    arrayClass: string;
    kind: string;
    isMatlabVariable: boolean;
    /**
     * Whether the entry's value is scalar-numeric. Only meaningful for a MATLAB
     * variable; it is what decides whether the variable may CONVERT to a Constant when
     * it lands in Architectural Data (a Constant must be scalar-numeric).
     */
    isScalarNumeric: boolean;
    /**
     * Another entry of its document answers to the selector a move deletes it by (a dictionary
     * entry with no uuid whose name another section holds, say), so it can be copied and never
     * moved. Computed over the whole document where both registers are filled (structuralEdit's
     * registerItemsOf), not here, and set only where true.
     */
    sharedName?: boolean;
}
/**
 * The drop facts of one live entry.
 *
 * Tolerates a null/degenerate node rather than throwing: callers reach here while
 * walking a multi-selection, where a row may resolve to a section header or to
 * nothing at all, and one such row must not abort the whole gesture.
 *
 * `serialized` lets a caller hand in the record it already has. Both registers keep the
 * payload alongside these facts, and `serialize()` deep-copies a whole subtree — doing
 * it twice per row would double the cost of a gesture the user waits on (dragstart on a
 * multi-selection of large buses).
 */
export declare function dropFactsOf(entry: any, serialized?: Record<string, unknown>): DropFacts;
