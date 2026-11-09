import { LitElement, type PropertyValues } from 'lit';
/** One button of the toolbar, as the app describes it. */
export interface ToolbarItem {
    /** What `dex-toolbar-action` says was pressed (its `actionId`). Unique among the items. */
    id: string;
    /** The text under the icon (beside it, compact), and the button's accessible name. */
    label: string;
    /** The `<dex-icon>` id drawn over the label (`saved`, `undo`). None draws the label alone. */
    icon?: string;
    /** The tooltip. Default the label, with the shortcut after it in brackets when there is one. */
    title?: string;
    /**
     * The chord that does the same, as the app writes it for the platform (`⌘S`, `Ctrl+S`): shown in
     * the default tooltip only. The toolbar listens for no key; the app binds the chord itself.
     */
    shortcut?: string;
    /** Greyed, and a click sends nothing. It stays where the keyboard can reach it. */
    disabled?: boolean;
    /**
     * The item's group. A separator goes wherever two neighbours on the same side have different
     * groups. The items keep the order given, so an app gives a group's items together: a group
     * handed over in two runs is drawn as two. No group and `''` are the same: one group more, so
     * items with none sit together with no separator between them.
     */
    group?: string;
    /**
     * The side of the row: `end` items go to the right, after a spacer (the shell's Undo …
     * Delete). Default `start`.
     */
    align?: 'start' | 'end';
}
/** What `dex-toolbar-action` carries: the `id` of the item pressed. */
export interface ToolbarActionDetail {
    actionId: string;
}
/**
 * A row of buttons, the items an app hands it: each an icon over a small label (beside it with
 * `compact`), the items of a group together with a separator between groups, and the `end` items
 * pushed to the right. A click on an item that is not disabled sends `dex-toolbar-action` with its
 * id; a disabled item is greyed and sends nothing. Each item's tooltip is its `title`, or its label
 * and shortcut.
 *
 * The toolbar is one tab stop: the arrow keys move along the items, disabled ones included, and
 * wrap at either end; Home and End go to the first and the last; Enter and Space press the one the
 * keyboard is on. A mouse press takes no focus: it stays where the user was working. So an edit
 * open in a table's cell stays open too (the table commits one as its editor loses the focus), and
 * the app commits it, with connectTable's `handle.commitEdit()`, before it acts on
 * `dex-toolbar-action`. The toolbar knows nothing of files or tables: the app gives it new `items`
 * as what they can do changes, and does what `dex-toolbar-action` asks.
 *
 * @tagname dex-toolbar
 */
export declare class DexToolbar extends LitElement {
    static styles: import("lit").CSSResult[];
    /**
     * The buttons, in order: the `start` items from the left, then the `end` items from the right
     * edge, each side in the order given. Replace the array to change them; an item keeps its
     * button, and the keyboard's place on it, while its `id` stays, and an item that goes while the
     * keyboard is on it hands the focus to the one that takes its place. Default none.
     */
    items: ToolbarItem[];
    /**
     * The compact layout: each icon (14px rather than 18) beside its label, in a lower row.
     * Attribute `compact`, reflected so a page's stylesheet can follow it.
     */
    compact: boolean;
    /**
     * What a screen reader calls the toolbar, so a page with more than one can tell them apart.
     * Default `Toolbar`. Attribute `label`.
     */
    label: string;
    private _focusId;
    private _refocusAt;
    protected willUpdate(changed: PropertyValues<this>): void;
    protected updated(): void;
    private _press;
    private _onKeydown;
    private _onMousedown;
    private _tooltipFor;
    private _button;
    private _side;
    render(): import("lit-html").TemplateResult<1>;
}
/** Registers the widget as `<dex-toolbar>`, or under `tag`, and the `<dex-icon>` its buttons draw. */
export declare function defineToolbar(tag?: string): void;
/**
 * The events `<dex-toolbar>` sends, by name. They bubble and are composed, so they reach the document
 * and the window too: HTMLElementEventMap, DocumentEventMap and WindowEventMap extend this map,
 * and a listener on an element, the document or the window is typed.
 */
export interface ToolbarEventMap {
    /**
     * An item that is not disabled was pressed, by a click, Enter or Space: its `id`. A name of its
     * own, not the context menu's `dex-action`, so each event has one declaration and a page that
     * listens on the document tells a toolbar press from a menu choice.
     */
    'dex-toolbar-action': CustomEvent<ToolbarActionDetail>;
}
declare global {
    interface HTMLElementTagNameMap {
        'dex-toolbar': DexToolbar;
    }
    interface HTMLElementEventMap extends ToolbarEventMap {
    }
    interface DocumentEventMap extends ToolbarEventMap {
    }
    interface WindowEventMap extends ToolbarEventMap {
    }
}
