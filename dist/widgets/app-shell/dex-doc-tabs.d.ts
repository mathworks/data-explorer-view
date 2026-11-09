import { LitElement, type PropertyValues } from 'lit';
/** One tab of the row: an open document, as the app names it. */
export interface DocTab {
    /** What the requests name the tab by. Unique in the row. */
    id: string;
    /** The text on the tab: the file's name, or the part of it the tab shows (with the file as `subtitle`). */
    label: string;
    /**
     * Smaller, muted text drawn before the icon and the label: the file's name, while the label names
     * a part of it (a dictionary's `Design Data`), so the tab reads as a path does. None, none.
     */
    subtitle?: string;
    /** An icon id drawn before the label, at 14px (`simulink_database`). None, no icon. */
    icon?: string;
    /** The tooltip: the file's whole path, say. The label when there is none. */
    title?: string;
    /** Unsaved changes: ● in place of × until the pointer or the keyboard is on the tab. */
    dirty?: boolean;
    /** A preview tab, which the next document opened replaces: its label is italic. */
    preview?: boolean;
}
/** What `dex-tab-select` carries: the tab to show. */
export interface TabSelectDetail {
    id: string;
}
/** What `dex-tab-close` carries: the tab to close. */
export interface TabCloseDetail {
    id: string;
}
/** What `dex-tab-pin` carries: the tab to keep, no longer a preview. */
export interface TabPinDetail {
    id: string;
}
/**
 * What `dex-tab-move` carries: the tab dragged, and its index once moved, which is the index of the
 * tab it was dropped on. Remove it from `tabs`, then insert it at `index`. A tab dragged from
 * another row of the same `group` is not in `tabs`: insert it at `index`.
 */
export interface TabMoveDetail {
    id: string;
    index: number;
}
/** What `dex-tab-menu` carries: the tab whose menu is asked for, and where to show it (viewport coordinates). */
export interface TabMenuDetail {
    id: string;
    x: number;
    y: number;
    /** Asked by a key (Shift+F10, the ContextMenu key): the menu takes the keyboard (the context menu's `focusFirst`). */
    keyboard?: true;
}
/**
 * The type a tab's drag carries its id under. One of the app's own, so a drag of anything else (a
 * file from the desktop, text from another page) never reads as a tab. Exported for the part of an
 * app that takes a tab dropped elsewhere (the documents' area of the shell, to split it).
 */
export declare const TAB_DRAG_TYPE = "application/x-dex-tab";
/**
 * The row of tabs above an app's documents, one per open file, as `tabs` lists them, `active`
 * marking the one shown. It draws them and asks for everything else: a click (or Enter or Space)
 * sends `dex-tab-select`, × (or a middle click, Delete or Backspace) `dex-tab-close`, a double-click
 * `dex-tab-pin`, and a tab dropped on another `dex-tab-move`. Which tabs there are, in what
 * order, and which is active stay the app's: nothing here changes `tabs` or `active`. A tab
 * dropped on the row's empty end goes to its end. Rows of the same `group` (an app's two panes)
 * take each other's tabs: one dropped on a tab of the other lands before or after it, by the half
 * of the tab the pointer is over, and the row it lands in sends `dex-tab-move`.
 *
 * A tab's menu is the app's too: a right-click on a tab (its × included), or Shift+F10 or the
 * ContextMenu key on the focused one, sends `dex-tab-menu` with where to show it, at the pointer or
 * under the tab, and the row draws no menu of its own. The browser's menu is kept off the tabs, and
 * the one a browser fires after a menu key asks nothing more; the row's empty end and the … button
 * keep the browser's.
 *
 * A tab's subtitle, when it has one, is drawn before its icon and label, smaller and muted: the
 * file, while the label names a part of it. A preview tab's label is italic; an unsaved one shows ●
 * where its × is, until the pointer or the keyboard comes onto it. A row too long for its width
 * scrolls sideways (a wheel scrolls it too), keeps the active tab in view, clear of the … button it
 * then offers, which lists every tab, as the row is drawn and as it is resized; a tab scrolled partly
 * out past the row's start hides its ×, and no tab is wider than the row. The arrow keys move the
 * focus along the tabs, and Home and End to either end. A row `unfocused` (the row of a pane the
 * user is not in) marks its active tab in a muted grey rather than the accent.
 *
 * @tagname dex-doc-tabs
 */
