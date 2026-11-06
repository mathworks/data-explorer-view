// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';

/** One answer the dialog offers. */
export interface ConfirmButton {
  /** What show() resolves to when this button is pressed. */
  id: string;
  /** The button's text. */
  label: string;
  /**
   * 'primary' is the answer most people want, filled with the accent colour and focused when the
   * dialog opens; 'danger' throws work away (Don't Save, Reload), drawn in the error colour and
   * never focused on open; 'normal', the default, is neither.
   */
  kind?: 'primary' | 'danger' | 'normal';
}

/** What show() asks. */
export interface ConfirmOptions {
  /** The dialog's title, which is also its accessible name. */
  title: string;
  /** The question. */
  message: string;
  /** A line under the question, in a quieter colour: what each answer means. */
  detail?: string;
  /** The answers, left to right, as given. */
  buttons: ConfirmButton[];
  /**
   * What show() resolves to when the dialog is closed without a button: Escape, a click on the
   * backdrop, close(), a second show(), or the element leaving the page.
   */
  cancelId: string;
}

/**
 * A question with buttons, asked in the page for a host that has no dialogs of its own (a
 * browser page): "Save changes to x before closing?", "x changed on disk". show() opens it and
 * resolves to the id of the button pressed; Escape, a click outside it and close() resolve to the
 * question's `cancelId`, and focus goes back where it was. It opens focused on the primary
 * button, never on a danger one, and Tab stays among its buttons while it is open. It sends no
 * events: the promise is the answer.
 *
 * @tagname dex-confirm-dialog
 */
export class DexConfirmDialog extends LitElement {
  static override styles = [hiddenStyles, highContrastStyles, css`
    :host {
      display: none;
    }

    :host([open]) {
      display: flex;
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.4);
      align-items: center;
      justify-content: center;
    }

    .dialog {
      background: var(--dex-bg-primary, #fff);
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
      min-width: 340px;
      max-width: 480px;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 13px;
      color: var(--dex-color-text, #333);
      outline: none;
    }

    /* In the text colour, not the error dialog's red: this is a question, and nothing has gone
       wrong yet. */
    .title {
      padding: 12px 16px;
      font-weight: 600;
      font-size: 14px;
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    /* The body scrolls, and not the footer: however many files the question names, the buttons
       stay on screen. A line break in the message or the detail starts a new line, so a host can
       name one file a line. */
    .body {
      padding: 16px;
      max-height: 70vh;
      overflow: auto;
      line-height: 1.4;
      white-space: pre-line;
      overflow-wrap: anywhere;
    }

    .detail {
      margin-top: 8px;
      color: var(--dex-color-text-secondary, #555);
    }

    .footer {
      padding: 12px 16px;
      border-top: 1px solid var(--dex-border-color-light, #e0e0e0);
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }

    button {
      padding: 5px 20px;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 3px;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font-size: 13px;
      cursor: pointer;
    }

    button:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* On :focus and not only :focus-visible, as in the error dialog: the dialog opens with focus
       on a button, put there by script, and the ring is what says which answer Enter gives. */
    button:focus {
      outline: none;
      box-shadow: var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* The ink is the page's surface colour: white on the light themes, as a filled button is, and
       near-black on the dark one, whose accent is a light blue that white reads at 2.7:1 against
       (the surface reads 6:1). */
    button.primary {
      background: var(--dex-color-accent, #0078d4);
      border-color: var(--dex-color-accent, #0078d4);
      color: var(--dex-bg-primary, #fff);
    }

    button.primary:hover {
      background: var(--dex-color-accent-hover, #005a9e);
      border-color: var(--dex-color-accent-hover, #005a9e);
    }

    /* As the error dialog's Revert: an answer that throws work away is told apart before it is
       pressed. */
    button.danger {
      color: var(--dex-color-error, #d32f2f);
      border-color: var(--dex-color-error, #d32f2f);
    }
  `];

  // What show() fills in: state, not properties, since show() is the one way in.
  @state() private _options: ConfirmOptions | null = null;
  @state() private _open = false;
  private _answer: ((id: string) => void) | null = null;
  private _returnFocusTo: HTMLElement | null = null;

