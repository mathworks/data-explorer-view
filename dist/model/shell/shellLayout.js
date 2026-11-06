// Copyright 2026 The MathWorks, Inc.
//
// The app shell's layout: for each of its three sides (the left and right sidebars and the bottom
// panel), which view it shows, whether it is open, and how wide or tall it is. The shell element
// draws what this says and keeps it in localStorage, so a person who closed the bottom panel and
// widened the explorer finds it so the next time the app starts.
//
// The rules are those of the prototype's shell: a click on the activity button of the view a side
// shows closes the side, and any other click opens the side on that view; a sash cannot make a side
// narrower than its minimum. Two are this package's own. A sash cannot push the center below 200 px
// either, which the prototype did not guard, so a side dragged across the window left nothing to
// read. And what was kept is read field by field, because it outlives the app that wrote it: a view
// a later version dropped, or a store edited by hand, falls back to a default for that field alone.
//
// Pure and DOM-free: the element measures the room and owns the storage, so every rule here is a
// unit test away. State objects are never changed in place; each function hands back a new one,
// or the same one when nothing changed, so a Lit element can hold the state as a @state field.
//
// The documents' split is kept with the layout, in the same entry: the share of the documents'
// width the first (left) of two panes takes. The sides are the shell element's to keep, and the
// split connectShell's, which draws the panes; each writes its own field and copies the other's
// as it was, so neither loses what the other kept.
/** The size a side starts at, in px, before anyone drags its sash: the prototype's sizes. */
export const SIDE_DEFAULTS = Object.freeze({ left: 200, right: 200, bottom: 150 });
/**
 * The least size a side can be dragged to, in px: the prototype's. Below it a sidebar's names
 * and a panel's lines are cut to nothing, and the sash is all that is left of the side.
 */
export const SIDE_MIN = Object.freeze({ left: 140, right: 120, bottom: 60 });
/** The least room a resize leaves the center (the editors), in px. */
const CENTER_MIN = 200;
const SIDES = ['left', 'right', 'bottom'];
/** The share of the documents' width the first of two panes takes at least: a fifth, so the second is never more than four fifths. */
export const SPLIT_MIN = 0.2;
/** The share the first of two panes takes at most: four fifths, so the second keeps a fifth. */
export const SPLIT_MAX = 0.8;
/** The share the first of two panes takes before anyone drags the divider between them: half. */
export const SPLIT_DEFAULT = 0.5;
/**
 * The layout for these views (by side, in order), from what was kept (may be null or junk).
 *
 * `kept` is what `keepLayout` wrote, as the store hands it back (its JSON text), or that text
 * already parsed. Anything else, or a field of it that does not fit, gives that field's default: a
 * side shows its first view, open, at its default size. A kept view the app no longer has falls
 * back to the side's first, keeping the open state and size that were kept with it. A side with no
 * views shows none and is closed, whatever was kept, since there is nothing to open it on.
 */
export function initialLayout(views, kept) {
    const record = asRecord(typeof kept === 'string' ? parseJson(kept) : kept);
    const layout = {};
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
export function toggleView(state, side, view) {
    const now = state[side];
    if (now.view === view && now.open)
        return { ...state, [side]: { ...now, open: false } };
    return { ...state, [side]: { ...now, view, open: true } };
}
/**
 * Open `side` on `view`, whatever it showed: what a keyboard chord or a command that brings a view
 * forward does. Unlike a click on the view's activity button, it never closes the side. The state
 * itself when it already shows the view open.
 */
export function showView(state, side, view) {
    const now = state[side];
    if (now.view === view && now.open)
        return state;
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
export function resizeSide(state, side, size, room) {
    if (!Number.isFinite(size))
        return state;
    const max = Number.isFinite(room) ? room - CENTER_MIN : Infinity;
    const clamped = Math.round(Math.max(SIDE_MIN[side], Math.min(size, max)));
    const now = state[side];
    if (now.size === clamped)
        return state;
    return { ...state, [side]: { ...now, size: clamped } };
}
/**
 * What is kept: JSON text of the state, for the shell to put in localStorage and hand back to
 * `initialLayout` the next time. Only each side's three fields go in, so the text stays the
 * same shape whatever else a caller hung on the state.
 */
export function keepLayout(state) {
    const kept = {};
    for (const side of SIDES) {
        const { view, open, size } = state[side];
        kept[side] = { view, open, size };
    }
    return JSON.stringify(kept);
}
/**
 * What is kept when the shell writes only some of the sides: `state`'s three fields for each side
 * in `sides`, and for every other side what `before` holds for it (what was kept last, as the
 * store hands it back or already parsed), or nothing when it holds none. With every side named it
 * is `keepLayout`'s text.
 *
 * The shell names the sides that have views. Nothing a person chose is on a side with none, and
 * writing its empty state over what was kept for it would close the side for good: a view that
 * arrives there later, in this page or in a later version of the app, would open closed rather
 * than as it was left. What `before` holds is copied as it is, junk included, for the next
 * initialLayout to read field by field as it reads anything kept.
 */
export function keepLayoutOver(state, before, sides) {
    const was = asRecord(typeof before === 'string' ? parseJson(before) : before);
    const kept = {};
    for (const side of SIDES) {
        if (sides.includes(side)) {
            const { view, open, size } = state[side];
            kept[side] = { view, open, size };
        }
        else if (was && Object.hasOwn(was, side)) {
            kept[side] = was[side];
        }
    }
    // The documents' split is connectShell's to write (keepSplitOver): kept as it was.
    if (was && Object.hasOwn(was, 'split'))
        kept.split = was.split;
    return JSON.stringify(kept);
}
/**
 * The split `ratio` held to [SPLIT_MIN, SPLIT_MAX], in thousandths (a drag's pointer gives any
 * fraction, and what is kept stays short); a ratio that is not a number is SPLIT_DEFAULT.
 */
export function clampSplit(ratio) {
    if (!Number.isFinite(ratio))
        return SPLIT_DEFAULT;
    return Math.round(Math.max(SPLIT_MIN, Math.min(SPLIT_MAX, ratio)) * 1000) / 1000;
}
/**
 * The documents' split from what was kept (the layout's entry, as the store hands it back, or
 * already parsed): its `split`, held to the bounds, or SPLIT_DEFAULT for none or junk.
 */
export function initialSplit(kept) {
    const split = asRecord(typeof kept === 'string' ? parseJson(kept) : kept)?.split;
    return typeof split === 'number' ? clampSplit(split) : SPLIT_DEFAULT;
}
/**
 * What is kept with the documents' split at `ratio` (held to the bounds): `before` (what the
 * layout's entry holds, as the store hands it back or already parsed) with its `split` written,
 * and every side copied as it was, for initialLayout to read field by field.
 */
export function keepSplitOver(ratio, before) {
    const was = asRecord(typeof before === 'string' ? parseJson(before) : before);
    return JSON.stringify({ ...was, split: clampSplit(ratio) });
}
/** JSON text parsed, or `undefined` for text that is not JSON. */
function parseJson(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        return undefined;
    }
}
/** `value` as an object to read fields from, or `undefined` for a non-object (null and arrays included). */
function asRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}
