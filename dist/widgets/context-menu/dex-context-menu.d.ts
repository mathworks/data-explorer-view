import { LitElement } from 'lit';
export interface ContextMenuItem {
    id: string;
    label: string;
    icon?: string;
    shortcut?: string;
    disabled?: boolean;
    separator?: boolean;
    /**
     * Why this item is unavailable — the tooltip while `disabled`, and the accessible
     * description announced after the label. Only set where the answer is not obvious
     * from the row: a paste the target's rules refuse, for instance.
     *
     * A TOOLTIP AND NOT A COLUMN. These sentences run to ~45 characters ("This element
     * can't be removed from its parent"), and beside the label they made the menu's width
     * depend on which items happened to be disabled — one selection opening a 200px menu
     * and the next a 500px one, with the same items in it. What used to rule a tooltip
     * out was that `_moveFocus` skipped disabled items, so nothing on one could be
     * reached; arrow keys now land on them, the way a Windows menu does. And `title` on
     * an element that takes its accessible NAME from its content becomes that element's
     * accessible DESCRIPTION, so a screen reader reads the label and then the reason —
     * which is more than the visible column ever gave it, since it could not be focused.
     */
    reason?: string;
    /**
     * The full text when the label does not fit — an entry name the menu's `max-width`
     * clips with an ellipsis. Consulted only when there is no `reason` to show instead:
     * on an item the user cannot use, why is the more useful sentence than what.
     */
    title?: string;
}
/** What `dex-action` carries: the `id` of the item chosen. */
export interface ActionDetail {
    actionId: string;
}
/**
 * A context menu of the items an app hands it, at a point of the viewport: show() opens it,
 * a choice sends `dex-action` and closes it, and Escape, a click or a right-click outside it,
 * or a scroll close it. Arrow keys move along the items, disabled ones included (their
 * `reason` is their tooltip), and Enter chooses. The tree table's items for a selection are
 * buildContextMenuItems' (`data-explorer-view/tree-table`).
 *
 * @tagname dex-context-menu
 */
export declare class DexContextMenu extends LitElement {
    static styles: import("lit").CSSResult[];
    private _open;
    private _items;
    private _x;
    private _y;
    private _focusedIndex;
    private _dismissHandler;
    private _contextMenuHandler;
    private _keyHandler;
    private _scrollHandler;
    /**
     * Opens the menu with these items, its top-left corner at (`x`, `y`) in viewport pixels
     * (a contextmenu event's clientX and clientY), moved in to fit the viewport. A menu already
     * open is replaced.
     */
    show(x: number, y: number, items: ContextMenuItem[]): void;
    /** Closes the menu, choosing nothing. */
    close(): void;
    private _clampPosition;
    private _getActionItems;
    private _moveFocus;
    updated(): void;
    private _onItemClick;
    private _renderIcon;
    private _renderShortcut;
    private _tooltipFor;
    private _getSvgIcon;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-context-menu>`, or under `tag`. */
export declare function defineContextMenu(tag?: string): void;
declare global {
    interface HTMLElementTagNameMap {
        'dex-context-menu': DexContextMenu;
    }
    interface HTMLElementEventMap {
        /** An item that is not disabled was chosen, by a click or Enter; the menu closes. */
        'dex-action': CustomEvent<ActionDetail>;
    }
}
