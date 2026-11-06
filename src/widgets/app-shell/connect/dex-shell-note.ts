// Copyright 2026 The MathWorks, Inc.
//
// A quiet line of text in a side of the shell: the Properties view's "Select an entry to view its
// properties." while the inspector has nothing to show. An internal part of connectShell's. The
// app drew that line with its stylesheet (app.css's #inspector-empty, data-explorer-app at
// 0983920); the shell's page has none, and a strict page refuses a style attribute, so the line
// draws itself.

import { LitElement, html, css } from 'lit';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';

/**
 * A note in muted text, padded as a side's content is: its children, as text. Hidden with the
 * `hidden` attribute, as connectInspector's `empty` element is.
 *
 * @tagname dex-shell-note
 */
export class DexShellNote extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: block;
      padding: 12px;
      color: var(--dex-color-text-muted, #666);
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: var(--dex-font-size, 13px);
    }
  `];

  override render() {
    return html`<slot></slot>`;
  }
}

/** Registers the element as `<dex-shell-note>`, or under `tag`. */
export function defineShellNote(tag = 'dex-shell-note'): void {
  defineElement(tag, DexShellNote);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-shell-note': DexShellNote;
  }
}
