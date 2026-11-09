// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { chordLabel, matchesChord, parseChord } from '../../model/shell/chords.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { isMacPlatform } from '../shared/dragMode.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
/** ↑'s chord, as the shell writes its chords: the shell's own Up, which in this bar goes up a folder. */
const UP_CHORD = 'Alt+ArrowUp';
/** Whether the page runs on macOS, where the chord's label is ⌥↑: read at each use, as the shell reads it. */
function onMac() {
    return isMacPlatform(navigator.platform || navigator.userAgent || '');
}
/**
 * The folder bar: ↑, then the path of the folder shown as segments, outermost first
 * ("Users › delite › complex_dataflow"), then ⟳ (Read Again, or Pick Again) and ⋯ (Folder
 * Actions). It draws the segments it is given, the last one as the folder shown, and turns each
 * press into a request: `dex-folder-up`, `dex-folder-go` with a segment's path,
 * `dex-folder-refresh` and `dex-folder-menu`. It moves nowhere itself and works out no path: the
 * app says by `canUp` whether there is a folder above, by `refresh` what ⟳ does, and by `busy`
 * that a move is under way, during which only ⋯ can be used; it gives the bar the new segments
 * once the new folder is shown.
 *
 * A path too long for the bar folds the folders after the first into a `…` button, keeping as many
 * of the last ones as fit; the `…` asks for the menu too, with the folders it holds. Where even
 * the first does not fit beside the current folder it is folded as well, and a bar too narrow for
 * the current folder alone clips its name with an ellipsis.
 *
 * Every button is a tab stop, a disabled one included. Alt+↑ (⌥↑) anywhere in the bar is ↑.
 *
 * @tagname dex-folder-bar
 */
