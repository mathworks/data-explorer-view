// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
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

/** What prompt() asks: a question with one line of text to type. */
export interface PromptOptions {
  /** The dialog's title, which is also its accessible name. */
  title: string;
  /** What to type, said above the field. */
  message: string;
  /** The field's label, drawn before it and read as its name. */
  label: string;
  /** What the field holds as the dialog opens, selected. Default ''. */
  value?: string;
  /** The field's placeholder. */
  placeholder?: string;
  /** 'url' gives a phone its address keyboard and turns off spelling and autofill. Default 'text'. */
  type?: 'text' | 'url';
  /** The button that answers with the text (the primary one), disabled while the field is blank. */
  okLabel: string;
  /** Default 'Cancel'. */
  cancelLabel?: string;
}

/** The question open: one at a time, of either kind. */
type Question = { kind: 'confirm'; options: ConfirmOptions } | { kind: 'prompt'; options: PromptOptions };

/** What a question is answered with when it closes without its answer: show()'s cancelId, prompt()'s null. */
const cancelOf = (question: Question): string | null => (question.kind === 'confirm' ? question.options.cancelId : null);

/**
 * A question with buttons, asked in the page for a host that has no dialogs of its own (a
 * browser page): "Save changes to x before closing?", "x changed on disk". show() opens it and
 * resolves to the id of the button pressed; Escape, a click outside it and close() resolve to the
 * question's `cancelId`, and focus goes back where it was. It opens focused on the primary
 * button, never on a danger one, and Tab stays among its buttons while it is open. prompt() asks
 * for a line of text in the same dialog ("Open from URL"), a host having no prompt of its own
 * either: it resolves to the text typed, or null, opens focused on the field and keeps Tab among
 * the field and its buttons. One question is open at a time, of either kind. It sends no events:
 * the promise is the answer.
 *
 * It paints at z-index 10000, as `<dex-error-dialog>` does, so where both are open the one later
 * in the document is on top: append it last in the body, outside any element that makes a
 * stacking context of its own.
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

    button:hover:not(:disabled) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The prompt's primary button while its field is blank: there is nothing yet to answer. */
    button:disabled {
      cursor: default;
      opacity: 0.5;
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

    button.primary:hover:not(:disabled) {
      background: var(--dex-color-accent-hover, #005a9e);
      border-color: var(--dex-color-accent-hover, #005a9e);
    }

    /* As the error dialog's Revert: an answer that throws work away is told apart before it is
       pressed. */
    button.danger {
      color: var(--dex-color-error, #d32f2f);
      border-color: var(--dex-color-error, #d32f2f);
    }

    /* The prompt's field, under the message, its label before it on the same line. */
    .field {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }

    label {
      flex: none;
    }

    /* Drawn as the buttons are, and ringed as they are on focus. In forced colours the shared
       high-contrast styles give it a border and an outline of the system's colours. */
    input {
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 3px;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font: inherit;
    }

    input:focus {
      outline: none;
      box-shadow: var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }
  `];

  // What show() or prompt() fills in: state, not properties, since they are the ways in.
  @state() private _question: Question | null = null;
  @state() private _open = false;
  // What the prompt's field holds, as typed.
  @state() private _text = '';
  private _answer: ((answer: string | null) => void) | null = null;
  private _returnFocusTo: HTMLElement | null = null;
  // Whether the press that the coming click ends began on the backdrop itself.
  private _pressedOnBackdrop = false;

  /**
   * Opens the dialog with `options` and resolves to the id of the button pressed, or to
   * `options.cancelId` on Escape, a click on the backdrop, close(), or the element leaving the
   * page. A second show() while one is open answers the first with the first's `cancelId` and
   * asks the second in its place. Focus opens on the first primary button, or with none on the
   * first that is not a danger one, and returns, when the dialog closes, to the element that had
   * it when the first of these questions was asked. On an element that is not on the page it
   * resolves to `cancelId` at once.
   */
  show(options: ConfirmOptions): Promise<string> {
    // A question's every answer is a string: a button's id, or its cancelId.
    return this._ask({ kind: 'confirm', options }) as Promise<string>;
  }

  /**
   * Opens the dialog with a text field and resolves to the text typed, trimmed, when the primary
   * button is pressed or Enter is pressed in the field (never blank); null on Cancel, Escape, a
   * click on the backdrop, close(), a show() or prompt() asked in its place, or the element leaving
   * the page. As show(), it answers a question still open with that question's cancel, opens
   * focused (on the field), keeps Tab inside, and gives the focus back when it closes.
   */
  prompt(options: PromptOptions): Promise<string | null> {
    return this._ask({ kind: 'prompt', options });
  }

  /** Closes the dialog, answering show() with its `cancelId` and prompt() with null; does nothing while closed. */
  close(): void {
    if (this._open) this._finish(cancelOf(this._question!));
  }

  private _ask(question: Question): Promise<string | null> {
    // Off the page nobody could see the question or answer it, and leaving the page is what
    // answers an open one with its cancel (disconnectedCallback): the same answer, at once, and no
    // key listener left on the document for an element that is not there.
    if (!this.isConnected) return Promise.resolve(cancelOf(question));
    if (this._open) {
      // Answered before the next is asked, so the awaiting code never sees two questions as one.
      // Focus stays where the first question found it: it is in this dialog now.
      const answer = this._answer;
      this._answer = null;
      answer?.(cancelOf(this._question!));
    } else {
      this._returnFocusTo = this._findActiveElement();
      document.addEventListener('keydown', this._onKeyDown, true);
    }
    this._question = question;
    if (question.kind === 'prompt') this._text = question.options.value ?? '';
    this._open = true;
    this.setAttribute('open', '');
    this.updateComplete.then(() => {
      // Closed (or re-asked, and focused by that question's own continuation) before this render
      // landed: focusing now would pull focus into a dialog that is gone.
      if (this._open && this._question === question) this._focusInitial();
    });
    return new Promise<string | null>((resolve) => {
      this._answer = resolve;
    });
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('pointerdown', this._onPointerDown);
    this.addEventListener('click', this._onBackdropClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // Nothing on the page can answer it any more, and a close that awaited it would hang with
    // the window half shut. Cancel is the answer that changes nothing.
    this.close();
  }

  private _finish(id: string | null): void {
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
  // A prompt opens on its field, its text selected, so typing replaces what it was given.
  private _focusInitial(): void {
    const question = this._question!;
    if (question.kind === 'prompt') {
      const field = this.shadowRoot?.querySelector<HTMLInputElement>('#field');
      field?.focus();
      field?.select();
      return;
    }
    const buttons = this._buttons();
    const kinds = question.options.buttons.map((b) => b.kind ?? 'normal');
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
  // Tab must not reach the page behind the backdrop. Every other key is left to do what it does
  // (Enter presses the focused button); one pressed inside the dialog is then stopped at the
  // dialog by its keydown binding in render(), so the page's own listeners on the way up (the
  // context menu's arrows and Enter, the table's shortcuts) never act on what is behind a modal.
  private _onKeyDown = (e: KeyboardEvent): void => {
    if (!this._open) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === 'Tab') this._trapTab(e);
  };

  // aria-modal says nothing behind the dialog can be reached, so Tab cycles among what takes focus
  // in it, in the order drawn: the buttons, and a prompt's field before them. A disabled button
  // takes no focus and is passed over. From the dialog itself (nothing focused inside, or the
  // all-danger case) the first Tab lands on the first and Shift+Tab on the last.
  private _trapTab(e: KeyboardEvent): void {
    const stops = Array.from(this.shadowRoot?.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input, button') ?? []).filter((el) => !el.disabled);
    if (stops.length === 0) return;
    e.preventDefault();
    const active = this.shadowRoot?.activeElement as HTMLInputElement | HTMLButtonElement | null;
    const at = active ? stops.indexOf(active) : -1;
    const next = at < 0
      ? (e.shiftKey ? stops.length - 1 : 0)
      : (at + (e.shiftKey ? -1 : 1) + stops.length) % stops.length;
    stops[next]!.focus();
  }

  // The prompt's answer: what was typed, trimmed. Blank is no answer, and the dialog stays open.
  private _submit(): void {
    const text = this._text.trim();
    if (text) this._finish(text);
  }

  // Enter in the field answers, as a form's submit would. Not while an input method is composing:
  // its Enter commits the composed text.
  private _onFieldKeydown = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' || e.isComposing) return;
    e.preventDefault();
    this._submit();
  };

  // A click is sent to the nearest element holding both the press and the release, so a drag
  // that selects the file's name in the message and lets go over the backdrop clicks the host,
  // past the dialog's own guard. Only a press that began on the backdrop cancels: composedPath,
  // since a listener on the host sees every press inside its shadow root retargeted to itself.
  private _onPointerDown = (e: PointerEvent): void => {
    this._pressedOnBackdrop = e.composedPath()[0] === this;
  };

  private _onBackdropClick = (e: MouseEvent): void => {
    const pressed = this._pressedOnBackdrop;
    this._pressedOnBackdrop = false;
    if (pressed && e.target === this && e.composedPath()[0] === this) this.close();
  };

  override render() {
    const question = this._question;
    if (!this._open || !question) return nothing;
    if (question.kind === 'prompt') return this._renderPrompt(question.options);
    const { options } = question;

    return html`
      <div
        class="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="title"
        aria-describedby="message"
        tabindex="-1"
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
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

  // A dialog, not an alertdialog: it asks for something, and nothing has gone wrong. The field
  // keeps its value in `_text` (live, since the user types into it between renders).
  private _renderPrompt(options: PromptOptions) {
    const type = options.type ?? 'text';
    return html`
      <div
        class="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="title"
        aria-describedby="message"
        tabindex="-1"
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
      >
        <div class="title" id="title">${options.title}</div>
        <div class="body">
          <div class="message" id="message">${options.message}</div>
          <div class="field">
            <label for="field">${options.label}</label>
            <input
              id="field"
              type=${type}
              autocomplete="off"
              spellcheck="false"
              placeholder=${options.placeholder ?? nothing}
              .value=${live(this._text)}
              @input=${(e: Event) => {
                this._text = (e.target as HTMLInputElement).value;
              }}
              @keydown=${this._onFieldKeydown}
            />
          </div>
        </div>
        <div class="footer">
          <button type="button" class="primary" ?disabled=${!this._text.trim()} @click=${() => this._submit()}>${options.okLabel}</button>
          <button type="button" @click=${() => this._finish(null)}>${options.cancelLabel ?? 'Cancel'}</button>
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
