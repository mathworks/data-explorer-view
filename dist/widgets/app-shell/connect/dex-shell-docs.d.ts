import { LitElement } from 'lit';
/**
 * The shell's documents: `<dex-doc-tabs slot="tabs">` above, the panels of the open files as its
 * children (each a `<section>`, filling the area, `hidden` but the active one), and the welcome
 * while `welcome` is set: what the shell opens, with Open File… and Open Folder… buttons, which
 * send `dex-toolbar-action` as the toolbar's Open and Folder do, and the drop hint. While
 * `dropping` is set, the area is outlined as where the files dragged over the page will open.
 *
 * @tagname dex-shell-docs
 */
export declare class DexShellDocs extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The welcome is shown, over the panels: no file is open (Root with files open shows the graph's panel). Attribute `welcome`. */
    welcome: boolean;
    /** The welcome offers Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
    canOpenFolder: boolean;
    /** Files are dragged over the page, to be opened: the area is outlined as where they go. Attribute `dropping`. */
    dropping: boolean;
    private _ask;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the element as `<dex-shell-docs>`, or under `tag`. */
export declare function defineShellDocs(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-docs': DexShellDocs;
    }
}
