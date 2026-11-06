// Copyright 2026 The MathWorks, Inc.
//
// The app shell's layout rules (src/model/shell/shellLayout.ts): which view each side of the shell
// shows, whether the side is open, and how wide or tall it is, from what the last session kept and
// through each click on an activity button and each drag of a sash.
//
// What it protects: a shell that comes back as it was left, and comes back at all when what was
// kept no longer fits the app (a view the app dropped, a value a hand-edited or older store holds);
// the activity button's toggle, which is the only way to close a side; and a sash that can neither
// squeeze a side to nothing nor push the center out of the window.
import { describe, expect, it } from 'vitest';
import {
  SIDE_DEFAULTS,
  SIDE_MIN,
  initialLayout,
  keepLayout,
  keepLayoutOver,
  resizeSide,
  showView,
  toggleView,
  type ShellLayoutState,
} from '../src/model/shell/shellLayout.js';

const VIEWS = { left: ['explorer', 'search'], right: ['properties'], bottom: ['log', 'terminal'] } as const;

/** The layout a first launch gets for VIEWS. */
const FIRST: ShellLayoutState = {
  left: { view: 'explorer', open: true, size: SIDE_DEFAULTS.left },
  right: { view: 'properties', open: true, size: SIDE_DEFAULTS.right },
  bottom: { view: 'log', open: true, size: SIDE_DEFAULTS.bottom },
};

describe('initialLayout', () => {
  it('shows and opens the first view of each side by default', () => {
    expect(initialLayout(VIEWS, null)).toEqual(FIRST);
    expect(SIDE_DEFAULTS).toEqual({ left: 200, right: 200, bottom: 150 });
    expect(SIDE_MIN).toEqual({ left: 140, right: 120, bottom: 60 });
  });

  it('restores the view, open state and size that were kept', () => {
    const kept = JSON.stringify({
      left: { view: 'search', open: false, size: 300 },
      right: { view: 'properties', open: true, size: 180 },
      bottom: { view: 'terminal', open: false, size: 90 },
    });
    expect(initialLayout(VIEWS, kept)).toEqual({
      left: { view: 'search', open: false, size: 300 },
      right: { view: 'properties', open: true, size: 180 },
      bottom: { view: 'terminal', open: false, size: 90 },
    });
  });

  it("falls back to the side's first view when the kept view no longer exists", () => {
    const kept = JSON.stringify({ left: { view: 'gallery', open: false, size: 260 } });
    expect(initialLayout(VIEWS, kept).left).toEqual({ view: 'explorer', open: false, size: 260 });
  });

  it('gives the defaults for junk', () => {
    expect(initialLayout(VIEWS, 'x')).toEqual(FIRST);
    expect(initialLayout(VIEWS, { left: 5 })).toEqual(FIRST);
    expect(initialLayout(VIEWS, JSON.stringify({ left: 5 }))).toEqual(FIRST);
    expect(initialLayout(VIEWS, JSON.stringify({ left: { view: 7, open: 'yes', size: 'wide' } }))).toEqual(FIRST);
    expect(initialLayout(VIEWS, '[1,2]')).toEqual(FIRST);
    expect(initialLayout(VIEWS, 42)).toEqual(FIRST);
  });

  it('keeps a kept size at least the side minimum', () => {
    const kept = JSON.stringify({ left: { view: 'explorer', open: true, size: 3 } });
    expect(initialLayout(VIEWS, kept).left.size).toBe(SIDE_MIN.left);
  });

  it('gives a side with no views view: null and open: false', () => {
    const layout = initialLayout({ left: ['explorer'], right: [], bottom: [] }, null);
    expect(layout.right).toEqual({ view: null, open: false, size: SIDE_DEFAULTS.right });
    expect(layout.bottom).toEqual({ view: null, open: false, size: SIDE_DEFAULTS.bottom });
    // Even when the last session kept it open with a view: there is nothing to show.
    const kept = JSON.stringify({ right: { view: 'properties', open: true, size: 200 } });
    expect(initialLayout({ left: ['explorer'], right: [], bottom: [] }, kept).right).toEqual({ view: null, open: false, size: 200 });
  });
});

