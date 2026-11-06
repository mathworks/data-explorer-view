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
 * The active file's status: its `format` as a pill, `kind` the pill's tooltip, and a Modified mark
 * while `modified`. No format draws nothing, for no file open (Root) or one of no kind the shell
 * names.
 *
 * @tagname dex-shell-status
 */
export class DexShellStatus extends LitElement {
    constructor() {
        super(...arguments);
        /** The file's format, as the pill says it (`SLDD`). Default empty: nothing is drawn. Attribute `format`. */
        this.format = '';
        /** The kind of file in words, the pill's tooltip and what a screen reader hears of it (`Data dictionary`). Default empty: the format. Attribute `kind`. */
        this.kind = '';
        /** The file holds unsaved edits: Modified is drawn after the pill. Default false. Attribute `modified`. */
        this.modified = false;
    }
    static { this.styles = [hiddenStyles, css `
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
    }
  `]; }
    render() {
        if (!this.format)
            return nothing;
        // Seen, the format; heard, the kind (or the format, for a status that names none).
        const heard = this.kind || this.format;
        return html `<span class="format" title=${this.kind || nothing}
        ><span aria-hidden="true">${this.format}</span><span class="sr-only">${heard}</span></span
      >${this.modified ? html `<span class="modified">Modified</span>` : nothing}`;
    }
}
__decorate([
    property({ type: String })
], DexShellStatus.prototype, "format", void 0);
__decorate([
    property({ type: String })
], DexShellStatus.prototype, "kind", void 0);
__decorate([
    property({ type: Boolean })
], DexShellStatus.prototype, "modified", void 0);
/** Registers the element as `<dex-shell-status>`, or under `tag`. */
export function defineShellStatus(tag = 'dex-shell-status') {
    defineElement(tag, DexShellStatus);
}
