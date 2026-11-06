import { LitElement } from 'lit';
/** The slots of the second pane: its row of tabs, and its files' panels. The first pane's are `tabs` and the default slot. */
export declare const SECOND_PANE: Readonly<{
    readonly tabs: "tabs-2";
    readonly panels: "pane-2";
}>;
/** Where a tab dropped on the documents lands: the left or right fifth of a lone pane, or among its documents. */
export type PaneZone = 'left' | 'center' | 'right';
/** What `dex-pane-focus` carries: the pane a press, or the keyboard's focus, came into (0 the left, 1 the right). */
export interface PaneFocusDetail {
    pane: number;
}
/**
 * What `dex-pane-drop` carries: the tab (by its id in its row) dropped on the documents of the pane
 * `pane`; with `side`, on that side of the lone pane there is, to make a new pane there.
 */
export interface PaneDropDetail {
    id: string;
    pane: number;
    side?: 'left' | 'right';
}
/** What `dex-panes-resized` carries: the share of the width the left pane takes now. */
export interface PanesResizedDetail {
    ratio: number;
}
/**
 * The shell's documents: `<dex-doc-tabs slot="tabs">` above, the panels of the open files as its
 * children (each a `<section>`, filling the area, `hidden` but the one its pane shows), and the
 * welcome while `welcome` is set: what the shell opens, with Open File… and Open Folder… buttons,
 * which send `dex-toolbar-action` as the toolbar's Open and Folder do, and the drop hint. While
 * `dropping` is set, the focused pane is outlined as where the files dragged over the page will
 * open.
 *
 * While `split`, a second pane is drawn on the right, its row in the slot `tabs-2` and its panels
 * in `pane-2` (SECOND_PANE), the left pane taking `ratio` of the width. A press or the focus coming
 * into a pane other than `focusedPane` sends `dex-pane-focus`. A tab dragged from a row in the area
 * shows where it would land, and a drop sends `dex-pane-drop`; the divider, dragged or moved by the
 * arrow keys, changes `ratio` and sends `dex-panes-resized`.
 *
 * @tagname dex-shell-docs
 */
export declare class DexShellDocs extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The welcome is shown, over the panels: no file is open (Root with files open shows the graph's panel). Attribute `welcome`. */
    welcome: boolean;
    /** The welcome offers Open Folder…: the host can show a folder. Attribute `can-open-folder`. */
    canOpenFolder: boolean;
    /** Files are dragged over the page, to be opened: the focused pane is outlined as where they go. Attribute `dropping`. */
    dropping: boolean;
    /** A second pane is drawn beside the first, its row in the slot `tabs-2` and its panels in `pane-2`. Attribute `split`. */
    split: boolean;
    /**
     * The share of the width the left pane takes while split, held to 0.2–0.8; the divider changes
     * it, and says so with `dex-panes-resized`. Default 0.5. Attribute `ratio`.
     */
    ratio: number;
    /** The pane the user is in (0 the left, 1 the right): no press in it asks to focus it. Default 0. Attribute `focused-pane`. */
    focusedPane: number;
    private _drag;
    private _over;
    private _resizing;
    private _resize;
    private _frame;
    constructor();
    disconnectedCallback(): void;
    /**
     * Gives the keyboard to the welcome's Open File…, once the welcome is drawn, unless the focus has
     * gone somewhere in the page by then (anywhere but its body): for the shell, as the last file
     * closes with the focus on its tab, whose row hides. Nothing while the welcome is not shown.
     */
    focusOpenFile(): void;
    private _ask;
    private _paneOf;
    private _onPress;
    private _focusPane;
    private _drop;
    private _resized;
    private _isTabDrag;
    private _onDragStart;
    private _onPageDragOver;
    private _endDrag;
    private _onZoneOver;
    private _onZoneLeave;
    private _onZoneDrop;
    private _setRatio;
    private _onDividerKey;
    private _onDividerDown;
    private _onDividerMove;
    private _followPointer;
    private _onDividerUp;
    private _overlay;
    private _pane;
    private _divider;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the element as `<dex-shell-docs>`, or under `tag`. */
export declare function defineShellDocs(tag?: string): void;
/**
 * The events `<dex-shell-docs>` sends, by name, besides the `dex-toolbar-action` of its welcome's
 * buttons: two requests, connectShell's to answer, and a notice. They bubble and are composed, so
 * they reach the document and the window too: HTMLElementEventMap, DocumentEventMap and
 * WindowEventMap extend this map, and a listener on an element, the document or the window is typed.
 */
export interface ShellDocsEventMap {
    /** A press, or the keyboard's focus, came into a pane other than `focusedPane`: focus it. */
    'dex-pane-focus': CustomEvent<PaneFocusDetail>;
    /** A tab of a row in the area was dropped on a pane's documents: move it there, or into a new pane on `side`. */
    'dex-pane-drop': CustomEvent<PaneDropDetail>;
    /** The divider was moved (a drag, at its end; an arrow key, at each step): the left pane takes `ratio` of the width now. */
    'dex-panes-resized': CustomEvent<PanesResizedDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-shell-docs': DexShellDocs;
    }
    interface HTMLElementEventMap extends ShellDocsEventMap {
    }
    interface DocumentEventMap extends ShellDocsEventMap {
    }
    interface WindowEventMap extends ShellDocsEventMap {
    }
}
