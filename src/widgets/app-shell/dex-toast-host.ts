// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css } from 'lit';
import { state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';

/**
 * One message for the corner. A workspace Notice (`level` 'status', 'warning' or 'error') is a
 * Toast as it stands, so the shell hands the workspace's notices here unchanged; 'info' is the
 * shell's own (a file opened, a file saved).
 */
export interface Toast {
  /** 'status' and 'info' go by themselves; 'warning' and 'error' stay until closed. */
  level: 'info' | 'status' | 'warning' | 'error';
  /** What the toast says, shown as text (a line break in it starts a new line). */
  message: string;
  /** For 'status' and 'info': how long it shows, in milliseconds (4000 when not given). */
  ms?: number;
}

/** A toast on screen, under a number of its own: two toasts can say the same thing. */
interface Shown {
  key: number;
  toast: Toast;
}

// Long enough to read a file's name in "Saved …", short enough that a few saves in a row do not
// leave the corner full.
const DEFAULT_MS = 4000;

// More would climb over the table the user is working in; the oldest is the one they have had
// longest to read.
const MAX_SHOWN = 3;

/**
 * The shell's toasts, in the bottom-right corner of the window: show() adds one at the bottom
 * of the stack. A 'status' or 'info' toast goes by itself after its `ms`; a 'warning' or an
 * 'error' stays until its × is pressed, since what it says has to be read. At most three are
 * shown, and a fourth takes the oldest away. It sends no events: what it shows is the app's
 * business, and closing one changes nothing but the screen.
 *
 * @tagname dex-toast-host
 */
export class DexToastHost extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
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
       widening the toast past the window, and past a few lines it scrolls, so the × stays in
       reach. */
    .message {
      flex: 1 1 auto;
      min-width: 0;
      max-height: 10em;
      overflow: auto;
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
  `];

  // Oldest first, which is also top to bottom on screen.
  @state() private _shown: Shown[] = [];
  private _nextKey = 1;
  // The timer of each toast that goes by itself, by key. Only while connected: a timer that
  // outlived the host would fire into an element nobody sees.
  private _timers = new Map<number, ReturnType<typeof setTimeout>>();

  /**
   * Shows a toast at the bottom of the stack. 'status' and 'info' go by themselves after `ms`
   * (default 4000); 'warning' and 'error' stay until closed, whatever `ms` says. At most three
   * are shown: a fourth takes the oldest away.
   */
  show(toast: Toast): void {
    const key = this._nextKey++;
    const shown = [...this._shown, { key, toast }];
    for (const gone of shown.splice(0, Math.max(0, shown.length - MAX_SHOWN))) this._stopTimer(gone.key);
    this._shown = shown;
    if (this.isConnected) this._startTimer({ key, toast });
  }

  /** Takes every toast away, and stops every timer. */
  clear(): void {
    for (const key of [...this._timers.keys()]) this._stopTimer(key);
    this._shown = [];
  }

  override connectedCallback(): void {
    super.connectedCallback();
    // Put back on the page (a shell that re-parents the host disconnects it first): each toast
    // that goes by itself is timed again, in full, so none of them stays for good.
    for (const shown of this._shown) if (!this._timers.has(shown.key)) this._startTimer(shown);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    for (const key of [...this._timers.keys()]) this._stopTimer(key);
  }

  private _startTimer({ key, toast }: Shown): void {
    if (toast.level !== 'status' && toast.level !== 'info') return;
    this._timers.set(key, setTimeout(() => this._dismiss(key), toast.ms ?? DEFAULT_MS));
  }

  private _stopTimer(key: number): void {
    clearTimeout(this._timers.get(key));
    this._timers.delete(key);
  }

  private _dismiss(key: number): void {
    this._stopTimer(key);
    this._shown = this._shown.filter((shown) => shown.key !== key);
  }

  override render() {
    // Keyed, so each toast keeps its own element while the ones above it go. By position, taking
    // the top toast away would write each remaining message into the element above it: a live
    // region whose text changes is read out again, so every alert below would be announced a
    // second time, and a focused × would move onto another toast.
    return html`${repeat(this._shown, (shown) => shown.key, ({ key, toast }) => html`
      <div
        class="toast ${toast.level}"
        role=${toast.level === 'warning' || toast.level === 'error' ? 'alert' : 'status'}
      >
        <span class="message">${toast.message}</span>
        <button type="button" class="dismiss" aria-label="Dismiss" @click=${() => this._dismiss(key)}>×</button>
      </div>
    `)}`;
  }
}

/** Registers the widget as `<dex-toast-host>`, or under `tag`. */
export function defineToastHost(tag = 'dex-toast-host'): void {
  defineElement(tag, DexToastHost);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-toast-host': DexToastHost;
  }
}
