// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles, menuitemFocusRingStyles, tabRoleFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';

/** One tab of the row: an open document, as the app names it. */
export interface DocTab {
  /** What the requests name the tab by. Unique in the row. */
  id: string;
  /** The text on the tab: the file's name, or the part of it the tab shows (with the file as `subtitle`). */
  label: string;
  /**
   * Smaller, muted text drawn before the icon and the label: the file's name, while the label names
   * a part of it (a dictionary's `Design Data`), so the tab reads as a path does. None, none.
   */
  subtitle?: string;
  /** An icon id drawn before the label, at 14px (`simulink_database`). None, no icon. */
  icon?: string;
  /** The tooltip: the file's whole path, say. The label when there is none. */
  title?: string;
  /** Unsaved changes: ● in place of × until the pointer or the keyboard is on the tab. */
  dirty?: boolean;
  /** A preview tab, which the next document opened replaces: its label is italic. */
  preview?: boolean;
}

/** What `dex-tab-select` carries: the tab to show. */
export interface TabSelectDetail {
  id: string;
}

/** What `dex-tab-close` carries: the tab to close. */
export interface TabCloseDetail {
  id: string;
}

/** What `dex-tab-pin` carries: the tab to keep, no longer a preview. */
export interface TabPinDetail {
  id: string;
}

/**
 * What `dex-tab-move` carries: the tab dragged, and its index once moved, which is the index of the
 * tab it was dropped on. Remove it from `tabs`, then insert it at `index`.
 */
export interface TabMoveDetail {
  id: string;
  index: number;
}

// The type a tab's drag carries its id under. One of the app's own, so a drag of anything else (a
// file from the desktop, text from another page) never reads as a tab.
const TAB_TYPE = 'application/x-dex-tab';

/**
 * The row of tabs above an app's documents, one per open file, as `tabs` lists them, `active`
 * marking the one shown. It draws them and asks for everything else: a click (or Enter or Space)
 * sends `dex-tab-select`, × (or a middle click, Delete or Backspace) `dex-tab-close`, a double-click
 * `dex-tab-pin`, and a tab dropped on another `dex-tab-move`. Which tabs there are, in what
 * order, and which is active stay the app's: nothing here changes `tabs` or `active`.
 *
 * A tab's subtitle, when it has one, is drawn before its icon and label, smaller and muted: the
 * file, while the label names a part of it. A preview tab's label is italic; an unsaved one shows ●
 * where its × is, until the pointer or the keyboard comes onto it. A row too long for its width
 * scrolls sideways (a wheel scrolls it too), keeps the active tab in view, clear of the … button it
 * then offers, which lists every tab, as the row is drawn and as it is resized; a tab scrolled partly
 * out past the row's start hides its ×, and no tab is wider than the row. The arrow keys move the
 * focus along the tabs, and Home and End to either end.
 *
 * @tagname dex-doc-tabs
 */
