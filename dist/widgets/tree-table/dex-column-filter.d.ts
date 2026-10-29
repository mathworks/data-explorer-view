import { LitElement } from 'lit';
import { type FilterOp } from '../../model/filter/rowFilter.js';
export declare const OP_GLYPHS: ReadonlyArray<readonly [FilterOp, string, string]>;
export declare class DexColumnFilter extends LitElement {
    static styles: import("lit").CSSResult[];
    /** Column key the condition is about. */
    column: string;
    /** Header label; also the prefix the written text uses. */
    columnLabel: string;
    op: FilterOp;
    value: string;
    /** True when the table already has a condition for this column. */
    hasExisting: boolean;
    private _valueInput?;
    /** Focus the value box; the caller opens the popup for typing, not for reading. */
    focusValue(): void;
    firstUpdated(): void;
    private get _text();
    private _apply;
    private _close;
    private _clear;
    private _onKeyDown;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-column-filter>`, or under `tag`. */
export declare function defineColumnFilter(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-column-filter': DexColumnFilter;
    }
}