describe('toggleView and showView', () => {
  it('closes the side, keeping its view, when the shown open view is toggled', () => {
    const next = toggleView(FIRST, 'left', 'explorer');
    expect(next.left).toEqual({ view: 'explorer', open: false, size: SIDE_DEFAULTS.left });
    expect(next.right).toBe(FIRST.right);
    expect(FIRST.left.open).toBe(true);
  });

  it('opens and shows another view when it is toggled', () => {
    const next = toggleView(FIRST, 'left', 'search');
    expect(next.left).toEqual({ view: 'search', open: true, size: SIDE_DEFAULTS.left });
    expect(FIRST.left.view).toBe('explorer');
  });

  it('opens a closed side when its shown view is toggled', () => {
    const closed = toggleView(FIRST, 'bottom', 'log');
    expect(toggleView(closed, 'bottom', 'log').bottom).toEqual({ view: 'log', open: true, size: SIDE_DEFAULTS.bottom });
    expect(toggleView(closed, 'bottom', 'terminal').bottom).toEqual({ view: 'terminal', open: true, size: SIDE_DEFAULTS.bottom });
  });

  it('showView opens the side on the view, and never closes it', () => {
    expect(showView(FIRST, 'left', 'explorer')).toEqual(FIRST);
    const closed = toggleView(FIRST, 'left', 'explorer');
    expect(showView(closed, 'left', 'search').left).toEqual({ view: 'search', open: true, size: SIDE_DEFAULTS.left });
    expect(closed.left.open).toBe(false);
  });
});

describe('resizeSide', () => {
  it('clamps to the side minimum and to room - 200', () => {
    expect(resizeSide(FIRST, 'left', 300, 1000).left.size).toBe(300);
    expect(resizeSide(FIRST, 'left', 10, 1000).left.size).toBe(SIDE_MIN.left);
    expect(resizeSide(FIRST, 'right', 900, 1000).right.size).toBe(800);
    expect(resizeSide(FIRST, 'bottom', 500, 400).bottom.size).toBe(200);
    // A room too small for both keeps the minimum: the side does not vanish.
    expect(resizeSide(FIRST, 'bottom', 500, 150).bottom.size).toBe(SIDE_MIN.bottom);
    expect(FIRST.left.size).toBe(SIDE_DEFAULTS.left);
  });

  it('keeps whole pixels, and ignores a size or a room that is not a number', () => {
    expect(resizeSide(FIRST, 'left', 250.6, 1000).left.size).toBe(251);
    expect(resizeSide(FIRST, 'left', Number.NaN, 1000)).toBe(FIRST);
    expect(resizeSide(FIRST, 'left', 900, Number.NaN).left.size).toBe(900);
    expect(resizeSide(FIRST, 'left', SIDE_DEFAULTS.left, 1000)).toBe(FIRST);
  });
});

describe('keepLayout', () => {
  it('round-trips through initialLayout', () => {
    const state = resizeSide(toggleView(toggleView(FIRST, 'left', 'search'), 'bottom', 'log'), 'right', 333, 1200);
    const text = keepLayout(state);
    expect(typeof text).toBe('string');
    expect(initialLayout(VIEWS, text)).toEqual(state);
  });
});

describe('keepLayoutOver', () => {
  // A side with no views has nothing a person chose on it: writing its empty state over what was
  // kept would make a view that arrives there later open closed instead of as it was left.
  const EARLIER = keepLayout(toggleView(resizeSide(FIRST, 'left', 300, 1000), 'bottom', 'log'));

  it('writes the sides named, and for the others what was kept before', () => {
    const now = toggleView(FIRST, 'right', 'properties');
    const text = keepLayoutOver(now, EARLIER, ['right']);
    expect(JSON.parse(text)).toEqual({
      left: { view: 'explorer', open: true, size: 300 },
      right: { view: 'properties', open: false, size: SIDE_DEFAULTS.right },
      bottom: { view: 'log', open: false, size: SIDE_DEFAULTS.bottom },
    });
    // The same from what was kept already parsed.
    expect(keepLayoutOver(now, JSON.parse(EARLIER), ['right'])).toBe(text);
  });

  it('leaves out a side neither named nor kept before, whatever was kept', () => {
    expect(JSON.parse(keepLayoutOver(FIRST, null, ['left']))).toEqual({ left: FIRST.left });
    expect(JSON.parse(keepLayoutOver(FIRST, 'not json', ['left']))).toEqual({ left: FIRST.left });
    expect(JSON.parse(keepLayoutOver(FIRST, '[1, 2]', ['left']))).toEqual({ left: FIRST.left });
    expect(JSON.parse(keepLayoutOver(FIRST, '{"constructor": 1}', ['left']))).toEqual({ left: FIRST.left });
  });

  it("copies what was kept as it is, for initialLayout to read past what does not fit", () => {
    const text = keepLayoutOver(FIRST, '{"bottom": {"view": 7, "open": "yes", "size": 90}}', ['left', 'right']);
    expect(JSON.parse(text).bottom).toEqual({ view: 7, open: 'yes', size: 90 });
    expect(initialLayout(VIEWS, text).bottom).toEqual({ view: 'log', open: true, size: 90 });
  });

  it("is keepLayout's text with every side named", () => {
    expect(keepLayoutOver(FIRST, EARLIER, ['left', 'right', 'bottom'])).toBe(keepLayout(FIRST));
  });
});
