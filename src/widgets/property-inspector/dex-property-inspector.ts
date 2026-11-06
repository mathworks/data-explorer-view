// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css, noChange } from 'lit';
import { property } from 'lit/decorators.js';
import { live } from 'lit/directives/live.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { defineMatrixOpen } from '../shared/dex-matrix-open.js';
import type { PropertyGroup, PropertyRow } from '../../model/inspector/piBuilder.js';

// The model's row types, which `groups` takes: re-exported for the property-inspector entry.
export type { PropertyGroup, PropertyRow };

/** What `dex-property-changed` carries: the property's name, its new text and the text it had. */
export interface PropertyChangedDetail {
  propName: string;
  /**
   * The property's key (its row's `key`), which an edit of it names as its column; absent for a
   * row that has none.
   */
  key?: string;
  newValue: string;
  oldValue: string;
}

/** What `dex-property-navigate` carries: the target of the link clicked. */
export interface PropertyNavigateDetail {
  sourceId: string;
}

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
  static override styles = [hiddenStyles, css`
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
  `];

  /** The groups shown, in order; none, the default, draws an empty panel. Property only. */
  @property({ attribute: false }) groups: PropertyGroup[] = [];

  // Each field by an id of its own (its group and its property), as drawn last: what commit() finds
  // the focused field's row by.
  private readonly _fields = new Map<string, PropertyRow>();
  // The fields typed in since their last change. A change of one field is answered by groups pushed
  // again (the repaint, a refusal, the document's unsaved state), maybe more than once, while the
  // user types in the next: that text is theirs until they change it or leave the field, so a push
  // leaves it alone. Every other field follows its row (live), a refused one put back among them.
  private readonly _typed = new Set<string>();
  // The text each field's change last sent, until it is typed in again: commit() sends a change
  // before the field's own (on leaving it), which must not send it twice.
  private readonly _sent = new Map<string, string>();

  /**
   * Commit the field the focus is in, as leaving it would: `dex-property-changed`, if what it holds
   * is not its row's value. For an app's Save, which a chord gives with the focus still in the field,
   * to take what was typed there. Nothing when the focus is in no field.
   */
  commit(): void {
    const field = this.shadowRoot?.activeElement as HTMLInputElement | null | undefined;
    const id = field?.dataset?.field;
    const prop = id === undefined ? undefined : this._fields.get(id);
    if (field && id !== undefined && prop) this._onPropertyChange(id, prop, field.value);
  }

  // The key only where the row has one: a row without says what it always said. A text that is the
  // row's, or the one this field last sent, is no change.
  private _onPropertyChange(id: string, prop: PropertyRow, newValue: string): void {
    this._typed.delete(id);
    if (newValue === prop.value || this._sent.get(id) === newValue) return;
    this._sent.set(id, newValue);
    const { name: propName, key, value: oldValue } = prop;
    this.dispatchEvent(new CustomEvent<PropertyChangedDetail>('dex-property-changed', {
      detail: { propName, ...(key === undefined ? {} : { key }), newValue, oldValue },
      bubbles: true,
      composed: true,
    }));
  }

  private _onTyped(id: string): void {
    this._typed.add(id);
    this._sent.delete(id);
  }

  // Left without a change (typed back as it was): the field follows its row again, drawn as it now is.
  private _onLeft(id: string): void {
    if (this._typed.delete(id)) this.requestUpdate();
  }

  private _onLinkClick(e: Event, target: string): void {
    e.preventDefault();
    this.dispatchEvent(new CustomEvent<PropertyNavigateDetail>('dex-property-navigate', {
      detail: { sourceId: target },
      bubbles: true,
      composed: true,
    }));
  }

  // Renders the VALUE cell of a non-link row: render() peels off `type: 'link'`
  // rows into their own template (the anchor goes on the NAME, and the value is a
  // muted descriptor), so a link never reaches here.
  private _renderPropertyValue(prop: PropertyRow, id: string): unknown {
    if (prop.editable) {
      this._fields.set(id, prop);
      const changed = (e: Event) => this._onPropertyChange(id, prop, (e.target as HTMLInputElement).value);
      const typed = () => this._onTyped(id);
      const left = () => this._onLeft(id);
      // The row's value, unless the user is typing over it.
      const text = this._typed.has(id) ? noChange : live(prop.value);
      // A choice lists the value among its options, first where it is not one of them: a list shows
      // its first option when none is chosen, and the value it does not list would read as that one
      // and be written over with it. No value at all (core names no default) is none of them, shown
      // empty and not offered. Each option's `selected` is live, so groups pushed again after a
      // refused change put the list back on the value.
      if (prop.options) {
        const listed = prop.options.includes(prop.value) ? prop.options : [prop.value, ...prop.options];
        return html`<select class="prop-input" data-field=${id} aria-label=${prop.name} @input=${typed} @change=${changed} @blur=${left}>
          ${listed.map((option) => {
            const none = option === '' && !prop.options!.includes('');
            return html`<option .value=${option} ?disabled=${none} ?hidden=${none} .selected=${this._typed.has(id) ? noChange : live(option === prop.value)}>${option}</option>`;
          })}
        </select>`;
      }
      // An input keeps no line break, so a text that may hold lines is edited where it keeps them.
      if (prop.multiline) {
        return html`<textarea class="prop-input" rows="2" data-field=${id} aria-label=${prop.name} .value=${text} @input=${typed} @change=${changed} @blur=${left}></textarea>`;
      }
      return html`<input
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
      return html`<a class="prop-link" href="#" @click=${(e: Event) => this._onLinkClick(e, target)}
        >${prop.value}</a
      >`;
    }
    // The glyph FOLLOWS the value text — the same affordance, event and icon the
    // table's Value cell renders, so there is exactly one way to open a grid. An
    // editable row returned above, so an inline <input> never grows a glyph: the
    // same rule the table applies while a cell is being edited.
    if (prop.matrix) {
      return html`<span>${prop.value}</span
        ><dex-matrix-open .matrix=${prop.matrix}></dex-matrix-open>`;
    }
    return html`<span>${prop.value}</span>`;
  }

  override render() {
    this._fields.clear();
    return html`
      <div class="content">
        ${this.groups.map((group, g) => html`
          <div class="group">
            <div class="group-header">${group.title}</div>
            ${group.properties.map(prop => prop.type === 'link' ? html`
              <div class="prop-row">
                <span class="prop-name">
                  <a class="prop-link" href="#" @click=${(e: Event) => this._onLinkClick(e, prop.linkTarget || prop.name)}>${prop.name}</a>
                </span>
                <span class="prop-value prop-status">${prop.value}</span>
              </div>
            ` : html`
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

/**
 * Registers the widget as `<dex-property-inspector>`, or under `tag`, after the matrix glyph a
 * matrix-valued row draws (under its default name).
 */
export function definePropertyInspector(tag = 'dex-property-inspector'): void {
  defineMatrixOpen();
  defineElement(tag, DexPropertyInspector);
}

/**
 * The events `<dex-property-inspector>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface PropertyInspectorEventMap {
  /** An editable row's field was changed and committed (its change event). */
  'dex-property-changed': CustomEvent<PropertyChangedDetail>;
  /**
   * A link was clicked: a link row's name (`sourceId` is its `linkTarget`, else its name) or a
   * value link (its `valueLink`).
   */
  'dex-property-navigate': CustomEvent<PropertyNavigateDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-property-inspector': DexPropertyInspector;
  }
  interface HTMLElementEventMap extends PropertyInspectorEventMap {}
  interface DocumentEventMap extends PropertyInspectorEventMap {}
  interface WindowEventMap extends PropertyInspectorEventMap {}
}
