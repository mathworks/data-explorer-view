import { LitElement, nothing, type TemplateResult } from 'lit';
/** One command the palette lists, as the app describes it. */
export interface PaletteCommand {
    /** What `dex-palette-run` sends when it is run. Unique among the commands. */
    id: string;
    /** What its row reads, and what the typed letters are matched against first. */
    label: string;
    /** Its group (File, Edit, View), drawn after the label in a quieter ink, and matched when the label is not. */
    category?: string;
    /**
     * The chord that does the same, as the app writes it for the platform (`⌘S`, `Ctrl+S`), drawn
     * at the row's end. The palette listens for no chord; the app binds it itself.
     */
    shortcut?: string;
    /** Greyed, and neither Enter nor a click runs it. It is still listed, and the arrows reach it. */
    disabled?: boolean;
}
/** How show() opens the palette for a list that is not the shell's commands (a pick of a file). */
export interface PaletteShowOptions {
    /** The input's placeholder. Default 'Type a command'. */
    placeholder?: string;
    /** Whether a row run from this list joins the recently run ones, which a later list puts first. Default true. */
    remember?: boolean;
}
/** What `dex-palette-run` carries: the `id` of the command run. */
export interface PaletteRunDetail {
    id: string;
}
/**
 * The shell's command palette: a box at the top of the window, over the page, in which a few
 * typed letters find a command. show() opens it with the commands to offer; the list follows
 * the typing, labels that begin with the query first, then those whose words it begins, then
 * those that merely hold its letters in order (the letters matched are drawn in bold), and the
 * commands run lately come first among equals and first of all before anything is typed.
 * ArrowUp and ArrowDown move the active row, wrapping; Enter or a click runs it, which closes
 * the palette and sends `dex-palette-run`. A disabled command is greyed and runs on neither, and
 * the list opens on the first that can run. Escape, a click outside it and close() close it,
 * sending nothing.
 *
 * It is a modal, as `<dex-confirm-dialog>` is: while it is open Tab stays in its input, no key
 * pressed in it reaches the page, a press in it keeps the focus in its input, and Escape is heard
 * wherever the focus is, but for a key pressed in another modal opened over it (an element with
 * `aria-modal="true"`, such as a confirm dialog a command asked), which is that modal's. When it
 * closes the focus goes back where it was, before `dex-palette-run` is sent, so a command that
 * moves the focus itself (showing the Explorer) keeps it there. It paints at z-index 10000, as
 * the dialogs do: append it last in the body, outside any element that makes a stacking context
 * of its own.
 *
 * @tagname dex-command-palette
 */
export declare class DexCommandPalette extends LitElement {
    static styles: import("lit").CSSResult[];
    private _open;
    private _commands;
    private _query;
    private _active;
    private _placeholder;
    private _remember;
    private _recent;
    private _ranked;
    private _returnFocusTo;
    private _pressedOnBackdrop;
    private _reveal;
    /** Whether it is open: from show() until a command runs, Escape, a click outside it or close(). The `open` attribute says the same, for styling. */
    get open(): boolean;
    /**
     * Opens the palette over the page with `commands` (a list that is not an array is none), an
     * empty query and the focus in its input, on the first command that can run. Open already, it
     * takes the new commands and starts the query afresh, and the focus will still go back where it
     * was before the first show(). Not on the page, it does not open. `options` says what its input
     * reads before anything is typed and whether a row run from it joins the recent ones (a pick of a
     * file does not: the shell's commands are what a later list puts first).
     */
    show(commands: PaletteCommand[], options?: PaletteShowOptions): void;
    /** Closes the palette, sending nothing; does nothing while closed. */
    close(): void;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected updated(): void;
    private _list;
    private _firstRunnable;
    private _input;
    private _run;
    private _onInput;
    private _onInputKeyDown;
    private _onDocumentKeyDown;
    private _inAnotherModal;
    private _onPointerDown;
    private _onBackdropClick;
    private _onPaletteMouseDown;
    private _label;
    render(): TemplateResult<1> | typeof nothing;
    private _findActiveElement;
}
/** Registers the widget as `<dex-command-palette>`, or under `tag`. */
export declare function defineCommandPalette(tag?: string): void;
/**
 * The events `<dex-command-palette>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface CommandPaletteEventMap {
    /**
     * A command was run, by Enter on its row or a click on it: do it. The palette has closed, and
     * the focus is back where it was before the palette opened. Never sent for a disabled command.
     */
    'dex-palette-run': CustomEvent<PaletteRunDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-command-palette': DexCommandPalette;
    }
    interface HTMLElementEventMap extends CommandPaletteEventMap {
    }
    interface DocumentEventMap extends CommandPaletteEventMap {
    }
    interface WindowEventMap extends CommandPaletteEventMap {
    }
}
