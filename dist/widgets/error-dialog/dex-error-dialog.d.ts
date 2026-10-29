import { LitElement } from 'lit';
export declare class DexErrorDialog extends LitElement {
    static styles: import("lit").CSSResult;
    dialogTitle: string;
    message: string;
    detail: string;
    invalidValue: string;
    validValue: string;
    showRevert: boolean;
    private _open;
    private _returnFocusTo;
    show(opts: {
        title?: string;
        reason?: string;
        detail?: string;
        invalidValue?: string;
        validValue?: string;
        showRevert?: boolean;
        returnFocusTo?: HTMLElement;
    }): void;
    hide(): void;
    private _findActiveElement;
    private _onDismiss;
    private _onRevert;
    private _onKeyDown;
    private _trapTab;
    connectedCallback(): void;
    private _onBackdropClick;
    render(): import("lit-html").TemplateResult<1>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-error-dialog': DexErrorDialog;
    }
}
