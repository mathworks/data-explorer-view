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

function resolveId(iconId: string): string {
  return ALIASES[iconId] || iconId;
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

export class DexIcon extends LitElement {
  static override styles = [hiddenStyles, css`
    :host {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
    }

    img {
      display: block;
      /* The icons are drawn for a light background (white tiles, grey and blue strokes), and an
         <img> cannot restyle the SVG inside it. A dark theme sets this token to turn them over:
         theme.css inverts their lightness and rotates the hue back, so a blue stroke stays blue. */
      filter: var(--dex-icon-filter, none);
    }
  `];

  @property({ type: String }) iconId = '';
  @property({ type: Number }) size = 16;

  override render() {
    if (!this.iconId) {
      return html``;
    }
    const resolved = resolveId(this.iconId);
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
