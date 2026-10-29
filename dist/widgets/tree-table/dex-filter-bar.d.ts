import { LitElement } from 'lit';
import { type FilterToken } from '../../model/filter/rowFilter.js';
export declare class DexFilterBar extends LitElement {
    static styles: import("lit").CSSResult;
    /** The applied filter text. The bar never mutates it; it proposes replacements. */
    text: string;
    /** Its parse, from the table's one `parseFilterExpression` call. */
    tokens: FilterToken[];
    placeholder: string;
    /** The uncommitted tail. The one piece of state that is the bar's alone. */
    private _tail;
    private _input?;
    /** Focus (and select) the tail — the Ctrl+F entry point, forwarded by the table. */
    focusInput(): void;
    private _propose;
    private _commitTail;
    private _clearAll;
    private _removeAt;
    private _onKeyDown;
    private _renderChip;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-filter-bar>`, or under `tag`. */
export declare function defineFilterBar(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-filter-bar': DexFilterBar;
    }
}
