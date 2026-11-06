import { LitElement, type PropertyValues } from 'lit';
/** One tab of the row: an open document, as the app names it. */
export interface DocTab {
    /** What the requests name the tab by. Unique in the row. */
    id: string;
    /** The text on the tab: the file's name. */
    label: string;
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
 * tab it was dropped on. Remove it from `tabs`, then insert it at `index`.
 */
export interface TabMoveDetail {
    id: string;
    index: number;
}
/**
 * The row of tabs above an app's documents, one per open file, as `tabs` lists them, `active`
 * marking the one shown. It draws them and asks for everything else: a click (or Enter or Space)
 * sends `dex-tab-select`, × (or a middle click, Delete or Backspace) `dex-tab-close`, a double-click
 * `dex-tab-pin`, and a tab dropped on another `dex-tab-move`. Which tabs there are, in what
 * order, and which is active stay the app's: nothing here changes `tabs` or `active`.
 *
 * A preview tab's label is italic; an unsaved one shows ● where its × is, until the pointer or the
 * keyboard comes onto it. A row too long for its width scrolls sideways (a wheel scrolls it too),
 * keeps the active tab in view, and offers a … button listing every tab. The arrow keys move the
 * focus along the tabs, and Home and End to either end.
 *
 * @tagname dex-doc-tabs
 */
export declare class DexDocTabs extends LitElement {
    static styles: import("lit").CSSResult[];
    /** The tabs, in order: plain data, which the app replaces as files open, close and move. Default none. */
    tabs: DocTab[];
    /** The id of the tab shown, which is marked selected and scrolled into view. Default none. Attribute `active`. */
    active: string;
    private _focusId;
    private _dragging;
    private _over;
    private _crowded;
    private _menuOpen;
    private _menuFocus;
    private _focusTo;
    private _scrollPending;
    private _resize;
    connectedCallback(): void;
    disconnectedCallback(): void;
    protected firstUpdated(): void;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _list;
    private _tabElement;
    private _strip;
    private _select;
    private _close;
    private _pin;
    private _move;
    private _keepFocus;
    private _measure;
    private _observe;
    private _onTabKeydown;
    private _onFocusOut;
    private _onClose;
    private _onMouseDown;
    private _onAuxClick;
    private _onWheel;
    private _isTabDrag;
    private _onDragStart;
    private _onDragOver;
    private _onDragLeave;
    private _onDrop;
    private _onDragEnd;
    private _dropClass;
    private _toggleMenu;
    private _closeMenu;
    private _onOutside;
    private _focusMenuItem;
    private _chooseFromMenu;
    private _onMenuKeydown;
    private _name;
    private _icon;
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
    /** Move this tab: it was dropped on the tab at `index`. Remove it from `tabs`, then insert it at `index`. */
    'dex-tab-move': CustomEvent<TabMoveDetail>;
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
