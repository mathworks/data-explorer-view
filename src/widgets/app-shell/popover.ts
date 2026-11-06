// Copyright 2026 The MathWorks, Inc.
//
// How the shell's popovers open and close (<dex-settings-panel>, <dex-about-panel>): beside the
// activity-bar button that opened them, until Escape or a press outside, with focus going in when
// they open and back to the button when they close. A controller rather than a base class, so that
// each panel stays a LitElement of its own, as every widget of this package is, and the two share
// this by holding one.
//
// The document listeners exist only while a popover is open. Escape is heard in the capture phase
// and spent there: it has to close the popover wherever focus is, and nothing behind the popover
// should act on the same key. A press is heard in the capture phase too, so a widget that stops a
// pointerdown for its own reasons (a drag starting in the table) still closes the popover.
//
// Placement is placeBeside's rule (src/model/shell/placement.ts) over the popover's own size, which
// is known only once it has rendered. show() puts it at the anchor's right at once, and every
// render while it is open measures and places it again, so a popover whose content the app changes
// while it is open (the About lines) keeps beside its button and inside the window.

import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { PLACEMENT_GAP, placeBeside, type Rect } from '../../model/shell/placement.js';

/** The element a popover controller works for: a Lit element. */
export type PopoverHost = ReactiveControllerHost & HTMLElement;

/**
 * Opens and closes a popover element: show(), close(), and the `open` attribute on the host. The
 * host renders its card while `open` is true and nothing otherwise; the controller asks it to
 * render again whenever that changes.
 */
export class PopoverController implements ReactiveController {
  private _open = false;
  private _anchor: Rect | null = null;
  private _returnFocusTo: HTMLElement | null = null;
  // Set by a show() that opened the popover, and spent by the render after it, when what is to
  // take focus exists.
  private _focusPending = false;

  /**
   * Works for `host`. `initialFocus` names what takes focus once the popover has rendered after
   * show() opened it: the Settings panel's chosen theme, the About card itself.
   */
  constructor(
    private readonly _host: PopoverHost,
    private readonly _initialFocus: () => HTMLElement | null | undefined,
  ) {
    _host.addController(this);
  }

  /** Whether the popover is open: from show() until close(), Escape or a press outside it. */
  get open(): boolean {
    return this._open;
  }

  /**
   * Opens the popover beside `anchor`, in viewport px (the opening button's
   * getBoundingClientRect()), or moves it there when it is open already.
   */
  show(anchor: Rect): void {
    if (!this._open) {
      // Taken only on opening: by a second show() focus is inside the popover, and going back
      // there would leave it on a control of a closed popover.
      this._returnFocusTo = deepActiveElement();
      this._focusPending = true;
      document.addEventListener('keydown', this._onKeyDown, true);
      document.addEventListener('pointerdown', this._onPointerDown, true);
    }
    this._open = true;
    this._anchor = { x: anchor.x, y: anchor.y, width: anchor.width, height: anchor.height };
    this._host.setAttribute('open', '');
    // Beside the anchor until the render after this one has measured the popover, rather than
    // wherever it was last, or at the window's corner.
    this._host.style.left = `${anchor.x + anchor.width + PLACEMENT_GAP}px`;
    this._host.style.top = `${anchor.y}px`;
    this._host.requestUpdate();
  }

  /**
   * Closes the popover. Focus goes back to what had it before show() when the popover holds it,
   * and is left alone when it does not: an app closing the popover while someone types elsewhere
   * must not pull them away.
   */
  close(): void {
    if (!this._open) return;
    const heldFocus = this._host.shadowRoot?.activeElement != null;
    this._open = false;
    this._anchor = null;
    this._focusPending = false;
    this._host.removeAttribute('open');
    document.removeEventListener('keydown', this._onKeyDown, true);
    document.removeEventListener('pointerdown', this._onPointerDown, true);
    const target = this._returnFocusTo;
    this._returnFocusTo = null;
    this._host.requestUpdate();
    if (heldFocus && target?.isConnected) target.focus();
  }

  /** Places the popover after each render while it is open, and gives focus to it after the first. */
  hostUpdated(): void {
    if (!this._open || !this._anchor) return;
    this._place(this._anchor);
    if (this._focusPending) {
      this._focusPending = false;
      this._initialFocus()?.focus();
    }
  }

  /** A popover taken off the page closes, and its document listeners go with it. */
  hostDisconnected(): void {
    this.close();
  }

  private _place(anchor: Rect): void {
    const host = this._host;
    // Measured at the window's corner: at the anchor's right, a popover opened from the right
    // bar starts past the window's edge, where the room left would squeeze it to its narrowest.
    host.style.left = '0px';
    host.style.top = '0px';
    const { width, height } = host.getBoundingClientRect();
    const at = placeBeside(anchor, { width, height }, { width: window.innerWidth, height: window.innerHeight });
    host.style.left = `${at.x}px`;
    host.style.top = `${at.y}px`;
  }

  private _onKeyDown = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    this.close();
  };

  private _onPointerDown = (e: PointerEvent): void => {
    if (e.composedPath().includes(this._host)) return;
    // A press on the button that opened the popover is left to that button's click. Closed here,
    // the popover would be shut by the time a toggling button asked whether it was open, and the
    // click would open it again.
    const a = this._anchor;
    if (a && e.clientX >= a.x && e.clientX < a.x + a.width && e.clientY >= a.y && e.clientY < a.y + a.height) return;
    this.close();
  };
}

// The element that has focus, inside whatever shadow roots hold it: the shell's button, not the
// shell element that document.activeElement names.
function deepActiveElement(): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement as HTMLElement;
  return el;
}
