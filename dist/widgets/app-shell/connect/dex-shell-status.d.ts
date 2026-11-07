import { LitElement, nothing } from 'lit';
/**
 * The active file's status: its `format` as a pill, `kind` the pill's tooltip, and a Modified mark
 * while `modified`. No format draws nothing, for no file open (Root) or one of no kind the shell
 * names; but a tab that is no file (a comparison) has its kind drawn alone, in words.
 *
 * @tagname dex-shell-status
 */
export declare class DexShellStatus extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The file's format, as the pill says it (`SLDD`). Default empty: no pill, and only a `kind` there is, in words. Attribute `format`. */
    format: string;
    /** The kind of file in words, the pill's tooltip and what a screen reader hears of it (`Data dictionary`). Default empty: the format. Attribute `kind`. */
    kind: string;
    /** The file holds unsaved edits: Modified is drawn after the pill. Default false. Attribute `modified`. */
    modified: boolean;
    render(): import("lit-html").TemplateResult<1> | typeof nothing;
}
/** Registers the element as `<dex-shell-status>`, or under `tag`. */
export declare function defineShellStatus(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-status': DexShellStatus;
    }
}
