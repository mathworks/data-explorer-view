// Copyright 2026 The MathWorks, Inc.
//
// What the status bar says of the active tab: its file's format as a small uppercase pill
// ("SLDD"), with the kind of file in words as its tooltip ("Data dictionary") and as what a screen
// reader hears of it (which spelled the format out: "S L D D Modified"), and "Modified" in the
// warning colour while the tab holds unsaved edits. An internal part of connectShell's, in the
// shell's status slot. Text on its own could be neither a pill nor coloured on a strict page, which
// refuses a style attribute, so the status draws itself.
//
// The warning ink is under WCAG AA's 4.5:1 on the light status bar itself (4.05:1), so "Modified"
// sits on a chip of the page's surface, where every theme's warning ink reads at 4.6:1 or better;
// the chip is outlined in the same ink, so it reads as a mark and not as a hole in the bar.
//
// Before the pill, for a host that reaches a MATLAB, a button names the MATLAB connected ("MATLAB
// R2027a"); a press asks the host to show how to connect. It is drawn at Root too, with no file
// open. Its ink is the secondary text's: the status area's muted ink reads at 4.3:1 on the dark bar,
// under the 4.5 a control's label needs.

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { buttonFocusRingStyles } from '../../shared/focus.styles.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';

/**
 * The active file's status: its `format` as a pill, `kind` the pill's tooltip, and a Modified mark
 * while `modified`. No format draws no pill, for no file open (Root) or one of no kind the shell
 * names. Before it, the MATLAB the window reaches (`matlab`) as a button, which sends
 * `dex-shell-matlab-connect` when pressed. Nothing at all with neither.
 *
 * @tagname dex-shell-status
 */
export class DexShellStatus extends LitElement {
  static override styles = [hiddenStyles, buttonFocusRingStyles, css`
    :host {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 10px;
      line-height: 14px;
      white-space: nowrap;
    }

    .format,
    .modified {
      padding: 0 5px;
      border: 1px solid transparent;
      border-radius: 3px;
    }

    .format {
      background: var(--dex-bg-badge, rgba(128, 128, 128, 0.18));
      color: var(--dex-color-text, #333);
      font-weight: 500;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .modified {
      background: var(--dex-bg-primary, #fff);
      border-color: var(--dex-color-warning, #d83b01);
      color: var(--dex-color-warning, #d83b01);
      font-weight: 600;
    }

    /* A button that reads as the status around it: the bar's font and size, no fill until the
       pointer is on it, no icon. */
    .matlab {
      padding: 0 5px;
      border: 1px solid transparent;
      border-radius: 3px;
      background: transparent;
      color: var(--dex-color-text-secondary, #555);
      font: inherit;
      cursor: pointer;
    }

    .matlab:hover {
      background: var(--dex-bg-hover, #e8e8e8);
    }

    /* What a screen reader hears of the pill, and no one sees. */
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }

    /* Forced colours paint both surfaces over with the page's: an outline keeps each a mark. */
    @media (forced-colors: active) {
      .format,
      .modified {
        border-color: CanvasText;
      }

      /* A button's border, so it reads as one where no fill is drawn. */
      .matlab {
        border: 1px solid ButtonText;
      }
    }
  `];

  /** The file's format, as the pill says it (`SLDD`). Default empty: nothing is drawn. Attribute `format`. */
  @property({ type: String }) format = '';
  /** The kind of file in words, the pill's tooltip and what a screen reader hears of it (`Data dictionary`). Default empty: the format. Attribute `kind`. */
  @property({ type: String }) kind = '';
  /** The file holds unsaved edits: Modified is drawn after the pill. Default false. Attribute `modified`. */
  @property({ type: Boolean }) modified = false;
  /** Which MATLAB the window reaches, as a button before the pill (`MATLAB R2027a`). Default empty: none. Attribute `matlab`. */
  @property({ type: String }) matlab = '';
  /** The MATLAB button's tooltip. Attribute `matlab-title`. */
  @property({ type: String, attribute: 'matlab-title' }) matlabTitle = '';

  private _connect(): void {
    this.dispatchEvent(new CustomEvent<null>('dex-shell-matlab-connect', { detail: null, bubbles: true, composed: true }));
  }

  override render() {
    // The host's Connect to MATLAB is a dialog: the button says it opens one.
    const matlab = this.matlab
      ? html`<button class="matlab" type="button" title=${this.matlabTitle || nothing} aria-haspopup="dialog" @click=${this._connect}>${this.matlab}</button>`
      : nothing;
    if (!this.format) return matlab;
    // Seen, the format; heard, the kind (or the format, for a status that names none).
    const heard = this.kind || this.format;
    return html`${matlab}<span class="format" title=${this.kind || nothing}
        ><span aria-hidden="true">${this.format}</span><span class="sr-only">${heard}</span></span
      >${this.modified ? html`<span class="modified">Modified</span>` : nothing}`;
  }
}

/** Registers the element as `<dex-shell-status>`, or under `tag`. */
export function defineShellStatus(tag = 'dex-shell-status'): void {
  defineElement(tag, DexShellStatus);
}

/**
 * The events `<dex-shell-status>` sends, by name: a request, connectShell's to answer. It bubbles
 * and is composed, so it reaches the document and the window too: HTMLElementEventMap,
 * DocumentEventMap and WindowEventMap extend this map, and a listener on an element, the document
 * or the window is typed.
 */
export interface ShellStatusEventMap {
  /** The MATLAB button was pressed: show how to connect (the host's Connect to MATLAB). */
  'dex-shell-matlab-connect': CustomEvent<null>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-shell-status': DexShellStatus;
  }
  interface HTMLElementEventMap extends ShellStatusEventMap {}
  interface DocumentEventMap extends ShellStatusEventMap {}
  interface WindowEventMap extends ShellStatusEventMap {}
}
