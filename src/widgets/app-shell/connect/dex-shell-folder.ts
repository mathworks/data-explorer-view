// Copyright 2026 The MathWorks, Inc.
//
// The folder in the shell's Explorer, under the open files: its name, its tree, and the note that
// says it holds nothing or could not be read. An internal part, made and filled by connectShell
// only: what index.html's #folder-section was, and app.css drew (data-explorer-app at 0983920).
//
// The app's folder had a search box of its own over the folder's names. The shell has the Search
// view, which searches those names and the open files' (Cmd/Ctrl+Shift+F): one search, so the box
// is gone.

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { basename } from '../../../model/ids/pathUtil.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';

/**
 * The shell's folder: a title with the folder's name (its path the tooltip), the `<dex-hierarchy>`
 * it is given as its child, and `note` under it.
 *
 * @tagname dex-shell-folder
 */
export class DexShellFolder extends LitElement {
  static override styles = [hiddenStyles, css`
    /* Under the open files, and the rest of the side below them; never less than 40% of it, so a
       long list of open files does not squeeze the folder out (the side scrolls instead). */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 40%;
      border-top: 1px solid var(--dex-border-color-light, #e0e0e0);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
      color: var(--dex-color-text, #333);
    }

    .title {
      flex-shrink: 0;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--dex-color-text-secondary, #555);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .note {
      padding: 4px 12px;
      color: var(--dex-color-text-muted, #666);
    }

    ::slotted(*) {
      flex: 1 1 0;
      min-height: 0;
    }
  `];

  /** The folder's path: its name is the title, the path the title's tooltip. Attribute `root`. */
  @property() root = '';
  /** What is said under the tree (it holds no data files, or could not be read); empty, the default, says nothing. Attribute `note`. */
  @property() note = '';

  override render() {
    // A trailing separator names the folder too (a root picked as `/work/plant/`).
    const name = basename(this.root.replace(/[\\/]+$/, '')) || this.root;
    return html`
      <header class="title" title=${this.root || nothing}>${name || 'Folder'}</header>
      <slot></slot>
      ${this.note ? html`<div class="note">${this.note}</div>` : nothing}
    `;
  }
}

/** Registers the element as `<dex-shell-folder>`, or under `tag`. */
export function defineShellFolder(tag = 'dex-shell-folder'): void {
  defineElement(tag, DexShellFolder);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-shell-folder': DexShellFolder;
  }
}
