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
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';
/**
 * The location bar: Back, Forward and Up, then a breadcrumb of where the user is, one segment
 * for each place on the way down to it ("Root › dd.sldd › Design Data"). It draws the segments
 * it is given, the last one as the current place, and turns each press into a request,
 * `dex-location-go`; it keeps no history and works out no path, so the app decides what each
 * request does, and says by `canBack`, `canForward` and `canUp` which buttons can be used. A
 * path too long for the bar shrinks its segments, each label ending in an ellipsis.
 *
 * @tagname dex-location-bar
 */
export class DexLocationBar extends LitElement {
    constructor() {
        super(...arguments);
        /** The places on the way to where the user is, the first at the top and the last the current place. Default none. */
        this.segments = [];
        /** Back can be used: there is a place to go back to. Off, the default, disables it. Attribute `can-back`. */
        this.canBack = false;
        /** Forward can be used: the user went back, and can go forward again. Off, the default, disables it. Attribute `can-forward`. */
        this.canForward = false;
        /** Up can be used: the current place is inside another one. Off, the default, disables it. Attribute `can-up`. */
        this.canUp = false;
        /**
         * Draws the icons of Back, Forward and Up in one colour, the text's (`<dex-icon mono>`), as a
         * toolbar's glyphs; off, the default, draws them in their files' colours. A segment's icon is a
         * file's or an entry's kind, which its colours tell apart, and keeps them either way. Attribute
         * `mono`, reflected so a page's stylesheet can follow it.
         */
        this.mono = false;
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
      gap: 6px;
      height: 100%;
      padding: 0 8px;
      box-sizing: border-box;
    }

    /* The buttons never give way to a long path: the path does. */
    .history {
      display: flex;
      gap: 2px;
      flex-shrink: 0;
    }

    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      margin: 0;
      cursor: pointer;
    }

    .go {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      padding: 0;
      border-radius: 4px;
    }

    .go:hover:not(:disabled) {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .go:active:not(:disabled) {
      background: var(--dex-bg-active, #e0e0e0);
    }

    .go:disabled {
      opacity: 0.35;
      cursor: default;
    }

    .divider {
      width: 1px;
      height: 16px;
      background: var(--dex-border-color, #d0d0d0);
      flex-shrink: 0;
    }

    /* The box takes the rest of the row and no more: min-width:0 lets it be narrower than the
       path it holds (a flex item is otherwise never narrower than its content), and so does
       every box inside it down to the label, which is the one that clips. */
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

    li {
      display: flex;
      align-items: center;
      min-width: 0;
    }

    .separator {
      flex-shrink: 0;
      padding: 0 2px;
      color: var(--dex-color-text-disabled, #999);
    }

    .segment {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      height: 20px;
      padding: 0 4px;
      border-radius: 2px;
      white-space: nowrap;
    }

    .segment:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* Inset, unlike the buttons': the box clips what spills out of it, an outer ring included. */
    .segment:focus-visible {
      box-shadow: inset var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    /* The same reason in forced colours, where the shared rule draws an outline 2px outside the
       button instead: the box cut its top and bottom off, leaving a focused segment two bars.
       Drawn inside it, the outline is whole. */
    @media (forced-colors: active) {
      .segment:focus-visible {
        outline-offset: -2px !important;
      }
    }

    .segment dex-icon {
      flex-shrink: 0;
    }

    /* Dimmed, and still legible: the text keeps a 4.5:1 contrast at this opacity, light and dark. */
    .segment.preview {
      opacity: 0.7;
    }

    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `]; }
    // Each button checks again that it can be used, though a disabled one takes no click. The
    // button is redrawn disabled a microtask after the app says it cannot be used, which is before
    // the next input event, so no click of the user's lands in between; a script's click() in the
    // same task does, and would ask for a move the app has just ruled out (Back past the start of
    // its history).
    _go(to, allowed = true) {
        if (!allowed)
            return;
        this.dispatchEvent(new CustomEvent('dex-location-go', {
            detail: { to },
            bubbles: true,
            composed: true,
        }));
    }
    // A segment, behind a separator unless it is the first. The separator sits inside the item,
    // since a list holds only items; it is hidden from a screen reader, which hears the list.
    // The last one but a preview is the current place, and asks to go there all the same: what a
    // press on it does (back up to the list from an entry, say) is the app's call.
    _segment(segment, index, current) {
        return html `
      <li>
        ${index > 0 ? html `<span class="separator" aria-hidden="true">›</span>` : nothing}
        <button
          type="button"
          class=${segment.preview ? 'segment preview' : 'segment'}
          title=${segment.title ?? nothing}
          aria-description=${segment.description ?? nothing}
          aria-current=${current ? 'location' : nothing}
          @click=${() => this._go(index)}
        >
          ${segment.icon ? html `<dex-icon .iconId=${segment.icon} .size=${14}></dex-icon>` : nothing}
          <span class="label">${segment.label}</span>
        </button>
      </li>
    `;
    }
    render() {
        let last = this.segments.length - 1;
        while (last > 0 && this.segments[last].preview)
            last--;
        return html `
      <nav aria-label="Location">
        <div class="history">
          <button
            type="button"
            class="go"
            aria-label="Back"
            title="Back"
            ?disabled=${!this.canBack}
            @click=${() => this._go('back', this.canBack)}
          ><dex-icon .iconId=${'arrowNavigationWestUI'} .size=${16} .mono=${this.mono}></dex-icon></button>
          <button
            type="button"
            class="go"
            aria-label="Forward"
            title="Forward"
            ?disabled=${!this.canForward}
            @click=${() => this._go('forward', this.canForward)}
          ><dex-icon .iconId=${'arrowNavigationEastUI'} .size=${16} .mono=${this.mono}></dex-icon></button>
          <button
            type="button"
            class="go"
            aria-label="Up"
            title="Up"
            ?disabled=${!this.canUp}
            @click=${() => this._go('up', this.canUp)}
          ><dex-icon .iconId=${'arrowNavigationNorthUI'} .size=${16} .mono=${this.mono}></dex-icon></button>
        </div>
        <div class="divider"></div>
        <ol class="path">
          ${this.segments.map((segment, i) => this._segment(segment, i, i === last))}
        </ol>
      </nav>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexLocationBar.prototype, "segments", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-back' })
], DexLocationBar.prototype, "canBack", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-forward' })
], DexLocationBar.prototype, "canForward", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-up' })
], DexLocationBar.prototype, "canUp", void 0);
__decorate([
    property({ type: Boolean, reflect: true })
], DexLocationBar.prototype, "mono", void 0);
/** Registers the widget as `<dex-location-bar>`, or under `tag`, and the `<dex-icon>` its buttons and segments draw. */
export function defineLocationBar(tag = 'dex-location-bar') {
    defineIcon();
    defineElement(tag, DexLocationBar);
}
