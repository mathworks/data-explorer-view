import { LitElement } from 'lit';
export declare class DexIcon extends LitElement {
    static styles: import("lit").CSSResult;
    iconId: string;
    size: number;
    private _base;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-icon>`, or under `tag`. */
export declare function defineIcon(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-icon': DexIcon;
    }
}
