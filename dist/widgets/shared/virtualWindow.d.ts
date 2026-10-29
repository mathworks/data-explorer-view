export interface VirtualWindowSpec {
    /** How many items the run holds in total. */
    items: number;
    /** The size of ONE item along the axis being windowed. */
    itemSize: number;
    /** The scroll container's offset along that axis. */
    scroll: number;
    /** How much of the axis is on screen. */
    viewport: number;
    /** Items to render either side of the viewport, so a scroll of a few pixels
     *  does not have to render before it can paint. */
    buffer: number;
}
export interface VirtualWindow {
    /** Index of the first item to render. */
    start: number;
    /** How many to render, from `start`. */
    count: number;
    /** Padding to leave ahead of the slice, in px. */
    before: number;
    /** Padding to leave behind it, in px. */
    after: number;
    /** What the whole run occupies, in px: `before + count * itemSize + after`. */
    span: number;
}
export declare function virtualWindow({ items, itemSize, scroll, viewport, buffer }: VirtualWindowSpec): VirtualWindow;
