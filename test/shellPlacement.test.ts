// Copyright 2026 The MathWorks, Inc.
//
// Where the app shell puts a popover beside the button that opened it (src/model/shell/placement.ts):
// to the right of the button with their bottoms in line, as the prototype opens its Settings
// popover from the foot of the left activity bar, and moved only as far as it takes to keep it in
// the window.
//
// What it protects: a popover that is all on screen, whichever side of the window its button is on
// and however small the window is; a part of one past an edge cannot be read or clicked.
import { describe, expect, it } from 'vitest';
import { PLACEMENT_GAP, placeBeside } from '../src/model/shell/placement.js';

const VIEWPORT = { width: 1000, height: 700 };
const SIZE = { width: 200, height: 150 };

describe('placeBeside', () => {
  it('puts it to the right of the anchor, bottom-aligned with it', () => {
    const anchor = { x: 0, y: 600, width: 36, height: 36 };
    expect(placeBeside(anchor, SIZE, VIEWPORT)).toEqual({ x: 36 + PLACEMENT_GAP, y: 636 - 150 });
  });

  it('flips it to the left of the anchor at the right edge', () => {
    const anchor = { x: 964, y: 600, width: 36, height: 36 };
    expect(placeBeside(anchor, SIZE, VIEWPORT)).toEqual({ x: 964 - PLACEMENT_GAP - 200, y: 486 });
  });

  it('shifts it up at the bottom', () => {
    // An anchor that runs past the bottom of the window: its bottom is no place for the popover's.
    const anchor = { x: 0, y: 680, width: 36, height: 36 };
    expect(placeBeside(anchor, SIZE, VIEWPORT)).toEqual({ x: 36 + PLACEMENT_GAP, y: 700 - 150 });
  });

  it('shifts it down at the top', () => {
    const anchor = { x: 0, y: 10, width: 36, height: 36 };
    expect(placeBeside(anchor, SIZE, VIEWPORT)).toEqual({ x: 36 + PLACEMENT_GAP, y: 0 });
  });

  it('never places it at a negative x or y', () => {
    // A window too small for the popover on either side of its anchor, or at all.
    const tiny = { width: 150, height: 100 };
    const anchor = { x: 60, y: 40, width: 36, height: 36 };
    const place = placeBeside(anchor, SIZE, tiny);
    expect(place.x).toBe(0);
    expect(place.y).toBe(0);
    const narrow = { width: 300, height: 700 };
    expect(placeBeside({ x: 120, y: 600, width: 36, height: 36 }, SIZE, narrow)).toEqual({ x: 100, y: 486 });
    // An anchor partly off the window's top left corner.
    expect(placeBeside({ x: -50, y: -50, width: 36, height: 36 }, SIZE, VIEWPORT)).toEqual({ x: 0, y: 0 });
  });
});
