import { LitElement } from 'lit';
/**
 * A modal dialog that says why something the user did was refused: a title, the reason, the
 * value entered beside the one kept, and a detail line. show() opens it; OK, Escape or a click
 * outside it closes it (as close() does), and focus goes back where it was. With show()'s
 * `showRevert`, a Revert button sends `dex-revert` first. Tab stays inside the dialog while it is
 * open.
 *
 * @tagname dex-error-dialog
 */
export declare class DexErrorDialog extends LitElement {
    static styles: import("lit").CSSResult[];
    private _title;
    private _reason;
    private _detail;
    private _invalidValue;
    private _validValue;
    private _showRevert;
    private _open;
    private _returnFocusTo;
    /**
     * Opens the dialog, focused on OK (never on Revert, which discards the user's edit).
     *
     * `title` defaults to 'Invalid Value' and `reason` to 'The entered value is not valid.';
     * `invalidValue` and `validValue` are shown as Entered and Previous, `detail` under them, and
     * `showRevert` adds the Revert button. Focus returns to `returnFocusTo` when it closes, or to
     * the element that had it when this was called.
     */
    show(opts: {
        title?: string;
        reason?: string;
        detail?: string;
        invalidValue?: string;
        validValue?: string;
        showRevert?: boolean;
        returnFocusTo?: HTMLElement;
    }): void;
    /** Closes the dialog and gives focus back, sending nothing. */
    close(): void;
    private _findActiveElement;
    private _onDismiss;
    private _onRevert;
    private _onKeyDown;
    private _trapTab;
    connectedCallback(): void;
    private _onBackdropClick;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-error-dialog>`, or under `tag`. */
export declare function defineErrorDialog(tag?: string): void;
/**
 * The events `<dex-error-dialog>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface ErrorDialogEventMap {
    /** Revert was pressed: put back the value kept. The dialog closes. No detail. */
    'dex-revert': CustomEvent<null>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-error-dialog': DexErrorDialog;
    }
    interface HTMLElementEventMap extends ErrorDialogEventMap {
    }
    interface DocumentEventMap extends ErrorDialogEventMap {
    }
    interface WindowEventMap extends ErrorDialogEventMap {
    }
}