export class DexDocTabs extends LitElement {
  static override styles = [hiddenStyles, tabRoleFocusRingStyles, buttonFocusRingStyles, menuitemFocusRingStyles, css`
    :host {
      display: block;
      position: relative;
      height: 28px;
      flex-shrink: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      color: var(--dex-color-text, #333);
    }

    .bar {
      display: flex;
      align-items: stretch;
      height: 100%;
      box-sizing: border-box;
      background: var(--dex-bg-tabbar, #f0f0f0);
      border-bottom: 1px solid var(--dex-border-color, #d0d0d0);
    }

    /* The strip scrolls sideways, with no scrollbar: one would take half of the 28px, or sit over
       the labels. A wheel, a trackpad, the … menu and the active tab's scroll into view move it. */
    [role='tablist'] {
      display: flex;
      flex: 1 1 0;
      min-width: 0;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
    }

    [role='tablist']::-webkit-scrollbar {
      display: none;
    }

    /* Every tab has the 2px bottom border, transparent but on the active one, so the label does not
       jump as the mark moves. No tab is wider than the row: in a narrow window a section's tab (the
       file, the icon, the section) gives way, its subtitle and label to an ellipsis, and its ×
       stays. */
    .tab {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
      max-width: 100%;
      padding: 0 6px 0 12px;
      box-sizing: border-box;
      border-right: 1px solid var(--dex-border-color, #d0d0d0);
      border-bottom: 2px solid transparent;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
    }

    .tab:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .tab.active {
      background: var(--dex-bg-primary, #fff);
      border-bottom-color: var(--dex-color-accent, #0078d4);
    }

    .tab.dragging {
      opacity: 0.4;
    }

    /* Sized here, at the 14px each tab and menu item draws it at, not by the icon's own first draw,
       which comes after the row's: the row measures and scrolls with each tab as wide as it will be. */
    dex-icon {
      flex-shrink: 0;
      width: 14px;
      height: 14px;
    }

    /* A long name gives way, and its tooltip has the whole of it. */
    .label {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* The file a tab's label is a part of: smaller, in the secondary ink, text that reads at 4.5:1
       on the bar, a hovered tab and the active one in every theme (the muted ink is 4.3:1 on the
       dark bar); upright on a preview tab, whose italic is the label's. */
    .subtitle {
      max-width: 160px;
      margin-inline-end: 2px;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      color: var(--dex-color-text-secondary, #555);
    }

    .preview .label {
      font-style: italic;
    }

    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: none;
      font-size: 14px;
      line-height: 1;
      /* Muted, not the disabled grey: a control the user can press clears 3:1 on the bar and on a
         hovered tab. */
      color: var(--dex-color-text-muted, #666);
      cursor: pointer;
    }

    .close:hover {
      color: var(--dex-color-text, #333);
      background: var(--dex-bg-active, #e0e0e0);
    }

    /* A tab scrolled partly out past the row's start (data-clipped, measured as the strip scrolls)
       shows its end at the edge, often its × alone, a control with nothing beside it to say what it
       closes: the × is hidden there, kept in its place so the tab keeps its width. An unsaved tab's
       ● stays, still saying so. */
    .tab[data-clipped] .x {
      visibility: hidden;
    }

    /* The dot in the colour the hierarchy marks the same file's unsaved changes with, so the two
       read as one fact. */
    .dot {
      font-size: 10px;
      color: var(--dex-color-modified, #b45309);
    }

    /* An unsaved tab shows its dot until the pointer or the keyboard is on it, and then the × that
       will close it. :focus-visible, not :focus: a click focuses the tab too, and would leave the
       dot hidden after the pointer has gone; hover already covers the pointer. */
    .dirty .x,
    .dirty:hover .dot,
    .dirty:focus-visible .dot,
    .dirty .close:focus-visible .dot {
      display: none;
    }

    .dirty:hover .x,
    .dirty:focus-visible .x,
    .dirty .close:focus-visible .x {
      display: inline;
    }

    /* Where the dragged tab will land: before the tab under the pointer when it comes from the
       right, after it when it comes from the left. */
    .drop-before::before,
    .drop-after::after {
      content: '';
      position: absolute;
      top: 4px;
      bottom: 4px;
      width: 2px;
      border-radius: 1px;
      background: var(--dex-color-accent, #0078d4);
    }

    .drop-before::before {
      left: -1px;
    }

    .drop-after::after {
      right: -1px;
    }

    .overflow {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 28px;
      padding: 0;
      border: none;
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
      background: var(--dex-bg-tabbar, #f0f0f0);
      font-size: 12px;
      color: var(--dex-color-text, #333);
      cursor: pointer;
    }

    .overflow:hover,
    .overflow[aria-expanded='true'] {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The display above beats the browser's own [hidden] rule: the button is drawn always, and
       hidden while the tabs fit. */
    .overflow[hidden] {
      display: none;
    }

    .menu {
      position: absolute;
      top: 100%;
      right: 0;
      z-index: 1000;
      min-width: 160px;
      max-width: 320px;
      max-height: 300px;
      overflow-y: auto;
      padding: 4px 0;
      background: var(--dex-bg-primary, #fff);
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 12px;
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
      outline: none;
    }

    .item:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .item .label {
      max-width: none;
      min-width: 0;
    }

    .item[aria-current='true'] {
      font-weight: 600;
      color: var(--dex-color-accent, #0078d4);
    }

    /* The accent is 4.5:1 on the menu's white, and less on the hover grey: the darker accent there. */
    .item[aria-current='true']:hover {
      color: var(--dex-color-accent-hover, #005a9e);
    }
  `, highContrastStyles, css`
    /* After the shared high-contrast sheet, to correct two of its rules here. Its outward focus
       outline would be clipped by the strip, which scrolls, so it goes inside; and its border on
       every [tabindex] would take the active tab's mark away, so the mark is drawn again in the
       system's Highlight. */
    @media (forced-colors: active) {
      [role='tab']:focus-visible,
      [role='menuitem']:focus-visible {
        outline-offset: -2px !important;
      }

      .tab.active {
        border-bottom: 2px solid Highlight !important;
      }
    }
  `];

