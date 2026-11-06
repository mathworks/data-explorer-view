// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing, type TemplateResult } from 'lit';
import { state } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import { rankCommands, type Ranked } from '../../../model/shell/fuzzy.js';

/** One command the palette lists, as the app describes it. */
export interface PaletteCommand {
  /** What `dex-palette-run` sends when it is run. Unique among the commands. */
  id: string;
  /** What its row reads, and what the typed letters are matched against first. */
  label: string;
  /** Its group (File, Edit, View), drawn after the label in a quieter ink, and matched when the label is not. */
  category?: string;
  /**
   * The chord that does the same, as the app writes it for the platform (`⌘S`, `Ctrl+S`), drawn
   * at the row's end. The palette listens for no chord; the app binds it itself.
   */
  shortcut?: string;
  /** Greyed, and neither Enter nor a click runs it. It is still listed, and the arrows reach it. */
  disabled?: boolean;
}

/** What `dex-palette-run` carries: the `id` of the command run. */
export interface PaletteRunDetail {
  id: string;
}

// Enough to bring back what a person is in the middle of (Save, the Explorer and back), few
// enough that the list under them keeps the app's own order. Kept by the element, in memory:
// the app keeps nothing, and a new page starts with none.
const RECENT_MAX = 5;

/**
 * The shell's command palette: a box at the top of the window, over the page, in which a few
 * typed letters find a command. show() opens it with the commands to offer; the list follows
 * the typing, labels that begin with the query first, then those whose words it begins, then
 * those that merely hold its letters in order (the letters matched are drawn in bold), and the
 * commands run lately come first among equals and first of all before anything is typed.
 * ArrowUp and ArrowDown move the active row, wrapping; Enter or a click runs it, which closes
 * the palette and sends `dex-palette-run`. A disabled command is greyed and runs on neither, and
 * the list opens on the first that can run. Escape, a click outside it and close() close it,
 * sending nothing.
 *
 * It is a modal, as `<dex-confirm-dialog>` is: while it is open Tab stays in its input, no key
 * pressed in it reaches the page, and Escape is heard wherever the focus is. When it closes the
 * focus goes back where it was, before `dex-palette-run` is sent, so a command that moves the
 * focus itself (showing the Explorer) keeps it there. It paints at z-index 10000, as the dialogs
 * do: append it last in the body, outside any element that makes a stacking context of its own.
 *
 * @tagname dex-command-palette
 */
