import { LitElement, nothing } from 'lit';
import type { MatrixDescriptor, MatrixPayload } from './dex-matrix-grid.js';
export interface MatrixCellsAnswer {
    nodeId: string;
    matrix?: MatrixPayload;
    message?: string;
}
export declare class DexVariableEditor extends LitElement {
    static styles: import("lit").CSSResult;
    private _open;
    private _descriptor;
    private _payload;
    private _message;
    private _anchor;
    private _dismissHandler;
    private _keyHandler;
    private _scrollHandler;
    private get _title();
    private get _grid();
    /**
     * Open on what the row knew: name, class, shape, node id. The cells are not here
     * yet — matrixOpen.ts posts a `requestMatrix` for `matrix.nodeId` and hands the
     * answer to deliver(). Until then the panel shows its title and a waiting line.
     */
    show(anchorEl: HTMLElement, matrix: MatrixDescriptor): void;
    /**
     * The host answered a `requestMatrix`. Fills the panel in, or says why it cannot
     * be filled in. Ignores an answer that is not about what is currently on screen:
     * open A, change your mind, open B, and A's reply can still be in flight — taking
     * it would put A's numbers under B's title, which is worse than a slow panel.
     */
    deliver(answer: MatrixCellsAnswer | null | undefined): Promise<void>;
    close(): void;
    reposition(): void;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the widget as `<dex-variable-editor>`, or under `tag`, after the grid it shows. */
export declare function defineVariableEditor(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-variable-editor': DexVariableEditor;
    }
}
