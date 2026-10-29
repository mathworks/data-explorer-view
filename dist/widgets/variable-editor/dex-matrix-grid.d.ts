import { LitElement, nothing } from 'lit';
export interface MatrixDescriptor {
    name: string;
    className: string;
    dims: number[];
    nodeId: string;
}
export interface MatrixPayload extends MatrixDescriptor {
    cells: string[];
}
export declare class DexMatrixGrid extends LitElement {
    static styles: import("lit").CSSResult[];
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
    get pageCount(): number;
    get page(): number;
    set page(next: number);
    pageLabel(page: number): string;
    cellText(r: number, c: number, page?: number): string;
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