export class DexCommandPalette extends LitElement {
  static override styles = [hiddenStyles, highContrastStyles, css`
    :host {
      display: none;
    }

    /* The host is the backdrop, lighter than the dialogs': the palette asks no question, and the
       page under it is still what the commands act on. */
    :host([open]) {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 10000;
      background: rgba(0, 0, 0, 0.3);
    }

    /* In the top third, centred, as the prototype placed it: under the toolbar, where the
       eye already is, and with room below for the list to grow. */
    .palette {
      position: absolute;
      top: 15%;
      left: 50%;
      transform: translateX(-50%);
      box-sizing: border-box;
      width: 500px;
      max-width: calc(100vw - 32px);
      display: flex;
      flex-direction: column;
      background: var(--dex-bg-primary, #fff);
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 8px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      overflow: hidden;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
      animation: paletteIn 0.12s ease-out;
    }

    @keyframes paletteIn {
      from {
        opacity: 0;
        transform: translateX(-50%) translateY(-8px);
      }
      to {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .palette {
        animation: none;
      }
    }

    .search {
      padding: 12px;
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
    }

    /* The project page's text field: the same ink, surface and border tokens, so a field reads
       as one wherever it is. On :focus and not only :focus-visible: the palette puts the focus
       here itself, and the ring is what says typing goes here. */
    input {
      box-sizing: border-box;
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--dex-input-border, #c8c8c8);
      border-radius: 4px;
      background: var(--dex-input-bg, #fff);
      color: var(--dex-input-fg, #333);
      font: inherit;
      font-size: 14px;
      outline: none;
    }

    input::placeholder {
      color: var(--dex-input-placeholder-fg, #767676);
    }

    input:focus {
      border-color: var(--dex-color-accent, #0078d4);
      box-shadow: var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    .list {
      max-height: 340px;
      overflow-y: auto;
      padding: 4px 0;
    }

    .option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 16px;
      cursor: pointer;
      user-select: none;
    }

    .option:hover:not(.disabled) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The active row is the selection, surface and ink together as the table's selected row,
       rather than the prototype's white on the accent: white on the dark set's light accent
       reads at 2.7:1. The pointer's row is only the hover grey, so the row Enter runs is never
       in doubt with the pointer resting on another. */
    .option[aria-selected='true'] {
      background: var(--dex-color-accent-bg, #cde4f7);
      color: var(--dex-selection-fg, #333);
    }

    .option.disabled {
      color: var(--dex-color-text-disabled, #999);
      cursor: default;
    }

    .label {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* Weight alone, not the accent's ink: the accent on the active row's accent surface is
       under 4:1. */
    .hit {
      font-weight: 600;
    }

    .category {
      flex: 0 0 auto;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    .shortcut {
      flex: 0 0 auto;
      font-family: var(--dex-font-mono, 'SF Mono', 'Menlo', 'Monaco', monospace);
      font-size: 12px;
      color: var(--dex-color-text-secondary, #555);
      white-space: nowrap;
    }

    /* A disabled row's every part in the disabled ink, its category and shortcut included. */
    .option.disabled .category,
    .option.disabled .shortcut {
      color: inherit;
    }

    .empty {
      padding: 16px;
      text-align: center;
      color: var(--dex-color-text-muted, #666);
    }

    /* Forced colours repaint the selection surface like any other: the system's own selection
       colours keep the active row apart. */
    @media (forced-colors: active) {
      .option[aria-selected='true'] {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
      }

      .option.disabled {
        color: GrayText;
      }
    }
  `];

  // What show() fills in: state, not properties, since show() is the one way in.
  @state() private _open = false;
  @state() private _commands: PaletteCommand[] = [];
  @state() private _query = '';
  // The active row's index in the ranked list; -1 with no rows.
  @state() private _active = -1;

  // Latest first, ids. Not state: it changes the list only at the next show().
  private _recent: string[] = [];
  // The ranked list for the query and the commands it was ranked from, so a key press between
  // the typing and its render reads the list the typing made.
  private _ranked: { query: string; commands: PaletteCommand[]; list: Ranked<PaletteCommand>[] } | null = null;
  private _returnFocusTo: HTMLElement | null = null;
  // Whether the press that the coming click ends began on the backdrop itself.
  private _pressedOnBackdrop = false;
  // Set by a key or a query that moves the active row: the render it causes scrolls that row into view.
  private _reveal = false;

  /** Whether it is open: from show() until a command runs, Escape, a click outside it or close(). The `open` attribute says the same, for styling. */
  get open(): boolean {
    return this._open;
  }

  /**
   * Opens the palette over the page with `commands` (a list that is not an array is none), an
   * empty query and the focus in its input, on the first command that can run. Open already, it
   * takes the new commands and starts the query afresh, and the focus will still go back where it
   * was before the first show(). Not on the page, it does not open.
   */
  show(commands: PaletteCommand[]): void {
    // Off the page nobody could see it, and the key listener it puts on the document would trap
    // Tab for an element that is not there.
    if (!this.isConnected) return;
    if (!this._open) {
      this._returnFocusTo = this._findActiveElement();
      document.addEventListener('keydown', this._onDocumentKeyDown, true);
    }
    this._commands = Array.isArray(commands) ? commands : [];
    this._query = '';
    // Ranked afresh, even for the same commands and query as the last: what ran since reorders them.
    this._ranked = null;
    this._open = true;
    this.setAttribute('open', '');
    this._active = this._firstRunnable();
    const shown = this._commands;
    this.updateComplete.then(() => {
      // Closed (or shown again, and focused by that show()'s own continuation) before this render
      // landed: focusing now would pull focus into a palette that is gone.
      if (this._open && this._commands === shown) this._input()?.focus();
    });
  }

