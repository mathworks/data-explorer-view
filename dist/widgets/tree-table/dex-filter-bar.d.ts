import { LitElement } from 'lit';
import { type FilterToken } from '../../model/filter/rowFilter.js';
/** What `dex-filter-applied` carries: the whole filter text proposed in place of `text`. */
export interface FilterAppliedDetail {
    text: string;
}
/**
 * The tree table's search bar: the applied filter as one chip per condition, and an input for
 * what the user is still typing. It filters nothing and keeps no filter: each gesture — Enter on
 * the input, a chip's ×, the clear button, a second Escape — proposes a replacement for the whole
 * text in `dex-filter-applied`, and the table applies it and sets `text` and `tokens` back.
 * `<dex-tree-table>` draws it.
 *
 * @tagname dex-filter-bar
 */
export declare class DexFilterBar extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The applied filter text. The bar never mutates it; it proposes replacements. Default ''.
     * Attribute `text`.
     */
    text: string;
    /**
     * Its parse, from the table's one `parseFilterExpression` call: one chip each. Default none.
     * Property only.
     */
    tokens: FilterToken[];
    /** The input's placeholder. Default 'Search'. Attribute `placeholder`. */
    placeholder: string;
    /** The uncommitted tail. The one piece of state that is the bar's alone. */
    private _tail;
    private _input?;
    /** Focuses (and selects) the input — the Ctrl+F entry point, forwarded by the table's focusFilter. */
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
    interface HTMLElementEventMap {
        /**
         * The user asked for this filter text: Enter on what they typed (added after the applied
         * text), a chip removed, or the whole filter cleared. The table handles it and lets it on.
         */
        'dex-filter-applied': CustomEvent<FilterAppliedDetail>;
    }
}
