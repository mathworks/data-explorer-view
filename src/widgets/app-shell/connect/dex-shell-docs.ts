// Copyright 2026 The MathWorks, Inc.
//
// The documents' area of the shell connectShell builds: the tab row above, the open files' panels
// stacked under it, and the welcome while no document is shown. An internal part, made and filled
// by connectShell only: the page's markup and stylesheet are gone, so what index.html's #docs and
// #welcome were, and app.css drew, is this element's (data-explorer-app at 0983920).

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { buttonFocusRingStyles } from '../../shared/focus.styles.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';
import type { ToolbarActionDetail } from '../dex-toolbar.js';

/**
 * The shell's documents: `<dex-doc-tabs slot="tabs">` above, the panels of the open files as its
 * children (each a `<section>`, filling the area, `hidden` but the active one), and the welcome
 * while `welcome` is set: what the shell opens, with Open File… and Open Folder… buttons, which
 * send `dex-toolbar-action` as the toolbar's Open and Folder do, and the drop hint. While
 * `dropping` is set, the area is outlined as where the files dragged over the page will open.
 *
 * @tagname dex-shell-docs
 */
export class DexShellDocs extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      min-width: 0;
      min-height: 0;
      background: var(--dex-bg-primary, #fff);
      color: var(--dex-color-text, #333);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
    }

    /* The panels are stacked here, each filling it. */
    .panels {
      position: relative;
      flex: 1 1 0;
      min-height: 0;
    }

    ::slotted(section) {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      overflow: auto;
    }

    /* The display above beats the browser's own [hidden] rule. */
    ::slotted(section[hidden]) {
      display: none;
    }

    .welcome {
      padding: 32px;
      color: var(--dex-color-text-muted, #666);
      text-align: center;
    }

    .welcome[hidden] {
      display: none;
    }

    .actions {
      display: flex;
      justify-content: center;
      gap: 8px;
    }

    /* White on the accent, as the app's: the primary surface is white in the light theme and the
       ink that reads on the accent in the others. */
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

    .hint {
      font-size: 12px;
    }

    /* Files dragged over the page: a dashed outline in the accent, faintly tinted, over the panels
       and the welcome, as the prototype drew round its welcome. Over a table's sticky header and
       frozen column (z-index 3 at most) and under its menus; it takes no pointer, so the drop goes
       where it would without it. */
    :host([dropping]) .panels::after {
      content: '';
      position: absolute;
      inset: 8px;
      z-index: 4;
      border: 2px dashed var(--dex-color-accent, #0078d4);
      border-radius: 6px;
      background: color-mix(in srgb, var(--dex-color-accent, #0078d4) 6%, transparent);
      pointer-events: none;
    }

    @media (forced-colors: active) {
      :host([dropping]) .panels::after {
        border-color: Highlight;
        background: transparent;
      }
    }
  `];

  /** The welcome is shown, over the panels: no file is open (Root with files open shows the graph's panel). Attribute `welcome`. */
  @property({ type: Boolean, reflect: true }) welcome = true;
  /** The welcome offers Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
  @property({ type: Boolean, attribute: 'can-open-folder' }) canOpenFolder = false;
  /** Files are dragged over the page, to be opened: the area is outlined as where they go. Attribute `dropping`. */
  @property({ type: Boolean, reflect: true }) dropping = false;

  private _ask(actionId: string): void {
    this.dispatchEvent(new CustomEvent<ToolbarActionDetail>('dex-toolbar-action', {
      detail: { actionId },
      bubbles: true,
      composed: true,
    }));
  }

  override render() {
    return html`
      <slot name="tabs"></slot>
      <div class="panels">
        <div class="welcome" ?hidden=${!this.welcome}>
          <p>Open a data dictionary (.sldd), model (.slx, .mdl) or MAT-file (.mat).</p>
          <p class="actions">
            <button type="button" @click=${() => this._ask('open-file')}>Open File…</button>
            ${this.canOpenFolder ? html`<button type="button" @click=${() => this._ask('open-folder')}>Open Folder…</button>` : nothing}
          </p>
          <p class="hint">or drop files onto this window</p>
        </div>
        <slot></slot>
      </div>
    `;
  }
}

/** Registers the element as `<dex-shell-docs>`, or under `tag`. */
export function defineShellDocs(tag = 'dex-shell-docs'): void {
  defineElement(tag, DexShellDocs);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-shell-docs': DexShellDocs;
  }
}
