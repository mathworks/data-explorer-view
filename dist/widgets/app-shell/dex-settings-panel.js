// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
import { DEFAULT_SETTINGS } from '../../model/shell/settings.js';
import { PopoverController } from './popover.js';
import { popoverStyles } from './popover.styles.js';
// The system's first, as the prototype's code has it (an older screenshot of it put Auto last): the
// default, and the choice most people keep. Then the themes themselves.
const THEMES = [
    { value: 'auto', label: 'Auto', title: "The system's theme" },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'high-contrast', label: 'Hi-Con', title: 'High contrast' },
];
// The compact row keeps every label: it is lower, its icons smaller and beside their labels.
const TOOLBARS = [
    { value: 'normal', label: 'Normal', title: 'Labels under the icons' },
    { value: 'compact', label: 'Compact', title: 'Smaller icons, with the labels beside them' },
];
// The shell's own buttons alone: a file's or an entry's icon keeps its colours either way.
const ICON_STYLES = [
    { value: 'minimal', label: 'Minimal', title: "The toolbar's and the bars' icons in one colour" },
    { value: 'colorful', label: 'Colorful', title: 'The icons in their own colours' },
];
const TABLE_STYLES = [
    { value: 'grid', label: 'Grid', title: 'Lines round every cell' },
    { value: 'rows', label: 'Rows', title: 'A faint line between rows alone' },
];
/**
 * The shell's Settings popover, opened from the gear of an activity bar: the theme (Auto, Light,
 * Dark, Hi-Con), the toolbar's density (Normal, Compact: smaller icons with the labels beside
 * them), the icons of the shell's buttons (Minimal, in one colour, or Colorful) and the tables'
 * rules (Grid or Rows), each a row of segments that is a radio group. It shows `settings` and asks
 * for a change: a click, or an arrow key inside a group, sends `dex-settings-change` with the whole
 * new record and changes nothing by itself. The app applies the settings, keeps them, and sets
 * `settings` back; the popover stays open, so the themes can be tried one after another.
 *
 * show() opens it beside the button that opened it (placeBeside, in data-explorer-view/model),
 * focused on the chosen theme; Escape, a press outside it, or close() closes it, and focus goes
 * back to the button.
 *
 * @tagname dex-settings-panel
 */
