import { LitElement, nothing } from 'lit';
/** One answer the dialog offers. */
export interface ConfirmButton {
    /** What show() resolves to when this button is pressed. */
    id: string;
    /** The button's text. */
    label: string;
    /**
     * 'primary' is the answer most people want, filled with the accent colour and focused when the
     * dialog opens; 'danger' throws work away (Don't Save, Reload), drawn in the error colour and
     * never focused on open; 'normal', the default, is neither.
     */
    kind?: 'primary' | 'danger' | 'normal';
}
/** What show() asks. */
export interface ConfirmOptions {
    /** The dialog's title, which is also its accessible name. */
    title: string;
    /** The question. */
    message: string;
    /** A line under the question, in a quieter colour: what each answer means. */
    detail?: string;
    /** The answers, left to right, as given. */
    buttons: ConfirmButton[];
    /**
     * What show() resolves to when the dialog is closed without a button: Escape, a click on the
     * backdrop, close(), a second show(), or the element leaving the page.
     */
    cancelId: string;
}
/** What prompt() asks: a question with one line of text to type. */
export interface PromptOptions {
    /** The dialog's title, which is also its accessible name. */
    title: string;
    /** What to type, said above the field. */
    message: string;
    /** The field's label, drawn before it and read as its name. */
    label: string;
    /** What the field holds as the dialog opens, selected. Default ''. */
    value?: string;
    /** The field's placeholder. */
    placeholder?: string;
    /** 'url' gives a phone its address keyboard and turns off spelling and autofill. Default 'text'. */
    type?: 'text' | 'url';
    /** The button that answers with the text (the primary one), disabled while the field is blank. */
    okLabel: string;
    /** Default 'Cancel'. */
    cancelLabel?: string;
}
/**
 * A question with buttons, asked in the page for a host that has no dialogs of its own (a
 * browser page): "Save changes to x before closing?", "x changed on disk". show() opens it and
 * resolves to the id of the button pressed; Escape, a click outside it and close() resolve to the
 * question's `cancelId`, and focus goes back where it was. It opens focused on the primary
 * button, never on a danger one, and Tab stays among its buttons while it is open. prompt() asks
 * for a line of text in the same dialog ("Open from URL"), a host having no prompt of its own
 * either: it resolves to the text typed, or null, opens focused on the field and keeps Tab among
 * the field and its buttons. One question is open at a time, of either kind. It sends no events:
 * the promise is the answer.
 *
 * It paints at z-index 10000, as `<dex-error-dialog>` does, so where both are open the one later
 * in the document is on top: append it last in the body, outside any element that makes a
 * stacking context of its own.
 *
 * @tagname dex-confirm-dialog
 */
export declare class DexConfirmDialog extends LitElement {
    static styles: import("lit").CSSResult[];
    private _question;
    private _open;
    private _text;
    private _answer;
    private _returnFocusTo;
    private _pressedOnBackdrop;
    /**
     * Opens the dialog with `options` and resolves to the id of the button pressed, or to
     * `options.cancelId` on Escape, a click on the backdrop, close(), or the element leaving the
     * page. A second show() while one is open answers the first with the first's `cancelId` and
     * asks the second in its place. Focus opens on the first primary button, or with none on the
     * first that is not a danger one, and returns, when the dialog closes, to the element that had
     * it when the first of these questions was asked. On an element that is not on the page it
     * resolves to `cancelId` at once.
     */
    show(options: ConfirmOptions): Promise<string>;
    /**
     * Opens the dialog with a text field and resolves to the text typed, trimmed, when the primary
     * button is pressed or Enter is pressed in the field (never blank); null on Cancel, Escape, a
     * click on the backdrop, close(), a show() or prompt() asked in its place, or the element leaving
     * the page. As show(), it answers a question still open with that question's cancel, opens
     * focused (on the field), keeps Tab inside, and gives the focus back when it closes.
     */
    prompt(options: PromptOptions): Promise<string | null>;
    /** Closes the dialog, answering show() with its `cancelId` and prompt() with null; does nothing while closed. */
    close(): void;
    private _ask;
    connectedCallback(): void;
    disconnectedCallback(): void;
    private _finish;
    private _focusInitial;
    private _buttons;
    private _findActiveElement;
    private _onKeyDown;
    private _trapTab;
    private _submit;
    private _onFieldKeydown;
    private _onPointerDown;
    private _onBackdropClick;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
    private _renderPrompt;
}
/** Registers the widget as `<dex-confirm-dialog>`, or under `tag`. */
export declare function defineConfirmDialog(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-confirm-dialog': DexConfirmDialog;
    }
}
