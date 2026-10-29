import { LitElement, nothing } from 'lit';
import type { MatrixDescriptor, MatrixPayload } from '../../model/matrix/matrixPayload.js';
/**
 * What deliver() takes: the cells of the matrix whose node is `nodeId`, or the reason there are
 * none. Exactly one of `matrix` and `message` is set. The model's matrixCellsMessage builds it,
 * though its type still says `matrix` may be null, which it never is: hand it over as
 * `{ ...answer, matrix: answer.matrix ?? undefined }`.
 */
export interface MatrixCellsAnswer {
    nodeId: string;
    matrix?: MatrixPayload;
    message?: string;
}
/**
 * The variable editor: a panel, anchored under the glyph that opened it, that shows a matrix's
 * cells in a `<dex-matrix-grid>`. An app makes one and appends it to the page; show() opens it
 * on a matrix's descriptor, with its title and a waiting line, and deliver() fills it in with
 * the cells once the app has them. Escape, the close button, a click outside it or a scroll
 * close it, and focus goes back to the glyph if the panel held it. It sends no events.
 *
 * @tagname dex-variable-editor
 */
export declare class DexVariableEditor extends LitElement {
    static styles: import("lit").CSSResult[];
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
     * Opens the panel under `anchorEl` (the glyph, which gets focus back) on what the row knew:
     * name, class, shape, node id. The cells are not here yet — the app fetches them for
     * `matrix.nodeId` (vscode's matrixOpen.ts posts a `requestMatrix`) and hands the answer to
     * deliver(). Until then the panel shows its title and a waiting line.
     */
    show(anchorEl: HTMLElement, matrix: MatrixDescriptor): void;
    /**
     * The host answered a `requestMatrix`. Fills the panel in, or says why it cannot
     * be filled in. Ignores an answer that is not about what is currently on screen:
     * open A, change your mind, open B, and A's reply can still be in flight — taking
     * it would put A's numbers under B's title, which is worse than a slow panel.
     */
    deliver(answer: MatrixCellsAnswer | null | undefined): Promise<void>;
    /** Closes the panel; focus goes back to the glyph that opened it, if the panel held it. */
    close(): void;
    /**
     * Places the panel again under its glyph, left edges aligned, pulled in at the viewport's
     * edges and flipped above the glyph when there is no room below. show() and deliver() call it.
     */
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
