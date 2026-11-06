// Copyright 2026 The MathWorks, Inc.
//
// The app shell's layout: for each of its three sides (the left and right sidebars and the bottom
// panel), which view it shows, whether it is open, and how wide or tall it is. The shell element
// draws what this says and keeps it in localStorage, so a person who closed the bottom panel and
// widened the explorer finds it so the next time the app starts.
//
// The rules are those of the prototype's shell (dex-app.ts, _toggleLeft and _onMouseMove): a
// click on the activity button of the view a side shows closes the side, and any other click
// opens the side on that view; a sash cannot make a side narrower than its minimum. Two are this
// package's own. A sash cannot push the center below 200 px either, which the prototype did not
// guard, so a side dragged across the window left nothing to read. And what was kept is read field
// by field, because it outlives the app that wrote it: a view a later version dropped, or a store
// edited by hand, falls back to a default for that field alone.
//
// Pure and DOM-free: the element measures the room and owns the storage, so every rule here is a
// unit test away. State objects are never changed in place; each function hands back a new one,
// or the same one when nothing changed, so a Lit element can hold the state as a @state field.

/** A side of the shell that holds views: the two sidebars and the bottom panel. */
export type ShellSide = 'left' | 'right' | 'bottom';

/** One side's layout. */
export interface SideState {
  /** The view the side shows, by id, or `null` for a side that has no views. */
  view: string | null;
  /** Whether the side is open. A closed side keeps its view, so opening it again shows the same one. */
  open: boolean;
  /** The side's width (left, right) or height (bottom), in whole px. */
  size: number;
}

/** The layout of the whole shell, side by side. */
export type ShellLayoutState = Record<ShellSide, SideState>;

/** The size a side starts at, in px, before anyone drags its sash: the prototype's sizes. */
export const SIDE_DEFAULTS: Record<ShellSide, number> = Object.freeze({ left: 220, right: 240, bottom: 150 });

/**
 * The least size a side can be dragged to, in px: the prototype's. Below it a sidebar's names
 * and a panel's lines are cut to nothing, and the sash is all that is left of the side.
 */
export const SIDE_MIN: Record<ShellSide, number> = Object.freeze({ left: 140, right: 120, bottom: 60 });

/** The least room a resize leaves the center (the editors), in px. */
const CENTER_MIN = 200;

const SIDES: readonly ShellSide[] = ['left', 'right', 'bottom'];

/**
 * The layout for these views (by side, in order), from what was kept (may be null or junk).
 *
 * `kept` is what `keepLayout` wrote, as the store hands it back (its JSON text), or that text
 * already parsed. Anything else, or a field of it that does not fit, gives that field's default: a
 * side shows its first view, open, at its default size. A kept view the app no longer has falls
 * back to the side's first, keeping the open state and size that were kept with it. A side with no
 * views shows none and is closed, whatever was kept, since there is nothing to open it on.
 */
export function initialLayout(views: Record<ShellSide, readonly string[]>, kept: unknown): ShellLayoutState {
  const record = asRecord(typeof kept === 'string' ? parseJson(kept) : kept);
  const layout = {} as ShellLayoutState;
  for (const side of SIDES) {
    const sideViews = views[side];
    const was = asRecord(record?.[side]);
    const view = typeof was?.view === 'string' && sideViews.includes(was.view) ? was.view : (sideViews[0] ?? null);
    const open = view !== null && (typeof was?.open === 'boolean' ? was.open : true);
    const size = typeof was?.size === 'number' && Number.isFinite(was.size) ? Math.max(SIDE_MIN[side], Math.round(was.size)) : SIDE_DEFAULTS[side];
    layout[side] = { view, open, size };
  }
  return layout;
}

/**
 * Click on a view's activity button: the shown, open view collapses its side; any other opens.
 *
 * Collapsing keeps the view, as the prototype's and VS Code's activity bars do: the button that
 * closed the side opens it again on the same view. A click on a closed side's own view opens it,
 * and one on another view opens the side on that view.
 */
export function toggleView(state: ShellLayoutState, side: ShellSide, view: string): ShellLayoutState {
  const now = state[side];
  if (now.view === view && now.open) return { ...state, [side]: { ...now, open: false } };
  return { ...state, [side]: { ...now, view, open: true } };
}

/**
 * Open `side` on `view`, whatever it showed: what a keyboard chord or a command that brings a view
 * forward does. Unlike a click on the view's activity button, it never closes the side. The state
 * itself when it already shows the view open.
 */
export function showView(state: ShellLayoutState, side: ShellSide, view: string): ShellLayoutState {
  const now = state[side];
  if (now.view === view && now.open) return state;
  return { ...state, [side]: { ...now, view, open: true } };
}

/**
 * A resize, clamped to [SIDE_MIN, max] where max leaves `room` px for the center (≥ 200).
 *
 * `room` is the px the side and the center share along the side's axis: for a sidebar, the
 * shell's width less the other sidebar and the activity bars; for the bottom panel, the height
 * above it. So the largest size is `room - 200`. When even that is below the side's minimum (a
 * window made very small), the minimum wins: a side that is open stays big enough to use, and the
 * window's own overflow takes the rest. A size that is not a number (a pointer event's NaN) leaves
 * the state as it was, a room that is not one sets no largest size, and sizes are kept in whole
 * px, which is what a sash moves by on screen.
 */
export function resizeSide(state: ShellLayoutState, side: ShellSide, size: number, room: number): ShellLayoutState {
  if (!Number.isFinite(size)) return state;
  const max = Number.isFinite(room) ? room - CENTER_MIN : Infinity;
  const clamped = Math.round(Math.max(SIDE_MIN[side], Math.min(size, max)));
  const now = state[side];
  if (now.size === clamped) return state;
  return { ...state, [side]: { ...now, size: clamped } };
}

/**
 * What is kept: JSON text of the state, for the shell to put in localStorage and hand back to
 * `initialLayout` the next time. Only each side's three fields go in, so the text stays the
 * same shape whatever else a caller hung on the state.
 */
export function keepLayout(state: ShellLayoutState): string {
  const kept: Partial<ShellLayoutState> = {};
  for (const side of SIDES) {
    const { view, open, size } = state[side];
    kept[side] = { view, open, size };
  }
  return JSON.stringify(kept);
}

/** JSON text parsed, or `undefined` for text that is not JSON. */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** `value` as an object to read fields from, or `undefined` for a non-object (null and arrays included). */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}
