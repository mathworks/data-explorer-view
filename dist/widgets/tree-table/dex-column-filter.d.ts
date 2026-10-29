import { LitElement } from 'lit';
import { type FilterOp } from '../../model/filter/rowFilter.js';
export declare const OP_GLYPHS: ReadonlyArray<readonly [FilterOp, string, string]>;
/** What `dex-column-filter-applied` carries: the condition, and the filter text it writes. */
export interface ColumnFilterAppliedDetail {
    column: string;
    op: FilterOp;
    value: string;
    text: string;
}
/** What `dex-column-filter-cleared` carries: the column whose condition goes. */
export interface ColumnFilterClearedDetail {
    column: string;
}
/**
 * The popup a right-click on a column header opens: one condition on that column (an operator
 * and a value), and the filter text it will write. It filters nothing: Apply sends the condition
 * in `dex-column-filter-applied`, Clear (when the table has one for the column) sends
 * `dex-column-filter-cleared`, and Escape `dex-column-filter-closed`; the table writes the
 * condition into its search. The value box takes focus when it opens. `<dex-tree-table>` draws it.
 *
 * @tagname dex-column-filter
 */
export declare class DexColumnFilter extends LitElement {
    static styles: import("lit").CSSResult[];
    /** Column key the condition is about (`DataType`). Default ''. Attribute `column`. */
    column: string;
    /** Header label; also the prefix the written text uses. Default ''. Attribute `column-label`. */
    columnLabel: string;
    /**
     * The operator: `contains`, `=`, `!=`, `>`, `<`, `>=` or `<=`. Default `contains`. Attribute
     * `op`.
     */
    op: FilterOp;
    /** The value compared with. Default ''. Attribute `value`. */
    value: string;
    /**
     * True when the table already has a condition for this column, which offers Clear. Default
     * false. Attribute `has-existing`.
     */
    hasExisting: boolean;
    private _valueInput?;
    /** Focuses the value box; the caller opens the popup for typing, not for reading. */
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
/**
 * The events `<dex-column-filter>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface ColumnFilterEventMap {
    /** Apply, or Enter: put this condition in the filter, in place of the column's own if it has one. */
    'dex-column-filter-applied': CustomEvent<ColumnFilterAppliedDetail>;
    /** Clear: take the column's condition out of the filter. */
    'dex-column-filter-cleared': CustomEvent<ColumnFilterClearedDetail>;
    /** Escape: close the popup and change nothing. No detail. */
    'dex-column-filter-closed': CustomEvent<null>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-column-filter': DexColumnFilter;
    }
    interface HTMLElementEventMap extends ColumnFilterEventMap {
    }
    interface DocumentEventMap extends ColumnFilterEventMap {
    }
    interface WindowEventMap extends ColumnFilterEventMap {
    }
}
