import { LitElement, type PropertyValues } from 'lit';
/** One segment of the folder's path: what it reads and the folder it re-roots to. */
export interface FolderSegment {
    /** What the segment reads: a folder's name (`complex_dataflow`), or the top of the path (`/`, `C:`). */
    label: string;
    /** The folder's path, in the host's scheme: what a press on the segment asks to go to, and its tooltip. */
    path: string;
}
/** What `dex-folder-go` carries: the folder of the segment pressed. */
export interface FolderGoDetail {
    /** The segment's `path`. */
    path: string;
}
/** What `dex-folder-menu` carries: where the button pressed is, and the folders it stands for. */
export interface FolderMenuDetail {
    /** The button's box in viewport px (getBoundingClientRect's), for a menu to open against. */
    anchor: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    /**
     * The segments the `…` button stands for, outermost first: those a path too long for the bar
     * folded away, for the menu to list. Absent when Folder Actions (⋯) was pressed.
     */
    segments?: FolderSegment[];
    /**
     * Pressed by the keyboard (Enter or Space on the button), not a pointer: the menu is to take the
     * keyboard at once (a context menu's `focusFirst`), as a menu button's menu does. Absent for a
     * pointer's press.
     */
    keyboard?: true;
}
/**
 * The folder bar: ↑, then the path of the folder shown as segments, outermost first
 * ("Users › delite › complex_dataflow"), then ⟳ (Read Again, or Pick Again) and ⋯ (Folder
 * Actions). It draws the segments it is given, the last one as the folder shown, and turns each
 * press into a request: `dex-folder-up`, `dex-folder-go` with a segment's path,
 * `dex-folder-refresh` and `dex-folder-menu`. It moves nowhere itself and works out no path: the
 * app says by `canUp` whether there is a folder above, by `refresh` what ⟳ does, and by `busy`
 * that a move is under way, during which only ⋯ can be used; it gives the bar the new segments
 * once the new folder is shown.
 *
 * A path too long for the bar folds the folders after the first into a `…` button, keeping as many
 * of the last ones as fit; the `…` asks for the menu too, with the folders it holds. Where even
 * the first does not fit beside the current folder it is folded as well, and a bar too narrow for
 * the current folder alone clips its name with an ellipsis.
 *
 * Every button is a tab stop, a disabled one included. Alt+↑ (⌥↑) anywhere in the bar is ↑.
 *
 * @tagname dex-folder-bar
 */
export declare class DexFolderBar extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The path of the folder shown, outermost first; the last is the folder shown, drawn as the
     * current one, which is no button. Replace the array to change it. Default none.
     */
    segments: FolderSegment[];
    /**
     * ↑ can be used: the host gives a folder above the one shown. Off, the default, disables it
     * (a browser's picked folder has none above it). Attribute `can-up`.
     */
    canUp: boolean;
    /**
     * What ⟳ does, by its name: `read` (Read Again, the default) for a folder the host reads again,
     * `pick` (Pick Again) for one it can only ask the user for again (a browser's snapshot of a
     * folder), `none` for no ⟳. Either sends `dex-folder-refresh`. Attribute `refresh`.
     */
    refresh: 'read' | 'pick' | 'none';
    /**
     * A move or a read is under way: ↑, the segments, the `…` and ⟳ are disabled, and the bar says
     * aria-busy, until the app turns it off. ⋯ stays usable. Off, the default. Attribute `busy`.
     */
    busy: boolean;
    /**
     * Draws the icons of ↑, ⟳ and ⋯ in one colour, the text's (`<dex-icon mono>`), as the shell's
     * Minimal icon style draws its glyphs; off, the default, draws them in their files' colours.
     * Attribute `mono`, reflected so a page's stylesheet can follow it.
     */
    mono: boolean;
    private _folded;
    private _refocus;
    private _resize;
    private _forcedColors;
    private readonly _refit;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected firstUpdated(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _observe;
    private _fit;
    private _keepFocus;
    private _list;
    private _up;
    private _go;
    private _refresh;
    private _menu;
    private _onFold;
    private _onKeydown;
    private _place;
    private _refreshButton;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-folder-bar>`, or under `tag`, and the `<dex-icon>` its buttons draw. */
export declare function defineFolderBar(tag?: string): void;
/**
 * The events `<dex-folder-bar>` sends, by name. They bubble and are composed, so they reach the
 * document and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend
 * this map, and a listener on an element, the document or the window is typed.
 */
export interface FolderBarEventMap {
    /** ↑ was pressed, or Alt+↑ in the bar, while `canUp` said there is a folder above and the bar was not `busy`. */
    'dex-folder-up': CustomEvent<null>;
    /**
     * A segment was pressed, not the current folder's, while the bar was not `busy`: its folder's
     * path. The bar changes nothing itself; the app re-roots, and gives it the new segments.
     */
    'dex-folder-go': CustomEvent<FolderGoDetail>;
    /** ⟳ was pressed (Read Again, or Pick Again as `refresh` says) while the bar was not `busy`. */
    'dex-folder-refresh': CustomEvent<null>;
    /**
     * ⋯ (Folder Actions) was pressed, or the `…` of a folded path while the bar was not `busy`: the
     * app shows its menu against the button's box, the folders the `…` holds when it was that.
     */
    'dex-folder-menu': CustomEvent<FolderMenuDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-folder-bar': DexFolderBar;
    }
    interface HTMLElementEventMap extends FolderBarEventMap {
    }
    interface DocumentEventMap extends FolderBarEventMap {
    }
    interface WindowEventMap extends FolderBarEventMap {
    }
}
