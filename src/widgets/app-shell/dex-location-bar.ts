// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { defineIcon } from '../shared/dex-icon.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { buttonFocusRingStyles } from '../shared/focus.styles.js';
import { highContrastStyles } from '../shared/high-contrast.styles.js';

/** One place on the path the location bar draws: a file, a section, an entry. */
export interface LocationSegment {
  /** What the segment reads, as text. */
  label: string;
  /** The id of the icon drawn before the label (an icon of `icons/`, or a data-model kind). None, the default, draws none. */
  icon?: string;
  /**
   * The segment's tooltip: more than the label says (a file's full path), or the whole label for
   * a bar narrow enough to clip it. None, the default, shows none.
   */
  title?: string;
}

/** What `dex-location-go` carries: where the user asked to go. */
export interface LocationGoDetail {
  /** Back, Forward or Up was pressed; or a segment, by its index in `segments`. */
  to: 'back' | 'forward' | 'up' | number;
}

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
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
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

    .segment dex-icon {
      flex-shrink: 0;
    }

    .label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `];

  /** The places on the way to where the user is, the first at the top and the last the current place. Default none. */
  @property({ attribute: false }) segments: LocationSegment[] = [];
  /** Back can be used: there is a place to go back to. Off, the default, disables it. Attribute `can-back`. */
  @property({ type: Boolean, attribute: 'can-back' }) canBack = false;
  /** Forward can be used: the user went back, and can go forward again. Off, the default, disables it. Attribute `can-forward`. */
  @property({ type: Boolean, attribute: 'can-forward' }) canForward = false;
  /** Up can be used: the current place is inside another one. Off, the default, disables it. Attribute `can-up`. */
  @property({ type: Boolean, attribute: 'can-up' }) canUp = false;

  // Each button checks again that it can be used, though a disabled one takes no click: the
  // button is redrawn disabled a microtask after the app says it cannot be used, and a click in
  // between would ask for a move the app has just ruled out (Back past the start of its history).
  private _go(to: LocationGoDetail['to'], allowed = true): void {
    if (!allowed) return;
    this.dispatchEvent(new CustomEvent<LocationGoDetail>('dex-location-go', {
      detail: { to },
      bubbles: true,
      composed: true,
    }));
  }

  // A segment, behind a separator unless it is the first. The separator sits inside the item,
  // since a list holds only items; it is hidden from a screen reader, which hears the list.
  // The last one is the current place, and asks to go there all the same: what a press on it
  // does (back up to the list from an entry, say) is the app's call.
  private _segment(segment: LocationSegment, index: number, last: boolean) {
    return html`
      <li>
        ${index > 0 ? html`<span class="separator" aria-hidden="true">›</span>` : nothing}
        <button
          type="button"
          class="segment"
          title=${segment.title ?? nothing}
          aria-current=${last ? 'location' : nothing}
          @click=${() => this._go(index)}
        >
          ${segment.icon ? html`<dex-icon .iconId=${segment.icon} .size=${14}></dex-icon>` : nothing}
          <span class="label">${segment.label}</span>
        </button>
      </li>
    `;
  }

  override render() {
    const last = this.segments.length - 1;
    return html`
      <nav aria-label="Location">
        <div class="history">
          <button
            type="button"
            class="go"
            aria-label="Back"
            title="Back"
            ?disabled=${!this.canBack}
            @click=${() => this._go('back', this.canBack)}
          ><dex-icon .iconId=${'arrowNavigationWestUI'} .size=${16}></dex-icon></button>
          <button
            type="button"
            class="go"
            aria-label="Forward"
            title="Forward"
            ?disabled=${!this.canForward}
            @click=${() => this._go('forward', this.canForward)}
          ><dex-icon .iconId=${'arrowNavigationEastUI'} .size=${16}></dex-icon></button>
          <button
            type="button"
            class="go"
            aria-label="Up"
            title="Up"
            ?disabled=${!this.canUp}
            @click=${() => this._go('up', this.canUp)}
          ><dex-icon .iconId=${'arrowNavigationNorthUI'} .size=${16}></dex-icon></button>
        </div>
        <div class="divider"></div>
        <ol class="path">
          ${this.segments.map((segment, i) => this._segment(segment, i, i === last))}
        </ol>
      </nav>
    `;
  }
}

/** Registers the widget as `<dex-location-bar>`, or under `tag`, and the `<dex-icon>` its buttons and segments draw. */
export function defineLocationBar(tag = 'dex-location-bar'): void {
  defineIcon();
  defineElement(tag, DexLocationBar);
}

/**
 * The events `<dex-location-bar>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface LocationBarEventMap {
  /**
   * The user asked to move: Back, Forward or Up was pressed (only while `canBack`, `canForward`
   * or `canUp` says it can be), or a segment was, the last one included. The bar changes nothing
   * itself; the app moves, and gives it the new segments.
   */
  'dex-location-go': CustomEvent<LocationGoDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-location-bar': DexLocationBar;
  }
  interface HTMLElementEventMap extends LocationBarEventMap {}
  interface DocumentEventMap extends LocationBarEventMap {}
  interface WindowEventMap extends LocationBarEventMap {}
}
