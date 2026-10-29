var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
// Copyright 2026 The MathWorks, Inc.
//
// The "open this matrix in the Variable Editor" glyph. Rendered by the table's
// Value cell AND by the Property Inspector's value row, so the keyboard
// contract, the icon and the event exist once rather than twice — the failure
// mode this repo keeps hitting is two surfaces implementing one rule slightly
// differently.
//
// It does not open anything. It dispatches `dex-matrix-open` carrying the
// descriptor and itself; matrixOpen.ts turns that into a show() on the one editor
// instance the webview owns, plus the `requestMatrix` that fetches the cells.
import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from './define.js';
import { hiddenStyles } from './hidden.styles.js';
import { defineIcon } from './dex-icon.js';
export class DexMatrixOpen extends LitElement {
    constructor() {
        super(...arguments);
        this.matrix = null;
    }
    static { this.styles = [hiddenStyles, css `
    :host {
      display: inline-flex;
      vertical-align: middle;
    }

    a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border-radius: 3px;
      cursor: pointer;
      opacity: 0.75;
      color: inherit;
    }

    /* The declared tokens, not the invented --dex-hover-bg / --dex-focus-ring pair this
       shipped with: nothing declares the first, so the glyph's hover was a 6% black that
       could not be seen on a dark row, and the second is a box-shadow rather than a
       colour, which made the whole outline declaration invalid and left the glyph with no
       focus ring. See test/variableEditorTheme.test.ts. */
    a:hover { opacity: 1; background: var(--dex-bg-hover, #e8e8e8); }

    a:focus-visible {
      outline: 2px solid var(--dex-color-accent, #0078d4);
      outline-offset: 1px;
      opacity: 1;
    }
  `]; }
    // The host element is not focusable, so a bare focus() would land on <body>.
    // dex-variable-editor.close() calls anchorEl.focus() to return focus here.
    focus(options) {
        this.shadowRoot?.querySelector('a')?.focus(options);
    }
    _open(e) {
        if (!this.matrix) {
            return;
        }
        // The glyph lives inside a Value cell whose click selects the row and whose
        // dblclick/Enter start an inline edit. Stop here so opening a grid never
        // also does one of those.
        e.preventDefault();
        e.stopPropagation();
        const detail = { matrix: this.matrix, anchorEl: this };
        if (this.rowId !== undefined) {
            detail.rowId = this.rowId;
        }
        this.dispatchEvent(new CustomEvent('dex-matrix-open', {
            detail,
            bubbles: true,
            composed: true,
        }));
    }
    _onKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            this._open(e);
        }
    }
    render() {
        if (!this.matrix) {
            return nothing;
        }
        return html `<a
      href="#"
      tabindex="0"
      role="button"
      aria-label=${`Open ${this.matrix.name} in the Variable Editor`}
      title=${`${this.matrix.dims.join('x')} ${this.matrix.className} — open in the Variable Editor`}
      @click=${this._open}
      @keydown=${this._onKeydown}
    ><dex-icon .iconId=${'wsTable'} .size=${14}></dex-icon></a>`;
    }
}
__decorate([
    property({ attribute: false })
], DexMatrixOpen.prototype, "matrix", void 0);
__decorate([
    property({ type: String })
], DexMatrixOpen.prototype, "rowId", void 0);
/** Registers the widget as `<dex-matrix-open>`, or under `tag`, after the icon it draws. */
export function defineMatrixOpen(tag = 'dex-matrix-open') {
    defineIcon();
    defineElement(tag, DexMatrixOpen);
}
