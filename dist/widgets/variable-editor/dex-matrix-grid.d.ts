import { LitElement, nothing } from 'lit';
import type { MatrixPayload } from '../../model/matrix/matrixPayload.js';
/**
 * A matrix's cells as a read-only grid, one page at a time, headed by MATLAB's 1-based row and
 * column numbers, with a page selector over the dimensions past the second. Only the cells near
 * the scroll position are built, so a 1000x1000 page scrolls as a small one does. The arrow
 * keys, Home and End move between cells and PageUp and PageDown between pages; a cell whose text
 * is clipped shows it whole as its tooltip. Escape is left to the panel around it.
 * `<dex-variable-editor>` draws it.
 *
 * @tagname dex-matrix-grid
 */
export declare class DexMatrixGrid extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The matrix shown, cells included; null, the default, draws nothing. Property only. */
    matrix: MatrixPayload | null;
    private _page;
    private _r;
    private _c;
    private _scrollTop;
    private _scrollLeft;
    private _viewH;
    private _viewW;
    private _cellBox;
    private _refocus;
    private _pendingScroll;
    private _lastWindowStart;
    private _resizeObserver;
    private get _dims();
    private get _rows();
    private get _cols();
    /** How many pages the matrix has: the product of its dimensions past the second, 1 for 2-D. */
    get pageCount(): number;
    /** The page shown, from 0; set, it is clamped to the pages there are. */
    get page(): number;
    set page(next: number);
    /** A page's subscript as MATLAB writes it, `(:,:,2)` or `(:,:,1,3)`; '' for a 2-D matrix. */
    pageLabel(page: number): string;
    /** The text of cell (`r`, `c`), from 0, of a page (the one shown by default); '' outside the matrix. */
    cellText(r: number, c: number, page?: number): string;
    /** Focuses the cell the keyboard is on, (1,1) until it has moved. */
    focusActiveCell(): void;
    private _cssPx;
    private get _rowH();
    private get _colW();
    private get _headerW();
    private get _scroll();
    private _rowWindow;
    private _colWindow;
    private _onScroll;
    private _revealActive;
    private _measure;
    willUpdate(changed: Map<string, unknown>): void;
    updated(): void;
    private _measureQueued;
    private _measureAfterUpdate;
    disconnectedCallback(): void;
    private _scan;
    private get _scanned();
    private _cellLabel;
    private _move;
    private _onKeydown;
    private _renderPager;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the widget as `<dex-matrix-grid>`, or under `tag`. */
export declare function defineMatrixGrid(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-matrix-grid': DexMatrixGrid;
    }
}
