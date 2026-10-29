// Copyright 2026 The MathWorks, Inc.
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
import { LitElement, html, css } from 'lit';
import { property } from 'lit/decorators.js';
import { defineElement } from './define.js';
const ALIASES = {
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
function resolveId(iconId) {
    return ALIASES[iconId] || iconId;
}
// The package's own icons/ folder, relative to this module: dist/widgets/shared/dex-icon.js
// (and src/widgets/shared/dex-icon.ts, which the tests load) is three folders below the package
// root. Held in a constant rather than written into the `new URL(…)` call: a bundler takes
// `new URL('<literal>', import.meta.url)` for an asset to resolve at build time, and a folder is
// not one — written as a literal, it made Vite warn in every app that bundles the widgets.
const PACKAGE_ICONS = '../../../icons/';
/** Where the icons are when nobody said: see setIconBase. */
function packageIcons() {
    try {
        return new URL(PACKAGE_ICONS, import.meta.url).href;
    }
    catch {
        // No usable module URL: a bundle in a format without import.meta, where it is undefined,
        // or a module whose URL has no folders to climb (data:, blob:). The icons beside the page
        // is the one guess left; an app in that position calls setIconBase.
        return 'icons/';
    }
}
let iconBase = packageIcons();
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
export function setIconBase(url) {
    // The folder's URL with or without its trailing slash: without one, `<id>.svg` would be
    // glued onto the folder's own name.
    iconBase = url === '' || url.endsWith('/') ? url : `${url}/`;
}
export class DexIcon extends LitElement {
    constructor() {
        super(...arguments);
        this.iconId = '';
        this.size = 16;
    }
    static { this.styles = css `
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
  `; }
    render() {
        if (!this.iconId) {
            return html ``;
        }
        const resolved = resolveId(this.iconId);
        return html `
      <img
        src="${iconBase}${resolved}.svg"
        width="${this.size}"
        height="${this.size}"
        alt=""
        aria-hidden="true"
      />
    `;
    }
}
__decorate([
    property({ type: String })
], DexIcon.prototype, "iconId", void 0);
__decorate([
    property({ type: Number })
], DexIcon.prototype, "size", void 0);
/** Registers the widget as `<dex-icon>`, or under `tag`. */
export function defineIcon(tag = 'dex-icon') {
    defineElement(tag, DexIcon);
}
