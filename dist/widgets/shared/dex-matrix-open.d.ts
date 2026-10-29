import { LitElement, nothing } from 'lit';
import type { MatrixDescriptor } from '../../model/matrix/matrixPayload.js';
/** What `dex-matrix-open` carries. */
export interface MatrixOpenDetail {
    matrix: MatrixDescriptor;
    anchorEl: HTMLElement;
    rowId?: string;
}
/**
 * The glyph after a matrix value that opens it in the variable editor: a button, by click,
 * Enter or Space. It opens nothing itself; it sends `dex-matrix-open`, and the app shows the
 * editor (`<dex-variable-editor>`'s show) and fetches the cells. Draws nothing while `matrix` is
 * null. The table's Value cells and the inspector's Value rows draw it.
 *
 * @tagname dex-matrix-open
 */
export declare class DexMatrixOpen extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The matrix it opens: its name, class, shape and node id, and no cells. Null, the default,
     * draws nothing. Property only.
     */
    matrix: MatrixDescriptor | null;
    /** The row it sits in, sent on with the event; unset in the inspector. Attribute `row-id`. */
    rowId?: string;
    /** Focuses the glyph's button, where the variable editor returns focus when it closes. */
    focus(options?: FocusOptions): void;
    private _open;
    private _onKeydown;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the widget as `<dex-matrix-open>`, or under `tag`, after the icon it draws. */
export declare function defineMatrixOpen(tag?: string): void;
/**
 * The events `<dex-matrix-open>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface MatrixOpenEventMap {
    /** The glyph was clicked, or Enter or Space pressed on it: open this matrix. */
    'dex-matrix-open': CustomEvent<MatrixOpenDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-matrix-open': DexMatrixOpen;
    }
    interface HTMLElementEventMap extends MatrixOpenEventMap {
    }
    interface DocumentEventMap extends MatrixOpenEventMap {
    }
    interface WindowEventMap extends MatrixOpenEventMap {
    }
}
