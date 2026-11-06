// Copyright 2026 The MathWorks, Inc.
//
// The folder in the shell's Explorer, under the open files: its name, the search over its names,
// its tree, and the note that says it holds nothing or could not be read. An internal part, made
// and filled by connectShell only: what index.html's #folder-section was, and app.css drew
// (data-explorer-app at 0983920).
//
// The search box and its results list are made once, with the element, and drawn into its shadow
// root by the template: installSearch (folderSearch.ts) wires them as it wired the app's, and they
// exist from the start, before the first render, so connectShell can wire them at once.

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { basename } from '../../../model/ids/pathUtil.js';
import { defineElement } from '../../shared/define.js';
import { buttonFocusRingStyles } from '../../shared/focus.styles.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { highContrastStyles } from '../../shared/high-contrast.styles.js';

/**
 * The shell's folder: a title with the folder's name (its path the tooltip), a search box over the
 * folder's names, the list of matches that stands in for the tree while the box holds a query, the
 * `<dex-hierarchy>` it is given as its child, and `note` under it.
 *
 * @tagname dex-shell-folder
 */
export class DexShellFolder extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, highContrastStyles, css`
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 0;
      min-height: 0;
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

    input {
      flex-shrink: 0;
      margin: 0 8px 6px;
      padding: 4px 6px;
      font: inherit;
      color: var(--dex-input-fg, #333);
      background: var(--dex-input-bg, #fff);
      border: 1px solid var(--dex-input-border, #c8c8c8);
      border-radius: 3px;
    }

    input::placeholder {
      color: var(--dex-input-placeholder-fg, #767676);
    }

    input:focus-visible {
      outline: none;
      border-color: var(--dex-color-accent, #0078d4);
      box-shadow: var(--dex-focus-ring, 0 0 0 2px rgba(0, 120, 212, 0.4));
    }

    .results {
      flex: 1 1 0;
      min-height: 0;
      overflow: auto;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .results[hidden] {
      display: none;
    }

    .search-result {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      padding: 3px 12px;
      font: inherit;
      text-align: left;
      color: inherit;
      background: transparent;
      border: 0;
      cursor: pointer;
    }

    .search-result:hover,
    .search-result:focus-visible {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    .search-label {
      flex: none;
    }

    .search-where {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--dex-color-text-muted, #666);
    }

    .search-none,
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

  private readonly _input = Object.assign(document.createElement('input'), {
    type: 'search',
    placeholder: 'Search names',
    spellcheck: false,
  });
  private readonly _results = Object.assign(document.createElement('ul'), { className: 'results', hidden: true });

  constructor() {
    super();
    this._input.setAttribute('aria-label', "Search the folder's names");
    this._results.setAttribute('aria-label', 'Search results');
  }

  /** The search box, for installSearch. */
  get searchInput(): HTMLInputElement {
    return this._input;
  }

  /** The list the matches are drawn in, for installSearch: hidden while the box holds no query. */
  get searchResults(): HTMLUListElement {
    return this._results;
  }

  override render() {
    // A trailing separator names the folder too (a root picked as `/work/plant/`).
    const name = basename(this.root.replace(/[\\/]+$/, '')) || this.root;
    return html`
      <header class="title" title=${this.root || nothing}>${name || 'Folder'}</header>
      ${this._input} ${this._results}
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
