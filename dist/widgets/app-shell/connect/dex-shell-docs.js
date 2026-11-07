// Copyright 2026 The MathWorks, Inc.
//
// The documents' area of the shell connectShell builds: the tab row above, the open files' panels
// stacked under it, and the welcome while no document is shown; split, a second pane beside the
// first, each with its row and its panels, and the divider between them. An internal part, made
// and filled by connectShell only: the page's markup and stylesheet are gone, so what index.html's
// #docs and #welcome were, and app.css drew, is this element's (data-explorer-app at 0983920).
//
// The split is the prototype's, as VS Code draws its editor groups: a tab dragged over the
// documents shows where it would land (the left or the right fifth of the area makes a pane there,
// anywhere else among the documents leaves it in its pane, and with two panes either pane's
// documents take it), and the divider between two panes is dragged, or moved by the arrow keys,
// between a fifth and four fifths of the width. What the drop and the divider mean is
// connectShell's: the element asks (dex-pane-drop, dex-pane-focus) and tells (dex-panes-resized).
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';
import { SPLIT_MAX, SPLIT_MIN, clampSplit } from '../../../model/shell/shellLayout.js';
import { defineElement } from '../../shared/define.js';
import { buttonFocusRingStyles, tabindexFocusRingStyles } from '../../shared/focus.styles.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import { styleProps } from '../../shared/styleProps.js';
import { DexDocTabs, TAB_DRAG_TYPE } from '../dex-doc-tabs.js';
/** The slots of the second pane: its row of tabs, and its files' panels. The first pane's are `tabs` and the default slot. */
export const SECOND_PANE = Object.freeze({ tabs: 'tabs-2', panels: 'pane-2' });
// An arrow key on the divider moves it by a twentieth of the width.
const KEY_STEP = 0.05;
/**
 * The shell's documents: `<dex-doc-tabs slot="tabs">` above, the panels of the open files as its
 * children (each a `<section>`, filling the area, `hidden` but the one its pane shows), and the
 * welcome while `welcome` is set: what the shell opens, with Open File… and Open Folder… buttons,
 * which send `dex-toolbar-action` as the toolbar's Open and Folder do (and Open from URL…, for a
 * host that fetches web addresses, which sends `open-url`), and the drop hint. While
 * `dropping` is set, the focused pane is outlined as where the files dragged over the page will
 * open.
 *
 * While `split`, a second pane is drawn on the right, its row in the slot `tabs-2` and its panels
 * in `pane-2` (SECOND_PANE), the left pane taking `ratio` of the width. A press or the focus coming
 * into a pane other than `focusedPane` sends `dex-pane-focus`. A tab dragged from a row in the area
 * shows where it would land, and a drop sends `dex-pane-drop`; the divider, dragged or moved by the
 * arrow keys, changes `ratio` and sends `dex-panes-resized`.
 *
 * @tagname dex-shell-docs
 */
