// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
// Long enough to read a file's name in "Saved …", short enough that a few saves in a row do not
// leave the corner full.
const DEFAULT_MS = 4000;
// More would climb over the table the user is working in; the oldest is the one they have had
// longest to read.
const MAX_SHOWN = 3;
/**
 * The shell's toasts, in the bottom-right corner of the window: show() adds one at the bottom
 * of the stack. A 'status' or 'info' toast goes by itself after its `ms`; a 'warning' or an
 * 'error' stays until its × is pressed, since what it says has to be read. A toast the pointer
 * is on, or whose × has focus, waits for the user, and is timed afresh once they leave it. At
 * most three are shown, and a fourth takes the oldest away. A screen reader hears each one as it
 * is shown, politely for 'status' and 'info' and at once for 'warning' and 'error'. It sends no
 * events: what it shows is the app's business, and closing one changes nothing but the screen.
 *
 * @tagname dex-toast-host
 */
export class DexToastHost extends LitElement {
    constructor() {
        super(...arguments);
        // Oldest first, which is also top to bottom on screen.
        this._shown = [];
        this._nextKey = 1;
        // The timer of each toast that goes by itself, by key. Only while connected: a timer that
        // outlived the host would fire into an element nobody sees.
        this._timers = new Map();
        // The toasts the pointer is on, and the one whose × has focus: held, with no timer running.
        this._pointerOn = new Set();
        this._focusIn = new Set();
    }
    static { this.styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css `
    /* The host is the stack: fixed in the corner, and growing upwards as toasts are added below.
       It lets the pointer through where there is no toast, so the gap between two toasts and the
       space around them are still the table's. Under the modal dialogs (10000): a toast that
       arrives while a question is up waits behind the backdrop with the rest of the page. */
    :host {
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      box-sizing: border-box;
      width: 320px;
      max-width: calc(100vw - 32px);
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 8px 10px 12px;
      background: var(--dex-bg-primary, #fff);
      border: 1px solid var(--dex-border-color-light, #e0e0e0);
      border-left: 3px solid var(--dex-color-accent, #0078d4);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      line-height: 1.4;
      color: var(--dex-color-text, #333);
    }

    /* The level is the left edge's colour: the surface stays the page's, so a toast reads the
       same in every theme and only the edge says how much it matters. */
    .toast.warning {
      border-left-color: var(--dex-color-warning, #d83b01);
    }

    .toast.error {
      border-left-color: var(--dex-color-error, #d32f2f);
    }

    /* A message can quote a long path or a source's whole reason: it wraps anywhere rather than
       widening the toast past the window, and takes as many lines as it needs. Not a scroll box:
       nothing in it takes focus, so a keyboard could never scroll it. */
    .message {
      flex: 1 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
      white-space: pre-line;
    }

    /* Shaped like the filter bar's ×, a little larger: it is the only control on the toast. */
    .dismiss {
      flex: 0 0 auto;
      width: 20px;
      height: 20px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: none;
      color: var(--dex-color-text-secondary, #555);
      font: inherit;
      font-size: 16px;
      line-height: 1;
      cursor: pointer;
    }

    .dismiss:hover {
      background: var(--dex-bg-hover, #e8e8e8);
      color: var(--dex-color-text, #333);
    }

    /* The live regions: heard, not seen (as the hierarchy's sr-only text). */
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
  `]; }
    /**
     * Shows a toast at the bottom of the stack. 'status' and 'info' go by themselves after `ms`
     * (default 4000); 'warning' and 'error' stay until closed, whatever `ms` says. At most three
     * are shown: a fourth takes the oldest away.
     */
    show(toast) {
        const entry = { key: this._nextKey++, toast };
        const shown = [...this._shown, entry];
        for (const gone of shown.splice(0, Math.max(0, shown.length - MAX_SHOWN)))
            this._forget(gone.key);
        this._shown = shown;
        if (this.isConnected)
            this._startTimer(entry);
        this._announce(entry);
    }
    /** Takes every toast away, stops every timer, and empties what a screen reader would read. */
    clear() {
        for (const { key } of this._shown)
            this._forget(key);
        this._shown = [];
        for (const region of this.shadowRoot?.querySelectorAll('.live') ?? [])
            region.replaceChildren();
    }
    connectedCallback() {
        super.connectedCallback();
        // Put back on the page (a shell that re-parents the host disconnects it first): each toast
        // that goes by itself is timed again, in full, so none of them stays for good; one the user
        // is still on waits for them, as ever (_startTimer).
        for (const shown of this._shown)
            this._startTimer(shown);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        for (const key of [...this._timers.keys()])
            this._stopTimer(key);
        // A browser does not reliably send pointerleave or focusout for a node taken off the page: a
        // hold kept across that would never be let go, and its toast would stay for good.
        this._pointerOn.clear();
        this._focusIn.clear();
    }
    _startTimer({ key, toast }) {
        if (toast.level !== 'status' && toast.level !== 'info')
            return;
        if (this._timers.has(key) || this._pointerOn.has(key) || this._focusIn.has(key))
            return;
        this._timers.set(key, setTimeout(() => this._dismiss(key), toast.ms ?? DEFAULT_MS));
    }
    _stopTimer(key) {
        clearTimeout(this._timers.get(key));
        this._timers.delete(key);
    }
    _forget(key) {
        this._stopTimer(key);
        this._pointerOn.delete(key);
        this._focusIn.delete(key);
    }
    _dismiss(key) {
        this._forget(key);
        this._shown = this._shown.filter((shown) => shown.key !== key);
    }
    // WCAG 2.2.1, a time limit the user can stop: a toast the pointer is on, or whose × has focus,
    // never goes by itself, or the click or the Enter meant for its × would land on whatever lay
    // under it. Once the user has left it on both counts it is timed again, in full, since the
    // time it had left was spent on something else.
    _hold(key, by) {
        by.add(key);
        this._stopTimer(key);
    }
    _release(key, by) {
        by.delete(key);
        const shown = this._shown.find((s) => s.key === key);
        if (shown && this.isConnected)
            this._startTimer(shown);
    }
    // A live region is read when what it holds changes; one put on the page with its text already
    // in it, as each toast was, is not reliably read at all. So the two regions are there, empty,
    // from the first render, and each message is added to the one for its level as a line of its
    // own. Added, not written over the last: two warnings in one task would otherwise leave only
    // the second for the reader to find. A new line whatever it says, so the same message twice
    // ("Saved a.sldd" after each save) is heard twice. And the regions are not atomic, so each line
    // is read as itself rather than with every line before it. The last three are kept, as many as
    // there are toasts on screen, so a region does not grow for the whole session.
    _announce(shown) {
        const role = shown.toast.level === 'warning' || shown.toast.level === 'error' ? 'alert' : 'status';
        const region = this.shadowRoot?.querySelector(`.live[role="${role}"]`);
        if (!region) {
            // Shown before the first render (in the task that put the host on the page): written once
            // the regions are there, if the toast is still up by then.
            if (!this.hasUpdated) {
                this.updateComplete.then(() => {
                    if (this._shown.includes(shown))
                        this._announce(shown);
                });
            }
            return;
        }
        const line = document.createElement('div');
        line.textContent = shown.toast.message;
        region.append(line);
        while (region.children.length > MAX_SHOWN)
            region.firstElementChild.remove();
    }
    render() {
        // The toasts carry no live role: the regions say each one once, and a toast that was a live
        // region too would be read twice. Keyed, so each toast keeps its own element while the ones
        // above it go. By position, taking the top toast away would write each remaining toast into
        // the element above it: a focused × would move onto another toast, and the pointer resting on
        // one would leave it held under another's key.
        return html `
      <div class="live" role="status" aria-atomic="false"></div>
      <div class="live" role="alert" aria-atomic="false"></div>
      ${repeat(this._shown, (shown) => shown.key, ({ key, toast }) => html `
        <div
          class="toast ${toast.level}"
          @pointerenter=${() => this._hold(key, this._pointerOn)}
          @pointerleave=${() => this._release(key, this._pointerOn)}
          @focusin=${() => this._hold(key, this._focusIn)}
          @focusout=${() => this._release(key, this._focusIn)}
        >
          <span class="message">${toast.message}</span>
          <button type="button" class="dismiss" aria-label="Dismiss" @click=${() => this._dismiss(key)}>×</button>
        </div>
      `)}
    `;
    }
}
__decorate([
    state()
], DexToastHost.prototype, "_shown", void 0);
/** Registers the widget as `<dex-toast-host>`, or under `tag`. */
export function defineToastHost(tag = 'dex-toast-host') {
    defineElement(tag, DexToastHost);
}
