// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';

/** One button of the toolbar, as the app describes it. */
export interface ToolbarItem {
  /** What `dex-toolbar-action` says was pressed (its `actionId`). Unique among the items. */
  id: string;
  /** The text under the icon (beside it, compact), and the button's accessible name. */
  label: string;
  /** The `<dex-icon>` id drawn over the label (`saved`, `undo`). None draws the label alone. */
  icon?: string;
  /**
   * The icon in its file's colours even on a `mono` toolbar: for an icon whose colour is what it
   * says (the shell's blue Save, while the active file holds unsaved edits, is the grey one's
   * shape), which a glyph in one colour would lose. Default false: the toolbar's style.
   */
  colorful?: boolean;
  /** The tooltip. Default the label, with the shortcut after it in brackets when there is one. */
  title?: string;
  /**
   * The chord that does the same, as the app writes it for the platform (`⌘S`, `Ctrl+S`): shown in
   * the default tooltip only. The toolbar listens for no key; the app binds the chord itself.
   */
  shortcut?: string;
  /** Greyed, and a click sends nothing. It stays where the keyboard can reach it. */
  disabled?: boolean;
  /**
   * The item's group. A separator goes wherever two neighbours on the same side have different
   * groups. The items keep the order given, so an app gives a group's items together: a group
   * handed over in two runs is drawn as two. No group and `''` are the same: one group more, so
   * items with none sit together with no separator between them.
   */
  group?: string;
  /**
   * The side of the row: `end` items go to the right, after a spacer (the shell's Undo …
   * Delete). Default `start`.
   */
  align?: 'start' | 'end';
}

/** What `dex-toolbar-action` carries: the `id` of the item pressed. */
export interface ToolbarActionDetail {
  actionId: string;
}

/** The items as the row draws them: the start side, then the end side, each in the order given. */
function sidesOf(items: unknown): { start: ToolbarItem[]; end: ToolbarItem[] } {
  const all = Array.isArray(items) ? (items as ToolbarItem[]) : [];
  return { start: all.filter((item) => item.align !== 'end'), end: all.filter((item) => item.align === 'end') };
}

/**
 * A row of buttons, the items an app hands it: each an icon over a small label (beside it with
 * `compact`, and in the label's colour with `mono`, but for an item that is `colorful`), the items of a group together with a separator
 * between groups, and the `end` items pushed to the right. A click on an item that is not disabled
 * sends `dex-toolbar-action` with its id; a disabled item is greyed and sends nothing. Each item's
 * tooltip is its `title`, or its label and shortcut.
 *
 * The toolbar is one tab stop: the arrow keys move along the items, disabled ones included, and
 * wrap at either end; Home and End go to the first and the last; Enter and Space press the one the
 * keyboard is on. A mouse press takes no focus: it stays where the user was working. So an edit
 * open in a table's cell stays open too (the table commits one as its editor loses the focus), and
 * the app commits it, with connectTable's `handle.commitEdit()`, before it acts on
 * `dex-toolbar-action`. The toolbar knows nothing of files or tables: the app gives it new `items`
 * as what they can do changes, and does what `dex-toolbar-action` asks.
 *
 * @tagname dex-toolbar
 */
