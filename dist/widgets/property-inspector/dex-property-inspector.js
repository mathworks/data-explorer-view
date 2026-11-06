// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, noChange } from 'lit';
import { property } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { defineMatrixOpen } from '../shared/dex-matrix-open.js';
/**
 * The properties of one entry, in titled groups of name–value rows. A row may be an editable
 * field (a text, a choice from its `options`, or a text of several lines; a change sends
 * `dex-property-changed`), a link (on its name, or on its value; a click sends
 * `dex-property-navigate`), or a matrix value with the glyph that opens it in the variable
 * editor (`dex-matrix-open`, from `<dex-matrix-open>`). It holds no data of its own: an app sets
 * `groups`, from the model's buildPropertyGroups, each time the selection changes.
 *
 * @tagname dex-property-inspector
 */
export class DexPropertyInspector extends LitElement {
    constructor() {
        super(...arguments);
        /** The groups shown, in order; none, the default, draws an empty panel. Property only. */
        this.groups = [];
        // Each field by an id of its own (its group and its property), as drawn last: what commit() finds
        // the focused field's row by.
        this._fields = new Map();
        // The fields typed in since their last change. A change of one field is answered by groups pushed
        // again (the repaint, a refusal, the document's unsaved state), maybe more than once, while the
        // user types in the next: that text is theirs until they change it or leave the field, so a push
        // leaves it alone. Only while the focus is in it (_typing): a field it is not in, or a new one at
        // the same place, follows its row (live), as every other field does, a refused one among them.
        this._typed = new Set();
        // The text each field's change last sent, and the row it was sent for, until the field is typed in
        // again: commit() sends a change before the field's own (on leaving it), which must not send it
        // twice, while a change of the next row's field at the same place is its own.
        this._sent = new Map();
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

    /* A text of lines: as high as two of them, and taller as the user drags it. */
    textarea.prop-input {
      display: block;
      min-height: 36px;
      resize: vertical;
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
    /**
     * Commit the field the focus is in, as leaving it would: `dex-property-changed`, if what it holds
     * is not its row's value. For an app's Save, which a chord gives with the focus still in the field,
     * to take what was typed there. Nothing when the focus is in no field.
     */
    commit() {
        const field = this.shadowRoot?.activeElement;
        const id = field?.dataset?.field;
        const prop = id === undefined ? undefined : this._fields.get(id);
        if (field && id !== undefined && prop)
            this._onPropertyChange(id, prop, field.value);
    }
    // The key only where the row has one: a row without says what it always said. A text that is the
    // row's, or the one this field last sent, is no change.
    _onPropertyChange(id, prop, newValue) {
        this._typed.delete(id);
        const sent = this._sent.get(id);
        if (newValue === prop.value || (sent?.row === prop && sent.text === newValue))
            return;
        this._sent.set(id, { row: prop, text: newValue });
        const { name: propName, key, value: oldValue } = prop;
        this.dispatchEvent(new CustomEvent('dex-property-changed', {
            detail: { propName, ...(key === undefined ? {} : { key }), newValue, oldValue },
            bubbles: true,
            composed: true,
        }));
    }
    _onTyped(id) {
        this._typed.add(id);
        this._sent.delete(id);
    }
    // Left without a change (typed back as it was): the field follows its row again, drawn as it now is.
    _onLeft(id) {
        if (this._typed.delete(id))
            this.requestUpdate();
    }
    // Whether the field `id` holds the user's text: typed in since its last change, and the focus in it.
    _typing(id) {
        if (!this._typed.has(id))
            return false;
        if (this.shadowRoot?.activeElement?.dataset?.field === id)
            return true;
        this._typed.delete(id);
        return false;
    }
    _onLinkClick(e, target) {
        e.preventDefault();
        this.dispatchEvent(new CustomEvent('dex-property-navigate', {
            detail: { sourceId: target },
            bubbles: true,
            composed: true,
        }));
    }
    // Renders the VALUE cell of a non-link row: render() peels off `type: 'link'`
    // rows into their own template (the anchor goes on the NAME, and the value is a
    // muted descriptor), so a link never reaches here.
    _renderPropertyValue(prop, id) {
        if (prop.editable) {
            this._fields.set(id, prop);
            const changed = (e) => this._onPropertyChange(id, prop, e.target.value);
            const typed = () => this._onTyped(id);
            const left = () => this._onLeft(id);
            // The row's value, unless the user is typing over it.
            const typing = this._typing(id);
            const text = typing ? noChange : live(prop.value);
            // A choice lists the value among its options, first where it is not one of them: a list shows
            // its first option when none is chosen, and the value it does not list would read as that one
            // and be written over with it. No value at all (core names no default) is none of them, shown
            // empty and not offered. Each option's `selected` is live, so groups pushed again after a
            // refused change put the list back on the value.
            if (prop.options) {
                const listed = prop.options.includes(prop.value) ? prop.options : [prop.value, ...prop.options];
                return html `<select class="prop-input" data-field=${id} aria-label=${prop.name} @input=${typed} @change=${changed} @blur=${left}>
          ${listed.map((option) => {
                    const none = option === '' && !prop.options.includes('');
                    return html `<option .value=${option} ?disabled=${none} ?hidden=${none} .selected=${typing ? noChange : live(option === prop.value)}>${option}</option>`;
                })}
        </select>`;
            }
            // An input keeps no line break, so a text that may hold lines is edited where it keeps them.
            if (prop.multiline) {
                return html `<textarea class="prop-input" rows="2" data-field=${id} aria-label=${prop.name} .value=${text} @input=${typed} @change=${changed} @blur=${left}></textarea>`;
            }
            return html `<input
        class="prop-input"
        data-field=${id}
        aria-label=${prop.name}
        .value=${text}
        @input=${typed}
        @change=${changed}
        @blur=${left}
      />`;
        }
        // The type this value names, as a link to its definition — the same jump the table's
        // Data Type cell offers, reported through the same event as the name-anchored link
        // above so there is one navigation channel out of this component.
        //
        // Below the editable check on purpose: an anchor wrapped around an <input> is not a
        // thing. Data Type is read-only in core; the one row that can claim both is an alias's Base
        // Type, editable where the page asked for editable rows, and its field holds the very name
        // the link would go to.
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
        this._fields.clear();
        return html `
      <div class="content">
        ${this.groups.map((group, g) => html `
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
                <span class="prop-value">${this._renderPropertyValue(prop, `${g}/${prop.key ?? prop.name}`)}</span>
              </div>
            `)}
          </div>
        `)}
      </div>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexPropertyInspector.prototype, "groups", void 0);
/**
 * Registers the widget as `<dex-property-inspector>`, or under `tag`, after the matrix glyph a
 * matrix-valued row draws (under its default name).
 */
export function definePropertyInspector(tag = 'dex-property-inspector') {
    defineMatrixOpen();
    defineElement(tag, DexPropertyInspector);
}
