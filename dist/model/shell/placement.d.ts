/** A rectangle in viewport px, as DOMRect has it. */
export interface Rect {
    /** The left edge. */
    x: number;
    /** The top edge. */
    y: number;
    /** How wide it is, to the right of `x`. */
    width: number;
    /** How tall it is, down from `y`. */
    height: number;
}
/** The space between the anchor and the popover beside it, in px. */
export declare const PLACEMENT_GAP = 4;
/**
 * Where a popover of `size` goes beside `anchor`, its top left corner in viewport px: right of the
 * anchor, bottom-aligned with it, flipped to the anchor's left when the right has no room and
 * shifted up (or down) to fit. When the viewport is smaller than the popover, its top left corner
 * is the viewport's: never a negative x or y, which would put the popover's start, its heading and
 * first choices, where nothing can reach it.
 */
export declare function placeBeside(anchor: Rect, size: {
    width: number;
    height: number;
}, viewport: {
    width: number;
    height: number;
}): {
    x: number;
    y: number;
};
