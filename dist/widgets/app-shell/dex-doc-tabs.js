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
/**
 * The type a tab's drag carries its id under. One of the app's own, so a drag of anything else (a
 * file from the desktop, text from another page) never reads as a tab. Exported for the part of an
 * app that takes a tab dropped elsewhere (the documents' area of the shell, to split it).
 */
export const TAB_DRAG_TYPE = 'application/x-dex-tab';
// The tab dragged now out of a row of this page, and its row: a row of the same group takes it.
// Module-wide, as a drag is page-wide; another window's drag never sets it, so a row never takes a
// tab of another window, whose id would name a tab of its own.
let dragged = null;
// The rows in the page, for a row to tell a tab that went to another row of its group from one
// that closed.
const rowsInPage = new Set();
/**
 * The row of tabs above an app's documents, one per open file, as `tabs` lists them, `active`
 * marking the one shown. It draws them and asks for everything else: a click (or Enter or Space)
 * sends `dex-tab-select`, × (or a middle click, Delete or Backspace) `dex-tab-close`, a double-click
 * `dex-tab-pin`, and a tab dropped on another `dex-tab-move`. Which tabs there are, in what
 * order, and which is active stay the app's: nothing here changes `tabs` or `active`. A tab
 * dropped on the row's empty end goes to its end. Rows of the same `group` (an app's two panes)
 * take each other's tabs: one dropped on a tab of the other lands before or after it, by the half
 * of the tab the pointer is over, and the row it lands in sends `dex-tab-move`.
 *
 * A tab's menu is the app's too: a right-click on a tab (its × included), or Shift+F10 or the
 * ContextMenu key on the focused one, sends `dex-tab-menu` with where to show it, at the pointer or
 * under the tab, and the row draws no menu of its own. The browser's menu is kept off the tabs, and
 * the one a browser fires after a menu key asks nothing more; the row's empty end and the … button
 * keep the browser's.
 *
 * A tab's subtitle, when it has one, is drawn before its icon and label, smaller and muted: the
 * file, while the label names a part of it. A preview tab's label is italic; an unsaved one shows ●
 * where its × is, until the pointer or the keyboard comes onto it. A row too long for its width
 * scrolls sideways (a wheel scrolls it too), keeps the active tab in view, clear of the … button it
 * then offers, which lists every tab, as the row is drawn and as it is resized; a tab scrolled partly
 * out past the row's start hides its ×, and no tab is wider than the row. The arrow keys move the
 * focus along the tabs, and Home and End to either end. A row `unfocused` (the row of a pane the
 * user is not in) marks its active tab in a muted grey rather than the accent.
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
        /**
         * Rows of one page with the same group take each other's tabs (an app's two panes, side by
         * side): a tab dragged from one and dropped on the other is that row's `dex-tab-move`, with an id
         * not in its `tabs`. Empty, the default: the row takes only its own tabs. Attribute `group`.
         */
        this.group = '';
        /**
         * The row is of a pane the user is not in: its active tab's mark is drawn in a muted grey, the
         * accent kept for the focused pane's row. Default false. Attribute `unfocused`.
         */
        this.unfocused = false;
        // The tab the keyboard is on while the focus is in the row; null once it leaves, so the next Tab
        // in lands on the active tab.
        this._focusId = null;
        // The tab being dragged out of this row, and where a drag of one would land: on which side of
        // which tab (the last tab's far side for the row's empty end).
        this._dragging = null;
        this._over = null;
        this._menuOpen = false;
        this._menuFocus = 0;
        // The tab to focus once it is drawn, after the one that had the focus closed. Its own field, not
        // _focusId: a browser that sends focusout as the closed tab leaves the page would clear that.
        this._focusTo = null;
        // `active` changed: its tab is to be scrolled into view once it is drawn.
        this._scrollPending = false;
        this._resize = null;
        // A menu key was pressed or let go on a tab in this task: the contextmenu a browser fires after
        // it is the key's, whose menu was asked for already. Cleared a task later.
        this._menuKeyed = false;
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

    /* The row of the pane the user is not in: its active tab is the one that pane shows, and the
       accent is kept for the focused pane's, which the toolbar acts on. The muted ink, not the
       disabled grey: the mark still clears 3:1 on the tab and on the bar in every theme. */
    :host([unfocused]) .tab.active {
      border-bottom-color: var(--dex-color-text-muted, #666);
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

      :host([unfocused]) .tab.active {
        border-bottom-color: GrayText !important;
      }
    }
  `]; }
    connectedCallback() {
        super.connectedCallback();
        rowsInPage.add(this);
        // Back in a page after being taken out: watch the strip again. The first time, firstUpdated does.
        if (this.hasUpdated)
            this._observe();
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        rowsInPage.delete(this);
        if (dragged?.row === this)
            dragged = null;
        this._resize?.disconnect();
        this._resize = null;
        this._closeMenu(false);
        clearTimeout(this._menuKeyedTimer);
        this._menuKeyed = false;
    }
    firstUpdated() {
        this._observe();
    }
    /**
     * Puts the keyboard on the active tab, once it is drawn: an app's chord that takes the user to
     * this row's pane. Nothing for a row with no active tab.
     */
    focusActive() {
        this._focusTo = this.active;
        this.requestUpdate();
    }
    willUpdate(changed) {
        if (changed.has('active'))
            this._scrollPending = true;
        if (changed.has('tabs')) {
            this._keepFocus(changed.get('tabs'));
            if (this._activeRedrawn(changed.get('tabs')))
                this._scrollPending = true;
        }
    }
    // Whether the active tab reads otherwise than it did (another label, a subtitle, an icon), which
    // may widen it past the strip's end: it is kept in view as it grows.
    _activeRedrawn(previous) {
        const was = Array.isArray(previous) ? previous.find((t) => t.id === this.active) : undefined;
        const now = this._list().find((t) => t.id === this.active);
        return !!was && !!now && (was.label !== now.label || was.subtitle !== now.subtitle || was.icon !== now.icon);
    }
    updated() {
        if (this._focusTo !== null) {
            const id = this._focusTo;
            this._focusTo = null;
            this._tabElement(id)?.focus();
        }
        this._layout();
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
    _askMenu(detail) {
        this.dispatchEvent(new CustomEvent('dex-tab-menu', { detail, bubbles: true, composed: true }));
    }
    // The tab the keyboard was on is gone (closed, most likely by Delete): the focus goes to the tab
    // now in its place, or the last, so a run of Deletes closes one tab after another. Only if the
    // focus was in the row: a tab closed from elsewhere must not pull the focus here. A tab that
    // went to another row of the group (dropped there, or moved by the app) was not closed: the
    // keyboard is the app's to give to that row, and on a neighbour here it would put the user back
    // in the pane the tab left. The app gives each row its tabs before either draws them.
    _keepFocus(previous) {
        const tabs = this._list();
        const id = this._focusId;
        if (id === null || tabs.some((t) => t.id === id))
            return;
        if (this._wentToGroup(id)) {
            this._focusId = null;
            this._focusTo = null;
            return;
        }
        const was = Array.isArray(previous) ? previous.findIndex((t) => t.id === id) : -1;
        const next = tabs[Math.min(Math.max(was, 0), tabs.length - 1)];
        const focused = this.shadowRoot?.activeElement;
        const inRow = focused instanceof Node && (this._tabElement(id)?.contains(focused) ?? false);
        this._focusId = next?.id ?? null;
        this._focusTo = inRow ? this._focusId : null;
    }
    // Whether the tab `id` is in another row of this row's group now.
    _wentToGroup(id) {
        if (this.group === '')
            return false;
        return [...rowsInPage].some((row) => row !== this && row.group === this.group && row._list().some((t) => t.id === id));
    }
    // What the room makes of the row, after each draw and each resize, in this order: the … button,
    // which takes its width from the strip; then the active tab scrolled into the room that is left,
    // so the button never covers it; then which tabs the scroll cuts at the row's start. None of it
    // sets a reactive property: a draw that measures is the only draw, and Lit has no update to
    // schedule after the one it completed.
    _layout() {
        this._measure();
        this._scrollActive();
        this._markClipped();
    }
    // Crowded once the tabs are wider than the strip with the … button gone: the button is shown or
    // hidden on the element the template drew, rather than through state. Turned on, it may cover the
    // active tab, which is scrolled into view again; turned off, its menu, which hangs from it, closes
    // (a task later, outside the update that measured).
    _measure() {
        const strip = this._strip();
        const button = this.renderRoot.querySelector('button.overflow');
        if (!strip || !button)
            return;
        const room = strip.clientWidth + (button.hidden ? 0 : button.offsetWidth);
        const crowded = strip.scrollWidth > room;
        if (crowded === !button.hidden)
            return;
        button.hidden = !crowded;
        if (crowded)
            this._scrollPending = true;
        else if (this._menuOpen)
            queueMicrotask(() => this._closeMenu(false));
    }
    // `active` changed, or the … button came: its tab, once drawn, scrolled into view.
    _scrollActive() {
        if (!this._scrollPending)
            return;
        const tab = this._tabElement(this.active);
        if (!tab)
            return;
        this._scrollPending = false;
        tab.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
    }
    // Each tab whose start is scrolled out past the strip's is marked data-clipped, which hides its ×.
    // Set here, as the strip scrolls and after each draw, and not by the template, so a draw leaves
    // the mark as measured.
    _markClipped() {
        const strip = this._strip();
        if (!strip)
            return;
        const start = strip.getBoundingClientRect().left;
        for (const tab of strip.querySelectorAll('[role="tab"]')) {
            tab.toggleAttribute('data-clipped', tab.getBoundingClientRect().left < start - 0.5);
        }
    }
    // The bar, not the strip: the strip narrows as the … button comes and widens as it goes, and
    // watching it would measure again on every change the measuring itself makes. The bar's width is
    // the room the row has; a change of the tabs inside it is measured as they are drawn. At each
    // resize the active tab is scrolled into view again, so a row narrowed while crowded already (a
    // smaller window, a sidebar's sash dragged) keeps it clear of the … button.
    _observe() {
        const bar = this.renderRoot.querySelector('.bar');
        if (!bar || typeof ResizeObserver === 'undefined')
            return;
        this._resize ??= new ResizeObserver(() => {
            this._scrollPending = true;
            this._layout();
        });
        this._resize.observe(bar);
    }
    _onTabKeydown(e, tab) {
        if (this._onMenuKey(e, tab))
            return;
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
    // Shift+F10 or the ContextMenu key on a tab (or on its ×), as Chromium tells them: the ContextMenu
    // key alone, F10 with Shift alone. Its keydown asks for the tab's menu, under the tab, to take the
    // keyboard; its keyup is spent too, which is when Windows opens the browser's own menu. Either
    // marks the task, so a contextmenu the browser fires after it asks nothing more
    // (_onContextMenu). Returns whether the key was one of them.
    _onMenuKey(e, tab) {
        if (e.ctrlKey || e.metaKey || e.altKey)
            return false;
        const menuKey = (e.key === 'F10' && e.shiftKey) || (e.key === 'ContextMenu' && !e.shiftKey);
        if (!menuKey)
            return false;
        e.preventDefault();
        this._menuKeyed = true;
        clearTimeout(this._menuKeyedTimer);
        this._menuKeyedTimer = setTimeout(() => {
            this._menuKeyed = false;
            this._menuKeyedTimer = undefined;
        }, 0);
        if (e.type === 'keydown') {
            const box = e.currentTarget.getBoundingClientRect();
            this._askMenu({ id: tab.id, x: box.left, y: box.bottom, keyboard: true });
        }
        return true;
    }
    // A right-click on a tab, or on its ×: its menu, at the pointer, in place of the browser's. One
    // that follows a menu key is the browser's answer to the key, whose menu was asked for already.
    _onContextMenu(e, tab) {
        e.preventDefault();
        if (this._menuKeyed)
            return;
        this._askMenu({ id: tab.id, x: e.clientX, y: e.clientY });
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
        return types.includes(TAB_DRAG_TYPE) && !types.includes('Files');
    }
    // The tab dragged now, if this row takes it: one it started itself, or one a row of its group
    // started. Only the types can be read while the drag is on its way (the data comes with the
    // drop), so the type decides, and the drag this page started says whose tab it is.
    _taken(e) {
        const drag = dragged;
        if (!drag || !this._isTabDrag(e))
            return null;
        const own = drag.row === this;
        if (!own && (this.group === '' || drag.row.group !== this.group))
            return null;
        return { id: drag.id, own };
    }
    _onDragStart(e, tab) {
        if (!e.dataTransfer)
            return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData(TAB_DRAG_TYPE, tab.id);
        this._dragging = tab.id;
        dragged = { row: this, id: tab.id };
    }
    // Where the drag lands over `tab`: its own tab takes the place of the tab it is over, on that
    // tab's far side when it comes from the left (pushing it left) and its near side from the right;
    // another row's lands on the side of the half the pointer is over. Null: nowhere (itself).
    _landing(e, tab, taken) {
        if (tab.id === taken.id)
            return null;
        if (taken.own) {
            const tabs = this._list();
            return tabs.findIndex((t) => t.id === taken.id) < tabs.findIndex((t) => t.id === tab.id) ? 'after' : 'before';
        }
        const box = e.currentTarget.getBoundingClientRect();
        return e.clientX < box.left + box.width / 2 ? 'before' : 'after';
    }
    // The dragover is where a drop is accepted: prevented, it says "drop here".
    _onDragOver(e, tab) {
        const taken = this._taken(e);
        const side = taken && this._landing(e, tab, taken);
        if (!side)
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this._over?.id !== tab.id || this._over.side !== side)
            this._over = { id: tab.id, side };
    }
    _onDragLeave(e, tab) {
        // Onto the tab's own label or ×: still over it.
        const to = e.relatedTarget;
        if (to instanceof Node && e.currentTarget.contains(to))
            return;
        if (this._over?.id === tab.id)
            this._over = null;
    }
    // The dragged tab's index in `tabs` once moved: the place of the tab it is dropped on, for its
    // own; before or after that tab, for another row's. Only a drag this row takes, and only the tab
    // that drag carries: a drop of a tab on itself, or naming another, moves nothing.
    _onDrop(e, tab) {
        const taken = this._taken(e);
        if (!taken)
            return;
        e.preventDefault();
        const side = this._landing(e, tab, taken);
        this._over = null;
        const tabs = this._list();
        const index = tabs.findIndex((t) => t.id === tab.id);
        if (!side || e.dataTransfer.getData(TAB_DRAG_TYPE) !== taken.id)
            return;
        if (taken.own) {
            if (tabs.some((t) => t.id === taken.id))
                this._move(taken.id, index);
        }
        else {
            this._move(taken.id, side === 'after' ? index + 1 : index);
        }
    }
    // Over the strip itself, past the last tab (a dragover on a tab is the tab's, which bubbles
    // here too): the dragged tab goes to the row's end. Its own last tab is there already.
    _endOf(e) {
        if (e.target !== e.currentTarget)
            return null;
        const taken = this._taken(e);
        const last = this._list().at(-1);
        if (!taken || !last || last.id === taken.id)
            return null;
        return { ...taken, last };
    }
    _onEndDragOver(e) {
        const end = this._endOf(e);
        if (!end)
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this._over?.id !== end.last.id || this._over.side !== 'after')
            this._over = { id: end.last.id, side: 'after' };
    }
    _onEndDragLeave(e) {
        // Onto a tab of the row: that tab's dragover marks where the drag lands now.
        const to = e.relatedTarget;
        if (to instanceof Node && e.currentTarget.contains(to))
            return;
        this._over = null;
    }
    _onEndDrop(e) {
        const end = this._endOf(e);
        if (!end)
            return;
        e.preventDefault();
        this._over = null;
        if (e.dataTransfer.getData(TAB_DRAG_TYPE) !== end.id)
            return;
        const tabs = this._list();
        if (!end.own)
            this._move(end.id, tabs.length);
        else if (tabs.some((t) => t.id === end.id))
            this._move(end.id, tabs.length - 1);
    }
    // However the drag ends: dropped here or elsewhere, or let go. A tab dropped in another row has
    // gone from this one by now, and its element with it, which still hears the end of its drag.
    _onDragEnd() {
        if (dragged?.row === this)
            dragged = null;
        this._dragging = null;
        this._over = null;
    }
    // The mark of where the dragged tab lands, on the tab beside the place.
    _dropClass(tab) {
        return this._over?.id === tab.id ? `drop-${this._over.side}` : '';
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
    // What the tab reads: its subtitle, then its label, as they are drawn.
    _title(tab) {
        return tab.subtitle ? `${tab.subtitle}, ${tab.label}` : tab.label;
    }
    // What a screen reader calls the tab, or its menu item: what it reads, and what the italic and the
    // dot say to the eye.
    _name(tab) {
        return [this._title(tab), tab.preview ? 'preview' : '', tab.dirty ? 'unsaved' : ''].filter((part) => part !== '').join(', ');
    }
    _icon(tab) {
        return tab.icon ? html `<dex-icon .iconId=${tab.icon} size="14"></dex-icon>` : nothing;
    }
    _subtitle(tab) {
        return tab.subtitle ? html `<span class="subtitle">${tab.subtitle}</span>` : nothing;
    }
    _tab(tab, tabbable) {
        const active = tab.id === this.active;
        const classes = [
            'tab',
            active ? 'active' : '',
            tab.preview ? 'preview' : '',
            tab.dirty ? 'dirty' : '',
            tab.id === this._dragging ? 'dragging' : '',
            this._dropClass(tab),
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
        @keyup=${(e) => this._onMenuKey(e, tab)}
        @contextmenu=${(e) => this._onContextMenu(e, tab)}
        @focusin=${() => (this._focusId = tab.id)}
        @dragstart=${(e) => this._onDragStart(e, tab)}
        @dragover=${(e) => this._onDragOver(e, tab)}
        @dragleave=${(e) => this._onDragLeave(e, tab)}
        @drop=${(e) => this._onDrop(e, tab)}
        @dragend=${this._onDragEnd}
      >
        ${this._subtitle(tab)}${this._icon(tab)}
        <span class="label">${tab.label}</span>
        <button
          class="close"
          tabindex="-1"
          title="Close"
          aria-label="Close ${this._title(tab)}"
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
              ${this._subtitle(tab)}${this._icon(tab)}
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
        // The … button is hidden as drawn, and its `hidden` is bound to nothing: _measure shows and
        // hides it as the room says, with no draw of its own.
        return html `
      <div class="bar">
        <div
          role="tablist"
          aria-label="Open documents"
          @wheel=${this._onWheel}
          @scroll=${this._markClipped}
          @focusout=${this._onFocusOut}
          @dragover=${this._onEndDragOver}
          @dragleave=${this._onEndDragLeave}
          @drop=${this._onEndDrop}
        >
          ${repeat(tabs, (tab) => tab.id, (tab) => this._tab(tab, tab.id === tabbable))}
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
__decorate([
    property({ attribute: false })
], DexDocTabs.prototype, "tabs", void 0);
__decorate([
    property({ reflect: true })
], DexDocTabs.prototype, "active", void 0);
__decorate([
    property({ reflect: true })
], DexDocTabs.prototype, "group", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], DexDocTabs.prototype, "unfocused", void 0);
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
], DexDocTabs.prototype, "_menuOpen", void 0);
__decorate([
    state()
], DexDocTabs.prototype, "_menuFocus", void 0);
/** Registers the widget as `<dex-doc-tabs>`, or under `tag`, and the `<dex-icon>` its tabs draw. */
export function defineDocTabs(tag = 'dex-doc-tabs') {
    defineIcon();
    defineElement(tag, DexDocTabs);
}
