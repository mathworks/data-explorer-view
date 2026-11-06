import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { type Rect } from '../../model/shell/placement.js';
/** The element a popover controller works for: a Lit element. */
export type PopoverHost = ReactiveControllerHost & HTMLElement;
/**
 * Opens and closes a popover element: show(), close(), and the `open` attribute on the host. The
 * host renders its card while `open` is true and nothing otherwise; the controller asks it to
 * render again whenever that changes.
 */
export declare class PopoverController implements ReactiveController {
    private readonly _host;
    private readonly _initialFocus;
    private _open;
    private _anchor;
    private _returnFocusTo;
    private _focusPending;
    /**
     * Works for `host`. `initialFocus` names what takes focus once the popover has rendered after
     * show() opened it: the Settings panel's chosen theme, the About card itself.
     */
    constructor(_host: PopoverHost, _initialFocus: () => HTMLElement | null | undefined);
    /** Whether the popover is open: from show() until close(), Escape or a press outside it. */
    get open(): boolean;
    /**
     * Opens the popover beside `anchor`, in viewport px (the opening button's
     * getBoundingClientRect()), or moves it there when it is open already. A popover that is not
     * on the page does not open.
     */
    show(anchor: Rect): void;
    /**
     * Closes the popover. Focus goes back to what had it before show() when the popover holds it,
     * and is left alone when it does not: an app closing the popover while someone types elsewhere
     * must not pull them away.
     */
    close(): void;
    /** Places the popover after each render while it is open, and gives focus to it after the first. */
    hostUpdated(): void;
    /** A popover taken off the page closes, and its document listeners go with it. */
    hostDisconnected(): void;
    private _place;
    private _onKeyDown;
    private _onPointerDown;
}
