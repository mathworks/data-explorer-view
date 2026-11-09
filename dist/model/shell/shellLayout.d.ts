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
export declare const SIDE_DEFAULTS: Record<ShellSide, number>;
/**
 * The least size a side can be dragged to, in px: the prototype's. Below it a sidebar's names
 * and a panel's lines are cut to nothing, and the sash is all that is left of the side.
 */
export declare const SIDE_MIN: Record<ShellSide, number>;
/** The share of the documents' width the first of two panes takes at least: a fifth, so the second is never more than four fifths. */
export declare const SPLIT_MIN = 0.2;
/** The share the first of two panes takes at most: four fifths, so the second keeps a fifth. */
export declare const SPLIT_MAX = 0.8;
/** The share the first of two panes takes before anyone drags the divider between them: half. */
export declare const SPLIT_DEFAULT = 0.5;
/**
 * The layout for these views (by side, in order), from what was kept (may be null or junk).
 *
 * `kept` is what `keepLayout` wrote, as the store hands it back (its JSON text), or that text
 * already parsed. Anything else, or a field of it that does not fit, gives that field's default: a
 * side shows its first view, open, at its default size. A kept view the app no longer has falls
 * back to the side's first, keeping the open state and size that were kept with it. A side with no
 * views shows none and is closed, whatever was kept, since there is nothing to open it on.
 */
export declare function initialLayout(views: Record<ShellSide, readonly string[]>, kept: unknown): ShellLayoutState;
/**
 * The view `side` was left on, as `kept` says it (what keepLayout wrote, or its parsed object, read
 * as initialLayout reads it), or null where it says none: nothing kept, nothing for the side, or a
 * view the side no longer has among `views` (initialLayout falls back to the side's first there,
 * which no one chose). For a page that asks whether the user left a side on a view of their own.
 */
export declare function keptView(kept: unknown, side: ShellSide, views: readonly string[]): string | null;
/**
 * Click on a view's activity button: the shown, open view collapses its side; any other opens.
 *
 * Collapsing keeps the view, as the prototype's and VS Code's activity bars do: the button that
 * closed the side opens it again on the same view. A click on a closed side's own view opens it,
 * and one on another view opens the side on that view.
 */
export declare function toggleView(state: ShellLayoutState, side: ShellSide, view: string): ShellLayoutState;
/**
 * Open `side` on `view`, whatever it showed: what a keyboard chord or a command that brings a view
 * forward does. Unlike a click on the view's activity button, it never closes the side. The state
 * itself when it already shows the view open.
 */
export declare function showView(state: ShellLayoutState, side: ShellSide, view: string): ShellLayoutState;
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
export declare function resizeSide(state: ShellLayoutState, side: ShellSide, size: number, room: number): ShellLayoutState;
/**
 * What is kept: JSON text of the state, for the shell to put in localStorage and hand back to
 * `initialLayout` the next time. Only each side's three fields go in, so the text stays the
 * same shape whatever else a caller hung on the state.
 */
export declare function keepLayout(state: ShellLayoutState): string;
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
export declare function keepLayoutOver(state: ShellLayoutState, before: unknown, sides: readonly ShellSide[]): string;
/**
 * The split `ratio` held to [SPLIT_MIN, SPLIT_MAX], in thousandths (a drag's pointer gives any
 * fraction, and what is kept stays short); a ratio that is not a number is SPLIT_DEFAULT.
 */
export declare function clampSplit(ratio: number): number;
/**
 * The documents' split from what was kept (the layout's entry, as the store hands it back, or
 * already parsed): its `split`, held to the bounds, or SPLIT_DEFAULT for none or junk.
 */
export declare function initialSplit(kept: unknown): number;
/**
 * What is kept with the documents' split at `ratio` (held to the bounds): `before` (what the
 * layout's entry holds, as the store hands it back or already parsed) with its `split` written,
 * and every side copied as it was, for initialLayout to read field by field.
 */
export declare function keepSplitOver(ratio: number, before: unknown): string;
