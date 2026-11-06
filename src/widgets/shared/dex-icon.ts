// Copyright 2026 The MathWorks, Inc.

import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from './define.js';
import { hiddenStyles } from './hidden.styles.js';

const ALIASES: Record<string, string> = {
  struct: 'typeStruct',
  cell: 'wsBrackets',
  string: 'wsString',
  parameter: 'wsParameters',
  bus: 'typeBus',
  enum: 'typeEnum',
  signal: 'typeSignal',
  alias: 'typeAlias',
  numeric: 'typeNumeric',
  structElement: 'typeStructElement',
  signalObject: 'typeSignal',
  connectionBus: 'typeBus',
  numericType: 'typeNumeric',
  aliasType: 'typeAlias',
  valueType: 'typeStruct',
  variant: 'wsVariant',
  configSet: 'settings',
  matlabVariable: 'wsParameters',
  matlabStruct: 'typeStruct',
};

// Own keys only: a bare `ALIASES[iconId]` answers `constructor`, `toString` or `__proto__` with
// Object.prototype's member, which became the file name.
function resolveId(iconId: string): string {
  return Object.hasOwn(ALIASES, iconId) ? ALIASES[iconId] : iconId;
}

// The package's own icons/ folder, relative to this module: dist/widgets/shared/dex-icon.js
// (and src/widgets/shared/dex-icon.ts, which the tests load) is three folders below the package
// root. Held in a constant rather than written into the `new URL(…)` call: a bundler takes
// `new URL('<literal>', import.meta.url)` for an asset to resolve at build time, and a folder is
// not one — written as a literal, it made Vite warn in every app that bundles the widgets.
const PACKAGE_ICONS = '../../../icons/';

/** Where the icons are when nobody said: see setIconBase. */
function packageIcons(): string {
  try {
    return new URL(PACKAGE_ICONS, import.meta.url).href;
  } catch {
    // No usable module URL: a bundle in a format without import.meta, where it is undefined,
    // or a module whose URL has no folders to climb (data:, blob:). The icons beside the page
    // is the one guess left; an app in that position calls setIconBase.
    return 'icons/';
  }
}

let iconBase = packageIcons();

// Each icon's own URL, by id, once an app has taken them from data-explorer-view/icon-assets
// (useIconAssets); null until then, and after a setIconBase, when every icon is `<base><id>.svg`.
let iconUrls: Readonly<Record<string, string>> | null = null;

/**
 * Tells every `<dex-icon>` where the icon files are: the URL of a folder holding the files of
 * this package's `icons/` (`data-explorer-view/icons/*`), to which `<id>.svg` is appended. A
 * relative URL resolves as any `<img src>` does, against the page's base URL.
 *
 * The default is the package's own folder, found from this module's URL. That holds wherever
 * the package's files are served as they are installed — a static server, an import map, a
 * dev server that does not bundle dependencies. A bundler moves this module into a chunk of its
 * own, from which that path leads nowhere: an app that bundles copies the icons to where it
 * serves its assets and calls this with that folder, before the first icon renders, since
 * nothing redraws the icons already on the page.
 */
export function setIconBase(url: string): void {
  // The folder's URL with or without its trailing slash: without one, `<id>.svg` would be
  // glued onto the folder's own name.
  iconBase = url === '' || url.endsWith('/') ? url : `${url}/`;
  iconUrls = null;
}

/**
 * Tells every `<dex-icon>` drawn after it the URL of each icon by its id, in place of a folder; an
 * id the table does not name is still `<base><id>.svg`. What useIconAssets calls with the URLs a
 * bundler made; a later setIconBase goes back to the folder. Not on the `./icon` entry.
 */
export function setIconUrls(urls: Readonly<Record<string, string>> | null): void {
  iconUrls = urls;
}

/** The URL `<dex-icon>` loads for an icon id that has been through the alias table. */
function iconUrl(id: string): string {
  return (iconUrls && Object.hasOwn(iconUrls, id) ? iconUrls[id] : undefined) ?? `${iconBase}${id}.svg`;
}

