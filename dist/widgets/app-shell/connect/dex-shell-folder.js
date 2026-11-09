// Copyright 2026 The MathWorks, Inc.
//
// The shell's Folder view: the workspace folder's path bar, its tree, a line that says what is
// being read, and the note that says the folder holds nothing or could not be read; and with no
// folder shown, that none is open, with Open Folder… and a drop, as the documents' welcome
// offers files. An internal part, made and filled by connectShell only: what index.html's
// #folder-section was, and app.css drew (data-explorer-app at 0983920), moved out of the
// Explorer into a view of its own.
//
// The app's folder had a search box of its own over the folder's names. The shell has the Search
// view, which searches those names and the open files' (Cmd/Ctrl+Shift+F): one search, so the box
// is gone. The folder's name is the bar's last segment, so the title is gone too.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
/**
 * The shell's Folder view: its children (the `<dex-folder-bar>` and the `<dex-hierarchy>` it is
 * given), the `status` under them while a folder is read, and `note`. With no `root`, none of
 * them: it says no folder is open, offers Open Folder… (where `canOpenFolder`) and a drop. Open
 * Folder… sends `dex-toolbar-action` with `open-folder`, as the documents' welcome does.
 *
 * @tagname dex-shell-folder
 */
export class DexShellFolder extends LitElement {
    constructor() {
        super(...arguments);
        /** The workspace folder's path; empty, the default, for none shown: the view then says so. Attribute `root`. */
        this.root = '';
        /** What is said under the tree (it holds no data files, or could not be read); empty, the default, says nothing. Attribute `note`. */
        this.note = '';
        /** What is being read (`Reading models…`), in a live region over the note; empty, the default, says nothing. Attribute `status`. */
        this.status = '';
        /** With no folder shown, offer Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
        this.canOpenFolder = false;
    }
    static { this.styles = [hiddenStyles, css `
    /* The whole of its view: the bar, then the tree, which takes the rest and scrolls. */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    ::slotted(dex-hierarchy) {
      flex: 1 1 0;
      min-height: 0;
    }

    .note,
    .status {
      padding: 4px 12px;
      color: var(--dex-color-text-muted, #666);
    }

    /* A live region that is always there, so the words put in it are said: empty, it takes no room. */
    .status:empty {
      padding: 0;
    }

    /* No folder: the documents' welcome, as small as a side is. */
    .welcome {
      padding: 24px 12px;
      color: var(--dex-color-text-muted, #666);
      text-align: center;
    }

    .welcome p {
      margin: 0 0 8px;
    }

    /* White on the accent, as the welcome's buttons: the primary surface is white in the light
       theme and the ink that reads on the accent in the others. */
    button {
      font: inherit;
      padding: 4px 12px;
      color: var(--dex-bg-primary, #fff);
      background: var(--dex-color-accent, #0078d4);
      border: 0;
      border-radius: 3px;
      cursor: pointer;
    }

    button:hover {
      background: var(--dex-color-accent-hover, #005a9e);
    }

    button:focus-visible {
      outline: 2px solid var(--dex-color-accent, #0078d4);
      outline-offset: 2px;
    }

    .hint {
      font-size: 12px;
    }

    @media (forced-colors: active) {
      button {
        border: 1px solid ButtonText;
      }
    }
  `]; }
    _openFolder() {
        this.dispatchEvent(new CustomEvent('dex-toolbar-action', { detail: { actionId: 'open-folder' }, bubbles: true, composed: true }));
    }
    render() {
        if (!this.root) {
            return html `
        <div class="welcome">
          <p>No folder is open.</p>
          ${this.canOpenFolder ? html `<p><button type="button" @click=${() => this._openFolder()}>Open Folder…</button></p>` : nothing}
          <p class="hint">or drop a folder onto this window</p>
        </div>
      `;
        }
        return html `
      <slot></slot>
      <div class="status" role="status">${this.status}</div>
      ${this.note ? html `<div class="note">${this.note}</div>` : nothing}
    `;
    }
}
__decorate([
    property()
], DexShellFolder.prototype, "root", void 0);
__decorate([
    property()
], DexShellFolder.prototype, "note", void 0);
__decorate([
    property()
], DexShellFolder.prototype, "status", void 0);
__decorate([
    property({ type: Boolean, attribute: 'can-open-folder' })
], DexShellFolder.prototype, "canOpenFolder", void 0);
/** Registers the element as `<dex-shell-folder>`, or under `tag`. */
export function defineShellFolder(tag = 'dex-shell-folder') {
    defineElement(tag, DexShellFolder);
}
