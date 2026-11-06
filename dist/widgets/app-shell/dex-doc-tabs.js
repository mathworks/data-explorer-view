// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles, menuitemFocusRingStyles, tabRoleFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
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
 * A preview tab's label is italic; an unsaved one shows ● where its × is, until the pointer or the
 * keyboard comes onto it. A row too long for its width scrolls sideways (a wheel scrolls it too),
 * keeps the active tab in view, and offers a … button listing every tab. The arrow keys move the
 * focus along the tabs, and Home and End to either end.
 *
 * @tagname dex-doc-tabs
 */
export class DexDocTabs extends LitElement {
    constructor() {
        super(...arguments);
        /** The tabs, in order: plain data, which the app replaces as files open, close and move. Default none. */
        this.tabs = [];
        /** The id of the tab shown, which is marked selected and scrolled into view. Default none. Attribute `active`. */
        this.active = '';
        // The tab the keyboard is on while the focus is in the row; null once it leaves, so the next Tab
        // in lands on the active tab.
        this._focusId = null;
        // The tab being dragged out of this row, and the tab a drag of one is over.
        this._dragging = null;
        this._over = null;
        // More tabs than room: the … button is offered.
        this._crowded = false;
        this._menuOpen = false;
        this._menuFocus = 0;
        // The tab to focus once it is drawn, after the one that had the focus closed. Its own field, not
        // _focusId: a browser that sends focusout as the closed tab leaves the page would clear that.
        this._focusTo = null;
        // `active` changed: its tab is to be scrolled into view once it is drawn.
        this._scrollPending = false;
        this._resize = null;
        // A press anywhere but on the menu or its button closes it; the button's own toggles it.
        this._onOutside = (e) => {
            const path = e.composedPath();
            const keep = [...this.renderRoot.querySelectorAll('.menu, button.overflow')];
            if (!keep.some((el) => path.includes(el)))
                this._closeMenu(false);
        };
    }
    static { this.styles = [hiddenStyles, tabRoleFocusRingStyles, buttonFocusRingStyles, menuitemFocusRingStyles, css `
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
       jump as the mark moves. */
    .tab {
      position: relative;
      display: flex;
      align-items: center;
      gap: 4px;
      flex-shrink: 0;
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

    dex-icon {
      flex-shrink: 0;
    }

    /* A long name gives way, and its tooltip has the whole of it. */
    .label {
      max-width: 240px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .preview .label {
      font-style: italic;
    }

    .close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
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
  `, highContrastStyles, css `
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
  `]; }
    connectedCallback() {
        super.connectedCallback();
        // Back in a page after being taken out: watch the strip again. The first time, firstUpdated does.
        if (this.hasUpdated)
            this._observe();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._resize?.disconnect();
        this._resize = null;
        this._closeMenu(false);
    }
    firstUpdated() {
        this._observe();
    }
    willUpdate(changed) {
        if (changed.has('active'))
            this._scrollPending = true;
        if (changed.has('tabs'))
            this._keepFocus(changed.get('tabs'));
    }
    updated() {
        if (this._focusTo !== null) {
            const id = this._focusTo;
            this._focusTo = null;
            this._tabElement(id)?.focus();
        }
        if (this._scrollPending) {
            const tab = this._tabElement(this.active);
            if (tab) {
                this._scrollPending = false;
                tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }
        }
        this._measure();
    }
    _list() {
        return Array.isArray(this.tabs) ? this.tabs : [];
    }
    _tabElement(id) {
        return [...this.renderRoot.querySelectorAll('[role="tab"]')].find((el) => el.dataset.id === id);
    }
    _strip() {
        return this.renderRoot.querySelector('[role="tablist"]');
    }
    // The four requests, one dispatch each, so the compiler checks each detail against its type.
    _select(id) {
        this.dispatchEvent(new CustomEvent('dex-tab-select', { detail: { id }, bubbles: true, composed: true }));
    }
    _close(id) {
        this.dispatchEvent(new CustomEvent('dex-tab-close', { detail: { id }, bubbles: true, composed: true }));
    }
    _pin(id) {
        this.dispatchEvent(new CustomEvent('dex-tab-pin', { detail: { id }, bubbles: true, composed: true }));
    }
    _move(id, index) {
        this.dispatchEvent(new CustomEvent('dex-tab-move', { detail: { id, index }, bubbles: true, composed: true }));
    }
    // The tab the keyboard was on is gone (closed, most likely by Delete): the focus goes to the tab
    // now in its place, or the last, so a run of Deletes closes one tab after another. Only if the
    // focus was in the row: a tab closed from elsewhere must not pull the focus here.
    _keepFocus(previous) {
        const tabs = this._list();
        const id = this._focusId;
        if (id === null || tabs.some((t) => t.id === id))
            return;
        const was = Array.isArray(previous) ? previous.findIndex((t) => t.id === id) : -1;
        const next = tabs[Math.min(Math.max(was, 0), tabs.length - 1)];
        const focused = this.shadowRoot?.activeElement;
        const inRow = focused instanceof Node && (this._tabElement(id)?.contains(focused) ?? false);
        this._focusId = next?.id ?? null;
        this._focusTo = inRow ? this._focusId : null;
    }
    // What the strip's width makes of the row: crowded once its tabs are wider than it, measured as it
    // is drawn and as it is resized. Hidden, the button closes its menu, which hangs from it.
    _measure() {
        const strip = this._strip();
        if (!strip)
            return;
        const crowded = strip.scrollWidth > strip.clientWidth;
        if (crowded !== this._crowded)
            this._crowded = crowded;
        if (!crowded && this._menuOpen)
            this._closeMenu(false);
    }
    // The bar, not the strip: the strip narrows as the … button comes and widens as it goes, and
    // watching it would measure again on every change the measuring itself makes. The bar's width is
    // the room the row has; a change of the tabs inside it is measured as they are drawn.
    _observe() {
        const bar = this.renderRoot.querySelector('.bar');
        if (!bar || typeof ResizeObserver === 'undefined')
            return;
        this._resize ??= new ResizeObserver(() => this._measure());
        this._resize.observe(bar);
    }
    _onTabKeydown(e, tab) {
        // Enter or Space on a × a click left the focus on is the ×'s own: it closes.
        if ((e.key === 'Enter' || e.key === ' ') && e.target !== e.currentTarget)
            return;
        const tabs = this._list();
        const at = tabs.findIndex((t) => t.id === tab.id);
        const go = (to) => {
            const target = tabs[(to + tabs.length) % tabs.length];
            if (target)
                this._tabElement(target.id)?.focus();
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
    _onFocusOut(e) {
        const to = e.relatedTarget;
        if (to instanceof Node && this._strip()?.contains(to))
            return;
        this._focusId = null;
    }
    _onClose(e, tab) {
        e.stopPropagation();
        this._close(tab.id);
    }
    // Pressed, the middle button starts the browser's autoscroll (Windows, Linux); released, it is
    // the auxclick that closes.
    _onMouseDown(e) {
        if (e.button === 1)
            e.preventDefault();
    }
    _onAuxClick(e, tab) {
        if (e.button !== 1)
            return;
        e.preventDefault();
        this._close(tab.id);
    }
    // A mouse with one wheel scrolls the page, never sideways: over a crowded row, its turn scrolls
    // the row instead. A sideways swipe (a trackpad) the browser scrolls by itself.
    _onWheel(e) {
        const strip = e.currentTarget;
        if (strip.scrollWidth <= strip.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX))
            return;
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? strip.clientWidth : 1;
        strip.scrollLeft += e.deltaY * unit;
        e.preventDefault();
    }
    // ---- Drag to reorder ----
    // A drag this row may take: one carrying a tab, and no files. A file dragged in from the desktop
    // is the app's to open, so it is left alone (the dragover not prevented), even with a tab beside it.
    _isTabDrag(e) {
        const types = Array.from(e.dataTransfer?.types ?? []);
        return types.includes(TAB_TYPE) && !types.includes('Files');
    }
    _onDragStart(e, tab) {
        if (!e.dataTransfer)
            return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TAB_TYPE, tab.id);
        this._dragging = tab.id;
    }
    // The dragover is where a drop is accepted: prevented, it says "drop here". Only the types can be
    // read while the drag is on its way (the data comes with the drop), so the type decides, and only
    // for a drag that started in this row: a tab of another row or window is not this row's to move.
    _onDragOver(e, tab) {
        if (this._dragging === null || !this._isTabDrag(e) || tab.id === this._dragging)
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        this._over = tab.id;
    }
    _onDragLeave(e, tab) {
        // Onto the tab's own label or ×: still over it.
        const to = e.relatedTarget;
        if (to instanceof Node && e.currentTarget.contains(to))
            return;
        if (this._over === tab.id)
            this._over = null;
    }
    // The dragged tab is to take the place of the tab it is dropped on: its index in `tabs`. Only the
    // drag this row started: a tab of another row or window, or one dropped on itself, moves nothing.
    _onDrop(e, tab) {
        if (this._dragging === null || !this._isTabDrag(e))
            return;
        e.preventDefault();
        const id = e.dataTransfer.getData(TAB_TYPE);
        const tabs = this._list();
        const index = tabs.findIndex((t) => t.id === tab.id);
        this._over = null;
        if (id !== this._dragging || id === tab.id || !tabs.some((t) => t.id === id))
            return;
        this._move(id, index);
    }
    _onDragEnd() {
        this._dragging = null;
        this._over = null;
    }
    // Which side of the tab under the pointer the dragged one lands on: its far side when it comes
    // from the left (it takes that tab's place, pushing it left), its near side from the right.
    _dropClass(tab, index) {
        if (this._over !== tab.id)
            return '';
        const from = this._list().findIndex((t) => t.id === this._dragging);
        return from >= 0 && from < index ? 'drop-after' : 'drop-before';
    }
    // ---- The overflow menu ----
    _toggleMenu() {
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
    _closeMenu(refocus) {
        if (!this._menuOpen)
            return;
        this._menuOpen = false;
        document.removeEventListener('mousedown', this._onOutside, true);
        if (refocus)
            this.renderRoot.querySelector('button.overflow')?.focus();
    }
    _focusMenuItem() {
        this.renderRoot.querySelectorAll('[role="menuitem"]')[this._menuFocus]?.focus();
    }
    _chooseFromMenu(tab) {
        this._closeMenu(true);
        this._select(tab.id);
    }
    _onMenuKeydown(e) {
        const tabs = this._list();
        if (tabs.length === 0)
            return;
        const go = (to) => {
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
                if (tab)
                    this._chooseFromMenu(tab);
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
    // What a screen reader calls the tab, or its menu item: its name, and what the italic and the
    // dot say to the eye.
    _name(tab) {
        return [tab.label, tab.preview ? 'preview' : '', tab.dirty ? 'unsaved' : ''].filter((part) => part !== '').join(', ');
    }
    _icon(tab) {
        return tab.icon ? html `<dex-icon .iconId=${tab.icon} size="14"></dex-icon>` : nothing;
    }
    _tab(tab, index, tabbable) {
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
        return html `
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
        @auxclick=${(e) => this._onAuxClick(e, tab)}
        @keydown=${(e) => this._onTabKeydown(e, tab)}
        @focusin=${() => (this._focusId = tab.id)}
        @dragstart=${(e) => this._onDragStart(e, tab)}
        @dragover=${(e) => this._onDragOver(e, tab)}
        @dragleave=${(e) => this._onDragLeave(e, tab)}
        @drop=${(e) => this._onDrop(e, tab)}
        @dragend=${this._onDragEnd}
      >
        ${this._icon(tab)}
        <span class="label">${tab.label}</span>
        <button
          class="close"
          tabindex="-1"
          title="Close"
          aria-label="Close ${tab.label}"
          @click=${(e) => this._onClose(e, tab)}
          @dblclick=${(e) => e.stopPropagation()}
        >
          ${tab.dirty ? html `<span class="dot" aria-hidden="true">●</span>` : nothing}<span class="x" aria-hidden="true">×</span>
        </button>
      </div>
    `;
    }
    _menu(tabs) {
        return html `
      <div class="menu" role="menu" aria-label="Open documents" @keydown=${this._onMenuKeydown}>
        ${repeat(tabs, (tab) => tab.id, (tab, i) => html `
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
              ${this._icon(tab)}
              <span class="label">${tab.label}</span>
              ${tab.dirty ? html `<span class="dot" aria-hidden="true">●</span>` : nothing}
            </div>
          `)}
      </div>
    `;
    }
    render() {
        const tabs = this._list();
        // One tab takes the Tab key: the one the keyboard is on, else the active one, else the first.
        const tabbable = [this._focusId, this.active].find((id) => id !== null && tabs.some((t) => t.id === id)) ?? tabs[0]?.id;
        const count = `${tabs.length} open tab${tabs.length === 1 ? '' : 's'}`;
        return html `
      <div class="bar">
        <div role="tablist" aria-label="Open documents" @wheel=${this._onWheel} @focusout=${this._onFocusOut}>
          ${repeat(tabs, (tab) => tab.id, (tab, i) => this._tab(tab, i, tab.id === tabbable))}
        </div>
        ${this._crowded
            ? html `<button
              class="overflow"
              aria-label="Show all tabs"
              aria-haspopup="menu"
              aria-expanded=${String(this._menuOpen)}
              title=${count}
              @click=${this._toggleMenu}
            >
              …
            </button>`
            : nothing}
      </div>
      ${this._menuOpen ? this._menu(tabs) : nothing}
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexDocTabs.prototype, "tabs", void 0);
__decorate([
    property({ reflect: true })
], DexDocTabs.prototype, "active", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_focusId", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_dragging", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_over", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_crowded", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_menuOpen", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_menuFocus", void 0);
/** Registers the widget as `<dex-doc-tabs>`, or under `tag`, and the `<dex-icon>` its tabs draw. */
export function defineDocTabs(tag = 'dex-doc-tabs') {
    defineIcon();
    defineElement(tag, DexDocTabs);
}