// The mono glyph's alpha, from the luma of each pixel of the icon (Rec. 709's weights, those of
// SVG's luminanceToAlpha, on the colour as written: the filter's colour-interpolation is sRGB):
// 3.75 - 5 * luma, which a filter clamps to 0..1. Every pixel at luma 0.55 or darker is whole ink,
// every one at 0.75 or lighter none, the rest between. The icons are drawn in two bands that this
// splits: their strokes and glyphs in mid greys and deep colours (#616161 to #888888, green
// #008013, blue #1656A7, red #902622, at most 0.55), their tiles and fills in white, light grey and
// pastels (#D9D9D9 and lighter, at least 0.84); Delete's red tile (0.70) is the one between, a
// faint fill. The colour rows are zero: the flood colours it.
const INK_MATRIX = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -1.0625 -3.577 -0.3605 0 3.75';

/**
 * One icon of the package's `icons/` folder, drawn as an `<img>` of `<base><id>.svg` (see
 * setIconBase), or of the URL useIconAssets gave it. A data-model kind (`struct`, `bus`, …) is
 * drawn as the icon that stands for it. With `mono` it is drawn in one colour, the element's own
 * (`color`), as a glyph of a toolbar is. Decorative: hidden from assistive technology, so the
 * element beside it carries the name.
 *
 * @tagname dex-icon
 */
export class DexIcon extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }

    img,
    svg {
      display: block;
    }

    img {
      /* The icons are drawn for a light background (white tiles, grey and blue strokes), and an
         <img> cannot restyle the SVG inside it. A dark theme sets this token to turn them over:
         theme.css inverts their lightness and rotates the hue back, so a blue stroke stays blue. */
      filter: var(--dex-icon-filter, none);
    }
  `];

  /**
   * The icon's id: the name of its file in `icons/` without `.svg` (`typeBus`), or a data-model
   * kind (`bus`). Empty, the default, draws nothing. Attribute `icon-id`.
   */
  @property({ type: String, attribute: 'icon-id' }) iconId = '';
  /** Its width and height in CSS pixels. Default 16. Attribute `size`. */
  @property({ type: Number }) size = 16;
  /**
   * Draws the icon in one colour, the element's `color` (currentColor), as a toolbar's or an
   * activity bar's glyph: its strokes and dark shapes in that colour, its light fills left out, so
   * the button's own background shows through them. The dark set's `--dex-icon-filter` is not
   * applied: the colour is the theme's already. Off, the default, draws the icon in the colours
   * its file has. Attribute `mono`.
   */
  @property({ type: Boolean }) mono = false;

  override render() {
    if (!this.iconId) {
      return html``;
    }
    const resolved = resolveId(this.iconId);
    // The file as an SVG <image>, through a filter (INK_MATRIX) that turns its dark pixels into
    // the alpha of a flood of currentColor. An <image> is fetched as an <img> is, under the page's
    // img-src and from file:// too; a CSS mask, the other way to paint an image in currentColor,
    // is fetched in CORS mode, which a page on file:// (an Electron app's) is refused, and an alpha
    // mask fills every white tile of an icon solid. The filter's id is this shadow root's own, which
    // is where `url(#ink)` is looked up, so every icon on the page may use the same one.
    if (this.mono) {
      return html`
        <svg width="${this.size}" height="${this.size}" aria-hidden="true" focusable="false">
          <filter id="ink" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB">
            <feColorMatrix in="SourceGraphic" type="matrix" values="${INK_MATRIX}" result="dark"></feColorMatrix>
            <feComposite in="dark" in2="SourceAlpha" operator="in" result="shape"></feComposite>
            <feFlood flood-color="currentColor"></feFlood>
            <feComposite in2="shape" operator="in"></feComposite>
          </filter>
          <image href="${iconUrl(resolved)}" width="${this.size}" height="${this.size}" filter="url(#ink)"></image>
        </svg>
      `;
    }
    return html`
      <img
        src="${iconUrl(resolved)}"
        width="${this.size}"
        height="${this.size}"
        alt=""
        aria-hidden="true"
      />
    `;
  }
}

/** Registers the widget as `<dex-icon>`, or under `tag`. */
export function defineIcon(tag = 'dex-icon'): void {
  defineElement(tag, DexIcon);
}

declare global {
  interface HTMLElementTagNameMap {
    'dex-icon': DexIcon;
  }
}