export class DexShellDocs extends LitElement {
    static { this.styles = [hiddenStyles, buttonFocusRingStyles, tabindexFocusRingStyles, highContrastStyles, css `
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
    }

    /* The panes, side by side: one, or two with the divider between them. */
    .panes {
      position: relative;
      display: flex;
      flex: 1 1 0;
      min-height: 0;
    }

    .pane {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-width: 0;
      min-height: 0;
    }

    /* A pane's panels are stacked here, each filling it. */
    .panels {
      position: relative;
      flex: 1 1 0;
      min-height: 0;
    }

    ::slotted(section) {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: auto;
    }

    /* The display above beats the browser's own [hidden] rule. */
    ::slotted(section[hidden]) {
      display: none;
    }

    .welcome {
      padding: 32px;
      color: var(--dex-color-text-muted, #666);
      text-align: center;
    }

    .welcome[hidden] {
      display: none;
    }

    .actions {
      display: flex;
      justify-content: center;
      gap: 8px;
    }

    /* White on the accent, as the app's: the primary surface is white in the light theme and the
       ink that reads on the accent in the others. */
    button {
      font: inherit;
      padding: 4px 12px;
      color: var(--dex-bg-primary, #fff);
      background: var(--dex-color-accent, #0078d4);
      border: 0;
      border-radius: 3px;
      cursor: pointer;
    }

    button:hover {
      background: var(--dex-color-accent-hover, #005a9e);
    }

    .hint {
      font-size: 12px;
    }

    /* Files dragged over the page: a dashed outline in the accent, faintly tinted, over the panels
       and the welcome, as the prototype drew round its welcome. Over a table's sticky header and
       frozen column (z-index 3 at most) and under its menus; it takes no pointer, so the drop goes
       where it would without it. */
    :host([dropping]) .pane.focused .panels::after {
      content: '';
      position: absolute;
      inset: 8px;
      z-index: 4;
      border: 2px dashed var(--dex-color-accent, #0078d4);
      border-radius: 6px;
      background: color-mix(in srgb, var(--dex-color-accent, #0078d4) 6%, transparent);
      pointer-events: none;
    }

    /* The divider between two panes, as the shell's sashes are drawn: the border's grey, the
       resizer's accent while it is pointed at, dragged, or has the keyboard. Stacked over the
       panes, as the sashes are: the right pane, later in the row, would paint over its focus ring. */
    .divider {
      flex: 0 0 4px;
      z-index: 10;
      background: var(--dex-border-color, #d0d0d0);
      cursor: col-resize;
      touch-action: none;
    }

    .divider:hover,
    .divider.dragging,
    .divider:focus-visible {
      background: var(--dex-shell-resizer-hover, #0078d4);
    }

    /* While a tab is dragged: where it may be dropped, over the panels (the rows take their own
       drops). The zones are the drop's targets, unseen; the landing shows the half of the pane a
       new pane would take, or the whole pane, in the drop cue's dashed accent. Over a table's
       sticky header and frozen column, as the cue for files is. */
    .overlay {
      position: absolute;
      inset: 0;
      z-index: 4;
      display: flex;
    }

    .zone {
      flex: 1 1 0;
    }

    .zone[data-zone='left'],
    .zone[data-zone='right'] {
      flex: 0 0 20%;
    }

    .landing {
      position: absolute;
      top: 4px;
      bottom: 4px;
      left: 4px;
      right: 4px;
      box-sizing: border-box;
      border: 2px dashed var(--dex-color-accent, #0078d4);
      border-radius: 6px;
      background: color-mix(in srgb, var(--dex-color-accent, #0078d4) 12%, transparent);
      pointer-events: none;
    }

    .landing[data-at='left'] {
      right: 50%;
    }

    .landing[data-at='right'] {
      left: 50%;
    }

    @media (forced-colors: active) {
      :host([dropping]) .pane.focused .panels::after,
      .landing {
        border-color: Highlight;
        background: transparent;
      }

      .divider {
        background: CanvasText;
      }

      .divider:hover,
      .divider.dragging,
      .divider:focus-visible {
        background: Highlight;
      }
    }
  `]; }
    constructor() {
        super();
        /** The welcome is shown, over the panels: no file is open (Root with files open shows the graph's panel). Attribute `welcome`. */
        this.welcome = true;
        /** The welcome offers Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
        this.canOpenFolder = false;
        /** The welcome offers Open from URL…: the host fetches web addresses. Attribute `can-open-url`. */
        this.canOpenUrl = false;
        /** Files are dragged over the page, to be opened: the focused pane is outlined as where they go. Attribute `dropping`. */
        this.dropping = false;
        /** A second pane is drawn beside the first, its row in the slot `tabs-2` and its panels in `pane-2`. Attribute `split`. */
        this.split = false;
        /**
         * The share of the width the left pane takes while split, held to 0.2–0.8; the divider changes
         * it, and says so with `dex-panes-resized`. Default 0.5. Attribute `ratio`.
         */
        this.ratio = 0.5;
        /** The pane the user is in (0 the left, 1 the right): no press in it asks to focus it. Default 0. Attribute `focused-pane`. */
        this.focusedPane = 0;
        // The tab dragged now from a row in the area, and whether it may make a new pane (a lone pane,
        // with another tab to leave behind); where over the documents it is.
        this._drag = null;
        this._over = null;
        this._resizing = false;
        // The divider's drag: its pointer, the panes' box measured as it began, and the ratio it began at;
        // where the pointer was last, and the frame that lays the panes out for it.
        this._resize = null;
        this._frame = 0;
        // A drop or a drag's end anywhere in the page, while a tab is dragged: the drag is over. The drop
        // as it bubbles, once its target (a zone here) has taken it; the end, which nothing takes, as it
        // comes.
        this._onPageDragOver = () => this._endDrag();
        // On the element itself: a row's and a panel's events reach it as they bubble out of its
        // children, which is where their pane is read (by their slot), wherever they are slotted.
        this.addEventListener('pointerdown', (e) => this._onPress(e));
        this.addEventListener('focusin', (e) => this._onPress(e));
        this.addEventListener('dragstart', (e) => this._onDragStart(e));
        // Any drop in the area ends the drag, a row's own included: a tab dropped on the other row
        // moves there, and its element leaves the row it came from before the drag's end comes, which
        // then reaches that element alone, out of the page. The page's drops and drag ends are heard
        // too while a drag is on (_endDrag, _onDragStart), so a drop elsewhere ends it as well.
        this.addEventListener('drop', () => this._endDrag());
        this.addEventListener('dragend', () => this._endDrag());
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._endDrag();
        if (this._frame)
            cancelAnimationFrame(this._frame);
        this._frame = 0;
        this._resize = null;
        this._resizing = false;
    }
    /**
     * Gives the keyboard to the welcome's Open File…, once the welcome is drawn, unless the focus has
     * gone somewhere in the page by then (anywhere but its body): for the shell, as the last file
     * closes with the focus on its tab, whose row hides. Nothing while the welcome is not shown.
     */
    focusOpenFile() {
        void this.updateComplete.then(() => {
            const at = document.activeElement;
            if (!this.welcome || (at && at !== document.body))
                return;
            this.renderRoot.querySelector('.welcome button')?.focus();
        });
    }
    _ask(actionId) {
        this.dispatchEvent(new CustomEvent('dex-toolbar-action', {
            detail: { actionId },
            bubbles: true,
            composed: true,
        }));
    }
    // The pane an event came from: the child of this element it came out of, by the slot it is in,
    // or the pane of the element's own it came from (the welcome's buttons). None for the divider.
    _paneOf(e) {
        for (const el of e.composedPath()) {
            if (el === this || !(el instanceof HTMLElement))
                continue;
            if (el.parentElement === this)
                return el.slot === SECOND_PANE.tabs || el.slot === SECOND_PANE.panels ? 1 : 0;
            if (el.classList.contains('pane') && el.dataset.pane)
                return Number(el.dataset.pane);
        }
        return null;
    }
    // A press, or the keyboard's focus, coming into a pane the user is not in.
    _onPress(e) {
        const pane = this._paneOf(e);
        if (pane !== null)
            this._focusPane(pane);
    }
    // The requests and the notice, one dispatch each, so the compiler checks each detail against its type.
    _focusPane(pane) {
        if (pane === this.focusedPane)
            return;
        this.dispatchEvent(new CustomEvent('dex-pane-focus', { detail: { pane }, bubbles: true, composed: true }));
    }
    _drop(detail) {
        this.dispatchEvent(new CustomEvent('dex-pane-drop', { detail, bubbles: true, composed: true }));
    }
    _resized() {
        this.dispatchEvent(new CustomEvent('dex-panes-resized', { detail: { ratio: this.ratio }, bubbles: true, composed: true }));
    }
    // ---- A tab dragged over the documents ----
    // A drag the documents take: a tab, and no files (files dragged in from the desktop are the
    // page's to open, and draw their own cue).
    _isTabDrag(e) {
        const types = Array.from(e.dataTransfer?.types ?? []);
        return types.includes(TAB_DRAG_TYPE) && !types.includes('Files');
    }
    // A drag that starts in a row of the area: its tab, read while the drag's data still can be. A
    // drag that starts anywhere else (a table's rows, another window's tab) shows nothing.
    _onDragStart(e) {
        this._endDrag();
        if (!this._isTabDrag(e))
            return;
        const row = e.composedPath().find((el) => el instanceof DexDocTabs);
        const id = e.dataTransfer.getData(TAB_DRAG_TYPE);
        if (!row || !id)
            return;
        this._drag = { id, sides: !this.split && (Array.isArray(row.tabs) ? row.tabs.length : 0) > 1 };
        document.addEventListener('drop', this._onPageDragOver);
        document.addEventListener('dragend', this._onPageDragOver, true);
    }
    _endDrag() {
        document.removeEventListener('drop', this._onPageDragOver);
        document.removeEventListener('dragend', this._onPageDragOver, true);
        if (this._drag)
            this._drag = null;
        if (this._over)
            this._over = null;
    }
    _onZoneOver(e, pane, zone) {
        if (!this._drag || !this._isTabDrag(e))
            return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (this._over?.pane !== pane || this._over.zone !== zone)
            this._over = { pane, zone };
    }
    _onZoneLeave(e, pane, zone) {
        const to = e.relatedTarget;
        if (to instanceof Node && e.currentTarget.contains(to))
            return;
        if (this._over?.pane === pane && this._over.zone === zone)
            this._over = null;
    }
    // The drop ends the overlay itself: a tab that moves to another row takes its element out of
    // the one it left, whose end of the drag then reaches no ancestor. Only the tab the drag started
    // with: a drop that names another moves nothing.
    _onZoneDrop(e, pane, zone) {
        const drag = this._drag;
        if (!drag || !this._isTabDrag(e))
            return;
        e.preventDefault();
        this._endDrag();
        if (e.dataTransfer.getData(TAB_DRAG_TYPE) !== drag.id)
            return;
        this._drop({ id: drag.id, pane, ...(zone === 'center' ? {} : { side: zone }) });
    }
    // ---- The divider ----
    _setRatio(ratio) {
        const next = clampSplit(ratio);
        if (next === clampSplit(this.ratio))
            return false;
        this.ratio = next;
        return true;
    }
    // An arrow key moves the divider a step the way it points, each step said.
    _onDividerKey(e) {
        const step = e.key === 'ArrowRight' ? KEY_STEP : e.key === 'ArrowLeft' ? -KEY_STEP : 0;
        if (step === 0)
            return;
        e.preventDefault();
        if (this._setRatio(clampSplit(this.ratio) + step))
            this._resized();
    }
    // The pointer is captured, so the drag goes on over the tables and out of the window; the panes'
    // box is measured once, as no move of the divider changes it.
    _onDividerDown(e) {
        if (e.button !== 0 || this._resize)
            return;
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        const box = this.renderRoot.querySelector('.panes').getBoundingClientRect();
        this._resize = { pointerId: e.pointerId, left: box.left, width: box.width, from: clampSplit(this.ratio) };
        this._resizing = true;
    }
    // A move lays the panes out again (two tables, each measuring its rows), so it is drawn once a
    // frame, where the pointer is by then, however many moves the frame had.
    _onDividerMove(e) {
        const drag = this._resize;
        if (!drag || e.pointerId !== drag.pointerId || drag.width <= 0)
            return;
        drag.at = e.clientX;
        this._frame ||= requestAnimationFrame(() => {
            this._frame = 0;
            this._followPointer();
        });
    }
    _followPointer() {
        const drag = this._resize;
        if (drag?.at !== undefined)
            this._setRatio((drag.at - drag.left) / drag.width);
    }
    // However the drag ends (the button let go, the pointer lost): where the pointer was let go, a
    // frame early if need be, said once, if it moved.
    _onDividerUp(e) {
        const drag = this._resize;
        if (!drag || e.pointerId !== drag.pointerId)
            return;
        if (this._frame)
            cancelAnimationFrame(this._frame);
        this._frame = 0;
        if (Number.isFinite(e.clientX) && drag.width > 0)
            drag.at = e.clientX;
        this._followPointer();
        this._resize = null;
        this._resizing = false;
        if (clampSplit(this.ratio) !== drag.from)
            this._resized();
    }
    // ---- Drawing ----
    // Where a tab dragged now may land in the pane: the left and right fifths of a lone pane and
    // between them, or with two panes, either pane's documents.
    _overlay(pane) {
        const drag = this._drag;
        if (!drag)
            return nothing;
        const zones = drag.sides ? ['left', 'center', 'right'] : ['center'];
        const over = this._over?.pane === pane ? this._over.zone : null;
        return html `
      <div class="overlay" aria-hidden="true">
        ${zones.map((zone) => html `
            <div
              class="zone"
              data-zone=${zone}
              @dragover=${(e) => this._onZoneOver(e, pane, zone)}
              @dragleave=${(e) => this._onZoneLeave(e, pane, zone)}
              @drop=${(e) => this._onZoneDrop(e, pane, zone)}
            ></div>
          `)}
        ${over ? html `<div class="landing" data-at=${over}></div>` : nothing}
      </div>
    `;
    }
    _pane(pane, content) {
        const ratio = clampSplit(this.ratio);
        const share = pane === 0 ? ratio : 1 - ratio;
        return html `
      <div
        class="pane ${pane === this.focusedPane ? 'focused' : ''}"
        data-pane=${pane}
        ${styleProps({ flex: this.split ? `${Math.round(share * 1000) / 1000} 1 0` : null })}
      >
        ${content}
      </div>
    `;
    }
    // A separator a keyboard reaches, as WAI-ARIA's window splitter: its value is the left pane's share, in percent.
    _divider() {
        const percent = Math.round(clampSplit(this.ratio) * 100);
        return html `
      <div
        class="divider ${this._resizing ? 'dragging' : ''}"
        role="separator"
        tabindex="0"
        aria-orientation="vertical"
        aria-label="Resize the panes"
        aria-valuenow=${percent}
        aria-valuemin=${Math.round(SPLIT_MIN * 100)}
        aria-valuemax=${Math.round(SPLIT_MAX * 100)}
        aria-valuetext=${`Left pane ${percent}%`}
        @keydown=${this._onDividerKey}
        @pointerdown=${this._onDividerDown}
        @pointermove=${this._onDividerMove}
        @pointerup=${this._onDividerUp}
        @pointercancel=${this._onDividerUp}
        @lostpointercapture=${this._onDividerUp}
      ></div>
    `;
    }
    render() {
        return html `
      <div class="panes">
        ${this._pane(0, html `
            <slot name="tabs"></slot>
            <div class="panels">
              <div class="welcome" ?hidden=${!this.welcome}>
                <p>Open a data dictionary (.sldd), model (.slx, .mdl) or MAT-file (.mat).</p>
                <p class="actions">
                  <button type="button" @click=${() => this._ask('open-file')}>Open File…</button>
                  ${this.canOpenFolder ? html `<button type="button" @click=${() => this._ask('open-folder')}>Open Folder…</button>` : nothing}
                  ${this.canOpenUrl ? html `<button type="button" @click=${() => this._ask('open-url')}>Open from URL…</button>` : nothing}
                </p>
                <p class="hint">or drop files onto this window</p>
              </div>
              <slot></slot>
              ${this._overlay(0)}
            </div>
          `)}
        ${this.split
            ? html `${this._divider()}${this._pane(1, html `
                <slot name=${SECOND_PANE.tabs}></slot>
                <div class="panels"><slot name=${SECOND_PANE.panels}></slot>${this._overlay(1)}</div>
              `)}`
            : nothing}
      </div>
    `;
    }
}
__decorate([
    property({ type: Boolean, reflect: true })
], DexShellDocs.prototype, "welcome", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-open-folder' })
], DexShellDocs.prototype, "canOpenFolder", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-open-url' })
], DexShellDocs.prototype, "canOpenUrl", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], DexShellDocs.prototype, "dropping", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], DexShellDocs.prototype, "split", void 0);
__decorate([
    property({ type: Number })
], DexShellDocs.prototype, "ratio", void 0);
__decorate([
    property({ type: Number, attribute: 'focused-pane' })
], DexShellDocs.prototype, "focusedPane", void 0);
__decorate([
    state()
], DexShellDocs.prototype, "_drag", void 0);
__decorate([
    state()
], DexShellDocs.prototype, "_over", void 0);
__decorate([
    state()
], DexShellDocs.prototype, "_resizing", void 0);
/** Registers the element as `<dex-shell-docs>`, or under `tag`. */
export function defineShellDocs(tag = 'dex-shell-docs') {
    defineElement(tag, DexShellDocs);
}