  /** The tabs, in order: plain data, which the app replaces as files open, close and move. Default none. */
  @property({ attribute: false }) tabs: DocTab[] = [];
  /** The id of the tab shown, which is marked selected and scrolled into view. Default none. Attribute `active`. */
  @property({ reflect: true }) active = '';

  // The tab the keyboard is on while the focus is in the row; null once it leaves, so the next Tab
  // in lands on the active tab.
  @state() private _focusId: string | null = null;
  // The tab being dragged out of this row, and the tab a drag of one is over.
  @state() private _dragging: string | null = null;
  @state() private _over: string | null = null;
  @state() private _menuOpen = false;
  @state() private _menuFocus = 0;

  // The tab to focus once it is drawn, after the one that had the focus closed. Its own field, not
  // _focusId: a browser that sends focusout as the closed tab leaves the page would clear that.
  private _focusTo: string | null = null;
  // `active` changed: its tab is to be scrolled into view once it is drawn.
  private _scrollPending = false;
  private _resize: ResizeObserver | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    // Back in a page after being taken out: watch the strip again. The first time, firstUpdated does.
    if (this.hasUpdated) this._observe();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize?.disconnect();
    this._resize = null;
    this._closeMenu(false);
  }

  protected override firstUpdated(): void {
    this._observe();
  }

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) this._scrollPending = true;
    if (changed.has('tabs')) {
      this._keepFocus(changed.get('tabs'));
      if (this._activeRedrawn(changed.get('tabs'))) this._scrollPending = true;
    }
  }

  // Whether the active tab reads otherwise than it did (another label, a subtitle, an icon), which
  // may widen it past the strip's end: it is kept in view as it grows.
  private _activeRedrawn(previous: DocTab[] | undefined): boolean {
    const was = Array.isArray(previous) ? previous.find((t) => t.id === this.active) : undefined;
    const now = this._list().find((t) => t.id === this.active);
    return !!was && !!now && (was.label !== now.label || was.subtitle !== now.subtitle || was.icon !== now.icon);
  }

  protected override updated(): void {
    if (this._focusTo !== null) {
      const id = this._focusTo;
      this._focusTo = null;
      this._tabElement(id)?.focus();
    }
    this._layout();
  }

  private _list(): DocTab[] {
    return Array.isArray(this.tabs) ? this.tabs : [];
  }

  private _tabElement(id: string): HTMLElement | undefined {
    return [...this.renderRoot.querySelectorAll<HTMLElement>('[role="tab"]')].find((el) => el.dataset.id === id);
  }

  private _strip(): HTMLElement | null {
    return this.renderRoot.querySelector<HTMLElement>('[role="tablist"]');
  }

  // The four requests, one dispatch each, so the compiler checks each detail against its type.
  private _select(id: string): void {
    this.dispatchEvent(new CustomEvent<TabSelectDetail>('dex-tab-select', { detail: { id }, bubbles: true, composed: true }));
  }

  private _close(id: string): void {
    this.dispatchEvent(new CustomEvent<TabCloseDetail>('dex-tab-close', { detail: { id }, bubbles: true, composed: true }));
  }

  private _pin(id: string): void {
    this.dispatchEvent(new CustomEvent<TabPinDetail>('dex-tab-pin', { detail: { id }, bubbles: true, composed: true }));
  }

  private _move(id: string, index: number): void {
    this.dispatchEvent(new CustomEvent<TabMoveDetail>('dex-tab-move', { detail: { id, index }, bubbles: true, composed: true }));
  }

  // The tab the keyboard was on is gone (closed, most likely by Delete): the focus goes to the tab
  // now in its place, or the last, so a run of Deletes closes one tab after another. Only if the
  // focus was in the row: a tab closed from elsewhere must not pull the focus here.
  private _keepFocus(previous: DocTab[] | undefined): void {
    const tabs = this._list();
    const id = this._focusId;
    if (id === null || tabs.some((t) => t.id === id)) return;
    const was = Array.isArray(previous) ? previous.findIndex((t) => t.id === id) : -1;
    const next = tabs[Math.min(Math.max(was, 0), tabs.length - 1)];
    const focused = this.shadowRoot?.activeElement;
    const inRow = focused instanceof Node && (this._tabElement(id)?.contains(focused) ?? false);
    this._focusId = next?.id ?? null;
    this._focusTo = inRow ? this._focusId : null;
  }

  // What the room makes of the row, after each draw and each resize, in this order: the … button,
  // which takes its width from the strip; then the active tab scrolled into the room that is left,
  // so the button never covers it; then which tabs the scroll cuts at the row's start. None of it
  // sets a reactive property: a draw that measures is the only draw, and Lit has no update to
  // schedule after the one it completed.
  private _layout(): void {
    this._measure();
    this._scrollActive();
    this._markClipped();
  }

  // Crowded once the tabs are wider than the strip with the … button gone: the button is shown or
  // hidden on the element the template drew, rather than through state. Turned on, it may cover the
  // active tab, which is scrolled into view again; turned off, its menu, which hangs from it, closes
  // (a task later, outside the update that measured).
  private _measure(): void {
    const strip = this._strip();
    const button = this.renderRoot.querySelector<HTMLButtonElement>('button.overflow');
    if (!strip || !button) return;
    const room = strip.clientWidth + (button.hidden ? 0 : button.offsetWidth);
    const crowded = strip.scrollWidth > room;
    if (crowded === !button.hidden) return;
    button.hidden = !crowded;
    if (crowded) this._scrollPending = true;
    else if (this._menuOpen) queueMicrotask(() => this._closeMenu(false));
  }

  // `active` changed, or the … button came: its tab, once drawn, scrolled into view.
  private _scrollActive(): void {
    if (!this._scrollPending) return;
    const tab = this._tabElement(this.active);
    if (!tab) return;
    this._scrollPending = false;
    tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  // Each tab whose start is scrolled out past the strip's is marked data-clipped, which hides its ×.
  // Set here, as the strip scrolls and after each draw, and not by the template, so a draw leaves
  // the mark as measured.
  private _markClipped(): void {
    const strip = this._strip();
    if (!strip) return;
    const start = strip.getBoundingClientRect().left;
    for (const tab of strip.querySelectorAll<HTMLElement>('[role="tab"]')) {
      tab.toggleAttribute('data-clipped', tab.getBoundingClientRect().left < start - 0.5);
    }
  }

  // The bar, not the strip: the strip narrows as the … button comes and widens as it goes, and
  // watching it would measure again on every change the measuring itself makes. The bar's width is
  // the room the row has; a change of the tabs inside it is measured as they are drawn. At each
  // resize the active tab is scrolled into view again, so a row narrowed while crowded already (a
  // smaller window, a sidebar's sash dragged) keeps it clear of the … button.
  private _observe(): void {
    const bar = this.renderRoot.querySelector<HTMLElement>('.bar');
    if (!bar || typeof ResizeObserver === 'undefined') return;
    this._resize ??= new ResizeObserver(() => {
      this._scrollPending = true;
      this._layout();
    });
    this._resize.observe(bar);
  }

  private _onTabKeydown(e: KeyboardEvent, tab: DocTab): void {
    // Enter or Space on a × a click left the focus on is the ×'s own: it closes.
    if ((e.key === 'Enter' || e.key === ' ') && e.target !== e.currentTarget) return;
    const tabs = this._list();
    const at = tabs.findIndex((t) => t.id === tab.id);
    const go = (to: number): void => {
      const target = tabs[(to + tabs.length) % tabs.length];
      if (target) this._tabElement(target.id)?.focus();
    };
    switch (e.key) {
      case 'ArrowRight':
        go(at + 1);
        break;
      case 'ArrowLeft':
        go(at - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(tabs.length - 1);
        break;
      // Manual activation, as the WAI-ARIA tabs pattern advises where showing a tab takes time:
      // the arrows only move the focus, and Enter or Space asks for the tab.
      case 'Enter':
      case ' ':
        this._select(tab.id);
        break;
      // Backspace too: it is the key a Mac laptop marks delete.
      case 'Delete':
      case 'Backspace':
        this._close(tab.id);
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  // The focus is leaving the row: the next Tab back in goes to the active tab, not the one left.
  private _onFocusOut(e: FocusEvent): void {
    const to = e.relatedTarget;
    if (to instanceof Node && this._strip()?.contains(to)) return;
    this._focusId = null;
  }

  private _onClose(e: Event, tab: DocTab): void {
    e.stopPropagation();
    this._close(tab.id);
  }

  // Pressed, the middle button starts the browser's autoscroll (Windows, Linux); released, it is
  // the auxclick that closes.
  private _onMouseDown(e: MouseEvent): void {
    if (e.button === 1) e.preventDefault();
  }

  private _onAuxClick(e: MouseEvent, tab: DocTab): void {
    if (e.button !== 1) return;
    e.preventDefault();
    this._close(tab.id);
  }

  // A mouse with one wheel scrolls the page, never sideways: over a crowded row, its turn scrolls
  // the row instead. A sideways swipe (a trackpad) the browser scrolls by itself.
  private _onWheel(e: WheelEvent): void {
    const strip = e.currentTarget as HTMLElement;
    if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? strip.clientWidth : 1;
    strip.scrollLeft += e.deltaY * unit;
    e.preventDefault();
  }

  // ---- Drag to reorder ----

  // A drag this row may take: one carrying a tab, and no files. A file dragged in from the desktop
  // is the app's to open, so it is left alone (the dragover not prevented), even with a tab beside it.
  private _isTabDrag(e: DragEvent): boolean {
    const types = Array.from(e.dataTransfer?.types ?? []);
    return types.includes(TAB_TYPE) && !types.includes('Files');
  }

  private _onDragStart(e: DragEvent, tab: DocTab): void {
    if (!e.dataTransfer) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(TAB_TYPE, tab.id);
    this._dragging = tab.id;
  }

  // The dragover is where a drop is accepted: prevented, it says "drop here". Only the types can be
  // read while the drag is on its way (the data comes with the drop), so the type decides, and only
  // for a drag that started in this row: a tab of another row or window is not this row's to move.
  private _onDragOver(e: DragEvent, tab: DocTab): void {
    if (this._dragging === null || !this._isTabDrag(e) || tab.id === this._dragging) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'move';
    this._over = tab.id;
  }

  private _onDragLeave(e: DragEvent, tab: DocTab): void {
    // Onto the tab's own label or ×: still over it.
    const to = e.relatedTarget;
    if (to instanceof Node && (e.currentTarget as HTMLElement).contains(to)) return;
    if (this._over === tab.id) this._over = null;
  }

  // The dragged tab is to take the place of the tab it is dropped on: its index in `tabs`. Only the
  // drag this row started: a tab of another row or window, or one dropped on itself, moves nothing.
  private _onDrop(e: DragEvent, tab: DocTab): void {
    if (this._dragging === null || !this._isTabDrag(e)) return;
    e.preventDefault();
    const id = e.dataTransfer!.getData(TAB_TYPE);
    const tabs = this._list();
    const index = tabs.findIndex((t) => t.id === tab.id);
    this._over = null;
    if (id !== this._dragging || id === tab.id || !tabs.some((t) => t.id === id)) return;
    this._move(id, index);
  }

  private _onDragEnd(): void {
    this._dragging = null;
    this._over = null;
  }

  // Which side of the tab under the pointer the dragged one lands on: its far side when it comes
  // from the left (it takes that tab's place, pushing it left), its near side from the right.
  private _dropClass(tab: DocTab, index: number): string {
    if (this._over !== tab.id) return '';
    const from = this._list().findIndex((t) => t.id === this._dragging);
    return from >= 0 && from < index ? 'drop-after' : 'drop-before';
  }

  // ---- The overflow menu ----

  private _toggleMenu(): void {
    if (this._menuOpen) {
      this._closeMenu(false);
      return;
    }
    const tabs = this._list();
    this._menuFocus = Math.max(0, tabs.findIndex((t) => t.id === this.active));
    this._menuOpen = true;
    document.addEventListener('mousedown', this._onOutside, true);
    void this.updateComplete.then(() => this._focusMenuItem());
  }

  private _closeMenu(refocus: boolean): void {
    if (!this._menuOpen) return;
    this._menuOpen = false;
    document.removeEventListener('mousedown', this._onOutside, true);
    if (refocus) this.renderRoot.querySelector<HTMLElement>('button.overflow')?.focus();
  }

  // A press anywhere but on the menu or its button closes it; the button's own toggles it.
  private _onOutside = (e: MouseEvent): void => {
    const path = e.composedPath();
    const keep = [...this.renderRoot.querySelectorAll('.menu, button.overflow')];
    if (!keep.some((el) => path.includes(el))) this._closeMenu(false);
  };

  private _focusMenuItem(): void {
    this.renderRoot.querySelectorAll<HTMLElement>('[role="menuitem"]')[this._menuFocus]?.focus();
  }

  private _chooseFromMenu(tab: DocTab): void {
    this._closeMenu(true);
    this._select(tab.id);
  }

  private _onMenuKeydown(e: KeyboardEvent): void {
    const tabs = this._list();
    if (tabs.length === 0) return;
    const go = (to: number): void => {
      this._menuFocus = (to + tabs.length) % tabs.length;
      this._focusMenuItem();
    };
    switch (e.key) {
      case 'ArrowDown':
        go(this._menuFocus + 1);
        break;
      case 'ArrowUp':
        go(this._menuFocus - 1);
        break;
      case 'Home':
        go(0);
        break;
      case 'End':
        go(tabs.length - 1);
        break;
      case 'Enter':
      case ' ': {
        const tab = tabs[this._menuFocus];
        if (tab) this._chooseFromMenu(tab);
        break;
      }
      case 'Escape':
        this._closeMenu(true);
        break;
      // Tab goes on to whatever is next, and the menu it leaves closes.
      case 'Tab':
        this._closeMenu(false);
        return;
      default:
        return;
    }
    e.preventDefault();
  }

  // ---- Drawing ----

  // What the tab reads: its subtitle, then its label, as they are drawn.
  private _title(tab: DocTab): string {
    return tab.subtitle ? `${tab.subtitle}, ${tab.label}` : tab.label;
  }

  // What a screen reader calls the tab, or its menu item: what it reads, and what the italic and the
  // dot say to the eye.
  private _name(tab: DocTab): string {
    return [this._title(tab), tab.preview ? 'preview' : '', tab.dirty ? 'unsaved' : ''].filter((part) => part !== '').join(', ');
  }

  private _icon(tab: DocTab) {
    return tab.icon ? html`<dex-icon .iconId=${tab.icon} size="14"></dex-icon>` : nothing;
  }

  private _subtitle(tab: DocTab) {
    return tab.subtitle ? html`<span class="subtitle">${tab.subtitle}</span>` : nothing;
  }

  private _tab(tab: DocTab, index: number, tabbable: boolean) {
    const active = tab.id === this.active;
    const classes = [
      'tab',
      active ? 'active' : '',
      tab.preview ? 'preview' : '',
      tab.dirty ? 'dirty' : '',
      tab.id === this._dragging ? 'dragging' : '',
      this._dropClass(tab, index),
    ].filter((c) => c !== '');
    // The × is for the pointer only (tabindex -1): the keyboard closes a tab with Delete, and a
    // stop on every × would double the Tab presses through the row.
    return html`
      <div
        class=${classes.join(' ')}
        role="tab"
        data-id=${tab.id}
        aria-selected=${String(active)}
        aria-label=${this._name(tab)}
        title=${tab.title || tab.label}
        tabindex=${tabbable ? '0' : '-1'}
        aria-keyshortcuts="Delete"
        draggable="true"
        @click=${() => this._select(tab.id)}
        @dblclick=${() => this._pin(tab.id)}
        @mousedown=${this._onMouseDown}
        @auxclick=${(e: MouseEvent) => this._onAuxClick(e, tab)}
        @keydown=${(e: KeyboardEvent) => this._onTabKeydown(e, tab)}
        @focusin=${() => (this._focusId = tab.id)}
        @dragstart=${(e: DragEvent) => this._onDragStart(e, tab)}
        @dragover=${(e: DragEvent) => this._onDragOver(e, tab)}
        @dragleave=${(e: DragEvent) => this._onDragLeave(e, tab)}
        @drop=${(e: DragEvent) => this._onDrop(e, tab)}
        @dragend=${this._onDragEnd}
      >
        ${this._subtitle(tab)}${this._icon(tab)}
        <span class="label">${tab.label}</span>
        <button
          class="close"
          tabindex="-1"
          title="Close"
          aria-label="Close ${this._title(tab)}"
          @click=${(e: Event) => this._onClose(e, tab)}
          @dblclick=${(e: Event) => e.stopPropagation()}
        >
          ${tab.dirty ? html`<span class="dot" aria-hidden="true">●</span>` : nothing}<span class="x" aria-hidden="true">×</span>
        </button>
      </div>
    `;
  }

  private _menu(tabs: DocTab[]) {
    return html`
      <div class="menu" role="menu" aria-label="Open documents" @keydown=${this._onMenuKeydown}>
        ${repeat(
          tabs,
          (tab) => tab.id,
          (tab, i) => html`
            <div
              class="item ${tab.preview ? 'preview' : ''}"
              role="menuitem"
              tabindex="-1"
              aria-label=${this._name(tab)}
              aria-current=${tab.id === this.active ? 'true' : nothing}
              title=${tab.title || tab.label}
              @click=${() => this._chooseFromMenu(tab)}
              @focus=${() => (this._menuFocus = i)}
            >
              ${this._subtitle(tab)}${this._icon(tab)}
              <span class="label">${tab.label}</span>
              ${tab.dirty ? html`<span class="dot" aria-hidden="true">●</span>` : nothing}
            </div>
          `,
        )}
      </div>
    `;
  }

  override render() {
    const tabs = this._list();
    // One tab takes the Tab key: the one the keyboard is on, else the active one, else the first.
    const tabbable = [this._focusId, this.active].find((id) => id !== null && tabs.some((t) => t.id === id)) ?? tabs[0]?.id;
    const count = `${tabs.length} open tab${tabs.length === 1 ? '' : 's'}`;
    // The … button is hidden as drawn, and its `hidden` is bound to nothing: _measure shows and
    // hides it as the room says, with no draw of its own.
    return html`
      <div class="bar">
        <div role="tablist" aria-label="Open documents" @wheel=${this._onWheel} @scroll=${this._markClipped} @focusout=${this._onFocusOut}>
          ${repeat(
            tabs,
            (tab) => tab.id,
            (tab, i) => this._tab(tab, i, tab.id === tabbable),
          )}
        </div>
        <button
          class="overflow"
          hidden
          aria-label="Show all tabs"
          aria-haspopup="menu"
          aria-expanded=${String(this._menuOpen)}
          title=${count}
          @click=${this._toggleMenu}
        >
          …
        </button>
      </div>
      ${this._menuOpen ? this._menu(tabs) : nothing}
    `;
  }
}

/** Registers the widget as `<dex-doc-tabs>`, or under `tag`, and the `<dex-icon>` its tabs draw. */
export function defineDocTabs(tag = 'dex-doc-tabs'): void {
  defineIcon();
  defineElement(tag, DexDocTabs);
}

/**
 * The events `<dex-doc-tabs>` sends, by name: requests, each the app's to answer by changing
 * `tabs` or `active`, or not. They bubble and are composed, so they reach the document and the
 * window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map, and a
 * listener on an element, the document or the window is typed.
 */
export interface DocTabsEventMap {
  /** Show this tab: a click on it, Enter or Space on it, or its item in the … menu. Sent for the active tab too. */
  'dex-tab-select': CustomEvent<TabSelectDetail>;
  /** Close this tab: its ×, a middle click on it, or Delete (or Backspace) on it. */
  'dex-tab-close': CustomEvent<TabCloseDetail>;
  /**
   * Keep this tab, no longer a preview: a double-click on it, whether it is a preview or not. Its
   * two clicks have each sent `dex-tab-select` first.
   */
  'dex-tab-pin': CustomEvent<TabPinDetail>;
  /** Move this tab: it was dropped on the tab at `index`. Remove it from `tabs`, then insert it at `index`. */
  'dex-tab-move': CustomEvent<TabMoveDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-doc-tabs': DexDocTabs;
  }
  interface HTMLElementEventMap extends DocTabsEventMap {}
  interface DocumentEventMap extends DocTabsEventMap {}
  interface WindowEventMap extends DocTabsEventMap {}
}
