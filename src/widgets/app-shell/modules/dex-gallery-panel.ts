// Copyright 2026 The MathWorks, Inc.
//
// The app shell's Gallery view: a palette of the kinds of entry the active file can take, always
// open in a sidebar, as the prototype's gallery panel stood beside its table. Built on view's
// own Add gallery, not a second catalog: which tiles a dictionary, a MAT-file or a model offers,
// in which order, under which heading and landing in which section, is decided once
// (addCatalog.ts) and drawn once (dex-add-gallery.ts), so the panel and the table's `+ Add`
// popover cannot drift apart.
//
// The gallery is drawn here in place, not as the popover it is in the table (its `inline`): no
// Keep open box, which could change nothing; no focus taken on its first draw, which would take
// the keyboard from the table; Escape left to the page. What the panel adds is the
// heading that says where an add lands, a note when there is nowhere to add, and one request
// under its own name.

import { LitElement, html, css, nothing } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from '../../shared/define.js';
import { hiddenStyles } from '../../shared/hidden.styles.js';
import { defineAddGallery, type AddTileDetail } from '../../tree-table/dex-add-gallery.js';

/**
 * What `dex-gallery-add` carries: the tile's class, its section ('' for a MAT-file's variable, a
 * section of the file's own by its key otherwise) and its label, as the Add gallery's
 * `dex-add-tile` names them.
 */
export interface GalleryAddDetail {
  className: string;
  section: string;
  label: string;
}

/**
 * The app shell's Gallery panel: the Add gallery's tiles as a palette that is always open, under
 * a heading naming the file an add lands in ("Add to plant.sldd"). A click on a tile sends
 * `dex-gallery-add` with its class and section, for the app to add one entry to the active file
 * (a document's `addEntry`); the panel adds nothing itself.
 *
 * `classes` and `sections` are the Add gallery's, forwarded: a dictionary's every tile by
 * default, a MAT-file's or a model's classes where they are given. While `disabled`, a note says
 * why (`note`: what to open, by default), and the tiles are shown but take no press and no focus.
 *
 * @tagname dex-gallery-panel
 */
export class DexGalleryPanel extends LitElement {
  static override styles = [hiddenStyles, css`
    /* A column as tall as the view it is in: the heading stays put and the tiles scroll under it. */
    :host {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-height: 0;
      font-family: var(--dex-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
      font-size: 12px;
      color: var(--dex-color-text, #333);
    }

    .header {
      flex-shrink: 0;
      padding: 8px 8px 0;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .note {
      flex-shrink: 0;
      padding: 4px 8px 0;
      font-size: 11px;
      color: var(--dex-color-text-muted, #666);
    }

    /* The gallery is a popover where the table draws it, and these undo the popover: the width the
       panel has rather than the editor's (the custom property the gallery's width reads, as the
       table sets it), the whole height of the view rather than a share of the window, and no
       frame, shadow or glass of its own over a sidebar that is not behind it. Rules on the element
       here win over the gallery's own :host rules, which is what a host's styles are for. */
    dex-add-gallery {
      --dex-add-gallery-width: 100%;
      flex: 1 1 auto;
      min-height: 0;
      max-height: none;
      border: none;
      border-radius: 0;
      box-shadow: none;
      background: none;
      backdrop-filter: none;
      -webkit-backdrop-filter: none;
    }

    /* Shown, so the user sees what opening a file will offer, and faded, so they see it is not
       on offer now. inert takes the presses and the focus. */
    dex-add-gallery[inert] {
      opacity: 0.5;
    }
  `];

  /**
   * The classes a MAT-file or a model's workspace can take a new variable of (a TableView's
   * `add.classes`), or null for a dictionary's every tile. The Add gallery's `classes`, forwarded.
   * Default null. Property only.
   */
  @property({ attribute: false }) classes: readonly string[] | null = null;

  /**
   * With `classes`, the sections beside the file's variables whose every tile is offered too (a
   * TableView's `addSections`: a model's `config`). The Add gallery's `sections`, forwarded.
   * Default null: none. Property only.
   */
  @property({ attribute: false }) sections: readonly string[] | null = null;

  /**
   * The name of the file an add lands in, the active one: the heading reads "Add to" it. Default
   * empty, and the heading reads "Add". Attribute `target`.
   */
  @property({ type: String }) target = '';

  /**
   * Whether the active file takes no new entry (none is open, or it is a project): a note says to
   * open a dictionary, a MAT-file or a model, and the tiles are shown faded and send nothing.
   * Default false. Attribute `disabled`.
   */
  @property({ type: Boolean }) disabled = false;

  /**
   * What the note says while `disabled`: why no entry can be added, as the app knows it ("plant.mdl
   * takes no edits."). Default 'Open a dictionary, a MAT-file or a model to add entries.'.
   * Attribute `note`.
   */
  @property({ type: String }) note = 'Open a dictionary, a MAT-file or a model to add entries.';

  // The gallery's request, under the panel's own name: an app listens for one event of one panel,
  // and hears each add once. Stopped whether or not it is passed on, so a disabled panel lets
  // nothing out at all (inert keeps a click off a tile in a browser; this keeps it off where a
  // tile is clicked from a script).
  private _onTile(e: CustomEvent<AddTileDetail>): void {
    e.stopPropagation();
    if (this.disabled) return;
    const { className, section, label } = e.detail;
    this.dispatchEvent(new CustomEvent<GalleryAddDetail>('dex-gallery-add', {
      detail: { className, section, label },
      bubbles: true,
      composed: true,
    }));
  }

  override render() {
    // The gallery is drawn whether or not the panel is disabled, and so is the same element across
    // the change: a gallery drawn anew runs its first draw again, and the panel would then depend
    // on `inline` alone to keep the focus where the user is.
    return html`
      <div class="header" title=${this.target || nothing}>${this.target ? `Add to ${this.target}` : 'Add'}</div>
      ${this.disabled ? html`<div class="note">${this.note}</div>` : nothing}
      <dex-add-gallery
        inline
        .classes=${this.classes}
        .sections=${this.sections}
        ?inert=${this.disabled}
        @dex-add-tile=${this._onTile}
      ></dex-add-gallery>
    `;
  }
}

/**
 * Registers the widget as `<dex-gallery-panel>`, or under `tag`, after the `<dex-add-gallery>` it
 * draws (and the `<dex-icon>` the gallery's tiles draw).
 */
export function defineGalleryPanel(tag = 'dex-gallery-panel'): void {
  defineAddGallery();
  defineElement(tag, DexGalleryPanel);
}

/**
 * The events `<dex-gallery-panel>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface GalleryPanelEventMap {
  /**
   * A tile was clicked: add one entry of its class, in its section, to the active file. Not sent
   * while the panel is disabled. The Add gallery's own `dex-add-tile` does not leave the panel.
   * A request.
   */
  'dex-gallery-add': CustomEvent<GalleryAddDetail>;
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-gallery-panel': DexGalleryPanel;
  }
  interface HTMLElementEventMap extends GalleryPanelEventMap {}
  interface DocumentEventMap extends GalleryPanelEventMap {}
  interface WindowEventMap extends GalleryPanelEventMap {}
}
