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
import { aboutSections } from '../../model/shell/about.js';
import { PopoverController } from './popover.js';
import { popoverStyles } from './popover.styles.js';
/**
 * The shell's About popover, opened from the (i) button of an activity bar: a heading (the app's
 * name) and the lines the app hands it, each a label and its value (the app's version, the
 * versions it is built on). A line may name a section (`section: 'Built on'`): the lines with none
 * come first, under the app's name, then each section under its own heading, in the order its
 * first line has. The app's words are drawn as text, never as markup.
 *
 * show() opens it beside the button that opened it, as `<dex-settings-panel>` opens; Escape, a
 * press outside it, or close() closes it, and focus goes back to the button. It sends nothing.
 *
 * @tagname dex-about-panel
 */
export class DexAboutPanel extends LitElement {
    constructor() {
        super(...arguments);
        /** The heading, the app's name, drawn in capitals as the Settings title is; also the dialog's accessible name. */
        this.heading = 'Data Explorer';
        /**
         * The lines under the heading, in order: a label (Version) and its value (1.0.0), and the heading
         * of the section the line is in (`section`), if any. The lines with no section are drawn first;
         * each section follows, once, where its first line is.
         */
        this.lines = [];
        // Nothing in the card can take focus, so the card itself does: Escape is heard wherever focus
        // is, but a screen reader announces the dialog only once focus is in it.
        this._popover = new PopoverController(this, () => this.shadowRoot?.querySelector('.popover'));
    }
    static { this.styles = [hiddenStyles, popoverStyles, css `
    .popover {
      min-width: 200px;
    }

    /* Selectable, whatever the page around says: a version is what a bug report quotes. */
    .lines {
      margin: 0;
      user-select: text;
    }

    .line {
      display: flex;
      justify-content: space-between;
      gap: 16px;
    }

    .line + .line {
      margin-top: 4px;
    }

    dt {
      color: var(--dex-color-text-secondary, #555);
    }

    dd {
      margin: 0;
    }

    /* A section's heading in the title's capitals, with a line above it that parts it from the
       lines before; straight under the title it needs no line. */
    .section {
      margin: 10px 0 4px;
      padding-top: 8px;
      border-top: 1px solid var(--dex-border-color-light, #e0e0e0);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      color: var(--dex-color-text-secondary, #555);
    }

    .title + .section {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }
  `]; }
    /** Whether it is open: from show() until close(), Escape or a press outside it. The `open` attribute says the same, for styling. */
    get open() {
        return this._popover.open;
    }
    /**
     * Opens the popover beside `anchor`, the button that opened it, in viewport px (its
     * getBoundingClientRect()): to its right with their bottoms in line, or to its left when the
     * right has no room, and inside the window. Open already, it moves; not on the page, it does
     * not open.
     */
    show(anchor) {
        this._popover.show(anchor);
    }
    /** Closes the popover; focus goes back to the button when the popover held it. */
    close() {
        this._popover.close();
    }
    render() {
        if (!this.open)
            return nothing;
        return html `
      <div class="popover" role="dialog" aria-label=${this.heading} tabindex="-1">
        <div class="title" role="heading" aria-level="2">${this.heading}</div>
        ${aboutSections(this.lines).map((section) => html `
          ${section.heading === null ? nothing : html `<div class="section" role="heading" aria-level="3">${section.heading}</div>`}
          <dl class="lines">
            ${section.lines.map((line) => html `<div class="line"><dt>${line.label}</dt><dd>${line.value}</dd></div>`)}
          </dl>
        `)}
      </div>
    `;
    }
}
__decorate([
    property()
], DexAboutPanel.prototype, "heading", void 0);
__decorate([
    property({ attribute: false })
], DexAboutPanel.prototype, "lines", void 0);
/** Registers the widget as `<dex-about-panel>`, or under `tag`. */
export function defineAboutPanel(tag = 'dex-about-panel') {
    defineElement(tag, DexAboutPanel);
}
