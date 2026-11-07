import { LitElement } from 'lit';
/**
 * The shell's Folder view: its children (the `<dex-folder-bar>` and the `<dex-hierarchy>` it is
 * given), the `status` under them while a folder is read, and `note`. With no `root`, none of
 * them: it says no folder is open, offers Open Folder… (where `canOpenFolder`) and a drop. Open
 * Folder… sends `dex-toolbar-action` with `open-folder`, as the documents' welcome does.
 *
 * @tagname dex-shell-folder
 */
export declare class DexShellFolder extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The workspace folder's path; empty, the default, for none shown: the view then says so. Attribute `root`. */
    root: string;
    /** What is said under the tree (it holds no data files, or could not be read); empty, the default, says nothing. Attribute `note`. */
    note: string;
    /** What is being read (`Reading models…`), in a live region over the note; empty, the default, says nothing. Attribute `status`. */
    status: string;
    /** With no folder shown, offer Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
    canOpenFolder: boolean;
    private _openFolder;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the element as `<dex-shell-folder>`, or under `tag`. */
export declare function defineShellFolder(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-folder': DexShellFolder;
    }
}