export class DexSettingsPanel extends LitElement {
    constructor() {
        super(...arguments);
        /**
         * The settings shown: which segment of each row is checked. The app sets it, at first and
         * after each `dex-settings-change` it applies; the panel never changes it itself.
         */
        this.settings = DEFAULT_SETTINGS;
        this._popover = new PopoverController(this, () => this.shadowRoot?.querySelector('[data-key="theme"] [tabindex="0"]'));
    }
    static { this.styles = [hiddenStyles, popoverStyles, buttonFocusRingStyles, highContrastStyles, css `
    .popover {
      min-width: 160px;
    }

    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .row + .row {
      margin-top: 8px;
    }

    /* The segments' own corners rather than the group's overflow: a clipped group would cut
       the focus ring off every segment, and the ring is the only sign of which one the arrow
       keys are on. */
    .segments {
      display: flex;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 4px;
    }

    .segments button {
      margin: 0;
      padding: 3px 10px;
      border: none;
      border-radius: 0;
      background: none;
      color: var(--dex-color-text, #333);
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }

    .segments button + button {
      border-left: 1px solid var(--dex-border-color, #d0d0d0);
    }

    .segments button:first-child {
      border-radius: 3px 0 0 3px;
    }

    .segments button:last-child {
      border-radius: 0 3px 3px 0;
    }

    .segments button:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* The ink is the card's own surface, not white. theme.css has no token for ink on the
       accent, and white, which the prototype drew, is 2.75:1 on the dark set's light accent.
       The surface is white on the light and high-contrast accents (4.5:1, 7.9:1) and near-black
       on the dark one (6.1:1): AA in every set. */
    .segments button[aria-checked='true'] {
      background: var(--dex-color-accent, #0078d4);
      color: var(--dex-bg-primary, #fff);
    }

    /* Over its neighbours, so the ring is not painted under the next segment's surface. */
    .segments button:focus-visible {
      position: relative;
      z-index: 1;
    }

    /* Forced colours repaint every surface alike, which would leave the chosen segment looking
       like the others: the system's own selection colours keep it apart. */
    @media (forced-colors: active) {
      .segments button[aria-checked='true'] {
        forced-color-adjust: none;
        background: Highlight;
        color: HighlightText;
      }
    }
  `]; }
    /** Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling. */
    get open() {
        return this._popover.open;
    }
    /**
     * Opens the popover beside `anchor`, the button that opened it, in viewport px (its
     * getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
     * right has no room, and inside the window. Focus goes to the chosen theme. Open already, it
     * moves; not on the page, it does not open.
     */
    show(anchor) {
        this._popover.show(anchor);
    }
    /** Closes the popover, sending nothing; focus goes back to the button when the popover held it. */
    close() {
        this._popover.close();
    }
    // A request, and only when it would change something: as a radio button sends no change when
    // it is already the one checked.
    _ask(key, value) {
        if (this.settings[key] === value)
            return;
        const settings = { ...this.settings, [key]: value };
        this.dispatchEvent(new CustomEvent('dex-settings-change', {
            detail: { settings },
            bubbles: true,
            composed: true,
        }));
    }
    // The arrows move and choose, as in a group of radio buttons, wrapping at the ends. From the
    // focused segment and not the checked one: two quick presses come before the app has answered
    // the first. With a modifier held the key is someone else's (a shell chord), and left alone.
    _onGroupKey(e, key, choices) {
        if (e.altKey || e.ctrlKey || e.metaKey)
            return;
        const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
        if (step === 0)
            return;
        e.preventDefault();
        const segments = Array.from(this.shadowRoot.querySelectorAll(`[data-key="${key}"] [role="radio"]`));
        const focused = segments.indexOf(this.shadowRoot.activeElement);
        const from = focused >= 0 ? focused : choices.findIndex((c) => c.value === this.settings[key]);
        const to = (from + step + choices.length) % choices.length;
        segments[to]?.focus();
        this._ask(key, choices[to].value);
    }
    _row(key, label, choices) {
        const chosen = this.settings[key];
        // The checked segment is the group's one Tab stop; the arrows move inside it. With none
        // checked (a value this version does not offer), the first one is, so the group can still be
        // reached.
        const stop = choices.some((c) => c.value === chosen) ? chosen : choices[0].value;
        return html `
      <div class="row">
        <span class="label">${label}</span>
        <div
          class="segments"
          role="radiogroup"
          aria-label=${label}
          data-key=${key}
          @keydown=${(e) => this._onGroupKey(e, key, choices)}
        >
          ${choices.map((c) => html `
            <button
              type="button"
              role="radio"
              aria-checked=${c.value === chosen ? 'true' : 'false'}
              tabindex=${c.value === stop ? '0' : '-1'}
              title=${c.title ?? nothing}
              @click=${() => this._ask(key, c.value)}
            >${c.label}</button>
          `)}
        </div>
      </div>
    `;
    }
    render() {
        if (!this.open)
            return nothing;
        return html `
      <div class="popover" role="dialog" aria-label="Settings">
        <div class="title">Settings</div>
        ${this._row('theme', 'Theme', THEMES)}
        ${this._row('toolbar', 'Toolbar', TOOLBARS)}
        ${this._row('iconStyle', 'Icons', ICON_STYLES)}
        ${this._row('tableStyle', 'Table', TABLE_STYLES)}
      </div>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexSettingsPanel.prototype, "settings", void 0);
/** Registers the widget as `<dex-settings-panel>`, or under `tag`. */
export function defineSettingsPanel(tag = 'dex-settings-panel') {
    defineElement(tag, DexSettingsPanel);
}