export class DexFolderBar extends LitElement {
    constructor() {
        super(...arguments);
        /**
         * The path of the folder shown, outermost first; the last is the folder shown, drawn as the
         * current one, which is no button. Replace the array to change it. Default none.
         */
        this.segments = [];
        /**
         * ↑ can be used: the host gives a folder above the one shown. Off, the default, disables it
         * (a browser's picked folder has none above it). Attribute `can-up`.
         */
        this.canUp = false;
        /**
         * What ⟳ does, by its name: `read` (Read Again, the default) for a folder the host reads again,
         * `pick` (Pick Again) for one it can only ask the user for again (a browser's snapshot of a
         * folder), `none` for no ⟳. Either sends `dex-folder-refresh`. Attribute `refresh`.
         */
        this.refresh = 'read';
        /**
         * A move or a read is under way: ↑, the segments, the `…` and ⟳ are disabled, and the bar says
         * aria-busy, until the app turns it off. ⋯ stays usable. Off, the default. Attribute `busy`.
         */
        this.busy = false;
        /**
         * Draws the icons of ↑, ⟳ and ⋯ in one colour, the text's (`<dex-icon mono>`), as the shell's
         * Minimal icon style draws its glyphs; off, the default, draws them in their files' colours.
         * Attribute `mono`, reflected so a page's stylesheet can follow it.
         */
        this.mono = false;
        // The segments the … stands for, as the last fit left them.
        this._folded = [];
        // The focus was on the path as new segments came: given back once they are drawn, should the
        // button it was on have gone with the old path.
        this._refocus = false;
        this._resize = null;
        // Forced colours, watched while the bar is in a page: see connectedCallback.
        this._forcedColors = null;
        this._refit = () => this._fit();
    }
    static { this.styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css `
    :host {
      display: block;
      box-sizing: border-box;
      height: 32px;
      background: var(--dex-bg-secondary, #f8f8f8);
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 12px;
      color: var(--dex-color-text, #333);
    }

    nav {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 100%;
      padding: 0 6px;
      box-sizing: border-box;
    }

    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      margin: 0;
      cursor: pointer;
    }

    /* Filled a step darker than the bar, as the location bar's Back, Forward and Up are, so the
       three read as buttons beside the path's box; a step more under the pointer. They never give
       way to a long path: the path does. In forced colours the shared sheet draws their border. */
    .go {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 4px;
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .go:hover:not([aria-disabled='true']),
    .go:active:not([aria-disabled='true']) {
      background: var(--dex-bg-active, #e0e0e0);
    }

    button[aria-disabled='true'] {
      cursor: default;
    }

    /* While a move is under way: the buttons it disabled are waiting, not refused. */
    nav[aria-busy='true'] button[aria-disabled='true'] {
      cursor: progress;
    }

    /* The content greyed and not the button, as the toolbar's: the button draws the focus ring,
       and the keyboard can stand on a disabled one, where a ring at .35 would be hard to see. */
    button[aria-disabled='true'] > * {
      opacity: 0.35;
    }

    /* The box takes the rest of the row and no more: min-width:0 lets it be narrower than the
       path it holds (a flex item is otherwise never narrower than its content). */
    .path {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      height: 24px;
      box-sizing: border-box;
      margin: 0;
      padding: 0 4px;
      list-style: none;
      overflow: hidden;
      background: var(--dex-bg-primary, #fff);
      border: 1px solid var(--dex-border-color-light, #e0e0e0);
      border-radius: 3px;
    }

    /* Each item at its own width, so a path too long for the box overflows it: that is what the
       bar measures to fold it. Shrinking, the items would fit any box and the path never fold. */
    li {
      display: flex;
      align-items: center;
      flex-shrink: 0;
      min-width: 0;
    }

    /* The display above beats the browser's own [hidden] rule: folded items are hidden that way. */
    li[hidden] {
      display: none;
    }

    /* Folded as far as it goes and still too long: the current folder gives way, its name ending
       in an ellipsis. The … keeps its width. */
    .path.squeezed li.place {
      flex-shrink: 1;
    }

    .separator {
      flex-shrink: 0;
      padding: 0 2px;
      color: var(--dex-color-text-disabled, #999);
    }

    /* The … leads the path once the first folder is folded too: nothing before it to separate. */
    .more.first .separator {
      display: none;
    }

    .segment,
    .fold,
    .current {
      display: flex;
      align-items: center;
      min-width: 0;
      height: 20px;
      padding: 0 4px;
      border-radius: 2px;
      white-space: nowrap;
      font-weight: 500;
    }

    .segment:hover:not([aria-disabled='true']),
    .fold:hover:not([aria-disabled='true']) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* Inset, unlike the buttons': the box clips what spills out of it, an outer ring included.
       The current folder takes the focus only from the bar, after a press on a segment. */
    .segment:focus-visible,
    .fold:focus-visible,
    .current:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
      outline: none;
    }

    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    /* The shared sheet greys a disabled <button>, which these are not (theirs is aria-disabled),
       and borders every [tabindex] as a button: the current folder's, which is none. A segment's
       outline is drawn inside it, as its ring is, where the box does not cut it off. */
    @media (forced-colors: active) {
      button[aria-disabled='true'] {
        border-color: GrayText !important;
        color: GrayText !important;
      }

      .current {
        border: none !important;
      }

      .segment:focus-visible,
      .fold:focus-visible,
      .current:focus-visible {
        outline-offset: -2px !important;
      }
    }
  `]; }
    // The labels' widths change with no resize of the box in two ways, and each is measured again:
    // forced colours coming or going (each segment gains or loses a border), and a web font loading
    // after the first draw (the labels set in its glyphs). Neither is there in every page: a test's
    // DOM, a browser without the font loading API.
    connectedCallback() {
        super.connectedCallback();
        // Back in a page after being taken out: watch the box again. The first time, firstUpdated does.
        if (this.hasUpdated)
            this._observe();
        this._forcedColors = typeof matchMedia === 'function' ? matchMedia('(forced-colors: active)') : null;
        this._forcedColors?.addEventListener('change', this._refit);
        document.fonts?.addEventListener('loadingdone', this._refit);
    }
    disconnectedCallback() {
        super.disconnectedCallback();
        this._resize?.disconnect();
        this._resize = null;
        this._forcedColors?.removeEventListener('change', this._refit);
        this._forcedColors = null;
        document.fonts?.removeEventListener('loadingdone', this._refit);
    }
    firstUpdated() {
        this._observe();
    }
    willUpdate(changed) {
        if (!changed.has('segments'))
            return;
        const focused = this.shadowRoot?.activeElement;
        this._refocus = focused instanceof Element && focused.closest('.path') !== null;
    }
    // A press on a segment makes it the folder shown, once the app has moved, and the current one is
    // no button: the button the keyboard was on goes with the old path, and the focus would fall to
    // the page's body. It goes to the current folder instead, where the user now is, which a screen
    // reader then reads out. A path that changed with the keyboard elsewhere leaves it there.
    updated() {
        this._fit();
        if (!this._refocus)
            return;
        this._refocus = false;
        const focused = this.shadowRoot?.activeElement;
        if (focused instanceof HTMLElement && !focused.closest('li')?.hidden)
            return;
        this.renderRoot.querySelector('.current')?.focus();
    }
    // The box, not the bar: it is the room the path has, and folding changes what is in it, not its
    // width, so the measuring never sets off another measure.
    _observe() {
        const box = this.renderRoot.querySelector('.path');
        if (!box || typeof ResizeObserver === 'undefined')
            return;
        this._resize ??= new ResizeObserver(() => this._fit());
        this._resize.observe(box);
    }
    // What the room makes of the path, after each draw and each resize: every segment shown, then,
    // while the path is wider than its box, one folder after another folded into the …, the one
    // after the first first, so the folders nearest the current one stay longest; then the first;
    // never the current one, whose name is clipped instead once nothing else is left to fold. Done
    // on the elements the template drew rather than through state, so a draw that measures is the
    // only draw (Lit has no update to schedule after the one it completed).
    //
    // Each fit starts from the whole path drawn as it would be, the … and its › included: measured
    // with what the last fit left (a … leading the path, with no ›), a fold would be decided for a
    // path narrower than the one then drawn.
    _fit() {
        const box = this.renderRoot.querySelector('.path');
        const more = box?.querySelector('li.more');
        const fold = more?.querySelector('button');
        if (!box || !more || !fold)
            return;
        // Read before anything is hidden: a browser may blur a button the moment it is no longer drawn.
        const focused = this.shadowRoot?.activeElement;
        const places = [...box.querySelectorAll('li.place')];
        for (const li of places)
            li.hidden = false;
        more.hidden = true;
        more.classList.remove('first');
        box.classList.remove('squeezed');
        const order = places.length > 1 ? [...places.keys()].slice(1, -1).concat(0) : [];
        const folded = [];
        for (const at of order) {
            if (box.scrollWidth <= box.clientWidth)
                break;
            more.hidden = false;
            places[at].hidden = true;
            if (at === 0)
                more.classList.add('first');
            folded.push(at);
        }
        box.classList.toggle('squeezed', box.scrollWidth > box.clientWidth);
        const segments = this._list();
        this._folded = folded.sort((a, b) => a - b).map((at) => segments[at]);
        fold.title = this._folded.map((s) => s.label).join(' › ');
        this._keepFocus(focused);
    }
    // The keyboard was on a segment this fit folded, or on the … it unfolded: neither is drawn now,
    // and the focus would fall to the page's body. It goes to the … that holds the segment, or to the
    // current folder once there is no … to go to.
    _keepFocus(focused) {
        if (!(focused instanceof HTMLElement) || !focused.closest('li')?.hidden)
            return;
        const more = this.renderRoot.querySelector('li.more');
        const to = more && !more.hidden ? more.querySelector('button') : this.renderRoot.querySelector('.current');
        to?.focus();
    }
    _list() {
        return Array.isArray(this.segments) ? this.segments : [];
    }
    // Each request checks again that it may be sent, though a disabled button looks it: aria-disabled
    // leaves a button pressable, and a script's click() in the same task as the app's change lands
    // before the button is drawn disabled.
    _up() {
        if (!this.canUp || this.busy)
            return;
        this.dispatchEvent(new CustomEvent('dex-folder-up', { bubbles: true, composed: true }));
    }
    _go(segment) {
        if (this.busy)
            return;
        this.dispatchEvent(new CustomEvent('dex-folder-go', {
            detail: { path: segment.path },
            bubbles: true,
            composed: true,
        }));
    }
    _refresh() {
        if (this.busy)
            return;
        this.dispatchEvent(new CustomEvent('dex-folder-refresh', { bubbles: true, composed: true }));
    }
    // A press of ⋯ or …. Enter and Space on a button click it with no pointer's count (detail 0),
    // where a pointer's click counts 1 or more: the menu of a key's press takes the keyboard.
    _menu(e, segments) {
        const box = e.currentTarget.getBoundingClientRect();
        const detail = { anchor: { x: box.x, y: box.y, width: box.width, height: box.height } };
        if (segments)
            detail.segments = segments;
        if (e.detail === 0)
            detail.keyboard = true;
        this.dispatchEvent(new CustomEvent('dex-folder-menu', { detail, bubbles: true, composed: true }));
    }
    _onFold(e) {
        if (this.busy)
            return;
        this._menu(e, [...this._folded]);
    }
    // Alt+↑ is the shell's Up, heard on the window: in the bar it is ↑, and spent even where ↑ goes
    // nowhere, since left to the window it would move the location bar instead, which a press in the
    // folder's bar does not mean. Once for a held key: going up a folder re-roots the shell, a
    // deliberate act, and a held key would go up one folder after another as fast as it repeats.
    _onKeydown(e) {
        if (e.isComposing || !matchesChord(parseChord(UP_CHORD), e, onMac()))
            return;
        e.preventDefault();
        if (!e.repeat)
            this._up();
    }
    // A segment, behind a separator unless it is the first; the separator sits inside the item,
    // since a list holds only items, and is hidden from a screen reader, which hears the list. The
    // last is the current folder: no button, since a press there would go where the user is.
    _place(segment, index, current) {
        return html `
      <li class="place">
        ${index > 0 ? html `<span class="separator" aria-hidden="true">›</span>` : nothing}
        ${current
            ? html `<span class="current" aria-current="location" tabindex="-1" title=${segment.path}><span class="label">${segment.label}</span></span>`
            : html `<button
              type="button"
              class="segment"
              title=${segment.path}
              aria-disabled=${this.busy ? 'true' : 'false'}
              @click=${() => this._go(segment)}
            ><span class="label">${segment.label}</span></button>`}
      </li>
    `;
    }
    _refreshButton() {
        if (this.refresh === 'none')
            return nothing;
        const label = this.refresh === 'pick' ? 'Pick Again' : 'Read Again';
        return html `
      <button
        type="button"
        class="go refresh"
        aria-label=${label}
        title=${label}
        aria-disabled=${this.busy ? 'true' : 'false'}
        @click=${this._refresh}
      ><dex-icon .iconId=${'refresh'} .size=${16} .mono=${this.mono}></dex-icon></button>
    `;
    }
    // The … item is drawn always, after the first segment, and hidden until a fit folds something:
    // shown and hidden on the element, as the segments it stands for are.
    render() {
        const segments = this._list();
        const last = segments.length - 1;
        const busy = this.busy ? 'true' : 'false';
        return html `
      <nav aria-label="Folder Path" aria-busy=${busy} @keydown=${this._onKeydown}>
        <button
          type="button"
          class="go up"
          aria-label="Up One Level"
          title=${`Up One Level (${chordLabel(parseChord(UP_CHORD), onMac())})`}
          aria-disabled=${!this.canUp || this.busy ? 'true' : 'false'}
          @click=${this._up}
        ><dex-icon .iconId=${'arrowNavigationNorthUI'} .size=${16} .mono=${this.mono}></dex-icon></button>
        <ol class="path">
          ${segments.slice(0, 1).map((segment) => this._place(segment, 0, last === 0))}
          <li class="more" hidden>
            <span class="separator" aria-hidden="true">›</span>
            <button
              type="button"
              class="fold"
              aria-label="More Folders"
              aria-haspopup="menu"
              aria-disabled=${busy}
              @click=${this._onFold}
            ><span>…</span></button>
          </li>
          ${segments.slice(1).map((segment, i) => this._place(segment, i + 1, i + 1 === last))}
        </ol>
        ${this._refreshButton()}
        <button
          type="button"
          class="go actions"
          aria-label="Folder Actions"
          title="Folder Actions"
          aria-haspopup="menu"
          aria-disabled="false"
          @click=${(e) => this._menu(e)}
        ><dex-icon .iconId=${'meatballMenuUI'} .size=${16} .mono=${this.mono}></dex-icon></button>
      </nav>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexFolderBar.prototype, "segments", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-up' })
], DexFolderBar.prototype, "canUp", void 0);
__decorate([
    property()
], DexFolderBar.prototype, "refresh", void 0);
__decorate([
    property({ type: Boolean })
], DexFolderBar.prototype, "busy", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], DexFolderBar.prototype, "mono", void 0);
/** Registers the widget as `<dex-folder-bar>`, or under `tag`, and the `<dex-icon>` its buttons draw. */
export function defineFolderBar(tag = 'dex-folder-bar') {
    defineIcon();
    defineElement(tag, DexFolderBar);
}