export class DexToolbar extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
    :host {
      display: block;
      background: var(--dex-bg-toolbar, #fff);
      color: var(--dex-color-text, #333);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
    }

    /* The prototype's row: 46px buttons in a 48px band. */
    .bar {
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 1px 6px;
    }

    :host([compact]) .bar {
      gap: 1px;
      padding: 2px 4px;
    }

    /* An icon over its label. A button never shrinks below its label: a narrow window clips the
       row at its end rather than squeezing every label into an ellipsis. */
    button {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 1px;
      flex-shrink: 0;
      min-width: 44px;
      height: 46px;
      padding: 4px 8px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: none;
      color: inherit;
      font: inherit;
      font-size: 10px;
      line-height: 1.2;
      white-space: nowrap;
      cursor: pointer;
    }

    :host([compact]) button {
      flex-direction: row;
      gap: 4px;
      min-width: 0;
      height: 24px;
      padding: 2px 5px;
      font-size: 11px;
    }

    button:hover:not([aria-disabled='true']) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    button:active:not([aria-disabled='true']) {
      background: var(--dex-bg-active, #e0e0e0);
    }

    button[aria-disabled='true'] {
      cursor: default;
    }

    /* The content greyed and not the button: the focus ring is drawn by the button, and the
       keyboard can stand on a disabled item, where a ring at .4 would be the one hardest to see. */
    button[aria-disabled='true'] > * {
      opacity: 0.4;
    }

    dex-icon {
      flex-shrink: 0;
    }

    .separator {
      flex-shrink: 0;
      width: 1px;
      height: 28px;
      margin: 0 4px;
      background: var(--dex-border-color-light, #e0e0e0);
    }

    :host([compact]) .separator {
      height: 16px;
    }

    .spacer {
      flex: 1;
    }

    /* The shared rules grey a disabled <button>, which these are not: theirs is aria-disabled. */
    @media (forced-colors: active) {
      button[aria-disabled='true'] {
        border-color: GrayText !important;
        color: GrayText !important;
      }

      .separator {
        background: CanvasText;
      }
    }
  `];

  /**
   * The buttons, in order: the `start` items from the left, then the `end` items from the right
   * edge, each side in the order given. Replace the array to change them; an item keeps its
   * button, and the keyboard's place on it, while its `id` stays, and an item that goes while the
   * keyboard is on it hands the focus to the one that takes its place. Default none.
   */
  @property({ attribute: false }) items: ToolbarItem[] = [];
  /**
   * The compact layout: each icon (14px rather than 18) beside its label, in a lower row.
   * Attribute `compact`, reflected so a page's stylesheet can follow it.
   */
  @property({ type: Boolean, reflect: true }) compact = false;
  /**
   * Draws each item's icon in one colour, its label's (`<dex-icon mono>`), as the prototype's
   * toolbar drew its glyphs, but for an item that is `colorful`; off, the default, draws them in
   * their files' colours. A disabled item's icon is greyed with its label either way. Attribute `mono`, reflected so a page's
   * stylesheet can follow it.
   */
  @property({ type: Boolean, reflect: true }) mono = false;
  /**
   * What a screen reader calls the toolbar, so a page with more than one can tell them apart.
   * Default `Toolbar`. Attribute `label`.
   */
  @property({ type: String }) label = 'Toolbar';

  // The item the keyboard was last on, by id: the row's one tab stop while it is there, so Tab
  // away and back returns to it. Null, or an id no item has any more, makes it the first.
  @state() private _focusId: string | null = null;
  // The button the focus goes to once the row is drawn, by its place in the row, or -1: set when
  // new items drop the one the focus is on.
  private _refocusAt = -1;

  // New items without the one the focus is on would take its button away, and the focus would
  // fall to the page's body: the keyboard user would have to find the toolbar again. So the focus
  // goes to the item that takes its place (the one before it, when it was the last). Only while
  // the focus is in the toolbar: anywhere else it is the user's, and only the tab stop moves.
  // Decided here, before the old buttons go, and the stop set now so the redraw already has it.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has('items') || !this._focusId || !this.shadowRoot?.activeElement) return;
    const { start, end } = sidesOf(this.items);
    const ordered = [...start, ...end];
    if (ordered.length === 0 || ordered.some((item) => item.id === this._focusId)) return;
    const before = sidesOf(changed.get('items'));
    const was = [...before.start, ...before.end].findIndex((item) => item.id === this._focusId);
    const at = Math.min(Math.max(0, was), ordered.length - 1);
    this._focusId = ordered[at]!.id;
    this._refocusAt = at;
  }

  protected override updated(): void {
    if (this._refocusAt < 0) return;
    const at = this._refocusAt;
    this._refocusAt = -1;
    this.renderRoot.querySelectorAll<HTMLButtonElement>('button')[at]?.focus();
  }

  private _press(item: ToolbarItem): void {
    // aria-disabled leaves the button pressable, by the mouse and by Enter or Space: this is
    // where a disabled item is refused.
    if (item.disabled) return;
    this.dispatchEvent(new CustomEvent<ToolbarActionDetail>('dex-toolbar-action', {
      detail: { actionId: item.id },
      bubbles: true,
      composed: true,
    }));
  }

  // The arrows, Home and End move the focus; Enter and Space are not touched, because the native
  // button turns them into the click that presses it, in every browser and for every assistive
  // technology, and a handler of ours would have to fire the action itself and refuse the click.
  private _onKeydown(e: KeyboardEvent): void {
    // A chord is the page's, not a move along the row: the shell's Back, Forward and Up are
    // Alt+Left, Alt+Right and Alt+Up, and must work with the keyboard on the toolbar too.
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const all = [...this.renderRoot.querySelectorAll<HTMLButtonElement>('button')];
    if (all.length === 0) return;
    const at = all.indexOf((e.target as Element).closest('button') as HTMLButtonElement);
    let to: number;
    switch (e.key) {
      case 'ArrowRight':
        to = (at + 1) % all.length;
        break;
      case 'ArrowLeft':
        to = at <= 0 ? all.length - 1 : at - 1;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = all.length - 1;
        break;
      default:
        return;
    }
    // Ours, not the page's: an arrow key would otherwise scroll whatever holds the shell.
    e.preventDefault();
    all[to]!.focus();
  }

  // A mouse press moves the focus onto the button pressed, and that is refused here (the click
  // still comes, and presses it): a toolbar Delete or Paste must leave the table it acts on
  // focused, so that the arrow keys go on moving in the table rather than along the toolbar. The
  // keyboard is unaffected, since Tab and the arrow keys focus a button without any mousedown.
  private _onMousedown(e: MouseEvent): void {
    e.preventDefault();
  }

  private _tooltipFor(item: ToolbarItem): string {
    if (item.title) return item.title;
    return item.shortcut ? `${item.label} (${item.shortcut})` : item.label;
  }

  // aria-disabled, not the disabled attribute: a disabled <button> leaves the tab order and takes
  // no focus, so Undo would vanish from the keyboard exactly when there is nothing to undo, and
  // nobody not using a mouse would learn that it is there.
  private _button(item: ToolbarItem, tabbable: boolean) {
    return html`
      <button
        type="button"
        title=${this._tooltipFor(item)}
        aria-disabled=${item.disabled ? 'true' : 'false'}
        tabindex=${tabbable ? '0' : '-1'}
        @mousedown=${this._onMousedown}
        @click=${() => this._press(item)}
        @focus=${() => (this._focusId = item.id)}
      >
        ${item.icon ? html`<dex-icon .iconId=${item.icon} .size=${this.compact ? 14 : 18} .mono=${this.mono && !item.colorful}></dex-icon>` : nothing}
        <span class="label">${item.label}</span>
      </button>
    `;
  }

  // One side of the row. Keyed by id, so an app that hands over the same items with one of them
  // now enabled moves no button: the focus stays on the element it was on. The separator is part
  // of the item after it, which is why none can come first, and the spacer between the two sides
  // is why none is drawn across them.
  private _side(items: ToolbarItem[], tabStop: ToolbarItem | undefined) {
    return repeat(
      items,
      (item) => item.id,
      (item, i) => html`
        ${i > 0 && (items[i - 1]!.group ?? '') !== (item.group ?? '')
          ? html`<div class="separator" role="separator" aria-orientation="vertical"></div>`
          : nothing}
        ${this._button(item, item === tabStop)}
      `,
    );
  }

  override render() {
    const { start, end } = sidesOf(this.items);
    const ordered = [...start, ...end];
    // One item, not one id: two items an app gave the same id would otherwise both be the stop.
    const tabStop = ordered.find((item) => item.id === this._focusId) ?? ordered[0];
    return html`
      <div class="bar" role="toolbar" aria-label=${this.label} @keydown=${this._onKeydown}>
        ${this._side(start, tabStop)}
        <div class="spacer" aria-hidden="true"></div>
        ${this._side(end, tabStop)}
      </div>
    `;
  }
}

/** Registers the widget as `<dex-toolbar>`, or under `tag`, and the `<dex-icon>` its buttons draw. */
export function defineToolbar(tag = 'dex-toolbar'): void {
  defineIcon();
  defineElement(tag, DexToolbar);
}

/**
 * The events `<dex-toolbar>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface ToolbarEventMap {
  /**
   * An item that is not disabled was pressed, by a click, Enter or Space: its `id`. A name of its
   * own, not the context menu's `dex-action`, so each event has one declaration and a page that
   * listens on the document tells a toolbar press from a menu choice.
   */
  'dex-toolbar-action': CustomEvent<ToolbarActionDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-toolbar': DexToolbar;
  }
  interface HTMLElementEventMap extends ToolbarEventMap {}
  interface DocumentEventMap extends ToolbarEventMap {}
  interface WindowEventMap extends ToolbarEventMap {}
}
