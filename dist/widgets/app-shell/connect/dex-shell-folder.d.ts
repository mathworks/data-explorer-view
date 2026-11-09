import { LitElement } from 'lit';
/**
 * The shell's folder: a title with the folder's name (its path the tooltip), a search box over the
 * folder's names, the list of matches that stands in for the tree while the box holds a query, the
 * `<dex-hierarchy>` it is given as its child, and `note` under it.
 *
 * @tagname dex-shell-folder
 */
export declare class DexShellFolder extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The folder's path: its name is the title, the path the title's tooltip. Attribute `root`. */
    root: string;
    /** What is said under the tree (it holds no data files, or could not be read); empty, the default, says nothing. Attribute `note`. */
    note: string;
    private readonly _input;
    private readonly _results;
    constructor();
    /** The search box, for installSearch. */
    get searchInput(): HTMLInputElement;
    /** The list the matches are drawn in, for installSearch: hidden while the box holds no query. */
    get searchResults(): HTMLUListElement;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the element as `<dex-shell-folder>`, or under `tag`. */
export declare function defineShellFolder(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-folder': DexShellFolder;
    }
}