  /**
   * Opens the dialog with `options` and resolves to the id of the button pressed, or to
   * `options.cancelId` on Escape, a click on the backdrop, close(), or the element leaving the
   * page. A second show() while one is open answers the first with the first's `cancelId` and
   * asks the second in its place. Focus opens on the first primary button, or with none on the
   * first that is not a danger one, and returns, when the dialog closes, to the element that had
   * it when the first of these questions was asked.
   */
  show(options: ConfirmOptions): Promise<string> {
    if (this._open) {
      // Answered before the next is asked, so the awaiting code never sees two questions as one.
      // Focus stays where the first show() found it: it is in this dialog now.
      const answer = this._answer;
      this._answer = null;
      answer?.(this._options!.cancelId);
    } else {
      this._returnFocusTo = this._findActiveElement();
      document.addEventListener('keydown', this._onKeyDown, true);
    }
    this._options = options;
    this._open = true;
    this.setAttribute('open', '');
    this.updateComplete.then(() => {
      // Closed (or re-asked, and focused by that show()'s own continuation) before this render
      // landed: focusing now would pull focus into a dialog that is gone.
      if (this._open && this._options === options) this._focusInitial();
    });
    return new Promise<string>((resolve) => {
      this._answer = resolve;
    });
  }

  /** Closes the dialog, answering show() with its `cancelId`; does nothing while closed. */
  close(): void {
    if (this._open) this._finish(this._options!.cancelId);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('click', this._onBackdropClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Nothing on the page can answer it any more, and a close that awaited it would hang with
    // the window half shut. Cancel is the answer that changes nothing.
    this.close();
  }

  private _finish(id: string): void {
    const answer = this._answer;
    this._answer = null;
    this._open = false;
    this.removeAttribute('open');
    document.removeEventListener('keydown', this._onKeyDown, true);
    const target = this._returnFocusTo;
    this._returnFocusTo = null;
    // Focus first, then the answer: the code awaiting it carries on from where the user was.
    if (target && target.isConnected) target.focus();
    answer?.(id);
  }

  // Never a danger button: an autofocused Don't Save or Reload turns a reflex Enter or Space
  // into lost work. With nothing safe to focus, the dialog itself takes focus, so focus is at
  // least inside the modal and the first Tab lands on a button.
  private _focusInitial(): void {
    const buttons = this._buttons();
    const kinds = this._options!.buttons.map((b) => b.kind ?? 'normal');
    let at = kinds.indexOf('primary');
    if (at < 0) at = kinds.findIndex((kind) => kind !== 'danger');
    const target = at >= 0 ? buttons[at] : this.shadowRoot?.querySelector<HTMLElement>('.dialog');
    target?.focus();
  }

  private _buttons(): HTMLButtonElement[] {
    return Array.from(this.shadowRoot?.querySelectorAll<HTMLButtonElement>('button') ?? []);
  }

  // The element focus is on, through every shadow root on the way: the tab's own close button
  // rather than the whole tab bar it is drawn in.
  private _findActiveElement(): HTMLElement | null {
    let el = document.activeElement as HTMLElement | null;
    while (el?.shadowRoot?.activeElement) {
      el = el.shadowRoot.activeElement as HTMLElement;
    }
    return el;
  }

  // On the document, in capture, while open: Escape must answer the dialog wherever focus is, and
  // Tab must not reach the page behind the backdrop. Every other key goes on as it came.
  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === 'Tab') this._trapTab(e);
  };

  // aria-modal says nothing behind the dialog can be reached, so Tab cycles among the buttons.
  // From the dialog itself (nothing focused inside, or the all-danger case) the first Tab lands
  // on the first button and Shift+Tab on the last.
  private _trapTab(e: KeyboardEvent): void {
    const buttons = this._buttons();
    if (buttons.length === 0) return;
    e.preventDefault();
    const active = this.shadowRoot?.activeElement as HTMLButtonElement | null;
    const at = active ? buttons.indexOf(active) : -1;
    const next = at < 0
      ? (e.shiftKey ? buttons.length - 1 : 0)
      : (at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length;
    buttons[next]!.focus();
  }

  private _onBackdropClick = (e: MouseEvent): void => {
    if (e.target === this) this.close();
  };

  override render() {
    const options = this._options;
    if (!this._open || !options) return nothing;

    return html`
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="title"
        aria-describedby="message"
        tabindex="-1"
        @click=${(e: MouseEvent) => e.stopPropagation()}
      >
        <div class="title" id="title">${options.title}</div>
        <div class="body">
          <div class="message" id="message">${options.message}</div>
          ${options.detail ? html`<div class="detail">${options.detail}</div>` : nothing}
        </div>
        <div class="footer">
          ${options.buttons.map((b) => html`
            <button
              type="button"
              class=${b.kind === 'primary' || b.kind === 'danger' ? b.kind : nothing}
              @click=${() => this._finish(b.id)}
            >${b.label}</button>
          `)}
        </div>
      </div>
    `;
  }
}

/** Registers the widget as `<dex-confirm-dialog>`, or under `tag`. */
export function defineConfirmDialog(tag = 'dex-confirm-dialog'): void {
  defineElement(tag, DexConfirmDialog);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-confirm-dialog': DexConfirmDialog;
  }
}