  /** Closes the palette, sending nothing; does nothing while closed. */
  close(): void {
    if (!this._open) return;
    this._open = false;
    this.removeAttribute('open');
    document.removeEventListener('keydown', this._onDocumentKeyDown, true);
    const target = this._returnFocusTo;
    this._returnFocusTo = null;
    if (target && target.isConnected) target.focus();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener('pointerdown', this._onPointerDown);
    this.addEventListener('click', this._onBackdropClick);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // The key listener on the document would trap Tab for a palette nobody can see.
    this.close();
  }

  protected override updated(): void {
    if (!this._reveal) return;
    this._reveal = false;
    this.shadowRoot?.querySelector<HTMLElement>('.option[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  private _list(): Ranked<PaletteCommand>[] {
    const r = this._ranked;
    if (r && r.query === this._query && r.commands === this._commands) return r.list;
    const list = rankCommands(this._commands, this._query, this._recent);
    this._ranked = { query: this._query, commands: this._commands, list };
    return list;
  }

  // The first row that can run, so typing and Enter at once runs something; with none that can,
  // the first row all the same, so the list is still read out as the arrows would read it.
  private _firstRunnable(): number {
    const list = this._list();
    const at = list.findIndex((r) => !r.item.disabled);
    return at >= 0 ? at : list.length > 0 ? 0 : -1;
  }

  private _input(): HTMLInputElement | null {
    return this.shadowRoot?.querySelector('input') ?? null;
  }

  // Focus first, then the event, as the confirm dialog answers: the app carries on from where
  // the user was, and a command that moves the focus is not undone by the palette moving it back.
  private _run(command: PaletteCommand): void {
    if (command.disabled) return;
    this._recent = [command.id, ...this._recent.filter((id) => id !== command.id)].slice(0, RECENT_MAX);
    this.close();
    this.dispatchEvent(new CustomEvent<PaletteRunDetail>('dex-palette-run', {
      detail: { id: command.id },
      bubbles: true,
      composed: true,
    }));
  }

  // A new query lists new rows under a list that may be scrolled far down from the last one's:
  // the row Enter would run is brought into view.
  private _onInput(e: Event): void {
    this._query = (e.target as HTMLInputElement).value;
    this._active = this._firstRunnable();
    this._reveal = true;
  }

  // The input's own keys: the arrows move the active row (kept from the caret, which they would
  // otherwise move to the ends), Enter runs it. Every other key is the input's: typing, Home and
  // End, copy and paste. Enter that ends an IME composition is the input method's.
  private _onInputKeyDown(e: KeyboardEvent): void {
    const list = this._list();
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (list.length === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const from = this._active < 0 ? (step > 0 ? -1 : 0) : this._active;
      this._active = (from + step + list.length) % list.length;
      this._reveal = true;
      return;
    }
    if (e.key === 'Enter' && !e.isComposing) {
      e.preventDefault();
      const row = list[this._active];
      if (row) this._run(row.item);
    }
  }

  // On the document, in capture, while open: Escape must close the palette wherever the focus is,
  // and Tab must not reach the page behind the backdrop. Every other key goes on to the input,
  // and is then stopped at the palette by its keydown binding in render(), so the page's own
  // listeners on the way up never act on what is behind a modal. An Escape that cancels an IME
  // composition is the input method's.
  private _onDocumentKeyDown = (e: KeyboardEvent): void => {
    if (!this._open) return;
    if (e.key === 'Escape' && !e.isComposing) {
      e.stopPropagation();
      this.close();
      return;
    }
    if (e.key === 'Tab') {
      // The input is the palette's one control: Tab has nowhere else to go.
      e.preventDefault();
      this._input()?.focus();
    }
  };

  // A click is sent to the nearest element holding both the press and the release, so a drag
  // that selects the typed text and lets go over the backdrop clicks the host. Only a press that
  // began on the backdrop closes: composedPath, since a listener on the host sees every press
  // inside its shadow root retargeted to itself.
  private _onPointerDown = (e: PointerEvent): void => {
    this._pressedOnBackdrop = e.composedPath()[0] === this;
  };

  private _onBackdropClick = (e: MouseEvent): void => {
    const pressed = this._pressedOnBackdrop;
    this._pressedOnBackdrop = false;
    if (pressed && e.target === this && e.composedPath()[0] === this) this.close();
  };

  // A press in the list keeps the focus in the input, which a press on a row (no control) would
  // take to the body: a click on a disabled row leaves the palette open, and typing must go on.
  private _onListMouseDown(e: MouseEvent): void {
    e.preventDefault();
  }

  // The label, with each run of the characters the query matched in a span of its own.
  private _label(label: string, positions: number[]): string | (string | TemplateResult)[] {
    if (positions.length === 0) return label;
    const hit = new Set(positions);
    const parts: (string | TemplateResult)[] = [];
    for (let i = 0; i < label.length;) {
      const matched = hit.has(i);
      let j = i;
      while (j < label.length && hit.has(j) === matched) j++;
      const text = label.slice(i, j);
      parts.push(matched ? html`<span class="hit">${text}</span>` : text);
      i = j;
    }
    return parts;
  }

  override render() {
    if (!this._open) return nothing;
    const list = this._list();
    const active = list[this._active] ? `option-${this._active}` : undefined;

    return html`
      <div
        class="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        @click=${(e: MouseEvent) => e.stopPropagation()}
        @keydown=${(e: KeyboardEvent) => e.stopPropagation()}
      >
        <div class="search">
          <input
            type="text"
            role="combobox"
            aria-label="Command"
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls="list"
            aria-activedescendant=${active ?? nothing}
            placeholder="Type a command"
            autocomplete="off"
            spellcheck="false"
            .value=${live(this._query)}
            @input=${this._onInput}
            @keydown=${this._onInputKeyDown}
          />
        </div>
        <div
          class="list"
          id="list"
          role="listbox"
          aria-label="Commands"
          @mousedown=${this._onListMouseDown}
        >
          ${list.map(({ item, positions }, i) => html`
            <div
              class="option${item.disabled ? ' disabled' : ''}"
              id=${`option-${i}`}
              role="option"
              aria-selected=${i === this._active ? 'true' : 'false'}
              aria-disabled=${item.disabled ? 'true' : nothing}
              @click=${() => this._run(item)}
            >
              <span class="label">${this._label(item.label, positions)}</span>
              ${item.category ? html`<span class="category">${item.category}</span>` : nothing}
              ${item.shortcut ? html`<span class="shortcut">${item.shortcut}</span>` : nothing}
            </div>
          `)}
        </div>
        ${list.length === 0 ? html`<div class="empty">No matching commands</div>` : nothing}
      </div>
    `;
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
}

/** Registers the widget as `<dex-command-palette>`, or under `tag`. */
export function defineCommandPalette(tag = 'dex-command-palette'): void {
  defineElement(tag, DexCommandPalette);
}

/**
 * The events `<dex-command-palette>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface CommandPaletteEventMap {
  /**
   * A command was run, by Enter on its row or a click on it: do it. The palette has closed, and
   * the focus is back where it was before the palette opened. Never sent for a disabled command.
   */
  'dex-palette-run': CustomEvent<PaletteRunDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-command-palette': DexCommandPalette;
  }
  interface HTMLElementEventMap extends CommandPaletteEventMap {}
  interface DocumentEventMap extends CommandPaletteEventMap {}
  interface WindowEventMap extends CommandPaletteEventMap {}
}
