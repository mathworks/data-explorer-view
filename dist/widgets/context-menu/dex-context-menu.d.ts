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
    show(x: number, y: number, items: ContextMenuItem[]): void;
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
declare global {
    interface HTMLElementTagNameMap {
        'dex-context-menu': DexContextMenu;
    }
}
