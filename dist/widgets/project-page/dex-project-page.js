// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../shared/define.js';
import { hiddenStyles } from '../shared/hidden.styles.js';
import { newSectionState, renderProjectPage } from './projectPage.js';
import { PROJECT_PAGE_CSS } from './projectPageStyle.js';
/**
 * A MATLAB project's page: what it is, its startup and shutdown files, shortcuts, path, labels,
 * locations and the projects it references, from the message `projectPageMessage` builds. Each
 * section with many rows has a filter, and one past its cap a Show all; both are kept across a
 * new page of the same project (a store saved on disk), and dropped for another project. A link
 * to a file or a project is the app's to open: a click, Enter or Space sends `dex-project-open`.
 *
 * The page is in the element's shadow root with its stylesheet adopted, so it needs no
 * `style-src 'unsafe-inline'`, and the page's class names reach nothing else on the page.
 *
 * @tagname dex-project-page
 */
export class DexProjectPage extends LitElement {
    constructor() {
        super(...arguments);
        /**
         * The project shown: `projectPageMessage`'s answer (its `type` is ignored), or null for none.
         * A page of another project (another `root`) starts with every filter cleared; a page of the
         * same one keeps them. Setting it clears `error`.
         */
        this.payload = null;
        /** Why the project could not be shown, above the page; empty for nothing to say. Attribute `error`. */
        this.error = '';
        /**
         * The place a Locations link to a folder reveals it in, as the link's tooltip names it:
         * "Reveals `cache` in the Explorer". An app says where its own `dex-project-open` shows a
         * folder: `'Finder'`, `'the file manager'`. Default `'the Explorer'`. Attribute `reveal-in`.
         */
        this.revealIn = 'the Explorer';
        // Each section's filter and Show all, held outside the payload: they survive a repaint of the
        // same project on purpose, because a user who narrowed a section while working is not asking
        // for that to be undone because something saved.
        this._state = {};
        this._root = null;
        // The filter that had the keyboard before a repaint replaced it, and where its caret was.
        this._caret = null;
    }
    static { this.styles = [
        hiddenStyles,
        // The page's controls under forced colours (Windows high contrast): a border that says "this
        // is a control", and a focus ring in the system's own colour. A page in the document gets
        // these from its app (vscode's webview-page.css), and the app's rules stop at the shadow root,
        // so the element brings the same declarations itself. Each selector is inside
        // `:where(.dex-page)`, so it weighs what it weighs in the document (a list, not an `:is()`,
        // which would give `button` the weight of `[role='button']`), and the block comes before the
        // page's stylesheet, so the page's own rules still win where they win there: the filter keeps
        // its border, Show all its `border: 0`, and a link its own focus ring.
        css `
      @media (forced-colors: active) {
        :where(.dex-page) button,
        :where(.dex-page) [role='button'],
        :where(.dex-page) [tabindex='0'] {
          border: 1px solid ButtonText;
        }
        :where(.dex-page) button:focus-visible,
        :where(.dex-page) [role='button']:focus-visible,
        :where(.dex-page) [tabindex='0']:focus-visible {
          outline: 2px solid Highlight;
          outline-offset: 2px;
        }
        :where(.dex-page) input,
        :where(.dex-page) select,
        :where(.dex-page) textarea {
          border: 1px solid ButtonText;
        }
      }
    `,
        unsafeCSS(PROJECT_PAGE_CSS),
        css `
      /* What the stylesheet sets on the document's body, for a page that is the whole document,
         set here on the element instead. */
      :host {
        display: block;
        overflow: auto;
        font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        font-size: var(--dex-font-size, 13px);
        color: var(--dex-color-text, #333);
        background: var(--dex-bg-primary, #fff);
        -webkit-font-smoothing: antialiased;
      }

      .error {
        padding: 8px 28px;
        color: var(--dex-color-error, #d32f2f);
      }
    `,
    ]; }
    willUpdate(changed) {
        if (changed.has('payload') && this.payload) {
            if (this._root !== null && this._root !== this.payload.root)
                this._state = {};
            this._root = this.payload.root;
            if (!changed.has('error'))
                this.error = '';
        }
    }
    updated() {
        const page = this.renderRoot.querySelector('.dex-page');
        if (!page)
            return;
        // The page's markup is the renderer's escaped HTML (projectPage.ts), drawn whole each time:
        // every row is rebuilt, so the listeners are delegated, on the page.
        page.innerHTML = this.payload ? renderProjectPage(this.payload, this._state, { revealIn: this.revealIn }) : '';
        const caret = this._caret;
        this._caret = null;
        if (!caret)
            return;
        // The caret, not just the focus: the repaint replaced the input itself, and focus alone sends
        // the caret wherever the browser decides, which typed a query backwards.
        const again = [...page.querySelectorAll('input.filter')].find((i) => i.dataset.section === caret.section);
        if (!again)
            return;
        again.focus();
        if (caret.start !== null)
            again.setSelectionRange(caret.start, caret.end ?? caret.start);
    }
    _section(id) {
        return (this._state[id] ??= newSectionState());
    }
    _onInput(event) {
        const input = event.target;
        const id = input?.classList?.contains('filter') ? input.dataset.section : undefined;
        if (!input || !id)
            return;
        this._section(id).query = input.value;
        this._caret = { section: id, start: input.selectionStart, end: input.selectionEnd };
        this.requestUpdate();
    }
    _open(link) {
        const detail = { path: link.dataset.open };
        // Present only where the markup asked for it (a component row), and absent — not false —
        // everywhere else.
        if (link.dataset.prj !== undefined)
            detail.preferProject = true;
        this.dispatchEvent(new CustomEvent('dex-project-open', { detail, bubbles: true, composed: true }));
    }
    _onClick(event) {
        const target = event.target;
        // `closest`, not the target itself: a link's text is wrapped in <mark> spans as soon as a
        // filter matches inside it, and a click landing on the highlighted part has that <mark> as
        // its target.
        const open = target?.closest?.('[data-open]');
        if (open)
            return this._open(open);
        const expand = target?.closest?.('[data-expand]')?.dataset.expand;
        if (expand) {
            this._section(expand).expanded = true;
            this.requestUpdate();
        }
    }
    // The links are <a> without href — an href would navigate — so the browser gives them neither
    // keyboard activation nor a tab stop. `role="button"` and `tabindex="0"` in the markup supply the
    // second; this supplies the first, on both keys a button answers to.
    _onKeydown(event) {
        if (event.key !== 'Enter' && event.key !== ' ')
            return;
        const open = event.target?.closest?.('[data-open]');
        if (!open)
            return;
        // Space scrolls by default, which is not what pressing it on a focused control means.
        event.preventDefault();
        this._open(open);
    }
    render() {
        return html `
      ${this.error ? html `<div class="error" role="alert">${this.error}</div>` : nothing}
      <div class="dex-page" @input=${this._onInput} @click=${this._onClick} @keydown=${this._onKeydown}></div>
    `;
    }
}
__decorate([
    property({ attribute: false })
], DexProjectPage.prototype, "payload", void 0);
__decorate([
    property({ type: String })
], DexProjectPage.prototype, "error", void 0);
__decorate([
    property({ attribute: 'reveal-in' })
], DexProjectPage.prototype, "revealIn", void 0);
/** Registers the widget as `<dex-project-page>`, or under `tag`. */
export function defineProjectPage(tag = 'dex-project-page') {
    defineElement(tag, DexProjectPage);
}
