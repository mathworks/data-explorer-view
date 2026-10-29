// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { defineMatrixOpen } from '../shared/dex-matrix-open.js';
/**
 * The properties of one entry, in titled groups of name–value rows. A row may be an editable
 * field (a change sends `dex-property-changed`), a link (on its name, or on its value; a click
 * sends `dex-pi-navigate`), or a matrix value with the glyph that opens it in the variable
 * editor (`dex-matrix-open`, from `<dex-matrix-open>`). It holds no data of its own: an app sets
 * `groups`, from the model's buildPropertyGroups, each time the selection changes.
 *
 * @tagname dex-property-inspector
 */
export class DexPropertyInspector extends LitElement {
    constructor() {
        super(...arguments);
        /** The groups shown, in order; none, the default, draws an empty panel. Attribute `groups` (JSON). */
        this.groups = [];
    }
    static { this.styles = [hiddenStyles, css `
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 13px;
    }

    .content {
      flex: 1 1 0;
      overflow: auto;
      min-height: 0;
      padding: 8px;
      container-type: inline-size;
    }

    .group {
      margin-bottom: 12px;
    }

    .group-header {
      font-weight: 600;
      font-size: 12px;
      padding: 4px 0;
      border-bottom: 1px solid var(--dex-border-color-light, #e0e0e0);
      margin-bottom: 4px;
    }

    .prop-row {
      display: flex;
      flex-wrap: wrap;
      padding: 3px 0;
      font-size: 12px;
      align-items: baseline;
    }

    .prop-name {
      flex: 0 0 120px;
      color: var(--dex-color-text-secondary, #555);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .prop-value {
      flex: 1 1 0;
      color: var(--dex-color-text, #333);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    @container (max-width: 240px) {
      .prop-row {
        flex-direction: column;
        gap: 1px;
      }

      .prop-name {
        flex: none;
        font-size: 11px;
        font-weight: 500;
      }

      .prop-value {
        flex: none;
        width: 100%;
        padding-left: 8px;
        box-sizing: border-box;
      }
    }

    .prop-input {
      width: 100%;
      border: 1px solid var(--dex-border-color, #d0d0d0);
      border-radius: 2px;
      padding: 2px 4px;
      font-size: 12px;
      font-family: inherit;
      box-sizing: border-box;
    }

    .prop-input:focus {
      border-color: var(--dex-color-accent, #0078d4);
      outline: none;
      box-shadow: 0 0 0 1px var(--dex-color-accent, #0078d4);
    }

    .prop-link {
      color: var(--dex-color-accent, #0078d4);
      text-decoration: none;
      cursor: pointer;
    }

    .prop-link:hover {
      text-decoration: underline;
    }

    .prop-status {
      font-size: 11px;
      color: var(--dex-color-text-secondary, #555);
    }
  `]; }
    _onPropertyChange(propName, newValue, oldValue) {
        this.dispatchEvent(new CustomEvent('dex-property-changed', {
            detail: { propName, newValue, oldValue },
            bubbles: true,
            composed: true,
        }));
    }
    _onLinkClick(e, target) {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('dex-pi-navigate', {
            detail: { sourceId: target },
            bubbles: true,
            composed: true,
        }));
    }
    // Renders the VALUE cell of a non-link row: render() peels off `type: 'link'`
    // rows into their own template (the anchor goes on the NAME, and the value is a
    // muted descriptor), so a link never reaches here.
    _renderPropertyValue(prop) {
        if (prop.editable) {
            return html `<input
        class="prop-input"
        .value=${live(prop.value)}
        @change=${(e) => this._onPropertyChange(prop.name, e.target.value, prop.value)}
      />`;
        }
        // The type this value names, as a link to its definition — the same jump the table's
        // Data Type cell offers, reported through the same event as the name-anchored link
        // above so there is one navigation channel out of this component.
        //
        // Below the editable check on purpose: an anchor wrapped around an <input> is not a
        // thing, and Data Type is read-only everywhere today, so a row that claims both is a
        // contradiction to resolve rather than to render half of.
        if (prop.valueLink) {
            const target = prop.valueLink;
            return html `<a class="prop-link" href="#" @click=${(e) => this._onLinkClick(e, target)}
        >${prop.value}</a
      >`;
        }
        // The glyph FOLLOWS the value text — the same affordance, event and icon the
        // table's Value cell renders, so there is exactly one way to open a grid. An
        // editable row returned above, so an inline <input> never grows a glyph: the
        // same rule the table applies while a cell is being edited.
        if (prop.matrix) {
            return html `<span>${prop.value}</span
        ><dex-matrix-open .matrix=${prop.matrix}></dex-matrix-open>`;
        }
        return html `<span>${prop.value}</span>`;
    }
    render() {
        return html `
      <div class="content">
        ${this.groups.map(group => html `
          <div class="group">
            <div class="group-header">${group.title}</div>
            ${group.properties.map(prop => prop.type === 'link' ? html `
              <div class="prop-row">
                <span class="prop-name">
                  <a class="prop-link" href="#" @click=${(e) => this._onLinkClick(e, prop.linkTarget || prop.name)}>${prop.name}</a>
                </span>
                <span class="prop-value prop-status">${prop.value}</span>
              </div>
            ` : html `
              <div class="prop-row">
                <span class="prop-name" title="${prop.name}">${prop.name}</span>
                <span class="prop-value">${this._renderPropertyValue(prop)}</span>
              </div>
            `)}
          </div>
        `)}
      </div>
    `;
    }
}
__decorate([
    property({ type: Array })
], DexPropertyInspector.prototype, "groups", void 0);
/**
 * Registers the widget as `<dex-property-inspector>`, or under `tag`, after the matrix glyph a
 * matrix-valued row draws (under its default name).
 */
export function definePropertyInspector(tag = 'dex-property-inspector') {
    defineMatrixOpen();
    defineElement(tag, DexPropertyInspector);
}
