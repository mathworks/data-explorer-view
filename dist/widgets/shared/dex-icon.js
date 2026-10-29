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
export class DexIcon extends LitElement {
    constructor() {
        super(...arguments);
        this.iconId = '';
        this.size = 16;
        this._base = import.meta.env.BASE_URL || '/';
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
    }
  `; }
    render() {
        if (!this.iconId) {
            return html ``;
        }
        const resolved = resolveId(this.iconId);
        return html `
      <img
        src="${this._base}icons/${resolved}.svg"
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