export declare class DexDocTabs extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The tabs, in order: plain data, which the app replaces as files open, close and move. Default none. */
    tabs: DocTab[];
    /** The id of the tab shown, which is marked selected and scrolled into view. Default none. Attribute `active`. */
    active: string;
    /**
     * Rows of one page with the same group take each other's tabs (an app's two panes, side by
     * side): a tab dragged from one and dropped on the other is that row's `dex-tab-move`, with an id
     * not in its `tabs`. Empty, the default: the row takes only its own tabs. Attribute `group`.
     */
    group: string;
    /**
     * The row is of a pane the user is not in: its active tab's mark is drawn in a muted grey, the
     * accent kept for the focused pane's row. Default false. Attribute `unfocused`.
     */
    unfocused: boolean;
    private _focusId;
    private _dragging;
    private _over;
    private _menuOpen;
    private _menuFocus;
    private _focusTo;
    private _scrollPending;
    private _resize;
    private _menuKeyed;
    private _menuKeyedTimer;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected firstUpdated(): void;
    /**
     * Puts the keyboard on the active tab, once it is drawn: an app's chord that takes the user to
     * this row's pane. Nothing for a row with no active tab.
     */
    focusActive(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    private _activeRedrawn;
    protected updated(): void;
    private _list;
    private _tabElement;
    private _strip;
    private _select;
    private _close;
    private _pin;
    private _move;
    private _askMenu;
    private _keepFocus;
    private _wentToGroup;
    private _layout;
    private _measure;
    private _scrollActive;
    private _markClipped;
    private _observe;
    private _onTabKeydown;
    private _onMenuKey;
    private _onContextMenu;
    private _onFocusOut;
    private _onClose;
    private _onMouseDown;
    private _onAuxClick;
    private _onWheel;
    private _isTabDrag;
    private _taken;
    private _onDragStart;
    private _landing;
    private _onDragOver;
    private _onDragLeave;
    private _onDrop;
    private _endOf;
    private _onEndDragOver;
    private _onEndDragLeave;
    private _onEndDrop;
    private _onDragEnd;
    private _dropClass;
    private _toggleMenu;
    private _closeMenu;
    private _onOutside;
    private _focusMenuItem;
    private _chooseFromMenu;
    private _onMenuKeydown;
    private _title;
    private _name;
    private _icon;
    private _subtitle;
    private _tab;
    private _menu;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-doc-tabs>`, or under `tag`, and the `<dex-icon>` its tabs draw. */
export declare function defineDocTabs(tag?: string): void;
/**
 * The events `<dex-doc-tabs>` sends, by name: requests, each the app's to answer by changing
 * `tabs` or `active`, or not. They bubble and are composed, so they reach the document and the
 * window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map, and a
 * listener on an element, the document or the window is typed.
 */
export interface DocTabsEventMap {
    /** Show this tab: a click on it, Enter or Space on it, or its item in the … menu. Sent for the active tab too. */
    'dex-tab-select': CustomEvent<TabSelectDetail>;
    /** Close this tab: its ×, a middle click on it, or Delete (or Backspace) on it. */
    'dex-tab-close': CustomEvent<TabCloseDetail>;
    /**
     * Keep this tab, no longer a preview: a double-click on it, whether it is a preview or not. Its
     * two clicks have each sent `dex-tab-select` first.
     */
    'dex-tab-pin': CustomEvent<TabPinDetail>;
    /**
     * Move this tab: it was dropped on the tab at `index`, or at the row's end. Remove it from
     * `tabs`, then insert it at `index`; a tab of another row of the group, not in `tabs`, insert.
     */
    'dex-tab-move': CustomEvent<TabMoveDetail>;
    /** A right-click on a tab, or Shift+F10 or the ContextMenu key on the focused one: show its menu. The browser's own menu is prevented. */
    'dex-tab-menu': CustomEvent<TabMenuDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-doc-tabs': DexDocTabs;
    }
    interface HTMLElementEventMap extends DocTabsEventMap {
    }
    interface DocumentEventMap extends DocTabsEventMap {
    }
    interface WindowEventMap extends DocTabsEventMap {
    }
}
