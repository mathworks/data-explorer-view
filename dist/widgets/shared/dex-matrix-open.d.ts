import { LitElement, nothing } from 'lit';
import './dex-icon.js';
import type { MatrixDescriptor } from '../variable-editor/dex-matrix-grid.js';
export interface MatrixOpenDetail {
    matrix: MatrixDescriptor;
    anchorEl: HTMLElement;
    rowId?: string;
}
export declare class DexMatrixOpen extends LitElement {
    static styles: import("lit").CSSResult;
    matrix: MatrixDescriptor | null;
    rowId?: string;
    focus(options?: FocusOptions): void;
    private _open;
    private _onKeydown;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-matrix-open': DexMatrixOpen;
    }
}
