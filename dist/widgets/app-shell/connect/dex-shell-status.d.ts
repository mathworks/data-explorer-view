import { LitElement, nothing } from 'lit';
/**
 * The active file's status: its `format` as a pill, `kind` the pill's tooltip, and a Modified mark
 * while `modified`. No format draws no pill, for no file open (Root) or one of no kind the shell
 * names. Before it, the MATLAB the window reaches (`matlab`) as a button, which sends
 * `dex-shell-matlab-connect` when pressed. Nothing at all with neither.
 *
 * @tagname dex-shell-status
 */
export declare class DexShellStatus extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The file's format, as the pill says it (`SLDD`). Default empty: nothing is drawn. Attribute `format`. */
    format: string;
    /** The kind of file in words, the pill's tooltip and what a screen reader hears of it (`Data dictionary`). Default empty: the format. Attribute `kind`. */
    kind: string;
    /** The file holds unsaved edits: Modified is drawn after the pill. Default false. Attribute `modified`. */
    modified: boolean;
    /** Which MATLAB the window reaches, as a button before the pill (`MATLAB R2027a`). Default empty: none. Attribute `matlab`. */
    matlab: string;
    /** The MATLAB button's tooltip. Attribute `matlab-title`. */
    matlabTitle: string;
    private _connect;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the element as `<dex-shell-status>`, or under `tag`. */
export declare function defineShellStatus(tag?: string): void;
/**
 * The events `<dex-shell-status>` sends, by name: a request, connectShell's to answer. It bubbles
 * and is composed, so it reaches the document and the window too: HTMLElementEventMap,
 * DocumentEventMap and WindowEventMap extend this map, and a listener on an element, the document
 * or the window is typed.
 */
export interface ShellStatusEventMap {
    /** The MATLAB button was pressed: show how to connect (the host's Connect to MATLAB). */
    'dex-shell-matlab-connect': CustomEvent<null>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-status': DexShellStatus;
    }
    interface HTMLElementEventMap extends ShellStatusEventMap {
    }
    interface DocumentEventMap extends ShellStatusEventMap {
    }
    interface WindowEventMap extends ShellStatusEventMap {
    }
}
