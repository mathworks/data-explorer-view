// Copyright 2026 The MathWorks, Inc.
//
// Where a popover goes beside the button that opened it, kept inside the viewport: the shell's
// Settings popover, opened from the foot of an activity bar.
//
// the prototype put its Settings popover to the right of the button, with their bottoms in
// line, by CSS alone (dex-settings-panel.ts, `left: 52px; bottom: 4px`). That holds only for a
// button at the bottom of the left bar; this package's shell lets an app put the button on either
// bar, and a window can be smaller than the popover. So the place is computed: to the right first,
// to the left of the button when the right has no room, and then moved, by as little as it takes,
// to lie inside the viewport. Inside wins over beside: a popover over its own button can still be
// read and clicked, a popover past an edge cannot.
//
// Pure and DOM-free: the element measures (getBoundingClientRect, innerWidth) and positions; the
// rule is a unit test away. Coordinates are the viewport's, in px, x to the right and y down.

/** A rectangle in viewport px, as DOMRect has it. */
export interface Rect {
  /** The left edge. */
  x: number;
  /** The top edge. */
  y: number;
  width: number;
  height: number;
}

/** The space between the anchor and the popover beside it, in px. */
export const PLACEMENT_GAP = 4;

/**
 * Where a popover of `size` goes beside `anchor`, its top left corner in viewport px: right of the
 * anchor, bottom-aligned with it, flipped to the anchor's left when the right has no room and
 * shifted up (or down) to fit. When the viewport is smaller than the popover, its top left corner
 * is the viewport's: never a negative x or y, which would put the popover's start, its heading and
 * first choices, where nothing can reach it.
 */
export function placeBeside(anchor: Rect, size: { width: number; height: number }, viewport: { width: number; height: number }): { x: number; y: number } {
  let x = anchor.x + anchor.width + PLACEMENT_GAP;
  if (x + size.width > viewport.width) {
    const left = anchor.x - PLACEMENT_GAP - size.width;
    // Flipped, unless the left has no room either: then as far right as the viewport allows.
    x = left >= 0 ? left : viewport.width - size.width;
  }
  const y = Math.min(anchor.y + anchor.height - size.height, viewport.height - size.height);
  return { x: Math.max(0, x), y: Math.max(0, y) };
}
