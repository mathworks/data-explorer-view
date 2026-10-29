import { LitElement } from 'lit';
import '../shared/dex-matrix-open.js';
import type { MatrixDescriptor } from '../variable-editor/dex-matrix-grid.js';
export interface PropertyGroup {
    title: string;
    properties: PropertyRow[];
}
export interface PropertyRow {
    name: string;
    value: string;
    editable?: boolean;
    type?: 'text' | 'link';
    linkTarget?: string;
    valueLink?: string;
    matrix?: MatrixDescriptor;
}
export declare class DexPropertyInspector extends LitElement {
    static styles: import("lit").CSSResult;
    groups: PropertyGroup[];
    private _onPropertyChange;
    private _onLinkClick;
    private _renderPropertyValue;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-property-inspector': DexPropertyInspector;
    }
}
