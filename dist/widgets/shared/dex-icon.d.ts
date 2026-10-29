import { LitElement } from 'lit';
export declare class DexIcon extends LitElement {
    static styles: import("lit").CSSResult;
    iconId: string;
    size: number;
    private _base;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-icon': DexIcon;
    }
}
